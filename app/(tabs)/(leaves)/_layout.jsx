// app/(tabs)/(leaves)/_layout.jsx

import React from "react";
import { Tabs } from "expo-router";

const LeavesTabsLayout = () => {
  return (
    <Tabs
      initialRouteName="leaves-request"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="leaves-request" />
      <Tabs.Screen
        name="leaves-approval"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
};

export default LeavesTabsLayout;
