// File: app/(auth)/_layout.jsx

import React from "react";
import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="signin"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
