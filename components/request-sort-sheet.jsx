import { useRef } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import RequestDateFilter from "./request-date-filter";

const { height } = Dimensions.get("window");

const DEFAULT_SORT_OPTIONS = [
  { key: "newest", label: "Newest First", icon: "time-outline" },
  { key: "oldest", label: "Oldest First", icon: "calendar-outline" },
  { key: "status", label: "Status", icon: "flag-outline" },
];

const SortOption = ({ label, icon, onPress, isActive }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
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
        className={`flex-row items-center p-4 ${isActive ? "bg-orange-50" : ""}`}
      >
        <Ionicons
          name={icon}
          size={20}
          color={isActive ? "#f97316" : "#6B7280"}
          style={{ marginRight: 12 }}
        />
        <Text
          className={`text-base ${
            isActive ? "text-orange-500 font-medium" : "text-slate-700"
          }`}
        >
          {label}
        </Text>
        {isActive ? (
          <Ionicons
            name="checkmark"
            size={20}
            color="#f97316"
            style={{ marginLeft: "auto" }}
          />
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
};

/**
 * Sort & date-filter bottom sheet used by request list screens.
 */
export default function RequestSortSheet({
  visible,
  onClose,
  sortOption,
  onSelectSort,
  sortOptions = DEFAULT_SORT_OPTIONS,
  dateFilter,
  onChangeDate,
  datePlaceholder = "Search by date",
  panHandlers,
  backgroundOpacity,
  translateY,
}) {
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0, 0, 0, 0.5)", opacity: backgroundOpacity },
        ]}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
        style={{
          transform: [{ translateY }],
          paddingBottom: Platform.OS === "ios" ? 30 : 20,
        }}
        {...(panHandlers ?? {})}
      >
        <View className="items-center py-3">
          <View className="w-10 h-1 bg-slate-200 rounded-full" />
        </View>

        <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
          <Text className="text-lg font-bold text-slate-800">
            {"Sort & filter"}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#64748b" />
          </TouchableOpacity>
        </View>

        <View className="px-5 pt-4 pb-1">
          <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            Date
          </Text>
          <RequestDateFilter
            value={dateFilter}
            onChange={onChangeDate}
            placeholder={datePlaceholder}
          />
        </View>

        <Text className="px-5 pt-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
          Sort by
        </Text>

        {sortOptions.map((option) => (
          <SortOption
            key={option.key}
            label={option.label}
            icon={option.icon}
            isActive={sortOption === option.key}
            onPress={() => onSelectSort(option.key)}
          />
        ))}
      </Animated.View>
    </View>
  );
}

export { height as REQUEST_SORT_SHEET_HEIGHT };
