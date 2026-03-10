// app/(tabs)/notifications.jsx

"use client";

import { useState, useEffect, useRef } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications } from "../../hooks/useNotifications";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = 100;

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { notifications, unreadCount, markAsSeen, markAllAsSeen, deleteNotification, refresh } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [localNotifications, setLocalNotifications] = useState([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  
  // Track swipe animations for each notification
  const swipeAnims = useRef({});
  const deletingIds = useRef(new Set());

  // Sync local state with hook
  useEffect(() => {
    setLocalNotifications(notifications);
  }, [notifications]);

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



  // Handle notification tap
  const handleNotificationPress = (notification) => {
    // Navigate if payload contains route information
    const payload = notification.payload;
    if (payload?.targetRoute && typeof payload.targetRoute === "string" && payload.targetRoute.startsWith("/")) {
      router.push(payload.targetRoute);
    }
  };

  // Handle mark as seen button press
  const handleMarkAsSeen = (notificationId, e) => {
    e.stopPropagation();
    markAsSeen(notificationId);
  };

  // Handle delete button press
  const handleDelete = (notificationId, e) => {
    e.stopPropagation();
    animateDelete(notificationId);
  };

  // Animate delete with swipe out
  const animateDelete = (notificationId) => {
    if (deletingIds.current.has(notificationId)) return;
    deletingIds.current.add(notificationId);

    const anim = swipeAnims.current[notificationId];
    if (!anim) {
      swipeAnims.current[notificationId] = new Animated.Value(0);
    }

    Animated.parallel([
      Animated.timing(swipeAnims.current[notificationId], {
        toValue: SCREEN_WIDTH,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(
        swipeAnims.current[notificationId + "_opacity"] || 
        (swipeAnims.current[notificationId + "_opacity"] = new Animated.Value(1)),
        {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }
      ),
    ]).start(() => {
      deleteNotification(notificationId);
      deletingIds.current.delete(notificationId);
      // Clean up animation refs after a delay
      setTimeout(() => {
        delete swipeAnims.current[notificationId];
        delete swipeAnims.current[notificationId + "_opacity"];
      }, 100);
    });
  };

  // Create pan responder for swipe to delete
  const createPanResponder = (notificationId) => {
    const translateX = swipeAnims.current[notificationId] || new Animated.Value(0);
    swipeAnims.current[notificationId] = translateX;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 50;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swipe left enough to delete
          animateDelete(notificationId);
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }
      },
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };


  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top }}
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {/* Header */}
        <View className="px-4 py-4 border-b border-slate-200 bg-white">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-slate-900">
              Notifications
            </Text>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={markAllAsSeen}
                className="px-3 py-1.5 bg-orange-100 rounded-full"
              >
                <Text className="text-xs font-semibold text-orange-600">
                  Mark all seen
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {localNotifications.length === 0 ? (
            <View className="flex-1 items-center justify-center py-20">
              <View className="w-20 h-20 rounded-full bg-slate-100 items-center justify-center mb-4">
                <Ionicons name="notifications-outline" size={40} color="#94a3b8" />
              </View>
              <Text className="text-lg font-semibold text-slate-700 mb-2">
                No notifications
              </Text>
              <Text className="text-sm text-slate-500 text-center">
                You're all caught up!
              </Text>
            </View>
          ) : (
            localNotifications.map((notification, index) => {
              const isSeen = notification.seen;
              const id = notification.id;
              const title = notification.title || notification.message || "Notification";
              const message = notification.message || "";
              const createdAt = notification.createdAt;
              
              // Determine notification type from notificationCode or payload
              const notificationType = notification.payload?.type || 
                (notification.notificationCode === "NOTIF001" ? "shift" :
                 notification.notificationCode === "NOTIF002" ? "leave" :
                 notification.notificationCode === "NOTIF003" ? "payroll" : null);

              // Get or create animation values for this notification
              if (!swipeAnims.current[id]) {
                swipeAnims.current[id] = new Animated.Value(0);
                swipeAnims.current[id + "_opacity"] = new Animated.Value(1);
              }
              
              const translateX = swipeAnims.current[id];
              const opacity = swipeAnims.current[id + "_opacity"];
              const panResponder = createPanResponder(id);

              return (
                <View key={id || index} className="mb-3" style={{ overflow: "hidden" }}>
                  <Animated.View
                    style={{
                      transform: [{ translateX }],
                      opacity,
                    }}
                    {...panResponder.panHandlers}
                  >
                    <TouchableOpacity
                      onPress={() => handleNotificationPress(notification)}
                      className={`bg-white rounded-xl p-4 border ${
                        isSeen
                          ? "border-slate-100"
                          : "border-orange-200 bg-orange-50"
                      }`}
                      activeOpacity={0.7}
                    >
                      <View className="flex-row">
                        {/* Content */}
                        <View className="flex-1">
                          {/* Title Row */}
                          <View className="flex-row items-start justify-between mb-1">
                            <Text
                              className={`flex-1 text-base font-semibold ${
                                isSeen ? "text-slate-700" : "text-slate-900"
                              }`}
                              numberOfLines={2}
                            >
                              {title}
                            </Text>
                            {/* Unread Dot - Top Right */}
                            {!isSeen && (
                              <View className="w-2 h-2 rounded-full bg-orange-500 ml-2 mt-1" />
                            )}
                          </View>

                          {/* Message */}
                          {message && (
                            <Text
                              className={`text-sm mb-3 ${
                                isSeen ? "text-slate-600" : "text-slate-700"
                              }`}
                              numberOfLines={3}
                            >
                              {message}
                            </Text>
                          )}

                          {/* Bottom Row: Timestamp and Action Buttons */}
                          <View className="flex-row items-center justify-between">
                            {/* Timestamp - Bottom Left */}
                            <View className="flex-row items-center">
                              <Ionicons name="time-outline" size={12} color="#94a3b8" />
                              <Text className="text-xs text-slate-400 ml-1">
                                {formatDate(createdAt)}
                              </Text>
                            </View>

                            {/* Action Buttons - Bottom Right */}
                            <View className="flex-row items-center gap-2">
                              {!isSeen && (
                                <TouchableOpacity
                                  onPress={(e) => handleMarkAsSeen(id, e)}
                                  className="w-6 h-6 rounded-full bg-orange-400 items-center justify-center"
                                  activeOpacity={0.8}
                                >
                                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                onPress={(e) => handleDelete(id, e)}
                                className="w-6 h-6 rounded-full bg-slate-200 items-center justify-center"
                                activeOpacity={0.8}
                              >
                                <Ionicons name="close" size={12} color="#64748b" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}
