// app/(tabs)/(leaves)/leaves-request.jsx

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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import DropDownPicker from "react-native-dropdown-picker";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../../config/constant";

const { height } = Dimensions.get("window");

// Utility to combine date and time into one
const combineDateAndTime = (date, time) => {
  const combined = new Date(date);
  combined.setHours(time.getHours());
  combined.setMinutes(time.getMinutes());
  combined.setSeconds(time.getSeconds());
  combined.setMilliseconds(time.getMilliseconds());
  return combined;
};

const SubmitLeaves = () => {
  const router = useRouter();

  // Additional state for the "Reason" text
  const [leaveReason, setLeaveReason] = useState("");

  const [leaveType, setLeaveType] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState(new Date());
  const [leaveStartTime, setLeaveStartTime] = useState(new Date());
  const [leaveEndDate, setLeaveEndDate] = useState(new Date());
  const [leaveEndTime, setLeaveEndTime] = useState(new Date());
  const [approverOpen, setApproverOpen] = useState(false);
  const [approverItems, setApproverItems] = useState([]);
  const [approverValue, setApproverValue] = useState("");
  const [currentPicker, setCurrentPicker] = useState(null);
  const [tempPickerValue, setTempPickerValue] = useState(new Date());
  const [openLeaveType, setOpenLeaveType] = useState(false);
  const [leaveTypeItems, setLeaveTypeItems] = useState([
    { label: "Sick Leave", value: "Sick Leave" },
    { label: "Vacation Leave", value: "Vacation Leave" },
    { label: "Emergency Leave", value: "Emergency Leave" },
    { label: "Maternity/Paternity Leave", value: "Maternity/Paternity Leave" },
    { label: "Casual Leave", value: "Casual Leave" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateTimeModalVisible, setDateTimeModalVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");
  const [pickerTitle, setPickerTitle] = useState("");
  const [currentDateTimeField, setCurrentDateTimeField] = useState(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const submitButtonScale = useRef(new Animated.Value(1)).current;
  const dateButtonScale = useRef(new Animated.Value(1)).current;
  const timeButtonScale = useRef(new Animated.Value(1)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const dateTimeModalAnim = useRef(new Animated.Value(height)).current;
  const confirmButtonScale = useRef(new Animated.Value(1)).current;

  // Pan responder for date time modal
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
    // Initial animations
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
        RNAlert.alert("Authentication Error", "You are not logged in. Please sign in again.", [
          { text: "OK", onPress: () => router.replace("(auth)/login-user") },
        ]);
        return;
      }
      await fetchApprovers(token);
    };
    initialize();
  }, [router]);

  const fetchApprovers = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/leaves/approvers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        const formattedApprovers = data.data.map((approver) => ({
          label: `${approver.username} (${approver.email})`,
          value: String(approver.id),
        }));
        setApproverItems(formattedApprovers);
      } else {
        RNAlert.alert("Error", data.message || "Failed to fetch approvers.");
      }
    } catch (error) {
      console.error("Error fetching approvers:", error);
      RNAlert.alert("Error", "An error occurred while fetching approvers.");
    }
  };

  const handleSubmit = async () => {
    animateButtonPress(submitButtonScale);

    if (!leaveType || !approverValue) {
      RNAlert.alert("Incomplete Form", "Please fill in all required fields, including selecting an approver.");
      return;
    }
    const combinedStart = combineDateAndTime(leaveStartDate, leaveStartTime);
    const combinedEnd = combineDateAndTime(leaveEndDate, leaveEndTime);
    if (combinedStart > combinedEnd) {
      RNAlert.alert("Invalid Dates", "Start Date and Time cannot be after End Date and Time.");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        RNAlert.alert("Authentication Error", "Please sign in again.");
        setIsSubmitting(false);
        router.replace("(auth)/login-user");
        return;
      }

      // Include leaveReason in the payload
      const payload = {
        type: leaveType,
        fromDate: combinedStart.toISOString(),
        toDate: combinedEnd.toISOString(),
        approverId: approverValue,
        leaveReason,
      };

      const res = await fetch(`${API_BASE_URL}/api/leaves/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        RNAlert.alert("Success", "Leave request submitted successfully!");
        // Reset form
        setLeaveType("");
        setLeaveReason("");
        setLeaveStartDate(new Date());
        setLeaveStartTime(new Date());
        setLeaveEndDate(new Date());
        setLeaveEndTime(new Date());
        setApproverValue("");
      } else {
        RNAlert.alert("Error", data.message || "Failed to submit leave request.");
      }
    } catch (error) {
      console.error("Error submitting leave request:", error);
      RNAlert.alert("Error", "There was an issue submitting your leave request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Simple animation function
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

  const openDateTimeModal = (field, mode) => {
    setCurrentDateTimeField(field);
    setPickerMode(mode);
    setPickerTitle(mode === "date" ? "Select Date" : "Select Time");

    let initialValue = new Date();
    switch (field) {
      case "startDate":
        initialValue = leaveStartDate;
        animateButtonPress(dateButtonScale);
        break;
      case "startTime":
        initialValue = leaveStartTime;
        animateButtonPress(timeButtonScale);
        break;
      case "endDate":
        initialValue = leaveEndDate;
        animateButtonPress(dateButtonScale);
        break;
      case "endTime":
        initialValue = leaveEndTime;
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
      // Android -> show the native picker
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
        setLeaveStartDate(tempPickerValue);
        break;
      case "startTime":
        setLeaveStartTime(tempPickerValue);
        break;
      case "endDate":
        setLeaveEndDate(tempPickerValue);
        break;
      case "endTime":
        setLeaveEndTime(tempPickerValue);
        break;
    }

    setTimeout(() => {
      closeDateTimeModal();
    }, 100);
  };

  // Android-specific date/time picker
  const renderAndroidPicker = () => {
    if (!currentPicker) return null;
    const isDatePicker = currentPicker.includes("Date");
    const isStartPicker = currentPicker.startsWith("start");

    const onChange = (event, selectedValue) => {
      if (event.type === "set") {
        if (isDatePicker) {
          if (isStartPicker) {
            setLeaveStartDate(selectedValue || leaveStartDate);
          } else {
            setLeaveEndDate(selectedValue || leaveEndDate);
          }
        } else {
          if (isStartPicker) {
            setLeaveStartTime(selectedValue || leaveStartTime);
          } else {
            setLeaveEndTime(selectedValue || leaveEndTime);
          }
        }
      }
      setCurrentPicker(null);
    };

    return (
      <DateTimePicker
        value={isStartPicker ? (isDatePicker ? leaveStartDate : leaveStartTime) : isDatePicker ? leaveEndDate : leaveEndTime}
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

  const DateTimeSelector = ({ label, date, time, onDatePress, onTimePress }) => (
    <View className="mb-5">
      <FormLabel text={label} />
      <View className="flex-row justify-between">
        <Animated.View style={{ flex: 1, marginRight: 8, transform: [{ scale: dateButtonScale }] }}>
          <TouchableOpacity className="py-3 px-4 bg-slate-50 rounded-lg flex-row justify-between items-center" onPress={onDatePress} activeOpacity={0.8}>
            <Text className="text-slate-800">{date.toLocaleDateString()}</Text>
            <Ionicons name="calendar-outline" size={18} color="#6B7280" />
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={{ flex: 1, transform: [{ scale: timeButtonScale }] }}>
          <TouchableOpacity className="py-3 px-4 bg-slate-50 rounded-lg flex-row justify-between items-center" onPress={onTimePress} activeOpacity={0.8}>
            <Text className="text-slate-800">{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
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
          <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
            <Animated.View
              style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              }}
            >
              <View className="px-5 mb-6">
                <Text className="text-2xl font-bold text-slate-800 mb-1">Request Leave</Text>
                <Text className="text-slate-500">Fill in the details to submit your leave request</Text>
              </View>

              {/* Leave Type Dropdown */}
              <View style={{ zIndex: 3000 }} className="px-5 mb-5">
                <FormLabel text="Leave Type" />
                <DropDownPicker
                  open={openLeaveType}
                  value={leaveType}
                  items={leaveTypeItems}
                  setOpen={setOpenLeaveType}
                  setValue={setLeaveType}
                  setItems={setLeaveTypeItems}
                  placeholder="Select Leave Type"
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

              {/* Reason for Leave (TEXTINPUT) */}
              <View className="px-5 mb-5">
                <FormLabel text="Reason (optional)" required={false} />
                <View className="bg-slate-50 rounded-lg px-3 py-3">
                  <TextInput
                    multiline
                    style={{ color: "#374151", minHeight: 80 }}
                    value={leaveReason}
                    onChangeText={setLeaveReason}
                    placeholder="Explain your reason (optional)"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Date Time Selectors */}
              <View className="px-5">
                <DateTimeSelector
                  label="Leave Start"
                  date={leaveStartDate}
                  time={leaveStartTime}
                  onDatePress={() => openDateTimeModal("startDate", "date")}
                  onTimePress={() => openDateTimeModal("startTime", "time")}
                />

                <DateTimeSelector
                  label="Leave End"
                  date={leaveEndDate}
                  time={leaveEndTime}
                  onDatePress={() => openDateTimeModal("endDate", "date")}
                  onTimePress={() => openDateTimeModal("endTime", "time")}
                />

                {/* Submit Button */}
                <View className="mt-6">
                  <Animated.View style={{ transform: [{ scale: submitButtonScale }] }}>
                    <TouchableOpacity
                      onPress={handleSubmit}
                      disabled={isSubmitting}
                      className={`py-4 rounded-lg flex-row justify-center items-center ${isSubmitting ? "bg-orange-400" : "bg-orange-400"}`}
                      activeOpacity={0.8}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" className="mr-2" />
                      ) : (
                        <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      )}
                      <Text className="text-white font-semibold text-base">{isSubmitting ? "Submitting..." : "Submit Leave Request"}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {Platform.OS === "android" && renderAndroidPicker()}

      {/* iOS Date/Time Modal */}
      {dateTimeModalVisible && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
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
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeDateTimeModal} />
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
            <View className="items-center py-3" {...dateTimePanResponder.panHandlers}>
              <View className="w-10 h-1 bg-slate-200 rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
              <Text className="text-lg font-bold text-slate-800">{pickerTitle}</Text>
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
              <Animated.View style={{ transform: [{ scale: confirmButtonScale }] }}>
                <TouchableOpacity onPress={handleDateTimeConfirm} className="bg-orange-400 py-3.5 rounded-lg w-full items-center" activeOpacity={0.8}>
                  <Text className="text-white font-bold text-base">Confirm</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default SubmitLeaves;
