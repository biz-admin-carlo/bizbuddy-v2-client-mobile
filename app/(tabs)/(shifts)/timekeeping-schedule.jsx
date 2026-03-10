// app/(tabs)/(shifts)/timekeeping-schedule.jsx

"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  Animated,
  Dimensions,
  RefreshControl,
  Linking,
  TouchableOpacity,
  Pressable,
  PanResponder,
  Modal,
  Platform,
} from "react-native";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
// Notification functionality removed - can be re-implemented later
import {
  API_BASE_URL,
  DEFAULT_SHIFT_DISPLAY_TIMEZONE,
} from "../../../config/constant";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const { height } = Dimensions.get("window");

const COLORS = {
  primary: "#f97316",
  primaryLight: "#ffedd5",
  primaryDark: "#c2410c",
  text: "#1e293b",
  textSecondary: "#64748b",
  textLight: "#94a3b8",
  border: "#e2e8f0",
  white: "#ffffff",
  background: "#ffffff",
  error: "#ef4444",
  success: "#10b981",
  card: "#f1f5f9",
};

// Simple notification permission check (placeholder for future implementation)
const registerForPushNotificationsAsync = async () => {
  // For now, just return false - notifications can be implemented later
  console.log("Notification functionality temporarily disabled");
  return false;
};

// --- Added helper to get local date string in YYYY-MM-DD format ---
const getLocalDateString = (dateInput) => {
  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Parse naive time from API (no timezone in DB). Returns { hour, minute } or null.
// Handles "08:00:00", "08:00", "2026-03-06T08:00:00", "2026-03-06T08:00:00.000Z" etc.
const parseNaiveTime = (value) => {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const timeMatch =
    s.match(/T?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z)?$/i) ||
    s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) return null;
  const hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};

// Format naive startTime/endTime (no timezone in DB) as display time.
// The stored time is the clock time in the shift's timeZone; we parse and display it (e.g. 8:00 AM - 5:00 PM).
const formatNaiveTimeInZone = (naiveTimeStr) => {
  const t = parseNaiveTime(naiveTimeStr);
  if (!t) return "";
  const h = t.hour % 12 || 12;
  const m = String(t.minute).padStart(2, "0");
  const ampm = t.hour >= 12 ? "PM" : "AM";
  return `${h}:${m} ${ampm}`;
};

// Format date in the shift's timezone for "Assigned on" display
const formatDateInZone = (isoString, timeZone) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return "";
  const tz = timeZone || DEFAULT_SHIFT_DISPLAY_TIMEZONE;
  return date.toLocaleDateString("en-US", { timeZone: tz });
};

