import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  StyleSheet,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

const applyLocalDate = (selectedDate) => {
  if (!(selectedDate instanceof Date) || !Number.isFinite(selectedDate.getTime())) {
    return null;
  }
  return new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
  );
};

export default function RequestDateFilter({
  value,
  onChange,
  placeholder = "Search by requested date",
}) {
  const [pickerVisible, setPickerVisible] = useState(false);

  const openPicker = () => {
    const current = value ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onChange: (event, selectedDate) => {
          if (event?.type !== "set" || !selectedDate) return;
          const next = applyLocalDate(selectedDate);
          if (next) onChange(next);
        },
      });
      return;
    }
    setPickerVisible(true);
  };

  return (
    <>
      <View
        className={`mt-3 py-2.5 px-3 rounded-xl border flex-row items-center ${
          value ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200"
        }`}
      >
        <TouchableOpacity
          onPress={openPicker}
          activeOpacity={0.85}
          className="flex-1 flex-row items-center"
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color={value ? "#ea580c" : "#64748b"}
          />
          <Text
            className={`flex-1 ml-2 text-sm font-medium ${
              value ? "text-orange-800" : "text-slate-600"
            }`}
          >
            {value ? value.toLocaleDateString() : placeholder}
          </Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity
            onPress={() => onChange(null)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color="#ea580c" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openPicker} hitSlop={8}>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {Platform.OS === "ios" && pickerVisible ? (
        <Modal
          visible={pickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerVisible(false)}
        >
          <View className="flex-1 justify-center px-6">
            <TouchableOpacity
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(0,0,0,0.45)" },
              ]}
              activeOpacity={1}
              onPress={() => setPickerVisible(false)}
            />
            <View className="bg-white rounded-2xl p-4">
              <Text className="text-lg font-bold text-slate-800 mb-2 text-center">
                Requested date
              </Text>
              <DateTimePicker
                value={value ?? new Date()}
                mode="date"
                display="spinner"
                onChange={(_event, selectedDate) => {
                  const next = applyLocalDate(selectedDate);
                  if (next) onChange(next);
                }}
                themeVariant="light"
                textColor="#0f172a"
                style={{ width: "100%" }}
              />
              <TouchableOpacity
                onPress={() => setPickerVisible(false)}
                className="bg-orange-500 py-3 rounded-xl items-center mt-2"
              >
                <Text className="text-white font-semibold">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
