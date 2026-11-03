import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { VerifyingAccess } from "../../components/system-admin/ui";
import {
  setSystemAdminUnauthorizedHandler,
  verifySystemAdminSession,
} from "../../utils/systemAdminApi";

export default function SystemAdminLayout() {
  const router = useRouter();
  const segments = useSegments();
  const isLogin = segments.includes("login");
  const [ready, setReady] = useState(isLogin);

  useEffect(() => {
    setSystemAdminUnauthorizedHandler(() => {
      router.replace("/system-admin/login");
    });
    return () => setSystemAdminUnauthorizedHandler(null);
  }, [router]);

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    setReady(false);
    (async () => {
      const ok = await verifySystemAdminSession();
      if (cancelled) return;
      if (!ok) {
        router.replace("/system-admin/login");
        return;
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLogin, router]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(panel)" />
      </Stack>
      {!isLogin && !ready ? (
        <View style={StyleSheet.absoluteFill}>
          <VerifyingAccess />
        </View>
      ) : null}
    </View>
  );
}
