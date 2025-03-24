// app/(tabs)/(settings)/(management)/manage-shift.jsx
"use client";

import { useState, useEffect, useRef } from "react";
// At the top, import Modal from react-native
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
  ScrollView,
  RefreshControl,
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons, Feather, MaterialIcons } from "@expo/vector-icons";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../../../config/constant";

const { height } = Dimensions.get("window");

const ManageShift = () => {
  const router = useRouter();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;
  // New animation refs for delete confirmation buttons
  const deleteButtonScale = useRef(new Animated.Value(1)).current;
  const cancelButtonScale = useRef(new Animated.Value(1)).current;

  // For the bottom-sheet modal
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const modalYAnim = useRef(new Animated.Value(height)).current;

  // Form state for creating a shift template
  const [shiftName, setShiftName] = useState("");
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [differentialMultiplier, setDifferentialMultiplier] = useState("1.0");

  // Inline time picker visibility toggles
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  // modalMode can be "actions", "edit", or now "delete"
  const [modalMode, setModalMode] = useState("actions");

  // List of created shift templates and loading/refreshing state
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // New deleting state for shift deletion
  const [deleting, setDeleting] = useState(false);

  // Card animations
  const cardScales = useRef({}).current;

  // PanResponder for bottom sheet
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

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${API_BASE_URL}/api/shifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data.data) {
        setShifts(res.data.data);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to fetch shifts.");
    } finally {
      setLoading(false);
    }
  };

  // Pull-to-refresh function
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchShifts();
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

    fetchShifts();
  }, []);

  const openModal = (shift = null) => {
    if (shift) {
      setEditingShift(shift);
      setModalMode("actions");
    } else {
      resetForm();
      setEditingShift(null);
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
      // Hide inline pickers when closing the modal
      setShowStartTimePicker(false);
      setShowEndTimePicker(false);
    });
  };

  const resetForm = () => {
    setShiftName("");
    setStartTime(new Date());
    setEndTime(new Date());
    setDifferentialMultiplier("1.0");
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
  };

  const handleEditShift = () => {
    if (editingShift) {
      setShiftName(editingShift.shiftName);
      setStartTime(new Date(editingShift.startTime));
      setEndTime(new Date(editingShift.endTime));
      setDifferentialMultiplier(editingShift.differentialMultiplier.toString());
      setModalMode("edit");
    }
  };

  // Updated handleDeleteShift to include a deleting state
  const handleDeleteShift = async () => {
    if (!editingShift) return;

    try {
      setDeleting(true);
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.delete(`${API_BASE_URL}/api/shifts/${editingShift.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 200) {
        Alert.alert("Success", "Shift deleted successfully.");
        closeModal();
        fetchShifts();
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to delete shift.");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateShift = async () => {
    if (!shiftName.trim()) {
      Alert.alert("Validation", "Please enter a shift name.");
      return;
    }
    try {
      const token = await SecureStore.getItemAsync("token");
      const payload = {
        shiftName: shiftName.trim(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        differentialMultiplier: Number.parseFloat(differentialMultiplier),
      };

      let url = `${API_BASE_URL}/api/shifts/create`;
      let method = "post";

      if (editingShift) {
        url = `${API_BASE_URL}/api/shifts/${editingShift.id}`;
        method = "put";
      }

      const res = await axios[method](url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 201 || res.status === 200) {
        Alert.alert("Success", editingShift ? "Shift updated successfully." : "Shift created successfully.");
        resetForm();
        closeModal();
        fetchShifts();
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to save shift.");
    }
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

  const renderShiftItem = ({ item, index }) => {
    if (!cardScales[index]) {
      cardScales[index] = new Animated.Value(1);
    }

    // Compute total hours. Convert start and end to Date objects.
    const shiftStart = new Date(item.startTime);
    const shiftEnd = new Date(item.endTime);
    let diff = shiftEnd.getTime() - shiftStart.getTime();
    if (diff < 0) {
      // Assume shift passes midnight – add 24 hours
      diff += 24 * 60 * 60 * 1000;
    }
    const totalHours = (diff / (1000 * 60 * 60)).toFixed(2);

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
          <View className="flex-row justify-between items-center">
            <View className="flex-1">
              <View className="flex-row justify-between items-center">
                <Text className="text-base font-semibold text-slate-700">{item.shiftName}</Text>
                <Text className="text-sm text-slate-600">{totalHours} hrs</Text>
              </View>
              <View className="flex-row items-center mt-1">
                <Ionicons name="time-outline" size={14} color="#64748b" />
                <Text className="ml-1 text-slate-600 text-sm">
                  {shiftStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                  {shiftEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              <View className="flex-row items-center mt-1">
                <MaterialIcons name="attach-money" size={14} color="#64748b" />
                <Text className="ml-1 text-slate-600 text-sm">Multiplier: {item.differentialMultiplier}</Text>
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
            <Text className="text-lg font-semibold text-slate-700 mb-2">{editingShift?.shiftName} Shift</Text>
            <Text className="text-xs  text-slate-500 mb-auto">id: {editingShift?.id} </Text>
          </View>
          <TouchableOpacity onPress={handleEditShift} className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                <Feather name="edit-2" size={18} color="#ffff" />
              </View>
              <Text className="text-slate-700 font-medium">Edit Shift</Text>
            </View>
            <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
          </TouchableOpacity>

          {/* Modified Delete Shift button to set modalMode to "delete" */}
          <TouchableOpacity onPress={() => setModalMode("delete")} className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                <Feather name="trash-2" size={18} color="#ffff" />
              </View>
              <Text className="text-slate-700 font-medium">Delete Shift</Text>
            </View>
            <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
          </TouchableOpacity>
        </View>
      );
    } else if (modalMode === "edit") {
      return (
        <View className="px-2 py-4">
          {/* Shift Name Field */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">
              Shift Name <Text className="text-red-500">*</Text>
            </Text>
            <View className="flex-row items-center bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
              <Feather name="briefcase" size={18} color="#64748b" />
              <TextInput
                className="flex-1 ml-2 text-slate-700"
                value={shiftName}
                onChangeText={setShiftName}
                placeholder="e.g. Morning Shift, Night Shift"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          {/* Start Time Field */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">
              Start Time <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setShowStartTimePicker(!showStartTimePicker)}
              className="flex-row items-center bg-slate-50 rounded-lg px-4 py-3.5 border border-slate-100"
            >
              <Ionicons name="time-outline" size={18} color="#64748b" />
              <Text className="flex-1 ml-2 text-slate-700">{startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
            </TouchableOpacity>
            {showStartTimePicker && (
              <View className="mt-2">
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  is24Hour={false}
                  textColor="#334155"
                  display="spinner"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) setStartTime(selectedDate);
                  }}
                  style={{ width: "100%" }}
                />
              </View>
            )}
          </View>

          {/* End Time Field */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">
              End Time <Text className="text-red-500">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setShowEndTimePicker(!showEndTimePicker)}
              className="flex-row items-center bg-slate-50 rounded-lg px-4 py-3.5 border border-slate-100"
            >
              <Ionicons name="time-outline" size={18} color="#64748b" />
              <Text className="flex-1 ml-2 text-slate-700">{endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
            </TouchableOpacity>
            {showEndTimePicker && (
              <View className="mt-2">
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  is24Hour={false}
                  textColor="#334155"
                  display="spinner"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) setEndTime(selectedDate);
                  }}
                  style={{ width: "100%" }}
                />
              </View>
            )}
          </View>

          {/* Differential Multiplier Field */}
          <View className="mb-6">
            <Text className="text-sm font-semibold text-slate-600 mb-2">Differential Multiplier</Text>
            <View className="flex-row items-center bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
              <MaterialIcons name="attach-money" size={18} color="#64748b" />
              <TextInput
                className="flex-1 ml-2 text-slate-700"
                value={differentialMultiplier}
                onChangeText={setDifferentialMultiplier}
                placeholder="1.0"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
              />
            </View>
          </View>

          <TouchableOpacity onPress={handleCreateShift} className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3">
            <Text className="text-white font-bold text-base">{editingShift ? "Save Changes" : "Create Shift"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => (editingShift ? setModalMode("actions") : closeModal())}
            className="border border-slate-200 py-3.5 rounded-lg w-full items-center"
          >
            <Text className="text-slate-600 font-bold text-base">Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    } else if (modalMode === "delete") {
      // New Delete Confirmation UI
      return (
        <View className="px-2 py-4">
          <View className="bg-slate-50 rounded-lg p-4 mb-4">
            {deleting ? (
              <View className="items-center py-4">
                <ActivityIndicator size="large" color="#f97316" />
                <Text className="text-slate-600 mt-3">Deleting shift...</Text>
              </View>
            ) : (
              <>
                <Text className="text-lg font-bold text-slate-700 mb-2 text-center">Delete Shift</Text>
                <Text className="text-slate-600 text-center mb-6">Are you sure you want to delete {editingShift?.shiftName} shift?</Text>
                <Animated.View style={{ transform: [{ scale: deleteButtonScale }] }}>
                  <TouchableOpacity
                    onPress={() => {
                      animateButtonPress(deleteButtonScale);
                      setTimeout(() => handleDeleteShift(), 100);
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
          <Text className="text-xl font-bold text-slate-700">Manage Shifts</Text>
        </View>

        {/* Title and Add Button */}
        <View className="px-4 py-4 flex-row justify-between items-center">
          <Text className="text-2xl font-bold text-slate-700">Shift Templates</Text>
          <Animated.View style={{ transform: [{ scale: addButtonScale }] }}>
            <TouchableOpacity
              onPress={() => {
                animateButtonPress(addButtonScale);
                setTimeout(() => openModal(null), 100);
              }}
              className="w-10 h-10 rounded-full items-center justify-center "
            >
              <Ionicons name="add" size={24} color={"#404040"} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Shift List with Pull-to-Refresh */}
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={"#cbd5e1"} />
            <Text className="mt-4 text-slate-500">Loading shifts...</Text>
          </View>
        ) : (
          <FlatList
            data={shifts}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderShiftItem}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#cbd5e1"]} tintColor={["#cbd5e1"]} />}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-16">
                <Ionicons name="time-outline" size={48} color="#94a3b8" />
                <Text className="mt-4 text-slate-500 text-center">No shifts found.</Text>
                <Text className="text-slate-400 text-center">Add your first shift by tapping the + button.</Text>
              </View>
            }
          />
        )}

        {/* Bottom Sheet Modal for Shift Actions/Edit/Delete */}
        {modalVisible && (
          <View className="absolute inset-0">
            {/* Dim backdrop */}
            <Animated.View className="absolute inset-0 bg-black/50" style={{ opacity: modalBgAnim }} onTouchEnd={closeModal} />
            {/* Bottom Sheet */}
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
              {/* Drag Handle */}
              <View className="items-center py-3" {...modalPanResponder.panHandlers}>
                <View className="w-10 h-1 bg-slate-200 rounded-lg" />
              </View>
              {/* Modal Header */}
              <View className="flex-row justify-center items-center px-5 pb-4 border-b border-slate-100">
                <Text className="text-lg font-bold text-slate-700">
                  {modalMode === "actions" ? "Shift Actions" : editingShift ? (modalMode === "edit" ? "Edit Shift" : "Delete Shift") : "Create Shift"}
                </Text>
              </View>
              {/* Scrollable Modal Content */}
              <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 10 }}>{renderModalContent()}</ScrollView>
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
};

export default ManageShift;
