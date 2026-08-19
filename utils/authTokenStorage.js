import * as SecureStore from "expo-secure-store";
import {
  getTokenCompanyId,
  getTokenEmail,
  getTokenUserId,
  getTokenVersion,
  isTokenExpired,
} from "./jwtTokenUtils";
import { AUTH_ERROR_CODES } from "./authSession";

// v2: keyed by userId+companyId (not companyId alone) so two different email
// accounts that both belong to the same company no longer overwrite each
// other's vaulted session. Bumping the index key lets old bb_cs_* entries
// age out naturally (no migration needed — worst case a one-time re-login).
const ACCOUNT_SESSION_INDEX_KEY = "bb_account_session_ids";

function sanitizeKeyPart(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Deterministic (not reversible) id for a saved session — never parsed back apart. */
function accountKeyFor(userId, companyId) {
  return `${sanitizeKeyPart(userId || "u")}__${sanitizeKeyPart(companyId)}`;
}

function storageKeyForAccount(accountKey) {
  return `bb_as_${sanitizeKeyPart(accountKey)}`;
}

async function readAccountIndex() {
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNT_SESSION_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function writeAccountIndex(ids) {
  const unique = [...new Set(ids.map(String))];
  await SecureStore.setItemAsync(
    ACCOUNT_SESSION_INDEX_KEY,
    JSON.stringify(unique)
  );
}

async function getAccountSessionToken(accountKey) {
  if (!accountKey) return null;
  try {
    return await SecureStore.getItemAsync(storageKeyForAccount(accountKey));
  } catch {
    return null;
  }
}

async function removeAccountSessionToken(accountKey) {
  if (!accountKey) return;
  try {
    await SecureStore.deleteItemAsync(storageKeyForAccount(accountKey));
  } catch {
    /* noop */
  }
  const ids = await readAccountIndex();
  const next = ids.filter((x) => x !== accountKey);
  if (next.length === 0) {
    try {
      await SecureStore.deleteItemAsync(ACCOUNT_SESSION_INDEX_KEY);
    } catch {
      /* noop */
    }
  } else {
    await writeAccountIndex(next);
  }
}

/**
 * Remember a JWT for this device + user + company (biometric / switcher restore).
 * Writes under both the requested company id and the JWT's company claim when they
 * differ (API list vs token payload mismatch).
 */
/** True if `incoming` should replace `existing` in the vault (never downgrade tokenVersion). */
function shouldReplaceVaultToken(existing, incoming) {
  if (!existing) return true;
  if (existing === incoming) return false;
  const nextVer = getTokenVersion(incoming);
  const prevVer = getTokenVersion(existing);
  if (nextVer == null || prevVer == null) return true;
  return nextVer >= prevVer;
}

export async function persistCompanySessionToken(companyId, token) {
  if (!token) return;
  const userId = getTokenUserId(token);
  const keys = new Set();
  if (companyId != null && companyId !== "") {
    keys.add(accountKeyFor(userId, companyId));
  }
  const jwtCo = getTokenCompanyId(token);
  if (jwtCo) keys.add(accountKeyFor(userId, jwtCo));
  if (keys.size === 0) return;

  const ids = await readAccountIndex();
  const merged = new Set([...ids, ...keys]);
  for (const k of keys) {
    const existing = await getAccountSessionToken(k);
    if (!shouldReplaceVaultToken(existing, token)) continue;
    await SecureStore.setItemAsync(storageKeyForAccount(k), token);
  }
  await writeAccountIndex([...merged]);
}

/**
 * Drop a rejected JWT from legacy + per-account vault (does not call server sign-out).
 */
export async function removeStoredSessionToken(token) {
  if (!token) return;
  try {
    const legacy = await SecureStore.getItemAsync("token");
    if (legacy === token) {
      await SecureStore.deleteItemAsync("token");
    }
  } catch {
    /* noop */
  }
  const ids = await readAccountIndex();
  for (const id of ids) {
    try {
      const stored = await getAccountSessionToken(id);
      if (stored === token) {
        await removeAccountSessionToken(id);
      }
    } catch {
      /* noop */
    }
  }
}

/** After password login, remove older vault copies for the same user/company. */
export async function pruneOlderSessionsForUser(newToken) {
  if (!newToken) return;
  const newVer = getTokenVersion(newToken);
  if (newVer == null) return;
  const newCo = getTokenCompanyId(newToken);
  const newEmail = getTokenEmail(newToken);

  const candidates = await enumerateSessionTokens();
  for (const { token, companyId } of candidates) {
    if (token === newToken) continue;
    const ver = getTokenVersion(token);
    if (ver == null || ver >= newVer) continue;
    const sameCo =
      newCo != null &&
      companyId != null &&
      (String(companyId) === newCo || getTokenCompanyId(token) === newCo);
    const sameEmail =
      newEmail != null &&
      getTokenEmail(token) != null &&
      getTokenEmail(token) === newEmail;
    if (sameCo || sameEmail) {
      await removeStoredSessionToken(token);
    }
  }
}

export async function clearAllCompanySessionTokens() {
  const ids = await readAccountIndex();
  for (const id of ids) {
    try {
      await SecureStore.deleteItemAsync(storageKeyForAccount(id));
    } catch {
      /* noop */
    }
  }
  try {
    await SecureStore.deleteItemAsync(ACCOUNT_SESSION_INDEX_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Mirror legacy `token` into per-account vault only when missing or legacy is newer.
 * Never overwrite a fresher company JWT with an older legacy copy.
 */
export async function syncLegacyTokenIntoPerCompanyStore() {
  try {
    const legacy = await SecureStore.getItemAsync("token");
    if (!legacy || isTokenExpired(legacy)) return;
    const cid = getTokenCompanyId(legacy);
    if (!cid) return;
    const userId = getTokenUserId(legacy);
    const key = accountKeyFor(userId, cid);
    const existing = await getAccountSessionToken(key);
    if (shouldReplaceVaultToken(existing, legacy)) {
      await persistCompanySessionToken(cid, legacy);
    }
  } catch {
    /* noop */
  }
}

/**
 * All locally stored JWTs that are well-formed (not checked against the server).
 * @returns {Promise<Array<{ token: string, companyId: string | null }>>}
 */
export async function enumerateSessionTokens() {
  const out = [];
  const seen = new Set();

  const add = (token, companyId) => {
    if (!token || isTokenExpired(token)) return;
    if (seen.has(token)) return;
    seen.add(token);
    const cid =
      companyId != null && companyId !== ""
        ? String(companyId)
        : getTokenCompanyId(token);
    out.push({ token, companyId: cid });
  };

  try {
    const legacy = await SecureStore.getItemAsync("token");
    add(legacy, getTokenCompanyId(legacy));
  } catch {
    /* noop */
  }

  const ids = await readAccountIndex();
  for (const id of ids) {
    const t = await getAccountSessionToken(id);
    add(t, getTokenCompanyId(t));
  }

  out.sort((a, b) => {
    const va = getTokenVersion(a.token) ?? -1;
    const vb = getTokenVersion(b.token) ?? -1;
    return vb - va;
  });

  return out;
}

function filterCandidatesByUserId(candidates, userId) {
  if (!userId) return candidates;
  const want = String(userId);
  return candidates.filter((c) => getTokenUserId(c.token) === want);
}

/**
 * Distinct user ids among locally stored JWTs (well-formed only).
 */
export async function getDistinctVaultUserIds() {
  const candidates = await enumerateSessionTokens();
  return [
    ...new Set(
      candidates
        .map((c) => getTokenUserId(c.token))
        .filter((id) => id != null && id !== ""),
    ),
  ];
}

/**
 * First stored JWT that passes server verification (for biometric restore).
 * @param {(token: string) => Promise<{ valid: boolean }>} verifyFn
 * @param {{ userId?: string | null }} [options] — prefer sessions for this user
 */
export async function findVerifiedSessionToken(verifyFn, options = {}) {
  const { userId = null } = options;
  let candidates = await enumerateSessionTokens();
  candidates = filterCandidatesByUserId(candidates, userId);
  for (const candidate of candidates) {
    const check = await verifyFn(candidate.token);
    if (check?.valid) return candidate;
    const stale =
      check?.reason === AUTH_ERROR_CODES.TOKEN_VERSION_MISMATCH ||
      check?.reason === AUTH_ERROR_CODES.DEVICE_MISMATCH ||
      check?.reason === "session_invalid";
    if (stale) {
      await removeStoredSessionToken(candidate.token);
    }
  }
  return null;
}

/**
 * @param {{ userId?: string | null }} [options]
 * @returns {{ token: string, companyId: string | null } | null}
 */
export async function findAnyValidSessionToken(options = {}) {
  const { userId = null } = options;
  let candidates = await enumerateSessionTokens();
  candidates = filterCandidatesByUserId(candidates, userId);
  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Find a non-expired JWT for the given company (API id), including when the vault
 * key used a different id than the email/company list returns.
 * @param {string|number} companyId
 * @param {{ userId?: string | null }} [options] — only return a token for this user
 */
export async function resolveSessionTokenForCompanyId(companyId, options = {}) {
  const { userId = null } = options;
  const picked = String(companyId ?? "").trim();
  if (!picked) return null;

  const matchesUser = (token) => {
    if (!userId) return true;
    return getTokenUserId(token) === String(userId);
  };

  if (userId) {
    const direct = await getAccountSessionToken(accountKeyFor(userId, picked));
    if (direct && !isTokenExpired(direct) && matchesUser(direct)) {
      return direct;
    }
  }

  const candidates = await enumerateSessionTokens();
  for (const { token, companyId: tCo } of candidates) {
    if (!token || isTokenExpired(token) || !matchesUser(token)) continue;
    const claimedCo = getTokenCompanyId(token);
    if (claimedCo != null && String(claimedCo) === picked) return token;
    if (tCo != null && String(tCo) === picked) return token;
  }

  return null;
}

/**
 * Remove a specific saved account (userId + companyId) from the device vault,
 * without calling the server. Used by the account switcher's "remove" action.
 */
export async function removeAccountFromVault(userId, companyId) {
  if (companyId == null) return;
  await removeAccountSessionToken(accountKeyFor(userId, companyId));
}
