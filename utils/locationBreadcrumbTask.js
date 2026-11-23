import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { getTokenUserId } from "./jwtTokenUtils";
import {
  enqueueBreadcrumb,
  sampleFromFix,
  dropUnassignedAfter,
} from "./locationBreadcrumbQueue";
import { flushBreadcrumbQueue } from "./locationBreadcrumbUpload";
import {
  readBreadcrumbSession,
  saveBreadcrumbSession,
  clearBreadcrumbSession,
} from "./locationBreadcrumbSession";

export const BREADCRUMB_TASK = "bizbuddy-location-breadcrumbs";

async function stopTaskUpdates() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
    if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
  } catch {
    /* task is not running */
  }
}

TaskManager.defineTask(BREADCRUMB_TASK, async ({ data, error }) => {
  if (error) return;
  const token = await SecureStore.getItemAsync("token");
  const userId = getTokenUserId(token);
  const session = userId ? await readBreadcrumbSession(userId) : null;
  if (!session || session.paused || session.clockOutQueued) return;
  if (session.userId && session.userId !== userId) return;
  if (session.collectUntil && Date.now() > Date.parse(session.collectUntil)) {
    await dropUnassignedAfter(userId, session.collectUntil);
    await clearBreadcrumbSession(userId);
    await stopTaskUpdates();
    return;
  }
  const locations = (data && data.locations) || [];
  const fix = locations[locations.length - 1];
  if (!fix) return;
  const intervalMs = session.intervalMinutes * 60 * 1000;
  if (
    session.lastRecordedAt &&
    Date.now() - Date.parse(session.lastRecordedAt) < intervalMs
  ) {
    return;
  }
  const sample = sampleFromFix(fix, session.timeLogId, "background", userId);
  if (!sample) return;
  await enqueueBreadcrumb(sample);
  await saveBreadcrumbSession({ ...session, lastRecordedAt: sample.recordedAt });
  const flushed = await flushBreadcrumbQueue();
  if (flushed.stopped) {
    await clearBreadcrumbSession(userId);
    await stopTaskUpdates();
  }
});
