import * as SecureStore from "expo-secure-store";
import {
  getTokenCompanyId,
  getTokenEmail,
  getTokenUserId,
  getTokenVersion,
  isTokenExpired,
} from "./jwtTokenUtils";
import { AUTH_ERROR_CODES } from "./authSession";

const COMPANY_SESSION_INDEX_KEY = "bb_company_session_ids";

function storageKeyForCompany(companyId) {
  const safe = String(companyId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `bb_cs_${safe}`;
}

async function readCompanyIndex() {
  try {
    const raw = await SecureStore.getItemAsync(COMPANY_SESSION_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function writeCompanyIndex(ids) {
  const unique = [...new Set(ids.map(String))];
  await SecureStore.setItemAsync(
    COMPANY_SESSION_INDEX_KEY,
    JSON.stringify(unique)
  );
}

/**
 * Remember a JWT for this device + company (biometric can restore per company).
 * Writes under both the requested id and the JWT's company claim when they differ
 * (API list vs token payload mismatch).
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
  const keys = new Set();
  if (companyId != null && companyId !== "") keys.add(String(companyId));
  const jwtCo = getTokenCompanyId(token);
  if (jwtCo) keys.add(String(jwtCo));
  if (keys.size === 0) return;

  const ids = await readCompanyIndex();
  const merged = new Set([...ids.map(String), ...keys]);
  for (const k of keys) {
    const existing = await getCompanySessionToken(k);
    if (!shouldReplaceVaultToken(existing, token)) continue;
    await SecureStore.setItemAsync(storageKeyForCompany(k), token);
  }
  await writeCompanyIndex([...merged]);
}

/**
 * Drop a rejected JWT from legacy + per-company vault (does not call server sign-out).
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
  const ids = await readCompanyIndex();
  for (const id of ids) {
    try {
      const stored = await getCompanySessionToken(id);
      if (stored === token) {
        await removeCompanySessionToken(id);
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

export async function getCompanySessionToken(companyId) {
  if (companyId == null) return null;
  try {
    return await SecureStore.getItemAsync(storageKeyForCompany(String(companyId)));
  } catch {
    return null;
  }
}

export async function removeCompanySessionToken(companyId) {
  if (companyId == null) return;
  const id = String(companyId);
  try {
    await SecureStore.deleteItemAsync(storageKeyForCompany(id));
  } catch {
    /* noop */
  }
  const ids = await readCompanyIndex();
  const next = ids.filter((x) => String(x) !== id);
  if (next.length === 0) {
    try {
      await SecureStore.deleteItemAsync(COMPANY_SESSION_INDEX_KEY);
    } catch {
      /* noop */
    }
  } else {
    await writeCompanyIndex(next);
  }
}

export async function clearAllCompanySessionTokens() {
  const ids = await readCompanyIndex();
  for (const id of ids) {
    try {
      await SecureStore.deleteItemAsync(storageKeyForCompany(id));
    } catch {
      /* noop */
    }
  }
  try {
    await SecureStore.deleteItemAsync(COMPANY_SESSION_INDEX_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Mirror legacy `token` into per-company vault only when missing or legacy is newer.
 * Never overwrite a fresher company JWT with an older legacy copy.
 */
export async function syncLegacyTokenIntoPerCompanyStore() {
  try {
    const legacy = await SecureStore.getItemAsync("token");
    if (!legacy || isTokenExpired(legacy)) return;
    const cid = getTokenCompanyId(legacy);
    if (!cid) return;
    const existing = await getCompanySessionToken(cid);
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

  const ids = await readCompanyIndex();
  for (const id of ids) {
    const t = await getCompanySessionToken(id);
    add(t, id);
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

  let sessionToken = await getCompanySessionToken(picked);
  if (
    sessionToken &&
    !isTokenExpired(sessionToken) &&
    matchesUser(sessionToken)
  ) {
    return sessionToken;
  }

  const ids = await readCompanyIndex();
  for (const id of ids) {
    const t = await getCompanySessionToken(id);
    if (!t || isTokenExpired(t) || !matchesUser(t)) continue;
    const tCo = getTokenCompanyId(t);
    if (tCo != null && String(tCo) === picked) return t;
    if (String(id) === picked) return t;
  }

  return null;
}
