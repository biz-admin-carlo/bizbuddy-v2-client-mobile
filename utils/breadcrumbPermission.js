import { Platform } from "react-native";
import * as Location from "expo-location";

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
