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
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../../../config/constant";

const { height } = Dimensions.get("window");

// ---------------------------------------------------------------------
// UI Components (Status badge, formatting, filter, sort)
// ---------------------------------------------------------------------

const LeaveStatusBadge = ({ status }) => {
  let bgColor, textColor, icon;
  switch (status.toLowerCase()) {
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
      <Ionicons name={icon} size={14} color={textColor.replace("text-", "")} style={{ marginRight: 4 }} />
      <Text className={`text-xs font-medium ${textColor}`}>{status}</Text>
    </View>
  );
};

const formatDateTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const FilterOption = ({ label, isActive, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 70, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
    ]).start();
  };
  const handlePress = () => {
    animatePress();
    setTimeout(() => onPress(), 100);
  };
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8} className={`px-4 py-2 rounded-full mr-2 ${isActive ? "bg-orange-400" : "bg-gray-100"}`}>
        <Text className={`text-sm font-medium ${isActive ? "text-white" : "text-gray-700"}`}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const SortOption = ({ label, icon, onPress, isActive }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 70, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
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
        <Text className={`text-base ${isActive ? "text-orange-400 font-medium" : "text-gray-700"}`}>{label}</Text>
        {isActive && <Ionicons name="checkmark" size={20} color="#f97316" style={{ marginLeft: "auto" }} />}
      </TouchableOpacity>
    </Animated.View>
  );
};

