// app/(tabs)/(leaves)/_layout.jsx

import React from "react";
import { Tabs } from "expo-router";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LeavesTabsLayout = () => {
  const insets = useSafeAreaInsets();

  // Helper function to generate tab icons with a specified icon component
  const getTabBarIcon = (iconName, IconComponent = Ionicons, size = 24, accessibilityLabel = "") => {
    return ({ color }) => <IconComponent name={iconName} size={size} color={color} accessibilityLabel={accessibilityLabel} />;
  };

  return (
    <Tabs
      initialRouteName="leaves-request"
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
      {/* Submit Leaves Tab */}
      <Tabs.Screen
        name="leaves-request"
        options={{
          tabBarLabel: "Submit",
          tabBarIcon: getTabBarIcon("document-text-outline", Ionicons, 24, "Submit Leaves Tab Icon"),
        }}
      />

      {/* Approval Leaves Tab */}
      <Tabs.Screen
        name="leaves-approval"
        options={{
          tabBarLabel: "Approval",
          tabBarIcon: getTabBarIcon("check-circle", FontAwesome5, 24, "Approval Leaves Tab Icon"),
        }}
      />
    </Tabs>
  );
};

export default LeavesTabsLayout;
