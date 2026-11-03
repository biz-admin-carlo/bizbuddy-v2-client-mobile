/**
 * Shared helpers for turning locally vaulted JWT sessions into display-ready
 * account rows (avatar initials, name, email, company, role). Used by the
 * account switcher (one row per company) and by the biometric sign-in account
 * picker (grouped by person/email via groupVaultedRowsByPerson).
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

/**
 * Collapse company memberships into one picker row per person (email).
 * Rows without an email stay separate, keyed by userId.
 *
 * @param {Array<{ userId: string, email?: string|null, token: string }>} rows
 */
export function groupVaultedRowsByPerson(rows) {
  const byEmail = new Map();
  const noEmail = [];

  for (const row of rows || []) {
    const email = row.email ? String(row.email).trim().toLowerCase() : null;
    if (email) {
      const existing = byEmail.get(email);
      if (!existing) {
        byEmail.set(email, {
          ...row,
          key: `person::${email}`,
          email,
          companyName: "",
          role: "",
          memberUserIds: [row.userId].filter(Boolean),
          memberTokens: [row.token].filter(Boolean),
        });
      } else {
        if (row.userId && !existing.memberUserIds.includes(row.userId)) {
          existing.memberUserIds.push(row.userId);
        }
        if (row.token && !existing.memberTokens.includes(row.token)) {
          existing.memberTokens.push(row.token);
        }
      }
    } else {
      noEmail.push({
        ...row,
        memberUserIds: [row.userId].filter(Boolean),
        memberTokens: [row.token].filter(Boolean),
      });
    }
  }

  return [...byEmail.values(), ...noEmail];
}
