// components/temporary-page.jsx

"use client";

import { useState, useEffect, useRef } from "react";
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, Animated, Dimensions, ActivityIndicator } from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function TemporaryPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState(".");

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Animated dots for loading indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : prev + "."));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Fake progress animation
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.random() * 5;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fade + slide in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Animate button press
  const animateButtonPress = () => {
    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.95, duration: 70, useNativeDriver: true }),
      Animated.spring(buttonScale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
    ]).start();
  };

  // Handle back navigation
  const handleBack = () => {
    animateButtonPress();
    router.back();
  };

  // Handle refresh
  const handleRefresh = () => {
    animateButtonPress();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 1500);
  };

  return (
    <SafeAreaView className="flex-1 bg-white " style={{ paddingTop: insets.top }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <ScrollView className="flex-1" contentContainerClassName="p-4 pb-8 mt-10">
          {/* Status cards */}
          <View className="flex-row justify-between mb-6 gap-2">
            {/* Status 1 */}
            <View className="flex-1 bg-slate-50 rounded-xl p-2">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-orange-100 items-center justify-center mr-2">
                  <Ionicons name="construct-outline" size={16} color="#fb923c" />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">Status</Text>
                  <Text className="text-sm font-medium text-slate-700">In Progress</Text>
                </View>
              </View>
            </View>

            {/* Status 2 */}
            <View className="flex-1 bg-slate-50 rounded-xl p-2">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-orange-100 items-center justify-center mr-2">
                  <Ionicons name="time-outline" size={16} color="#fb923c" />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">ETA</Text>
                  <Text className="text-sm font-medium text-slate-700">Coming Soon</Text>
                </View>
              </View>
            </View>

            {/* Status 3 */}
            <View className="flex-1 bg-slate-50 rounded-xl p-2">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-orange-100 items-center justify-center mr-2">
                  <Ionicons name="code-outline" size={16} color="#fb923c" />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">Version</Text>
                  <Text className="text-sm font-medium text-slate-700">1.0.0</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Main status card */}
          <Animated.View className="bg-slate-50 rounded-xl p-5 mb-6 border border-slate-100" style={{ transform: [{ scale: pulseAnim }] }}>
            <View className="items-center mb-4">
              <View className="w-16 h-16 rounded-full bg-orange-100 items-center justify-center mb-2">
                <Ionicons name="construct" size={32} color="#fb923c" />
              </View>
              <Text className="text-2xl font-bold text-slate-800">Under Construction</Text>
              <Text className="text-sm text-slate-500 mt-1">We're working on this page{dots}</Text>
            </View>

            {/* Progress */}
            <View className="bg-white rounded-lg p-4 mb-3">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center">
                  <Feather name="activity" size={16} color="#f97316" />
                  <Text className="ml-2 text-sm font-medium text-slate-700">Development Progress</Text>
                </View>
                <Text className="text-base font-semibold text-slate-800">{Math.round(progress)}%</Text>
              </View>
              <View className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <View className="h-full bg-orange-400 rounded-full" style={{ width: `${progress}%` }} />
              </View>
            </View>

            {/* Feature 1 */}
            <View className="bg-white rounded-lg p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Feather name="check-circle" size={16} color="#f97316" />
                  <Text className="ml-2 text-sm font-medium text-slate-700">Feature 1</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-base font-semibold text-slate-800">Coming Soon</Text>
                </View>
              </View>
            </View>

            {/* Feature 2 */}
            <View className="bg-white rounded-lg p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Feather name="check-circle" size={16} color="#f97316" />
                  <Text className="ml-2 text-sm font-medium text-slate-700">Feature 2</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-base font-semibold text-slate-800">Coming Soon</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Back button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              onPress={handleBack}
              disabled={loading}
              className="py-4 rounded-lg items-center justify-center mb-4 bg-orange-400"
              activeOpacity={0.8}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Back</Text>}
            </TouchableOpacity>
          </Animated.View>

          {/* Refresh button */}
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={loading}
            className="py-4 rounded-lg items-center justify-center bg-slate-100"
            activeOpacity={0.8}
          >
            <View className="flex-row items-center">
              <Feather name="refresh-cw" size={16} color="#64748b" />
              <Text className="text-slate-700 font-semibold ml-2 text-lg">Check Again</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}
