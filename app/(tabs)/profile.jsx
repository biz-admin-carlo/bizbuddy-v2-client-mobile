// app/(tabs)/profile.jsx

"use client";

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import useAuthStore from "../../store/useAuthStore";
import usePresenceStore from "../../store/presenceStore";
import { API_BASE_URL } from "../../config/constant";
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
  Feather,
} from "@expo/vector-icons";
import { getInstallationId } from "../../utils/deviceId";
import { NotificationService } from "../../utils/notificationService";
import NotificationPermissionModal from "../../components/NotificationPermissionModal";
import { useNotificationPermission } from "../../hooks/useNotificationPermission";
import { useNotifications } from "../../hooks/useNotifications";
import { getTokenCompanyId, getTokenUserId } from "../../utils/jwtTokenUtils";
import { upsertAccountDirectoryEntry } from "../../utils/accountDirectory";
import AccountSwitcherSheet from "../../components/AccountSwitcherSheet";
import useTutorialStore from "../../store/tutorialStore";

const { height } = Dimensions.get("window");

/** Prefer SecureStore so API calls match the token written by `login` (avoids stale Zustand vs disk). */
const resolveAuthToken = async () => {
  const stored = await SecureStore.getItemAsync("token");
  return stored || useAuthStore.getState().token;
};

const formatAwayDuration = (lastActiveAt, status) => {
  if (status !== "away" || !lastActiveAt) return "";
  const lastActive = new Date(lastActiveAt);
  const now = new Date();
  const diffMs = now - lastActive;
  const diffMinutes = diffMs / 60000;
  if (diffMinutes < 60) {
    return `${Math.floor(diffMinutes)} minutes ago`;
  }
  const diffHours = diffMinutes / 60;
  if (diffHours < 24) {
    return `${Math.floor(diffHours)} hours ago`;
  }
  return `Last active at ${lastActive.toLocaleString()}`;
};

const getStatusColor = (status) => {
  switch (status) {
    case "available":
      return "#0d9488";
    case "away":
      return "#f59e0b";
    case "offline":
      return "#94a3b8";
    default:
      return "#94a3b8";
  }
};

