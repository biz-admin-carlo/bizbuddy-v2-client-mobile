// app/(tabs)/(requests)/index.jsx

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert as RNAlert,
  Animated,
  PanResponder,
  Platform,
  TouchableOpacity,
  Modal,
  ScrollView,
  Linking,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL, WEBSITE_URL } from "../../../config/constant";
import { getTokenEmail, getTokenUserId } from "../../../store/useAuthStore";
import { pickerDateKey } from "../../../utils/requestListFilters";
import { fetchEscalationTargets } from "../../../utils/leaveEscalation";
import { leaveRequestType } from "../../../utils/requestTypes/leave";
import { overtimeRequestType } from "../../../utils/requestTypes/overtime";
import { punchRequestType } from "../../../utils/requestTypes/punch";
import { resolveRequestId } from "../../../utils/requestTypes/shared";
import RequestCard from "../../../components/request-card";
import RequestDetailSheet from "../../../components/request-detail-sheet";
import RequestEmptyState from "../../../components/request-empty-state";
import RequestEscalateSheet from "../../../components/request-escalate-sheet";
import RequestFilterPill from "../../../components/request-filter-pill";
import RequestScopeSwitcher from "../../../components/request-scope-switcher";
import RequestSortSheet, {
  REQUEST_SORT_SHEET_HEIGHT,
} from "../../../components/request-sort-sheet";

const REQUEST_TYPES = {
  leave: leaveRequestType,
  overtime: overtimeRequestType,
  punch: punchRequestType,
};

const TYPE_ORDER = ["leave", "overtime", "punch"];

const MANAGEMENT_ROLES = ["supervisor", "admin", "superadmin"];

const actionStyles = {
  approve: {
    className: "bg-green-500",
    textClassName: "text-white font-semibold",
    spinnerColor: "#FFFFFF",
  },
  reject: {
    className: "bg-red-500",
    textClassName: "text-white font-semibold",
    spinnerColor: "#FFFFFF",
  },
  escalate: {
    className: "border border-blue-200 bg-blue-50",
    textClassName: "text-blue-700 font-semibold",
    icon: "arrow-redo-outline",
    iconColor: "#1d4ed8",
    spinnerColor: "#1d4ed8",
    fullWidth: true,
  },
  cancel: {
    className: "border border-red-200 bg-red-50",
    textClassName: "text-red-700 font-semibold",
    spinnerColor: "#b91c1c",
    fullWidth: true,
  },
  delete: {
    className: "border border-slate-200 bg-slate-50",
    textClassName: "text-slate-700 font-semibold",
    spinnerColor: "#475569",
    fullWidth: true,
  },
};

