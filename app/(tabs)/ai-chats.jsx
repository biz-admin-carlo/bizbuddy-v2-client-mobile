"use client";

import { useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const INITIAL_MESSAGES = [
  {
    id: "1",
    role: "assistant",
    text: "Hi! I am buddyAI. Ask me anything about payroll, leaves, or schedules.",
    time: "9:30 AM",
  },
  {
    id: "2",
    role: "user",
    text: "Give me a quick summary of pending leave approvals today.",
    time: "9:31 AM",
  },
  {
    id: "3",
    role: "assistant",
    text: "You currently have 4 pending leave approvals. 2 are vacation leave and 2 are emergency leave requests.",
    time: "9:31 AM",
  },
];

export default function AIChats() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const scrollViewRef = useRef(null);

  const getCurrentTimeLabel = () =>
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: trimmed,
      time: getCurrentTimeLabel(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    setTimeout(() => {
      const aiMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        text: `Got it. I am processing: "${trimmed}". I can help with the next best action if you want.`,
        time: getCurrentTimeLabel(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 500);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <View className="px-5 pt-4 pb-3 bg-white border-b border-slate-200">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-2xl font-bold text-slate-800">BuddyAI</Text>
              <Text className="text-sm text-slate-500 mt-1">
                Chat with buddyAI
              </Text>
            </View>
            <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center">
              <Ionicons name="sparkles-outline" size={20} color="#f97316" />
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 18 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
        >
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <View
                key={message.id}
                className={`mb-3 ${isUser ? "items-end" : "items-start"}`}
              >
                <View
                  className={`max-w-[84%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? "bg-orange-400 rounded-br-sm"
                      : "bg-white border border-slate-200 rounded-bl-sm"
                  }`}
                >
                  <Text
                    className={`text-sm leading-5 ${
                      isUser ? "text-white" : "text-slate-700"
                    }`}
                  >
                    {message.text}
                  </Text>
                </View>
                <Text className="text-xs text-slate-400 mt-1 px-1">
                  {message.time}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View className="px-4 pb-4 pt-2 bg-white border-t border-slate-200">
          <View className="flex-row items-end">
            <View className="flex-1 bg-slate-100 rounded-2xl px-3 py-2 mr-2">
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Type your message..."
                placeholderTextColor="#94a3b8"
                multiline
                className="text-slate-700 max-h-28"
              />
            </View>
            <TouchableOpacity
              onPress={handleSend}
              className={`w-11 h-11 rounded-full items-center justify-center ${
                input.trim() ? "bg-orange-400" : "bg-slate-300"
              }`}
              activeOpacity={0.85}
              disabled={!input.trim()}
            >
              <Ionicons name="send" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
