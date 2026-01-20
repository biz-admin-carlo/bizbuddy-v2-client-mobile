// app/(tabs)/(shifts)/timekeeping-timeCard.jsx

"use client";

import React from "react";

import { useEffect, useState, useRef } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Modal,
} from "react-native";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../../../config/constant";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height } = Dimensions.get("window");

const TimekeepingTimeCard = () => {
  const router = useRouter();
  const [timeLogs, setTimeLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState("actions"); // "actions", "delete", "details"
  const [selectedLog, setSelectedLog] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const modalYAnim = useRef(new Animated.Value(height)).current;
  const deleteButtonScale = useRef(new Animated.Value(1)).current;
  const cancelButtonScale = useRef(new Animated.Value(1)).current;
  const cardScales = useRef({}).current;

  const insets = useSafeAreaInsets();

  // Function to calculate total hours worked
  const calculateTotalHours = (log) => {
    if (!log.timeIn) return 0;

    const timeIn = new Date(log.timeIn);
    const timeOut = log.timeOut ? new Date(log.timeOut) : new Date(); // Use current time if still clocked in

    // Calculate total time in milliseconds
    let totalTime = timeOut.getTime() - timeIn.getTime();

    // Subtract lunch break time if exists
    if (log.lunchBreak?.start && log.lunchBreak?.end) {
      const lunchStart = new Date(log.lunchBreak.start);
      const lunchEnd = new Date(log.lunchBreak.end);
      const lunchDuration = lunchEnd.getTime() - lunchStart.getTime();
      totalTime -= lunchDuration;
    }

    // Subtract coffee break times if they exist
    if (log.coffeeBreaks && Array.isArray(log.coffeeBreaks)) {
      log.coffeeBreaks.forEach((breakItem) => {
        if (breakItem.start && breakItem.end) {
          const breakStart = new Date(breakItem.start);
          const breakEnd = new Date(breakItem.end);
          const breakDuration = breakEnd.getTime() - breakStart.getTime();
          totalTime -= breakDuration;
        }
      });
    }

    // Convert to hours
    const totalHours = totalTime / (1000 * 60 * 60);
    return Math.max(0, totalHours); // Ensure non-negative
  };

  // Function to format hours display
  const formatHours = (hours) => {
    if (hours < 0) return "0h 0m";
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    return `${wholeHours}h ${minutes}m`;
  };

  // Animate button press
  const animateButtonPress = (scaleRef) => {
    Animated.sequence([
      Animated.timing(scaleRef, {
        toValue: 0.95,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scaleRef, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // PanResponder for modal swipe gestures
  const modalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          modalYAnim.setValue(gestureState.dy);
        } else if (gestureState.dy < 0) {
          const newPosition = Math.max(gestureState.dy, -300);
          modalYAnim.setValue(newPosition);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeModal();
        } else if (gestureState.dy < -50) {
          Animated.spring(modalYAnim, {
            toValue: -300,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(modalYAnim, {
            toValue: 0,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const fetchTimeLogs = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const url = `${API_BASE_URL}/api/timelogs/user`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data.data) {
        const sortedLogs = res.data.data.sort(
          (a, b) => new Date(b.timeIn) - new Date(a.timeIn)
        );
        setTimeLogs(sortedLogs);
      } else {
        Alert.alert("Error", "Failed to fetch time logs.");
      }
    } catch (error) {
      console.error("Fetch time logs error:", error.message);
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to fetch time logs."
      );
    } finally {
      setLoading(false);
    }
  };

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
    fetchTimeLogs();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTimeLogs();
    setRefreshing(false);
  };

  const openModal = (log) => {
    setSelectedLog(log);
    setModalMode("actions");
    setModalVisible(true);
    modalYAnim.setValue(height);
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(modalYAnim, {
        toValue: 0,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(modalYAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      setSelectedLog(null);
      setModalMode("actions");
    });
  };

  const handleDeleteTimeLog = async () => {
    if (!selectedLog || !selectedLog.id) {
      Alert.alert("Error", "No time log selected for deletion.");
      return;
    }

    try {
      setDeleting(true);
      const token = await SecureStore.getItemAsync("token");
      const url = `${API_BASE_URL}/api/timelogs/delete/${selectedLog.id}`;
      const res = await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200) {
        Alert.alert("Success", res.data.message);
        setTimeLogs((prev) => prev.filter((log) => log.id !== selectedLog.id));
        closeModal();
      } else {
        Alert.alert("Error", "Failed to delete time log.");
      }
    } catch (error) {
      console.error("Delete error:", error.message);
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to delete time log."
      );
    } finally {
      setDeleting(false);
    }
  };

  const renderLogCard = ({ item, index }) => {
    if (!cardScales[index]) {
      cardScales[index] = new Animated.Value(1);
    }

    return (
      <Animated.View style={{ transform: [{ scale: cardScales[index] }] }}>
        <TouchableOpacity
          onPress={() => {
            animateButtonPress(cardScales[index]);
            setTimeout(() => openModal(item), 100);
          }}
          className="mb-3 p-4 bg-slate-50 rounded-xl "
          activeOpacity={0.8}
        >
          <View className="flex-row justify-between items-center">
            <View className="flex-1">
              <View className="p-1">
                <Text className="font-semibold text-slate-700 text-sm mb-2">
                  {new Date(item.timeIn).toLocaleDateString()}
                </Text>
                <View className="flex-row items-center">
                  <Text className="text-xs font-medium text-slate-600">
                    Time In:
                  </Text>
                  <Text className="ml-2 text-xs text-slate-700">
                    {new Date(item.timeIn).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <View className="flex-row items-center mt-1">
                  <Text className="text-xs font-medium text-slate-600">
                    Time Out:
                  </Text>
                  <Text className="ml-2 text-xs text-slate-700">
                    {item.timeOut
                      ? new Date(item.timeOut).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Still Clocked In"}
                  </Text>
                </View>
                <View className="flex-row items-center mt-1">
                  <Text className="text-xs font-medium text-slate-600">
                    Total Hours:
                  </Text>
                  <Text className="ml-2 text-xs font-semibold text-orange-600">
                    {formatHours(calculateTotalHours(item))}
                  </Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const latestLog = timeLogs.length > 0 ? timeLogs[0] : null;

  const renderModalContent = () => {
    if (!selectedLog) return null;

    if (modalMode === "actions") {
      return (
        <View className="p-5">
          <Text className="text-lg font-bold text-slate-700 mb-4 text-center">
            Time Log Actions
          </Text>
          <Text className="text-sm text-slate-500 mb-6 text-center">
            ID: {selectedLog.id}
          </Text>

          <TouchableOpacity
            onPress={() => setModalMode("details")}
            className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                <Feather name="info" size={18} color="#ffffff" />
              </View>
              <Text className="text-slate-700 font-medium">View Details</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setModalMode("delete")}
            className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                <Feather name="trash-2" size={18} color="#ffffff" />
              </View>
              <Text className="text-slate-700 font-medium">
                Delete Time Log
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={closeModal}
            className="border border-slate-200 py-3.5 rounded-lg w-full items-center mt-4"
          >
            <Text className="text-slate-600 font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      );
    } else if (modalMode === "delete") {
      return (
        <View className="p-5">
          <Text className="text-lg font-bold text-slate-700 mb-2 text-center">
            Delete Time Log
          </Text>
          <Text className="text-slate-600 text-center mb-6">
            Are you sure you want to delete this time log?
          </Text>

          {deleting ? (
            <View className="items-center py-4">
              <ActivityIndicator size="large" color="#f97316" />
              <Text className="text-slate-600 mt-3">Deleting time log...</Text>
            </View>
          ) : (
            <>
              <Animated.View
                style={{ transform: [{ scale: deleteButtonScale }] }}
              >
                <TouchableOpacity
                  onPress={() => {
                    animateButtonPress(deleteButtonScale);
                    setTimeout(() => handleDeleteTimeLog(), 100);
                  }}
                  className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3"
                >
                  <Text className="text-white font-bold text-base">
                    Yes, Delete
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              <Animated.View
                style={{ transform: [{ scale: cancelButtonScale }] }}
              >
                <TouchableOpacity
                  onPress={() => {
                    animateButtonPress(cancelButtonScale);
                    setTimeout(() => setModalMode("actions"), 100);
                  }}
                  className="border border-slate-200 py-3.5 rounded-lg w-full items-center"
                >
                  <Text className="text-slate-600 font-bold text-base">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}
        </View>
      );
    } else if (modalMode === "details") {
      return (
        <View className="p-5">
          <Text className="text-lg font-bold text-slate-700 mb-4 text-center">
            Time Log Details
          </Text>

          <View className="bg-slate-50 rounded-lg p-4 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Log ID:
              </Text>
              <Text className="text-sm text-slate-700">{selectedLog.id}</Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">Date:</Text>
              <Text className="text-sm text-slate-700">
                {new Date(selectedLog.timeIn).toLocaleDateString()}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Time In:
              </Text>
              <Text className="text-sm text-slate-700">
                {new Date(selectedLog.timeIn).toLocaleString()}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Time Out:
              </Text>
              <Text className="text-sm text-slate-700">
                {selectedLog.timeOut
                  ? new Date(selectedLog.timeOut).toLocaleString()
                  : "Still Clocked In"}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Lunch Break start:
              </Text>
              <Text className="text-sm text-slate-700">
                {selectedLog.lunchBreak?.end
                  ? new Date(selectedLog.lunchBreak.start).toLocaleString()
                  : ""}
              </Text>
            </View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Lunch Break end:
              </Text>
              <Text className="text-sm text-slate-700">
                {selectedLog.lunchBreak?.end
                  ? new Date(selectedLog.lunchBreak.end).toLocaleString()
                  : ""}
              </Text>
            </View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Coffee Break start 1x:
              </Text>
              <Text className="text-sm text-slate-700">
                {selectedLog.coffeeBreaks[0]?.start
                  ? new Date(selectedLog.coffeeBreaks[0].start).toLocaleString()
                  : ""}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Coffee Break end 1x:
              </Text>
              <Text className="text-sm text-slate-700">
                {selectedLog.coffeeBreaks[0]?.end
                  ? new Date(selectedLog.coffeeBreaks[0].end).toLocaleString()
                  : ""}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Coffee Break start 2x:
              </Text>
              <Text className="text-sm text-slate-700">
                {selectedLog.coffeeBreaks[1]?.start
                  ? new Date(selectedLog.coffeeBreaks[1].start).toLocaleString()
                  : ""}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Coffee Break end 2x:
              </Text>
              <Text className="text-sm text-slate-700">
                {selectedLog.coffeeBreaks[1]?.end
                  ? new Date(selectedLog.coffeeBreaks[1].end).toLocaleString()
                  : ""}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Device start
              </Text>
              <Text className="text-sm text-slate-700">
                {JSON.stringify(selectedLog.deviceInfo?.start?.modelName)}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-slate-500">
                Device end
              </Text>
              <Text className="text-sm text-slate-700">
                {JSON.stringify(selectedLog.deviceInfo?.start?.modelName)}
              </Text>
            </View>
          </View>

          {/* Total Hours Worked Section */}
          <View className="bg-orange-50 rounded-lg p-4 mb-4">
            <View className="flex-row items-center justify-center mb-2">
              <Ionicons name="time-outline" size={20} color="#f97316" />
              <Text className="text-lg font-bold text-slate-700 ml-2">
                Total Hours Worked
              </Text>
            </View>
            <Text className="text-2xl font-bold text-orange-600 text-center">
              {formatHours(calculateTotalHours(selectedLog))}
            </Text>
            <Text className="text-xs text-slate-500 text-center mt-1">
              {selectedLog.timeOut ? "Completed shift" : "Currently working"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setModalMode("actions")}
            className="border border-slate-200 py-3.5 rounded-lg w-full items-center"
          >
            <Text className="text-slate-600 font-bold text-base">Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

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
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#cbd5e1" />
            <Text className="mt-4 text-slate-500">Loading time logs...</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-4 pb-6"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#cbd5e1"
              />
            }
          >
            {latestLog ? (
              <View className="mb-6">
                <Text className="text-xl font-bold text-slate-700 mb-3">
                  Latest Punch
                </Text>
                <View className="bg-orange-50 p-5 rounded-xl ">
                  <View className="flex-row items-center mb-3">
                    <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                      <Ionicons name="time-outline" size={20} color="#f97316" />
                    </View>
                    <View>
                      <Text className="text-lg font-semibold text-slate-700">
                        {new Date(latestLog.timeIn).toLocaleDateString()}
                      </Text>
                      <Text className="text-sm text-slate-500">
                        {latestLog.timeOut ? "Completed" : "In Progress"}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between bg-white p-3 rounded-lg mb-2">
                    <Text className="text-sm font-medium text-slate-600">
                      Time In:
                    </Text>
                    <Text className="text-sm text-slate-700">
                      {new Date(latestLog.timeIn).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </Text>
                  </View>

                  <View className="flex-row justify-between bg-white p-3 rounded-lg mb-2">
                    <Text className="text-sm font-medium text-slate-600">
                      Time Out:
                    </Text>
                    <Text className="text-sm text-slate-700">
                      {latestLog.timeOut
                        ? new Date(latestLog.timeOut).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : "Still Clocked In"}
                    </Text>
                  </View>

                  <View className="flex-row justify-between bg-orange-100 p-3 rounded-lg">
                    <Text className="text-sm font-semibold text-slate-700">
                      Total Hours:
                    </Text>
                    <Text className="text-sm font-bold text-orange-600">
                      {formatHours(calculateTotalHours(latestLog))}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View className="items-center justify-center py-10 bg-slate-50 rounded-xl mb-6">
                <Ionicons name="time-outline" size={48} color="#94a3b8" />
                <Text className="mt-4 text-slate-500 text-center">
                  No time logs available.
                </Text>
                <Text className="text-slate-400 text-center mt-1">
                  Your punch records will appear here.
                </Text>
              </View>
            )}

            {timeLogs.length > 0 && (
              <View>
                <Text className="text-xl font-bold text-slate-700 mb-3">
                  All Time Logs
                </Text>
                {timeLogs.map((item, index) => (
                  <React.Fragment key={item.id || index}>
                    {renderLogCard({ item, index })}
                  </React.Fragment>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </Animated.View>

      {modalVisible && (
        <Modal
          transparent={true}
          animationType="none"
          visible={modalVisible}
          onRequestClose={closeModal}
        >
          <View style={{ flex: 1 }}>
            {/* Backdrop */}
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                opacity: modalBgAnim,
              }}
              onTouchEnd={closeModal}
            />

            {/* Modal Content */}
            <Animated.View
              style={{
                transform: [{ translateY: modalYAnim }],
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: "white",
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                minHeight: height * 0.65,
                maxHeight: height * 0.8,
                paddingBottom: Platform.OS === "ios" ? 0 : 20,
              }}
            >
              {/* Drag Handle */}
              <View
                className="items-center py-3"
                {...modalPanResponder.panHandlers}
              >
                <View className="w-10 h-1 bg-slate-200 rounded-lg" />
              </View>

              {renderModalContent()}
            </Animated.View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

export default TimekeepingTimeCard;