export default function UnifiedRequests() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const paramType = String(params?.type ?? "").toLowerCase();

  const [activeType, setActiveType] = useState(
    REQUEST_TYPES[paramType] ? paramType : "leave",
  );
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [scope, setScope] = useState("employees");
  const [dateFilter, setDateFilter] = useState(null);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortOption, setSortOption] = useState("newest");
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [newRequestVisible, setNewRequestVisible] = useState(false);
  const [isCompanyView, setIsCompanyView] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [isFreePlan, setIsFreePlan] = useState(false);
  const [typeContext, setTypeContext] = useState({});
  const [processing, setProcessing] = useState({});
  const [escalateVisible, setEscalateVisible] = useState(false);
  const [escalateItem, setEscalateItem] = useState(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateValue, setEscalateValue] = useState(null);
  const [escalateItems, setEscalateItems] = useState([]);
  const [escalateComments, setEscalateComments] = useState("");
  const [escalateTargetsLoading, setEscalateTargetsLoading] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const sortButtonScale = useRef(new Animated.Value(1)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const sortModalAnim = useRef(new Animated.Value(REQUEST_SORT_SHEET_HEIGHT)).current;

  const descriptor = REQUEST_TYPES[activeType] ?? leaveRequestType;
  const scopeFilterActive =
    descriptor.hasScope && isCompanyView && !!(currentUserId || currentUserEmail);
  const typeLocked = descriptor.lockedOnFreePlan && isFreePlan;

  const sortPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) sortModalAnim.setValue(gestureState.dy);
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
    }),
  ).current;

  useEffect(() => {
    if (REQUEST_TYPES[paramType] && paramType !== activeType) {
      setActiveType(paramType);
      setActiveFilter("all");
      setDateFilter(null);
      setSortOption("newest");
      setSelected(null);
      setDetailVisible(false);
    }
  }, [paramType]);

  const fetchProfile = useCallback(async (token) => {
    let role = "";
    let companyView = false;
    let freePlan = false;
    try {
      const profileRes = await fetch(`${API_BASE_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profileData = await profileRes.json();
      role = String(profileData?.data?.user?.role ?? "").toLowerCase();
      companyView = MANAGEMENT_ROLES.includes(role);
      const planName = String(
        profileData?.data?.subscription?.plan?.name ?? "",
      ).toLowerCase();
      freePlan = planName === "free";
    } catch (profileError) {
      console.error("Error resolving request view role:", profileError);
    }
    setUserRole(role);
    setIsCompanyView(companyView);
    setIsFreePlan(freePlan);
    setCurrentUserId(getTokenUserId(token));
    setCurrentUserEmail(getTokenEmail(token));
    return { role, companyView, freePlan };
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert(
          "Authentication Error",
          "You are not logged in. Please sign in again.",
          [{ text: "OK", onPress: () => router.replace("(auth)/signin") }],
        );
        return;
      }
      const { companyView, freePlan } = await fetchProfile(token);
      const currentDescriptor = REQUEST_TYPES[activeType] ?? leaveRequestType;
      if (currentDescriptor.lockedOnFreePlan && freePlan) {
        setRows([]);
        setTypeContext({});
        return;
      }
      const context = await currentDescriptor.fetchContext({
        token,
        isCompanyView: companyView,
      });
      setTypeContext(context);
      const list = await currentDescriptor.fetchRows({
        token,
        isCompanyView: companyView,
        currentUserId: getTokenUserId(token),
        currentUserEmail: getTokenEmail(token),
        context,
      });
      setRows(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Error fetching requests:", error);
      RNAlert.alert("Error", "An error occurred while fetching requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeType, fetchProfile, router]);

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

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const actionCtx = useMemo(
    () => ({
      isCompanyView,
      userRole,
      currentUserId,
      currentUserEmail,
      multiApprovalEnabled: !!typeContext.multiApprovalEnabled,
      employeeDirectory: typeContext.employeeDirectory ?? {},
      companyTimeZone: typeContext.companyTimeZone,
    }),
    [
      isCompanyView,
      userRole,
      currentUserId,
      currentUserEmail,
      typeContext,
    ],
  );

  const presented = useMemo(() => {
    let result = [...rows];
    if (scopeFilterActive) {
      result = result.filter((item) => {
        const isOwn = descriptor.isOwn(item, currentUserId, currentUserEmail);
        return scope === "mine" ? isOwn : !isOwn;
      });
    }
    const dateKey = pickerDateKey(dateFilter);
    if (dateKey) {
      result = result.filter((item) =>
        descriptor.matchesDate(item, dateKey, actionCtx),
      );
    }
    result = result.filter((item) =>
      descriptor.matchesStatus(item, activeFilter),
    );
    result.sort((a, b) => {
      if (sortOption === "oldest") {
        return descriptor.sortValue(a, "oldest") - descriptor.sortValue(b, "oldest");
      }
      if (sortOption === "newest") {
        return descriptor.sortValue(b, "newest") - descriptor.sortValue(a, "newest");
      }
      const left = String(descriptor.sortValue(a, sortOption) ?? "");
      const right = String(descriptor.sortValue(b, sortOption) ?? "");
      return left.localeCompare(right);
    });
    const showRequester = scopeFilterActive ? scope !== "mine" : isCompanyView;
    return result.map((item) =>
      descriptor.present(item, { ...actionCtx, showRequester }),
    );
  }, [
    rows,
    scopeFilterActive,
    scope,
    currentUserId,
    currentUserEmail,
    dateFilter,
    activeFilter,
    sortOption,
    descriptor,
    actionCtx,
    isCompanyView,
  ]);

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
        toValue: REQUEST_SORT_SHEET_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setSortModalVisible(false));
  };

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

  const closeDetail = () => {
    setDetailVisible(false);
    setSelected(null);
  };

  const setBusy = (id, value) => {
    setProcessing((prev) => ({ ...prev, [id]: value }));
  };

  const refreshAfterMutation = (id) => {
    if (selected && resolveRequestId(selected.raw) === id) closeDetail();
    fetchRows();
  };

  const handleMutationResult = async ({
    res,
    data,
    successMessage,
    fallbackError,
    id,
  }) => {
    if (res.ok) {
      RNAlert.alert("Success", successMessage);
      refreshAfterMutation(id);
      return;
    }
    const message = data?.message || fallbackError;
    if (
      String(message).toLowerCase().includes("not found") ||
      String(message).toLowerCase().includes("already processed") ||
      String(message).toLowerCase().includes("already actioned") ||
      String(message).toLowerCase().includes("already cancelled")
    ) {
      RNAlert.alert("Request updated", `${message} Refreshing request list.`);
      refreshAfterMutation(id);
    } else {
      RNAlert.alert("Error", message);
    }
  };

  const submitDecision = async (item, action, comments = "") => {
    const id = resolveRequestId(item);
    if (!id) {
      RNAlert.alert("Error", "Missing request ID. Please refresh and try again.");
      return;
    }
    if (descriptor.isStillPending && !descriptor.isStillPending(item)) {
      RNAlert.alert("Request updated", "This request is no longer pending. Refreshing the list.");
      refreshAfterMutation(id);
      return;
    }
    const path =
      action === "approve" ? descriptor.approvePath?.(id) : descriptor.rejectPath?.(id);
    if (!path) return;
    setBusy(id, action === "approve" ? "approving" : "rejecting");
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(path, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approverComments: comments }),
      });
      const data = await res.json().catch(() => ({}));
      await handleMutationResult({
        res,
        data,
        successMessage:
          action === "approve"
            ? "Request approved successfully."
            : "Request rejected successfully.",
        fallbackError:
          action === "approve"
            ? "Failed to approve request."
            : "Failed to reject request.",
        id,
      });
    } catch (error) {
      console.error(`Error ${action}ing request:`, error);
      RNAlert.alert("Error", `An error occurred while ${action}ing the request.`);
    } finally {
      setBusy(id, null);
    }
  };

  const promptDecision = (item, action) => {
    const title = action === "approve" ? "Approve request" : "Reject request";
    const confirmLabel = action === "approve" ? "Approve" : "Reject";
    if (Platform.OS === "ios" && typeof RNAlert.prompt === "function") {
      RNAlert.prompt(
        title,
        "Optional comments",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: confirmLabel,
            onPress: (text) => submitDecision(item, action, text || ""),
          },
        ],
        "plain-text",
      );
      return;
    }
    RNAlert.alert(title, `Are you sure you want to ${action} this request?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: confirmLabel,
        style: action === "reject" ? "destructive" : "default",
        onPress: () => submitDecision(item, action, ""),
      },
    ]);
  };

  const submitCancel = async (item) => {
    const id = resolveRequestId(item);
    if (!id) {
      RNAlert.alert("Error", "Missing request ID. Please refresh and try again.");
      return;
    }
    const path = descriptor.cancelPath?.(id);
    if (!path) return;
    setBusy(id, "cancelling");
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(path, {
        method: descriptor.cancelMethod ?? "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      await handleMutationResult({
        res,
        data,
        successMessage: "Request cancelled successfully.",
        fallbackError: "Failed to cancel request.",
        id,
      });
    } catch (error) {
      console.error("Error cancelling request:", error);
      RNAlert.alert("Error", "An error occurred while cancelling the request.");
    } finally {
      setBusy(id, null);
    }
  };

  const submitDelete = async (item) => {
    const id = resolveRequestId(item);
    if (!id) {
      RNAlert.alert("Error", "Missing request ID. Please refresh and try again.");
      return;
    }
    const path = descriptor.deletePath?.(id);
    if (!path) return;
    setBusy(id, "deleting");
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(path, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      await handleMutationResult({
        res,
        data,
        successMessage: data.message || "Request deleted successfully.",
        fallbackError: "Failed to delete request.",
        id,
      });
    } catch (error) {
      console.error("Error deleting request:", error);
      RNAlert.alert("Error", "An error occurred while deleting the request.");
    } finally {
      setBusy(id, null);
    }
  };

  const openEscalate = async (item) => {
    setEscalateItem(item);
    setEscalateValue(null);
    setEscalateOpen(false);
    setEscalateComments("");
    setEscalateItems([]);
    setEscalateVisible(true);
    setEscalateTargetsLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const targets = await fetchEscalationTargets(token, {
        excludeUserIds: [currentUserId, item?.userId],
      });
      setEscalateItems(targets);
    } finally {
      setEscalateTargetsLoading(false);
    }
  };

  const closeEscalate = () => {
    setEscalateVisible(false);
    setEscalateOpen(false);
    setEscalateItem(null);
    setEscalateValue(null);
    setEscalateComments("");
    setEscalateItems([]);
  };

  const submitEscalate = async () => {
    const id = resolveRequestId(escalateItem);
    if (!id) {
      RNAlert.alert("Error", "Missing request ID. Please refresh and try again.");
      return;
    }
    if (!escalateValue) {
      RNAlert.alert("Select an approver", "Please choose who to escalate this leave to.");
      return;
    }
    if (descriptor.isStillPending && !descriptor.isStillPending(escalateItem)) {
      RNAlert.alert("Request updated", "This request is no longer pending. Refreshing the list.");
      closeEscalate();
      refreshAfterMutation(id);
      return;
    }
    setEscalating(true);
    setBusy(id, "escalating");
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(descriptor.approvePath(id), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          escalateTo: escalateValue,
          approverComments: escalateComments,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        RNAlert.alert("Success", "Leave escalated for final approval.");
        closeEscalate();
        refreshAfterMutation(id);
      } else {
        const message = data.message || "Failed to escalate leave.";
        if (
          String(message).toLowerCase().includes("not found") ||
          String(message).toLowerCase().includes("already processed") ||
          String(message).toLowerCase().includes("already actioned")
        ) {
          RNAlert.alert("Request updated", `${message} Refreshing request list.`);
          closeEscalate();
          refreshAfterMutation(id);
        } else {
          RNAlert.alert("Error", message);
        }
      }
    } catch (error) {
      console.error("Error escalating leave:", error);
      RNAlert.alert("Error", "An error occurred while escalating the leave.");
    } finally {
      setEscalating(false);
      setBusy(id, null);
    }
  };

  const buildActions = (item) => {
    const id = resolveRequestId(item);
    const busy = processing[id];
    const actions = [];
    if (descriptor.canApprove?.(item, actionCtx)) {
      actions.push({
        key: "approve",
        label: "Approve",
        loading: busy === "approving",
        disabled: !!busy,
        onPress: () => promptDecision(item, "approve"),
        ...actionStyles.approve,
      });
    }
    if (descriptor.canReject?.(item, actionCtx)) {
      actions.push({
        key: "reject",
        label: "Reject",
        loading: busy === "rejecting",
        disabled: !!busy,
        onPress: () => promptDecision(item, "reject"),
        ...actionStyles.reject,
      });
    }
    if (descriptor.canEscalate?.(item, actionCtx)) {
      actions.push({
        key: "escalate",
        label: "Escalate to another supervisor",
        loading: busy === "escalating",
        disabled: !!busy,
        onPress: () => {
          closeDetail();
          openEscalate(item);
        },
        ...actionStyles.escalate,
      });
    }
    if (descriptor.canCancel?.(item, actionCtx)) {
      actions.push({
        key: "cancel",
        label: "Cancel request",
        loading: busy === "cancelling",
        disabled: !!busy,
        onPress: () => {
          RNAlert.alert(
            "Cancel request",
            "Are you sure you want to cancel this request?",
            [
              { text: "Keep request", style: "cancel" },
              {
                text: "Cancel request",
                style: "destructive",
                onPress: () => submitCancel(item),
              },
            ],
          );
        },
        ...actionStyles.cancel,
      });
    }
    if (descriptor.canDelete?.(item, actionCtx)) {
      actions.push({
        key: "delete",
        label: "Delete request",
        loading: busy === "deleting",
        disabled: !!busy,
        onPress: () => {
          RNAlert.alert(
            "Delete request",
            "This permanently removes the request. Continue?",
            [
              { text: "Keep request", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => submitDelete(item),
              },
            ],
          );
        },
        ...actionStyles.delete,
      });
    }
    return actions;
  };

  const emptyMessage = () => {
    const statusBit = activeFilter === "all" ? "" : `${activeFilter} `;
    const dateKey = pickerDateKey(dateFilter);
    const noun = descriptor.label.toLowerCase();
    if (dateKey) {
      return `No ${statusBit}${noun} requests for that date. Open Sort & filter to clear the date or pick another day.`;
    }
    if (activeFilter !== "all") {
      return `No ${activeFilter} ${noun} requests found. Try another filter or pull to refresh.`;
    }
    if (scopeFilterActive && scope === "mine") {
      return `You have not submitted any ${noun} requests yet.`;
    }
    if (isCompanyView) {
      return `No ${noun} requests found for employees yet.`;
    }
    return `You have not submitted any ${noun} requests yet.`;
  };

  const unlockedSubmitTypes = TYPE_ORDER.filter((key) => {
    const type = REQUEST_TYPES[key];
    return !(type.lockedOnFreePlan && isFreePlan);
  });

  const openNewRequest = () => {
    if (unlockedSubmitTypes.length === 1) {
      router.push(REQUEST_TYPES[unlockedSubmitTypes[0]].submitRoute);
      return;
    }
    setNewRequestVisible(true);
  };

  const changeType = (nextType) => {
    if (nextType === activeType) return;
    setActiveType(nextType);
    setActiveFilter("all");
    setDateFilter(null);
    setSortOption("newest");
    setSelected(null);
    setDetailVisible(false);
    router.setParams?.({ type: nextType });
  };

  const androidBottom =
    Platform.OS === "android" ? Math.max(insets.bottom, 28) : insets.bottom;

  const selectedPresented = selected
    ? descriptor.present(selected, {
        ...actionCtx,
        showRequester: true,
      })
    : null;

  const detailRows = selectedPresented
    ? [
        selectedPresented.requesterName
          ? {
              icon: "person-outline",
              label: "Requester",
              value: selectedPresented.requesterName,
            }
          : null,
        selectedPresented.submittedAt
          ? {
              icon: "time-outline",
              label: "Submitted",
              value: selectedPresented.submittedAt,
            }
          : null,
        selectedPresented.startLabel
          ? {
              icon: "play-outline",
              label: "Start",
              value: selectedPresented.startLabel,
            }
          : null,
        selectedPresented.endLabel
          ? {
              icon: "stop-outline",
              label: "End",
              value: selectedPresented.endLabel,
            }
          : null,
        {
          icon: "document-text-outline",
          label: "Reason",
          value: selectedPresented.reason || "No reason provided",
        },
        selectedPresented.approverName
          ? {
              icon: "shield-checkmark-outline",
              label: "Approver",
              value: selectedPresented.approverName,
            }
          : null,
        selectedPresented.secondaryApproverName
          ? {
              icon: "arrow-redo-outline",
              label: "Escalated to",
              value: selectedPresented.secondaryApproverName,
            }
          : null,
        ...(selectedPresented.extraDetailRows ?? []),
        selectedPresented.id
          ? {
              icon: "finger-print-outline",
              label: "Request ID",
              value: String(selectedPresented.id),
            }
          : null,
      ].filter(Boolean)
    : [];

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50"
      edges={["left", "right", "bottom"]}
      style={{ paddingTop: insets.top }}
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View className="px-4 pb-3 bg-white border-b border-slate-100">
          <View className="flex-row justify-between items-center mb-3">
            <View className="flex-row items-center flex-1 pr-3">
              <Ionicons name="documents-outline" size={24} color="#f97316" />
              <Text className="text-xl font-bold text-slate-800 ml-2">
                Requests
              </Text>
            </View>
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={openNewRequest}
                activeOpacity={0.85}
                accessibilityLabel="New request"
                className="flex-row items-center bg-orange-50 border border-orange-200 px-3 py-2 rounded-full mr-2"
              >
                <Ionicons name="add" size={16} color="#ea580c" />
                <Text className="text-orange-600 font-semibold text-sm ml-1">
                  New
                </Text>
              </TouchableOpacity>
              <Animated.View style={{ transform: [{ scale: sortButtonScale }] }}>
                <TouchableOpacity
                  onPress={() => {
                    animateButtonPress(sortButtonScale);
                    setTimeout(openSortModal, 100);
                  }}
                  activeOpacity={0.8}
                  className={`w-10 h-10 rounded-full border items-center justify-center ${
                    dateFilter
                      ? "bg-orange-50 border-orange-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                  accessibilityLabel={
                    dateFilter
                      ? "Sort and filter requests, date filter active"
                      : "Sort and filter requests"
                  }
                >
                  <Ionicons
                    name="options-outline"
                    size={20}
                    color={dateFilter ? "#ea580c" : "#64748b"}
                  />
                  {dateFilter ? (
                    <View className="absolute top-0 right-0 w-3 h-3 rounded-full bg-orange-500 border-2 border-white" />
                  ) : null}
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>

          <View className="mb-3">
            <RequestScopeSwitcher
              value={activeType}
              onChange={changeType}
              options={TYPE_ORDER.map((key) => ({
                key,
                label: REQUEST_TYPES[key].label,
                icon: REQUEST_TYPES[key].icon,
              }))}
            />
          </View>

          {scopeFilterActive && !typeLocked ? (
            <View className="mb-3">
              <RequestScopeSwitcher
                value={scope}
                onChange={setScope}
                options={[
                  {
                    key: "employees",
                    label: `Employee ${descriptor.label.toLowerCase()}`,
                    icon: "people-outline",
                  },
                  {
                    key: "mine",
                    label: `My ${descriptor.label.toLowerCase()}`,
                    icon: "person-outline",
                  },
                ]}
              />
            </View>
          ) : null}

          {!typeLocked ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 8 }}
            >
              {descriptor.statusFilters.map((filter) => (
                <RequestFilterPill
                  key={filter.key}
                  label={filter.label}
                  isActive={activeFilter === filter.key}
                  onPress={() => setActiveFilter(filter.key)}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>

        {typeLocked ? (
          <View className="flex-1 justify-center items-center px-8">
            <View className="w-16 h-16 rounded-full bg-orange-100 items-center justify-center mb-4">
              <Ionicons name="lock-closed" size={32} color="#fb923c" />
            </View>
            <Text className="text-xl font-bold text-slate-800 mb-2">
              {descriptor.label} is locked
            </Text>
            <Text className="text-center text-slate-600 mb-6">
              This request type is not included in the free plan.
            </Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(WEBSITE_URL)}
              className="bg-orange-400 px-5 py-3 rounded-xl"
            >
              <Text className="text-white font-semibold">Visit website</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View className="flex-1 justify-center items-center bg-slate-50">
            <ActivityIndicator size="large" color="#f97316" />
            <Text className="mt-4 text-slate-500 text-sm">Loading requests…</Text>
          </View>
        ) : (
          <FlatList
            data={presented}
            keyExtractor={(item, index) => String(item.id ?? index)}
            renderItem={({ item }) => (
              <RequestCard
                title={item.title}
                subtitle={item.subtitle}
                status={item.status}
                periodLabel={item.periodLabel}
                periodValue={item.periodValue}
                submittedLabel={item.submittedLabel}
                reason={item.reason}
                approverName={item.approverName}
                secondaryApproverName={item.secondaryApproverName}
                icon={item.icon}
                onPress={() => {
                  setSelected(item.raw);
                  setDetailVisible(true);
                }}
                actions={buildActions(item.raw)}
              />
            )}
            className="bg-slate-50"
            contentContainerStyle={[
              {
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: androidBottom + 24,
              },
              presented.length === 0 && { flex: 1 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchRows();
                }}
                colors={["#f97316"]}
                tintColor="#f97316"
              />
            }
            ListEmptyComponent={
              <RequestEmptyState
                icon={descriptor.emptyIcon}
                title={descriptor.emptyTitle}
                message={emptyMessage()}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>

      <RequestDetailSheet
        visible={detailVisible && !!selectedPresented}
        onClose={closeDetail}
        title={selectedPresented?.title}
        subtitle={`${descriptor.label} request details`}
        icon={selectedPresented?.icon}
        status={selectedPresented?.status}
        paidLabel={selectedPresented?.paidLabel}
        rows={detailRows}
        processing={
          selectedPresented?.id ? !!processing[selectedPresented.id] : false
        }
        actions={selected ? buildActions(selected) : []}
      />

      <RequestEscalateSheet
        visible={escalateVisible}
        onClose={closeEscalate}
        open={escalateOpen}
        setOpen={setEscalateOpen}
        value={escalateValue}
        setValue={setEscalateValue}
        items={escalateItems}
        setItems={setEscalateItems}
        comments={escalateComments}
        setComments={setEscalateComments}
        loadingTargets={escalateTargetsLoading}
        submitting={escalating}
        onSubmit={submitEscalate}
      />

      <RequestSortSheet
        visible={sortModalVisible}
        onClose={closeSortModal}
        sortOption={sortOption}
        onSelectSort={(key) => {
          setSortOption(key);
          closeSortModal();
        }}
        sortOptions={descriptor.sortOptions}
        dateFilter={dateFilter}
        onChangeDate={setDateFilter}
        datePlaceholder={descriptor.datePlaceholder}
        panHandlers={sortPanResponder.panHandlers}
        backgroundOpacity={modalBgAnim}
        translateY={sortModalAnim}
      />

      <Modal
        visible={newRequestVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewRequestVisible(false)}
      >
        <View className="flex-1 justify-end">
          <TouchableOpacity
            className="absolute inset-0 bg-black/45"
            activeOpacity={1}
            onPress={() => setNewRequestVisible(false)}
          />
          <View className="bg-white rounded-t-3xl px-5 pb-8 pt-3">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-slate-200 rounded-full" />
            </View>
            <Text className="text-lg font-bold text-slate-800 mb-1">
              New request
            </Text>
            <Text className="text-slate-500 text-sm mb-4">
              Choose the type of request to submit.
            </Text>
            {unlockedSubmitTypes.map((key) => {
              const type = REQUEST_TYPES[key];
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setNewRequestVisible(false);
                    router.push(type.submitRoute);
                  }}
                  activeOpacity={0.85}
                  className="flex-row items-center py-3.5 border-b border-slate-100"
                >
                  <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center mr-3">
                    <Ionicons name={type.icon} size={18} color="#ea580c" />
                  </View>
                  <Text className="text-base font-semibold text-slate-800">
                    {type.submitLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => setNewRequestVisible(false)}
              className="mt-4 py-3.5 items-center rounded-xl border border-slate-200"
            >
              <Text className="text-slate-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
