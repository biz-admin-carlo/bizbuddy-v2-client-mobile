import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function RequestDetailRow({ icon, label, value }) {
  return (
    <View className="flex-row items-start mb-4 bg-slate-50 rounded-xl px-3 py-3 border border-slate-100">
      <View className="w-9 h-9 rounded-full bg-white items-center justify-center mr-3 border border-slate-100">
        <Ionicons name={icon} size={18} color="#f97316" />
      </View>
      <View className="flex-1">
        <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          {label}
        </Text>
        <Text className="text-slate-800 text-base leading-snug">{value}</Text>
      </View>
    </View>
  );
}
