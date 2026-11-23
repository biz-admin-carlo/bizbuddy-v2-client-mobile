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

export async function currentBreadcrumbUserId() {
  const token = await SecureStore.getItemAsync("token");
  return getTokenUserId(token);
}

export async function captureBreadcrumb(source) {
  const userId = await currentBreadcrumbUserId();
  const session = userId ? await readBreadcrumbSession(userId) : null;
  if (!session || session.paused || session.clockOutQueued) {
    console.log("[BizBuddy Location] sample skipped", {
      source,
      reason: !session
        ? "no-session"
        : session.paused
          ? "paused"
          : "clock-out-queued",
    });
    return;
  }
  if (session.collectUntil && Date.now() > Date.parse(session.collectUntil)) {
    await dropUnassignedAfter(userId, session.collectUntil);
    await clearBreadcrumbSession(userId);
    return "stop";
  }
  const intervalMs = session.intervalMinutes * 60 * 1000;
  if (
    session.lastRecordedAt &&
    Date.now() - Date.parse(session.lastRecordedAt) < intervalMs
  ) {
    return;
  }
  let fix = null;
  try {
    fix = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch (err) {
    console.log("[BizBuddy Location] sample skipped", {
      source,
      reason: "no-fix",
      message: (err && err.message) || String(err),
    });
    fix = null;
  }
  if (!fix) return null;
  const sample = sampleFromFix(fix, session.timeLogId, source, userId);
  if (!sample) {
    console.log("[BizBuddy Location] sample skipped", {
      source,
      reason: "unusable-fix",
    });
    return null;
  }
  console.log("[BizBuddy Location] captured sample", {
    source,
    timeLogId: sample.timeLogId,
    recordedAt: sample.recordedAt,
    latitude: sample.latitude,
    longitude: sample.longitude,
  });
  await enqueueBreadcrumb(sample);
  await saveBreadcrumbSession({ ...session, lastRecordedAt: sample.recordedAt });
  const flushed = await flushBreadcrumbQueue();
  if (flushed.stopped) {
    await clearBreadcrumbSession(userId);
    return "stop";
  }
  return null;
}
