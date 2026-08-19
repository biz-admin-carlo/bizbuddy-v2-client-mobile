// app/(tabs)/(leaves)/leaves-approval.jsx

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert as RNAlert,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../../config/constant";
import { getTokenUserId } from "../../../store/useAuthStore";
import {
  formatLeaveBoundaryLabel,
  formatLeaveDateTimeLabel,
  normalizeLeaveRecord,
} from "../../../utils/dateOnlyUtils";
import { Ionicons } from "@expo/vector-icons";

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
  cancelled: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: "ban",
    iconColor: "#64748b",
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
  if (key.includes("cancel")) return STATUS_STYLES.cancelled;
  if (key.includes("pending")) return STATUS_STYLES.pending;
  return STATUS_STYLES.default;
};

const formatLeaveStatusLabel = (status) => {
  const raw = String(status ?? "").trim();
  if (!raw) return "—";
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "pending_secondary") return "Pending final";
  return raw.replace(/_/g, " ");
};

/**
 * Status chip for leave request cards and detail modal.
 */
const LeaveStatusBadge = ({ status }) => {
  const style = resolveStatusStyle(status);
  const label = formatLeaveStatusLabel(status);
  const isCustomLabel =
    String(status ?? "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_") === "pending_secondary";

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
      <Text
        className={`text-xs font-semibold ${isCustomLabel ? "" : "capitalize"} ${style.text}`}
      >
        {label}
      </Text>
    </View>
  );
};

/**
 * A small sub-component for the filter pill UI.
 */
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
    setTimeout(() => onPress(), 100);
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

/**
 * A small sub-component for each sort option row.
 */
const SortOption = ({ label, icon, onPress, isActive }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
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
    setTimeout(() => onPress(), 100);
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8} className={`flex-row items-center p-4 ${isActive ? "bg-orange-50" : ""}`}>
        <Ionicons name={icon} size={20} color={isActive ? "#f97316" : "#6B7280"} style={{ marginRight: 12 }} />
        <Text className={`text-base ${isActive ? "text-orange-500 font-medium" : "text-slate-700"}`}>{label}</Text>
        {isActive && <Ionicons name="checkmark" size={20} color="#f97316" style={{ marginLeft: "auto" }} />}
      </TouchableOpacity>
    </Animated.View>
  );
};

/**
 * A small sub-component displayed when there's no data.
 */
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

const resolveLeaveTypeLabel = (item) =>
  item?.leaveType ?? item?.type ?? item?.leavePolicy?.name ?? "Leave";

const resolvePaidLabel = (item) => {
  if (item?.isPaid === true) return "Paid leave";
  if (item?.isPaid === false) return "Unpaid leave";
  return null;
};