const TimekeepingSchedule = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Use the helper for the default selectedDate
  const [selectedDate, setSelectedDate] = useState(
    getLocalDateString(new Date()),
  );
  const [userShifts, setUserShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markedDates, setMarkedDates] = useState({});
  const [selectedShifts, setSelectedShifts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  // State to hold the current notification permission status.
  const [notificationAllowed, setNotificationAllowed] = useState(false);
  // State for showing the info modal.
  const [modalVisible, setModalVisible] = useState(false);

  // Calculate tab bar height (60px) plus safe area top.
  const topPadding = 60;

  // Animations.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Modal animations and pan responder (same as in timekeeping-punch)
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const modalYAnim = useRef(new Animated.Value(height)).current;

  const modalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          modalYAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeModal();
        } else {
          Animated.spring(modalYAnim, {
            toValue: 0,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const openModal = () => {
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
    });
  };

  // Render modal content for notifications (similar to location modal)
  const renderModalContent = () => {
    return (
      <View className="p-5">
        <Text className="text-xl font-bold text-slate-800 mb-4 text-center">
          Notification Permissions
        </Text>

        <View className="bg-slate-50 rounded-xl p-4 mb-6">
          <View className="flex-row items-center mb-4">
            <View
              className={`w-10 h-10 rounded-full ${
                notificationAllowed ? "bg-orange-100" : "bg-slate-100"
              } items-center justify-center mr-3`}
            >
              <Ionicons name="notifications" size={20} color="#f97316" />
            </View>
            <Text className="text-lg font-semibold text-slate-700">
              {notificationAllowed ? "Enabled" : "Disabled"}
            </Text>
          </View>

          <Text className="text-base text-slate-700 mb-3">
            This app uses notifications to remind you about your shifts and
            other important updates.
          </Text>

          <View className="mb-2">
            <Text className="text-sm font-medium text-slate-700 mb-1">
              • Shift Reminders
            </Text>
            <Text className="text-sm text-slate-600">
              Receive a notification 30 minutes before your shift starts and
              ends.
            </Text>
          </View>

          <View>
            <Text className="text-sm font-medium text-slate-700 mb-1">
              • Timely Updates
            </Text>
            <Text className="text-sm text-slate-600">
              Stay informed about any schedule changes or important
              announcements.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeModal}
          className="bg-orange-400 py-3.5 rounded-lg items-center justify-center"
          activeOpacity={0.8}
        >
          <Text className="text-white font-bold text-base">Got It</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Request notification permissions on mount.
  useEffect(() => {
    registerForPushNotificationsAsync().then((granted) =>
      setNotificationAllowed(granted),
    );
  }, []);

  // Foreground message handling removed - can be re-implemented later

  // Function to schedule notifications for shifts (placeholder for future implementation)
  const scheduleNotificationsForShifts = async (shifts) => {
    // Notification scheduling removed - can be re-implemented later
    console.log("Notification scheduling temporarily disabled");
  };

  // Fetch user shifts.
  const fetchUserShifts = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${API_BASE_URL}/api/usershifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data.data) {
        setUserShifts(res.data.data);
        createMarkedDates(res.data.data);
        const todayShifts = res.data.data.filter((shift) => {
          // Use local date string for filtering
          const shiftDate = getLocalDateString(shift.assignedDate);
          return shiftDate === selectedDate;
        });
        setSelectedShifts(todayShifts);
        scheduleNotificationsForShifts(res.data.data);
        // Notification status check removed - can be re-implemented later
        setNotificationAllowed(false);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to load your shift assignments.");
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

    fetchUserShifts();
  }, []);

  const createMarkedDates = (shifts) => {
    if (!shifts || shifts.length === 0) return;

    const marked = {};

    shifts.forEach((userShift) => {
      // Use local date string for marking the calendar
      const shiftDate = getLocalDateString(userShift.assignedDate);

      marked[shiftDate] = {
        ...marked[shiftDate],
        marked: true,
        dotColor: COLORS.primary,
        selected: shiftDate === selectedDate,
        selectedColor: `${COLORS.primary}20`,
        customStyles: {
          container: {
            backgroundColor:
              shiftDate === selectedDate
                ? `${COLORS.primary}20`
                : "transparent",
          },
          text: {
            color: "#334155",
            fontWeight: "bold",
          },
          dots: {
            backgroundColor: COLORS.primary,
          },
        },
      };
    });

    if (!marked[selectedDate]) {
      marked[selectedDate] = {
        selected: true,
        selectedColor: `${COLORS.primary}20`,
      };
    }

    setMarkedDates(marked);
  };

  const handleDateSelect = (day) => {
    const selected = day.dateString;
    setSelectedDate(selected);

    const shiftsForDate = userShifts.filter((userShift) => {
      // Compare using local date string
      const shiftDate = getLocalDateString(userShift.assignedDate);
      return shiftDate === selected;
    });

    setSelectedShifts(shiftsForDate);
    updateSelectedDateInMarkedDates(selected);
  };

  const updateSelectedDateInMarkedDates = (selected) => {
    const updatedMarkedDates = { ...markedDates };

    Object.keys(updatedMarkedDates).forEach((date) => {
      if (updatedMarkedDates[date]) {
        if (updatedMarkedDates[date].customStyles) {
          updatedMarkedDates[date].customStyles.container.backgroundColor =
            "transparent";
          updatedMarkedDates[date].selected = false;
        } else {
          updatedMarkedDates[date].selected = false;
        }
      }
    });

    if (updatedMarkedDates[selected]) {
      updatedMarkedDates[selected] = {
        ...updatedMarkedDates[selected],
        selected: true,
        selectedColor: `${COLORS.primary}20`,
      };

      if (updatedMarkedDates[selected].customStyles) {
        updatedMarkedDates[selected].customStyles.container.backgroundColor =
          `${COLORS.primary}20`;
      }
    } else {
      updatedMarkedDates[selected] = {
        selected: true,
        selectedColor: `${COLORS.primary}20`,
      };
    }

    setMarkedDates(updatedMarkedDates);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUserShifts();
    setRefreshing(false);
  };

  // Render each shift item. Times and assigned date use the shift's timeZone when present (API may use timeZone or time_zone); otherwise use default so UTC times display correctly.
  const renderShiftItem = (shift) => {
    const timeZone =
      shift?.shift?.timeZone ||
      shift?.shift?.time_zone ||
      shift?.timeZone ||
      shift?.time_zone ||
      DEFAULT_SHIFT_DISPLAY_TIMEZONE;
    return (
      <View
        key={shift.id}
        className="mb-3 p-4 bg-slate-50 rounded-xl border border-slate-50"
      >
        <View className="flex-row justify-between items-start">
          <View style={{ flex: 1 }}>
            <Text className="text-lg font-bold text-slate-800">
              {shift.shift.shiftName}
            </Text>
            <View className="flex-row items-center mt-1">
              <Ionicons
                name="time-outline"
                size={14}
                color={COLORS.textSecondary}
              />
              <Text className="ml-1 text-slate-600 text-sm">
                {formatNaiveTimeInZone(shift.shift.startTime)} -{" "}
                {formatNaiveTimeInZone(shift.shift.endTime)}
              </Text>
            </View>
            {shift.assignedDate && (
              <Text className="text-xs text-slate-500 mt-1">
                Assigned on: {formatDateInZone(shift.assignedDate, timeZone)}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
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
        className="flex-1 bg-white"
      >
        {/* Title Row with Date and Notification Icon */}
        <View className="px-4 py-2 flex-row items-center justify-between">
          <Text className="text-xl font-bold text-slate-700">
            {selectedDate === new Date().toISOString().split("T")[0]
              ? "Today's Shifts"
              : `Shift(s) for ${new Date(selectedDate).toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                  },
                )}`}
          </Text>
          <TouchableOpacity onPress={openModal}>
            <Ionicons
              name={notificationAllowed ? "notifications" : "notifications-off"}
              size={22}
              color={notificationAllowed ? "#fb923c" : "#64748b"}
            />
          </TouchableOpacity>
        </View>

        {/* Shifts List */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={"#cbd5e1"} />
            <Text className="mt-4 text-slate-500">Loading your shifts...</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={"#cbd5e1"}
              />
            }
          >
            <View className="p-4">
              {/* Calendar */}
              <View>
                <Calendar
                  markingType="custom"
                  markedDates={markedDates}
                  onDayPress={handleDateSelect}
                  enableSwipeMonths={true}
                  style={{
                    borderRadius: 16,
                    overflow: "hidden",
                    backgroundColor: "#f8fafc",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 3,
                    elevation: 2,
                    marginBottom: 8,
                  }}
                  theme={{
                    calendarBackground: "#f8fafc",
                    textSectionTitleColor: COLORS.textSecondary,
                    selectedDayBackgroundColor: COLORS.primary,
                    selectedDayTextColor: "#000000",
                    todayTextColor: COLORS.primary,
                    dayTextColor: COLORS.text,
                    textDisabledColor: COLORS.textLight,
                    dotColor: COLORS.primary,
                    selectedDotColor: "#ffffff",
                    arrowColor: "#94a3b8",
                    monthTextColor: COLORS.text,
                    indicatorColor: COLORS.primary,
                    textDayFontWeight: "500",
                    textMonthFontWeight: "600",
                    textDayHeaderFontWeight: "500",
                  }}
                />
              </View>

              {/* Shifts List */}
              <View className="mt-8">
                {selectedShifts.length > 0 ? (
                  <View>
                    {selectedShifts.map((shift, index) => (
                      <React.Fragment key={`shift-${shift.id}-${index}`}>
                        {renderShiftItem(shift)}
                      </React.Fragment>
                    ))}
                  </View>
                ) : (
                  <View className="bg-slate-50 rounded-xl p-6 items-center">
                    <Ionicons
                      name="calendar-outline"
                      size={36}
                      color={COLORS.textLight}
                    />
                    <Text className="text-slate-500 mt-3 text-center font-medium">
                      No shifts scheduled for this date
                    </Text>
                    <Text className="text-slate-400 text-sm text-center mt-1">
                      Tap on a date with an orange border to view shifts
                    </Text>
                  </View>
                )}
              </View>
            </View>
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
                style={{ alignItems: "center", paddingVertical: 12 }}
                {...modalPanResponder.panHandlers}
              >
                <View
                  style={{
                    width: 40,
                    height: 4,
                    backgroundColor: "#e2e8f0",
                    borderRadius: 2,
                  }}
                />
              </View>

              {renderModalContent()}
            </Animated.View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

export default TimekeepingSchedule;
