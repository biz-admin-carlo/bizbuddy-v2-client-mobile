import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function RequestEmptyState({
  icon = "document-text-outline",
  title = "No requests",
  message,
}) {
  return (
    <View className="flex-1 justify-center items-center py-16 px-6">
      <View className="w-20 h-20 rounded-full bg-orange-50 items-center justify-center mb-5">
        <Ionicons name={icon} size={36} color="#fdba74" />
      </View>
      <Text className="text-slate-700 text-lg font-semibold mb-2 text-center">
        {title}
      </Text>
      <Text className="text-slate-500 text-center text-sm leading-5">
        {message}
      </Text>
    </View>
  );
}
