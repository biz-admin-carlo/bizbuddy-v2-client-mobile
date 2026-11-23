import AsyncStorage from "@react-native-async-storage/async-storage";

export const BREADCRUMB_QUEUE_KEY = "location-breadcrumb-queue";
export const BREADCRUMB_CHUNK = 50;
export const BREADCRUMB_QUEUE_CAP = 500;

export async function readBreadcrumbQueue() {
  try {
    const raw = await AsyncStorage.getItem(BREADCRUMB_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeBreadcrumbQueue(queue) {
  await AsyncStorage.setItem(BREADCRUMB_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueBreadcrumb(sample) {
  const queue = await readBreadcrumbQueue();
  queue.push(sample);
  const mine = queue.filter((item) => item.userId === sample.userId);
  const others = queue.filter((item) => item.userId !== sample.userId);
  const capped =
    mine.length > BREADCRUMB_QUEUE_CAP
      ? mine.slice(mine.length - BREADCRUMB_QUEUE_CAP)
      : mine;
  await writeBreadcrumbQueue(others.concat(capped));
}

export function settleBreadcrumbChunk(queue, results) {
  const sent = queue.slice(0, results.length);
  const rest = queue.slice(results.length);
  const keep = [];
  sent.forEach((sample, index) => {
    const status = results[index] && results[index].status;
    if (status === "saved" || status === "duplicate" || status === "rejected") return;
    keep.push(sample);
  });
  return keep.concat(rest);
}

export async function dropSamplesForUser(userId) {
  if (!userId) return;
  const queue = await readBreadcrumbQueue();
  await writeBreadcrumbQueue(queue.filter((sample) => sample.userId !== userId));
}

export async function dropUnassignedAfter(userId, collectUntil) {
  if (!userId || !collectUntil || Date.now() <= Date.parse(collectUntil)) return;
  const queue = await readBreadcrumbQueue();
  await writeBreadcrumbQueue(
    queue.filter((sample) => sample.userId !== userId || sample.timeLogId),
  );
}

export async function assignBreadcrumbTimeLogId(timeLogId, userId) {
  if (typeof timeLogId !== "string" || !timeLogId || !userId) return;
  const queue = await readBreadcrumbQueue();
  const next = queue.map((sample) =>
    !sample.timeLogId && sample.userId === userId
      ? { ...sample, timeLogId }
      : sample,
  );
  await writeBreadcrumbQueue(next);
}

export function sampleFromFix(location, timeLogId, source, userId) {
  const coords = location && location.coords;
  if (!coords) return null;
  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  const accuracy = Number(coords.accuracy);
  const altitude = Number(coords.altitude);
  const speed = Number(coords.speed);
  const heading = Number(coords.heading);
  return {
    timeLogId: timeLogId || null,
    recordedAt: new Date(location.timestamp || Date.now()).toISOString(),
    latitude,
    longitude,
    ...(Number.isFinite(accuracy) ? { accuracy } : {}),
    ...(Number.isFinite(altitude) ? { altitude } : {}),
    ...(Number.isFinite(speed) ? { speed } : {}),
    ...(Number.isFinite(heading) ? { heading } : {}),
    isMocked: location.mocked === true,
    source,
    userId: userId || null,
  };
}
