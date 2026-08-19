/**
 * Lightweight, locally-cached display metadata (name/email/company/role) for every
 * account ever signed in on this device, keyed by `${userId}::${companyId}`.
 *
 * JWTs only carry ids, not display info, so the account switcher UI reads from here
 * instead of hitting the network for every saved account. Entries are upserted from
 * the profile screen whenever that account's profile is fetched, so the *active*
 * account's metadata is always fresh; other saved accounts show whatever was last seen.
 */
import * as SecureStore from "expo-secure-store";

const ACCOUNT_DIRECTORY_KEY = "bb_account_directory";

function directoryKey(userId, companyId) {
  return `${userId ?? "u"}::${companyId}`;
}

export async function getAccountDirectory() {
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNT_DIRECTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAccountDirectory(map) {
  try {
    await SecureStore.setItemAsync(ACCOUNT_DIRECTORY_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

/**
 * @param {{ userId: string, companyId: string|number, email?: string, firstName?: string,
 *   lastName?: string, companyName?: string, role?: string }} entry
 */
export async function upsertAccountDirectoryEntry(entry) {
  if (!entry?.userId || entry?.companyId == null || entry.companyId === "") return;
  const key = directoryKey(entry.userId, entry.companyId);
  const map = await getAccountDirectory();
  map[key] = {
    userId: String(entry.userId),
    companyId: String(entry.companyId),
    email: entry.email ? String(entry.email).trim().toLowerCase() : map[key]?.email ?? null,
    firstName: entry.firstName ?? map[key]?.firstName ?? "",
    lastName: entry.lastName ?? map[key]?.lastName ?? "",
    companyName: entry.companyName ?? map[key]?.companyName ?? "",
    role: entry.role ?? map[key]?.role ?? "",
    updatedAt: Date.now(),
  };
  await writeAccountDirectory(map);
}

export async function getAccountDirectoryEntry(userId, companyId) {
  const map = await getAccountDirectory();
  return map[directoryKey(userId, companyId)] ?? null;
}

export async function removeAccountDirectoryEntry(userId, companyId) {
  const key = directoryKey(userId, companyId);
  const map = await getAccountDirectory();
  if (!(key in map)) return;
  delete map[key];
  await writeAccountDirectory(map);
}
