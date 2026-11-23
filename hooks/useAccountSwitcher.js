import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import useAuthStore, { persistSignInContext } from "../store/useAuthStore";
import {
  getTokenCompanyId,
  getTokenUserId,
} from "../utils/jwtTokenUtils";
import {
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

const BIOMETRIC_UNAVAILABLE_ERRORS = new Set([
  "not_available",
  "not_enrolled",
  "passcode_not_set",
]);

/**
 * Device biometric (with passcode fallback) before opening another saved account.
 * `unavailable` means this device cannot run the prompt, so the caller must
 * require a password instead of switching with no check.
 */
export async function confirmAccountSwitchBiometric() {
  let hasHardware = false;
  let isEnrolled = false;
  try {
    hasHardware = await LocalAuthentication.hasHardwareAsync();
    isEnrolled = await LocalAuthentication.isEnrolledAsync();
  } catch (error) {
    console.error("Error checking biometrics for account switch:", error);
    return { ok: false, reason: "unavailable" };
  }

  if (!hasHardware || !isEnrolled) {
    return { ok: false, reason: "unavailable" };
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Verify it's you to switch accounts",
      cancelLabel: "Cancel",
      fallbackLabel: "Use Passcode",
      disableDeviceFallback: false,
    });

    if (result.success) return { ok: true };

    if (result.error && BIOMETRIC_UNAVAILABLE_ERRORS.has(result.error)) {
      return { ok: false, reason: "unavailable" };
    }

    return {
      ok: false,
      reason: "biometric_failed",
      message: biometricFailureMessage(result.error),
    };
  } catch (error) {
    console.error("Account switch biometric error:", error);
    return { ok: false, reason: "unavailable" };
  }
}

function biometricFailureMessage(error) {
  if (error === "lockout") {
    return "Too many failed attempts. Unlock your device, then try switching again.";
  }
  if (
    error === "user_cancel" ||
    error === "system_cancel" ||
    error === "app_cancel"
  ) {
    return "Verify with biometrics to switch to this account.";
  }
  return "Biometric verification failed. Try again to switch accounts.";
}

/**
 * Lists every locally saved (userId + companyId) session and provides actions to
 * switch to one, remove one from the device, or add a brand new account —
 * without signing the currently active account out.
 * A saved session is not opened until biometric verification succeeds.
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
      const [vaultedRows, knownEmailCompanies] = await Promise.all([
        getVaultedAccountRows(),
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

      // JWTs typically have no email claim, so match siblings against the
      // directory-backed vaulted rows (email + companyId, plus company name
      // in case the API list id and the JWT company id differ).
      const vaultedKeys = new Set();
      const vaultedEmailCompanyNames = new Set();
      for (const row of rows) {
        const email = row.email ? String(row.email).trim().toLowerCase() : null;
        if (email && row.companyId != null) {
          vaultedKeys.add(`${email}::${String(row.companyId)}`);
        }
        if (email && row.companyName) {
          vaultedEmailCompanyNames.add(
            `${email}::${String(row.companyName).trim().toLowerCase()}`,
          );
        }
      }

      // Sibling companies discovered from a prior email lookup, scoped to emails that
      // already have a fully signed-in (vaulted) session on this device. This prevents
      // surfacing companies for an email someone merely typed at the login screen but
      // never actually signed into — which would otherwise leak another person's
      // company/role info into this device's switcher.
      const vaultedEmails = new Set(
        rows
          .map((row) => (row.email ? String(row.email).trim().toLowerCase() : null))
          .filter(Boolean),
      );

      const siblingRows = [];
      for (const [email, companies] of Object.entries(knownEmailCompanies)) {
        if (!vaultedEmails.has(email)) continue;
        for (const company of companies) {
          const matchKey = `${email}::${String(company.companyId)}`;
          if (vaultedKeys.has(matchKey)) continue;
          const nameKey = `${email}::${String(company.companyName || "").trim().toLowerCase()}`;
          if (company.companyName && vaultedEmailCompanyNames.has(nameKey)) continue;
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

      const openPasswordSignIn = () => {
        router.push({
          pathname: "(auth)/signin",
          params: {
            mode: "switch",
            email: account.email || "",
            companyId: account.companyId,
          },
        });
      };

      const pauseTracking = async () => {
        try {
          const { pauseBreadcrumbTracking } = await import(
            "../utils/locationBreadcrumbTracking"
          );
          await pauseBreadcrumbTracking();
        } catch {
          /* sampling pause is best-effort before leaving this account */
        }
      };

      try {
        if (!account.token) {
          // Known sibling company with no saved session yet — skip straight to the
          // password step for that email/company (no need to retype the email).
          await pauseTracking();
          openPasswordSignIn();
          return { ok: false, reason: "needs_password" };
        }

        // Prove it's the device owner before opening the other account.
        // Cancelled or failed prompts leave the current account in place.
        const biometric = await confirmAccountSwitchBiometric();
        if (!biometric.ok) {
          if (biometric.reason === "unavailable") {
            await pauseTracking();
            openPasswordSignIn();
            return { ok: false, reason: "needs_password" };
          }
          return {
            ok: false,
            reason: "biometric_failed",
            message: biometric.message,
          };
        }

        await pauseTracking();

        const check = await verifySessionToken(account.token, { strict: true });
        if (!check.valid) {
          await removeStoredSessionToken(account.token);
          await refresh();
          openPasswordSignIn();
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
