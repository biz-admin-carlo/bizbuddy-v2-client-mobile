/**
 * JWT helpers (no SecureStore / no Zustand) for use from auth storage and store.
 */

export const getJwtPayload = (token) => {
  try {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
};

/** User id embedded in the login JWT (shape varies by backend). */
export const getTokenUserId = (token) => {
  const p = getJwtPayload(token);
  if (!p) return null;
  const id = p.userId ?? p.UserId ?? p.user_id ?? p.sub ?? p.id;
  return id != null ? String(id) : null;
};

/** Company id embedded in the login JWT (shape varies by backend). */
export const getTokenCompanyId = (token) => {
  const p = getJwtPayload(token);
  if (!p) return null;
  const id = p.companyId ?? p.CompanyId ?? p.company_id ?? p.cid;
  return id != null ? String(id) : null;
};

/** Session generation in JWT (must match User.tokenVersion on the server). */
export const getTokenVersion = (token) => {
  const p = getJwtPayload(token);
  if (!p) return null;
  const v =
    p.tokenVersion ?? p.token_version ?? p.TokenVersion ?? p.tv ?? null;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Dev-friendly log of JWT session claims (never logs the raw token). */
export const logJwtSessionDebug = (label, token) => {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (!token) {
    console.log(`[Auth/JWT] ${label}: (no token)`);
    return;
  }
  const payload = getJwtPayload(token);
  console.log(`[Auth/JWT] ${label}`, {
    userId: getTokenUserId(token),
    tokenVersion: getTokenVersion(token),
    companyId: getTokenCompanyId(token),
    email: getTokenEmail(token),
    exp: payload?.exp
      ? new Date(payload.exp * 1000).toISOString()
      : undefined,
    iat: payload?.iat
      ? new Date(payload.iat * 1000).toISOString()
      : undefined,
  });
};

/** Email in JWT when present. */
export const getTokenEmail = (token) => {
  const p = getJwtPayload(token);
  if (!p) return null;
  const e = p.email ?? p.Email ?? p.unique_name;
  if (typeof e !== "string") return null;
  const t = e.trim().toLowerCase();
  return t.includes("@") ? t : null;
};

/** True only when the token is missing or not a well-formed JWT (not by `exp`). */
export const isTokenExpired = (token) => {
  try {
    if (!token) return true;
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    JSON.parse(atob(parts[1]));
    return false;
  } catch {
    return true;
  }
};
