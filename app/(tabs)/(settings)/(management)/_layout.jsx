// File: app/(tabs)/(settings)/(management)/_layout.jsx

import React from "react";
import { View } from "react-native";
import { Slot } from "expo-router";

const AdminLayout = () => {
  return (
    <View className="flex-1 bg-white">
      <Slot />
    </View>
  );
};

export default AdminLayout;
