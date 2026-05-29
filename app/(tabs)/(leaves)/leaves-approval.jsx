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
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../../config/constant";
import {
  formatLeaveBoundaryLabel,
  formatLeaveDateTimeLabel,
  normalizeLeaveRecord,
} from "../../../utils/dateOnlyUtils";
import { Ionicons } from "@expo/vector-icons";

const { height } = Dimensions.get("window");

/**
 * A small sub-component to display a status badge with an icon.
 */
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
      bgColor = "bg-slate-100";
      textColor = "text-slate-800";
      icon = "help-circle";
  }

  return (
    <View className={`flex-row items-center rounded-full px-3 py-1 ${bgColor}`}>
      <Ionicons name={icon} size={14} color={textColor.replace("text-", "")} style={{ marginRight: 4 }} />
      <Text className={`text-xs font-medium ${textColor}`}>{status}</Text>
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
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8} className={`px-4 py-2 rounded-full mr-2 ${isActive ? "bg-orange-500" : "bg-slate-100"}`}>
        <Text className={`text-sm font-medium ${isActive ? "text-white" : "text-slate-700"}`}>{label}</Text>
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
  <View className="flex-row items-start mb-4">
    <View className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center mr-3">
      <Ionicons name={icon} size={18} color="#64748b" />
    </View>
    <View className="flex-1">
      <Text className="text-xs font-medium text-slate-500 mb-0.5">{label}</Text>
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

const EmptyListComponent = ({ activeFilter }) => (
  <View className="flex-1 justify-center items-center py-10">
    <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center mb-4">
      <Ionicons name="calendar-outline" size={28} color="#9CA3AF" />
    </View>
    <Text className="text-slate-500 text-lg font-medium mb-1">No leave records</Text>
    <Text className="text-slate-400 text-center px-10">
      {activeFilter === "all"
        ? "You don't have any leave records yet. Submit a leave request to get started."
        : `No ${activeFilter} leave requests found.`}
    </Text>
  </View>
);

/**
 * Main LeavesApproval screen component.
 */
export default function LeavesApproval() {
  const [leaves, setLeaves] = useState([]);
  const [filteredLeaves, setFilteredLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortOption, setSortOption] = useState("newest");
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
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
      const res = await fetch(`${API_BASE_URL}/api/leaves/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const rows = Array.isArray(data.data)
          ? data.data.map(normalizeLeaveRecord)
          : [];
        setLeaves(rows);
        applyFiltersAndSort(rows, activeFilter, sortOption);
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

  /**
   * Renders each leave entry.
   * Show separate rows for Start, End, Reason, and CreatedAt.
   */
  const renderItem = ({ item }) => {
    const itemScaleAnim = new Animated.Value(1);

    const animateItemPress = () => {
      Animated.sequence([
        Animated.timing(itemScaleAnim, {
          toValue: 0.97,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.spring(itemScaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    };

    return (
      <Animated.View style={{ transform: [{ scale: itemScaleAnim }] }}>
        <TouchableOpacity
          onPress={() => {
            animateItemPress();
            openLeaveDetail(item);
          }}
          activeOpacity={0.9}
          className="mb-4 rounded-xl overflow-hidden bg-white"
        >
          <View className="p-2 bg-slate-50 rounded-lg">
            {/* Row: Leave Type + Status Badge */}
            <View className="flex-row justify-between items-center pb-4 border-b border-slate-200">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                  <Ionicons name={getLeaveTypeIcon(item.leaveType)} size={20} color="#f97316" />
                </View>
                <Text className="text-lg font-semibold text-slate-800">{item.leaveType}</Text>
              </View>
              <LeaveStatusBadge status={item.status} />
            </View>

            {/* Row(s): Start, End, Reason, CreatedAt */}
            <View className="bg-slate-50 rounded-lg p-3 border-b border-slate-200">
              {/* CreatedAt */}
              <View className="flex-row items-center mb-1">
                <Ionicons name="time-outline" size={16} color="#6B7280" />
                <Text className="text-slate-600 text-sm ml-2">Submitted: {formatLeaveDateTimeLabel(item.createdAt)}</Text>
              </View>
              {/* Start Date/Time */}
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text className="text-slate-600 text-sm ml-2 ">Start: {formatLeaveBoundaryLabel(item, "start")}</Text>
              </View>
              {/* End Date/Time */}
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text className="text-slate-600 text-sm ml-2">End: {formatLeaveBoundaryLabel(item, "end")}</Text>
              </View>
              {/* Reason */}
              <View className="flex-row items-center">
                <Ionicons name="pencil-outline" size={16} color="#6B7280" />
                <Text className="text-slate-600 text-sm ml-2">Reason: {item.leaveReason ? item.leaveReason : "No reason"}</Text>
              </View>
            </View>

            {/* Approver (if any) */}
            {item.approver && item.approver.email && (
              <View className="bg-slate-50 rounded-lg p-3">
                <View className="flex-row items-center mb-1">
                  <Ionicons name="person-outline" size={16} color="#6B7280" />
                  <Text className="text-slate-600 text-sm ml-1">Approver: {item.approver.email}</Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="pencil-outline" size={16} color="#6B7280" />
                  <Text className="text-slate-600 text-sm ml-1">Comments: {item.approverComments}</Text>
                </View>
              </View>
            )}
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
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-2xl font-bold text-slate-800">Leave History</Text>
            <Animated.View style={{ transform: [{ scale: sortButtonScale }] }}>
              <TouchableOpacity
                onPress={() => {
                  animateButtonPress(sortButtonScale);
                  setTimeout(openSortModal, 100);
                }}
                activeOpacity={0.8}
                className="w-10 h-10 rounded-full bg-white border border-slate-200 items-center justify-center"
                style={styles.buttonShadow}
              >
                <Ionicons name="options-outline" size={20} color="#4B5563" />
              </TouchableOpacity>
            </Animated.View>
          </View>

          <Text className="text-slate-500 mb-4">View all your leave requests and their status</Text>

          {/* Filter pills */}
          <View className="flex-row mb-4">
            <FilterOption label="All" isActive={activeFilter === "all"} onPress={() => setActiveFilter("all")} />
            <FilterOption label="Pending" isActive={activeFilter === "pending"} onPress={() => setActiveFilter("pending")} />
            <FilterOption label="Approved" isActive={activeFilter === "approved"} onPress={() => setActiveFilter("approved")} />
            <FilterOption label="Rejected" isActive={activeFilter === "rejected"} onPress={() => setActiveFilter("rejected")} />
          </View>
        </View>

        {/* Main content: list or loading */}
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#cbd5e1"]} tintColor={["#cbd5e1"]} />}
            ListEmptyComponent={<EmptyListComponent activeFilter={activeFilter} />}
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

                <View className="px-5 py-3 border-b border-slate-100">
                  <LeaveStatusBadge status={selectedLeave.status || "pending"} />
                </View>

                <ScrollView
                  className="px-5 pt-4"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
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
                  {resolvePaidLabel(selectedLeave) ? (
                    <DetailRow
                      icon="card-outline"
                      label="Pay type"
                      value={resolvePaidLabel(selectedLeave)}
                    />
                  ) : null}
                  <DetailRow
                    icon="document-text-outline"
                    label="Reason"
                    value={
                      selectedLeave.leaveReason?.trim()
                        ? selectedLeave.leaveReason
                        : "No reason provided"
                    }
                  />
                  {selectedLeave.approver?.email ? (
                    <DetailRow
                      icon="person-outline"
                      label="Approver"
                      value={selectedLeave.approver.email}
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