const EmptyListComponent = ({ activeFilter }) => (
  <View className="flex-1 justify-center items-center py-10">
    <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-4">
      <Ionicons name="document-text-outline" size={28} color="#9CA3AF" />
    </View>
    <Text className="text-gray-500 text-lg font-medium mb-1">No leave requests</Text>
    <Text className="text-gray-400 text-center px-10">
      {activeFilter === "all" ? "You don't have any leave requests to manage at the moment." : `No ${activeFilter} leave requests found.`}
    </Text>
  </View>
);

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

  // ACTIONS Modal state (for when a leave card is tapped)
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsLeave, setActionsLeave] = useState(null);
  // Expanded section: "approve", "reject", "delete" or null
  const [expandedSection, setExpandedSection] = useState(null);

  // For optional comments when approving or rejecting.
  const [approveComments, setApproveComments] = useState("");
  const [rejectComments, setRejectComments] = useState("");

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
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          actionsModalY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeActionsModal();
        } else {
          Animated.spring(actionsModalY, { toValue: 0, useNativeDriver: true }).start();
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
        RNAlert.alert("Authentication Error", "You are not logged in. Please sign in again.", [
          { text: "OK", onPress: () => router.replace("(auth)/login-user") },
        ]);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/leaves/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setApproverLeaves(data.data);
        applyFiltersAndSort(data.data, activeFilter, sortOption);
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
      result = result.filter((item) => item.status.toLowerCase() === filter.toLowerCase());
    }
    switch (sort) {
      case "newest":
        result.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        break;
      case "oldest":
        result.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        break;
      case "type":
        result.sort((a, b) => a.leaveType.localeCompare(b.leaveType));
        break;
      case "status":
        result.sort((a, b) => a.status.localeCompare(b.status));
        break;
      case "requester":
        result.sort((a, b) => {
          const nameA = a.requester?.username || "";
          const nameB = b.requester?.username || "";
          return nameA.localeCompare(nameB);
        });
        break;
      default:
        break;
    }
    setFilteredLeaves(result);
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
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
      Animated.timing(modalBgAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(sortModalAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
    ]).start();
  };

  const closeSortModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(sortModalAnim, { toValue: height, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setSortModalVisible(false);
    });
  };

  // ---------------------------------------------------------------------
  // ACTIONS MODAL (mimicking Department modal styling)
  // ---------------------------------------------------------------------

  const openActionsModal = (leaveItem) => {
    setActionsLeave(leaveItem);
    setExpandedSection(null);
    setApproveComments("");
    setRejectComments("");
    setActionsModalVisible(true);
    actionsModalY.setValue(height);
    Animated.parallel([
      Animated.timing(modalBgAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(actionsModalY, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start();
  };

  const closeActionsModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(actionsModalY, { toValue: height, duration: 300, useNativeDriver: true }),
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
    if (!actionsLeave?.id) {
      closeActionsModal();
      return;
    }
    setProcessingLeaves((prev) => ({ ...prev, [actionsLeave.id]: "approving" }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${API_BASE_URL}/api/leaves/${actionsLeave.id}/approve`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approverComments: approveComments }),
      });
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Leave approved successfully.");
        fetchApproverLeaves();
      } else {
        RNAlert.alert("Error", data.message || "Failed to approve leave.");
      }
    } catch (error) {
      console.error("Error approving leave:", error);
      RNAlert.alert("Error", "An error occurred while approving the leave.");
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [actionsLeave.id]: null }));
      closeActionsModal();
    }
  };

  const confirmReject = async () => {
    if (!actionsLeave?.id) {
      closeActionsModal();
      return;
    }
    setProcessingLeaves((prev) => ({ ...prev, [actionsLeave.id]: "rejecting" }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${API_BASE_URL}/api/leaves/${actionsLeave.id}/reject`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approverComments: rejectComments }),
      });
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Leave rejected successfully.");
        fetchApproverLeaves();
      } else {
        RNAlert.alert("Error", data.message || "Failed to reject leave.");
      }
    } catch (error) {
      console.error("Error rejecting leave:", error);
      RNAlert.alert("Error", "An error occurred while rejecting the leave.");
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [actionsLeave.id]: null }));
      closeActionsModal();
    }
  };

  const confirmDelete = async () => {
    if (!actionsLeave?.id) {
      closeActionsModal();
      return;
    }
    setProcessingLeaves((prev) => ({ ...prev, [actionsLeave.id]: "deleting" }));
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${API_BASE_URL}/api/leaves/${actionsLeave.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", data.message || "Leave deleted successfully.");
        fetchApproverLeaves();
      } else {
        RNAlert.alert("Error", data.message || "Failed to delete leave.");
      }
    } catch (error) {
      console.error("Error deleting leave:", error);
      RNAlert.alert("Error", "An error occurred while deleting the leave.");
    } finally {
      setProcessingLeaves((prev) => ({ ...prev, [actionsLeave.id]: null }));
      closeActionsModal();
    }
  };

  // ---------------------------------------------------------------------
  // Render Leave Card
  // ---------------------------------------------------------------------

  const renderItem = ({ item }) => {
    const cardScale = new Animated.Value(1);
    const animatePress = () => {
      Animated.sequence([
        Animated.timing(cardScale, { toValue: 0.97, duration: 70, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
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
                  <Ionicons name={getLeaveTypeIcon(item.leaveType)} size={20} color="#f97316" />
                </View>
                <Text className="text-base font-semibold text-slate-700">{item.leaveType}</Text>
              </View>
              <LeaveStatusBadge status={item.status} />
            </View>
            {/* Details */}
            <View className="rounded-lg p-3 border-b border-slate-200 ">
              <View className="flex-row items-center mb-1 ">
                <Ionicons name="person-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">Requester: {item.User.email}</Text>
              </View>
              <View className="flex-row items-center mb-1">
                <Ionicons name="time-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">Submitted: {formatDateTime(item.createdAt)}</Text>
              </View>
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">Start: {formatDateTime(item.startDate)}</Text>
              </View>
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">End: {formatDateTime(item.endDate)}</Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="pencil-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">Reason: {item.leaveReason || "No reason"}</Text>
              </View>
            </View>
            <View className="rounded-lg p-3 ">
              <View className="flex-row items-center mb-1">
                <Ionicons name="pencil-outline" size={16} color="#6B7280" />
                <Text className="text-gray-600 text-sm ml-2">Comments: {item.approverComments}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ---------------------------------------------------------------------
  // Render ACTIONS MODAL SUB-SECTIONS (Approve, Reject, Delete)
  // ---------------------------------------------------------------------

  const renderApproveSection = () => {
    const isProcessing = actionsLeave && processingLeaves[actionsLeave.id] === "approving";
    return (
      <View className="bg-slate-50 rounded-lg p-4 mb-4 ">
        <Text className="text-lg font-bold text-slate-700 mb-3">Approve Leave</Text>
        <Text className="text-slate-600 mb-4">Optionally provide comments for approving this leave:</Text>
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
          <TouchableOpacity onPress={confirmApprove} activeOpacity={0.8} className="bg-orange-500 py-3 px-5 rounded-lg" disabled={isProcessing}>
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-center text-lg ">Approve</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setExpandedSection(null)} activeOpacity={0.8} className="border border-slate-200 py-3 px-5 rounded-lg">
            <Text className="text-slate-700  text-center text-lg font-semibold ">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderRejectSection = () => {
    const isProcessing = actionsLeave && processingLeaves[actionsLeave.id] === "rejecting";
    return (
      <View className="bg-slate-50 rounded-lg p-4 mb-4">
        <Text className="text-lg font-bold text-slate-700 mb-3">Reject Leave</Text>
        <Text className="text-slate-600 mb-4">Optionally provide comments for rejecting this leave:</Text>
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
          <TouchableOpacity onPress={confirmReject} activeOpacity={0.8} className="bg-orange-500 py-3 px-5 rounded-lg" disabled={isProcessing}>
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-center text-lg ">Reject</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setExpandedSection(null)} activeOpacity={0.8} className="border border-slate-200 py-3 px-5 rounded-lg">
            <Text className="text-slate-700  text-center text-lg font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDeleteSection = () => {
    const isProcessing = actionsLeave && processingLeaves[actionsLeave.id] === "deleting";
    return (
      <View className="bg-slate-50 rounded-lg p-4 mb-4">
        <Text className="text-lg font-bold text-slate-700 mb-3">Delete Leave</Text>
        <Text className="text-slate-600 mb-4">Are you sure you want to delete this leave request? This action cannot be undone.</Text>
        <View className="w-full flex-col gap-2 p-1">
          <TouchableOpacity onPress={confirmDelete} activeOpacity={0.8} className="bg-orange-500 py-3 px-5 rounded-lg" disabled={isProcessing}>
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-center text-lg ">Delete</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setExpandedSection(null)} activeOpacity={0.8} className="border border-slate-200 py-3 px-5 rounded-lg">
            <Text className="text-slate-700  text-center text-lg font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ---------------------------------------------------------------------
  // Render Main Component
  // ---------------------------------------------------------------------

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-3 flex-row items-center border-b border-slate-200 mb-4">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="chevron-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-800">Settings</Text>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View className="px-4 pb-2">
          <Text className="text-2xl font-bold text-gray-800">Manage Leaves</Text>
          <Text className="text-gray-500 mb-4">Review and manage leave requests from your team</Text>
          {/* Filter row */}
          <View className="flex-row mb-4">
            <FilterOption label="All" isActive={activeFilter === "all"} onPress={() => setActiveFilter("all")} />
            <FilterOption label="Pending" isActive={activeFilter === "pending"} onPress={() => setActiveFilter("pending")} />
            <FilterOption label="Approved" isActive={activeFilter === "approved"} onPress={() => setActiveFilter("approved")} />
            <FilterOption label="Rejected" isActive={activeFilter === "rejected"} onPress={() => setActiveFilter("rejected")} />
          </View>
        </View>

        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#cbd5e1" />
          </View>
        ) : (
          <FlatList
            data={filteredLeaves}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: 20 }, filteredLeaves.length === 0 && { flex: 1 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#cbd5e1"]} tintColor="#cbd5e1" />}
            ListEmptyComponent={<EmptyListComponent activeFilter={activeFilter} />}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Sort Modal (unchanged) */}
        {sortModalVisible && (
          <View style={StyleSheet.absoluteFill}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.5)", opacity: modalBgAnim }]}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSortModal} />
            </Animated.View>
            <Animated.View
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
              style={{ transform: [{ translateY: sortModalAnim }], paddingBottom: Platform.OS === "ios" ? 30 : 20 }}
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
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)", opacity: modalBgAnim }]} onTouchEnd={closeActionsModal} />
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
            <View className="items-center py-3" {...actionsPanResponder.panHandlers}>
              <View className="w-10 h-1 bg-slate-200 rounded-lg" />
            </View>
            <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100 mb-4">
              <Text className="text-lg font-bold text-slate-700">Leave Actions</Text>
              <TouchableOpacity onPress={closeActionsModal}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              {expandedSection === null && (
                <>
                  {/* Only show Approve & Reject if leave is pending */}
                  {actionsLeave.status === "pending" && (
                    <>
                      <TouchableOpacity
                        onPress={() => setExpandedSection("approve")}
                        className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                      >
                        <View className="flex-row items-center">
                          <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                            <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          </View>
                          <Text className="text-slate-700 font-medium">Approve Leave</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color="#64748b" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setExpandedSection("reject")}
                        className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                      >
                        <View className="flex-row items-center">
                          <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                            <Ionicons name="close-circle" size={18} color="#fff" />
                          </View>
                          <Text className="text-slate-700 font-medium">Reject Leave</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color="#64748b" />
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity
                    onPress={() => setExpandedSection("delete")}
                    className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                  >
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                        <Ionicons name="trash-bin" size={18} color="#fff" />
                      </View>
                      <Text className="text-slate-700 font-medium">Delete Leave</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#64748b" />
                  </TouchableOpacity>
                </>
              )}
              {expandedSection === "approve" && renderApproveSection()}
              {expandedSection === "reject" && renderRejectSection()}
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
