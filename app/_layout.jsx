// app/_layout.jsx
import React, { useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import {
  AppState,
  Image,
  Linking,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { VERSION } from "../config/constant";
import {
  compareVersions,
  getDefaultStoreUrl,
  getNativeAppVersion,
  getStoreUpdateInfo,
} from "../utils/versionCheck";
import "../global.css";

// Initialize Firebase
import "../utils/firebaseConfig";

export default function RootLayout() {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [deviceVersion, setDeviceVersion] = useState(getNativeAppVersion() || VERSION);
  const [latestVersion, setLatestVersion] = useState(null);
  const [storeUrl, setStoreUrl] = useState(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    const checkForUpdate = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const nativeVersion = getNativeAppVersion() || VERSION;
        setDeviceVersion(nativeVersion);

        const storeInfo = await getStoreUpdateInfo({
          iosAppId: "6742564608",
          iosBundleId: "com.bizsolutions.bizbuddy",
          androidPackageName: "com.bizsolutions.mybizbuddy",
        });
        const storeVersion = storeInfo?.storeVersion;

        if (storeVersion && compareVersions(storeVersion, nativeVersion) === 1) {
          setLatestVersion(storeVersion);
          setStoreUrl(storeInfo?.storeUrl || null);
          setShowUpdateModal(true);
        } else {
          setShowUpdateModal(false);
        }
      } catch {
        // Keep app usable if store check is temporarily unavailable.
      } finally {
        checkingRef.current = false;
      }
    };

    checkForUpdate();
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkForUpdate();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, []);

  const handleUpdate = () => {
    const fallbackUrl = getDefaultStoreUrl({
      appName: "BizBuddy",
      iosAppId: "6742564608",
      iosListingUrl: "https://apps.apple.com/ph/app/bizbuddy-tks-payroll/id6742564608",
      iosBundleId: "com.bizsolutions.bizbuddy",
      androidPackageName: "com.bizsolutions.mybizbuddy",
    });
    Linking.openURL(storeUrl || fallbackUrl);
  };

  return (
    <>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: "Biz University",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
            title: "Biz University",
          }}
        />
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
            title: "Biz University",
          }}
        />
      </Stack>

      <Modal visible={showUpdateModal} transparent animationType="fade">
        <View className="flex-1 justify-center items-center bg-black/60">
          <View className="w-11/12 max-w-md bg-white p-6 rounded-2xl shadow-lg">
            <View className="items-center mb-6">
              <Image
                source={require("../assets/images/icon.png")}
                style={{ width: 60, height: 60, borderRadius: 12 }}
                resizeMode="contain"
              />
            </View>

            <Text className="text-xl font-bold mb-3 text-center text-slate-800">
              Update Available
            </Text>

            <Text className="mb-6 text-center text-slate-600">
              A new version of BizBuddy is available with improved features and bug
              fixes.
            </Text>

            <View className="p-4 rounded-xl mb-6 bg-slate-50 border border-slate-100">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-slate-600">Current Version</Text>
                <Text className="font-semibold text-slate-800">
                  {deviceVersion || VERSION}
                </Text>
              </View>

              <View className="h-0.5 bg-slate-200 mb-3" />

              <View className="flex-row justify-between items-center">
                <Text className="text-slate-600">Latest Version</Text>
                <Text className="font-semibold text-orange-500">
                  {latestVersion || VERSION}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleUpdate}
              className="bg-orange-500 py-4 rounded-xl shadow-sm mb-3"
            >
              <Text className="text-white text-center font-semibold">
                Update Now
              </Text>
            </TouchableOpacity>

            <Text className="text-xs text-center text-slate-600">
              Please update to get the latest features and fixes
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
