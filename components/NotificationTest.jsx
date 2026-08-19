import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { NotificationService } from "../utils/notificationService";
import useAuthStore from "../store/useAuthStore";

export default function NotificationTest() {
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [expoToken, setExpoToken] = useState(null);
  const [fcmToken, setFcmToken] = useState(null);
  const { token } = useAuthStore();

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const permissionStatus = await NotificationService.getPermissionStatus();
    setPermissionStatus(permissionStatus.granted);
    console.log("Permission status:", permissionStatus);
  };

  const requestPermissions = async () => {
    console.log("🧪 Test component: Requesting permissions...");
    const result = await NotificationService.requestPermissions();
    console.log("🧪 Test component: Permission result:", result);

    if (result && result.granted) {
      setPermissionStatus(true);
      setExpoToken(result.expoToken);
      setFcmToken(result.fcmToken);

      // Send FCM token to backend if available
      if (result.fcmToken && token) {
        try {
          console.log("📤 Test: Sending FCM token to backend...");
          const backendResult =
            await NotificationService.sendDeviceTokenToBackend(
              result.fcmToken,
              token
            );
          if (backendResult.success) {
            console.log("✅ Test: FCM token sent to backend successfully");
            Alert.alert(
              "Success",
              "Notification permissions granted and token sent to backend!"
            );
          } else {
            console.error(
              "❌ Test: Failed to send FCM token to backend:",
              backendResult.error
            );
            Alert.alert(
              "Success",
              "Notification permissions granted, but failed to send token to backend."
            );
          }
        } catch (error) {
          console.error("❌ Test: Error sending FCM token to backend:", error);
          Alert.alert(
            "Success",
            "Notification permissions granted, but failed to send token to backend."
          );
        }
      } else {
        Alert.alert("Success", "Notification permissions granted!");
      }
    } else {
      Alert.alert(
        "Permission Denied",
        `Notification permissions were denied. Reason: ${
          result?.reason || "Unknown"
        }`
      );
    }
  };

  const sendTestNotification = async () => {
    if (!permissionStatus) {
      Alert.alert(
        "No Permission",
        "Please grant notification permissions first."
      );
      return;
    }

    await NotificationService.scheduleLocalNotification(
      "Test Notification",
      "This is a test notification from BizBuddy!",
      { type: "test" }
    );
    Alert.alert("Notification Sent", "Check your notification panel!");
  };

  const sendDelayedNotification = async () => {
    if (!permissionStatus) {
      Alert.alert(
        "No Permission",
        "Please grant notification permissions first."
      );
      return;
    }

    await NotificationService.scheduleDelayedNotification(
      "Delayed Notification",
      "This notification was scheduled 5 seconds ago!",
      5,
      { type: "delayed" }
    );
    Alert.alert(
      "Delayed Notification",
      "Notification will appear in 5 seconds!"
    );
  };

  const getFCMToken = async () => {
    try {
      const token = await NotificationService.getFCMToken();
      if (token) {
        setFcmToken(token);
        Alert.alert("FCM Token Retrieved", "Check the token below!");
      } else {
        Alert.alert("Error", "Could not retrieve FCM token");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to get FCM token");
    }
  };

  const sendTokenToBackend = async () => {
    console.log("🧪 sendTokenToBackend called");
    console.log("🧪 FCM Token:", fcmToken ? "Present" : "Missing");
    console.log("🧪 Auth Token:", token ? "Present" : "Missing");

    if (!fcmToken) {
      Alert.alert("No Token", "Please get FCM token first");
      return;
    }

    if (!token) {
      Alert.alert("No Auth Token", "Please log in first");
      return;
    }

    try {
      console.log("📤 Test: Manually sending FCM token to backend...");
      const result = await NotificationService.sendDeviceTokenToBackend(
        fcmToken,
        token
      );
      console.log("📤 Test: Backend result:", result);

      if (result.success) {
        Alert.alert("Success", "FCM token sent to backend successfully!");
      } else {
        Alert.alert("Error", `Failed to send token: ${result.error}`);
      }
    } catch (error) {
      console.error("❌ Test: Error sending token:", error);
      Alert.alert("Error", `Failed to send token: ${error.message}`);
    }
  };

  const testPostLoginSync = async () => {
    if (!token) {
      Alert.alert("No Auth Token", "Please log in first");
      return;
    }

    try {
      console.log("🧪 Test: Testing post-login token sync...");
      const result = await NotificationService.handlePostLoginTokenSync(token);
      console.log("🧪 Test: Post-login sync result:", result);

      if (result.success) {
        Alert.alert("Success", "FCM token synced to backend successfully!");
      } else {
        Alert.alert("Info", `Token sync result: ${result.reason}`);
      }
    } catch (error) {
      console.error("❌ Test: Error in post-login sync:", error);
      Alert.alert("Error", `Failed to sync token: ${error.message}`);
    }
  };

  const testBackendConnectivity = async () => {
    try {
      console.log("🧪 Test: Testing backend connectivity...");
      const result = await NotificationService.testBackendConnectivity();
      console.log("🧪 Test: Connectivity result:", result);

      if (result.success) {
        Alert.alert("Success", result.message);
      } else {
        Alert.alert("Connection Failed", result.message);
      }
    } catch (error) {
      console.error("❌ Test: Error testing connectivity:", error);
      Alert.alert("Error", `Failed to test connectivity: ${error.message}`);
    }
  };

  const testDeviceTokenEndpoints = async () => {
    if (!token) {
      Alert.alert("No Auth Token", "Please log in first");
      return;
    }

    try {
      console.log("🧪 Test: Testing device token endpoints...");
      const result = await NotificationService.testDeviceTokenEndpoints(token);
      console.log("🧪 Test: Endpoint test result:", result);

      if (result) {
        Alert.alert("Endpoint Found", `Working endpoint found: ${result}`);
      } else {
        Alert.alert(
          "No Endpoints Found",
          "No working device token endpoints found. Check console for details."
        );
      }
    } catch (error) {
      console.error("❌ Test: Error testing endpoints:", error);
      Alert.alert("Error", `Failed to test endpoints: ${error.message}`);
    }
  };

  const testCurrentPermissions = async () => {
    try {
      console.log("🧪 Test: Checking current notification permissions...");
      const status = await NotificationService.getPermissionStatus();
      console.log("🧪 Test: Current permission status:", status);

      Alert.alert(
        "Current Permission Status",
        `Status: ${status.status}\nGranted: ${status.granted}\nCan Ask Again: ${status.canAskAgain}`
      );
    } catch (error) {
      console.error("❌ Test: Error checking permissions:", error);
      Alert.alert("Error", `Failed to check permissions: ${error.message}`);
    }
  };

  const testDirectPermissionRequest = async () => {
    try {
      console.log("🧪 Test: Testing direct permission request...");

      // Import Notifications directly for testing
      const Notifications = require("expo-notifications");

      console.log("🧪 Test: Requesting permissions directly...");
      const result = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
        },
        android: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

      console.log("🧪 Test: Direct permission result:", result);
      console.log(
        "🧪 Test: Full result object:",
        JSON.stringify(result, null, 2)
      );

      // Check current status after request
      const currentStatus = await Notifications.getPermissionsAsync();
      console.log("🧪 Test: Current status after request:", currentStatus);

      Alert.alert(
        "Direct Permission Test",
        `Request Result:\nStatus: ${result.status}\nGranted: ${
          result.granted || false
        }\nCan Ask Again: ${result.canAskAgain || false}\n\nCurrent Status: ${
          currentStatus.status
        }`
      );
    } catch (error) {
      console.error("❌ Test: Error in direct permission request:", error);
      Alert.alert("Error", `Failed to request permissions: ${error.message}`);
    }
  };

  return (
    <View className="p-4 bg-white rounded-lg shadow-md m-4">
      <Text className="text-xl font-bold mb-4 text-center">
        Notification Test
      </Text>

      <View className="mb-4">
        <Text className="text-base font-semibold mb-2">Permission Status:</Text>
        <Text
          className={`text-sm ${
            permissionStatus ? "text-green-600" : "text-red-600"
          }`}
        >
          {permissionStatus === null
            ? "Checking..."
            : permissionStatus
            ? "Granted"
            : "Denied"}
        </Text>
      </View>

      {expoToken && (
        <View className="mb-4">
          <Text className="text-base font-semibold mb-2">Expo Push Token:</Text>
          <Text className="text-xs text-gray-600 break-all">{expoToken}</Text>
        </View>
      )}

      {fcmToken && (
        <View className="mb-4">
          <Text className="text-base font-semibold mb-2">FCM Token:</Text>
          <Text className="text-xs text-gray-600 break-all">{fcmToken}</Text>
        </View>
      )}

      <View className="space-y-2">
        {!permissionStatus && (
          <TouchableOpacity
            onPress={requestPermissions}
            className="bg-blue-500 py-3 px-4 rounded-lg"
          >
            <Text className="text-white text-center font-semibold">
              Request Notification Permissions
            </Text>
          </TouchableOpacity>
        )}

        {permissionStatus && (
          <>
            <TouchableOpacity
              onPress={sendTestNotification}
              className="bg-green-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Send Test Notification
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={sendDelayedNotification}
              className="bg-orange-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Send Delayed Notification (5s)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={getFCMToken}
              className="bg-purple-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Get FCM Token
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={sendTokenToBackend}
              className="bg-indigo-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Send Token to Backend
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={testPostLoginSync}
              className="bg-teal-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Test Post-Login Sync
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={testBackendConnectivity}
              className="bg-blue-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Test Backend Connectivity
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={testDeviceTokenEndpoints}
              className="bg-yellow-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Test Device Token Endpoints
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={checkPermissions}
              className="bg-gray-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Refresh Status
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={testCurrentPermissions}
              className="bg-purple-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Test Current Permissions
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={testDirectPermissionRequest}
              className="bg-red-500 py-3 px-4 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">
                Test Direct Permission Request
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
