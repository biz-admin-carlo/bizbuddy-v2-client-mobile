import { API_BASE_URL } from "../config/constant";
import { getTokenVersion, logJwtSessionDebug } from "./jwtTokenUtils";

export const AUTH_ERROR_CODES = {
  DEVICE_ALREADY_REGISTERED: "DEVICE_ALREADY_REGISTERED",
  DEVICE_SWITCH_COOLDOWN: "DEVICE_SWITCH_COOLDOWN",
  DEVICE_MISMATCH: "DEVICE_MISMATCH",
  TOKEN_VERSION_MISMATCH: "TOKEN_VERSION_MISMATCH",
};

const SESSION_INVALID_CODES = new Set([
  AUTH_ERROR_CODES.DEVICE_MISMATCH,
  AUTH_ERROR_CODES.TOKEN_VERSION_MISMATCH,
]);

const SESSION_INVALID_MESSAGES = [
  "session ended",
  "signed in on another device",
  "another device",
  "token version",
  "invalid or expired token",
];

/**
 * True when the API indicates this JWT is no longer valid (e.g. login on another device).
 */
export function isSessionInvalidResponse(response, data) {
  if (!response) return false;
  const status = response.status;
  if (status !== 401 && status !== 403) return false;

  const code = data?.code;
  if (code && SESSION_INVALID_CODES.has(code)) return true;

  const message = String(data?.message || "").toLowerCase();
  return SESSION_INVALID_MESSAGES.some((phrase) => message.includes(phrase));
}

export function isDeviceAlreadyRegisteredError(data) {
  return data?.code === AUTH_ERROR_CODES.DEVICE_ALREADY_REGISTERED;
}

export function isDeviceSwitchCooldownError(data) {
  return data?.code === AUTH_ERROR_CODES.DEVICE_SWITCH_COOLDOWN;
}

function formatSwitchAllowedAt(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getLoginErrorMessage(data, fallback = "Invalid credentials.") {
  if (!data) return fallback;
  if (isDeviceSwitchCooldownError(data)) {
    const when = formatSwitchAllowedAt(data.switchAllowedAt);
    if (when) {
      return `You can sign in on this device after ${when}.`;
    }
    return (
      data.message ||
      "This account was recently used on another device. Please try again after 24 hours."
    );
  }
  if (isDeviceAlreadyRegisteredError(data)) {
    return (
      data.message ||
      "This account is already signed in on another device. Sign out there first or contact your administrator."
    );
  }
  return data.message || fallback;
}

async function fetchWithBearer(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-json */
  }
  return { response, data };
}

function logSessionRejection(endpoint, token, response, data) {
  const jwtVersion = getTokenVersion(token);
  const payload = {
    endpoint,
    httpStatus: response?.status,
    apiCode: data?.code,
    apiMessage: data?.message,
    jwtTokenVersion: jwtVersion,
  };
  if (data?.code === AUTH_ERROR_CODES.TOKEN_VERSION_MISMATCH) {
    console.warn(
      "[Auth/JWT] TOKEN_VERSION_MISMATCH — JWT tokenVersion does not match DB User.tokenVersion",
      payload,
    );
  } else if (typeof __DEV__ !== "undefined" && __DEV__) {
    logJwtSessionDebug(`session rejected (${endpoint})`, token);
    console.warn("[Auth/JWT] session rejected", payload);
  }
}

function evaluateAuthResponse(response, data, { strict }, meta = {}) {
  if (response.ok) {
    return { valid: true, data };
  }

  if (isSessionInvalidResponse(response, data)) {
    if (meta.token && meta.endpoint) {
      logSessionRejection(meta.endpoint, meta.token, response, data);
    }
    return {
      valid: false,
      reason: data?.code || "session_invalid",
      data,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { valid: false, reason: "unauthorized", data };
  }

  return strict
    ? { valid: false, reason: "server_error", data }
    : { valid: true };
}

/**
 * Check whether a JWT is still accepted by the API.
 * @param {object} [options]
 * @param {boolean} [options.strict] — fail on network errors; also confirm via
 *   `/api/notifications` when profile succeeds (catches TOKEN_VERSION_MISMATCH).
 */
export async function verifySessionToken(token, options = {}) {
  const { strict = false } = options;
  if (!token) return { valid: false, reason: "no_token" };

  logJwtSessionDebug(
    strict ? "verifySessionToken (strict)" : "verifySessionToken",
    token,
  );

  try {
    const profile = await fetchWithBearer(
      `${API_BASE_URL}/api/account/profile`,
      token,
    );

    if (!profile.response.ok) {
      return evaluateAuthResponse(profile.response, profile.data, { strict }, {
        token,
        endpoint: "GET /api/account/profile",
      });
    }

    if (!strict) {
      return { valid: true, data: profile.data };
    }

    const notifications = await fetchWithBearer(
      `${API_BASE_URL}/api/notifications?limit=1`,
      token,
    );

    if (notifications.response.ok) {
      return { valid: true, data: profile.data };
    }

    if (isSessionInvalidResponse(notifications.response, notifications.data)) {
      logSessionRejection(
        "GET /api/notifications",
        token,
        notifications.response,
        notifications.data,
      );
      return {
        valid: false,
        reason: notifications.data?.code || "session_invalid",
        data: notifications.data,
      };
    }

    if (
      notifications.response.status === 401 ||
      notifications.response.status === 403
    ) {
      return {
        valid: false,
        reason: "unauthorized",
        data: notifications.data,
      };
    }

    return { valid: true, data: profile.data };
  } catch {
    return strict
      ? { valid: false, reason: "network_error" }
      : { valid: true };
  }
}
