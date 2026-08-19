// app/(tabs)/(overtime)/index.jsx

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  ActivityIndicator,
  Alert as RNAlert,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  TextInput,
  ScrollView,
  TouchableWithoutFeedback,
  RefreshControl,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import DropDownPicker from "react-native-dropdown-picker";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../../config/constant";
import { parseApproversPayload } from "../../../utils/approversPayload";

const { height } = Dimensions.get("window");

const combineDateAndTime = (date, time) => {
  const combined = new Date(date);
  combined.setHours(time.getHours());
  combined.setMinutes(time.getMinutes());
  combined.setSeconds(time.getSeconds());
  combined.setMilliseconds(time.getMilliseconds());
  return combined;
};

const getLocalDateString = (dateInput) => {
  const d = new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toLocalTimeString = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const SubmitOvertime = () => {
  const router = useRouter();

  const [overtimeReason, setOvertimeReason] = useState("");
  const [otDate, setOtDate] = useState(new Date()); // start date
  const [otStartTime, setOtStartTime] = useState(new Date());
  const [otEndDate, setOtEndDate] = useState(new Date());
  const [otEndTime, setOtEndTime] = useState(new Date());
  const [otLogOpen, setOtLogOpen] = useState(false);
  const [otLogItems, setOtLogItems] = useState([]);
  const [otLogValue, setOtLogValue] = useState("");
  const [otLogMap, setOtLogMap] = useState({});
  const [approverOpen, setApproverOpen] = useState(false);
  const [approverItems, setApproverItems] = useState([]);
  const [approverValue, setApproverValue] = useState("");

  // Overtime requests list state
  const [overtimeRequests, setOvertimeRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPicker, setCurrentPicker] = useState(null);
  const [tempPickerValue, setTempPickerValue] = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateTimeModalVisible, setDateTimeModalVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");
  const [pickerTitle, setPickerTitle] = useState("");
  const [currentDateTimeField, setCurrentDateTimeField] = useState(null);

  // Modal for approver comments
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const submitButtonScale = useRef(new Animated.Value(1)).current;
  const dateButtonScale = useRef(new Animated.Value(1)).current;
  const timeButtonScale = useRef(new Animated.Value(1)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const dateTimeModalAnim = useRef(new Animated.Value(height)).current;
  const confirmButtonScale = useRef(new Animated.Value(1)).current;

  const dateTimePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          dateTimeModalAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeDateTimeModal();
        } else {
          Animated.spring(dateTimeModalAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

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

    const initialize = async () => {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert(
          "Authentication Error",
          "You are not logged in. Please sign in again.",
          [{ text: "OK", onPress: () => router.replace("(auth)/signin") }]
        );
        return;
      }
      await fetchExceededLogs(token);
      await fetchApprovers(token);
      await fetchOvertimeRequests(token);
    };
    initialize();
  }, [router]);

  const fetchExceededLogs = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/overtime/smart-detect`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        RNAlert.alert(
          "Error",
          data?.message || "Failed to fetch overtime-eligible punch logs."
        );
        return;
      }

      const list = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
        ? data
        : [];

      // Scope to current user only (even if backend returns company-wide for admins)
      let currentUserId = null;
      try {
        if (typeof atob === "function") {
          const payload = JSON.parse(atob((token || "").split(".")[1] || ""));
          currentUserId =
            payload?.id ?? payload?.userId ?? payload?.sub ?? null;
        }
      } catch {}
      const scopedList =
        currentUserId != null
          ? (list || []).filter(
              (det) => String(det?.userId) === String(currentUserId)
            )
          : list || [];

      const items = [];
      const map = {};

      (scopedList || []).forEach((det) => {
        const actualStart = det?.actualStart ? new Date(det.actualStart) : null;
        const actualEnd = det?.actualEnd ? new Date(det.actualEnd) : null;
        const scheduledEnd = det?.scheduledEnd
          ? new Date(det.scheduledEnd)
          : null;
        if (!actualStart || !actualEnd) return;

        const totalMins =
          typeof det?.overtimeMins === "number"
            ? det.overtimeMins
            : Math.max(
                0,
                (actualEnd.getTime() -
                  (scheduledEnd?.getTime() ?? actualStart.getTime())) /
                  60000
              );
        const otHours = Math.floor(totalMins / 60);
        const otRemMins = totalMins - otHours * 60;
        const otRemMinsDisplay = otRemMins.toFixed(2);

        const label = `${actualStart.toLocaleDateString()} • ${actualStart.toLocaleTimeString(
          [],
          { hour: "2-digit", minute: "2-digit" }
        )}–${actualEnd.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })} • OT ${otHours > 0 ? `${otHours}h ` : ""}${otRemMinsDisplay}m`;
        const value = String(det?.timeLogId ?? det?.id);
        items.push({ label, value });
        map[value] = { actualStart, actualEnd, scheduledEnd, totalMins };
      });

      setOtLogItems(items);
      setOtLogMap(map);
    } catch (error) {
      console.error("Error fetching exceeded logs:", error);
      RNAlert.alert("Error", "An error occurred while fetching punch logs.");
    }
  };

  const fetchApprovers = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/leaves/approvers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("[OT Approvers] raw payload:", JSON.stringify(data));
      if (res.ok && data.data) {
        setApproverItems(parseApproversPayload(data));
      } else {
        RNAlert.alert("Error", data.message || "Failed to fetch approvers.");
      }
    } catch (error) {
      console.error("Error fetching approvers:", error);
      RNAlert.alert("Error", "An error occurred while fetching approvers.");
    }
  };

  const fetchOvertimeRequests = async (token) => {
    setLoadingRequests(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/overtime/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("[OT] Fetch requests → status:", res.status, "ok:", res.ok);
      console.log("[OT] Raw response:", data);
      if (res.ok && Array.isArray(data.data)) {
        const sorted = [...data.data].sort((a, b) => {
          const aT = new Date(a.createdAt || a.fromDate || 0).getTime();
          const bT = new Date(b.createdAt || b.fromDate || 0).getTime();
          return bT - aT;
        });
        console.log(
          "[OT] Mapped for cards:",
          sorted.map((req) => ({
            id: req.id ?? req._id ?? req.requestId ?? null,
            status: req.status ?? req.state ?? null,
            fromDate: req.fromDate ?? req.start ?? null,
            toDate: req.toDate ?? req.end ?? null,
            requestedHours:
              req.requestedHours ?? req.hours ?? req.durationHours ?? null,
            timeLogId: req.timeLogId ?? req.logId ?? null,
            approverId: req.approverId ?? req.approver ?? null,
            reason:
              req.overtimeReason ?? req.requesterReason ?? req.reason ?? null,
          }))
        );
        setOvertimeRequests(sorted);
      } else {
        console.log(
          "[OT] Unexpected response shape; data.data missing or not array"
        );
        setOvertimeRequests([]);
      }
    } catch (error) {
      console.error("Error fetching overtime requests:", error);
    } finally {
      setLoadingRequests(false);
      setRefreshing(false);
    }
  };

  const handleSubmit = async () => {
    animateButtonPress(submitButtonScale);

    if (!otLogValue) {
      RNAlert.alert(
        "Incomplete Form",
        "Please select a punch log with overtime."
      );
      return;
    }
    if (!approverValue) {
      RNAlert.alert("Incomplete Form", "Please select an approver.");
      return;
    }

    if (!overtimeReason || !overtimeReason.trim()) {
      RNAlert.alert(
        "Incomplete Form",
        "Please provide a reason for your overtime request."
      );
      return;
    }

    const combinedStart = combineDateAndTime(otDate, otStartTime);
    const combinedEnd = combineDateAndTime(otEndDate, otEndTime);
    if (combinedStart >= combinedEnd) {
      RNAlert.alert("Invalid Times", "Start time must be before end time.");
      return;
    }

    // Compute requested hours and ensure it's greater than 0
    const requestedHoursRaw =
      (combinedEnd.getTime() - combinedStart.getTime()) / 3600000;
    const requestedHours = Number(requestedHoursRaw.toFixed(2));
    if (requestedHours <= 0) {
      RNAlert.alert(
        "Invalid Duration",
        "Requested hours must be greater than 0."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert("Authentication Error", "Please sign in again.");
        setIsSubmitting(false);
        router.replace("(auth)/signin");
        return;
      }

      const payload = {
        fromDate: combinedStart.toISOString(),
        toDate: combinedEnd.toISOString(),
        timeLogId: otLogValue,
        approverId: approverValue,
        // Keep both keys so we stay compatible with backend shapes
        overtimeReason,
        requesterReason: overtimeReason,
        requestedHours,
      };

      const res = await fetch(`${API_BASE_URL}/api/overtime/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Overtime request submitted successfully!");
        setOvertimeReason("");
        const now = new Date();
        setOtDate(now);
        setOtStartTime(now);
        setOtEndDate(now);
        setOtEndTime(now);
        setOtLogValue("");
        setApproverValue("");
        await fetchOvertimeRequests(token);
      } else {
        RNAlert.alert(
          "Error",
          data.message || "Failed to submit overtime request."
        );
      }
    } catch (error) {
      console.error("Error submitting overtime request:", error);
      RNAlert.alert(
        "Error",
        "There was an issue submitting your overtime request."
      );
    } finally {
      setIsSubmitting(false);
    }
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

  const openCommentsModal = (request) => {
    setSelectedRequest(request);
    setCommentsModalVisible(true);
  };

  const closeCommentsModal = () => {
    setCommentsModalVisible(false);
    setSelectedRequest(null);
  };

  const openDateTimeModal = (field, mode) => {
    setCurrentDateTimeField(field);
    setPickerMode(mode);
    setPickerTitle(mode === "date" ? "Select Date" : "Select Time");

    let initialValue = new Date();
    switch (field) {
      case "startDate":
        initialValue = otDate;
        animateButtonPress(dateButtonScale);
        break;
      case "startTime":
        initialValue = otStartTime;
        animateButtonPress(timeButtonScale);
        break;
      case "endDate":
        initialValue = otEndDate;
        animateButtonPress(dateButtonScale);
        break;
      case "endTime":
        initialValue = otEndTime;
        animateButtonPress(timeButtonScale);
        break;
    }

    setTempPickerValue(initialValue);

    if (Platform.OS === "ios") {
      setDateTimeModalVisible(true);
      Animated.parallel([
        Animated.timing(modalBgAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(dateTimeModalAnim, {
          toValue: 0,
          tension: 70,
          friction: 12,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      setCurrentPicker(field);
    }
  };

  const closeDateTimeModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(dateTimeModalAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDateTimeModalVisible(false);
    });
  };

  const handleDateTimeConfirm = () => {
    animateButtonPress(confirmButtonScale);

    switch (currentDateTimeField) {
      case "startDate":
        setOtDate(tempPickerValue);
        break;
      case "startTime":
        setOtStartTime(tempPickerValue);
        break;
      case "endDate":
        setOtEndDate(tempPickerValue);
        break;
      case "endTime":
        setOtEndTime(tempPickerValue);
        break;
    }

    setTimeout(() => {
      closeDateTimeModal();
    }, 100);
  };

  const renderAndroidPicker = () => {
    if (!currentPicker) return null;
    const isDatePicker =
      currentPicker === "startDate" || currentPicker === "endDate";

    const onChange = (event, selectedValue) => {
      if (event.type === "set") {
        if (isDatePicker) {
          if (currentPicker === "startDate") {
            setOtDate(selectedValue || otDate);
          } else {
            setOtEndDate(selectedValue || otEndDate);
          }
        } else {
          if (currentPicker === "startTime") {
            setOtStartTime(selectedValue || otStartTime);
          } else {
            setOtEndTime(selectedValue || otEndTime);
          }
        }
      }
      setCurrentPicker(null);
    };

    return (
      <DateTimePicker
        value={
          currentPicker === "startDate"
            ? otDate
            : currentPicker === "endDate"
            ? otEndDate
            : currentPicker === "startTime"
            ? otStartTime
            : otEndTime
        }
        mode={isDatePicker ? "date" : "time"}
        is24Hour={true}
        display="default"
        onChange={onChange}
      />
    );
  };

  const FormLabel = ({ text, required = true }) => (
    <View className="flex-row items-center mb-2">
      <Text className="text-base font-semibold text-slate-800">{text}</Text>
      {required && <Text className="text-red-500 ml-1">*</Text>}
    </View>
  );

  const DateTimeSelector = ({
    label,
    date,
    time,
    onDatePress,
    onTimePress,
  }) => (
    <View className="mb-5">
      <FormLabel text={label} />
      <View className="flex-row justify-between">
        <Animated.View
          style={{
            flex: 1,
            marginRight: 8,
            transform: [{ scale: dateButtonScale }],
          }}
        >
          <TouchableOpacity
            className="py-3 px-4 bg-slate-50 rounded-lg flex-row justify-between items-center"
            onPress={onDatePress}
            activeOpacity={0.8}
          >
            <Text className="text-slate-800">{date.toLocaleDateString()}</Text>
            <Ionicons name="calendar-outline" size={18} color="#6B7280" />
          </TouchableOpacity>
        </Animated.View>
        <Animated.View
          style={{ flex: 1, transform: [{ scale: timeButtonScale }] }}
        >
          <TouchableOpacity
            className="py-3 px-4 bg-slate-50 rounded-lg flex-row justify-between items-center"
            onPress={onTimePress}
            activeOpacity={0.8}
          >
            <Text className="text-slate-800">
              {time.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            <Ionicons name="time-outline" size={18} color="#6B7280" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ paddingTop: 70 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 80 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  const token = await SecureStore.getItemAsync("token");
                  if (token) await fetchOvertimeRequests(token);
                }}
                tintColor="#cbd5e1"
              />
            }
          >
            <Animated.View
              style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              }}
            >
              <View className="px-5 mb-6">
                <Text className="text-2xl font-bold text-slate-800 mb-1">
                  Request Overtime
                </Text>
                <Text className="text-slate-500">
                  Fill in the details to submit your overtime request
                </Text>
              </View>

              {/* Punch Logs with Overtime Dropdown */}
              <View style={{ zIndex: 3000 }} className="px-5 mb-3">
                <FormLabel text="Punch Log (exceeds schedule)" />
                <DropDownPicker
                  open={otLogOpen}
                  value={otLogValue}
                  items={otLogItems}
                  setOpen={setOtLogOpen}
                  setValue={setOtLogValue}
                  setItems={setOtLogItems}
                  onChangeValue={(val) => {
                    if (val && otLogMap[val]) {
                      const { actualStart, actualEnd, scheduledEnd } =
                        otLogMap[val];
                      const startDate = new Date(actualStart);
                      const endDate = new Date(actualEnd);
                      setOtDate(startDate);
                      setOtStartTime(new Date(scheduledEnd || actualStart));
                      setOtEndDate(endDate);
                      setOtEndTime(endDate);
                    }
                  }}
                  placeholder="Select a punch with overtime"
                  textStyle={{ color: "#374151" }}
                  style={{
                    borderColor: "#F9FAFB",
                    backgroundColor: "#F9FAFB",
                    minHeight: 50,
                  }}
                  dropDownContainerStyle={{
                    borderColor: "#F9FAFB",
                    backgroundColor: "#F9FAFB",
                  }}
                  placeholderStyle={{ color: "#9CA3AF" }}
                  zIndex={3000}
                  zIndexInverse={1000}
                  nestedScrollEnabled={true}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{ nestedScrollEnabled: true }}
                  autoScroll={false}
                />
              </View>

              {/* Selected Punch Log Details */}
              {otLogValue && otLogMap[otLogValue] && (
                <View className="px-5 mb-5">
                  <View className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <View className="flex-row items-center mb-2">
                      <Ionicons
                        name="clipboard-outline"
                        size={18}
                        color="#64748b"
                      />
                      <Text className="ml-2 text-slate-700 font-semibold">
                        Selected Punch Log
                      </Text>
                    </View>
                    {(() => {
                      const {
                        actualStart,
                        actualEnd,
                        scheduledEnd,
                        totalMins,
                      } = otLogMap[otLogValue];
                      const start = actualStart ? new Date(actualStart) : null;
                      const end = actualEnd ? new Date(actualEnd) : null;
                      const sched =
                        scheduledEnd && new Date(scheduledEnd).getTime()
                          ? new Date(scheduledEnd)
                          : null;
                      const mins =
                        typeof totalMins === "number"
                          ? totalMins
                          : start && end
                          ? Math.max(
                              0,
                              (end.getTime() -
                                (sched?.getTime() ?? start.getTime())) /
                                60000
                            )
                          : 0;
                      const otHours = Math.floor(mins / 60);
                      const otRemMins = mins - otHours * 60;
                      const otDisplay =
                        otHours || otRemMins
                          ? `${
                              otHours > 0 ? `${otHours}h ` : ""
                            }${otRemMins.toFixed(2)}m`
                          : "0m";

                      return (
                        <>
                          <Text className="text-slate-600 text-sm mb-1">
                            Date:{" "}
                            {start
                              ? start.toLocaleDateString()
                              : "Unknown date"}
                          </Text>
                          <Text className="text-slate-600 text-sm mb-1">
                            Actual:{" "}
                            {start
                              ? start.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "?"}{" "}
                            –{" "}
                            {end
                              ? end.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "?"}
                          </Text>
                          {sched && (
                            <Text className="text-slate-600 text-sm mb-1">
                              Scheduled End:{" "}
                              {sched.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Text>
                          )}
                          <Text className="text-slate-700 text-sm font-medium mt-1">
                            Detected Overtime: {otDisplay}
                          </Text>
                        </>
                      );
                    })()}
                  </View>
                </View>
              )}

              {/* Approver Dropdown */}
              <View style={{ zIndex: 2000 }} className="px-5 mb-5">
                <FormLabel text="Approver" />
                <DropDownPicker
                  open={approverOpen}
                  value={approverValue}
                  items={approverItems}
                  setOpen={setApproverOpen}
                  setValue={setApproverValue}
                  setItems={setApproverItems}
                  placeholder="Select Approver"
                  textStyle={{ color: "#374151" }}
                  style={{
                    borderColor: "#f8fafc",
                    backgroundColor: "#f8fafc",
                    minHeight: 50,
                  }}
                  dropDownContainerStyle={{
                    borderColor: "#f8fafc",
                    backgroundColor: "#F9FAFB",
                  }}
                  placeholderStyle={{ color: "#9CA3AF" }}
                  zIndex={2000}
                  zIndexInverse={2000}
                  nestedScrollEnabled={true}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{ nestedScrollEnabled: true }}
                  autoScroll={false}
                />
              </View>

              {/* Reason for Overtime (TEXTINPUT) */}
              <View className="px-5 mb-5">
                <FormLabel text="Reason" required={true} />
                <View className="bg-slate-50 rounded-lg px-3 py-3">
                  <TextInput
                    multiline
                    style={{ color: "#374151", minHeight: 80 }}
                    value={overtimeReason}
                    onChangeText={setOvertimeReason}
                    placeholder="Explain your reason"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Date Time Selectors */}
              <View className="px-5">
                <DateTimeSelector
                  label="Overtime Start"
                  date={otDate}
                  time={otStartTime}
                  onDatePress={() => openDateTimeModal("startDate", "date")}
                  onTimePress={() => openDateTimeModal("startTime", "time")}
                />

                <DateTimeSelector
                  label="Overtime End"
                  date={otEndDate}
                  time={otEndTime}
                  onDatePress={() => openDateTimeModal("endDate", "date")}
                  onTimePress={() => openDateTimeModal("endTime", "time")}
                />

                {/* Submit Button */}
                <View className="mt-6 mb-10">
                  <Animated.View
                    style={{ transform: [{ scale: submitButtonScale }] }}
                  >
                    <TouchableOpacity
                      onPress={handleSubmit}
                      disabled={isSubmitting}
                      className={`py-4 rounded-lg flex-row justify-center items-center ${
                        isSubmitting ? "bg-orange-400" : "bg-orange-400"
                      }`}
                      activeOpacity={0.8}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator
                          size="small"
                          color="#FFFFFF"
                          className="mr-2"
                        />
                      ) : (
                        <Ionicons
                          name="paper-plane"
                          size={18}
                          color="#FFFFFF"
                          style={{ marginRight: 6 }}
                        />
                      )}
                      <Text className="text-white font-semibold text-base">
                        {isSubmitting
                          ? "Submitting..."
                          : "Submit Overtime Request"}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>

                {/* Requests List */}
                <View className="mt-6 mb-4">
                  <Text className="text-xl font-bold text-slate-800 mb-3">
                    My Overtime Requests
                  </Text>
                  {loadingRequests ? (
                    <View className="items-center py-6">
                      <ActivityIndicator size="large" color="#cbd5e1" />
                      <Text className="mt-2 text-slate-500">Loading...</Text>
                    </View>
                  ) : overtimeRequests.length === 0 ? (
                    <View className="bg-slate-50 rounded-xl p-5 items-center">
                      <Ionicons name="time-outline" size={28} color="#94a3b8" />
                      <Text className="text-slate-500 mt-2">
                        No overtime requests yet.
                      </Text>
                    </View>
                  ) : (
                    <View>
                      {overtimeRequests.map((req) => {
                        const created = req.createdAt
                          ? new Date(req.createdAt)
                          : null;
                        const from = req.fromDate
                          ? new Date(req.fromDate)
                          : null;
                        const to = req.toDate ? new Date(req.toDate) : null;
                        const status = (req.status || "pending").toLowerCase();
                        const statusColors = {
                          approved: { bg: "#dcfce7", text: "#166534" },
                          rejected: { bg: "#fee2e2", text: "#991b1b" },
                          pending: { bg: "#ffedd5", text: "#9a3412" },
                        };
                        const colors =
                          statusColors[status] || statusColors.pending;
                        const tl = req?.timeLog || {};
                        const tlStartRaw =
                          tl?.actualStart ||
                          tl?.start ||
                          tl?.clockIn ||
                          tl?.punchIn ||
                          tl?.in ||
                          tl?.inTime;
                        const tlEndRaw =
                          tl?.actualEnd ||
                          tl?.end ||
                          tl?.clockOut ||
                          tl?.punchOut ||
                          tl?.out ||
                          tl?.outTime;
                        const tlSchedEndRaw =
                          tl?.scheduledEnd || tl?.scheduleEnd || tl?.shiftEnd;
                        return (
                          <TouchableOpacity
                            key={req.id}
                            activeOpacity={0.85}
                            className="mb-3"
                            onPress={() => openCommentsModal(req)}
                          >
                            <View className="p-4 bg-slate-50 rounded-xl">
                              <View className="flex-row justify-between items-center mb-2">
                                <Text className="text-base font-semibold text-slate-700">
                                  {created
                                    ? created.toLocaleDateString()
                                    : from
                                    ? from.toLocaleDateString()
                                    : ""}
                                </Text>
                                <View
                                  style={{
                                    backgroundColor: colors.bg,
                                    borderRadius: 9999,
                                    paddingVertical: 4,
                                    paddingHorizontal: 10,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: colors.text,
                                      fontWeight: "600",
                                      fontSize: 12,
                                    }}
                                  >
                                    {status.toUpperCase()}
                                  </Text>
                                </View>
                              </View>
                              {created ? (
                                <View className="flex-row items-center mb-1">
                                  <Ionicons
                                    name="calendar-outline"
                                    size={16}
                                    color="#64748b"
                                  />
                                  <Text className="ml-2 text-slate-700 text-sm">
                                    Created{" "}
                                    {created.toLocaleString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </Text>
                                </View>
                              ) : null}
                              <View className="flex-row items-center mb-1">
                                <Ionicons
                                  name="time-outline"
                                  size={16}
                                  color="#64748b"
                                />
                                <Text className="ml-2 text-slate-700 text-sm">
                                  {from
                                    ? from.toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : ""}
                                  {" – "}
                                  {to
                                    ? to.toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : ""}
                                </Text>
                              </View>
                              {tlStartRaw || tlEndRaw || tlSchedEndRaw ? (
                                <View className="flex-row items-center mb-1">
                                  <Ionicons
                                    name="clipboard-outline"
                                    size={16}
                                    color="#64748b"
                                  />
                                  <Text className="ml-2 text-slate-700 text-sm">
                                    Time Log:{" "}
                                    {toLocalTimeString(tlStartRaw) || "?"} –{" "}
                                    {toLocalTimeString(tlEndRaw) || "?"}
                                    {tlSchedEndRaw
                                      ? ` (Sched end ${toLocalTimeString(
                                          tlSchedEndRaw
                                        )})`
                                      : ""}
                                  </Text>
                                </View>
                              ) : null}
                              {req?.requestedHours ? (
                                <View className="flex-row items-center mt-1">
                                  <Ionicons
                                    name="timer-outline"
                                    size={16}
                                    color="#64748b"
                                  />
                                  <Text className="ml-2 text-slate-700 text-sm">
                                    Requested Hours:{" "}
                                    {String(req.requestedHours)}
                                  </Text>
                                </View>
                              ) : null}
                              {req.overtimeReason || req.requesterReason ? (
                                <View className="flex-row items-center mt-1">
                                  <Ionicons
                                    name="document-text-outline"
                                    size={16}
                                    color="#64748b"
                                  />
                                  <Text
                                    className="ml-2 text-slate-600 text-sm"
                                    numberOfLines={2}
                                  >
                                    {req.overtimeReason || req.requesterReason}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {Platform.OS === "android" && renderAndroidPicker()}

      {/* iOS Date/Time Modal */}
      {dateTimeModalVisible && (
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              },
              { backgroundColor: "rgba(0, 0, 0, 0.5)", opacity: modalBgAnim },
            ]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={closeDateTimeModal}
            />
          </Animated.View>

          <Animated.View
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-lg"
            style={{
              transform: [{ translateY: dateTimeModalAnim }],
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "white",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              minHeight: height * 0.4,
              maxHeight: Platform.OS === "ios" ? height * 0.4 : height * 0.5,
              paddingBottom: Platform.OS === "ios" ? 0 : 20,
            }}
          >
            <View
              className="items-center py-3"
              {...dateTimePanResponder.panHandlers}
            >
              <View className="w-10 h-1 bg-slate-200 rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
              <Text className="text-lg font-bold text-slate-800">
                {pickerTitle}
              </Text>
            </View>

            <View className="items-center justify-center px-4 py-2">
              <DateTimePicker
                value={tempPickerValue}
                mode={pickerMode}
                is24Hour={true}
                display="spinner"
                onChange={(event, selectedValue) => {
                  if (selectedValue) {
                    setTempPickerValue(selectedValue);
                  }
                }}
                textColor="#000000"
                style={{ height: 200, alignSelf: "center" }}
              />
            </View>

            <View className="px-4 pt-2 pb-4">
              <Animated.View
                style={{ transform: [{ scale: confirmButtonScale }] }}
              >
                <TouchableOpacity
                  onPress={handleDateTimeConfirm}
                  className="bg-orange-400 py-3.5 rounded-lg w-full items-center"
                  activeOpacity={0.8}
                >
                  <Text className="text-white font-bold text-base">
                    Confirm
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      )}
      {/* Approver Comments Modal */}
      <Modal
        visible={commentsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeCommentsModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "transparent",
            justifyContent: "flex-end",
          }}
        >
          <View
            className="bg-white"
            style={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 28,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              // Drop shadow
              shadowColor: "#000000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 12,
            }}
          >
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-lg font-bold text-slate-800">
                Approver Comments
              </Text>
              <TouchableOpacity
                onPress={closeCommentsModal}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-500 mb-3 text-xs">
              Tap outside or the close icon to dismiss
            </Text>
            <View className="bg-slate-50 rounded-lg p-3">
              <Text className="text-slate-700">
                {selectedRequest?.approverComments
                  ? String(selectedRequest.approverComments)
                  : "No comments yet."}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default SubmitOvertime;

// Hide this route from tab linking/navigation menus
export const href = null;
