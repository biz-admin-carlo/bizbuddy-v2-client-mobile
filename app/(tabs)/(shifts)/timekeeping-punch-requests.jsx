// app/(tabs)/(shifts)/timekeeping-punch-requests.jsx

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
  Platform,
} from "react-native";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  API_BASE_URL,
  REQUEST_PUNCH_LOG_MY_REQUESTS_PATH,
} from "../../../config/constant";
import { formatNaivePunchLogDateTimeDisplay } from "../../../utils/companyTimeZoneUtils";

const extractPunchLogRequestList = (body) => {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  const d = body.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    if (Array.isArray(d.requests)) return d.requests;
    if (Array.isArray(d.items)) return d.items;
  }
  if (Array.isArray(body.requests)) return body.requests;
  return [];
};

const datePrefixFromDateTimeString = (s) => {
  if (typeof s !== "string") return null;
  const t = s.trim();
  const i = t.indexOf("T");
  if (i === 10 && /^\d{4}-\d{2}-\d{2}$/.test(t.slice(0, 10))) return t.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
};

const punchRequestStatus = (row) =>
  row?.status ??
  row?.requestStatus ??
  row?.state ??
  row?.approvalStatus ??
  "—";

const punchRequestLabel = (row) => {
  if (row?.requestedDate != null && row.requestedDate !== "")
    return formatNaivePunchLogDateTimeDisplay(String(row.requestedDate).trim());
  if (row?.requestDate != null && row.requestDate !== "")
    return formatNaivePunchLogDateTimeDisplay(String(row.requestDate).trim());
  if (row?.requestedClockIn != null && row.requestedClockIn !== "") {
    const raw = String(row.requestedClockIn).trim();
    const prefix = datePrefixFromDateTimeString(raw);
    if (prefix) return formatNaivePunchLogDateTimeDisplay(prefix);
    return formatNaivePunchLogDateTimeDisplay(raw);
  }
  return "Request";
};

export default function TimekeepingPunchRequests() {
  const insets = useSafeAreaInsets();
  const [punchRequests, setPunchRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const hasCompletedInitialFetch = useRef(false);

  const fetchPunchLogRequests = useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) setRefreshing(true);
    else if (!hasCompletedInitialFetch.current) setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        Alert.alert("Authentication", "Please sign in again.");
        setPunchRequests([]);
        return;
      }
      const res = await axios.get(`${API_BASE_URL}${REQUEST_PUNCH_LOG_MY_REQUESTS_PATH}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = extractPunchLogRequestList(res.data);
      const sorted = [...list].sort((a, b) => {
        const timeA = new Date(
          a?.createdAt ?? a?.updatedAt ?? a?.requestedClockIn ?? 0,
        ).getTime();
        const timeB = new Date(
          b?.createdAt ?? b?.updatedAt ?? b?.requestedClockIn ?? 0,
        ).getTime();
        return timeB - timeA;
      });
      setPunchRequests(sorted);
      hasCompletedInitialFetch.current = true;
    } catch (error) {
      console.error("Fetch punch log requests:", error?.message);
      Alert.alert(
        "Error",
        error.response?.data?.message ||
          "Could not load requested punch logs.",
      );
      setPunchRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
  }, [fadeAnim, slideAnim]);

  useFocusEffect(
    useCallback(() => {
      fetchPunchLogRequests(false);
    }, [fetchPunchLogRequests]),
  );

  const androidBottom = Platform.OS === "android" ? Math.max(insets.bottom, 28) : insets.bottom;
  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top + 60 }}
    >
      <Animated.View
        style={{
          flex: 1,
          paddingTop: insets.top,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {loading && punchRequests.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#f97316" />
            <Text className="mt-4 text-slate-500">Loading requests…</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-4"
            contentContainerStyle={{ paddingBottom: androidBottom + 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchPunchLogRequests(true)}
                tintColor="#cbd5e1"
              />
            }
          >
            <View className="flex-row items-center mb-4">
              <Ionicons name="document-text-outline" size={24} color="#f97316" />
              <Text className="text-xl font-bold text-slate-800 flex-1">Requested punch logs</Text>
            </View>

            {punchRequests.length === 0 ? (
              <View className="py-12 items-center">
                <Ionicons name="document-outline" size={48} color="#cbd5e1" />
                <Text className="text-slate-600 font-medium mt-4 text-center">
                  No punch log requests yet
                </Text>
                <Text className="text-slate-500 text-center mt-2 text-sm">
                  Submit one from the Punch tab, or pull to refresh if you already have requests.
                </Text>
              </View>
            ) : (
              punchRequests.map((row, idx) => {
                const key = row?.id ?? row?._id ?? idx;
                const approver =
                  row?.approver ?? row?.Approver ?? row?.approverUser ?? null;
                const approverName = approver
                  ? `${approver.profile?.firstName ?? ""} ${approver.profile?.lastName ?? ""}`.trim() ||
                    approver.username ||
                    String(approver.id ?? approver.userId ?? "")
                  : row?.approverId != null
                    ? `ID ${row.approverId}`
                    : "—";
                return (
                  <View
                    key={key}
                    className="mb-3 p-4 bg-slate-50 rounded-xl border border-slate-100"
                  >
                    <View className="flex-row justify-between items-start mb-2">
                      <Text className="font-semibold text-slate-800 flex-1 pr-2">
                        {punchRequestLabel(row)}
                      </Text>
                      <View className="bg-white px-2 py-1 rounded-md border border-slate-200">
                        <Text className="text-xs font-medium text-orange-600 capitalize">
                          {String(punchRequestStatus(row))}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs text-slate-500 mb-1">Clock in (requested)</Text>
                    <Text className="text-sm text-slate-700 mb-2">
                      {formatNaivePunchLogDateTimeDisplay(
                        row?.requestedClockIn ?? row?.clockIn ?? row?.timeIn,
                      )}
                    </Text>
                    <Text className="text-xs text-slate-500 mb-1">Clock out (requested)</Text>
                    <Text className="text-sm text-slate-700 mb-2">
                      {formatNaivePunchLogDateTimeDisplay(
                        row?.requestedClockOut ?? row?.clockOut ?? row?.timeOut,
                      )}
                    </Text>
                    <Text className="text-xs text-slate-500 mb-1">Approver</Text>
                    <Text className="text-sm text-slate-700 mb-2">{approverName}</Text>
                    {(() => {
                      const rsn = row?.reason ?? row?.requesterReason;
                      const reasonStr = typeof rsn === "string" ? rsn.trim() : "";
                      if (!reasonStr) return null;
                      return (
                        <>
                          <Text className="text-xs text-slate-500 mb-1">Reason</Text>
                          <Text className="text-sm text-slate-600">{reasonStr}</Text>
                        </>
                      );
                    })()}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}
