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
import { API_BASE_URL, WEBSITE_URL } from "../../../config/constant";
import { MaterialIcons, Ionicons, Feather, FontAwesome5 } from "@expo/vector-icons";
import io from "socket.io-client";

// Same as your department page, define a min and max offset
const { height } = Dimensions.get("window");

const Settings = () => {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Instead of starting from 'height', we'll start from a partial off-screen
  // position to allow partial expansions as in the department page.
  // (We keep modalOpacity for the background fade.)
  const modalY = useRef(new Animated.Value(Platform.OS === "ios" ? 700 : 500)).current;
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
    })
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
  }, []);

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
  const subscriptionPlan = profile?.subscription?.plan?.name || "No Subscription";
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
    {
      title: "Punch Locations",
      route: "./manage-locations",
      roles: ["admin", "superadmin"],
      lockSubs: ["basic", "free"],
      icon: "map-pin",
      iconType: "feather",
      group: "Schedule Management",
    },

    // Payroll Group
    {
      title: "Payroll Settings",
      route: "./payroll-payroll-settings",
      roles: ["admin", "superadmin"],
      icon: "settings",
      iconType: "feather",
      group: "Payroll",
    },
    {
      title: "Payrate Settings",
      route: "./payroll-payrate-settings",
      roles: ["admin", "superadmin"],
      icon: "dollar-sign",
      iconType: "feather",
      group: "Payroll",
    },
    {
      title: "Payroll Records",
      route: "./payroll-payroll-records",
      roles: ["admin", "superadmin"],
      icon: "file-text",
      iconType: "feather",
      group: "Payroll",
    },
    {
      title: "Generate Payroll",
      route: "./payroll-generate-payroll",
      roles: ["admin", "superadmin"],
      icon: "calculator",
      iconType: "ionicons", // Changed from "feather" to "ionicons"
      group: "Payroll",
    },
  ];

  // Filter options based on role
  let filteredOptions = [];
  if (userRole === "employee") {
    filteredOptions = []; // Employees see no administrative options
  } else if (userRole === "supervisor") {
    filteredOptions = optionsConfig.filter((option) => option.roles.includes("supervisor"));
  } else if (userRole === "admin") {
    filteredOptions = optionsConfig.filter((option) => option.roles.includes("admin"));
  } else if (userRole === "superadmin") {
    filteredOptions = optionsConfig;
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
          className="flex-row items-center bg-[#ffffff] border border-[#e2e8f0] rounded-[12px] px-4 py-4 mb-4"
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
          <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">{getIconComponent(icon, iconType)}</View>
          <Text className="text-medium font-semibold text-slate-700 flex-1">{title}</Text>
          {locked ? (
            <View className="bg-[#ffedd5] rounded-[16px] p-1.5">
              <MaterialIcons name="lock" size={16} color="#f97316" />
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

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
          {/* Header */}
          <View className="px-5 py-6 border-b" style={{ borderBottomColor: "#e2e8f0", borderBottomWidth: 1 }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[24px] font-bold text-[#1e293b]">Settings</Text>

              <Animated.View style={{ transform: [{ scale: refreshButtonScale }] }}>
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
              <View className="flex-row items-center mb-3">
                <View className="w-14 h-14 rounded-full bg-orange-400 items-center justify-center mr-3">
                  <Text className="text-white text-[18px] font-bold">
                    {firstName.charAt(0).toUpperCase()}
                    {lastName.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View className="ml-1">
                  <Text className="text-xl font-bold text-slate-700 capitalize ">
                    {firstName} {lastName}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <View className="bg-orange-400 rounded-[12px] px-2 py-0.5 mr-2">
                      <Text className="text-[12px] text-white font-[500]">{userRole.charAt(0).toUpperCase() + userRole.slice(1)}</Text>
                    </View>
                    <Text className="text-[14px] text-[#64748b]">{companyName}</Text>
                  </View>
                </View>
              </View>

              <View className="p-3 rounded-[8px] bg-orange-100 flex-row items-center">
                <Ionicons name="star" size={18} color="#f97316" style={{ marginRight: 8 }} />
                <Text className="text-orange-700 text-[14px] flex-1">
                  <Text className="font-bold">{subscriptionPlan}</Text>
                </Text>
                <TouchableOpacity onPress={() => Linking.openURL(WEBSITE_URL)}>
                  <Text className="text-[12px] text-orange-700 font-bold">Web</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Main Content Area */}
          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="#94a3b8" />
              <Text className="mt-4 text-slate-400">Loading profile...</Text>
            </View>
          ) : error ? (
            <View className="flex-1 justify-center items-center p-5">
              <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
              <Text className="text-red-700 mt-4 mb-6 text-center">{error}</Text>
              <Animated.View style={{ transform: [{ scale: retryButtonScale }] }}>
                <TouchableOpacity
                  onPress={() => {
                    animateButtonPress(retryButtonScale);
                    setTimeout(fetchProfile, 100);
                  }}
                  className="bg-[#f97316] px-6 py-3 rounded-[12px]"
                >
                  <Text className="text-[#ffffff] font-semibold text-[16px]">Try Again</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          ) : filteredOptions.length === 0 ? (
            <View className="flex-1 justify-center items-center p-5">
              <Image source={require("../../../assets/images/icon.png")} className="w-20 h-20 rounded-[16px] mb-6" resizeMode="contain" />
              <Text className="text-[18px] font-[500] mb-2 text-[#1e293b]">No Administrative Access</Text>
              <Text className="text-center text-[#64748b]">
                {userRole === "employee"
                  ? "You don't have access to administrative features."
                  : userRole === "supervisor"
                  ? "Only employee management is available for supervisors."
                  : "No options available for your role."}
              </Text>
            </View>
          ) : (
            <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
              {Object.keys(groupedOptions).map((groupName, groupIndex) => (
                <View key={groupIndex} className="mb-6">
                  <Text className="text-sm font-medium mb-3 text-slate-500 uppercase">{groupName}</Text>
                  {groupedOptions[groupName].map((option, index) => (
                    <OptionRow key={index} option={option} index={`${groupName}-${index}`} />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </SafeAreaView>

      {/* Slide-up Modal for Locked Features */}
      <Modal transparent visible={showLockedModal} onRequestClose={closeModal} animationType="none">
        {/* Fade the background according to modalOpacity */}
        <Animated.View className="flex-1 bg-[rgba(0,0,0,0.5)] justify-end" style={{ opacity: modalOpacity }} onTouchEnd={closeModal}>
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

              <Text className="text-[20px] font-bold mb-2 text-[#1e293b]">Feature Locked</Text>
              <Text className="text-center text-slate-500 px-4">This feature is not available for {subscriptionPlan} plan</Text>
            </View>

            <Animated.View style={{ transform: [{ scale: primaryButtonScale }] }}>
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
                <Text className="text-white text-center font-semibold  text-lg">Visit Website</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
};

export default Settings;
