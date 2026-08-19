import { Platform } from "react-native";
import * as Application from "expo-application";

function normalizeVersion(version) {
  if (!version) return [];
  return String(version)
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((p) => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

// Returns:
//  - 1 if a > b
//  - 0 if a == b
//  - -1 if a < b
export function compareVersions(a, b) {
  const av = normalizeVersion(a);
  const bv = normalizeVersion(b);
  const maxLen = Math.max(av.length, bv.length);
  for (let i = 0; i < maxLen; i++) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

async function fetchIosStoreInfo({ appId, bundleId } = {}) {
  const url = appId
    ? `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}`
    : bundleId
      ? `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`
      : null;
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.resultCount || !data?.results?.length) return null;
  const item = data.results[0];
  return {
    store: "ios",
    storeName: "App Store",
    storeVersion: item?.version ?? null,
    storeUrl: item?.trackViewUrl ?? null,
  };
}

async function fetchAndroidStoreInfo(packageName) {
  if (!packageName) return null;
  const storeUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(
    packageName
  )}&hl=en&gl=US`;
  const res = await fetch(storeUrl, {
    // Some CDNs behave better with a UA
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const html = await res.text();

  // Best-effort parsing (Play Store markup changes often)
  const metaMatch =
    html.match(/itemprop="softwareVersion"\s+content="([^"]+)"/i) ||
    html.match(/"softwareVersion"\s*[:=]\s*"([^"]+)"/i);
  const storeVersion = metaMatch?.[1]?.trim() || null;
  if (!storeVersion) return null;

  return {
    store: "android",
    storeName: "Google Play",
    storeVersion,
    storeUrl,
  };
}

export function getNativeAppVersion() {
  return (
    Application.nativeApplicationVersion ||
    Application.applicationVersion ||
    null
  );
}

export async function getStoreUpdateInfo({
  iosAppId,
  iosBundleId = Application.applicationId,
  androidPackageName = Application.applicationId,
} = {}) {
  try {
    if (Platform.OS === "ios") {
      return await fetchIosStoreInfo({ appId: iosAppId, bundleId: iosBundleId });
    }
    if (Platform.OS === "android") {
      return await fetchAndroidStoreInfo(androidPackageName);
    }
    return null;
  } catch {
    return null;
  }
}

export function getDefaultStoreUrl({
  appName = "BizBuddy",
  iosAppId,
  iosListingUrl,
  iosBundleId = Application.applicationId,
  androidPackageName = Application.applicationId,
} = {}) {
  if (Platform.OS === "android" && androidPackageName) {
    return `https://play.google.com/store/apps/details?id=${encodeURIComponent(
      androidPackageName
    )}`;
  }
  if (Platform.OS === "ios") {
    if (iosListingUrl) return iosListingUrl;
    if (iosAppId) {
      // Prefer direct listing by numeric Apple App ID when known.
      return `https://apps.apple.com/app/id${encodeURIComponent(iosAppId)}`;
    }
    // Without the numeric Apple App ID, the most reliable fallback is search.
    // If the app is published, `getStoreUpdateInfo()` will return the exact trackViewUrl.
    const term = appName || iosBundleId || "BizBuddy";
    return `https://apps.apple.com/us/search?term=${encodeURIComponent(term)}`;
  }
  return null;
}

