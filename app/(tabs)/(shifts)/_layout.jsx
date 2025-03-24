// File: client/app/(tabs)/(shifts)/_layout.jsx

import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ShiftsTabsLayout = () => {
  const insets = useSafeAreaInsets();

  // Helper function to generate tab icons using Ionicons
  const getTabBarIcon = (iconName, size = 24, accessibilityLabel = "") => {
    return ({ color }) => <Ionicons name={iconName} size={size} color={color} accessibilityLabel={accessibilityLabel} />;
  };

  return (
    <Tabs
      initialRouteName="timekeeping-punch"
      screenOptions={{
        headerShown: false,
        tabBarShowIcon: true,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderBottomColor: "#e5e7eb",
          borderTopWidth: 0,
          position: "absolute",
          top: insets.top,
          left: 0,
          right: 0,
          height: 60,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: "#f97316",
        tabBarInactiveTintColor: "#6B7280",
        tabBarLabelStyle: {
          fontSize: 12,
          textTransform: "none",
        },
        tabBarIconStyle: {
          width: 24,
          height: 24,
        },
        tabBarItemStyle: {
          flexDirection: "column",
        },
      }}
    >
      {/* Punch Screen */}
      <Tabs.Screen
        name="timekeeping-punch"
        options={{
          tabBarLabel: "Punch",
          tabBarIcon: getTabBarIcon("time-outline", 24, "Punch Tab Icon"),
        }}
      />

      {/* TimeCard Screen */}
      <Tabs.Screen
        name="timekeeping-timeCard"
        options={{
          tabBarLabel: "Time Card",
          tabBarIcon: getTabBarIcon("clipboard-outline", 24, "Time Card Tab Icon"),
        }}
      />

      {/* Schedule Screen */}
      <Tabs.Screen
        name="timekeeping-schedule"
        options={{
          tabBarLabel: "Schedule",
          tabBarIcon: getTabBarIcon("calendar-outline", 24, "Shift Schedule Tab Icon"),
        }}
      />
    </Tabs>
  );
};

export default ShiftsTabsLayout;
