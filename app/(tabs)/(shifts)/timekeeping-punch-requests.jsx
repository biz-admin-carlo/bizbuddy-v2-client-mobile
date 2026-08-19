// app/(tabs)/(shifts)/timekeeping-punch-requests.jsx

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
  Platform,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
} from "react-native";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  API_BASE_URL,
  DEFAULT_SHIFT_DISPLAY_TIMEZONE,
  REQUEST_PUNCH_LOG_MY_REQUESTS_PATH,
} from "../../../config/constant";
import {
  extractCompanySettingsRaw,
  formatRequestedPunchLogDateOnlyDisplay,
  formatRequestedPunchLogDisplay,
  logCompanySettingsTimeZoneResult,
  parseCompanyTimeZone,
} from "../../../utils/companyTimeZoneUtils";

const { height } = Dimensions.get("window");

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
});

const STATUS_STYLES = {
  approved: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    icon: "checkmark-circle",
    iconColor: "#15803d",
  },
  rejected: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: "close-circle",
    iconColor: "#b91c1c",
  },
  pending: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: "time",
    iconColor: "#b45309",
  },
  default: {
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: "help-circle",
    iconColor: "#64748b",
  },
};

const resolveStatusStyle = (status) => {
  const key = String(status ?? "").toLowerCase();
  if (key.includes("approved")) return STATUS_STYLES.approved;
  if (key.includes("reject")) return STATUS_STYLES.rejected;
  if (key.includes("pending")) return STATUS_STYLES.pending;
  return STATUS_STYLES.default;
};

const PunchStatusBadge = ({ status }) => {
  const style = resolveStatusStyle(status);
  const label = String(status ?? "—");

  return (
    <View
      className={`flex-row items-center rounded-lg px-2.5 py-1 border ${style.bg} ${style.border}`}
    >
      <Ionicons
        name={style.icon}
        size={13}
        color={style.iconColor}
        style={{ marginRight: 4 }}
      />
      <Text className={`text-xs font-semibold capitalize ${style.text}`}>
        {label}
      </Text>
    </View>
  );
};

