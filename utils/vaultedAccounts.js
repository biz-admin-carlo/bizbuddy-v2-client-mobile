/**
 * Shared helpers for turning locally vaulted JWT sessions into display-ready
 * account rows (avatar initials, name, email, company, role). Used by the
 * account switcher and by the biometric sign-in account picker so both
 * present the same list of saved accounts.
 */
import { enumerateSessionTokens } from "./authTokenStorage";
import { getTokenUserId, getTokenCompanyId, getTokenEmail } from "./jwtTokenUtils";
import { getAccountDirectory } from "./accountDirectory";

export function displayNameForEntry(entry) {
  const first = entry?.firstName || "";
  const last = entry?.lastName || "";
  const full = `${first} ${last}`.trim();
  return full || entry?.email || "Account";
}

export function initialsForEntry(entry) {
  const first = (entry?.firstName || "").trim();
  const last = (entry?.lastName || "").trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
  }
  const email = entry?.email || "";
  return email ? email.charAt(0).toUpperCase() : "?";
}

/**
 * One row per distinct vaulted (userId, companyId) session, decorated with
 * directory display info.
 * @returns {Promise<Array<{
 *   key: string, userId: string, companyId: string, token: string,
 *   email: string|null, companyName: string, role: string,
 *   name: string, initials: string,
 * }>>}
 */
export async function getVaultedAccountRows() {
  const [candidates, directory] = await Promise.all([
    enumerateSessionTokens(),
    getAccountDirectory(),
  ]);

  return candidates
    .map(({ token, companyId }) => {
      const userId = getTokenUserId(token);
      const cid = companyId ?? getTokenCompanyId(token);
      if (!userId || cid == null) return null;
      const entry = directory[`${userId}::${cid}`] || {};
      return {
        key: `${userId}::${cid}`,
        userId,
        companyId: String(cid),
        token,
        email: entry.email || getTokenEmail(token) || null,
        firstName: entry.firstName || "",
        lastName: entry.lastName || "",
        companyName: entry.companyName || "",
        role: entry.role || "",
        name: displayNameForEntry(entry),
        initials: initialsForEntry(entry),
      };
    })
    .filter(Boolean);
}
