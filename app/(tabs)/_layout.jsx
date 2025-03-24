// app/(tabs)/profile.jsx
"use client";

import { useEffect, useState, useRef } from "react";
import { AppState, TouchableOpacity, Modal, View, Text, Linking, Animated, Dimensions, Platform, PanResponder, Easing } from "react-native";
import { Tabs } from "expo-router";
import * as SecureStore from "expo-secure-store";
import UserInactivity from "react-native-user-inactivity";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL, WEBSITE_URL } from "../../config/constant";
import useAuthStore from "../../store/useAuthStore";
import usePresenceStore from "../../store/presenceStore";
import io from "socket.io-client";

const { height } = Dimensions.get("window");

// Replace the TabIcon component with this enhanced version
const TabIcon = ({ name, size, focused, isAvatar = false, initials = "U" }) => {
  // Animation values
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const bgOpacity = useRef(new Animated.Value(focused ? 1 : 0)).current;

  // Run animations when tab focus changes
  useEffect(() => {
    // Reset animations for more dramatic effect on each change
    if (focused) {
      // More dramatic bounce animation sequence
      Animated.sequence([
        // First quickly shrink slightly
        Animated.timing(scale, {
          toValue: 0.8,
          duration: 100,
          useNativeDriver: true,
        }),
        // Then bounce up dramatically
        Animated.spring(scale, {
          toValue: 1.3,
          friction: 2, // Very low friction = very bouncy
          tension: 80,
          useNativeDriver: true,
        }),
        // Finally settle to final size
        Animated.spring(scale, {
          toValue: 1.2,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // Move up with bounce
      Animated.spring(translateY, {
        toValue: -8,
        friction: 3,
        tension: 50,
        useNativeDriver: true,
      }).start();

      // Fade in background
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    } else {
      // Unfocused state - smoother, simpler animation
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(bgOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [focused]);

  // Calculate sizes
  const iconSize = size * 0.9;
  const containerSize = size * 2;

  // Interpolate background color for smooth transition
  const bgColorInterpolation = bgOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(251,146,60,0)", "rgba(251,146,60,1)"],
  });

  return (
    <View className="items-center justify-center">
      <Animated.View
        style={{
          transform: [{ scale }, { translateY }],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Animated.View
          style={{
            width: containerSize,
            height: containerSize,
            borderRadius: containerSize / 2,
            backgroundColor: bgColorInterpolation,
            alignItems: "center",
            justifyContent: "center",
            // Removed shadow as requested
          }}
        >
          {isAvatar ? (
            <Text
              style={{
                fontSize: iconSize * 0.7,
                fontWeight: "bold",
                color: focused ? "#ffffff" : "#94a3b8",
              }}
            >
              {initials}
            </Text>
          ) : (
            <Ionicons name={name} size={iconSize} color={focused ? "#ffffff" : "#94a3b8"} />
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
};

// Avatar-specific icon component that fetches user initials
const AvatarIcon = ({ color, size, focused }) => {
  const [initials, setInitials] = useState("U");

  // Fetch user profile to get initials
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const token = await SecureStore.getItemAsync("token");
        if (!token) return;

        const response = await fetch(`${API_BASE_URL}/api/account/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json();
        if (response.ok && data.data.profile) {
          const firstName = data.data.profile.firstName || "";
          const lastName = data.data.profile.lastName || "";

          // Get first letter of first name and first letter of last name
          const firstInitial = firstName.charAt(0).toUpperCase();
          const lastInitial = lastName.charAt(0).toUpperCase();

          // If both exist, use both; otherwise use what's available
          if (firstInitial && lastInitial) {
            setInitials(`${firstInitial}${lastInitial}`);
          } else if (firstInitial) {
            setInitials(firstInitial);
          } else if (lastInitial) {
            setInitials(lastInitial);
          } else {
            setInitials("U"); // Default if no name is available
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };

    fetchUserProfile();
  }, []);

  return <TabIcon size={size} focused={focused} isAvatar={true} initials={initials} />;
};

const TabsLayout = () => {
  const { token } = useAuthStore();
  const { setPresence } = usePresenceStore();
  const [appState, setAppState] = useState(AppState.currentState);

  // State for subscription plan (e.g., "free", "basic", "pro")
  const [subscriptionPlan, setSubscriptionPlan] = useState(null);
  const [loadingSub, setLoadingSub] = useState(true);
  // State to control the help modal for locked features.
  const [showLockedModal, setShowLockedModal] = useState(false);

  // Animation for slide-up modal
  const modalY = useRef(new Animated.Value(height)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  // Pan responder for draggable modal
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          modalY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          // If dragged down more than 100, close the modal
          closeModal();
        } else {
          // Otherwise snap back to original position
          Animated.spring(modalY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        }
      },
    })
  ).current;

  const openModal = () => {
    // Reset position before animation
    modalY.setValue(height);
    setShowLockedModal(true);

    // Animate modal sliding up
    Animated.parallel([
      Animated.timing(modalY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalY, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowLockedModal(false);
    });
  };

  // Function to fetch subscription info via the profile endpoint.
  const fetchSubscription = async () => {
    try {
      const storedToken = token || (await SecureStore.getItemAsync("token"));
      if (!storedToken) return;
      const response = await fetch(`${API_BASE_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      const data = await response.json();
      if (response.ok && data.data.subscription && data.data.subscription.plan) {
        setSubscriptionPlan(data.data.subscription.plan.name);
      }
    } catch (error) {
      console.error("Error fetching subscription:", error);
    } finally {
      setLoadingSub(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, []);

  // Socket.IO integration: Listen for real-time subscription updates.
  useEffect(() => {
    const socket = io(API_BASE_URL, { transports: ["websocket"] });
    socket.on("connect", () => {
      console.log("Connected to socket server:", socket.id);
    });
    socket.on("subscriptionUpdated", (data) => {
      console.log("Subscription update event received:", data);
      fetchSubscription();
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Update presence on app state changes.
  const updateUserPresence = async (status) => {
    const currentToken = token || (await SecureStore.getItemAsync("token"));
    if (!currentToken) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/presence`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          presenceStatus: status,
          lastActiveAt: new Date().toISOString(),
        }),
      });
      const resData = await response.json();
      if (response.ok) {
        setPresence(status, new Date().toISOString());
      }
    } catch (error) {
      console.error("Error updating user presence:", error);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "background") {
        updateUserPresence("away");
      } else if (nextAppState === "active") {
        updateUserPresence("available");
      }
      setAppState(nextAppState);
    });
    return () => subscription.remove();
  }, []);

  const handleUserActivity = (active) => {
    if (active) {
      updateUserPresence("available");
    } else {
      updateUserPresence("away");
    }
  };

  const inactivityTimeout = 5000;
  const isLockedForFree = !loadingSub && subscriptionPlan && subscriptionPlan.toLowerCase() === "free";

  // Custom tab button component for locked features.
  const LockedTabButton = (props) => <TouchableOpacity {...props} onPress={() => openModal()} style={[props.style, { opacity: 0.4 }]} />;

  // Update the tab bar height to ensure icons are fully visible
  const tabBarHeight = Platform.OS === "ios" ? 90 : 70;

  // Update the tabBarActiveTintColor to be white for the labels
  return (
    <>
      <UserInactivity timeForInactivity={inactivityTimeout} onAction={handleUserActivity} style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarStyle: {
              backgroundColor: "#ffffff",
              borderTopColor: "#e2e8f0",
              borderTopWidth: 0,
              height: tabBarHeight,
              paddingTop: Platform.OS === "ios" ? 12 : 8,
              paddingBottom: Platform.OS === "ios" ? 30 : 12,
              // Use platform-specific styling
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: -1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                },
                android: {
                  elevation: 4,
                },
              }),
            },
            tabBarActiveTintColor: "#fb923c",
            tabBarInactiveTintColor: "#94a3b8",
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: "500",
              marginTop: 9,
            },
          }}
        >
          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              headerShown: false,
              tabBarIcon: ({ color, size, focused }) => <TabIcon name="person-outline" size={size} color={color} focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="(leaves)"
            options={{
              title: "Leaves",
              headerShown: false,
              tabBarIcon: ({ color, size, focused }) => <TabIcon name="calendar-outline" size={size} color={color} focused={focused} />,
              tabBarButton: (props) => (isLockedForFree ? <LockedTabButton {...props} /> : <TouchableOpacity {...props} />),
            }}
          />
          <Tabs.Screen
            name="payroll"
            options={{
              title: "Payroll",
              headerShown: false,
              tabBarIcon: ({ color, size, focused }) => <TabIcon name="cash-outline" size={size} color={color} focused={focused} />,
              tabBarButton: (props) => (isLockedForFree ? <LockedTabButton {...props} /> : <TouchableOpacity {...props} />),
            }}
          />
          <Tabs.Screen
            name="(shifts)"
            options={{
              title: "Timekeeping",
              headerShown: false,
              tabBarIcon: ({ color, size, focused }) => <TabIcon name="time-outline" size={size} color={color} focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="(settings)"
            options={{
              title: "Settings",
              headerShown: false,
              tabBarIcon: ({ color, size, focused }) => <AvatarIcon color={color} size={size} focused={focused} />,
            }}
          />
        </Tabs>
      </UserInactivity>

      {/* Slide-up Modal for Locked Features */}
      <Modal transparent visible={showLockedModal} onRequestClose={closeModal} animationType="none">
        <Animated.View className="flex-1 bg-black/50 justify-end" style={{ opacity: modalOpacity }} onTouchEnd={closeModal}>
          <Animated.View className="bg-white rounded-t-3xl px-5 pt-5 pb-8" style={{ transform: [{ translateY: modalY }] }} {...panResponder.panHandlers}>
            {/* Drag handle */}
            <View className="w-full items-center mb-5">
              <View className="w-10 h-1 rounded-full bg-slate-300" />
            </View>

            <View className="items-center mb-6">
              <View className="w-16 h-16 rounded-full bg-orange-100 items-center justify-center mb-4">
                <Ionicons name="lock-closed" size={32} color="#fb923c" />
              </View>

              <Text className="text-xl font-bold mb-2 text-slate-800">Feature Locked</Text>

              <Text className="text-center text-slate-600 px-4">This feature is locked. Need help?</Text>
            </View>

            <TouchableOpacity
              className="w-full bg-orange-400 py-4 rounded-xl mb-3"
              onPress={() => {
                closeModal();
                Linking.openURL(WEBSITE_URL);
              }}
              style={{
                shadowColor: "#fb923c",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <Text className="text-white text-center font-semibold text-base">Visit Website</Text>
            </TouchableOpacity>

            <TouchableOpacity className="w-full py-4 rounded-xl border border-slate-200" onPress={closeModal}>
              <Text className="text-slate-800 text-center">Maybe Later</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
};

export default TabsLayout;
