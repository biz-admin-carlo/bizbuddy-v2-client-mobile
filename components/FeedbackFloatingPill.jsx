"use client";

import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Linking,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { FEEDBACK_EMAIL, VERSION } from "../config/constant";

export default function FeedbackFloatingPill({ tabBarHeight = 0 }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const fallbackTabBarHeight = Platform.OS === "ios" ? 90 : 70;
  const resolvedTabBarHeight = tabBarHeight || fallbackTabBarHeight;
  const bottomOffset = resolvedTabBarHeight + Math.max(insets.bottom, 8) + 8;

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const sendFeedback = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert("Message required", "Please describe your feedback before sending.");
      return;
    }

    const subj =
      subject.trim() || "BizBuddy app feedback";
    const body = `${trimmed}\n\n---\nApp version: ${VERSION}\nPlatform: ${Platform.OS}`;

    const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
      subj
    )}&body=${encodeURIComponent(body)}`;

    try {
      const supported = await Linking.canOpenURL(mailto);
      if (!supported) {
        Alert.alert(
          "Email not available",
          "No email app is configured on this device. You can reach us at " +
            FEEDBACK_EMAIL
        );
        return;
      }
      await Linking.openURL(mailto);
      close();
      setMessage("");
      setSubject("");
    } catch {
      Alert.alert("Error", "Could not open your email app. Try again or email us directly.");
    }
  }, [subject, message, close]);

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          right: 16,
          bottom: bottomOffset,
          zIndex: 50,
        }}
      >
        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.85}
          className="flex-row items-center"
          style={{
            backgroundColor: "#f97316",
            borderWidth: 1,
            borderColor: "#ea580c",
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 999,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.28,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
          <Text className="text-white font-semibold text-sm ml-2">Feedback</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={close}
            className="flex-1 bg-black/50 justify-end"
          >
            <View
              className="bg-white rounded-t-3xl max-h-[85%]"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              <View className="items-center pt-3 pb-2">
                <View className="w-10 h-1 rounded-full bg-slate-300" />
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                className="px-5"
                showsVerticalScrollIndicator={false}
              >
                <Text className="text-xl font-bold text-slate-800 mb-1">
                  Send feedback
                </Text>
                <Text className="text-slate-500 text-sm mb-5">
                  We read every message. Your mail app will open to send to our team.
                </Text>

                <Text className="text-slate-700 font-medium text-sm mb-2">
                  Subject (optional)
                </Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="e.g. Bug on payroll screen"
                  placeholderTextColor="#94a3b8"
                  className="border border-slate-200 rounded-xl px-4 py-3 text-slate-800 mb-4"
                />

                <Text className="text-slate-700 font-medium text-sm mb-2">
                  Your feedback
                </Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Tell us what happened or what we could improve..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  textAlignVertical="top"
                  className="border border-slate-200 rounded-xl px-4 py-3 text-slate-800 min-h-[140px] mb-6"
                />

                <TouchableOpacity
                  onPress={sendFeedback}
                  className="bg-orange-500 py-4 rounded-xl items-center mb-3"
                  activeOpacity={0.85}
                >
                  <Text className="text-white font-semibold text-base">
                    Open email app
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={close}
                  className="py-4 rounded-xl items-center border border-slate-200 mb-2"
                >
                  <Text className="text-slate-700 font-medium">Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
