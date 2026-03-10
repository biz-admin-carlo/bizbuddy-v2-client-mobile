// app/index.jsx

"use client";
import "react-native-reanimated";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  StatusBar,
  Modal,
  TouchableOpacity,
  Linking,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { VERSION } from "../config/constant";
import {
  compareVersions,
  getNativeAppVersion,
  getDefaultStoreUrl,
  getStoreUpdateInfo,
} from "../utils/versionCheck";

// TEMP (dev-only): force showing the "Update Available" modal on launch so you can verify UI.
// Set to false (or remove) after validation.
const FORCE_UPDATE_AVAILABLE_MODAL = false;
const FORCE_LATEST_VERSION = "1.0.7";

export default function Index() {
  const router = useRouter();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [deviceVersion, setDeviceVersion] = useState(null);
  const [latestVersion, setLatestVersion] = useState(null);
  const [storeUrl, setStoreUrl] = useState(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        const nativeVersion = getNativeAppVersion() || VERSION;
        setDeviceVersion(nativeVersion);

        if (FORCE_UPDATE_AVAILABLE_MODAL) {
          setLatestVersion(FORCE_LATEST_VERSION);
          setStoreUrl(null);
          setShowUpdateModal(true);
          return;
        }

        const storedVersion = await SecureStore.getItemAsync("appVersion");
        if (!storedVersion) {
          await SecureStore.setItemAsync("appVersion", VERSION);
        } else if (storedVersion !== VERSION) {
          // The app was updated. Persist the new version and continue.
          // (SecureStore persists across installs/updates, so a mismatch is expected.)
          await SecureStore.setItemAsync("appVersion", VERSION);
        }

        // Check store version (App Store / Google Play). Only show modal if store is newer.
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
          return;
        }

        // Add a slight delay for a smoother transition
        setTimeout(() => {
          router.replace("(auth)/signin");
        }, 1500);
      } catch (error) {
        console.error("Error during app initialization:", error);
        router.replace("(auth)/signin");
      }
    };

    initApp();
  }, [router]);

  const handleUpdate = () => {
    const fallbackUrl = getDefaultStoreUrl({
      appName: "BizBuddy",
      // Explicit IDs (matches app.json)
      iosAppId: "6742564608",
      iosListingUrl: "https://apps.apple.com/ph/app/bizbuddy-tks-payroll/id6742564608",
      iosBundleId: "com.bizsolutions.bizbuddy",
      androidPackageName: "com.bizsolutions.mybizbuddy",
    });
    Linking.openURL(storeUrl || fallbackUrl);
  };

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

          <Text className="text-xs mb-8 text-slate-600">
            Version {deviceVersion || VERSION}
          </Text>

          <ActivityIndicator size="large" color="#f97316" />
          <Text className="mt-4 text-slate-600">
            Preparing your workspace...
          </Text>
        </View>
      </SafeAreaView>

      {/* Update Modal */}
      <Modal visible={showUpdateModal} transparent={true} animationType="fade">
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
              A new version of BizBuddy is available with improved features and
              bug fixes.
            </Text>

            <View className="p-4 rounded-xl mb-6 bg-slate-50 border border-slate-100">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-slate-600">Current Version</Text>
                <Text className="font-semibold text-slate-800">
                  {deviceVersion}
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
