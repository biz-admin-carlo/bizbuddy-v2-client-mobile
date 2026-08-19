import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import useAuthStore, { persistSignInContext } from "../store/useAuthStore";
import {
  getTokenCompanyId,
  getTokenEmail,
  getTokenUserId,
} from "../utils/jwtTokenUtils";
import {
  enumerateSessionTokens,
  removeAccountFromVault,
  removeStoredSessionToken,
} from "../utils/authTokenStorage";
import { removeAccountDirectoryEntry } from "../utils/accountDirectory";
import { getVaultedAccountRows, displayNameForEntry, initialsForEntry } from "../utils/vaultedAccounts";
import { getAllKnownEmailCompanies } from "../utils/emailCompanyDirectory";
import { verifySessionToken } from "../utils/authSession";
import { NotificationService } from "../utils/notificationService";
import { getInstallationId } from "../utils/deviceId";
import { API_BASE_URL } from "../config/constant";
import usePresenceStore from "../store/presenceStore";
import useNotificationStore from "../store/notificationStore";

/**
 * Lists every locally saved (userId + companyId) session and provides actions to
 * switch to one instantly, remove one from the device, or add a brand new account —
 * without signing the currently active account out.
 */
export function useAccountSwitcher() {
  const router = useRouter();
  const { token: activeToken, login } = useAuthStore();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [switchingKey, setSwitchingKey] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [vaultedRows, candidates, knownEmailCompanies] = await Promise.all([
        getVaultedAccountRows(),
        enumerateSessionTokens(),
        getAllKnownEmailCompanies(),
      ]);

      const activeUserId = getTokenUserId(activeToken);
      const activeCompanyId = getTokenCompanyId(activeToken);

      const rows = vaultedRows.map((row) => ({
        ...row,
        isActive:
          row.token === activeToken ||
          (row.userId === activeUserId &&
            String(row.companyId) === String(activeCompanyId)),
        needsPassword: false,
      }));

      // Companies already represented by a saved session (matched by email+companyId,
      // not just userId, since a never-logged-in sibling company has no userId yet).
      const vaultedKeys = new Set(
        candidates
          .map(({ token, companyId }) => {
            const tokenEmail = getTokenEmail(token);
            const cid = companyId ?? getTokenCompanyId(token);
            return tokenEmail && cid != null
              ? `${tokenEmail}::${String(cid)}`
              : null;
          })
          .filter(Boolean),
      );

      // Sibling companies discovered from a prior email lookup that the user hasn't
      // signed into on this device yet — shown so they don't have to retype the email.
      const siblingRows = [];
      for (const [email, companies] of Object.entries(knownEmailCompanies)) {
        for (const company of companies) {
          const matchKey = `${email}::${String(company.companyId)}`;
          if (vaultedKeys.has(matchKey)) continue;
          siblingRows.push({
            key: `needs-password::${matchKey}`,
            userId: null,
            companyId: String(company.companyId),
            token: null,
            email,
            firstName: "",
            lastName: "",
            companyName: company.companyName || "",
            role: company.role || "",
            name: displayNameForEntry({ email }),
            initials: initialsForEntry({ email }),
            isActive: false,
            needsPassword: true,
          });
        }
      }

      const allRows = [...rows, ...siblingRows];
      allRows.sort((a, b) => {
        if (a.isActive) return -1;
        if (b.isActive) return 1;
        if (a.needsPassword !== b.needsPassword) {
          return a.needsPassword ? 1 : -1;
        }
        return 0;
      });

      setAccounts(allRows);
    } finally {
      setLoading(false);
    }
  }, [activeToken]);

  const reregisterPushToken = useCallback(async (newToken) => {
    try {
      // Guards on notification permission before touching Firebase messaging —
      // calling getFCMToken() directly here throws `messaging/unregistered` on iOS
      // for any user who hasn't granted notification permission.
      await NotificationService.handlePostLoginTokenSync(newToken);
    } catch {
      /* best-effort — not fatal to the switch */
    }
  }, []);

  const switchToAccount = useCallback(
    async (account) => {
      if (!account || account.isActive) return { ok: true };
      setSwitchingKey(account.key);
      try {
        if (!account.token) {
          // Known sibling company with no saved session yet — skip straight to the
          // password step for that email/company (no need to retype the email).
          router.push({
            pathname: "(auth)/signin",
            params: {
              mode: "switch",
              email: account.email || "",
              companyId: account.companyId,
            },
          });
          return { ok: false, reason: "needs_password" };
        }

        const check = await verifySessionToken(account.token, { strict: true });
        if (!check.valid) {
          await removeStoredSessionToken(account.token);
          await refresh();
          router.push({
            pathname: "(auth)/signin",
            params: {
              mode: "switch",
              email: account.email || "",
              companyId: account.companyId,
            },
          });
          return { ok: false, reason: "needs_password" };
        }

        await persistSignInContext(account.token, account.email, account.companyId);
        await login(account.token, true, account.companyId);

        usePresenceStore.getState().setPresence("available", null);
        useNotificationStore.getState().reset?.();
        reregisterPushToken(account.token);

        router.replace("(tabs)/profile");
        return { ok: true };
      } finally {
        setSwitchingKey(null);
      }
    },
    [login, refresh, reregisterPushToken, router],
  );

  const removeAccount = useCallback(
    async (account) => {
      if (!account) return;
      if (account.isActive) return;
      try {
        const deviceId = await getInstallationId();
        await fetch(`${API_BASE_URL}/api/account/sign-out`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${account.token}`,
          },
          body: JSON.stringify({ deviceId }),
        });
      } catch {
        /* best-effort server sign-out; still remove locally */
      }
      await removeAccountFromVault(account.userId, account.companyId);
      await removeAccountDirectoryEntry(account.userId, account.companyId);
      await refresh();
    },
    [refresh],
  );

  const addAccount = useCallback(() => {
    router.push({ pathname: "(auth)/signin", params: { mode: "add" } });
  }, [router]);

  return {
    accounts,
    loading,
    switchingKey,
    refresh,
    switchToAccount,
    removeAccount,
    addAccount,
  };
}

export default useAccountSwitcher;
