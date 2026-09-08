// app/(tabs)/(settings)/(management)/manage-leaves.jsx

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
  PanResponder,
  Dimensions,
  Platform,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import DropDownPicker from "react-native-dropdown-picker";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../../../config/constant";
import { getTokenUserId } from "../../../../store/useAuthStore";
import {
  formatLeaveBoundaryLabel,
  formatLeaveDateTimeLabel,
  normalizeLeaveRecord,
} from "../../../../utils/dateOnlyUtils";
import {
  fetchMultiApprovalEnabled,
  fetchEscalationTargets,
  fetchEmployeeDirectory,
} from "../../../../utils/leaveEscalation";

const { height } = Dimensions.get("window");

// ---------------------------------------------------------------------
// UI Components (Status badge, formatting, filter, sort)
// ---------------------------------------------------------------------

const formatLeaveStatusLabel = (status) => {
  const raw = String(status ?? "").trim();
  if (!raw) return "pending";
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "pending_secondary") return "Pending final";
  return raw.replace(/_/g, " ");
};

const LeaveStatusBadge = ({ status }) => {
  const normalizedStatus = String(status ?? "pending")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  let bgColor, textColor, icon;
  if (normalizedStatus.includes("approved")) {
    bgColor = "bg-green-100";
    textColor = "text-green-800";
    icon = "checkmark-circle";
  } else if (normalizedStatus.includes("reject")) {
    bgColor = "bg-red-100";
    textColor = "text-red-800";
    icon = "close-circle";
  } else if (normalizedStatus.includes("pending")) {
    bgColor = "bg-amber-100";
    textColor = "text-amber-800";
    icon = "time";
  } else {
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
        {formatLeaveStatusLabel(status)}
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
    setTimeout(() => onPress(), 100);
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
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        className={`flex-row items-center p-4 ${
          isActive ? "bg-orange-50" : ""
        }`}
      >
        <Ionicons
          name={icon}
          size={20}
          color={isActive ? "#f97316" : "#6B7280"}
          style={{ marginRight: 12 }}
        />
        <Text
          className={`text-base ${
            isActive ? "text-orange-400 font-medium" : "text-gray-700"
          }`}
        >
          {label}
        </Text>
        {isActive && (
          <Ionicons
            name="checkmark"
            size={20}
            color="#f97316"
            style={{ marginLeft: "auto" }}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const EmptyListComponent = ({ activeFilter }) => (
  <View className="flex-1 justify-center items-center py-10">
    <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-4">
      <Ionicons name="document-text-outline" size={28} color="#9CA3AF" />
    </View>
    <Text className="text-gray-500 text-lg font-medium mb-1">
      No leave requests
    </Text>
    <Text className="text-gray-400 text-center px-10">
      {activeFilter === "all"
        ? "You don't have any leave requests to manage at the moment."
        : `No ${activeFilter} leave requests found.`}
    </Text>
  </View>
);

const getLeaveTypeIcon = (type) => {
  switch (String(type ?? "").toLowerCase()) {
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
    "Unknown requester"
  );
};

const resolveApproverLabel = (item, directory) => {
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

  const fromDirectory =
    directory?.[String(approver?.id ?? item?.approverId ?? "")] || null;

  return (
    fullName ||
    approver?.username ||
    approver?.email ||
    item?.approverEmail ||
    fromDirectory ||
    (approver?.id != null || item?.approverId != null
      ? "Assigned approver"
      : null)
  );
};

const resolveSecondaryApproverLabel = (item, directory) => {
  const secondaryApprover = item?.secondaryApprover ?? null;
  const profile = secondaryApprover?.profile ?? null;
  const fullName = [
    `${profile?.firstName ?? secondaryApprover?.firstName ?? ""} ${profile?.lastName ?? secondaryApprover?.lastName ?? ""}`.trim(),
    secondaryApprover?.name,
    profile?.name,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  // The server doesn't join a secondaryApprover object on this endpoint —
  // resolve the display name client-side from the company employee directory.
  const fromDirectory =
    directory?.[String(secondaryApprover?.id ?? item?.secondaryApproverId ?? "")] ||
    null;

  return (
    fullName ||
    secondaryApprover?.username ||
    secondaryApprover?.email ||
    fromDirectory ||
    (item?.secondaryApproverId != null ? "Another approver" : null)
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

const resolveCanAct = (item, currentUserId, userRole) => {
  const status = String(item?.status ?? "").toLowerCase();
  const currentId = toStr(currentUserId);

  if (status === "pending_secondary") {
    const escalatedByUserId = toStr(
      item?.escalatedByUserId ?? item?.escalatedBy?.id,
    );
    const originalApproverId = toStr(item?.approverId ?? item?.approver?.id);
    // Whoever escalated this (and the originally assigned approver) already
    // made their call — they're locked out of acting again, even as an
    // admin/superadmin, and even if the server's canAct flag says otherwise
    // (its eligibility check doesn't account for who escalated the request,
    // only department/role-based eligibility).
    if (
      currentId &&
      (currentId === escalatedByUserId || currentId === originalApproverId)
    ) {
      return false;
    }
  }

  // Trust the server's per-leave eligibility if it's ever present, but the
  // deployed API doesn't return one today — compute a stage-aware fallback
  // entirely client-side from fields already on the leave record instead.
  if (typeof item?.canAct === "boolean") return item.canAct;

  if (status === "pending_secondary") {
    const secondaryApproverId = toStr(
      item?.secondaryApproverId ?? item?.secondaryApprover?.id,
    );
    if (userRole === "admin" || userRole === "superadmin") return true;
    return !!secondaryApproverId && currentId === secondaryApproverId;
  }

  if (userRole === "admin" || userRole === "superadmin") return true;
  return isApproverMatch(item, currentUserId);
};

// ---------------------------------------------------------------------
// Main ManageLeaves Component
// ---------------------------------------------------------------------

export default function ManageLeaves() {
  const [approverLeaves, setApproverLeaves] = useState([]);
  const [filteredLeaves, setFilteredLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortOption, setSortOption] = useState("newest");
  const [processingLeaves, setProcessingLeaves] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);
  const [userRole, setUserRole] = useState("");
  const [employeeDirectory, setEmployeeDirectory] = useState({});
  const [multiApprovalEnabled, setMultiApprovalEnabled] = useState(false);

  // ACTIONS Modal state (for when a leave card is tapped)
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsLeave, setActionsLeave] = useState(null);
  // Expanded section: "approve", "reject", "escalate", "delete" or null
  const [expandedSection, setExpandedSection] = useState(null);

  // For optional comments when approving or rejecting.
  const [approveComments, setApproveComments] = useState("");
  const [rejectComments, setRejectComments] = useState("");

  // For the "Escalate Leave" action.
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateValue, setEscalateValue] = useState(null);
  const [escalateItems, setEscalateItems] = useState([]);
  const [escalateComments, setEscalateComments] = useState("");
  const [escalateTargetsLoading, setEscalateTargetsLoading] = useState(false);

  const router = useRouter();

  // Page and modal animations.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const sortModalAnim = useRef(new Animated.Value(height)).current;
  const actionsModalY = useRef(new Animated.Value(height)).current;

  const actionsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          actionsModalY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeActionsModal();
        } else {
          Animated.spring(actionsModalY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // ---------------------------------------------------------------------
  // Data fetching & filtering
  // ---------------------------------------------------------------------

  const fetchApproverLeaves = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert(
          "Authentication Error",
          "You are not logged in. Please sign in again.",
          [{ text: "OK", onPress: () => router.replace("(auth)/login-user") }]
        );
        return;
      }
      let role = "";
      try {
        const profileRes = await fetch(`${API_BASE_URL}/api/account/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const profileData = await profileRes.json();
        if (profileRes.ok) {
          role = String(profileData?.data?.user?.role ?? "").toLowerCase();
        }
      } catch (profileError) {
        console.error("Error resolving leave management role:", profileError);
      }
      setUserRole(role);

      fetchMultiApprovalEnabled(token).then(setMultiApprovalEnabled);
      fetchEmployeeDirectory(token).then(setEmployeeDirectory);

      const res = await fetch(`${API_BASE_URL}/api/leaves/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const tokenUserId = getTokenUserId(token);
        setCurrentUserId(tokenUserId);
        const rows = Array.isArray(data.data)
          ? data.data.map(normalizeLeaveRecord)
          : [];
        // The server already scopes visibility correctly (company-wide for
        // admin/superadmin, department/direct-reports for supervisor — see
        // leaveVisibilityWhere on the server) — every returned row is meant
        // to be viewable, whether or not the viewer can act on it (canAct).
        setApproverLeaves(rows);
        applyFiltersAndSort(rows, activeFilter, sortOption);
      } else {
        RNAlert.alert("Error", data.message || "Failed to fetch leaves.");
      }
    } catch (error) {
      console.error("Error fetching leaves:", error);
      RNAlert.alert("Error", "An error occurred while fetching leaves.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFiltersAndSort = useCallback((data, filter, sort) => {
    let result = [...data];

    if (filter !== "all") {
      const target = filter.toLowerCase();
      result = result.filter((item) => {
        const status = (item.status || "").toLowerCase();
        // Allow "Pending" filter to also match values like "pending_approval"
        // that may come from the backend.
        if (target === "pending") {
          return status.includes("pending");
        }
        return status === target;
      });
    }
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
      case "requester":
        result.sort((a, b) =>
          resolveRequesterLabel(a).localeCompare(resolveRequesterLabel(b)),
        );
        break;
      default:
        break;
    }
    setFilteredLeaves(result);
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
    fetchApproverLeaves();
  }, []);

  useEffect(() => {
    applyFiltersAndSort(approverLeaves, activeFilter, sortOption);
  }, [approverLeaves, activeFilter, sortOption, applyFiltersAndSort]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchApproverLeaves();
  };

  // ---------------------------------------------------------------------
  // Sort Modal (same as before)
  // ---------------------------------------------------------------------

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

  // ---------------------------------------------------------------------
  // ACTIONS MODAL (mimicking Department modal styling)
  // ---------------------------------------------------------------------

  const resetEscalateState = () => {
    setEscalateOpen(false);
    setEscalateValue(null);
    setEscalateItems([]);
    setEscalateComments("");
  };

  const loadEscalationTargets = async (leaveItem) => {
    setEscalateTargetsLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const targets = await fetchEscalationTargets(token, {
        excludeUserIds: [currentUserId, leaveItem?.userId],
      });
      setEscalateItems(targets);
    } finally {
      setEscalateTargetsLoading(false);
    }
  };

  const openActionsModal = (leaveItem) => {
    setActionsLeave(leaveItem);
    setExpandedSection(null);
    setApproveComments("");
    setRejectComments("");
    resetEscalateState();
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

  const openActionSection = (leaveItem, section) => {
    setActionsLeave(leaveItem);
    setExpandedSection(section);
    setApproveComments("");
    setRejectComments("");
    resetEscalateState();
    setActionsModalVisible(true);
    actionsModalY.setValue(height);
    if (section === "escalate") {
      loadEscalationTargets(leaveItem);
    }
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
      setActionsLeave(null);
      setExpandedSection(null);
    });
  };

  // ---------------------------------------------------------------------
  // ACTIONS: Approve, Reject, Delete
  // ---------------------------------------------------------------------

  const confirmApprove = async () => {
    const leaveId = resolveLeaveId(actionsLeave);
    if (!leaveId) {
      RNAlert.alert("Error", "Missing leave request ID. Please refresh and try again.");
      closeActionsModal();
      return;
    }
    const selectedStatus = String(actionsLeave?.status ?? "").toLowerCase();
    if (!selectedStatus.includes("pending")) {
      RNAlert.alert("Request updated", "This leave is no longer pending. Refreshing leave list.");
      fetchApproverLeaves();
      closeActionsModal();
      return;
    }
    setProcessingLeaves((prev) => ({
      ...prev,
      [leaveId]: "approving",
    }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(
        `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(leaveId))}/approve`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ approverComments: approveComments }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Leave approved successfully.");
        fetchApproverLeaves();
      } else {
        const message = data.message || "Failed to approve leave.";
        if (
          String(message).toLowerCase().includes("not found") ||
          String(message).toLowerCase().includes("already processed")
        ) {
          RNAlert.alert("Request updated", `${message} Refreshing leave list.`);
          fetchApproverLeaves();
        } else {
          RNAlert.alert("Error", message);
        }
      }
    } catch (error) {
      console.error("Error approving leave:", error);
      RNAlert.alert("Error", "An error occurred while approving the leave.");
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [leaveId]: null }));
      closeActionsModal();
    }
  };

  const confirmReject = async () => {
    const leaveId = resolveLeaveId(actionsLeave);
    if (!leaveId) {
      RNAlert.alert("Error", "Missing leave request ID. Please refresh and try again.");
      closeActionsModal();
      return;
    }
    const selectedStatus = String(actionsLeave?.status ?? "").toLowerCase();
    if (!selectedStatus.includes("pending")) {
      RNAlert.alert("Request updated", "This leave is no longer pending. Refreshing leave list.");
      fetchApproverLeaves();
      closeActionsModal();
      return;
    }
    setProcessingLeaves((prev) => ({
      ...prev,
      [leaveId]: "rejecting",
    }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(
        `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(leaveId))}/reject`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ approverComments: rejectComments }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Leave rejected successfully.");
        fetchApproverLeaves();
      } else {
        const message = data.message || "Failed to reject leave.";
        if (
          String(message).toLowerCase().includes("not found") ||
          String(message).toLowerCase().includes("already processed")
        ) {
          RNAlert.alert("Request updated", `${message} Refreshing leave list.`);
          fetchApproverLeaves();
        } else {
          RNAlert.alert("Error", message);
        }
      }
    } catch (error) {
      console.error("Error rejecting leave:", error);
      RNAlert.alert("Error", "An error occurred while rejecting the leave.");
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [leaveId]: null }));
      closeActionsModal();
    }
  };

  const confirmEscalate = async () => {
    const leaveId = resolveLeaveId(actionsLeave);
    if (!leaveId) {
      RNAlert.alert("Error", "Missing leave request ID. Please refresh and try again.");
      closeActionsModal();
      return;
    }
    if (!escalateValue) {
      RNAlert.alert("Select an approver", "Please choose who to escalate this leave to.");
      return;
    }
    const selectedStatus = String(actionsLeave?.status ?? "").toLowerCase();
    if (selectedStatus !== "pending") {
      RNAlert.alert("Request updated", "This leave can no longer be escalated. Refreshing leave list.");
      fetchApproverLeaves();
      closeActionsModal();
      return;
    }
    setProcessingLeaves((prev) => ({
      ...prev,
      [leaveId]: "escalating",
    }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(
        `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(leaveId))}/approve`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            escalateTo: escalateValue,
            approverComments: escalateComments,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Leave escalated for final approval.");
        fetchApproverLeaves();
      } else {
        const message = data.message || "Failed to escalate leave.";
        if (
          String(message).toLowerCase().includes("not found") ||
          String(message).toLowerCase().includes("already processed") ||
          String(message).toLowerCase().includes("already actioned")
        ) {
          RNAlert.alert("Request updated", `${message} Refreshing leave list.`);
          fetchApproverLeaves();
        } else {
          RNAlert.alert("Error", message);
        }
      }
    } catch (error) {
      console.error("Error escalating leave:", error);
      RNAlert.alert("Error", "An error occurred while escalating the leave.");
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [leaveId]: null }));
      closeActionsModal();
    }
  };

  const confirmDelete = async () => {
    const leaveId = resolveLeaveId(actionsLeave);
    if (!leaveId) {
      RNAlert.alert("Error", "Missing leave request ID. Please refresh and try again.");
      closeActionsModal();
      return;
    }
    setProcessingLeaves((prev) => ({ ...prev, [leaveId]: "deleting" }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(
        `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(leaveId))}`,
        {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", data.message || "Leave deleted successfully.");
        fetchApproverLeaves();
      } else {
        const message = data.message || "Failed to delete leave.";
        if (
          String(message).toLowerCase().includes("not found") ||
          String(message).toLowerCase().includes("already processed")
        ) {
          RNAlert.alert("Request updated", `${message} Refreshing leave list.`);
          fetchApproverLeaves();
        } else {
          RNAlert.alert("Error", message);
        }
      }
    } catch (error) {
      console.error("Error deleting leave:", error);
      RNAlert.alert("Error", "An error occurred while deleting the leave.");
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [leaveId]: null }));
      closeActionsModal();
    }
  };

  // ---------------------------------------------------------------------
  // Render Leave Card
  // ---------------------------------------------------------------------

  const renderItem = ({ item }) => {
    const canAct = resolveCanAct(item, currentUserId, userRole);
    const secondaryApproverName = resolveSecondaryApproverLabel(item, employeeDirectory);
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
    return (
      <Animated.View style={{ transform: [{ scale: cardScale }] }}>
        <TouchableOpacity
          onPress={() => {
            animatePress();
            setTimeout(() => openActionsModal(item), 100);
          }}
          activeOpacity={0.9}
          className="mb-4 rounded-xl overflow-hidden bg-white"
          style={styles.cardShadow}
        >
          <View className="p-3 bg-slate-50 rounded-lg">
            {/* Top row: Leave type and status */}
            <View className="flex-row justify-between items-center pb-4 border-b border-slate-200">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-orange-100 items-center justify-center mr-1">
                  <Ionicons
                    name={getLeaveTypeIcon(item.leaveType)}
                    size={20}
                    color="#f97316"
                  />
                </View>
                <Text className="text-base font-semibold text-slate-700">
                  {item.leaveType || "Leave"}
                </Text>
              </View>
              <LeaveStatusBadge status={item.status} />
            </View>
            {/* Details */}
            <View className="rounded-lg p-3 border-b border-slate-200 ">
              <View className="flex-row items-center mb-1 ">
                <Ionicons name="person-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                  Requester: {resolveRequesterLabel(item)}
                </Text>
              </View>
              {resolveApproverLabel(item, employeeDirectory) ? (
                <View className="flex-row items-center mb-1">
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={16}
                    color="#6B7280"
                  />
                  <Text className="text-gray-600 text-sm ml-2">
                    Approver: {resolveApproverLabel(item, employeeDirectory)}
                  </Text>
                </View>
              ) : null}
              {secondaryApproverName ? (
                <View className="flex-row items-center mb-1">
                  <Ionicons
                    name="arrow-redo-outline"
                    size={16}
                    color="#1d4ed8"
                  />
                  <Text className="text-blue-700 text-sm ml-2 font-medium">
                    Escalated to: {secondaryApproverName}
                  </Text>
                </View>
              ) : null}
              <View className="flex-row items-center mb-1">
                <Ionicons name="time-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                  Submitted: {formatLeaveDateTimeLabel(item.createdAt)}
                </Text>
              </View>
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                  Start: {formatLeaveBoundaryLabel(item, "start")}
                </Text>
              </View>
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                  End: {formatLeaveBoundaryLabel(item, "end")}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="pencil-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                  Reason: {item.leaveReason || "No reason"}
                </Text>
              </View>
            </View>
            <View className="rounded-lg p-3 ">
              <View className="flex-row items-center mb-1">
                <Ionicons name="pencil-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">
                  Comments: {item.approverComments}
                </Text>
              </View>
            </View>
            {canAct &&
            String(item?.status || "").toLowerCase().includes("pending") ? (
              <View className="flex-row gap-2 px-3 pb-3">
                <TouchableOpacity
                  onPress={() => openActionSection(item, "approve")}
                  activeOpacity={0.85}
                  className="flex-1 py-2.5 rounded-lg bg-green-500 items-center"
                >
                  <Text className="text-white font-semibold">Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openActionSection(item, "reject")}
                  activeOpacity={0.85}
                  className="flex-1 py-2.5 rounded-lg bg-red-500 items-center"
                >
                  <Text className="text-white font-semibold">Reject</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {canAct &&
            multiApprovalEnabled &&
            String(item?.status || "").toLowerCase() === "pending" ? (
              <View className="px-3 pb-3">
                <TouchableOpacity
                  onPress={() => openActionSection(item, "escalate")}
                  activeOpacity={0.85}
                  className="flex-row py-2.5 rounded-lg border border-blue-200 bg-blue-50 items-center justify-center"
                >
                  <Ionicons name="arrow-redo-outline" size={16} color="#1d4ed8" />
                  <Text className="text-blue-700 font-semibold ml-1.5">
                    Escalate to another supervisor
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ---------------------------------------------------------------------
  // Render ACTIONS MODAL SUB-SECTIONS (Approve, Reject, Delete)
  // ---------------------------------------------------------------------

  const renderApproveSection = () => {
    const leaveId = resolveLeaveId(actionsLeave);
    const isProcessing =
      leaveId != null && processingLeaves[leaveId] === "approving";
    return (
      <View className="bg-slate-50 rounded-lg p-4 mb-4 ">
        <Text className="text-lg font-bold text-slate-700 mb-3">
          Approve Leave
        </Text>
        <Text className="text-slate-600 mb-4">
          Optionally provide comments for approving this leave:
        </Text>
        <View className="bg-white rounded-lg px-3 py-2 mb-4">
          <TextInput
            value={approveComments}
            onChangeText={setApproveComments}
            placeholder="Enter your comments (optional)"
            placeholderTextColor="#9CA3AF"
            multiline
            style={{ minHeight: 80, color: "#374151" }}
          />
        </View>
        <View className="w-full flex-col gap-2 p-1">
          <TouchableOpacity
            onPress={confirmApprove}
            activeOpacity={0.8}
            className="bg-orange-500 py-3 px-5 rounded-lg"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-center text-lg ">
                Approve
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setExpandedSection(null)}
            activeOpacity={0.8}
            className="border border-slate-200 py-3 px-5 rounded-lg"
          >
            <Text className="text-slate-700  text-center text-lg font-semibold ">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderRejectSection = () => {
    const leaveId = resolveLeaveId(actionsLeave);
    const isProcessing =
      leaveId != null && processingLeaves[leaveId] === "rejecting";
    return (
      <View className="bg-slate-50 rounded-lg p-4 mb-4">
        <Text className="text-lg font-bold text-slate-700 mb-3">
          Reject Leave
        </Text>
        <Text className="text-slate-600 mb-4">
          Optionally provide comments for rejecting this leave:
        </Text>
        <View className="bg-white rounded-lg px-3 py-2 mb-4">
          <TextInput
            value={rejectComments}
            onChangeText={setRejectComments}
            placeholder="Enter your comments (optional)"
            placeholderTextColor="#9CA3AF"
            multiline
            style={{ minHeight: 80, color: "#374151" }}
          />
        </View>
        <View className="w-full flex-col gap-2 p-1">
          <TouchableOpacity
            onPress={confirmReject}
            activeOpacity={0.8}
            className="bg-orange-500 py-3 px-5 rounded-lg"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-center text-lg ">
                Reject
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setExpandedSection(null)}
            activeOpacity={0.8}
            className="border border-slate-200 py-3 px-5 rounded-lg"
          >
            <Text className="text-slate-700  text-center text-lg font-semibold">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEscalateSection = () => {
    const leaveId = resolveLeaveId(actionsLeave);
    const isProcessing =
      leaveId != null && processingLeaves[leaveId] === "escalating";
    return (
      <View className="bg-slate-50 rounded-lg p-4 mb-4">
        <Text className="text-lg font-bold text-slate-700 mb-3">
          Escalate Leave
        </Text>
        <Text className="text-slate-600 mb-4">
          Pass this leave request to another supervisor or admin for final
          approval:
        </Text>
        <View style={{ zIndex: 2000 }} className="mb-4">
          {escalateTargetsLoading ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color="#f97316" />
            </View>
          ) : (
            <DropDownPicker
              open={escalateOpen}
              value={escalateValue}
              items={escalateItems}
              setOpen={setEscalateOpen}
              setValue={setEscalateValue}
              setItems={setEscalateItems}
              placeholder="Select an approver"
              textStyle={{ color: "#374151" }}
              style={{
                borderColor: "#e2e8f0",
                backgroundColor: "#fff",
                minHeight: 50,
              }}
              dropDownContainerStyle={{
                borderColor: "#e2e8f0",
                backgroundColor: "#fff",
              }}
              placeholderStyle={{ color: "#9CA3AF" }}
              zIndex={2000}
              zIndexInverse={2000}
              nestedScrollEnabled={true}
              listMode="SCROLLVIEW"
              scrollViewProps={{ nestedScrollEnabled: true }}
              autoScroll={false}
            />
          )}
        </View>
        <View className="bg-white rounded-lg px-3 py-2 mb-4">
          <TextInput
            value={escalateComments}
            onChangeText={setEscalateComments}
            placeholder="Add a note for the next approver (optional)"
            placeholderTextColor="#9CA3AF"
            multiline
            style={{ minHeight: 80, color: "#374151" }}
          />
        </View>
        <View className="w-full flex-col gap-2 p-1">
          <TouchableOpacity
            onPress={confirmEscalate}
            activeOpacity={0.8}
            className="bg-blue-600 py-3 px-5 rounded-lg"
            disabled={isProcessing || !escalateValue}
            style={{ opacity: !escalateValue ? 0.6 : 1 }}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-center text-lg ">
                Escalate
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setExpandedSection(null)}
            activeOpacity={0.8}
            className="border border-slate-200 py-3 px-5 rounded-lg"
          >
            <Text className="text-slate-700  text-center text-lg font-semibold">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDeleteSection = () => {
    const leaveId = resolveLeaveId(actionsLeave);
    const isProcessing =
      leaveId != null && processingLeaves[leaveId] === "deleting";
    return (
      <View className="bg-slate-50 rounded-lg p-4 mb-4">
        <Text className="text-lg font-bold text-slate-700 mb-3">
          Delete Leave
        </Text>
        <Text className="text-slate-600 mb-4">
          Are you sure you want to delete this leave request? This action cannot
          be undone.
        </Text>
        <View className="w-full flex-col gap-2 p-1">
          <TouchableOpacity
            onPress={confirmDelete}
            activeOpacity={0.8}
            className="bg-orange-500 py-3 px-5 rounded-lg"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-center text-lg ">
                Delete
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setExpandedSection(null)}
            activeOpacity={0.8}
            className="border border-slate-200 py-3 px-5 rounded-lg"
          >
            <Text className="text-slate-700  text-center text-lg font-semibold">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ---------------------------------------------------------------------
  // Render Main Component
  // ---------------------------------------------------------------------

  const actionsCanAct = actionsLeave
    ? resolveCanAct(actionsLeave, currentUserId, userRole)
    : false;

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
            Manage Leaves
          </Text>
          <Text className="text-gray-500 mb-4">
            Review and manage leave requests from your team
          </Text>
          {/* New Leave Request Button */}
          <View className="mb-4">
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/(leaves)/leaves-request")}
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
                New Leave Request
              </Text>
            </TouchableOpacity>
          </View>
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
            data={filteredLeaves}
            keyExtractor={(item, index) =>
              String(resolveLeaveId(item) ?? index)
            }
            renderItem={renderItem}
            contentContainerStyle={[
              { paddingHorizontal: 16, paddingBottom: 20 },
              filteredLeaves.length === 0 && { flex: 1 },
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

        {/* Sort Modal (unchanged) */}
        {sortModalVisible && (
          <View style={StyleSheet.absoluteFill}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(0, 0, 0, 0.5)", opacity: modalBgAnim },
              ]}
            >
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={closeSortModal}
              />
            </Animated.View>
            <Animated.View
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
              style={{
                transform: [{ translateY: sortModalAnim }],
                paddingBottom: Platform.OS === "ios" ? 30 : 20,
              }}
            >
              <View className="items-center py-3">
                <View className="w-10 h-1 bg-slate-200 rounded-full" />
              </View>
              <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
                <Text className="text-lg font-bold text-slate-800">
                  Sort By
                </Text>
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
              <SortOption
                label="Requester Name"
                icon="person-outline"
                isActive={sortOption === "requester"}
                onPress={() => {
                  setSortOption("requester");
                  closeSortModal();
                }}
              />
            </Animated.View>
          </View>
        )}
      </Animated.View>

      {/* ACTIONS MODAL – mimicking the Departments modal style */}
      {actionsModalVisible && actionsLeave && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)", opacity: modalBgAnim },
            ]}
            onTouchEnd={closeActionsModal}
          />
          <Animated.View
            style={{
              transform: [{ translateY: actionsModalY }],
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "white",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              minHeight: height * 0.7,
              maxHeight: Platform.OS === "ios" ? height * 0.7 : height * 0.85,
              paddingBottom: Platform.OS === "ios" ? 0 : 20,
            }}
          >
            <View
              className="items-center py-3"
              {...actionsPanResponder.panHandlers}
            >
              <View className="w-10 h-1 bg-slate-200 rounded-lg" />
            </View>
            <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100 mb-4">
              <Text className="text-lg font-bold text-slate-700">
                Leave Actions
              </Text>
              <TouchableOpacity onPress={closeActionsModal}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              {expandedSection === null && (
                <>
                  {resolveSecondaryApproverLabel(actionsLeave, employeeDirectory) ? (
                    <View className="flex-row items-center p-3 mb-3 bg-blue-50 rounded-lg border border-blue-200">
                      <Ionicons
                        name="arrow-redo-outline"
                        size={18}
                        color="#1d4ed8"
                      />
                      <Text className="text-blue-700 text-sm ml-2 font-medium">
                        Escalated to{" "}
                        {resolveSecondaryApproverLabel(actionsLeave, employeeDirectory)}
                      </Text>
                    </View>
                  ) : null}
                  {/* Only show Approve & Reject if leave is pending and this viewer is eligible to act */}
                  {actionsCanAct &&
                    String(actionsLeave?.status || "")
                      .toLowerCase()
                      .includes("pending") && (
                    <>
                      <TouchableOpacity
                        onPress={() => setExpandedSection("approve")}
                        className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                      >
                        <View className="flex-row items-center">
                          <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color="#fff"
                            />
                          </View>
                          <Text className="text-slate-700 font-medium">
                            Approve Leave
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={24}
                          color="#64748b"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setExpandedSection("reject")}
                        className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                      >
                        <View className="flex-row items-center">
                          <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                            <Ionicons
                              name="close-circle"
                              size={18}
                              color="#fff"
                            />
                          </View>
                          <Text className="text-slate-700 font-medium">
                            Reject Leave
                          </Text>
                        </View>
                      <Ionicons
                        name="chevron-forward"
                        size={24}
                        color="#64748b"
                      />
                    </TouchableOpacity>
                    </>
                  )}
                  {actionsCanAct &&
                    multiApprovalEnabled &&
                    String(actionsLeave?.status || "").toLowerCase() ===
                      "pending" && (
                      <TouchableOpacity
                        onPress={() => {
                          setExpandedSection("escalate");
                          loadEscalationTargets(actionsLeave);
                        }}
                        className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                      >
                        <View className="flex-row items-center">
                          <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                            <Ionicons
                              name="arrow-redo-outline"
                              size={18}
                              color="#fff"
                            />
                          </View>
                          <Text className="text-slate-700 font-medium">
                            Escalate Leave
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={24}
                          color="#64748b"
                        />
                      </TouchableOpacity>
                    )}
                  <TouchableOpacity
                    onPress={() => setExpandedSection("delete")}
                    className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                  >
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                        <Ionicons name="trash-bin" size={18} color="#fff" />
                      </View>
                      <Text className="text-slate-700 font-medium">
                        Delete Leave
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={24}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </>
              )}
              {expandedSection === "approve" && renderApproveSection()}
              {expandedSection === "reject" && renderRejectSection()}
              {expandedSection === "escalate" && renderEscalateSection()}
              {expandedSection === "delete" && renderDeleteSection()}
            </ScrollView>
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
