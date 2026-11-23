import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "location-breadcrumb-sessions";

async function readMap() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export async function readBreadcrumbSession(userId) {
  if (!userId) return null;
  const map = await readMap();
  return map[userId] || null;
}

export async function saveBreadcrumbSession(session) {
  if (!session || !session.userId) return;
  const map = await readMap();
  map[session.userId] = session;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(map));
}

export async function clearBreadcrumbSession(userId) {
  if (!userId) return;
  const map = await readMap();
  delete map[userId];
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(map));
}
