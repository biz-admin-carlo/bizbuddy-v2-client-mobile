"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert as RNAlert,
  Animated,
  TouchableOpacity,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../../config/constant";

const toLocalDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const toLocalTimeString = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const OvertimeStatusBadge = ({ status }) => {
  const normalized = (status || "").toLowerCase();
  let bgColor, textColor, icon;

  switch (normalized) {
    case "approved":
      bgColor = "bg-green-100";
      textColor = "text-green-800";
      icon = "checkmark-circle";
      break;
    case "rejected":
      bgColor = "bg-red-100";
      textColor = "text-red-800";
      icon = "close-circle";
      break;
    case "pending":
      bgColor = "bg-amber-100";
      textColor = "text-amber-800";
      icon = "time";
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-800";
      icon = "help-circle";
  }

  return (
    <View className={`flex-row items-center rounded-full px-3 py-1 ${bgColor}`}>
      <Ionicons
        name={icon}
        size={14}
        color={textColor.replace("text-", "")}
        style={{ marginRight: 4 }}
      />
      <Text className={`text-xs font-medium ${textColor}`}>
        {status || "Unknown"}
      </Text>
    </View>
  );
};

const FilterOption = ({ label, isActive, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.92,
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
  };

  const handlePress = () => {
    animatePress();
    setTimeout(onPress, 100);
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        className={`px-4 py-2 rounded-full mr-2 ${
          isActive ? "bg-orange-400" : "bg-gray-100"
        }`}
      >
        <Text
          className={`text-sm font-medium ${
            isActive ? "text-white" : "text-gray-700"
          }`}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const EmptyListComponent = ({ activeFilter }) => (
  <View className="flex-1 justify-center items-center py-10">
    <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-4">
      <Ionicons name="time-outline" size={28} color="#9CA3AF" />
    </View>
    <Text className="text-gray-500 text-lg font-medium mb-1">
      No overtime records
    </Text>
    <Text className="text-gray-400 text-center px-10">
      {activeFilter === "all"
        ? "You don't have any overtime records yet. Submit an overtime request to get started."
        : `No ${activeFilter} overtime requests found.`}
    </Text>
  </View>
);

const OvertimeManage = () => {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const router = useRouter();

  const fetchOvertimeRequests = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert(
          "Authentication Error",
          "You are not logged in. Please sign in again.",
          [{ text: "OK", onPress: () => router.replace("(auth)/signin") }]
        );
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/overtime/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      console.log(
        "[OT/My] fetchOvertimeRequests → status:",
        res.status,
        "ok:",
        res.ok
      );
      console.log("[OT/My] Raw response:", data);

      if (res.ok && Array.isArray(data.data)) {
        const sorted = [...data.data].sort((a, b) => {
          const aT = new Date(a.createdAt || a.fromDate || 0).getTime();
          const bT = new Date(b.createdAt || b.fromDate || 0).getTime();
          return bT - aT;
        });
        setRequests(sorted);
        applyFilters(sorted, activeFilter);
      } else {
        setRequests([]);
        applyFilters([], activeFilter);
      }
    } catch (error) {
      console.error("Error fetching overtime requests:", error);
      RNAlert.alert(
        "Error",
        "An error occurred while fetching overtime requests."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = useCallback((data, filter) => {
    let result = [...data];
    if (filter !== "all") {
      result = result.filter(
        (item) =>
          (item.status || "").toLowerCase() === (filter || "").toLowerCase()
      );
    }
    setFilteredRequests(result);
  }, []);

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

    fetchOvertimeRequests();
  }, []);

  useEffect(() => {
    applyFilters(requests, activeFilter);
  }, [requests, activeFilter, applyFilters]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOvertimeRequests();
  };

  const renderItem = ({ item }) => {
    const cardScale = new Animated.Value(1);
    const animatePress = () => {
      Animated.sequence([
        Animated.timing(cardScale, {
          toValue: 0.97,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    };

    const created = item.createdAt ? new Date(item.createdAt) : null;
    const from = item.fromDate ? new Date(item.fromDate) : null;
    const to = item.toDate ? new Date(item.toDate) : null;
    const tl = item.timeLog || {};
    const tlStartRaw =
      tl.actualStart ||
      tl.start ||
      tl.clockIn ||
      tl.punchIn ||
      tl.in ||
      tl.inTime;
    const tlEndRaw =
      tl.actualEnd ||
      tl.end ||
      tl.clockOut ||
      tl.punchOut ||
      tl.out ||
      tl.outTime;
    const tlSchedEndRaw =
      tl.scheduledEnd || tl.scheduleEnd || tl.shiftEnd || tl.expectedEnd;

    return (
      <Animated.View style={{ transform: [{ scale: cardScale }] }}>
        <TouchableOpacity
          onPress={animatePress}
          activeOpacity={0.9}
          className="mb-4 rounded-xl overflow-hidden bg-white"
          style={styles.cardShadow}
        >
          <View className="p-3 bg-slate-50 rounded-lg">
            {/* Top row: date and status */}
            <View className="flex-row justify-between items-center pb-4 border-b border-slate-200">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-orange-100 items-center justify-center mr-2">
                  <Ionicons name="time-outline" size={18} color="#f97316" />
                </View>
                <Text className="text-base font-semibold text-slate-700">
                  {created
                    ? created.toLocaleDateString()
                    : from
                    ? from.toLocaleDateString()
                    : "Overtime Request"}
                </Text>
              </View>
              <OvertimeStatusBadge status={item.status || "pending"} />
            </View>

            {/* Details */}
            <View className="rounded-lg p-3 border-b border-slate-200">
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                  From: {toLocalDateTime(item.fromDate)}
                </Text>
              </View>
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                  To: {toLocalDateTime(item.toDate)}
                </Text>
              </View>
              {tlStartRaw || tlEndRaw || tlSchedEndRaw ? (
                <View className="flex-row items-center mb-1">
                  <Ionicons
                    name="clipboard-outline"
                    size={16}
                    color="#6B7280"
                  />
                  <Text className="text-gray-600 text-sm ml-2">
                    Time Log: {toLocalTimeString(tlStartRaw) || "?"} –{" "}
                    {toLocalTimeString(tlEndRaw) || "?"}
                    {tlSchedEndRaw
                      ? ` (Sched end ${toLocalTimeString(tlSchedEndRaw)})`
                      : ""}
                  </Text>
                </View>
              ) : null}
              {item.requestedHours ? (
                <View className="flex-row items-center mb-1">
                  <Ionicons name="timer-outline" size={16} color="#6B7280" />
                  <Text className="text-gray-600 text-sm ml-2">
                    Requested Hours: {String(item.requestedHours)}
                  </Text>
                </View>
              ) : null}
              {item.overtimeReason || item.requesterReason ? (
                <View className="flex-row items-center">
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color="#6B7280"
                  />
                  <Text
                    className="text-gray-600 text-sm ml-2"
                    numberOfLines={2}
                  >
                    {item.overtimeReason || item.requesterReason}
                  </Text>
                </View>
              ) : null}
            </View>

            {item.approver && item.approver.email ? (
              <View className="rounded-lg p-3">
                <View className="flex-row items-center mb-1">
                  <Ionicons name="person-outline" size={16} color="#6B7280" />
                  <Text className="text-gray-600 text-sm ml-2">
                    Approver: {item.approver.email}
                  </Text>
                </View>
                {item.approverComments ? (
                  <View className="flex-row items-center">
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={16}
                      color="#6B7280"
                    />
                    <Text
                      className="text-gray-600 text-sm ml-2"
                      numberOfLines={2}
                    >
                      Comments: {String(item.approverComments)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ paddingTop: 70 }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View className="px-4 pb-2">
          {/* Header */}
          <Text className="text-2xl font-bold text-slate-800">
            Overtime History
          </Text>
          <Text className="text-slate-500 mb-4">
            View all your overtime requests and their status
          </Text>

          {/* Filter row */}
          <View className="flex-row mb-4">
            <FilterOption
              label="All"
              isActive={activeFilter === "all"}
              onPress={() => setActiveFilter("all")}
            />
            <FilterOption
              label="Pending"
              isActive={activeFilter === "pending"}
              onPress={() => setActiveFilter("pending")}
            />
            <FilterOption
              label="Approved"
              isActive={activeFilter === "approved"}
              onPress={() => setActiveFilter("approved")}
            />
            <FilterOption
              label="Rejected"
              isActive={activeFilter === "rejected"}
              onPress={() => setActiveFilter("rejected")}
            />
          </View>
        </View>

        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#cbd5e1" />
          </View>
        ) : (
          <FlatList
            data={filteredRequests}
            keyExtractor={(item, index) =>
              (item.id || item._id || item.requestId || index).toString()
            }
            renderItem={renderItem}
            contentContainerStyle={[
              { paddingHorizontal: 16, paddingBottom: 20 },
              filteredRequests.length === 0 && { flex: 1 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#cbd5e1"]}
                tintColor={Platform.OS === "ios" ? "#cbd5e1" : undefined}
              />
            }
            ListEmptyComponent={
              <EmptyListComponent activeFilter={activeFilter} />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
};

export default OvertimeManage;

const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
});
