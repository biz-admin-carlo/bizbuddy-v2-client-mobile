import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { API_BASE_URL } from "../config/constant";
import useAuthStore from "../store/useAuthStore";

// Ensure the Firebase "app" module is loaded before messaging is used.
// Without this, calling messaging() can throw:
// "No Firebase App '[DEFAULT]' has been created - call firebase.initializeApp()"
let firebaseApp = null;
if (Platform.OS !== "web") {
  try {
    firebaseApp = require("@react-native-firebase/app").default;
  } catch (error) {
    console.log("Firebase app not available:", error?.message);
  }
}

// Firebase messaging - only import on native platforms
let messaging = null;
if (Platform.OS !== "web") {
  try {
    messaging = require("@react-native-firebase/messaging").default;
  } catch (error) {
    console.log("Firebase messaging not available:", error.message);
  }
}

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NotificationService {
  static async requestPermissions() {
    try {
      console.log("🔔 NotificationService.requestPermissions() called");

      // Allow iOS simulator for debugging, but require a real device on other platforms
      if (!Device.isDevice && Platform.OS !== "ios") {
        console.log("❌ Must use physical device for Push Notifications");
        return { granted: false, reason: "Not a physical device" };
      }

      console.log("✅ Running on physical device");

      // Check current permission status
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      console.log("🔍 Current notification permission status:", existingStatus);
      console.log("🔍 Permission status details:", { status: existingStatus });

      // Ensure Android channel exists before requesting permissions (Android only)
      if (Platform.OS === "android") {
        try {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: true,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF231F7C",
          });
          console.log("✅ Android notification channel ensured");
        } catch (chErr) {
          console.log("⚠️ Could not ensure Android channel:", chErr?.message);
        }
      }

      let finalStatus = existingStatus;
      let permissionResult = null;

      // Only request permissions if not already granted
      if (existingStatus !== "granted") {
        console.log("📱 Requesting notification permissions from user...");
        console.log("📱 Calling Notifications.requestPermissionsAsync()...");
        console.log("📱 Request options:", {
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

        try {
          permissionResult = await Notifications.requestPermissionsAsync({
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

          console.log("📱 Permission request result:", permissionResult);
          console.log(
            "📱 Permission result details:",
            JSON.stringify(permissionResult, null, 2)
          );
          finalStatus = permissionResult.status;
          console.log(
            "👤 User response to notification permission request:",
            finalStatus
          );
          console.log("👤 Full permission result:", permissionResult);

          // Check if the result has a 'granted' property
          if (permissionResult.granted !== undefined) {
            console.log(
              "👤 Permission result.granted:",
              permissionResult.granted
            );
          }
        } catch (permissionError) {
          console.error("❌ Error requesting permissions:", permissionError);
          finalStatus = "denied";
        }
      } else {
        console.log("✅ Permissions already granted, skipping request");
      }

      console.log("🔍 Final permission status from request flow:", finalStatus);

      // Re-check current permission state after the request to avoid race conditions
      const latestPerm = await Notifications.getPermissionsAsync();
      console.log("🔍 Latest permission object after request:", latestPerm);

      // Determine granted flag robustly across platforms
      const grantedFlag =
        latestPerm?.granted === true || latestPerm?.status === "granted";

      if (!grantedFlag) {
        console.log(
          "❌ User denied notification permissions or status is not granted"
        );
        console.log("❌ Final status was:", finalStatus, permissionResult);
        return {
          granted: false,
          reason:
            typeof permissionResult?.status === "string"
              ? `User denied permissions (status: ${permissionResult.status})`
              : `User denied permissions (status: ${
                  latestPerm?.status ?? finalStatus
                })`,
        };
      }

      // Get the Expo push token
      const expoToken = await Notifications.getExpoPushTokenAsync({
        projectId: "45eef022-cbe4-482f-9b4b-8ab4d83697f3", // Your EAS project ID
      });

      // Get the FCM token
      let fcmToken = null;
      console.log("🔍 Checking Firebase messaging availability...");
      console.log(
        "🔍 Messaging object:",
        messaging ? "Available" : "Not available"
      );

      if (messaging) {
        try {
          // Helpful sanity check for initialization (native config should create the default app).
          const firebaseAppsCount = firebaseApp?.apps?.length ?? 0;
          console.log("🔍 Firebase apps count:", firebaseAppsCount);

          if (firebaseAppsCount === 0) {
            console.log(
              "❌ Firebase not initialized (no default app). Check GoogleService-Info.plist / google-services.json setup."
            );
            throw new Error("Firebase default app not initialized");
          }

          // iOS requires registering for remote messages before fetching a token.
          if (Platform.OS === "ios") {
            await messaging().registerDeviceForRemoteMessages();
          }

          console.log("🔍 Requesting FCM token...");
          fcmToken = await messaging().getToken();
          console.log("🔥 FCM Token retrieved:", fcmToken);
        } catch (fcmError) {
          console.log("❌ FCM Token not available:", fcmError.message);
        }
      } else {
        console.log("❌ Firebase messaging not available on this platform");
      }

      console.log("Expo Push Token:", expoToken.data);

      // Automatically send FCM token to backend if auth token is available
      if (fcmToken) {
        console.log(
          "🔄 FCM token received, attempting to auto-send to backend..."
        );
        await this.autoSendFCMTokenToBackend(fcmToken);
      }

      // Return tokens - backend sending will be handled by the calling component
      // since it needs the auth token
      return {
        granted: true,
        expoToken: expoToken.data,
        fcmToken: fcmToken,
      };
    } catch (error) {
      console.error("Error requesting notification permissions:", error);
      return false;
    }
  }

  static async scheduleLocalNotification(title, body, data = {}) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
        },
        trigger: null, // Send immediately
      });
    } catch (error) {
      console.error("Error scheduling notification:", error);
    }
  }

  static async scheduleDelayedNotification(
    title,
    body,
    delayInSeconds,
    data = {}
  ) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
        },
        trigger: {
          seconds: delayInSeconds,
        },
      });
    } catch (error) {
      console.error("Error scheduling delayed notification:", error);
    }
  }

  static async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error("Error canceling notifications:", error);
    }
  }

  static async getNotificationPermissions() {
    try {
      const perm = await Notifications.getPermissionsAsync();
      // On Android, granted may be true even if status !== 'granted' on older APIs
      return perm.granted === true || perm.status === "granted";
    } catch (error) {
      console.error("Error getting notification permissions:", error);
      return false;
    }
  }

  static async shouldRequestPermissions() {
    try {
      console.log("🔍 Checking if we should request permissions...");
      const perm = await Notifications.getPermissionsAsync();
      console.log("🔍 Current permission status:", perm);
      // If already granted, no need to request
      const shouldRequest = !(
        perm.granted === true || perm.status === "granted"
      );
      console.log("🔍 Should request permissions:", shouldRequest);
      return shouldRequest;
    } catch (error) {
      console.error("❌ Error checking notification permissions:", error);
      return true; // Default to requesting if we can't check
    }
  }

  static async getPermissionStatus() {
    try {
      const perm = await Notifications.getPermissionsAsync();
      return {
        status: perm.status,
        granted: perm.granted === true || perm.status === "granted",
        canAskAgain: perm.canAskAgain ?? perm.status === "undetermined",
        denied: perm.status === "denied",
      };
    } catch (error) {
      console.error("Error getting notification permission status:", error);
      return {
        status: "unknown",
        granted: false,
        canAskAgain: false,
        denied: false,
      };
    }
  }

  static async getFCMToken() {
    if (!messaging) {
      console.log("Firebase messaging not available on this platform");
      return null;
    }

    try {
      const fcmToken = await messaging().getToken();
      console.log("FCM Token:", fcmToken);
      return fcmToken;
    } catch (error) {
      console.error("Error getting FCM token:", error);
      return null;
    }
  }

  static addNotificationListener(listener) {
    return Notifications.addNotificationReceivedListener(listener);
  }

  static addNotificationResponseListener(listener) {
    return Notifications.addNotificationResponseReceivedListener(listener);
  }

  static removeNotificationListener(subscription) {
    if (subscription && typeof subscription.remove === 'function') {
      subscription.remove();
    }
  }

  static async sendDeviceTokenToBackend(deviceToken, authToken) {
    try {
      console.log("📤 sendDeviceTokenToBackend called");
      console.log("📤 Device token:", deviceToken);
      console.log("📤 Auth token:", authToken ? "Present" : "Missing");
      console.log(
        "📤 Auth token preview:",
        authToken ? `${authToken.substring(0, 20)}...` : "Missing"
      );

      console.log("📤 API_BASE_URL:", API_BASE_URL);
      console.log(
        "📤 Full API URL:",
        `${API_BASE_URL}/api/account/device-token`
      );

      // Extract userId from JWT token (no auth header needed)
      let userId = null;
      try {
        const parts = authToken.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          userId = payload.userId;
          console.log("📤 Extracted userId from token:", userId);
        }
      } catch (error) {
        console.error("❌ Error extracting userId from token:", error);
      }

      if (!userId) {
        console.log("❌ Could not extract userId from auth token");
        return {
          success: false,
          error: "Could not extract user ID from authentication token.",
        };
      }

      const requestBody = {
        userId: userId,
        deviceToken: deviceToken,
      };

      console.log("📤 Request body:", requestBody);
      console.log("📤 Headers:", {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      });

      const response = await fetch(`${API_BASE_URL}/api/account/device-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📤 Response status:", response.status);
      console.log("📤 Response headers:", response.headers);

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      console.log("📤 Content-Type:", contentType);

      let data;
      const textResponse = await response.text();
      console.log("📤 Raw response:", textResponse);

      if (contentType && contentType.includes("application/json")) {
        try {
          data = JSON.parse(textResponse);
        } catch (parseError) {
          console.error("❌ Error parsing JSON:", parseError);
          throw new Error(
            `Invalid JSON response from server (${
              response.status
            }): ${textResponse.substring(0, 200)}...`
          );
        }
      } else {
        // If not JSON, show what we got
        throw new Error(
          `Server returned non-JSON response (${
            response.status
          }): ${textResponse.substring(0, 200)}...`
        );
      }

      console.log("📤 Response data:", data);

      if (!response.ok) {
        console.error(
          "❌ Failed to send device token to backend:",
          data.message || `HTTP ${response.status}`
        );
        return {
          success: false,
          error: data.message || `HTTP ${response.status}`,
        };
      }

      console.log(
        "✅ Device token sent to backend successfully:",
        data.message
      );
      return { success: true, data: data.data };
    } catch (error) {
      console.error("❌ Error sending device token to backend:", error);
      console.error("❌ Error type:", error.constructor.name);
      console.error("❌ Error message:", error.message);

      // Handle specific network errors
      if (error.message === "Network request failed") {
        return {
          success: false,
          error:
            "Network connection failed. Please check your internet connection and ensure the server is running.",
        };
      }

      return { success: false, error: error.message };
    }
  }

  static async ensureTokenSentToBackend(authToken) {
    try {
      // Check if we have permissions
      const hasPermissions = await this.getNotificationPermissions();
      if (!hasPermissions) {
        console.log("🔔 No notification permissions, skipping token send");
        return { success: false, reason: "No permissions" };
      }

      // Get FCM token
      const fcmToken = await this.getFCMToken();
      if (!fcmToken) {
        console.log("🔔 No FCM token available, skipping token send");
        return { success: false, reason: "No FCM token" };
      }

      // Send to backend
      const result = await this.sendDeviceTokenToBackend(fcmToken, authToken);
      return result;
    } catch (error) {
      console.error("❌ Error ensuring token sent to backend:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Automatically sends FCM token to backend if auth token is available
   * This should be called whenever an FCM token is received
   */
  static async autoSendFCMTokenToBackend(fcmToken) {
    try {
      console.log(
        "🔄 autoSendFCMTokenToBackend called with FCM token:",
        fcmToken ? "Present" : "Missing"
      );

      if (!fcmToken) {
        console.log("❌ No FCM token provided to autoSendFCMTokenToBackend");
        return { success: false, reason: "No FCM token" };
      }

      // Get auth token from store
      const { token: authToken } = useAuthStore.getState();
      console.log(
        "🔍 Auth token from store:",
        authToken ? "Present" : "Missing"
      );

      if (!authToken) {
        console.log(
          "⏳ No auth token available yet, FCM token will be sent after login"
        );
        return { success: false, reason: "No auth token" };
      }

      // Send to backend
      console.log("📤 Auto-sending FCM token to backend...");
      const result = await this.sendDeviceTokenToBackend(fcmToken, authToken);

      if (result.success) {
        console.log("✅ FCM token automatically sent to backend successfully");
      } else {
        console.error(
          "❌ Failed to auto-send FCM token to backend:",
          result.error
        );
      }

      return result;
    } catch (error) {
      console.error("❌ Error in autoSendFCMTokenToBackend:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if JWT token is expired
   */
  static isTokenExpired(token) {
    try {
      if (!token) return true;
      const parts = token.split(".");
      if (parts.length !== 3) return true;
      JSON.parse(atob(parts[1]));
      return false;
    } catch (error) {
      console.error("❌ Error checking token:", error);
      return true;
    }
  }

  /**
   * Test different possible device token endpoints
   */
  static async testDeviceTokenEndpoints(authToken) {
    const possibleEndpoints = [
      "/api/account/device-token",
      "/api/device-token",
      "/api/user/device-token",
      "/api/account/device-tokens",
      "/api/notifications/device-token",
      "/api/push/device-token",
    ];

    console.log("🔍 Testing possible device token endpoints...");

    for (const endpoint of possibleEndpoints) {
      try {
        console.log(`🔍 Testing endpoint: ${endpoint}`);
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ deviceToken: "test" }),
        });

        console.log(`📤 ${endpoint} - Status: ${response.status}`);

        if (response.status !== 404) {
          console.log(`✅ Found working endpoint: ${endpoint}`);
          return endpoint;
        }
      } catch (error) {
        console.log(`❌ ${endpoint} - Error: ${error.message}`);
      }
    }

    console.log("❌ No working device token endpoint found");
    return null;
  }

  /**
   * Test network connectivity to the backend
   */
  static async testBackendConnectivity() {
    try {
      console.log("🔍 Testing backend connectivity...");
      console.log("🔍 API_BASE_URL:", API_BASE_URL);
      console.log("🔍 Health check URL:", `${API_BASE_URL}/api/health`);

      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("🔍 Health check response status:", response.status);

      if (response.ok) {
        console.log("✅ Backend connectivity test passed");
        return { success: true, message: "Backend is reachable" };
      } else {
        console.log("⚠️ Backend responded with status:", response.status);
        return {
          success: false,
          message: `Backend responded with status ${response.status}`,
        };
      }
    } catch (error) {
      console.error("❌ Backend connectivity test failed:", error);
      return { success: false, message: `Connection failed: ${error.message}` };
    }
  }

  /**
   * Called after successful login to ensure FCM token is sent to backend
   * This handles the case where permissions were already granted but token wasn't sent yet
   */
  static async handlePostLoginTokenSync(authToken) {
    try {
      console.log("🔄 handlePostLoginTokenSync called");

      if (!authToken) {
        console.log("❌ No auth token provided to handlePostLoginTokenSync");
        return { success: false, reason: "No auth token" };
      }

      // Check if we have permissions
      const hasPermissions = await this.getNotificationPermissions();
      if (!hasPermissions) {
        console.log("🔔 No notification permissions, skipping token sync");
        return { success: false, reason: "No permissions" };
      }

      // Try to get existing FCM token
      const fcmToken = await this.getFCMToken();
      if (!fcmToken) {
        console.log("🔔 No FCM token available, skipping token sync");
        return { success: false, reason: "No FCM token" };
      }

      // Send to backend
      console.log("📤 Syncing existing FCM token to backend after login...");
      const result = await this.sendDeviceTokenToBackend(fcmToken, authToken);

      if (result.success) {
        console.log("✅ FCM token synced to backend successfully after login");
      } else {
        console.error(
          "❌ Failed to sync FCM token to backend after login:",
          result.error
        );
      }

      return result;
    } catch (error) {
      console.error("❌ Error in handlePostLoginTokenSync:", error);
      return { success: false, error: error.message };
    }
  }
}
