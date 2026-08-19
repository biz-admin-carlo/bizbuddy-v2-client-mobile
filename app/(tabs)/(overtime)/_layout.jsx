// app/(tabs)/(overtime)/_layout.jsx

import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const OvertimeTabsLayout = () => {
  const insets = useSafeAreaInsets();

  const getTabBarIcon = (iconName, size = 24, accessibilityLabel = "") => {
    return ({ color }) => (
      <Ionicons
        name={iconName}
        size={size}
        color={color}
        accessibilityLabel={accessibilityLabel}
      />
    );
  };

  return (
    <Tabs
      initialRouteName="overtime-manage"
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
      {/* Overtime History / Manage Tab */}
      <Tabs.Screen
        name="overtime-manage"
        options={{
          tabBarLabel: "History",
          tabBarIcon: getTabBarIcon(
            "time-outline",
            24,
            "Overtime History Tab Icon"
          ),
        }}
      />

      {/* Submit Overtime Tab */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "Request",
          tabBarIcon: getTabBarIcon(
            "document-text-outline",
            24,
            "Submit Overtime Tab Icon"
          ),
        }}
      />
    </Tabs>
  );
};

export default OvertimeTabsLayout;
