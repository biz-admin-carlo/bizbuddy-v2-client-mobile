import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import { useRouter } from "expo-router";
import useAuthStore from "../store/useAuthStore";
import { verifySessionToken } from "../utils/authSession";

/**
 * When the user is in tabs, re-check the JWT on app foreground.
 * Signs out only when the API reports device/token-version invalidation (not time-based expiry).
 */
export function useSessionGuard() {
  const { token, forceLogout } = useAuthStore();
  const router = useRouter();
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!token) return;

    const runCheck = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const result = await verifySessionToken(token);
        if (!result.valid && result.reason !== "unauthorized") {
          await forceLogout();
          Alert.alert(
            "Signed out",
            "This account was signed in on another device. Please sign in again.",
            [{ text: "OK", onPress: () => router.replace("/(auth)/signin") }],
          );
        }
      } finally {
        checkingRef.current = false;
      }
    };

    runCheck();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runCheck();
    });

    return () => sub.remove();
  }, [token, forceLogout, router]);
}
