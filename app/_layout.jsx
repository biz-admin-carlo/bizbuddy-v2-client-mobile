// app/_layout.jsx
import React from "react";
import { Stack } from "expo-router";
import "../global.css";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Biz University",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          title: "Biz University",
        }}
      />
      <Stack.Screen
        name="(auth)"
        options={{
          headerShown: false,
          title: "Biz University",
        }}
      />
    </Stack>
  );
}
