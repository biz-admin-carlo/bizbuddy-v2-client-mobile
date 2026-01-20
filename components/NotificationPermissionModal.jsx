import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NotificationService } from "../utils/notificationService";
import useAuthStore from "../store/useAuthStore";

export default function NotificationPermissionModal({
  visible,
  onClose,
  onPermissionGranted,
}) {
  const [isRequesting, setIsRequesting] = useState(false);
  const { token } = useAuthStore();
  const [permStatus, setPermStatus] = useState(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await NotificationService.getPermissionStatus();
        setPermStatus(status);
        console.log("🔎 Modal: current permission status:", status);
      } catch (e) {
        console.log("Permission status check failed:", e?.message);
      }
    };
    if (visible) loadStatus();
  }, [visible]);

  const handleEnableNotifications = async () => {
    setIsRequesting(true);
    try {
      console.log("🔔 Modal: User wants to enable notifications");
      console.log(
        "🔔 Modal: Calling NotificationService.requestPermissions()..."
      );

      const result = await NotificationService.requestPermissions();
      console.log("🔔 Modal: Permission request result:", result);

      console.log(
        "🔍 Modal: Full result object:",
        JSON.stringify(result, null, 2)
      );

      if (result && result.granted) {
        console.log("✅ Modal: Notifications enabled successfully");

        // Send FCM token to backend if available
        console.log(
          "🔍 Modal: Checking if FCM token and auth token are available..."
        );
        console.log(
          "🔍 Modal: FCM token:",
          result.fcmToken ? "Present" : "Missing"
        );
        console.log("🔍 Modal: Auth token:", token ? "Present" : "Missing");

        if (result.fcmToken && token) {
          try {
            console.log("📤 Modal: Sending FCM token to backend...");
            const backendResult =
              await NotificationService.sendDeviceTokenToBackend(
                result.fcmToken,
                token
              );
            console.log("📤 Modal: Backend result:", backendResult);

            if (backendResult.success) {
              console.log("✅ Modal: FCM token sent to backend successfully");
            } else {
              console.error(
                "❌ Modal: Failed to send FCM token to backend:",
                backendResult.error
              );
            }
          } catch (error) {
            console.error(
              "❌ Modal: Error sending FCM token to backend:",
              error
            );
          }
        } else {
          console.log(
            "❌ Modal: Cannot send FCM token - missing FCM token or auth token"
          );
        }

        Alert.alert(
          "Notifications Enabled! 🔔",
          "You'll now receive important updates about your work schedule and breaks.",
          [{ text: "Great!", onPress: () => onPermissionGranted(result) }]
        );
      } else {
        console.log("❌ Modal: User denied notifications");
        Alert.alert(
          "Notifications Disabled",
          "You can enable notifications later in your device settings if you change your mind.",
          [{ text: "OK", onPress: onClose }]
        );
      }
    } catch (error) {
      console.error("❌ Modal: Error requesting permissions:", error);
      Alert.alert(
        "Error",
        "There was an issue enabling notifications. Please try again later.",
        [{ text: "OK", onPress: onClose }]
      );
    } finally {
      setIsRequesting(false);
    }
  };

  const handleNotNow = () => {
    console.log("⏭️ Modal: User chose 'Not Now'");
    onClose();
  };

  const openAppSettings = async () => {
    try {
      const { Linking } = require("react-native");
      await Linking.openSettings();
    } catch (e) {
      console.log("Could not open settings:", e.message);
    }
  };

  const refreshStatus = async () => {
    try {
      const status = await NotificationService.getPermissionStatus();
      setPermStatus(status);
      console.log("🔁 Modal: refreshed permission status:", status);
      if (status?.granted) {
        // Proceed to token retrieval flow
        try {
          const result = await NotificationService.requestPermissions();
          if (result?.granted) {
            Alert.alert(
              "Notifications Enabled! 🔔",
              "You'll now receive important updates about your work schedule and breaks.",
              [{ text: "Great!", onPress: () => onPermissionGranted(result) }]
            );
          }
        } catch (e) {
          console.log("Post-settings enable flow failed:", e?.message);
        }
      }
    } catch (e) {
      console.log("Permission refresh failed:", e?.message);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          {/* Header */}
          <View className="items-center mb-6">
            <View className="bg-orange-100 p-4 rounded-full mb-4">
              <Ionicons name="notifications" size={32} color="#f97316" />
            </View>
            <Text className="text-xl font-bold text-gray-900 text-center">
              Enable Notifications
            </Text>
            <Text className="text-gray-600 text-center mt-2 text-sm">
              Stay updated with your work schedule
            </Text>
          </View>

          {/* Benefits */}
          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <Ionicons name="time" size={20} color="#10b981" />
              <Text className="text-gray-700 ml-3 text-sm">
                Break time reminders
              </Text>
            </View>
            <View className="flex-row items-center mb-3">
              <Ionicons name="calendar" size={20} color="#10b981" />
              <Text className="text-gray-700 ml-3 text-sm">
                Shift schedule updates
              </Text>
            </View>
            <View className="flex-row items-center mb-3">
              <Ionicons name="information-circle" size={20} color="#10b981" />
              <Text className="text-gray-700 ml-3 text-sm">
                Important announcements
              </Text>
            </View>
          </View>

          {/* Buttons */}
          <View className="space-y-3">
            {Platform.OS === "android" && !permStatus?.granted ? (
              <>
                <TouchableOpacity
                  onPress={openAppSettings}
                  disabled={isRequesting}
                  className="bg-orange-500 py-4 rounded-xl flex-row items-center justify-center"
                >
                  {isRequesting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="settings-outline"
                        size={20}
                        color="#fff"
                      />
                      <Text className="text-white font-semibold ml-2">
                        Enable in Settings
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={refreshStatus}
                  disabled={isRequesting}
                  className="py-4 rounded-xl border border-gray-300"
                >
                  <Text className="text-gray-600 text-center font-medium">
                    Done, check again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleNotNow}
                  disabled={isRequesting}
                  className="py-4 rounded-xl border border-gray-300"
                >
                  <Text className="text-gray-600 text-center font-medium">
                    Not Now
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={handleEnableNotifications}
                  disabled={isRequesting}
                  className="bg-orange-500 py-4 rounded-xl flex-row items-center justify-center"
                >
                  {isRequesting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="notifications" size={20} color="#fff" />
                      <Text className="text-white font-semibold ml-2">
                        Enable Notifications
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={openAppSettings}
                  disabled={isRequesting}
                  className="py-4 rounded-xl border border-gray-300"
                >
                  <Text className="text-gray-600 text-center font-medium">
                    Open Settings
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleNotNow}
                  disabled={isRequesting}
                  className="py-4 rounded-xl border border-gray-300"
                >
                  <Text className="text-gray-600 text-center font-medium">
                    Not Now
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Privacy Note */}
          <Text className="text-xs text-gray-500 text-center mt-4">
            You can change this setting anytime in your device settings
          </Text>
        </View>
      </View>
    </Modal>
  );
}
