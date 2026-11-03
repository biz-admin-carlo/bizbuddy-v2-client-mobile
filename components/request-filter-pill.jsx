import { useRef } from "react";
import { Animated, Text, TouchableOpacity } from "react-native";

/**
 * Round status-filter chip used on request list screens.
 */
export default function RequestFilterPill({ label, isActive, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.92,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
    setTimeout(() => onPress?.(), 100);
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        className={`px-4 py-2 rounded-full mr-2 border ${
          isActive
            ? "bg-orange-500 border-orange-500"
            : "bg-white border-slate-200"
        }`}
      >
        <Text
          className={`text-sm font-semibold ${
            isActive ? "text-white" : "text-slate-600"
          }`}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
