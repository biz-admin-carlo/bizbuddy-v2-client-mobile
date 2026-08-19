"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert as RNAlert,
  Animated,
  Dimensions,
  Platform,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../../../config/constant";

const { height } = Dimensions.get("window");

// ---------------------------------------------------------------------
// Shared UI pieces (status badge, filter chips, empty state)
// ---------------------------------------------------------------------

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

const formatDateTime = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
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

const FilterOption = ({ label, filterKey, activeFilter, onPress }) => {
  const isActive = activeFilter === filterKey;
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
    setTimeout(() => onPress(filterKey), 100);
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
      No overtime requests
    </Text>
    <Text className="text-gray-400 text-center px-10">
      {activeFilter === "all"
        ? "There are no overtime requests to manage at the moment."
        : `No ${activeFilter} overtime requests found.`}
    </Text>
  </View>
);

// ---------------------------------------------------------------------
// Main ManageOvertimes Component
// ---------------------------------------------------------------------

export default function ManageOvertimes() {
  const [overtimeRequests, setOvertimeRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsOvertime, setActionsOvertime] = useState(null);
  const [processingRequests, setProcessingRequests] = useState({});
  const [approverComments, setApproverComments] = useState("");

  const router = useRouter();

  // Page animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const actionsModalY = useRef(new Animated.Value(height)).current;

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

      // Decode current user identity from JWT so we can scope results
      // to requests that belong to this user (as requester) OR where
      // this user is set as the approver.
      let selfId = null;
      let selfEmail = null;
      try {
        const parts = (token || "").split(".");
        if (parts.length === 3 && typeof atob === "function") {
          const payload = JSON.parse(atob(parts[1] || ""));
          selfId =
            payload?.id ??
            payload?._id ??
            payload?.userId ??
            payload?.accountId ??
            payload?.sub ??
            null;
          selfEmail = payload?.email ?? null;
        }
      } catch (e) {
        console.log("Failed to decode JWT for overtime filtering:", e);
      }

      // For the management view, fetch overtime requests that this user
      // can manage/approve, not just their own history.
      const res = await fetch(`${API_BASE_URL}/api/overtime/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      console.log(
        "[OT/Manage] fetchOvertimeRequests → status:",
        res.status,
        "ok:",
        res.ok
      );
      console.log("[OT/Manage] Raw response:", data);

      if (res.ok && Array.isArray(data.data)) {
        const sorted = [...data.data].sort((a, b) => {
          const aT = new Date(a.createdAt || a.fromDate || 0).getTime();
          const bT = new Date(b.createdAt || b.fromDate || 0).getTime();
          return bT - aT;
        });
        // If we couldn't decode identity, fall back to showing everything.
        let scoped = sorted;
        if (selfId != null || selfEmail) {
          scoped = sorted.filter((req) => {
            const requesterSrc =
              req.requester || req.user || req.User || req.employee || null;
            const approverSrc = req.approver || req.Approver || null;

            const requesterId =
              requesterSrc?.id ||
              requesterSrc?._id ||
              req.userId ||
              req.employeeId ||
              req.requesterId ||
              null;
            const requesterEmail =
              requesterSrc?.email ||
              req.requesterEmail ||
              req.userEmail ||
              null;

            const approverId =
              req.approverId ||
              req.approver ||
              approverSrc?.id ||
              approverSrc?._id ||
              approverSrc?.userId ||
              approverSrc?.accountId ||
              null;
            const approverEmail =
              approverSrc?.email || req.approverEmail || null;

            let isRequester = false;
            let isApprover = false;

            if (selfId != null) {
              if (
                requesterId != null &&
                String(requesterId) === String(selfId)
              ) {
                isRequester = true;
              }
              if (approverId != null && String(approverId) === String(selfId)) {
                isApprover = true;
              }
            }
            if (selfEmail) {
              if (
                requesterEmail &&
                String(requesterEmail).toLowerCase() ===
                  String(selfEmail).toLowerCase()
              ) {
                isRequester = true;
              }
              if (
                approverEmail &&
                String(approverEmail).toLowerCase() ===
                  String(selfEmail).toLowerCase()
              ) {
                isApprover = true;
              }
            }

            // Keep only requests that are either submitted by this user
            // OR where this user is set as the approver.
            return isRequester || isApprover;
          });
        }
        setOvertimeRequests(scoped);
        applyFilters(scoped, activeFilter);
      } else {
        setOvertimeRequests([]);
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
    applyFilters(overtimeRequests, activeFilter);
  }, [overtimeRequests, activeFilter, applyFilters]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOvertimeRequests();
  };

  const openActionsModal = (item) => {
    // Only allow actions while the request is still pending.
    const statusRaw = (item?.status || "").toLowerCase();
    if (!statusRaw.includes("pending")) {
      return;
    }

    setActionsOvertime(item);
    setApproverComments("");
    setActionsModalVisible(true);
    actionsModalY.setValue(height);
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(actionsModalY, {
        toValue: 0,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeActionsModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(actionsModalY, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setActionsModalVisible(false);
      setActionsOvertime(null);
    });
  };

  const confirmApproveOvertime = async () => {
    if (!actionsOvertime) {
      closeActionsModal();
      return;
    }
    const targetId =
      actionsOvertime.id ||
      actionsOvertime._id ||
      actionsOvertime.requestId ||
      null;
    if (!targetId) {
      closeActionsModal();
      return;
    }

    setProcessingRequests((prev) => ({
      ...prev,
      [targetId]: "approving",
    }));
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert("Authentication Error", "Please sign in again.");
        setProcessingRequests((prev) => ({ ...prev, [targetId]: null }));
        closeActionsModal();
        router.replace("(auth)/signin");
        return;
      }
      const res = await fetch(
        `${API_BASE_URL}/api/overtime/${targetId}/approve`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            approverComments: approverComments || undefined,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Overtime request approved.");
        await fetchOvertimeRequests();
      } else {
        RNAlert.alert(
          "Error",
          data?.message || "Failed to approve overtime request."
        );
      }
    } catch (error) {
      console.error("Error approving overtime:", error);
      RNAlert.alert(
        "Error",
        "An error occurred while approving the overtime request."
      );
    } finally {
      setProcessingRequests((prev) => ({ ...prev, [targetId]: null }));
      closeActionsModal();
    }
  };

  const confirmRejectOvertime = async () => {
    if (!actionsOvertime) {
      closeActionsModal();
      return;
    }
    const targetId =
      actionsOvertime.id ||
      actionsOvertime._id ||
      actionsOvertime.requestId ||
      null;
    if (!targetId) {
      closeActionsModal();
      return;
    }

    setProcessingRequests((prev) => ({
      ...prev,
      [targetId]: "rejecting",
    }));
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert("Authentication Error", "Please sign in again.");
        setProcessingRequests((prev) => ({ ...prev, [targetId]: null }));
        closeActionsModal();
        router.replace("(auth)/signin");
        return;
      }
      const res = await fetch(
        `${API_BASE_URL}/api/overtime/${targetId}/reject`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            approverComments: approverComments || undefined,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Overtime request rejected.");
        await fetchOvertimeRequests();
      } else {
        RNAlert.alert(
          "Error",
          data?.message || "Failed to reject overtime request."
        );
      }
    } catch (error) {
      console.error("Error rejecting overtime:", error);
      RNAlert.alert(
        "Error",
        "An error occurred while rejecting the overtime request."
      );
    } finally {
      setProcessingRequests((prev) => ({ ...prev, [targetId]: null }));
      closeActionsModal();
    }
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

    const requesterSource =
      item.requester || item.user || item.User || item.employee || null;
    const requesterEmail =
      requesterSource?.email || item.requesterEmail || item.userEmail || null;
    const requesterName =
      requesterSource?.username ||
      requesterSource?.name ||
      requesterSource?.fullName ||
      null;
    const requesterId =
      requesterSource?.id ||
      requesterSource?._id ||
      item.userId ||
      item.employeeId ||
      item.requesterId ||
      null;

    let requesterDisplay = null;
    if (requesterEmail && requesterName && requesterEmail !== requesterName) {
      requesterDisplay = `${requesterName} (${requesterEmail})`;
    } else if (requesterEmail) {
      requesterDisplay = requesterEmail;
    } else if (requesterName) {
      requesterDisplay = requesterName;
    } else if (requesterId) {
      requesterDisplay = `User ${requesterId}`;
    }

    const isProcessing = processingRequests[item.id || item._id] != null;

    return (
      <Animated.View style={{ transform: [{ scale: cardScale }] }}>
        <TouchableOpacity
          onPress={() => {
            animatePress();
            // Slight delay so the bounce animation is visible
            setTimeout(() => openActionsModal(item), 80);
          }}
          disabled={isProcessing}
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
              {requesterDisplay && (
                <View className="flex-row items-center mb-1">
                  <Ionicons name="person-outline" size={16} color="#6B7280" />
                  <Text className="text-gray-600 text-sm ml-2">
                    Requester: {requesterDisplay}
                  </Text>
                </View>
              )}
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

            {item.approverComments ? (
              <View className="rounded-lg p-3">
                <View className="flex-row items-center mb-1">
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color="#6B7280"
                  />
                  <Text className="text-gray-600 text-sm ml-2">
                    Approver Comments: {String(item.approverComments)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-3 flex-row items-center border-b border-slate-200 mb-4">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="chevron-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-800">Settings</Text>
      </View>

      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View className="px-4 pb-2">
          <Text className="text-2xl font-bold text-gray-800">
            Manage Overtimes
          </Text>
          <Text className="text-gray-500 mb-4">
            Review and monitor overtime requests
          </Text>

          {/* New Overtime Request Button */}
          <View className="mb-4">
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/(overtime)")}
              activeOpacity={0.85}
              className="self-start flex-row items-center bg-orange-400 px-4 py-3 rounded-lg"
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
              <Text className="text-white font-semibold">
                New Overtime Request
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filter row */}
          <View className="flex-row mb-4">
            <FilterOption
              label="All"
              filterKey="all"
              activeFilter={activeFilter}
              onPress={setActiveFilter}
            />
            <FilterOption
              label="Pending"
              filterKey="pending"
              activeFilter={activeFilter}
              onPress={setActiveFilter}
            />
            <FilterOption
              label="Approved"
              filterKey="approved"
              activeFilter={activeFilter}
              onPress={setActiveFilter}
            />
            <FilterOption
              label="Rejected"
              filterKey="rejected"
              activeFilter={activeFilter}
              onPress={setActiveFilter}
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
                tintColor="#cbd5e1"
              />
            }
            ListEmptyComponent={
              <EmptyListComponent activeFilter={activeFilter} />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>

      {/* Actions Modal: Approve / Reject */}
      {actionsModalVisible && actionsOvertime && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)", opacity: modalBgAnim },
            ]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={closeActionsModal}
            />
          </Animated.View>

          <Animated.View
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
            style={{
              transform: [{ translateY: actionsModalY }],
              paddingBottom: Platform.OS === "ios" ? 24 : 20,
            }}
          >
            <View className="items-center py-3">
              <View className="w-10 h-1 bg-slate-200 rounded-full" />
            </View>
            <View className="flex-row justify-between items-center px-5 pb-3 border-b border-slate-100">
              <Text className="text-lg font-bold text-slate-800">
                Overtime Actions
              </Text>
              <TouchableOpacity onPress={closeActionsModal}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="px-5 pt-3 pb-1">
              {(() => {
                const reasonText =
                  actionsOvertime?.overtimeReason ??
                  actionsOvertime?.requesterReason ??
                  actionsOvertime?.reason ??
                  null;
                return (
                  <Text className="text-slate-600 text-sm mb-2">
                    <Text className="font-semibold">Reason: </Text>
                    {reasonText ? String(reasonText) : "No reason provided."}
                  </Text>
                );
              })()}
              <Text className="text-slate-500 text-xs">
                From: {formatDateTime(actionsOvertime?.fromDate)}{" "}
              </Text>
              <Text className="text-slate-500 text-xs mb-3">
                To: {formatDateTime(actionsOvertime?.toDate)}
              </Text>
              <Text className="text-slate-600 text-sm mt-2 mb-1">
                Approver Comments (optional)
              </Text>
              <View className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                <TextInput
                  multiline
                  style={{ minHeight: 70, color: "#0f172a" }}
                  value={approverComments}
                  onChangeText={setApproverComments}
                  placeholder="Add comments for this decision (optional)"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            <View className="px-5 pn-5 pb-4 space-y-3">
              <TouchableOpacity
                onPress={confirmApproveOvertime}
                activeOpacity={0.85}
                className="bg-green-500 py-3 rounded-lg items-center flex-row justify-center"
                disabled={
                  processingRequests[
                    actionsOvertime.id || actionsOvertime._id
                  ] === "approving"
                }
              >
                {processingRequests[
                  actionsOvertime.id || actionsOvertime._id
                ] === "approving" ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                    <Text className="text-white font-semibold text-base">
                      Approve Request
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={confirmRejectOvertime}
                activeOpacity={0.85}
                className="bg-red-500 py-3 rounded-lg items-center flex-row justify-center"
                disabled={
                  processingRequests[
                    actionsOvertime.id || actionsOvertime._id
                  ] === "rejecting"
                }
              >
                {processingRequests[
                  actionsOvertime.id || actionsOvertime._id
                ] === "rejecting" ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                    <Text className="text-white font-semibold text-base">
                      Reject Request
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={closeActionsModal}
                activeOpacity={0.85}
                className="border border-slate-200 py-3 rounded-lg items-center"
              >
                <Text className="text-slate-700 font-semibold text-base">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
});
