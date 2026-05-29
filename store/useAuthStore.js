// store/useAuthStore.js

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import {
  getTokenCompanyId,
  isTokenExpired,
  logJwtSessionDebug,
} from "../utils/jwtTokenUtils";
import {
  clearAllCompanySessionTokens,
  persistCompanySessionToken,
  pruneOlderSessionsForUser,
} from "../utils/authTokenStorage";

export {
  getJwtPayload,
  getTokenCompanyId,
  getTokenEmail,
  getTokenVersion,
  isTokenExpired,
  logJwtSessionDebug,
} from "../utils/jwtTokenUtils";

const LAST_SIGN_IN_EMAIL_KEY = "lastSignInEmail";
const LAST_COMPANY_ID_KEY = "lastCompanyId";

async function clearSignInContextKeys() {
  try {
    await SecureStore.deleteItemAsync(LAST_SIGN_IN_EMAIL_KEY);
  } catch {
    /* noop */
  }
  try {
    await SecureStore.deleteItemAsync(LAST_COMPANY_ID_KEY);
  } catch {
    /* noop */
  }
}

export { LAST_SIGN_IN_EMAIL_KEY, LAST_COMPANY_ID_KEY, clearSignInContextKeys };

const useAuthStore = create((set, get) => ({
  token: null,
  remember: false,
  /**
   * Store session JWT locally (does not call POST /api/account/login).
   * @param {string} token
   * @param {boolean} [remember]
   * @param {string|number|null} [companyId] — when set, also stores a per-company session for biometric.
   */
  login: async (token, remember = false, companyId = null) => {
    logJwtSessionDebug(
      "setSession (local vault — does not bump server tokenVersion)",
      token,
    );
    await pruneOlderSessionsForUser(token);
    set({ token, remember });
    await SecureStore.setItemAsync("token", token);
    const cid =
      companyId != null && companyId !== ""
        ? String(companyId)
        : getTokenCompanyId(token);
    if (cid) {
      await persistCompanySessionToken(cid, token);
    }
  },
  logout: async () => {
    set({ token: null });
    if (!get().remember) {
      try {
        await SecureStore.deleteItemAsync("token");
      } catch {
        /* noop */
      }
      await clearSignInContextKeys();
      // Keep per-company vault entries so biometric can restore other companies
      // after signing out of one. forceLogout still clears everything.
    }
  },
  forceLogout: async () => {
    set({ token: null, remember: false });
    await SecureStore.deleteItemAsync("token");
    await clearSignInContextKeys();
    await clearAllCompanySessionTokens();
  },
  loadToken: async () => {
    const token = await SecureStore.getItemAsync("token");
    if (!token || isTokenExpired(token)) {
      if (token) {
        await SecureStore.deleteItemAsync("token");
        await clearSignInContextKeys();
      }
      set({ token: null, remember: false });
      return false;
    }
    logJwtSessionDebug("loadToken (restored session)", token);
    set({ token, remember: true });
    return true;
  },
}));

export default useAuthStore;
