// app/(tabs)/(settings)/(management)/manage-shift-schedule.jsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
  RefreshControl,
  TextInput,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import DropDownPicker from "react-native-dropdown-picker";
import { Ionicons, Feather, MaterialIcons } from "@expo/vector-icons";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../../../config/constant";

const { height } = Dimensions.get("window");

const daysOfWeek = [
  { label: "Mon", value: "MO" },
  { label: "Tue", value: "TU" },
  { label: "Wed", value: "WE" },
  { label: "Thu", value: "TH" },
  { label: "Fri", value: "FR" },
  { label: "Sat", value: "SA" },
  { label: "Sun", value: "SU" },
];

const ManageShiftSchedule = () => {
  const router = useRouter();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;
  // Add missing deleteButtonScale and cancelButtonScale
  const deleteButtonScale = useRef(new Animated.Value(1)).current;
  const cancelButtonScale = useRef(new Animated.Value(1)).current;

  // Bottom-sheet modal animations
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const modalYAnim = useRef(new Animated.Value(height)).current;

  // Card animations
  const cardScales = useRef({}).current;

  // State for available shift templates
  const [openShiftPicker, setOpenShiftPicker] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [shiftItems, setShiftItems] = useState([]);

  // Recurrence pattern state
  const [selectedDays, setSelectedDays] = useState(["MO", "TU", "WE", "TH", "FR"]);

  // Effective dates state using inline DateTimePickers (like ManageShift)
  const [effectiveStartDate, setEffectiveStartDate] = useState(new Date());
  const [effectiveEndDate, setEffectiveEndDate] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [androidDatePicker, setAndroidDatePicker] = useState(null);

  // Assignment state – if not assigning to all, we use a dropdown for a single user (saved as assignedUserId)
  const [assignedToAll, setAssignedToAll] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userItems, setUserItems] = useState([]);

  // Shift schedule list states
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false); // now declared

  // Modal state for actions/edit/delete
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [modalMode, setModalMode] = useState("actions"); // "actions", "edit", or "delete"

  // PanResponder for modal dragging
  const modalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
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
    })
  ).current;

  // Fetch available shift templates
  const fetchAvailableShifts = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${API_BASE_URL}/api/shifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data.data) {
        const items = res.data.data.map((shift) => ({
          label: shift.shiftName,
          value: shift.id,
          startTime: shift.startTime,
          endTime: shift.endTime,
        }));
        setShiftItems(items);
        if (items.length > 0) setSelectedShiftId(items[0].value);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to fetch available shifts.");
    }
  }, []);

  // Fetch available users
  const fetchAvailableUsers = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${API_BASE_URL}/api/employee`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data.data) {
        const items = res.data.data.map((user) => ({
          label: user.email,
          value: user.id,
        }));
        setUserItems(items);
        if (items.length > 0 && !assignedToAll) setSelectedUserId(items[0].value);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to fetch available users.");
    }
  };

  // Fetch shift schedules
  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${API_BASE_URL}/api/shiftschedules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data.data) {
        setSchedules(res.data.data);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to fetch shift schedules.");
    } finally {
      setLoading(false);
    }
  };

  // Pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSchedules();
    await fetchAvailableShifts();
    await fetchAvailableUsers();
    setRefreshing(false);
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

    fetchAvailableShifts();
    fetchSchedules();
    fetchAvailableUsers();
  }, [fetchAvailableShifts]);

  // Open modal to create or view schedule actions
  const openModal = (schedule = null) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setModalMode("actions");
    } else {
      resetForm();
      setEditingSchedule(null);
      setModalMode("edit");
    }

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
      setModalMode("actions");
      // Hide inline date pickers when closing the modal
      setShowStartDatePicker(false);
      setShowEndDatePicker(false);
      setAndroidDatePicker(null);
    });
  };

  const resetForm = () => {
    setSelectedDays(["MO", "TU", "WE", "TH", "FR"]);
    setEffectiveStartDate(new Date());
    setEffectiveEndDate(new Date());
    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
    setAndroidDatePicker(null);
    setAssignedToAll(true);
    setSelectedUserId(null);
    if (shiftItems.length > 0) {
      setSelectedShiftId(shiftItems[0].value);
    }
  };

  // Populate form for editing an existing schedule
  const handleEditSchedule = () => {
    if (editingSchedule) {
      setSelectedShiftId(editingSchedule.shiftId);
      const pattern = editingSchedule.recurrencePattern;
      if (pattern && pattern.includes("BYDAY=")) {
        const daysStr = pattern.split("BYDAY=")[1].split(";")[0];
        setSelectedDays(daysStr.split(","));
      } else {
        setSelectedDays(["MO", "TU", "WE", "TH", "FR"]);
      }
      setEffectiveStartDate(new Date(editingSchedule.startDate));
      if (editingSchedule.endDate) {
        setEffectiveEndDate(new Date(editingSchedule.endDate));
      } else {
        setEffectiveEndDate(new Date());
      }
      setAssignedToAll(editingSchedule.assignedToAll);
      setSelectedUserId(editingSchedule.assignedUserId || null);
      setModalMode("edit");
    }
  };

  // Delete schedule with delete confirmation UI
  const handleDeleteSchedule = async () => {
    if (!editingSchedule) return;
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.delete(`${API_BASE_URL}/api/shiftschedules/${editingSchedule.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200) {
        Alert.alert("Success", "Schedule deleted successfully.");
        closeModal();
        fetchSchedules();
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to delete schedule.");
    }
  };

  // Toggle recurrence day selection
  const toggleDay = (day) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const buildRRule = () => {
    if (selectedDays.length === 0) return "";
    return `FREQ=WEEKLY;BYDAY=${selectedDays.join(",")}`;
  };

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

  // Create or update schedule
  const handleCreateSchedule = async () => {
    if (!selectedShiftId || selectedDays.length === 0 || !effectiveStartDate) {
      Alert.alert("Validation", "Please select a shift, choose at least one day, and pick an effective start date.");
      return;
    }
    const rrule = buildRRule();
    try {
      const token = await SecureStore.getItemAsync("token");
      const payload = {
        shiftId: selectedShiftId,
        recurrencePattern: rrule,
        startDate: effectiveStartDate.toISOString(),
        endDate: effectiveEndDate ? effectiveEndDate.toISOString() : null,
        assignedToAll: assignedToAll,
        assignedUserId: assignedToAll ? null : selectedUserId,
      };

      let url = `${API_BASE_URL}/api/shiftschedules/create`;
      let method = "post";
      if (editingSchedule) {
        url = `${API_BASE_URL}/api/shiftschedules/${editingSchedule.id}`;
        method = "put";
      }
      const res = await axios[method](url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 201 || res.status === 200) {
        Alert.alert("Success", editingSchedule ? "Schedule updated successfully." : "Schedule created successfully.");
        resetForm();
        closeModal();
        fetchSchedules();
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to save schedule.");
    }
  };

  // Format recurrence for display
  const formatRecurrence = (pattern) => {
    if (!pattern) return "No recurrence";
    if (pattern.includes("BYDAY=")) {
      const daysStr = pattern.split("BYDAY=")[1].split(";")[0];
      const days = daysStr.split(",");
      const dayNames = days.map((day) => {
        const dayObj = daysOfWeek.find((d) => d.value === day);
        return dayObj ? dayObj.label : day;
      });
      return `Weekly on ${dayNames.join(", ")}`;
    }
    return pattern;
  };

  const renderScheduleItem = ({ item, index }) => {
    if (!cardScales[index]) {
      cardScales[index] = new Animated.Value(1);
    }
    let shiftTimeDisplay = null;
    if (item.shift && item.shift.startTime && item.shift.endTime) {
      const start = new Date(item.shift.startTime);
      const end = new Date(item.shift.endTime);
      shiftTimeDisplay = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return (
      <Animated.View style={{ transform: [{ scale: cardScales[index] }] }} className="mb-3">
        <TouchableOpacity
          onPress={() => {
            animateButtonPress(cardScales[index]);
            setTimeout(() => openModal(item), 100);
          }}
          activeOpacity={0.8}
          className="p-4 rounded-lg bg-slate-50 "
        >
          <View className="flex-row justify-between items-start">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-slate-700">{item.shift ? item.shift.shiftName : "Unknown Shift"}</Text>
              {shiftTimeDisplay && (
                <View className="flex-row items-center mt-1">
                  <Ionicons name="time-outline" size={14} color="#64748b" />
                  <Text className="ml-1 text-slate-600 text-sm">{shiftTimeDisplay}</Text>
                </View>
              )}
              <View className="flex-row items-center mt-1">
                <Ionicons name="repeat" size={14} color="#64748b" />
                <Text className="ml-1 text-slate-600 text-sm">{formatRecurrence(item.recurrencePattern)}</Text>
              </View>
              <View className="flex-row items-center mt-1">
                <Ionicons name="calendar-outline" size={14} color="#64748b" />
                <Text className="ml-1 text-slate-600 text-sm">
                  From: {new Date(item.startDate).toLocaleDateString()}
                  {item.endDate ? ` to ${new Date(item.endDate).toLocaleDateString()}` : ""}
                </Text>
              </View>
              <View className="mt-2 bg-orange-100 rounded-lg py-1 px-2 self-start">
                <Text className="text-xs text-orange-700">
                  {item.assignedToAll ? "Assigned to all users" : `Assigned to ${item.assignedUserId ? 1 : 0} user`}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderModalContent = () => {
    if (modalMode === "actions") {
      return (
        <View className="px-2 py-4">
          <View className="mb-4 flex-row justify-between ">
            <Text className="text-lg font-semibold text-slate-700 mb-2">{editingSchedule?.shift?.shiftName || "Unknown Shift"} Schedule</Text>
            <Text className="text-xs text-slate-500 mb-auto">id: {editingSchedule?.id}</Text>
          </View>
          <TouchableOpacity onPress={handleEditSchedule} className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                <Feather name="edit-2" size={18} color="#ffff" />
              </View>
              <Text className="text-slate-700 font-medium">Edit Schedule</Text>
            </View>
            <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setModalMode("delete")} className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                <Feather name="trash-2" size={18} color="#ffff" />
              </View>
              <Text className="text-slate-700 font-medium">Delete Schedule</Text>
            </View>
            <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
          </TouchableOpacity>
        </View>
      );
    } else if (modalMode === "edit") {
      return (
        <ScrollView className="px-2 py-4">
          {/* Shift Template Selector */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">
              Select Shift Template <Text className="text-red-500">*</Text>
            </Text>
            {shiftItems.length > 0 ? (
              <DropDownPicker
                listMode="SCROLLVIEW"
                open={openShiftPicker}
                value={selectedShiftId}
                items={shiftItems}
                setOpen={setOpenShiftPicker}
                setValue={setSelectedShiftId}
                setItems={setShiftItems}
                style={{
                  backgroundColor: "#f8fafc",
                  borderColor: "#f8fafc",
                  minHeight: 48,
                  borderRadius: 8,
                }}
                dropDownContainerStyle={{
                  backgroundColor: "#f8fafc",
                  borderColor: "#f8fafc",
                  borderRadius: 8,
                }}
                textStyle={{
                  fontSize: 14,
                  color: "#1e293b",
                }}
                placeholderStyle={{
                  color: "#94a3b8",
                }}
                zIndex={3000}
                zIndexInverse={1000}
              />
            ) : (
              <View className="bg-slate-50 rounded-lg p-4 items-center">
                <Text className="text-slate-500">No available shift templates. Please create one first.</Text>
              </View>
            )}
          </View>
          {/* Recurrence Days Selector */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">
              Select Recurrence Days <Text className="text-red-500">*</Text>
            </Text>
            <View className="flex-row flex-wrap justify-between">
              {daysOfWeek.map((day) => {
                const isSelected = selectedDays.includes(day.value);
                return (
                  <TouchableOpacity
                    key={day.value}
                    onPress={() => toggleDay(day.value)}
                    className={`mb-2 py-2 px-3 rounded-lg ${isSelected ? "bg-orange-400" : "bg-slate-100"}`}
                  >
                    <Text className={`text-sm font-medium ${isSelected ? "text-white" : "text-slate-600"}`}>{day.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {/* Effective Dates */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">
              Effective Start Date <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === "android") {
                  setShowEndDatePicker(false);
                  setAndroidDatePicker("start");
                } else {
                  setShowEndDatePicker(false);
                  setShowStartDatePicker(!showStartDatePicker);
                }
              }}
              className="flex-row items-center bg-slate-50 rounded-lg px-4 py-3.5 border border-slate-100"
            >
              <Ionicons name="calendar-outline" size={18} color="#64748b" />
              <Text className="flex-1 ml-2 text-slate-700">{effectiveStartDate.toLocaleDateString()}</Text>
              <Feather name="chevron-down" size={18} color="#64748b" />
            </TouchableOpacity>
            {Platform.OS === "ios" && showStartDatePicker && (
              <View className="mt-2">
                <DateTimePicker
                  value={effectiveStartDate}
                  mode="date"
                  display="spinner"
                  textColor="#475569"
                  onChange={(_event, selectedDate) => {
                    if (selectedDate) setEffectiveStartDate(selectedDate);
                  }}
                  style={{ width: "100%" }}
                />
              </View>
            )}
          </View>
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">Effective End Date (optional)</Text>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === "android") {
                  setShowStartDatePicker(false);
                  setAndroidDatePicker("end");
                } else {
                  setShowStartDatePicker(false);
                  setShowEndDatePicker(!showEndDatePicker);
                }
              }}
              className="flex-row items-center bg-slate-50 rounded-lg px-4 py-3.5 border border-slate-100"
            >
              <Ionicons name="calendar-outline" size={18} color="#64748b" />
              <Text className="flex-1 ml-2 text-slate-700">{effectiveEndDate ? effectiveEndDate.toLocaleDateString() : "No end date"}</Text>
              <Feather name="chevron-down" size={18} color="#64748b" />
            </TouchableOpacity>
            {Platform.OS === "ios" && showEndDatePicker && (
              <View className="mt-2">
                <DateTimePicker
                  value={effectiveEndDate || new Date()}
                  mode="date"
                  textColor="#475569"
                  display="spinner"
                  onChange={(_event, selectedDate) => {
                    if (selectedDate) setEffectiveEndDate(selectedDate);
                  }}
                  style={{ width: "100%" }}
                />
              </View>
            )}
          </View>
          {/* Assignment Options */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">Assignment</Text>
            <View className="flex-row items-center justify-between bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
              <Text className="text-slate-700">Assign to all users</Text>
              <TouchableOpacity
                onPress={() => setAssignedToAll(!assignedToAll)}
                className={`px-3 py-1 rounded-full ${assignedToAll ? "bg-orange-400" : "bg-slate-300"}`}
              >
                <Text className="text-white font-medium">{assignedToAll ? "Yes" : "No"}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {!assignedToAll && (
            <View className="mb-6">
              <Text className="text-sm font-semibold text-slate-600 mb-2">
                Select User <Text className="text-red-500">*</Text>
              </Text>
              <DropDownPicker
                listMode="SCROLLVIEW"
                open={userDropdownOpen}
                value={selectedUserId}
                items={userItems}
                setOpen={setUserDropdownOpen}
                setValue={setSelectedUserId}
                setItems={setUserItems}
                style={{
                  backgroundColor: "#f8fafc",
                  borderColor: "#f8fafc",
                  minHeight: 48,
                  borderRadius: 8,
                }}
                dropDownContainerStyle={{
                  backgroundColor: "#f8fafc",
                  borderColor: "#f8fafc",
                  borderRadius: 8,
                }}
                textStyle={{
                  fontSize: 14,
                  color: "#1e293b",
                }}
                placeholderStyle={{
                  color: "#94a3b8",
                }}
                zIndex={2000}
                zIndexInverse={2000}
                placeholder="Select a user to assign"
                ListEmptyComponent={() => (
                  <View className="p-3 items-center">
                    <Text className="text-slate-500">No available users to add</Text>
                  </View>
                )}
              />
            </View>
          )}
          {/* Save / Create Button */}
          <TouchableOpacity onPress={handleCreateSchedule} className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3 mt-12">
            <Text className="text-white font-bold text-base">{editingSchedule ? "Save Changes" : "Create Schedule"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => (editingSchedule ? setModalMode("actions") : closeModal())}
            className="border border-slate-200 py-3.5 rounded-lg w-full items-center"
          >
            <Text className="text-slate-600 font-bold text-base">Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    } else if (modalMode === "delete") {
      return (
        <View className="px-2 py-4">
          <View className="bg-slate-50 rounded-lg p-4 mb-4">
            {deleting ? (
              <View className="items-center py-4">
                <ActivityIndicator size="large" color="#f97316" />
                <Text className="text-slate-600 mt-3">Deleting schedule...</Text>
              </View>
            ) : (
              <>
                <Text className="text-lg font-bold text-slate-700 mb-2 text-center">Delete Schedule</Text>
                <Text className="text-slate-600 text-center mb-6">
                  Are you sure you want to delete the schedule for {editingSchedule?.shift?.shiftName || "this shift"}?
                </Text>
                <Animated.View style={{ transform: [{ scale: deleteButtonScale }] }}>
                  <TouchableOpacity
                    onPress={() => {
                      animateButtonPress(deleteButtonScale);
                      setTimeout(() => handleDeleteSchedule(), 100);
                    }}
                    className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3"
                  >
                    <Text className="text-white font-bold text-base">Yes, Delete</Text>
                  </TouchableOpacity>
                </Animated.View>
                <Animated.View style={{ transform: [{ scale: cancelButtonScale }] }}>
                  <TouchableOpacity
                    onPress={() => {
                      animateButtonPress(cancelButtonScale);
                      setTimeout(() => setModalMode("actions"), 100);
                    }}
                    className="border border-slate-200 py-3.5 rounded-lg w-full items-center"
                  >
                    <Text className="text-slate-600 font-bold text-base">Cancel</Text>
                  </TouchableOpacity>
                </Animated.View>
              </>
            )}
          </View>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {/* Header */}
        <View className="px-4 py-3 flex-row items-center border-b border-slate-200">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="chevron-back" size={24} color="#404040" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-700">Manage Shift Schedules</Text>
        </View>
        {/* Title and Add Button */}
        <View className="px-4 py-4 flex-row justify-between items-center">
          <Text className="text-2xl font-bold text-slate-700">Schedule List</Text>
          <Animated.View style={{ transform: [{ scale: addButtonScale }] }}>
            <TouchableOpacity
              onPress={() => {
                animateButtonPress(addButtonScale);
                setTimeout(() => openModal(null), 100);
              }}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <Ionicons name="add" size={24} color={"#404040"} />
            </TouchableOpacity>
          </Animated.View>
        </View>
        {/* Schedule List with Pull-to-Refresh */}
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#f97316" />
            <Text className="mt-4 text-slate-500">Loading schedules...</Text>
          </View>
        ) : (
          <FlatList
            data={schedules}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderScheduleItem}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#cbd5e1"]} tintColor={["#cbd5e1"]} />}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-16">
                <Ionicons name="calendar-outline" size={48} color="#94a3b8" />
                <Text className="mt-4 text-slate-500 text-center">No schedules found.</Text>
                <Text className="text-slate-400 text-center">Add your first schedule by tapping the + button.</Text>
              </View>
            }
          />
        )}
        {/* Bottom Sheet Modal */}
        {modalVisible && (
          <View className="absolute inset-0">
            <Animated.View className="absolute inset-0 bg-black/50" style={{ opacity: modalBgAnim }} onTouchEnd={closeModal} />
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
                minHeight: height * 0.7,
                maxHeight: Platform.OS === "ios" ? height * 0.7 : height * 0.85,
                paddingBottom: Platform.OS === "ios" ? 0 : 20,
              }}
            >
              <View className="items-center py-3" {...modalPanResponder.panHandlers}>
                <View className="w-10 h-1 bg-slate-200 rounded-lg" />
              </View>
              <View className="flex-row justify-center items-center px-5 pb-4 border-b border-slate-100">
                <Text className="text-lg font-bold text-slate-700">
                  {modalMode === "actions" ? "Schedule Actions" : editingSchedule ? "Edit Schedule" : "Create Schedule"}
                </Text>
              </View>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 10 }}>{renderModalContent()}</ScrollView>
            </Animated.View>
          </View>
        )}
      </Animated.View>

      {Platform.OS === "android" && androidDatePicker ? (
        <DateTimePicker
          value={
            androidDatePicker === "start"
              ? effectiveStartDate
              : effectiveEndDate || new Date()
          }
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            if (event?.type === "set" && selectedDate) {
              if (androidDatePicker === "start") setEffectiveStartDate(selectedDate);
              else setEffectiveEndDate(selectedDate);
            }
            setAndroidDatePicker(null);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
};

export default ManageShiftSchedule;