const DetailRow = ({ icon, label, value }) => (
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

const FilterOption = ({ label, isActive, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
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
    setTimeout(onPress, 100);
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        className={`px-4 py-2 rounded-full mr-2 border ${
          isActive
            ? "bg-orange-500 border-orange-500"
            : "bg-white border-slate-200"
        }`}
      >
        <Text
          className={`text-sm font-semibold ${
            isActive ? "text-white" : "text-slate-600"
          }`}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

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

const punchRequestStatus = (row) =>
  row?.status ??
  row?.requestStatus ??
  row?.state ??
  row?.approvalStatus ??
  "—";

const punchRequestLabel = (row, companyTimeZone) => {
  const dateValue = row?.submittedAt ?? row?.createdAt ?? row?.updatedAt;
  const label = formatRequestedPunchLogDateOnlyDisplay(
    dateValue,
    companyTimeZone,
  );
  return label ?? "Punch log request";
};

const resolveApproverName = (row) => {
  const approver = row?.approver ?? row?.Approver ?? row?.approverUser ?? null;
  if (approver) {
    const fullName =
      `${approver.profile?.firstName ?? ""} ${approver.profile?.lastName ?? ""}`.trim();
    return fullName || approver.username || String(approver.id ?? approver.userId ?? "");
  }
  if (row?.approverId != null) return `ID ${row.approverId}`;
  return null;
};

const formatEstimatedDuration = (row) => {
  const mins = row?.estimatedDuration;
  if (mins != null && Number.isFinite(Number(mins))) {
    const total = Number(mins);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }
  const hours = row?.estimatedNetHours;
  if (hours != null && Number.isFinite(Number(hours))) {
    return `${Number(hours)} hours`;
  }
  return null;
};

const resolveRequestedDateLabel = (row, companyTimeZone) => {
  const raw = row?.requestedDate;
  if (raw) {
    const label = formatRequestedPunchLogDateOnlyDisplay(raw, companyTimeZone);
    if (label) return label;
  }
  const clockIn = row?.requestedClockIn ?? row?.clockIn ?? row?.timeIn;
  return formatRequestedPunchLogDateOnlyDisplay(clockIn, companyTimeZone) ?? "—";
};

const filterPunchRequests = (list, activeFilter) => {
  if (activeFilter === "all") return list;
  const target = activeFilter.toLowerCase();
  return list.filter((row) => {
    const status = String(punchRequestStatus(row)).toLowerCase();
    if (target === "pending") return status.includes("pending");
    return status === target;
  });
};

const EmptyListComponent = ({ activeFilter }) => (
  <View className="flex-1 justify-center items-center py-16 px-6">
    <View className="w-20 h-20 rounded-full bg-orange-50 items-center justify-center mb-5">
      <Ionicons name="document-text-outline" size={36} color="#fdba74" />
    </View>
    <Text className="text-slate-700 text-lg font-semibold mb-2 text-center">
      No punch log requests
    </Text>
    <Text className="text-slate-500 text-center text-sm leading-5">
      {activeFilter === "all"
        ? "You have not submitted any punch log requests yet. Use the Punch tab to file one."
        : `No ${activeFilter} punch log requests found. Try another filter or pull to refresh.`}
    </Text>
  </View>
);

export default function TimekeepingPunchRequests() {
  const insets = useSafeAreaInsets();
  const [punchRequests, setPunchRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [companyTimeZone, setCompanyTimeZone] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const displayTimeZone = companyTimeZone ?? DEFAULT_SHIFT_DISPLAY_TIMEZONE;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const hasCompletedInitialFetch = useRef(false);

  const filteredRequests = useMemo(
    () => filterPunchRequests(punchRequests, activeFilter),
    [punchRequests, activeFilter],
  );

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
      try {
        const settingsRes = await axios.get(
          `${API_BASE_URL}/api/company-settings`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const logged = logCompanySettingsTimeZoneResult(
          settingsRes,
          "punch-requests:company-settings",
        );
        const parsed =
          parseCompanyTimeZone(extractCompanySettingsRaw(settingsRes)) ??
          logged;
        setCompanyTimeZone(parsed ?? null);
      } catch (tzErr) {
        console.error("Fetch company timezone:", tzErr?.message);
        setCompanyTimeZone(null);
      }
      const res = await axios.get(
        `${API_BASE_URL}${REQUEST_PUNCH_LOG_MY_REQUESTS_PATH}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const list = extractPunchLogRequestList(res.data);
      const sorted = [...list].sort((a, b) => {
        const timeA = new Date(
          a?.submittedAt ?? a?.createdAt ?? a?.updatedAt ?? 0,
        ).getTime();
        const timeB = new Date(
          b?.submittedAt ?? b?.createdAt ?? b?.updatedAt ?? 0,
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

  const openPunchDetail = (row) => {
    setSelectedRequest(row);
    setDetailModalVisible(true);
  };

  const closePunchDetail = () => {
    setDetailModalVisible(false);
    setSelectedRequest(null);
  };

  const renderItem = ({ item: row, index }) => {
    const key = row?.id ?? row?._id ?? index;
    const title = punchRequestLabel(row, displayTimeZone);
    const clockIn = formatRequestedPunchLogDisplay(
      row?.requestedClockIn ?? row?.clockIn ?? row?.timeIn,
      displayTimeZone,
    );
    const clockOut = formatRequestedPunchLogDisplay(
      row?.requestedClockOut ?? row?.clockOut ?? row?.timeOut,
      displayTimeZone,
    );
    const approverName = resolveApproverName(row);
    const reasonStr = String(row?.reason ?? row?.requesterReason ?? "").trim();
    const submittedAt = formatRequestedPunchLogDisplay(
      row?.submittedAt ?? row?.createdAt ?? row?.updatedAt,
      displayTimeZone,
    );

    return (
      <TouchableOpacity
        key={key}
        onPress={() => openPunchDetail(row)}
        activeOpacity={0.85}
        className="mb-3 p-4 bg-white rounded-xl border border-slate-100"
        style={cardShadow}
      >
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-row items-center flex-1 pr-2 min-w-0">
            <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center mr-3">
              <Ionicons name="time-outline" size={20} color="#f97316" />
            </View>
            <View className="flex-1 min-w-0">
              <Text
                className="font-semibold text-slate-800 text-base"
                numberOfLines={1}
              >
                {title}
              </Text>
              {submittedAt && submittedAt !== "—" ? (
                <Text className="text-xs text-slate-500 mt-0.5">
                  Submitted {submittedAt}
                </Text>
              ) : null}
            </View>
          </View>
          <PunchStatusBadge status={punchRequestStatus(row)} />
        </View>

        <View className="bg-slate-50 rounded-lg px-3 py-2.5 mb-3 border border-slate-100">
          <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Requested times
          </Text>
          <View className="flex-row items-center mb-2">
            <Ionicons name="log-in-outline" size={15} color="#94a3b8" />
            <View className="ml-2 flex-1">
              <Text className="text-[11px] font-medium text-slate-400">
                Clock in
              </Text>
              <Text className="text-sm font-medium text-slate-800 leading-5">
                {clockIn}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="log-out-outline" size={15} color="#94a3b8" />
            <View className="ml-2 flex-1">
              <Text className="text-[11px] font-medium text-slate-400">
                Clock out
              </Text>
              <Text className="text-sm font-medium text-slate-800 leading-5">
                {clockOut}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-end justify-between">
          <View className="flex-1 pr-2">
            {approverName ? (
              <Text className="text-xs text-slate-500" numberOfLines={1}>
                Approver: {approverName}
              </Text>
            ) : null}
            {reasonStr ? (
              <Text className="text-xs text-slate-600 mt-1" numberOfLines={2}>
                {reasonStr}
              </Text>
            ) : (
              <Text className="text-xs text-slate-400 mt-1 italic">
                No reason provided
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </View>
      </TouchableOpacity>
    );
  };

  const androidBottom =
    Platform.OS === "android" ? Math.max(insets.bottom, 28) : insets.bottom;

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50"
      edges={["left", "right", "bottom"]}
      style={{ paddingTop: insets.top + 60 }}
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View className="px-4 pb-3 bg-white border-b border-slate-100">
          <View className="flex-row items-center mb-1">
            <Ionicons name="document-text-outline" size={24} color="#f97316" />
            <Text className="text-xl font-bold text-slate-800 ml-2">
              Punch log requests
            </Text>
          </View>

          <Text className="text-slate-500 text-sm mb-4">
            Track status and details for your submitted punch logs
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 8 }}
          >
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
          </ScrollView>
        </View>

        {loading && punchRequests.length === 0 ? (
          <View className="flex-1 justify-center items-center bg-slate-50">
            <ActivityIndicator size="large" color="#f97316" />
            <Text className="mt-4 text-slate-500 text-sm">Loading requests…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRequests}
            keyExtractor={(row, idx) => String(row?.id ?? row?._id ?? idx)}
            renderItem={renderItem}
            className="bg-slate-50"
            contentContainerStyle={[
              {
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: androidBottom + 24,
              },
              filteredRequests.length === 0 && { flex: 1 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchPunchLogRequests(true)}
                colors={["#f97316"]}
                tintColor="#f97316"
              />
            }
            ListEmptyComponent={
              <EmptyListComponent activeFilter={activeFilter} />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>

      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closePunchDetail}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]}
            activeOpacity={1}
            onPress={closePunchDetail}
          />
          <View
            className="bg-white rounded-t-3xl"
            style={{
              maxHeight: height * 0.88,
              paddingBottom: Platform.OS === "ios" ? 34 : 24,
            }}
          >
            {selectedRequest ? (
              <>
                <View className="items-center py-3">
                  <View className="w-10 h-1 bg-slate-200 rounded-full" />
                </View>

                <View className="flex-row justify-between items-start px-5 pb-4 border-b border-slate-100">
                  <View className="flex-row items-center flex-1 pr-3">
                    <View className="w-12 h-12 rounded-full bg-orange-100 items-center justify-center mr-3">
                      <Ionicons name="time-outline" size={24} color="#f97316" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xl font-bold text-slate-800">
                        {punchRequestLabel(selectedRequest, displayTimeZone)}
                      </Text>
                      <Text className="text-slate-500 text-sm mt-0.5">
                        Punch log request details
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={closePunchDetail}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={26} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <View className="px-5 py-3 border-b border-slate-100">
                  <PunchStatusBadge status={punchRequestStatus(selectedRequest)} />
                </View>

                <ScrollView
                  className="px-5 pt-4"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <DetailRow
                    icon="time-outline"
                    label="Submitted"
                    value={formatRequestedPunchLogDisplay(
                      selectedRequest.submittedAt ??
                        selectedRequest.createdAt ??
                        selectedRequest.updatedAt,
                      displayTimeZone,
                    )}
                  />
                  <DetailRow
                    icon="calendar-outline"
                    label="Requested date"
                    value={resolveRequestedDateLabel(
                      selectedRequest,
                      displayTimeZone,
                    )}
                  />
                  <DetailRow
                    icon="log-in-outline"
                    label="Clock in (requested)"
                    value={formatRequestedPunchLogDisplay(
                      selectedRequest.requestedClockIn ??
                        selectedRequest.clockIn ??
                        selectedRequest.timeIn,
                      displayTimeZone,
                    )}
                  />
                  <DetailRow
                    icon="log-out-outline"
                    label="Clock out (requested)"
                    value={formatRequestedPunchLogDisplay(
                      selectedRequest.requestedClockOut ??
                        selectedRequest.clockOut ??
                        selectedRequest.timeOut,
                      displayTimeZone,
                    )}
                  />
                  {formatEstimatedDuration(selectedRequest) ? (
                    <DetailRow
                      icon="hourglass-outline"
                      label="Estimated duration"
                      value={formatEstimatedDuration(selectedRequest)}
                    />
                  ) : null}
                  <DetailRow
                    icon="document-text-outline"
                    label="Reason"
                    value={
                      String(
                        selectedRequest.reason ??
                          selectedRequest.requesterReason ??
                          "",
                      ).trim() || "No reason provided"
                    }
                  />
                  <DetailRow
                    icon="reader-outline"
                    label="Description"
                    value={
                      String(selectedRequest.description ?? "").trim() ||
                      "No description provided"
                    }
                  />
                  {resolveApproverName(selectedRequest) ? (
                    <DetailRow
                      icon="person-outline"
                      label="Approver"
                      value={resolveApproverName(selectedRequest)}
                    />
                  ) : null}
                  <DetailRow
                    icon="chatbubble-outline"
                    label="Approver comments"
                    value={
                      String(
                        selectedRequest.approverComments ??
                          selectedRequest.approverComment ??
                          "",
                      ).trim() || "No comments yet"
                    }
                  />
                  {selectedRequest.id != null || selectedRequest._id != null ? (
                    <DetailRow
                      icon="finger-print-outline"
                      label="Request ID"
                      value={String(selectedRequest.id ?? selectedRequest._id)}
                    />
                  ) : null}
                </ScrollView>

                <View className="px-5 pt-2">
                  <TouchableOpacity
                    onPress={closePunchDetail}
                    activeOpacity={0.85}
                    className="bg-orange-500 rounded-xl py-3.5 items-center"
                  >
                    <Text className="text-white font-semibold text-base">Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
