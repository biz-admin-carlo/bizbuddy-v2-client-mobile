import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config/constant";

/**
 * System-admin session only. Never write this into the employee "token"
 * key, the company session vault, or biometric storage.
 */
export const SYSTEM_ADMIN_TOKEN_KEY = "systemAdminToken";

let onUnauthorized = null;

export function setSystemAdminUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function getSystemAdminToken() {
  return SecureStore.getItemAsync(SYSTEM_ADMIN_TOKEN_KEY);
}

export async function saveSystemAdminToken(token) {
  await SecureStore.setItemAsync(SYSTEM_ADMIN_TOKEN_KEY, token);
}

export async function clearSystemAdminToken() {
  try {
    await SecureStore.deleteItemAsync(SYSTEM_ADMIN_TOKEN_KEY);
  } catch {
    /* already absent */
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mapAuthError(data, fallback = "An error occurred. Please try again.") {
  const code = data?.code;
  if (code === "ADMIN_LOCKED") {
    return { code, message: "Too many failed attempts. Try again in 15 minutes." };
  }
  if (code === "MFA_TOKEN_INVALID") {
    return { code, message: "Your sign-in step expired.", expired: true };
  }
  if (code === "MFA_INVALID_CODE") {
    return {
      code,
      message: data?.message || "That code is not valid.",
      clearCode: true,
    };
  }
  if (code === "INVALID_CREDENTIALS") {
    return { code, message: "Invalid username or password." };
  }
  return { code, message: data?.message || fallback };
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson(response);
  return { response, data };
}

export async function systemAdminLogin(username, password) {
  const { response, data } = await postJson("/api/system-admin/auth/login", {
    username,
    password,
  });
  if (!response.ok || data?.success === false) {
    return { ok: false, ...mapAuthError(data, "Invalid credentials") };
  }
  if (data?.token) {
    await saveSystemAdminToken(data.token);
    return { ok: true, step: "done" };
  }
  if (data?.mfaSetupRequired && data?.mfaToken) {
    return {
      ok: true,
      step: "setup",
      mfaToken: data.mfaToken,
      secret: data.secret || "",
      otpauthUrl: data.otpauthUrl || "",
    };
  }
  if (data?.mfaRequired && data?.mfaToken) {
    return { ok: true, step: "verify", mfaToken: data.mfaToken };
  }
  return { ok: false, message: "Unexpected sign-in response. Please try again." };
}

async function finishMfa(path, body) {
  const { response, data } = await postJson(path, body);
  if (!response.ok || data?.success === false || !data?.token) {
    return { ok: false, ...mapAuthError(data, "That code is not valid.") };
  }
  await saveSystemAdminToken(data.token);
  return {
    ok: true,
    recoveryCodes: Array.isArray(data.recoveryCodes) ? data.recoveryCodes : [],
    recoveryCodesRemaining: data.recoveryCodesRemaining,
  };
}

export function systemAdminMfaSetup(mfaToken, code) {
  return finishMfa("/api/system-admin/auth/2fa/setup", { mfaToken, code });
}

export function systemAdminMfaVerify(mfaToken, { code, recoveryCode } = {}) {
  const body = recoveryCode
    ? { mfaToken, recoveryCode }
    : { mfaToken, code };
  return finishMfa("/api/system-admin/auth/2fa/verify", body);
}

export async function systemAdminLogout() {
  const token = await getSystemAdminToken();
  try {
    if (token) {
      await fetch(`${API_BASE_URL}/api/system-admin/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    /* local sign-out still proceeds */
  }
  await clearSystemAdminToken();
}

export async function verifySystemAdminSession() {
  const token = await getSystemAdminToken();
  if (!token) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/api/system-admin/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await readJson(response);
    if (response.status === 401 || !data?.success) {
      await clearSystemAdminToken();
      return false;
    }
    return true;
  } catch {
    await clearSystemAdminToken();
    return false;
  }
}

export async function systemAdminGet(path) {
  const token = await getSystemAdminToken();
  if (!token) {
    onUnauthorized?.();
    return { ok: false, unauthorized: true, data: null };
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await readJson(response);

  if (response.status === 401) {
    await clearSystemAdminToken();
    onUnauthorized?.();
    return { ok: false, unauthorized: true, data: null };
  }

  if (!response.ok || body?.success === false) {
    return {
      ok: false,
      unauthorized: false,
      message: body?.message || "Could not load data.",
      data: null,
    };
  }

  return { ok: true, data: body?.data ?? null };
}
