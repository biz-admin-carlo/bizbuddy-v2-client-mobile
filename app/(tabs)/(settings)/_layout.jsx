// app/(tabs)/(settings)/_layout.jsx

import React from "react";
import { View } from "react-native";
import { Slot } from "expo-router";

const SettingsLayout = () => {
  return (
    <View className="flex-1 bg-white">
      <Slot />
    </View>
  );
};

export default SettingsLayout;
