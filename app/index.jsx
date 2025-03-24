// app/index.jsx

"use client";

import { useEffect, useState } from "react";
import { ActivityIndicator, View, Text, StatusBar, Modal, TouchableOpacity, Linking, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { VERSION } from "../config/constant";

export default function Index() {
  const router = useRouter();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [deviceVersion, setDeviceVersion] = useState(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        const storedVersion = await SecureStore.getItemAsync("appVersion");
        if (!storedVersion) {
          await SecureStore.setItemAsync("appVersion", VERSION);
        } else if (storedVersion !== VERSION) {
          setDeviceVersion(storedVersion);
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
    Linking.openURL("https://your-app-update-url.com");
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" translucent={false} animated={true} />
      <SafeAreaView className="flex-1 bg-white justify-center items-center px-6">
        <View className="items-center">
          <Image source={require("../assets/images/icon.png")} style={{ width: 100, height: 100, borderRadius: 20 }} resizeMode="contain" />

          <Text className="text-2xl font-bold mt-6 mb-2 text-slate-800">BizBuddy</Text>

          <Text className="text-center mb-2 text-slate-600">Your business companion</Text>

          <Text className="text-xs mb-8 text-slate-600">Version {VERSION}</Text>

          <ActivityIndicator size="large" color="#f97316" />
          <Text className="mt-4 text-slate-600">Preparing your workspace...</Text>
        </View>
      </SafeAreaView>

      {/* Update Modal */}
      <Modal visible={showUpdateModal} transparent={true} animationType="fade">
        <View className="flex-1 justify-center items-center bg-black/60">
          <View className="w-11/12 max-w-md bg-white p-6 rounded-2xl shadow-lg">
            <View className="items-center mb-6">
              <Image source={require("../assets/images/icon.png")} style={{ width: 60, height: 60, borderRadius: 12 }} resizeMode="contain" />
            </View>

            <Text className="text-xl font-bold mb-3 text-center text-slate-800">Update Required</Text>

            <Text className="mb-6 text-center text-slate-600">A new version of BizBuddy is available with improved features and bug fixes.</Text>

            <View className="p-4 rounded-xl mb-6 bg-slate-50 border border-slate-100">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-slate-600">Current Version</Text>
                <Text className="font-semibold text-slate-800">{deviceVersion}</Text>
              </View>

              <View className="h-0.5 bg-slate-200 mb-3" />

              <View className="flex-row justify-between items-center">
                <Text className="text-slate-600">Latest Version</Text>
                <Text className="font-semibold text-orange-500">{VERSION}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={handleUpdate} className="bg-orange-500 py-4 rounded-xl shadow-sm mb-3">
              <Text className="text-white text-center font-semibold">Update Now</Text>
            </TouchableOpacity>

            <Text className="text-xs text-center text-slate-600">This update is required to continue using the app</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
