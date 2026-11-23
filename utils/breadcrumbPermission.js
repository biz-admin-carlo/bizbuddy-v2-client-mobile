import { Alert, Platform } from "react-native";
import * as Location from "expo-location";

/** Shown before the system prompt; Google Play requires it for background location. */
export function confirmBreadcrumbDisclosure(intervalMinutes) {
  const every =
    intervalMinutes === 1 ? "every minute" : `every ${intervalMinutes} minutes`;
  return new Promise((resolve) => {
    Alert.alert(
      "Location during your shift",
      `Your company records where you work during a shift. BizBuddy collects your location ${every} from clock-in until clock-out, even when the app is closed or not in use. This location trail is shared with your company. Recording stops when you clock out.\n\nOn the next screen, choose "Allow all the time" (Android) or "Always" (iPhone).`,
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function readBreadcrumbPermission() {
  if (Platform.OS === "web") {
    return { ok: true, reason: null };
  }
  const services = await Location.hasServicesEnabledAsync();
  if (!services) {
    return { ok: false, reason: "services" };
  }
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  if (foreground.status !== "granted" || background.status !== "granted") {
    return { ok: false, reason: "permission" };
  }
  return { ok: true, reason: null };
}

export async function requestBreadcrumbPermission() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return readBreadcrumbPermission();
  }
  await Location.requestBackgroundPermissionsAsync();
  return readBreadcrumbPermission();
}
