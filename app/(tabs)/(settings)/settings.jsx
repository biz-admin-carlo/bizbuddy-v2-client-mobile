// app/(tabs)/(settings)/settings.jsx

"use client";

import { useState, useEffect, useRef } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  Animated,
  PanResponder,
  Dimensions,
  StatusBar,
  Image,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import * as Location from "expo-location";
import { API_BASE_URL, WEBSITE_URL } from "../../../config/constant";
import useTutorialStore from "../../../store/tutorialStore";
import useAuthStore, { getTokenCompanyId } from "../../../store/useAuthStore";
import {
  findVerifiedSessionToken,
  persistCompanySessionToken,
} from "../../../utils/authTokenStorage";
import { verifySessionToken } from "../../../utils/authSession";
import {
  MaterialIcons,
  Ionicons,
  Feather,
  FontAwesome5,
} from "@expo/vector-icons";
import io from "socket.io-client";

// Same as your department page, define a min and max offset
const { height } = Dimensions.get("window");
const BIOMETRIC_ENABLED_KEY = "biometricEnabled";

/** Newest saved JWT that still passes server verification (for enabling biometric). */
async function resolveActiveSessionTokenForBiometric() {
  const verified = await findVerifiedSessionToken((t) =>
    verifySessionToken(t, { strict: true }),
  );
  if (verified?.token) return verified.token;
  const mem = useAuthStore.getState().token;
  if (mem) {
    const check = await verifySessionToken(mem, { strict: true });
    if (check.valid) return mem;
  }
  return null;
}

