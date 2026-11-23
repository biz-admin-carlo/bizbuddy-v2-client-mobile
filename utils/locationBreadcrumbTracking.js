import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { BREADCRUMB_TASK } from "./locationBreadcrumbTask";
import {
  readBreadcrumbSession,
  saveBreadcrumbSession,
  clearBreadcrumbSession,
} from "./locationBreadcrumbSession";
import { readBreadcrumbPermission } from "./breadcrumbPermission";
import { captureBreadcrumb, currentBreadcrumbUserId } from "./locationBreadcrumbSampler";

let foregroundTimer = null;

function stopForegroundTimer() {
  if (foregroundTimer) {
    clearInterval(foregroundTimer);
    foregroundTimer = null;
  }
}

function startForegroundTimer(minutes) {
  stopForegroundTimer();
  const interval = Math.max(1, Number(minutes) || 5) * 60 * 1000;
  foregroundTimer = setInterval(() => {
    captureBreadcrumb("foreground").then((result) => {
      if (result === "stop") stopForegroundTimer();
    });
  }, interval);
}

async function stopUpdates() {
  stopForegroundTimer();
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
    if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
  } catch {
    /* task is not running */
  }
}

async function notificationsGranted() {
  if (Platform.OS !== "android") return true;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === "granted";
}

export async function startBreadcrumbTracking() {
  const userId = await currentBreadcrumbUserId();
  const session = userId ? await readBreadcrumbSession(userId) : null;
  if (!session || session.paused || session.clockOutQueued) {
    console.log("[BizBuddy Location] tracking not started", {
      reason: !session
        ? "no-session"
        : session.paused
          ? "paused"
          : "clock-out-queued",
    });
    return "off";
  }
  if (session.collectUntil && Date.now() > Date.parse(session.collectUntil)) {
    console.log("[BizBuddy Location] tracking stopped", {
      reason: "past-collect-until",
      collectUntil: session.collectUntil,
    });
    await clearBreadcrumbSession(userId);
    await stopUpdates();
    return "off";
  }
  const gate = await readBreadcrumbPermission();
  if (!gate.ok) {
    console.log("[BizBuddy Location] tracking not started", {
      reason: gate.reason || "permission",
    });
    return "off";
  }
  const notesOk = await notificationsGranted();
  if (!notesOk) {
    await stopUpdates();
    startForegroundTimer(session.intervalMinutes);
    console.log("[BizBuddy Location] tracking in app", {
      reason: "notifications-denied",
      intervalMinutes: session.intervalMinutes,
    });
    if (!session.lastRecordedAt) await captureBreadcrumb("foreground");
    return "foreground";
  }
  stopForegroundTimer();
  try {
    const already = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
    if (already) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
  } catch {
    /* not started */
  }
  const minutes = session.intervalMinutes;
  try {
    await Location.startLocationUpdatesAsync(BREADCRUMB_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: minutes * 60 * 1000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "BizBuddy",
        notificationBody: "Recording your location for this shift.",
        notificationColor: "#0f172a",
      },
    });
    console.log("[BizBuddy Location] background tracking started", {
      intervalMinutes: minutes,
      timeLogId: session.timeLogId,
    });
    if (!session.lastRecordedAt) await captureBreadcrumb("foreground");
    return "background";
  } catch (err) {
    console.log("[BizBuddy Location] background tracking failed, using in-app timer", {
      message: (err && err.message) || String(err),
      intervalMinutes: minutes,
    });
    startForegroundTimer(minutes);
    if (!session.lastRecordedAt) await captureBreadcrumb("foreground");
    return "foreground";
  }
}

export async function stopBreadcrumbTracking() {
  const userId = await currentBreadcrumbUserId();
  if (userId) await clearBreadcrumbSession(userId);
  await stopUpdates();
}

export async function pauseBreadcrumbTracking() {
  const userId = await currentBreadcrumbUserId();
  if (userId) {
    const session = await readBreadcrumbSession(userId);
    if (session) await saveBreadcrumbSession({ ...session, paused: true });
  }
  await stopUpdates();
}

export async function queueBreadcrumbClockOut() {
  const userId = await currentBreadcrumbUserId();
  if (userId) {
    const session = await readBreadcrumbSession(userId);
    if (session) await saveBreadcrumbSession({ ...session, clockOutQueued: true });
  }
  await stopUpdates();
}
