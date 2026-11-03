import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function ComingSoon({
  title,
  subtitle,
  icon,
  headline,
  body,
  cards,
  tags,
  onBack,
}) {
  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            className="flex-row items-center mb-4"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={18} color="#f97316" />
            <Text className="text-orange-500 ml-2 text-sm">Back</Text>
          </TouchableOpacity>
        ) : null}
        <Text className="text-2xl font-semibold text-slate-900">{title}</Text>
        <Text className="text-sm text-slate-500 mt-1 mb-6">{subtitle}</Text>

        <View className="border border-slate-300 rounded-md bg-white p-6 items-center">
          <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center mb-4">
            <Ionicons name={icon} size={28} color="#94a3b8" />
          </View>
          <Text className="text-lg font-semibold text-slate-900 text-center mb-2">
            {headline}
          </Text>
          <Text className="text-sm text-slate-500 text-center mb-6">{body}</Text>

          {cards.map((card) => (
            <View
              key={card.title}
              className="w-full border border-slate-200 rounded-md p-4 mb-3"
            >
              <View
                className="w-8 h-8 rounded-md items-center justify-center mb-2"
                style={{ backgroundColor: card.tint }}
              >
                <Ionicons name={card.icon} size={16} color={card.color} />
              </View>
              <Text className="text-sm font-semibold text-slate-900">{card.title}</Text>
              <Text className="text-xs text-slate-500 mt-1">{card.body}</Text>
            </View>
          ))}

          <View className="w-full mt-4 pt-4 border-t border-slate-200">
            <Text className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-3">
              Planned features
            </Text>
            <View className="flex-row flex-wrap">
              {tags.map((tag) => (
                <View key={tag} className="bg-slate-100 rounded-full px-3 py-1 mr-2 mb-2">
                  <Text className="text-xs font-medium text-slate-700">{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
