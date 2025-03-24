// app/(tabs)/(settings)/(management)/manage-employees.jsx

"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  TouchableOpacity,
  Platform,
  RefreshControl,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import DropDownPicker from "react-native-dropdown-picker";
import { API_BASE_URL } from "../../../../config/constant";

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

export default function Employees() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [companyDepartments, setCompanyDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Instead of a separate "editModalVisible" and "selectedEmployee," we now use:
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsEmployee, setActionsEmployee] = useState(null);

  // Which section is expanded in the actions modal? ("edit", "delete", or null)
  const [expandedSection, setExpandedSection] = useState(null);

  // Fields for editing/creating an employee
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("employee");
  const [departmentId, setDepartmentId] = useState("");

  // Dropdown states
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleItems, setRoleItems] = useState([
    { label: "Employee", value: "employee" },
    { label: "Supervisor", value: "supervisor" },
    { label: "Admin", value: "admin" },
  ]);

  const [deptOpen, setDeptOpen] = useState(false);
  const [deptItems, setDeptItems] = useState([]);

  // For entry card "bounce" animation
  const cardScales = useRef({}).current;

  // Global anims for the modal fade/slide
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;

  // For the bottom sheet actions modal
  const actionsModalY = useRef(new Animated.Value(Platform.OS === "ios" ? 700 : 500)).current;

  // For press animations
  const buttonScale = useRef(new Animated.Value(1)).current;
  const deleteButtonScale = useRef(new Animated.Value(1)).current;
  const cancelButtonScale = useRef(new Animated.Value(1)).current;

  // Validate password
  const validatePassword = (pwd) => {
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{6,}$/;
    return regex.test(pwd);
  };

  // Animate button press (bounce effect)
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

  // PanResponder for our "bottom sheet" style modal
  const actionsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          actionsModalY.setValue(gestureState.dy);
        } else if (gestureState.dy < 0) {
          const newPosition = Math.max(gestureState.dy, -300);
          actionsModalY.setValue(newPosition);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeActionsModal();
        } else if (gestureState.dy < -50) {
          Animated.spring(actionsModalY, {
            toValue: -300,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(actionsModalY, {
            toValue: 0,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    // Page load animations
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
      const storedToken = await SecureStore.getItemAsync("token");
      if (!storedToken) {
        Alert.alert("Authentication Error", "Please sign in again.");
        router.replace("(auth)/signin");
        return;
      }
      setToken(storedToken);
      await fetchEmployees(storedToken);
      await fetchCompanyDepartments(storedToken);
    };
    initialize();
  }, []);

  const fetchEmployees = async (authToken) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/employee`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setEmployees(data.data);
      } else {
        Alert.alert("Error", data.error || "Failed to fetch employees.");
      }
    } catch (error) {
      console.error("Error fetching employees:", error);
      Alert.alert("Error", "An unexpected error occurred while fetching employees.");
    }
    setLoading(false);
  };

  const fetchCompanyDepartments = async (authToken) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/departments`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setCompanyDepartments(data.data);
        // Prepare dept items for the dropdown
        const items = data.data.map((dept) => ({
          label: dept.name,
          value: dept.id,
        }));
        setDeptItems(items);
      } else {
        Alert.alert("Error", data.error || "Failed to fetch departments.");
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
      Alert.alert("Error", "An unexpected error occurred while fetching departments.");
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    if (!token) return;
    setRefreshing(true);
    await fetchEmployees(token);
    await fetchCompanyDepartments(token);
    setRefreshing(false);
  };

  // Open the "actions" modal
  const openActionsModal = (employee) => {
    setActionsEmployee(employee);

    if (employee) {
      // populate form
      setUsername(employee.username || "");
      setFirstName(employee.profile.firstName || "");
      setLastName(employee.profile.lastName || "");
      setEmail(employee.email || "");
      setRole(employee.role || "employee");
      setDepartmentId(employee.department ? employee.department.id : "");
      setPassword("");
    } else {
      // new employee form
      setUsername("");
      setFirstName("");
      setLastName("");
      setEmail("");
      setRole("employee");
      setDepartmentId("");
      setPassword("");
    }

    setExpandedSection(null); // show the main "action choice" buttons
    setActionsModalVisible(true);

    // Reset position before anim
    actionsModalY.setValue(Platform.OS === "ios" ? 700 : 500);

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

  // Close the modal
  const closeActionsModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(actionsModalY, {
        toValue: Platform.OS === "ios" ? 700 : 500,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setActionsModalVisible(false);
      setExpandedSection(null);
    });
  };

  // Handle Save
  const handleSaveEmployee = async () => {
    if (!username.trim() || !email.trim() || !firstName.trim() || !lastName.trim()) {
      Alert.alert("Validation Error", "Username, Email, First Name, and Last Name are required.");
      return;
    }

    // If creating new or changing password, validate
    if (!actionsEmployee || password) {
      if (!validatePassword(password)) {
        Alert.alert(
          "Validation Error",
          "Password must be at least 6 characters long and include at least one uppercase letter, one number, and one symbol."
        );
        return;
      }
    }

    if (!token) return;

    try {
      let url, method;
      const payload = {
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        departmentId: departmentId || null,
      };
      if (password) {
        payload.password = password;
      }

      if (!actionsEmployee) {
        // create
        url = `${API_BASE_URL}/api/employee`;
        method = "POST";
      } else {
        // update
        url = `${API_BASE_URL}/api/employee/${actionsEmployee.id}`;
        method = "PUT";
      }

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        Alert.alert("Success", actionsEmployee ? "Employee updated successfully." : "Employee created successfully.");
        closeActionsModal();
        fetchEmployees(token);
      } else {
        Alert.alert("Error", data.error || "Failed to save employee.");
      }
    } catch (error) {
      console.error("Error saving employee:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    }
  };

  // Handle Delete
  const handleDeleteEmployee = async () => {
    if (!actionsEmployee || !token) return;

    try {
      setDeleting(true);
      const res = await fetch(`${API_BASE_URL}/api/employee/${actionsEmployee.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success", data.message || "Employee deleted successfully.");
        fetchEmployees(token);
      } else {
        Alert.alert("Error", data.error || "Failed to delete employee.");
      }
    } catch (error) {
      console.error("Error deleting employee:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setDeleting(false);
      closeActionsModal();
    }
  };

  /// Inside renderEmployee:
  const renderEmployee = ({ item, index }) => {
    if (!cardScales[index]) {
      cardScales[index] = new Animated.Value(1);
    }
    const fullName = `${item.profile.firstName || ""} ${item.profile.lastName || ""}`.trim();

    return (
      <Animated.View style={{ transform: [{ scale: cardScales[index] }] }}>
        <TouchableOpacity
          onPress={() => {
            animateButtonPress(cardScales[index]);
            setTimeout(() => openActionsModal(item), 100);
          }}
          activeOpacity={0.8}
          className="p-4 mb-3 rounded-lg bg-slate-50 flex flex-col"
        >
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-base font-semibold text-slate-700 capitalize">{fullName}</Text>
            <View className="bg-orange-400 rounded-lg px-2 py-0.5">
              <Text className="text-xs text-white font-medium">{item.role}</Text>
            </View>
          </View>

          <Text className="text-sm text-slate-600 mb-0.5">Email: {item.email}</Text>
          {/* Safely handle null/undefined department */}
          <Text className="text-sm text-slate-600 capitalize">Department: {item.department?.name ?? "None"}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Slide in & fade in on page mount */}
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
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-700">Settings</Text>
        </View>

        {/* Title + Add Button */}
        <View className="px-4 py-4 flex-row justify-between items-center">
          <Text className="text-2xl font-bold text-slate-700">Employee List</Text>
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              onPress={() => {
                animateButtonPress(buttonScale);
                setTimeout(() => openActionsModal(null), 100);
              }}
              className="w-10 h-10 rounded-lg items-center justify-center "
            >
              <Ionicons name="add" size={24} color={"#404040"} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Employee List */}
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={"#cbd5e1"} />
            <Text className="mt-4 text-slate-500">Loading employees...</Text>
          </View>
        ) : (
          <FlatList
            data={employees}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderEmployee}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#cbd5e1"]} tintColor={["#cbd5e1"]} />}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-16">
                <Ionicons name="people-outline" size={48} color={COLORS.textLight} />
                <Text className="mt-4 text-slate-500 text-center">No employees found.</Text>
                <Text className="text-slate-400 text-center">Add your first employee by tapping the + button.</Text>
              </View>
            }
          />
        )}

        {/* Actions Modal (like in Departments) */}
        {actionsModalVisible && (
          <View className="absolute inset-0">
            {/* Fade BG */}
            <Animated.View className="absolute inset-0 bg-black/50" style={{ opacity: modalBgAnim }} onTouchEnd={closeActionsModal} />
            {/* Bottom Sheet */}
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
              {/* Grab handle */}
              <View className="items-center py-3" {...actionsPanResponder.panHandlers}>
                <View className="w-10 h-1 bg-slate-200 rounded-full" />
              </View>

              <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
                <Text className="text-lg font-bold text-slate-700">{actionsEmployee?.id ? "Employee Actions" : "Add Employee"}</Text>
                <TouchableOpacity onPress={closeActionsModal}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView className="px-5 py-4">
                {/* If there is an existing employee => show "Actions" first.
                    If no employee => automatically jump to "Edit" section. */}
                {actionsEmployee?.id ? (
                  <>
                    {/* If expandedSection is null => show 2 big buttons (Edit / Delete). */}
                    {!expandedSection && (
                      <View>
                        <TouchableOpacity
                          onPress={() => setExpandedSection("edit")}
                          className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                        >
                          <Text className="text-slate-700 font-medium">Edit Employee</Text>
                          <Feather name="chevron-right" size={20} color="#64748b" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => setExpandedSection("delete")}
                          className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                        >
                          <Text className="text-slate-700 font-medium">Delete Employee</Text>
                          <Feather name="chevron-right" size={20} color="#64748b" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* If expandedSection === 'edit' => show the form */}
                    {expandedSection === "edit" && (
                      <View className="bg-slate-50 rounded-lg p-4 mb-3">
                        <Text className="text-lg font-bold text-slate-700 mb-3">Edit Employee</Text>
                        {renderEmployeeForm()}
                      </View>
                    )}

                    {/* If expandedSection === 'delete' => show confirmation */}
                    {expandedSection === "delete" && (
                      <View className="bg-slate-50 rounded-lg p-4 mb-3 ">
                        <Text className="text-lg font-bold text-slate-700 mb-4 text-center">Delete Employee</Text>
                        {deleting ? (
                          <View className="items-center py-4">
                            <ActivityIndicator size="large" color={COLORS.primary} />
                            <Text className="text-slate-600 mt-3 text-center">Deleting employee...</Text>
                          </View>
                        ) : (
                          <>
                            <Text className="text-slate-600 mb-4 text-center">
                              Are you sure you want to delete {actionsEmployee.profile.firstName} {actionsEmployee.profile.lastName}?
                            </Text>
                            <Animated.View style={{ transform: [{ scale: deleteButtonScale }] }}>
                              <TouchableOpacity
                                onPress={() => {
                                  animateButtonPress(deleteButtonScale);
                                  setTimeout(() => handleDeleteEmployee(), 100);
                                }}
                                className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3"
                              >
                                <Text className="text-white font-semibold text-lg">Yes, Delete Employee</Text>
                              </TouchableOpacity>
                            </Animated.View>
                            <Animated.View style={{ transform: [{ scale: cancelButtonScale }] }}>
                              <TouchableOpacity
                                onPress={() => {
                                  animateButtonPress(cancelButtonScale);
                                  setTimeout(() => setExpandedSection(null), 100);
                                }}
                                className="border border-slate-200 py-3.5 rounded-lg w-full items-center"
                              >
                                <Text className="text-slate-700 font-semibold text-lg">Cancel</Text>
                              </TouchableOpacity>
                            </Animated.View>
                          </>
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  // If adding a brand new employee => no "actions" screen, jump right to "edit" form
                  <View className="bg-slate-50 rounded-lg p-4 mb-3">
                    <Text className="text-lg font-bold text-slate-700 mb-3">Add New Employee</Text>
                    {renderEmployeeForm()}
                  </View>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );

  // Helper to render the "edit/create" form
  function renderEmployeeForm() {
    return (
      <>
        {/* Username */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-600 mb-2">
            Username <Text className="text-red-500">*</Text>
          </Text>
          <View className="flex-row items-center  bg-white rounded-xl px-3 py-3">
            <Feather name="user" size={18} color="#64748b" />
            <TextInput
              className="flex-1 ml-2 text-slate-700"
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* First Name */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-600 mb-2">
            First Name <Text className="text-red-500">*</Text>
          </Text>
          <View className="flex-row items-center bg-white rounded-xl px-3 py-3">
            <Feather name="user" size={18} color="#64748b" />
            <TextInput
              className="flex-1 ml-2 text-slate-700"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Enter first name"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Last Name */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-600 mb-2">
            Last Name <Text className="text-red-500">*</Text>
          </Text>
          <View className="flex-row items-center  bg-white rounded-xl px-3 py-3">
            <Feather name="user" size={18} color="#64748b" />
            <TextInput
              className="flex-1 ml-2 text-slate-700"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Enter last name"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Email */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-600 mb-2">
            Email <Text className="text-red-500">*</Text>
          </Text>
          <View className="flex-row items-center  bg-white rounded-xl px-3 py-3">
            <MaterialCommunityIcons name="email-outline" size={18} color="#64748b" />
            <TextInput
              className="flex-1 ml-2 text-slate-700"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter email address"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Password */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-600 mb-2">
            {actionsEmployee ? "New Password (optional)" : "Password"}
            {!actionsEmployee && <Text className="text-red-500"> *</Text>}
          </Text>
          <View className="flex-row items-center bg-white rounded-xl px-3 py-3">
            <MaterialCommunityIcons name="lock-outline" size={18} color="#64748b" />
            <TextInput
              className="flex-1 ml-2 text-slate-700"
              value={password}
              onChangeText={setPassword}
              placeholder={actionsEmployee ? "Leave blank to keep current" : "Enter password"}
              placeholderTextColor="#9CA3AF"
              secureTextEntry
            />
          </View>
          <Text className="text-xs text-slate-500 mt-1">Must contain at least 6 characters with 1 uppercase, 1 number, and 1 symbol.</Text>
        </View>

        {/* Role */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-600 mb-2">Role</Text>
          <DropDownPicker
            open={roleOpen}
            value={role}
            items={roleItems}
            setOpen={setRoleOpen}
            setValue={setRole}
            setItems={setRoleItems}
            placeholder="Select Role"
            style={{
              backgroundColor: "#ffff",
              borderColor: "#ffff",
              minHeight: 48,
              borderRadius: 12,
            }}
            dropDownContainerStyle={{
              backgroundColor: "#ffff",
              borderColor: "#ffff",
              borderRadius: 12,
            }}
            textStyle={{
              fontSize: 14,
              color: "#1E293B",
            }}
            placeholderStyle={{
              color: "#9CA3AF",
            }}
            zIndex={3000}
            zIndexInverse={1000}
            listMode="SCROLLVIEW"
            scrollViewProps={{
              nestedScrollEnabled: true,
            }}
          />
        </View>

        {/* Department */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-slate-600 mb-2">Department</Text>
          <DropDownPicker
            open={deptOpen}
            value={departmentId}
            items={deptItems}
            setOpen={setDeptOpen}
            setValue={setDepartmentId}
            setItems={setDeptItems}
            placeholder="Select Department"
            style={{
              backgroundColor: "#ffff",
              borderColor: "#ffff",
              minHeight: 48,
              borderRadius: 12,
            }}
            dropDownContainerStyle={{
              backgroundColor: "#ffff",
              borderColor: "#ffff",
              borderRadius: 12,
            }}
            textStyle={{
              fontSize: 14,
              color: "#1E293B",
            }}
            placeholderStyle={{
              color: "#9CA3AF",
            }}
            zIndex={2000}
            zIndexInverse={2000}
            listMode="SCROLLVIEW"
            scrollViewProps={{
              nestedScrollEnabled: true,
            }}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity onPress={handleSaveEmployee} className="bg-orange-400 py-3.5 px-8 rounded-lg mb-3 ">
          <Text className="text-white font-semibold text-lg text-center">{actionsEmployee ? "Save Changes" : "Create Employee"}</Text>
        </TouchableOpacity>

        {/* Cancel Button (go back to action choice) if editing existing employee */}
        {actionsEmployee?.id && (
          <TouchableOpacity onPress={() => setExpandedSection(null)} className="py-3.5 rounded-lg w-full items-center border border-slate-200">
            <Text className="text-slate-700 font-semibold text-lg text-center">Cancel</Text>
          </TouchableOpacity>
        )}
      </>
    );
  }
}
