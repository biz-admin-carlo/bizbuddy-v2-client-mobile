// app/index.jsx

"use client";
import "react-native-reanimated";
import { useEffect } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  StatusBar,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { VERSION } from "../config/constant";
import useAuthStore from "../store/useAuthStore";

export default function Index() {
  const router = useRouter();
  const displayVersion = String(VERSION).startsWith("v")
    ? VERSION
    : `v${VERSION}`;

  useEffect(() => {
    const initApp = async () => {
      try {
        const storedVersion = await SecureStore.getItemAsync("appVersion");
        if (!storedVersion) {
          await SecureStore.setItemAsync("appVersion", VERSION);
        } else if (storedVersion !== VERSION) {
          // The app was updated. Persist the new version and continue.
          // (SecureStore persists across installs/updates, so a mismatch is expected.)
          await SecureStore.setItemAsync("appVersion", VERSION);
        }

        const hasSession = await useAuthStore.getState().loadToken();
        const destination = hasSession
          ? "(tabs)/profile"
          : "(auth)/signin";

        // Add a slight delay for a smoother transition
        setTimeout(() => {
          router.replace(destination);
        }, 1500);
      } catch (error) {
        console.error("Error during app initialization:", error);
        router.replace("(auth)/signin");
      }
    };

    initApp();
  }, [router]);

  return (
    <>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#ffffff"
        translucent={false}
        animated={true}
      />
      <SafeAreaView className="flex-1 bg-white justify-center items-center px-6">
        <View className="items-center">
          <Image
            source={require("../assets/images/icon.png")}
            style={{ width: 100, height: 100, borderRadius: 20 }}
            resizeMode="contain"
          />

          <Text className="text-2xl font-bold mt-6 mb-2 text-slate-800">
            BizBuddy
          </Text>

          <Text className="text-center mb-2 text-slate-600">
            Your business companion
          </Text>

          <Text className="text-xs mb-8 text-slate-600">Version {displayVersion}</Text>

          <ActivityIndicator size="large" color="#f97316" />
          <Text className="mt-4 text-slate-600">
            Preparing your workspace...
          </Text>
        </View>
      </SafeAreaView>

    </>
  );
}
