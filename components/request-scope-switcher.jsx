import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Lifts the selected half off the track. Mirrors the card shadow used by the
// request list screens.
const activeShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  android: { elevation: 1 },
});

/**
 * Segmented control for switching which set of requests a list shows
 * (for example the viewer's own requests vs their employees').
 * Deliberately shaped differently from the round status filter pills.
 */
export default function RequestScopeSwitcher({ value, onChange, options }) {
  return (
    <View className="flex-row bg-slate-100 rounded-xl p-1">
      {options.map((option) => {
        const isActive = value === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => onChange(option.key)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.label}
            className={`flex-1 flex-row items-center justify-center py-2 rounded-lg ${
              isActive ? "bg-white" : ""
            }`}
            style={isActive ? activeShadow : null}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={15}
                color={isActive ? "#ea580c" : "#94a3b8"}
              />
            ) : null}
            <Text
              numberOfLines={1}
              className={`${option.icon ? "ml-1.5" : ""} text-sm ${
                isActive
                  ? "text-orange-600 font-semibold"
                  : "text-slate-500 font-medium"
              }`}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