const resolveRequesterLabel = (item) => {
  const requester =
    item?.requester ?? item?.User ?? item?.user ?? item?.employee ?? null;
  const profile = requester?.profile ?? item?.profile ?? null;
  const fullName = [
    `${profile?.firstName ?? requester?.firstName ?? ""} ${profile?.lastName ?? requester?.lastName ?? ""}`.trim(),
    requester?.fullName,
    requester?.name,
    profile?.fullName,
    profile?.name,
    item?.requesterName,
    item?.employeeName,
    item?.userName,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  return (
    fullName ||
    requester?.username ||
    requester?.email ||
    item?.requesterEmail ||
    (requester?.id != null ? `ID ${requester.id}` : null)
  );
};

const resolveApproverLabel = (item) => {
  const approver =
    item?.approver ?? item?.Approver ?? item?.approverUser ?? null;
  const profile = approver?.profile ?? null;
  const fullName = [
    `${profile?.firstName ?? approver?.firstName ?? ""} ${profile?.lastName ?? approver?.lastName ?? ""}`.trim(),
    approver?.fullName,
    approver?.name,
    profile?.fullName,
    profile?.name,
    item?.approverName,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  return (
    fullName ||
    approver?.username ||
    approver?.email ||
    item?.approverEmail ||
    (approver?.id != null || item?.approverId != null
      ? `ID ${approver?.id ?? item?.approverId}`
      : null)
  );
};

const resolveLeaveId = (item) =>
  item?.id ??
  item?._id ??
  item?.leaveId ??
  item?.leaveRequestId ??
  item?.requestId ??
  item?.leave?.id ??
  item?.leave?._id ??
  null;

const toStr = (value) => (value == null ? "" : String(value));

const isApproverMatch = (leave, currentUserId) => {
  const currentId = toStr(currentUserId);
  if (!currentId) return false;

  const approverCandidates = [
    leave?.approverId,
    leave?.ApproverId,
    leave?.approverUserId,
    leave?.approvedById,
    leave?.approver?.id,
    leave?.approver?.userId,
    leave?.Approver?.id,
    leave?.Approver?.userId,
    leave?.assignedApproverId,
  ]
    .map(toStr)
    .filter(Boolean);

  if (approverCandidates.some((id) => id === currentId)) return true;

  const approverArray =
    leave?.approverIds ??
    leave?.ApproverIds ??
    leave?.approvers?.map((a) => a?.id ?? a?.userId) ??
    [];

  return Array.isArray(approverArray)
    ? approverArray.map(toStr).some((id) => id === currentId)
    : false;
};

const isRequesterMatch = (leave, currentUserId) => {
  const currentId = toStr(currentUserId);
  if (!currentId) return false;

  const requester =
    leave?.requester ?? leave?.User ?? leave?.user ?? leave?.employee ?? null;

  const requesterCandidates = [
    leave?.requesterId,
    leave?.userId,
    leave?.employeeId,
    leave?.createdById,
    leave?.createdBy,
    requester?.id,
    requester?._id,
    requester?.userId,
  ]
    .map(toStr)
    .filter(Boolean);

  return requesterCandidates.some((id) => id === currentId);
};

const EmptyListComponent = ({ activeFilter, isCompanyView }) => (
  <View className="flex-1 justify-center items-center py-16 px-6">
    <View className="w-20 h-20 rounded-full bg-orange-50 items-center justify-center mb-5">
      <Ionicons name="leaf-outline" size={36} color="#fdba74" />
    </View>
    <Text className="text-slate-700 text-lg font-semibold mb-2 text-center">
      No leave requests
    </Text>
    <Text className="text-slate-500 text-center text-sm leading-5">
      {activeFilter === "all"
        ? isCompanyView
          ? "No leave requests found for employees in your company yet."
          : "You have not submitted any leave requests yet. Use the Request tab to file one."
        : `No ${activeFilter} leave requests found. Try another filter or pull to refresh.`}
    </Text>
  </View>
);

/**
 * Main LeavesApproval screen component.
 */
export default function LeavesApproval() {
  const insets = useSafeAreaInsets();
  const [leaves, setLeaves] = useState([]);
  const [filteredLeaves, setFilteredLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortOption, setSortOption] = useState("newest");
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [isCompanyView, setIsCompanyView] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [processingLeaves, setProcessingLeaves] = useState({});
  const router = useRouter();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const sortButtonScale = useRef(new Animated.Value(1)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const sortModalAnim = useRef(new Animated.Value(height)).current;

  // Pan responder for the Sort Modal (allow swipe-down to close).
  const sortPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          sortModalAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeSortModal();
        } else {
          Animated.spring(sortModalAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  /**
   * Fetches leaves for the currently logged-in user.
   */
  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert("Authentication Error", "You are not logged in. Please sign in again.", [
          { text: "OK", onPress: () => router.replace("(auth)/login-user") },
        ]);
        return;
      }
      let leavesPath = "/api/leaves/my";
      let companyView = false;
      let role = "";

      try {
        const profileRes = await fetch(`${API_BASE_URL}/api/account/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const profileData = await profileRes.json();
        role = String(profileData?.data?.user?.role ?? "").toLowerCase();
        if (
          role === "supervisor" ||
          role === "admin" ||
          role === "superadmin"
        ) {
          leavesPath = "/api/leaves/";
          companyView = true;
        }
      } catch (profileError) {
        console.error("Error resolving leave view role:", profileError);
      }

      setUserRole(role);
      setCurrentUserId(getTokenUserId(token));
      setIsCompanyView(companyView);

      const res = await fetch(`${API_BASE_URL}${leavesPath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const rows = Array.isArray(data.data)
          ? data.data.map(normalizeLeaveRecord)
          : [];
        const canViewAllCompanyLeaves =
          role === "admin" || role === "superadmin";
        const visibleRows =
          companyView && !canViewAllCompanyLeaves
            ? rows.filter((leave) =>
                isApproverMatch(leave, getTokenUserId(token)),
              )
            : rows;
        setLeaves(visibleRows);
        applyFiltersAndSort(visibleRows, activeFilter, sortOption);
      } else {
        RNAlert.alert("Error", data.message || "Failed to fetch leave logs.");
      }
    } catch (error) {
      console.error("Error fetching leave logs:", error);
      RNAlert.alert("Error", "An error occurred while fetching leave logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * Filter and sort data based on active filter and sortOption.
   */
  const applyFiltersAndSort = useCallback((data, filter, sort) => {
    let result = [...data];

    // Filter
    if (filter !== "all") {
      const target = filter.toLowerCase();
      result = result.filter((item) => {
        const status = (item.status || "").toLowerCase();
        // Be a bit more flexible for "pending" so it also matches
        // values like "pending_approval" coming from the backend.
        if (target === "pending") {
          return status.includes("pending");
        }
        return status === target;
      });
    }

    // Sort
    switch (sort) {
      case "newest":
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case "oldest":
        result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case "type":
        result.sort((a, b) => a.leaveType.localeCompare(b.leaveType));
        break;
      case "status":
        result.sort((a, b) => a.status.localeCompare(b.status));
        break;
      default:
        break;
    }

    setFilteredLeaves(result);
  }, []);

  /**
   * On component mount, run initial animations and fetch data.
   */
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

    fetchLeaves();
  }, []);

  /**
   * Re-apply filters whenever leaves, activeFilter, or sortOption changes.
   */
  useEffect(() => {
    applyFiltersAndSort(leaves, activeFilter, sortOption);
  }, [leaves, activeFilter, sortOption, applyFiltersAndSort]);

  /**
   * For pull-to-refresh in the FlatList.
   */
  const onRefresh = () => {
    setRefreshing(true);
    fetchLeaves();
  };

  /**
   * Opens the Sort Modal with a spring animation.
   */
  const openSortModal = () => {
    setSortModalVisible(true);
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(sortModalAnim, {
        toValue: 0,
        tension: 70,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  };

  /**
   * Closes the Sort Modal with a fade + timing animation.
   */
  const closeSortModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(sortModalAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSortModalVisible(false);
    });
  };

  /**
   * Small bounce animation for the Sort button.
   */
  const animateButtonPress = (buttonRef) => {
    Animated.sequence([
      Animated.timing(buttonRef, {
        toValue: 0.92,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(buttonRef, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const openLeaveDetail = (item) => {
    setSelectedLeave(item);
    setDetailModalVisible(true);
  };

  const closeLeaveDetail = () => {
    setDetailModalVisible(false);
    setSelectedLeave(null);
  };

  const canActOnLeave = useCallback(
    (item) => {
      if (!isCompanyView) return false;
      const status = String(item?.status ?? "").toLowerCase();
      if (!status.includes("pending")) return false;
      if (userRole === "admin" || userRole === "superadmin") return true;
      if (userRole === "supervisor") {
        return isApproverMatch(item, currentUserId);
      }
      return false;
    },
    [isCompanyView, userRole, currentUserId],
  );

  const canCancelLeave = useCallback(
    (item) => {
      const status = String(item?.status ?? "").toLowerCase();
      if (!status.includes("pending")) return false;
      // Employee History (`/api/leaves/my`) only returns the current user's requests.
      if (!isCompanyView) return true;
      return isRequesterMatch(item, currentUserId);
    },
    [isCompanyView, currentUserId],
  );

  const submitLeaveAction = async (item, action, comments = "") => {
    const leaveId = resolveLeaveId(item);
    if (!leaveId) {
      RNAlert.alert("Error", "Missing leave request ID. Please refresh and try again.");
      return;
    }
    setProcessingLeaves((prev) => ({
      ...prev,
      [leaveId]: action === "approve" ? "approving" : "rejecting",
    }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(
        `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(leaveId))}/${action}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ approverComments: comments }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert(
          "Success",
          action === "approve"
            ? "Leave approved successfully."
            : "Leave rejected successfully.",
        );
        if (selectedLeave && resolveLeaveId(selectedLeave) === leaveId) {
          closeLeaveDetail();
        }
        fetchLeaves();
      } else {
        const message =
          data.message ||
          (action === "approve"
            ? "Failed to approve leave."
            : "Failed to reject leave.");
        if (
          String(message).toLowerCase().includes("not found") ||
          String(message).toLowerCase().includes("already processed")
        ) {
          RNAlert.alert("Request updated", `${message} Refreshing leave list.`);
          fetchLeaves();
        } else {
          RNAlert.alert("Error", message);
        }
      }
    } catch (error) {
      console.error(`Error ${action}ing leave:`, error);
      RNAlert.alert(
        "Error",
        `An error occurred while ${action === "approve" ? "approving" : "rejecting"} the leave.`,
      );
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [leaveId]: null }));
    }
  };

  const promptLeaveAction = (item, action) => {
    const title = action === "approve" ? "Approve Leave" : "Reject Leave";
    const confirmLabel = action === "approve" ? "Approve" : "Reject";

    if (Platform.OS === "ios" && typeof RNAlert.prompt === "function") {
      RNAlert.prompt(
        title,
        "Optional comments",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: confirmLabel,
            onPress: (text) => submitLeaveAction(item, action, text || ""),
          },
        ],
        "plain-text",
      );
      return;
    }

    RNAlert.alert(title, `Are you sure you want to ${action} this leave request?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: confirmLabel,
        style: action === "reject" ? "destructive" : "default",
        onPress: () => submitLeaveAction(item, action, ""),
      },
    ]);
  };

  const submitCancelLeave = async (item) => {
    const leaveId = resolveLeaveId(item);
    if (!leaveId) {
      RNAlert.alert("Error", "Missing leave request ID. Please refresh and try again.");
      return;
    }
    setProcessingLeaves((prev) => ({ ...prev, [leaveId]: "cancelling" }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(
        `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(leaveId))}/cancel`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (res.ok) {
        RNAlert.alert("Success", "Leave request cancelled successfully.");
        if (selectedLeave && resolveLeaveId(selectedLeave) === leaveId) {
          closeLeaveDetail();
        }
        fetchLeaves();
      } else {
        const message = data.message || "Failed to cancel leave request.";
        if (
          String(message).toLowerCase().includes("not found") ||
          String(message).toLowerCase().includes("already processed") ||
          String(message).toLowerCase().includes("already cancelled")
        ) {
          RNAlert.alert("Request updated", `${message} Refreshing leave list.`);
          fetchLeaves();
        } else {
          RNAlert.alert("Error", message);
        }
      }
    } catch (error) {
      console.error("Error cancelling leave:", error);
      RNAlert.alert(
        "Error",
        "An error occurred while cancelling the leave request.",
      );
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [leaveId]: null }));
    }
  };

  const promptCancelLeave = (item) => {
    RNAlert.alert(
      "Cancel Leave",
      "Are you sure you want to cancel this leave request?",
      [
        { text: "Keep request", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: () => submitCancelLeave(item),
        },
      ],
    );
  };

  /**
   * Chooses an icon for the leave type.
   */
  const getLeaveTypeIcon = (type) => {
    switch (type.toLowerCase()) {
      case "sick leave":
        return "medkit";
      case "vacation leave":
        return "airplane";
      case "emergency leave":
        return "alert-circle";
      case "maternity/paternity leave":
        return "people";
      case "casual leave":
        return "cafe";
      default:
        return "calendar";
    }
  };

  const renderItem = ({ item }) => {
    const typeLabel = resolveLeaveTypeLabel(item);
    const reason = item.leaveReason?.trim();
    const paidLabel = resolvePaidLabel(item);
    const requesterName = resolveRequesterLabel(item);
    const approverName = resolveApproverLabel(item);
    const leaveId = resolveLeaveId(item);
    const isProcessing = leaveId != null && !!processingLeaves[leaveId];
    const showActions = canActOnLeave(item);
    const showCancel = canCancelLeave(item);

    return (
      <TouchableOpacity
        onPress={() => openLeaveDetail(item)}
        activeOpacity={0.85}
        className="mb-3 p-4 bg-white rounded-xl border border-slate-100"
        style={cardShadow}
      >
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-row items-center flex-1 pr-2 min-w-0">
            <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center mr-3">
              <Ionicons
                name={getLeaveTypeIcon(typeLabel)}
                size={20}
                color="#f97316"
              />
            </View>
            <View className="flex-1 min-w-0">
              <Text
                className="font-semibold text-slate-800 text-base"
                numberOfLines={1}
              >
                {typeLabel}
              </Text>
              {isCompanyView && requesterName ? (
                <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
                  {requesterName}
                </Text>
              ) : paidLabel ? (
                <Text className="text-xs text-slate-500 mt-0.5">{paidLabel}</Text>
              ) : null}
            </View>
          </View>
          <LeaveStatusBadge status={item.status} />
        </View>

        <View className="bg-slate-50 rounded-lg px-3 py-2.5 mb-3 border border-slate-100">
          <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Leave period
          </Text>
          <View className="flex-row items-center">
            <Ionicons name="calendar-outline" size={15} color="#94a3b8" />
            <Text className="text-sm font-medium text-slate-800 ml-2 flex-1 leading-5">
              {formatLeaveBoundaryLabel(item, "start")}
              {"  →  "}
              {formatLeaveBoundaryLabel(item, "end")}
            </Text>
          </View>
        </View>

        <View className="flex-row items-end justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-xs text-slate-500">
              Submitted {formatLeaveDateTimeLabel(item.createdAt)}
            </Text>
            {reason ? (
              <Text className="text-xs text-slate-600 mt-1" numberOfLines={2}>
                {reason}
              </Text>
            ) : (
              <Text className="text-xs text-slate-400 mt-1 italic">
                No reason provided
              </Text>
            )}
            {approverName ? (
              <Text className="text-xs text-slate-500 mt-1" numberOfLines={1}>
                Approver: {approverName}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </View>

        {showActions ? (
          <View className="flex-row gap-2 mt-3">
            <TouchableOpacity
              onPress={() => promptLeaveAction(item, "approve")}
              activeOpacity={0.85}
              disabled={isProcessing}
              className="flex-1 py-2.5 rounded-lg bg-green-500 items-center"
            >
              {processingLeaves[leaveId] === "approving" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white font-semibold">Approve</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => promptLeaveAction(item, "reject")}
              activeOpacity={0.85}
              disabled={isProcessing}
              className="flex-1 py-2.5 rounded-lg bg-red-500 items-center"
            >
              {processingLeaves[leaveId] === "rejecting" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white font-semibold">Reject</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {showCancel ? (
          <TouchableOpacity
            onPress={() => promptCancelLeave(item)}
            activeOpacity={0.85}
            disabled={isProcessing}
            className="mt-3 py-2.5 rounded-lg border border-red-200 bg-red-50 items-center"
          >
            {processingLeaves[leaveId] === "cancelling" ? (
              <ActivityIndicator size="small" color="#b91c1c" />
            ) : (
              <Text className="text-red-700 font-semibold">Cancel request</Text>
            )}
          </TouchableOpacity>
        ) : null}
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
          <View className="flex-row justify-between items-center mb-1">
            <View className="flex-row items-center flex-1">
              <Ionicons name="leaf-outline" size={24} color="#f97316" />
              <Text className="text-xl font-bold text-slate-800 ml-2">
                Leave requests
              </Text>
            </View>
            <Animated.View style={{ transform: [{ scale: sortButtonScale }] }}>
              <TouchableOpacity
                onPress={() => {
                  animateButtonPress(sortButtonScale);
                  setTimeout(openSortModal, 100);
                }}
                activeOpacity={0.8}
                className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 items-center justify-center"
                style={styles.buttonShadow}
                accessibilityLabel="Sort leave requests"
              >
                <Ionicons name="options-outline" size={20} color="#64748b" />
              </TouchableOpacity>
            </Animated.View>
          </View>

          <Text className="text-slate-500 text-sm mb-4">
            {isCompanyView
              ? userRole === "supervisor"
                ? "Review and approve leave requests assigned to you"
                : "Track status and details for employee leave requests in your company"
              : "Track status and details for your submitted leave"}
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

        {loading ? (
          <View className="flex-1 justify-center items-center bg-slate-50">
            <ActivityIndicator size="large" color="#f97316" />
            <Text className="mt-4 text-slate-500 text-sm">Loading requests…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredLeaves}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            className="bg-slate-50"
            contentContainerStyle={[
              { paddingHorizontal: 16, paddingTop: 16, paddingBottom: androidBottom + 24 },
              filteredLeaves.length === 0 && { flex: 1 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#f97316"]}
                tintColor="#f97316"
              />
            }
            ListEmptyComponent={
              <EmptyListComponent
                activeFilter={activeFilter}
                isCompanyView={isCompanyView}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>

      {/* Leave detail modal */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeLeaveDetail}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]}
            activeOpacity={1}
            onPress={closeLeaveDetail}
          />
          <View
            className="bg-white rounded-t-3xl"
            style={{
              maxHeight: height * 0.88,
              paddingBottom: Platform.OS === "ios" ? 34 : 24,
            }}
          >
            {selectedLeave ? (
              <>
                <View className="items-center py-3">
                  <View className="w-10 h-1 bg-slate-200 rounded-full" />
                </View>

                <View className="flex-row justify-between items-start px-5 pb-4 border-b border-slate-100">
                  <View className="flex-row items-center flex-1 pr-3">
                    <View className="w-12 h-12 rounded-full bg-orange-100 items-center justify-center mr-3">
                      <Ionicons
                        name={getLeaveTypeIcon(resolveLeaveTypeLabel(selectedLeave))}
                        size={24}
                        color="#f97316"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xl font-bold text-slate-800">
                        {resolveLeaveTypeLabel(selectedLeave)}
                      </Text>
                      <Text className="text-slate-500 text-sm mt-0.5">Leave request details</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={closeLeaveDetail} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={26} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <View className="px-5 py-3 border-b border-slate-100 flex-row items-center justify-between">
                  <LeaveStatusBadge status={selectedLeave.status || "pending"} />
                  {resolvePaidLabel(selectedLeave) ? (
                    <Text className="text-sm text-slate-500">
                      {resolvePaidLabel(selectedLeave)}
                    </Text>
                  ) : null}
                </View>

                <ScrollView
                  className="px-5 pt-4"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {resolveRequesterLabel(selectedLeave) ? (
                    <DetailRow
                      icon="person-outline"
                      label="Requester"
                      value={resolveRequesterLabel(selectedLeave)}
                    />
                  ) : null}
                  <DetailRow
                    icon="time-outline"
                    label="Submitted"
                    value={formatLeaveDateTimeLabel(selectedLeave.createdAt)}
                  />
                  <DetailRow
                    icon="play-outline"
                    label="Start"
                    value={formatLeaveBoundaryLabel(selectedLeave, "start")}
                  />
                  <DetailRow
                    icon="stop-outline"
                    label="End"
                    value={formatLeaveBoundaryLabel(selectedLeave, "end")}
                  />
                  <DetailRow
                    icon="document-text-outline"
                    label="Reason"
                    value={
                      selectedLeave.leaveReason?.trim()
                        ? selectedLeave.leaveReason
                        : "No reason provided"
                    }
                  />
                  {selectedLeave.approver?.email || resolveApproverLabel(selectedLeave) ? (
                    <DetailRow
                      icon="shield-checkmark-outline"
                      label="Approver"
                      value={
                        resolveApproverLabel(selectedLeave) ||
                        selectedLeave.approver?.email
                      }
                    />
                  ) : null}
                  <DetailRow
                    icon="chatbubble-outline"
                    label="Approver comments"
                    value={
                      selectedLeave.approverComments?.trim()
                        ? selectedLeave.approverComments
                        : "No comments yet"
                    }
                  />
                  {selectedLeave.id != null ? (
                    <DetailRow
                      icon="finger-print-outline"
                      label="Request ID"
                      value={String(selectedLeave.id)}
                    />
                  ) : null}
                </ScrollView>

                <View className="px-5 pt-2">
                  {canActOnLeave(selectedLeave) ? (
                    <View className="flex-row gap-2 mb-2">
                      <TouchableOpacity
                        onPress={() => promptLeaveAction(selectedLeave, "approve")}
                        activeOpacity={0.85}
                        disabled={
                          !!processingLeaves[resolveLeaveId(selectedLeave)]
                        }
                        className="flex-1 bg-green-500 rounded-xl py-3.5 items-center"
                      >
                        {processingLeaves[resolveLeaveId(selectedLeave)] ===
                        "approving" ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text className="text-white font-semibold text-base">
                            Approve
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => promptLeaveAction(selectedLeave, "reject")}
                        activeOpacity={0.85}
                        disabled={
                          !!processingLeaves[resolveLeaveId(selectedLeave)]
                        }
                        className="flex-1 bg-red-500 rounded-xl py-3.5 items-center"
                      >
                        {processingLeaves[resolveLeaveId(selectedLeave)] ===
                        "rejecting" ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text className="text-white font-semibold text-base">
                            Reject
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {canCancelLeave(selectedLeave) ? (
                    <TouchableOpacity
                      onPress={() => promptCancelLeave(selectedLeave)}
                      activeOpacity={0.85}
                      disabled={
                        !!processingLeaves[resolveLeaveId(selectedLeave)]
                      }
                      className="mb-2 rounded-xl py-3.5 items-center border border-red-200 bg-red-50"
                    >
                      {processingLeaves[resolveLeaveId(selectedLeave)] ===
                      "cancelling" ? (
                        <ActivityIndicator size="small" color="#b91c1c" />
                      ) : (
                        <Text className="text-red-700 font-semibold text-base">
                          Cancel request
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={closeLeaveDetail}
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

      {/* Sort Modal */}
      {sortModalVisible && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.5)", opacity: modalBgAnim }]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSortModal} />
          </Animated.View>

          <Animated.View
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
            style={{
              transform: [{ translateY: sortModalAnim }],
              paddingBottom: Platform.OS === "ios" ? 30 : 20,
            }}
            {...sortPanResponder.panHandlers}
          >
            <View className="items-center py-3">
              <View className="w-10 h-1 bg-slate-200 rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
              <Text className="text-lg font-bold text-slate-800">Sort By</Text>
              <TouchableOpacity onPress={closeSortModal}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <SortOption
              label="Newest First"
              icon="time-outline"
              isActive={sortOption === "newest"}
              onPress={() => {
                setSortOption("newest");
                closeSortModal();
              }}
            />

            <SortOption
              label="Oldest First"
              icon="calendar-outline"
              isActive={sortOption === "oldest"}
              onPress={() => {
                setSortOption("oldest");
                closeSortModal();
              }}
            />

            <SortOption
              label="Leave Type"
              icon="list-outline"
              isActive={sortOption === "type"}
              onPress={() => {
                setSortOption("type");
                closeSortModal();
              }}
            />

            <SortOption
              label="Status"
              icon="flag-outline"
              isActive={sortOption === "status"}
              onPress={() => {
                setSortOption("status");
                closeSortModal();
              }}
            />
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  buttonShadow: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
});