const Profile = () => {
  const { token, logout, forceLogout } = useAuthStore();
  const { presenceStatus, lastActiveAt } = usePresenceStore();
  const router = useRouter();
  const { showModal, closeModal, openModal } = useNotificationPermission();
  const { unreadCount } = useNotifications();
  const tutorialSeen = useTutorialStore((s) => s.seen);
  const tutorialVisible = useTutorialStore((s) => s.visible);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  // State for modals
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPassModalVisible, setIsPassModalVisible] = useState(false);
  const [isSignOutModalVisible, setIsSignOutModalVisible] = useState(false);
  const [isAccountSwitcherVisible, setIsAccountSwitcherVisible] = useState(false);

  // Form fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [logoutFromOtherDevices, setLogoutFromOtherDevices] = useState(false);

  // Updating states / errors
  const [passUpdating, setPassUpdating] = useState(false);
  const [passError, setPassError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  // Basic animations for page load
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Individual button animations
  const editButtonScale = useRef(new Animated.Value(1)).current;
  const passButtonScale = useRef(new Animated.Value(1)).current;

  const signOutButtonScale = useRef(new Animated.Value(1)).current;
  const saveButtonScale = useRef(new Animated.Value(1)).current;
  const updatePassButtonScale = useRef(new Animated.Value(1)).current;
  const confirmSignOutButtonScale = useRef(new Animated.Value(1)).current;

  // Modals: translation from bottom + background fade
  const editModalAnim = useRef(new Animated.Value(height)).current;
  const passModalAnim = useRef(new Animated.Value(height)).current;
  const signOutModalAnim = useRef(new Animated.Value(height)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;

  // PanResponder for each modal
  const editPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          editModalAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeEditModal();
        } else {
          Animated.spring(editModalAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const passPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          passModalAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closePassModal();
        } else {
          Animated.spring(passModalAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const signOutPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          signOutModalAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeSignOutModal();
        } else {
          Animated.spring(signOutModalAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!token) {
      setProfile(null);
      setLoading(false);
      return;
    }
    fetchProfile();
  }, [token]);

  // Show notification modal when profile loads (after login)
  useEffect(() => {
    if (!token) return;
    // Never show the notification-permission Modal while the first-run tutorial
    // Modal hasn't been dismissed yet — two simultaneous RN <Modal>s make the
    // whole screen untouchable. `seen` is null until hydrated and false until the
    // user skips/completes the tour, so this naturally waits out that window too.
    if (tutorialSeen !== true || tutorialVisible) return;

    const showNotificationModal = async () => {
      try {
        console.log(
          "🔔 Profile: Checking if we should show notification modal..."
        );
        const shouldRequest =
          await NotificationService.shouldRequestPermissions();
        console.log("🔔 Profile: Should request permissions:", shouldRequest);

        if (shouldRequest) {
          console.log("🔔 Profile: Showing notification permission modal...");
          openModal();
        } else {
          console.log(
            "✅ Profile: Notification permissions already granted, syncing token..."
          );
          // Try to sync existing FCM token to backend
          const result = await NotificationService.handlePostLoginTokenSync(
            token
          );
          if (result.success) {
            console.log("✅ Profile: FCM token synced successfully");
          } else {
            console.log("ℹ️ Profile: FCM token not synced:", result.reason);
          }
        }
      } catch (error) {
        console.error(
          "❌ Profile: Error checking notification permissions:",
          error
        );
      }
    };

    // Small delay to ensure profile is loaded
    const timerId = setTimeout(showNotificationModal, 1000);
    return () => clearTimeout(timerId);
  }, [token, tutorialSeen, tutorialVisible]);

  const openEditModal = () => {
    // Prefill data
    if (profile?.user && profile?.profile) {
      setUsername(profile.user.username || "");
      setEmail(profile.user.email || "");
      setFirstName(profile.profile.firstName || "");
      setLastName(profile.profile.lastName || "");
      setPhoneNumber(profile.profile.phoneNumber || "");
    }

    setIsEditModalVisible(true);
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(editModalAnim, {
        toValue: 0,
        tension: 70,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeEditModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(editModalAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsEditModalVisible(false);
    });
  };

  const openPassModal = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPassError("");
    setIsPassModalVisible(true);

    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(passModalAnim, {
        toValue: 0,
        tension: 70,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closePassModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(passModalAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsPassModalVisible(false);
      // Reset form fields
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setLogoutFromOtherDevices(false);
      setPassError("");
    });
  };

  const openSignOutModal = () => {
    setIsSignOutModalVisible(true);
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(signOutModalAnim, {
        toValue: 0,
        tension: 70,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSignOutModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(signOutModalAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsSignOutModalVisible(false);
    });
  };

  // Enhanced button animation with better bounce
  const animateButtonPress = (buttonRef) => {
    Animated.sequence([
      Animated.timing(buttonRef, {
        toValue: 0.92,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(buttonRef, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const currentToken = await resolveAuthToken();
      if (!currentToken) {
        Alert.alert("Session expired", "Please sign in again.");
        router.replace("(auth)/signin");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const data = await response.json();
      if (response.ok && data.data?.user && data.data?.profile) {
        setProfile(data.data);
        const userId = getTokenUserId(currentToken);
        const companyId = getTokenCompanyId(currentToken);
        if (userId && companyId) {
          upsertAccountDirectoryEntry({
            userId,
            companyId,
            email: data.data.user?.email,
            firstName: data.data.profile?.firstName,
            lastName: data.data.profile?.lastName,
            companyName: data.data.company?.name,
            role: data.data.user?.role,
          });
        }
      } else if (response.ok) {
        setProfile(null);
        Alert.alert(
          "Error",
          "Your profile could not be loaded (unexpected response). Please try again or sign in with your password.",
        );
      } else {
        Alert.alert("Error", data.message || "Failed to fetch profile.");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred while fetching your profile."
      );
    } finally {
      setLoading(false);
    }
  };

  const updatePresenceToOffline = async () => {
    const currentToken = await resolveAuthToken();
    if (!currentToken) return;
    try {
      await fetch(`${API_BASE_URL}/api/presence`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          presenceStatus: "offline",
          lastActiveAt: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("Error updating presence to offline:", error);
    }
  };

  const handleUpdateProfile = async () => {
    animateButtonPress(saveButtonScale);
    setUpdating(true);
    setUpdateError("");
    try {
      const currentToken = await resolveAuthToken();
      if (!currentToken) {
        Alert.alert("Session expired", "Please sign in again.");
        router.replace("(auth)/signin");
        return;
      }
      const payload = { username, email, firstName, lastName, phoneNumber };
      const response = await fetch(`${API_BASE_URL}/api/account/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success", "Profile updated successfully.", [
          {
            text: "OK",
            onPress: () => {
              closeEditModal();
              fetchProfile();
            },
          },
        ]);
      } else {
        setUpdateError(data.message || "Failed to update profile.");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      setUpdateError("An unexpected error occurred while updating profile.");
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    animateButtonPress(updatePassButtonScale);
    setPassUpdating(true);
    setPassError("");
    try {
      const currentToken = await resolveAuthToken();
      if (!currentToken) {
        Alert.alert("Session expired", "Please sign in again.");
        router.replace("(auth)/signin");
        return;
      }
      const payload = { 
        oldPassword, 
        newPassword, 
        confirmPassword,
        logoutFromOtherDevices 
      };
      const response = await fetch(
        `${API_BASE_URL}/api/account/change-password`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success", "Password changed successfully.", [
          {
            text: "OK",
            onPress: async () => {
              // Force clear token and biometric access - user must sign in again with new password
              await forceLogout();
              router.replace("(auth)/signin");
            },
          },
        ]);
      } else {
        setPassError(data.message || "Failed to change password.");
      }
    } catch (error) {
      console.error("Error changing password:", error);
      setPassError("An unexpected error occurred while changing password.");
    } finally {
      setPassUpdating(false);
    }
  };

  const handleSignOut = async () => {
    animateButtonPress(confirmSignOutButtonScale);
    setSigningOut(true);
    try {
      await updatePresenceToOffline();
      const currentToken = await resolveAuthToken();
      const deviceId = await getInstallationId();
      const response = await fetch(`${API_BASE_URL}/api/account/sign-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ deviceId }),
      });
      if (response.ok) {
        await logout();
        router.replace("(auth)/signin");
      } else {
        const data = await response.json();
        Alert.alert("Error", data.message || "Failed to sign out.");
      }
    } catch (error) {
      console.error("Sign-out error:", error);
      Alert.alert("Error", "An error occurred during sign out.");
    } finally {
      setSigningOut(false);
      closeSignOutModal();
    }
  };

  const getInitials = () => {
    if (!profile || !profile.profile) return "?";
    const first = profile.profile.firstName
      ? profile.profile.firstName.charAt(0)
      : "";
    const last = profile.profile.lastName
      ? profile.profile.lastName.charAt(0)
      : "";
    return (first + last).toUpperCase();
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#f97316" />
          <Text className="mt-3 text-slate-600 font-medium">
            Loading profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ position: "relative" }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="px-5 py-6">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-slate-700">
                My Profile
              </Text>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={() => router.push("/(tabs)/notifications")}
                  className="w-10 h-10 rounded-full items-center justify-center relative"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                    elevation: 2,
                  }}
                >
                  <Ionicons name="notifications-outline" size={18} color="#f97316" />
                  {unreadCount > 0 && (
                    <View
                      className="absolute -top-1 -right-1 bg-red-500 rounded-full items-center justify-center border-2 border-white"
                      style={{
                        minWidth: 18,
                        height: 18,
                        paddingHorizontal: unreadCount > 9 ? 4 : 0,
                      }}
                    >
                      <Text className="text-white text-xs font-bold" style={{ fontSize: 10 }}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={fetchProfile}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                    elevation: 2,
                  }}
                >
                  <Feather name="refresh-cw" size={18} color="#f97316" />
                </TouchableOpacity>
              </View>
            </View>

            {profile && profile.user && profile.profile ? (
              <>
                {/* Profile Card */}
                <View
                  className="bg-white rounded-xl border border-slate-200 p-5 mb-6"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4.65,
                    elevation: 6,
                  }}
                >
                  <View className="flex-row items-center mb-1">
                    <TouchableOpacity
                      onPress={() => setIsAccountSwitcherVisible(true)}
                      activeOpacity={0.8}
                      className="mr-4"
                    >
                      <View className="w-[70px] h-[70px] rounded-full bg-orange-400 items-center justify-center">
                        <Text className="text-white text-2xl font-bold">
                          {getInitials()}
                        </Text>
                      </View>
                      <View
                        className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-white items-center justify-center border border-slate-200"
                        style={{
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.1,
                          shadowRadius: 2,
                          elevation: 3,
                        }}
                      >
                        <Ionicons name="swap-horizontal" size={13} color="#f97316" />
                      </View>
                    </TouchableOpacity>
                    <View className="flex-1">
                      <Text className="text-xl font-bold text-slate-700">
                        {profile.profile.firstName} {profile.profile.lastName}
                      </Text>
                      <Text className="text-slate-600 text-base">
                        @{profile.user.username}
                      </Text>

                      <View className="flex-row items-center mt-2">
                        <View
                          className={`px-3 py-1 rounded-full flex-row items-center ${
                            presenceStatus === "available"
                              ? "bg-teal-500/20"
                              : "bg-orange-400/20"
                          }`}
                        >
                          <View
                            className="w-2 h-2 rounded-full mr-2"
                            style={{
                              backgroundColor: getStatusColor(presenceStatus),
                            }}
                          />
                          <Text
                            className={`${
                              presenceStatus === "available"
                                ? "text-teal-500"
                                : "text-orange-400"
                            } text-xs font-bold`}
                          >
                            {presenceStatus
                              ? presenceStatus.toUpperCase()
                              : "Offline"}
                          </Text>
                        </View>
                        {presenceStatus === "away" && lastActiveAt && (
                          <Text className="text-slate-600 text-sm italic ml-2">
                            {formatAwayDuration(lastActiveAt, presenceStatus)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  <View className="h-px bg-slate-100 my-4" />

                  {/* Contact Info */}
                  <View>
                    <View className="flex-row items-center mb-4">
                      <View className="w-10 h-10 rounded-md bg-orange-50 items-center justify-center mr-3">
                        <MaterialCommunityIcons
                          name="email-outline"
                          size={20}
                          color="#f97316"
                        />
                      </View>
                      <View>
                        <Text className="text-slate-600 text-xs font-medium mb-1">
                          Email
                        </Text>
                        <Text className="text-slate-600 font-medium">
                          {profile.user.email}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center mb-4">
                      <View className="w-10 h-10 rounded-md bg-orange-50 items-center justify-center mr-3">
                        <MaterialCommunityIcons
                          name="phone-outline"
                          size={20}
                          color="#f97316"
                        />
                      </View>
                      <View>
                        <Text className="text-slate-600 text-xs font-medium mb-1">
                          Phone
                        </Text>
                        <Text className="text-slate-600 font-medium">
                          {profile.profile.phoneNumber || "Not provided"}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-md bg-orange-50 items-center justify-center mr-3">
                        <FontAwesome5
                          name="building"
                          size={18}
                          color="#f97316"
                        />
                      </View>
                      <View>
                        <Text className="text-slate-600 text-xs font-medium mb-1">
                          Company
                        </Text>
                        <Text className="text-slate-600 font-medium">
                          {profile.company && profile.company.name
                            ? profile.company.name
                            : "Not assigned"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                <View className="mt-4">
                  <Animated.View
                    style={{ transform: [{ scale: editButtonScale }] }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        animateButtonPress(editButtonScale);
                        setTimeout(openEditModal, 100);
                      }}
                      className="flex-row items-center bg-white border border-slate-200 rounded-lg p-4 mb-4"
                      style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.05,
                        shadowRadius: 3,
                        elevation: 2,
                      }}
                      activeOpacity={0.8}
                    >
                      <View className="w-10 h-10 rounded-lg bg-orange-400 items-center justify-center mr-3">
                        <Feather name="edit-2" size={18} color="#ffff" />
                      </View>
                      <Text className="text-slate-600 font-semibold text-medium tracking-wider flex-1">
                        Update Profile
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#9ca3af"
                      />
                    </TouchableOpacity>
                  </Animated.View>

                  <Animated.View
                    style={{ transform: [{ scale: passButtonScale }] }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        animateButtonPress(passButtonScale);
                        setTimeout(openPassModal, 100);
                      }}
                      className="flex-row items-center bg-white border border-slate-200 rounded-lg p-4 mb-4"
                      style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.05,
                        shadowRadius: 3,
                        elevation: 2,
                      }}
                      activeOpacity={0.8}
                    >
                      <View className="w-10 h-10 rounded-lg bg-orange-400 items-center justify-center mr-3">
                        <Feather name="lock" size={18} color="#ffff" />
                      </View>
                      <Text className="text-slate-600 font-semibold text-medium tracking-wider flex-1">
                        Change Password
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#9ca3af"
                      />
                    </TouchableOpacity>
                  </Animated.View>

                  <Animated.View
                    style={{ transform: [{ scale: signOutButtonScale }] }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        animateButtonPress(signOutButtonScale);
                        setTimeout(openSignOutModal, 100);
                      }}
                      className="flex-row items-center bg-white border border-slate-200 rounded-lg p-4"
                      style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.05,
                        shadowRadius: 3,
                        elevation: 2,
                      }}
                      activeOpacity={0.8}
                    >
                      <View className="w-10 h-10 rounded-lg bg-orange-400 items-center justify-center mr-3">
                        <Feather name="log-out" size={18} color="#ffff" />
                      </View>
                      <Text className="text-slate-600 font-semibold text-medium tracking-wider flex-1">
                        Sign Out
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#9ca3af"
                      />
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </>
            ) : (
              <View className="items-center justify-center py-10">
                <Feather name="user-x" size={60} color="#d1d5db" />
                <Text className="text-slate-700 text-lg font-bold mt-4">
                  No profile data available
                </Text>
                <Text className="text-slate-600 text-center mt-2">
                  We couldn't load your profile information
                </Text>
                <TouchableOpacity
                  onPress={fetchProfile}
                  className="bg-orange-400 py-3 px-6 rounded-lg mt-6"
                  activeOpacity={0.8}
                >
                  <Text className="text-white font-bold">Try Again</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {/* BizBuddy AI chat — future feature; re-enable with Tabs.Screen in (tabs)/_layout.jsx */}
      {/*
      <TouchableOpacity
        onPress={() => router.push("/(tabs)/ai-chats")}
        activeOpacity={0.85}
        className="absolute right-5 items-center justify-center bg-orange-400 rounded-full"
        style={{
          bottom: Platform.OS === "ios" ? 38 : 26,
          width: 62,
          height: 62,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.55)",
          shadowColor: "#fb923c",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.65,
          shadowRadius: 14,
          elevation: 12,
        }}
      >
        <Ionicons name="chatbubbles-outline" size={24} color="#ffffff" />
      </TouchableOpacity>
      */}

      {/* 
        --------------------------------------------------------
        EDIT PROFILE MODAL
        --------------------------------------------------------
      */}
      {isEditModalVisible && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0, 0, 0, 0.5)", opacity: modalBgAnim },
            ]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={closeEditModal}
            />
          </Animated.View>

          <Animated.View
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
            style={{
              transform: [{ translateY: editModalAnim }],
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "white",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              minHeight: height * 0.7,
              maxHeight: Platform.OS === "ios" ? height * 0.7 : height * 0.85,
              paddingBottom: Platform.OS === "ios" ? 0 : 20,
            }}
          >
            <View
              className="items-center py-3"
              {...editPanResponder.panHandlers}
            >
              <View className="w-10 h-1 bg-slate-200 rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
              <Text className="text-lg font-bold text-slate-700">
                Update Profile
              </Text>
            </View>

            <ScrollView className="px-5 py-4">
              {updateError ? (
                <View className="p-4 bg-red-50 border border-red-200 rounded-lg mb-5">
                  <Text className="text-red-600 font-medium">
                    {updateError}
                  </Text>
                </View>
              ) : null}

              <Text className="text-sm font-semibold text-slate-600 mb-2">
                Username
              </Text>
              <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-3 mb-4">
                <Feather name="user" size={18} color="#9ca3af" />
                <TextInput
                  className="flex-1 ml-2 text-slate-700"
                  value={username}
                  onChangeText={setUsername}
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <Text className="text-sm font-semibold text-slate-600 mb-2">
                Email
              </Text>
              <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-3 mb-4">
                <MaterialCommunityIcons
                  name="email-outline"
                  size={18}
                  color="#9ca3af"
                />
                <TextInput
                  className="flex-1 ml-2 text-slate-700"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <Text className="text-sm font-semibold text-slate-600 mb-2">
                First Name
              </Text>
              <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-3 mb-4">
                <Feather name="user" size={18} color="#9ca3af" />
                <TextInput
                  className="flex-1 ml-2 text-slate-700"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <Text className="text-sm font-semibold text-slate-600 mb-2">
                Last Name
              </Text>
              <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-3 mb-4">
                <Feather name="user" size={18} color="#9ca3af" />
                <TextInput
                  className="flex-1 ml-2 text-slate-700"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <Text className="text-sm font-semibold text-slate-600 mb-2">
                Phone Number
              </Text>
              <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-3 mb-4">
                <MaterialCommunityIcons
                  name="phone-outline"
                  size={18}
                  color="#9ca3af"
                />
                <TextInput
                  className="flex-1 ml-2 text-slate-700"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View className="flex-row justify-end mt-4">
                {updating ? (
                  <ActivityIndicator size="small" color="#f97316" />
                ) : (
                  <View className="flex-col w-full ">
                    <Animated.View
                      style={{ transform: [{ scale: saveButtonScale }] }}
                    >
                      <TouchableOpacity
                        onPress={handleUpdateProfile}
                        className="bg-orange-400 py-4 rounded-lg w-full items-center mb-3"
                        activeOpacity={0.8}
                      >
                        <Text className="text-white font-semibold text-center">
                          Save Changes
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>
                    <TouchableOpacity
                      onPress={closeEditModal}
                      className="border-slate-200 border py-3.5 rounded-lg w-full items-center mb-1 "
                      activeOpacity={0.8}
                    >
                      <Text className="text-slate-700 font-semibold text-center">
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      )}

      {/* 
        --------------------------------------------------------
        CHANGE PASSWORD MODAL
        --------------------------------------------------------
      */}
      {isPassModalVisible && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0, 0, 0, 0.5)", opacity: modalBgAnim },
            ]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={closePassModal}
            />
          </Animated.View>

          <Animated.View
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
            style={{
              transform: [{ translateY: passModalAnim }],
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "white",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              minHeight: height * 0.7,
              maxHeight: Platform.OS === "ios" ? height * 0.7 : height * 0.85,
              paddingBottom: Platform.OS === "ios" ? 0 : 20,
            }}
          >
            <View
              className="items-center py-3"
              {...passPanResponder.panHandlers}
            >
              <View className="w-10 h-1 bg-slate-200 rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
              <Text className="text-lg font-bold text-slate-700">
                Change Password
              </Text>
            </View>

            <ScrollView className="px-5 py-4">
              {passError ? (
                <View className="p-4 bg-red-50 border border-red-200 rounded-lg mb-5">
                  <Text className="text-red-600 font-medium">{passError}</Text>
                </View>
              ) : null}

              <Text className="text-sm font-semibold text-slate-600 mb-2">
                Current Password
              </Text>
              <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-3 mb-4">
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={18}
                  color="#9ca3af"
                />
                <TextInput
                  secureTextEntry
                  className="flex-1 ml-2 text-slate-700"
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <Text className="text-sm font-semibold text-slate-600 mb-2">
                New Password
              </Text>
              <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-3 mb-4">
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={18}
                  color="#9ca3af"
                />
                <TextInput
                  secureTextEntry
                  className="flex-1 ml-2 text-slate-700"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <Text className="text-sm font-semibold text-slate-600 mb-2">
                Confirm New Password
              </Text>
              <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-3 mb-4">
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={18}
                  color="#9ca3af"
                />
                <TextInput
                  secureTextEntry
                  className="flex-1 ml-2 text-slate-700"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholderTextColor="#9ca3af"
                />
              </View>

              {/* Logout from other devices checkbox */}
              <View className="flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-4 mb-4">
                <View className="flex-1 mr-3">
                  <Text className="text-sm font-semibold text-slate-700 mb-1">
                    Logout from other devices
                  </Text>
                  <Text className="text-xs text-slate-500">
                    Sign out from all other devices when password is changed
                  </Text>
                </View>
                <Switch
                  value={logoutFromOtherDevices}
                  onValueChange={setLogoutFromOtherDevices}
                  trackColor={{ false: "#d1d5db", true: "#fdba74" }}
                  thumbColor={logoutFromOtherDevices ? "#f97316" : "#ffffff"}
                  ios_backgroundColor="#d1d5db"
                />
              </View>

              <View className="flex-row justify-end mt-4">
                {passUpdating ? (
                  <ActivityIndicator size="small" color="#f97316" />
                ) : (
                  <View className="w-full">
                    <Animated.View
                      style={{ transform: [{ scale: updatePassButtonScale }] }}
                    >
                      <TouchableOpacity
                        onPress={handleChangePassword}
                        className="bg-orange-400 py-4 rounded-lg w-full items-center mb-3"
                        activeOpacity={0.8}
                      >
                        <Text className="text-white font-semibold">
                          Change Password
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>
                    <TouchableOpacity
                      onPress={closePassModal}
                      className="border-slate-200 border py-3.5 rounded-lg w-full items-center mb-3"
                      activeOpacity={0.8}
                    >
                      <Text className="text-slate-600 font-semibold  text-lg">
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      )}

      {/* 
        --------------------------------------------------------
        SIGN OUT CONFIRMATION MODAL
        --------------------------------------------------------
      */}
      {isSignOutModalVisible && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0, 0, 0, 0.5)", opacity: modalBgAnim },
            ]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={closeSignOutModal}
            />
          </Animated.View>

          <Animated.View
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
            style={{
              transform: [{ translateY: signOutModalAnim }],
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "white",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              minHeight: Platform.OS === "ios" ? height * 0.7 : height * 0.9,
              maxHeight: Platform.OS === "ios" ? height * 0.7 : height * 0.9,
              paddingBottom: Platform.OS === "ios" ? 0 : 20,
            }}
            {...signOutPanResponder.panHandlers}
          >
            <View className="items-center py-3">
              <View className="w-10 h-1 bg-slate-200 rounded-full" />
            </View>

            <View className="px-5 py-4 items-center">
              <View className="w-16 h-16 rounded-full bg-orange-50 items-center justify-center mb-4">
                <Feather name="log-out" size={28} color="#f97316" />
              </View>

              <Text className="text-xl font-bold text-slate-700 mb-2">
                Sign Out
              </Text>
              <Text className="text-slate-600 text-center mb-6">
                Are you sure you want to sign out of your account?
              </Text>

              <View className="w-full">
                {signingOut ? (
                  <View className="items-center py-4">
                    <ActivityIndicator size="large" color="#f97316" />
                    <Text className="text-slate-600 mt-3">Signing out...</Text>
                  </View>
                ) : (
                  <>
                    <Animated.View
                      style={{
                        transform: [{ scale: confirmSignOutButtonScale }],
                      }}
                    >
                      <TouchableOpacity
                        onPress={handleSignOut}
                        className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3"
                        activeOpacity={0.8}
                      >
                        <Text className="text-white font-bold text-base">
                          Yes, Sign Out
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>

                    <TouchableOpacity
                      onPress={closeSignOutModal}
                      className="py-3.5 rounded-lg w-full items-center border border-slate-200"
                      activeOpacity={0.8}
                    >
                      <Text className="text-slate-700 font-bold text-center">
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Notification Permission Modal */}
      <NotificationPermissionModal
        visible={showModal}
        onClose={closeModal}
        onPermissionGranted={(result) => {
          console.log("✅ Profile: Notification permissions granted via modal");
          closeModal();
        }}
      />

      {/* Account Switcher */}
      <AccountSwitcherSheet
        visible={isAccountSwitcherVisible}
        onClose={() => setIsAccountSwitcherVisible(false)}
      />
    </SafeAreaView>
  );
};

export default Profile;
