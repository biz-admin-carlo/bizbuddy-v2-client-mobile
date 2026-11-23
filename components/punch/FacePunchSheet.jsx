import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import FaceCaptureSegment from "../task-report/FaceCaptureSegment";

export default function FacePunchSheet({ action, timeZone, busy, onConfirm, onCancel }) {
  const verb = action === "in" ? "clock in" : "clock out";
  return (
    <View className="px-6">
      <Text className="text-2xl font-bold text-slate-900 mb-2 text-center">
        Face check
      </Text>
      <Text className="text-base text-slate-600 text-center mb-4">
        Your company needs a face photo to {verb}.
      </Text>
      <FaceCaptureSegment
        action={action}
        timeZone={timeZone}
        onChange={(shot) => {
          if (shot?.uri && !busy) onConfirm(shot);
        }}
      />
      {busy ? (
        <View className="py-4 items-center mb-8">
          <ActivityIndicator color="#0f172a" />
        </View>
      ) : (
        <TouchableOpacity
          onPress={onCancel}
          className="py-3.5 rounded-2xl items-center bg-slate-100 border border-slate-200 mb-8"
        >
          <Text className="text-slate-700 font-semibold text-base">Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
