import { Platform } from "react-native";

// Firebase configuration for react-native-firebase (messaging only)
// react-native-firebase auto-initializes with GoogleService-Info.plist
// No manual initialization needed - just ensure the app module is available

if (Platform.OS !== "web") {
  try {
    // Import Firebase app module to ensure it's initialized
    require("@react-native-firebase/app");
    console.log("Firebase app ready for messaging");
  } catch (error) {
    console.error("Firebase initialization error:", error);
  }
}
