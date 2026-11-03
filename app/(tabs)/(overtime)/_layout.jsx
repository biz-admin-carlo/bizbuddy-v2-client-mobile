// app/(tabs)/(overtime)/_layout.jsx

import React from "react";
import { Tabs } from "expo-router";

const OvertimeTabsLayout = () => {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen
        name="overtime-manage"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
};

export default OvertimeTabsLayout;
