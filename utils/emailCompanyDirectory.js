/**
 * Cache of every company list ever returned by `GET /api/account/get-user-email`
 * for an email typed on this device, keyed by normalized email.
 *
 * This lets the account switcher show sibling companies for an email the user has
 * already looked up — without asking them to retype the email — even for companies
 * they haven't signed into yet on this device.
 */
import * as SecureStore from "expo-secure-store";

const KNOWN_EMAIL_COMPANIES_KEY = "bb_known_email_companies";

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export async function getAllKnownEmailCompanies() {
  try {
    const raw = await SecureStore.getItemAsync(KNOWN_EMAIL_COMPANIES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAllKnownEmailCompanies(map) {
  try {
    await SecureStore.setItemAsync(
      KNOWN_EMAIL_COMPANIES_KEY,
      JSON.stringify(map)
    );
  } catch {
    /* noop */
  }
}

/**
 * @param {string} email
 * @param {Array<{ companyId: string|number, companyName?: string, role?: string }>} companies
 */
export async function cacheCompaniesForEmail(email, companies) {
  const normalized = normalizeEmail(email);
  if (!normalized || !Array.isArray(companies) || companies.length === 0) return;

  const cleaned = companies
    .filter((c) => c && c.companyId != null && c.companyId !== "")
    .map((c) => ({
      companyId: String(c.companyId),
      companyName: c.companyName ?? "",
      role: c.role ?? "",
    }));
  if (cleaned.length === 0) return;

  const map = await getAllKnownEmailCompanies();
  map[normalized] = cleaned;
  await writeAllKnownEmailCompanies(map);
}

export async function getCompaniesForEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const map = await getAllKnownEmailCompanies();
  return map[normalized] ?? [];
}

export async function clearKnownEmailCompanies() {
  try {
    await SecureStore.deleteItemAsync(KNOWN_EMAIL_COMPANIES_KEY);
  } catch {
    /* noop */
  }
}