const Settings = () => {
  const router = useRouter();
  const replayTutorial = useTutorialStore((s) => s.replay);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [settingUpBiometric, setSettingUpBiometric] = useState(false);
  const [requestingLocationPermission, setRequestingLocationPermission] =
    useState(false);
  const [deviceSectionExpanded, setDeviceSectionExpanded] = useState(false);

  // Instead of starting from 'height', we'll start from a partial off-screen
  // position to allow partial expansions as in the department page.
  // (We keep modalOpacity for the background fade.)
  const modalY = useRef(
    new Animated.Value(Platform.OS === "ios" ? 700 : 500),
  ).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  // Animation for option press
  const [pressedOption, setPressedOption] = useState(null);

  // Animation for page load
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Button animations
  const primaryButtonScale = useRef(new Animated.Value(1)).current;
  const secondaryButtonScale = useRef(new Animated.Value(1)).current;
  const refreshButtonScale = useRef(new Animated.Value(1)).current;
  const retryButtonScale = useRef(new Animated.Value(1)).current;

  // Individual option button animations
  const optionScales = useRef({}).current;
  const biometricButtonScale = useRef(new Animated.Value(1)).current;
  const locationButtonScale = useRef(new Animated.Value(1)).current;

  // Here we replicate the "department" style panResponder for partial expansions:
  // - If dragged > 100 downwards, close
  // - If dragged upward < -50, we can lift it further
  // - Otherwise snap back to 0
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        // If dragging down, move it
        if (gestureState.dy > 0) {
          modalY.setValue(gestureState.dy);
        }
        // If dragging upward, allow partial expansions (like department)
        else if (gestureState.dy < 0) {
          const newPos = Math.max(gestureState.dy, -300); // clamp upward
          modalY.setValue(newPos);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          // If dragged down more than 100, close
          closeModal();
        } else if (gestureState.dy < -50) {
          // If user drags up above a threshold, partially expand more
          Animated.spring(modalY, {
            toValue: -300,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }).start();
        } else {
          // Snap back to the default "open" position
          Animated.spring(modalY, {
            toValue: 0,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  useEffect(() => {
    // Initial animations for the settings screen
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

    fetchProfile();
    checkBiometricAvailability();
    loadBiometricEnabledState();
  }, []);

  const loadBiometricEnabledState = async () => {
    try {
      const enabledFlag = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      setBiometricEnabled(enabledFlag === "true");
    } catch {
      setBiometricEnabled(false);
    }
  };

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      console.log(
        "Biometric check - hasHardware:",
        hasHardware,
        "isEnrolled:",
        isEnrolled,
      );

      // For iOS simulator testing, enable button even if checks fail
      // In simulator, you can enable Face ID via: Features > Face ID > Enrolled
      const isIOS = Platform.OS === "ios";
      const isDev = __DEV__;

      if (hasHardware && isEnrolled) {
        setBiometricAvailable(true);
        console.log("Biometric available - button should be visible");
      } else if (isIOS && isDev) {
        // Enable for iOS simulator testing
        setBiometricAvailable(true);
        console.log(
          "iOS Dev mode - enabling biometric button for simulator testing",
        );
      } else {
        console.log("Biometric not available - button will be disabled");
      }
    } catch (error) {
      console.error("Error checking biometrics:", error);
      // On error, still enable for iOS dev mode
      if (Platform.OS === "ios" && __DEV__) {
        setBiometricAvailable(true);
        console.log("Error occurred but enabling for iOS simulator testing");
      }
    }
  };

  const openModal = () => {
    // Reset position before animation (like in department page)
    modalY.setValue(Platform.OS === "ios" ? 700 : 500);

    setShowLockedModal(true);
    // Animate the background fade-in and the slide up
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(modalY, {
        toValue: 0,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeModal = () => {
    // Animate background fade out and slide down
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(modalY, {
        toValue: Platform.OS === "ios" ? 700 : 500,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowLockedModal(false);
    });
  };

  // Enhanced button animation with better bounce
  const animateButtonPress = (buttonRef) => {
    // Create a sequence for more natural bounce
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
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        Alert.alert("Session expired", "Please sign in again.");
        router.replace("(auth)/signin");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setProfile(data.data);
      } else {
        setError(data.message || "Failed to fetch profile.");
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    animateButtonPress(refreshButtonScale);
    setRefreshing(true);
    fetchProfile();
  };

  const handleSetupBiometric = async () => {
    animateButtonPress(biometricButtonScale);
    setSettingUpBiometric(true);

    try {
      if (biometricEnabled) {
        await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
        setBiometricEnabled(false);
        Alert.alert(
          "Biometric Disabled",
          "Biometric sign-in has been turned off for this device.",
          [{ text: "OK" }],
        );
        return;
      }

      // Need a logged-in session (any company): vault, saved token, or in-memory store
      const token = await resolveActiveSessionTokenForBiometric();
      if (!token) {
        Alert.alert(
          "No Active Session",
          "Please sign in first. After you sign in, Face ID can be used on the sign-in screen for any company you have saved on this device.",
          [{ text: "OK" }],
        );
        setSettingUpBiometric(false);
        return;
      }

      // Check biometric availability (but allow in dev mode for simulator testing)
      const isIOS = Platform.OS === "ios";
      const isDev = __DEV__;

      if (!biometricAvailable && !(isIOS && isDev)) {
        Alert.alert(
          "Biometric Not Available",
          "Biometric authentication is not available on this device. Please ensure Face ID or Touch ID is set up in your device settings.",
          [{ text: "OK" }],
        );
        setSettingUpBiometric(false);
        return;
      }

      // Prompt for biometric authentication
      // In iOS simulator, enable Face ID via: Features > Face ID > Enrolled
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Set up Face ID for BizBuddy",
        fallbackLabel: "Enter Passcode",
        disableDeviceFallback: false,
      });

      if (result.success) {
        await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
        setBiometricEnabled(true);

        try {
          const active = await resolveActiveSessionTokenForBiometric();
          if (active) {
            await SecureStore.setItemAsync("token", active);
            const cid = getTokenCompanyId(active);
            if (cid) {
              await persistCompanySessionToken(cid, active);
            }
          }
        } catch (syncErr) {
          console.warn("Biometric enable: session sync skipped", syncErr);
        }

        Alert.alert(
          "Success",
          "Face ID is enabled. On the sign-in screen you can use it for any company you have previously signed into on this device (each company keeps its own saved session).",
          [{ text: "OK" }],
        );
      } else {
        Alert.alert(
          "Setup Cancelled",
          "Biometric authentication setup was cancelled. Please try again if you want to enable it.",
          [{ text: "OK" }],
        );
      }
    } catch (error) {
      console.error("Error setting up biometric:", error);
      Alert.alert(
        "Error",
        "An error occurred while setting up biometric authentication. Please try again.",
        [{ text: "OK" }],
      );
    } finally {
      setSettingUpBiometric(false);
    }
  };

  const handleLocationSettings = async () => {
    animateButtonPress(locationButtonScale);
    if (requestingLocationPermission) return;
    setRequestingLocationPermission(true);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();

      if (currentPermission.granted) {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          Alert.alert(
            "Location Services Disabled",
            "Location permission is granted, but device location services are turned off. Please enable location services in your device settings.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => Linking.openSettings(),
              },
            ],
          );
          return;
        }

        Alert.alert(
          "Location Ready",
          "Location access is already enabled and ready to use.",
        );
        return;
      }

      const permissionResult =
        await Location.requestForegroundPermissionsAsync();
      if (permissionResult.granted) {
        Alert.alert("Success", "Location permission has been enabled.");
        return;
      }

      Alert.alert(
        "Location Permission Needed",
        "Please enable location access in system settings so punch-in location checks can work.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => Linking.openSettings(),
          },
        ],
      );
    } catch (error) {
      console.error("Error requesting location permission:", error);
      Alert.alert(
        "Error",
        "Unable to update location permission right now. Please try again.",
      );
    } finally {
      setRequestingLocationPermission(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // Socket.IO integration: listen for real-time subscription updates.
  useEffect(() => {
    const socket = io(API_BASE_URL, { transports: ["websocket"] });
    socket.on("connect", () => {
      console.log("Connected to socket server:", socket.id);
    });
    socket.on("subscriptionUpdated", (data) => {
      console.log("Subscription update event received:", data);
      fetchProfile();
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Extract needed values from the profile
  const firstName = profile?.profile?.firstName || "";
  const lastName = profile?.profile?.lastName || "";
  const userRole = (profile?.user?.role || "").toLowerCase();
  const companyName = profile?.company?.name || "Unknown Company";
  const subscriptionPlan =
    profile?.subscription?.plan?.name || "No Subscription";
  const planLower = subscriptionPlan.toLowerCase();

  // Improved option configuration with better grouping
  const optionsConfig = [
    // Team Management Group
    {
      title: "Departments",
      route: "./manage-departments",
      roles: ["admin", "superadmin"],
      icon: "git-branch",
      iconType: "feather",
      group: "Team Management",
    },
    {
      title: "Employees",
      route: "./manage-employees",
      roles: ["supervisor", "admin", "superadmin"],
      icon: "users",
      iconType: "feather",
      group: "Team Management",
    },

    // Schedule Management Group
    {
      title: "Shift",
      route: "./manage-shift",
      roles: ["admin", "superadmin"],
      icon: "calendar",
      iconType: "feather",
      group: "Schedule Management",
    },
    {
      title: "Schedules",
      route: "./manage-shift-schedule",
      roles: ["admin", "superadmin"],
      icon: "calendar",
      iconType: "feather",
      group: "Schedule Management",
    },

    {
      title: "Leave Requests",
      route: "./manage-leaves",
      roles: ["admin", "superadmin"],
      icon: "calendar-outline",
      iconType: "ionicons",
      group: "Schedule Management",
    },
    // Employee-facing Leave Requests (submit/view own)
    {
      title: "Leave Requests",
      route: "/(tabs)/(leaves)/leaves-request",
      roles: ["employee"],
      icon: "calendar-outline",
      iconType: "ionicons",
      group: "Schedule Management",
    },
    // Overtime Management / Requests
    {
      title: "Overtime Requests",
      route: "/(tabs)/(overtime)",
      roles: ["employee"],
      icon: "stopwatch-outline",
      iconType: "ionicons",
      group: "Schedule Management",
    },
    {
      title: "Overtime Requests",
      route: "./(management)/manage-overtimes",
      roles: ["admin", "superadmin"],
      icon: "stopwatch-outline",
      iconType: "ionicons",
      group: "Schedule Management",
    },
    {
      title: "Punch Locations",
      route: "./manage-locations",
      roles: ["admin", "superadmin"],
      lockSubs: ["basic", "free"],
      icon: "map-pin",
      iconType: "feather",
      group: "Schedule Management",
    },

    // Payroll Group (admin/superadmin) temporarily disabled in UI
    // {
    //   title: "Payroll Settings",
    //   route: "./payroll-payroll-settings",
    //   roles: ["admin", "superadmin"],
    //   icon: "settings",
    //   iconType: "feather",
    //   group: "Payroll",
    // },
    // {
    //   title: "Payrate Settings",
    //   route: "./payroll-payrate-settings",
    //   roles: ["admin", "superadmin"],
    //   icon: "dollar-sign",
    //   iconType: "feather",
    //   group: "Payroll",
    // },
    // {
    //   title: "Payroll Records",
    //   route: "./payroll-payroll-records",
    //   roles: ["admin", "superadmin"],
    //   icon: "file-text",
    //   iconType: "feather",
    //   group: "Payroll",
    // },
    // {
    //   title: "Generate Payroll",
    //   route: "./payroll-generate-payroll",
    //   roles: ["admin", "superadmin"],
    //   icon: "calculator",
    //   iconType: "ionicons", // Changed from "feather" to "ionicons"
    //   group: "Payroll",
    // },
  ];

  // Filter options based on role
  let filteredOptions = [];
  if (userRole === "employee") {
    filteredOptions = optionsConfig.filter((option) =>
      option.roles.includes("employee"),
    );
  } else if (userRole === "supervisor") {
    filteredOptions = optionsConfig.filter((option) =>
      option.roles.includes("supervisor"),
    );
  } else if (userRole === "admin") {
    filteredOptions = optionsConfig.filter((option) =>
      option.roles.includes("admin"),
    );
  } else if (userRole === "superadmin") {
    // Superadmins should see only options explicitly assigned to them,
    // not employee-only options like the second "Leave Requests" entry.
    filteredOptions = optionsConfig.filter((option) =>
      option.roles.includes("superadmin"),
    );
  }

  // Determine if an option should be locked based on subscription
  const isOptionLocked = (option) => {
    if (planLower === "free") return true;
    if (option.lockSubs && option.lockSubs.includes(planLower)) return true;
    return false;
  };

  // Group options by their defined group
  const groupOptions = (options) => {
    const grouped = {};
    options.forEach((option) => {
      const group = option.group || "Other";
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push(option);
    });
    return grouped;
  };

  const groupedOptions = groupOptions(filteredOptions);

  // Get the appropriate icon component based on type
  const getIconComponent = (icon, iconType) => {
    switch (iconType) {
      case "feather":
        return <Feather name={icon} size={18} color="#ffff" />;
      case "fontawesome5":
        return <FontAwesome5 name={icon} size={18} color="#ffff" />;
      case "ionicons":
      default:
        return <Ionicons name={icon} size={18} color="#ffff" />;
    }
  };

  // OptionRow component with enhanced animation
  const OptionRow = ({ option, index }) => {
    const { title, route, icon, iconType } = option;
    const locked = isOptionLocked(option) || false;

    // Create animation value for this option if it doesn't exist
    if (!optionScales[index]) {
      optionScales[index] = new Animated.Value(1);
    }

    const handlePress = () => {
      // Animate the button press
      animateButtonPress(optionScales[index]);

      // Give 300ms so the bounce is visible before the modal or route
      setTimeout(() => {
        if (locked) {
          openModal();
        } else {
          router.push(route);
        }
      }, 300);
    };

    return (
      <Animated.View style={{ transform: [{ scale: optionScales[index] }] }}>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.8}
          className="flex-row items-start bg-[#ffffff] border border-[#e2e8f0] rounded-[12px] px-4 py-4 mb-4"
          style={{
            opacity: locked ? 0.7 : 1,
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 2,
              },
              android: {
                elevation: 2,
              },
            }),
          }}
        >
          <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3 mt-0.5">
            {getIconComponent(icon, iconType)}
          </View>
          <Text
            className="text-medium font-semibold text-slate-700 flex-1 leading-6"
            style={{ flexShrink: 1 }}
          >
            {title}
          </Text>
          {locked ? (
            <View className="bg-[#ffedd5] rounded-[16px] p-1.5 ml-2 mt-1">
              <MaterialIcons name="lock" size={16} color="#f97316" />
            </View>
          ) : (
            <Ionicons
              name="chevron-forward"
              size={20}
              color="#94a3b8"
              style={{ marginLeft: 8, marginTop: 4 }}
            />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const deviceSettingsChevron = deviceSectionExpanded
    ? "chevron-up"
    : "chevron-down";

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {/* Root container using nativewind for background color */}
      <SafeAreaView className="flex-1 bg-[#ffffff]">
        <Animated.View
          style={{
            flex: 1,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="#94a3b8" />
              <Text className="mt-4 text-slate-400">Loading profile...</Text>
            </View>
          ) : error ? (
            <View className="flex-1 justify-center items-center p-5">
              <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
              <Text className="text-red-700 mt-4 mb-6 text-center">
                {error}
              </Text>
              <Animated.View
                style={{ transform: [{ scale: retryButtonScale }] }}
              >
                <TouchableOpacity
                  onPress={() => {
                    animateButtonPress(retryButtonScale);
                    setTimeout(fetchProfile, 100);
                  }}
                  className="bg-[#f97316] px-6 py-3 rounded-[12px]"
                >
                  <Text className="text-[#ffffff] font-semibold text-[16px]">
                    Try Again
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View
                className="px-5 py-6 border-b"
                style={{ borderBottomColor: "#e2e8f0", borderBottomWidth: 1 }}
              >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[24px] font-bold text-[#1e293b]">
                Settings
              </Text>

              <Animated.View
                style={{ transform: [{ scale: refreshButtonScale }] }}
              >
                <TouchableOpacity
                  onPress={handleRefresh}
                  className="w-10 h-10 rounded-full items-center justify-center "
                  style={Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 2,
                    },
                    android: {
                      elevation: 2,
                    },
                  })}
                >
                  <Feather name="refresh-cw" size={18} color="#f97316" />
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Profile Card */}
            <View
              className="px-4 py-4 rounded-lg border border-[#e2e8f0] bg-[#ffffff] mb-2"
              style={Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2.65,
                },
                android: {
                  elevation: 6,
                },
              })}
            >
              <View className="flex-row items-start mb-3">
                <View className="w-14 h-14 rounded-full bg-orange-400 items-center justify-center mr-3 mt-0.5">
                  <Text className="text-white text-[18px] font-bold">
                    {firstName.charAt(0).toUpperCase()}
                    {lastName.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View className="ml-1 flex-1" style={{ minWidth: 0 }}>
                  <Text
                    className="text-xl font-bold text-slate-700 capitalize"
                    style={{ flexShrink: 1 }}
                  >
                    {firstName} {lastName}
                  </Text>
                  <View className="flex-row flex-wrap items-center mt-1">
                    <View className="bg-orange-400 rounded-[12px] px-2 py-0.5 mr-2">
                      <Text className="text-[12px] text-white font-[500]">
                        {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                      </Text>
                    </View>
                    <Text
                      className="text-[14px] text-[#64748b]"
                      style={{ flexShrink: 1 }}
                    >
                      {companyName}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="p-3 rounded-[8px] bg-orange-100 flex-row items-start">
                <Ionicons
                  name="star"
                  size={18}
                  color="#f97316"
                  style={{ marginRight: 8, marginTop: 2 }}
                />
                <Text className="text-orange-700 text-[14px] flex-1">
                  <Text className="font-bold">{subscriptionPlan}</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL(WEBSITE_URL)}
                  style={{ marginLeft: 8, marginTop: 2 }}
                >
                  <Text className="text-[12px] text-orange-700 font-bold">
                    Web
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* App tutorial replay */}
            <TouchableOpacity
              onPress={replayTutorial}
              activeOpacity={0.85}
              className="mt-3 flex-row items-start bg-orange-50 border border-orange-100 rounded-[12px] px-4 py-4"
              style={Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                },
                android: { elevation: 2 },
              })}
            >
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3 mt-0.5">
                <Ionicons
                  name="help-circle-outline"
                  size={20}
                  color="#ffffff"
                />
              </View>
              <View className="flex-1">
                <Text className="text-medium font-semibold text-slate-800">
                  App Tutorial
                </Text>
                <Text className="text-[12px] text-slate-600 mt-0.5">
                  Replay the guided tour with tips
                </Text>
              </View>
              <Ionicons
                name="play-circle"
                size={20}
                color="#f97316"
                style={{ marginTop: 4, marginLeft: 8 }}
              />
            </TouchableOpacity>

            {/* Device settings: Face ID + Location (collapsible) */}
            <TouchableOpacity
              onPress={() => setDeviceSectionExpanded((o) => !o)}
              activeOpacity={0.85}
              className="mt-3 flex-row items-start bg-slate-100 border border-slate-200 rounded-[12px] px-4 py-3"
              style={Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                },
                android: { elevation: 2 },
              })}
            >
              <View className="w-10 h-10 rounded-md bg-slate-700 items-center justify-center mr-3 mt-0.5">
                <Ionicons
                  name="hardware-chip-outline"
                  size={20}
                  color="#ffffff"
                />
              </View>
              <View className="flex-1">
                <Text className="text-medium font-semibold text-slate-800">
                  Device settings
                </Text>
                <Text className="text-[12px] text-slate-600 mt-0.5">
                  Face ID, location, and permissions on this device
                </Text>
              </View>
              <Ionicons
                name={deviceSettingsChevron}
                size={22}
                color="#64748b"
                style={{ marginTop: 4, marginLeft: 8 }}
              />
            </TouchableOpacity>

            {deviceSectionExpanded && (
              <View
                className="mt-2 rounded-[12px] border border-slate-200 overflow-hidden bg-white"
                style={Platform.select({
                  ios: {
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                  },
                  android: { elevation: 2 },
                })}
              >
                {/* Face ID */}
                <Animated.View
                  style={{ transform: [{ scale: biometricButtonScale }] }}
                >
                  <TouchableOpacity
                    onPress={handleSetupBiometric}
                    disabled={
                      settingUpBiometric ||
                      (!biometricAvailable &&
                        !(Platform.OS === "ios" && __DEV__))
                    }
                    activeOpacity={0.85}
                    className="flex-row items-start bg-slate-50 px-4 py-4 border-b border-slate-200"
                    style={[
                      !biometricAvailable &&
                        !(Platform.OS === "ios" && __DEV__) && { opacity: 0.6 },
                    ]}
                  >
                    <View className="w-10 h-10 rounded-md bg-slate-600 items-center justify-center mr-3 mt-0.5">
                      {settingUpBiometric ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Ionicons
                          name="finger-print-outline"
                          size={20}
                          color="#ffffff"
                        />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-medium font-semibold text-slate-800">
                        {settingUpBiometric
                          ? "Setting up Face ID..."
                          : biometricEnabled
                            ? "Disable Face ID"
                            : "Set Up Face ID"}
                      </Text>
                      <Text className="text-[12px] text-slate-600 mt-0.5">
                        {settingUpBiometric
                          ? "Please authenticate with Face ID"
                          : biometricEnabled
                            ? "Face ID is enabled on this device"
                            : biometricAvailable ||
                                (Platform.OS === "ios" && __DEV__)
                              ? "Use Face ID on sign-in for any company saved on this device"
                              : "Biometric authentication not available on this device"}
                      </Text>
                    </View>
                    {!settingUpBiometric &&
                      (biometricAvailable ||
                        (Platform.OS === "ios" && __DEV__)) && (
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#94a3b8"
                          style={{ marginTop: 4, marginLeft: 8 }}
                        />
                      )}
                  </TouchableOpacity>
                </Animated.View>

                {/* Location */}
                <Animated.View
                  style={{ transform: [{ scale: locationButtonScale }] }}
                >
                  <TouchableOpacity
                    onPress={handleLocationSettings}
                    disabled={requestingLocationPermission}
                    activeOpacity={0.85}
                    className="flex-row items-start bg-slate-50 px-4 py-4"
                  >
                    <View className="w-10 h-10 rounded-md bg-slate-600 items-center justify-center mr-3 mt-0.5">
                      {requestingLocationPermission ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Ionicons
                          name="location-outline"
                          size={20}
                          color="#ffffff"
                        />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-medium font-semibold text-slate-800">
                        {requestingLocationPermission
                          ? "Checking location access..."
                          : "Location Settings"}
                      </Text>
                      <Text className="text-[12px] text-slate-600 mt-0.5">
                        Re-prompt location permission or open system settings
                      </Text>
                    </View>
                    {!requestingLocationPermission && (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#94a3b8"
                        style={{ marginTop: 4, marginLeft: 8 }}
                      />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}
              </View>

              {filteredOptions.length === 0 ? (
                <View className="items-center p-5 py-10">
                  <Image
                    source={require("../../../assets/images/icon.png")}
                    className="w-20 h-20 rounded-[16px] mb-6"
                    resizeMode="contain"
                  />
                  <Text className="text-[18px] font-[500] mb-2 text-[#1e293b]">
                    No Administrative Access
                  </Text>
                  <Text className="text-center text-[#64748b]">
                    {userRole === "employee"
                      ? "You don't have access to administrative features."
                      : userRole === "supervisor"
                        ? "Only employee management is available for supervisors."
                        : "No options available for your role."}
                  </Text>
                </View>
              ) : (
                <View className="px-5 pt-4">
                  {Object.keys(groupedOptions).map((groupName, groupIndex) => (
                    <View key={groupIndex} className="mb-6">
                      <Text className="text-sm font-medium mb-3 text-slate-500 uppercase">
                        {groupName}
                      </Text>
                      {groupedOptions[groupName].map((option, index) => (
                        <OptionRow
                          key={index}
                          option={option}
                          index={`${groupName}-${index}`}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </Animated.View>
      </SafeAreaView>

      {/* Slide-up Modal for Locked Features */}
      <Modal
        transparent
        visible={showLockedModal}
        onRequestClose={closeModal}
        animationType="none"
      >
        {/* Fade the background according to modalOpacity */}
        <Animated.View
          className="flex-1 bg-[rgba(0,0,0,0.5)] justify-end"
          style={{ opacity: modalOpacity }}
          onTouchEnd={closeModal}
        >
          <Animated.View
            className="bg-white rounded-t-[10px] px-5 pt-5"
            style={{
              transform: [{ translateY: modalY }],
              // This ensures a partial "department" style approach:
              minHeight: height * 0.7,
              maxHeight: Platform.OS === "ios" ? height * 0.7 : height * 0.85,
              paddingBottom: Platform.OS === "ios" ? 0 : 20,
            }}
            {...panResponder.panHandlers}
          >
            {/* Drag handle */}
            <View className="w-full items-center mb-5">
              <View className="w-12 h-1 rounded-[2px] bg-slate-300" />
            </View>

            <View className="items-center mb-6 ">
              <View className="w-16 h-16 rounded-lg bg-[#ffedd5] items-center justify-center mb-4">
                <Ionicons name="lock-closed" size={32} color="#f97316" />
              </View>

              <Text className="text-[20px] font-bold mb-2 text-[#1e293b]">
                Feature Locked
              </Text>
              <Text className="text-center text-slate-500 px-4">
                This feature is not available for {subscriptionPlan} plan
              </Text>
            </View>

            <Animated.View
              style={{ transform: [{ scale: primaryButtonScale }] }}
            >
              <TouchableOpacity
                className="bg-orange-400 py-4 rounded-lg w-full items-center mb-3 "
                style={Platform.select({
                  ios: {
                    shadowColor: "#f97316",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 2,
                  },
                  android: {
                    elevation: 3,
                  },
                })}
                onPress={() => {
                  animateButtonPress(primaryButtonScale);
                  setTimeout(() => {
                    closeModal();
                    Linking.openURL(WEBSITE_URL);
                  }, 100);
                }}
              >
                <Text className="text-white text-center font-semibold  text-lg">
                  Visit Website
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
};

export default Settings;
