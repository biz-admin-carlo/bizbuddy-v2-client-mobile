// app/(tabs)(settings)/(management)/manage-departments.jsx

import { useEffect, useState, useRef } from "react";
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
  Animated,
  PanResponder,
  Dimensions,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons, Feather, FontAwesome5, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import DropDownPicker from "react-native-dropdown-picker";
import { API_BASE_URL } from "../../../../config/constant";

const { height } = Dimensions.get("window");

export default function Departments() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // For the "actions" modal
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsDepartment, setActionsDepartment] = useState(null);

  // Which section is open/expanded in the modal? "edit", "members", "delete", or null
  const [expandedSection, setExpandedSection] = useState(null);

  // Department form fields
  const [deptName, setDeptName] = useState("");
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");

  // Manage members
  const [currentUsers, setCurrentUsers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);

  // For "Add Member" dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownItems, setDropdownItems] = useState([]);

  // For "Edit Department" => supervisor dropdown
  const [supervisorDropdownOpen, setSupervisorDropdownOpen] = useState(false);
  const [supervisorOptions, setSupervisorOptions] = useState([]);

  // For card "bounce" effect
  const cardScales = useRef({}).current;

  // Animations for page
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // For the bottom-sheet modal
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const actionsModalY = useRef(new Animated.Value(Platform.OS === "ios" ? 700 : 500)).current;

  // For "delete" + "cancel" button press animations
  const deleteButtonScale = useRef(new Animated.Value(1)).current;
  const cancelButtonScale = useRef(new Animated.Value(1)).current;

  // For "Add Department" button bounce
  const addButtonScale = useRef(new Animated.Value(1)).current;

  // Animate any pressed button
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

  // PanResponder for bottom sheet
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

  // Basic validation for dept name
  const validateDeptName = (name) => /^[a-zA-Z0-9 ]+$/.test(name);

  useEffect(() => {
    // Fade + Slide on mount
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
      await fetchDepartments(storedToken);
      await fetchUsers(storedToken);
    };
    initialize();
  }, []);

  // Fetch departments
  const fetchDepartments = async (authToken) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/departments`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setDepartments(data.data);
      } else {
        Alert.alert("Error", data.error || "Failed to fetch departments.");
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
      Alert.alert("Error", "An unexpected error occurred while fetching departments.");
    }
    setLoading(false);
  };

  // Fetch all users
  const fetchUsers = async (authToken) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/employee`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setUsers(data.data);
      } else {
        Alert.alert("Error", data.error || "Failed to fetch users.");
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      Alert.alert("Error", "An unexpected error occurred while fetching users.");
    }
  };

  // Pull to refresh
  const onRefresh = async () => {
    if (!token) return;
    setRefreshing(true);
    await fetchDepartments(token);
    await fetchUsers(token);
    setRefreshing(false);
  };

  // Render each department with bounce effect
  const renderDepartment = ({ item, index }) => {
    if (!cardScales[index]) {
      cardScales[index] = new Animated.Value(1);
    }
    const memberCount = users.filter((user) => user.department && user.department.id === item.id).length;

    return (
      <Animated.View style={{ transform: [{ scale: cardScales[index] }] }}>
        <TouchableOpacity
          onPress={() => {
            animateButtonPress(cardScales[index]);
            setTimeout(() => openActionsModal(item), 100);
          }}
          activeOpacity={0.8}
          className="p-4 mb-3 rounded-lg bg-slate-50"
        >
          <View className="flex-row justify-between items-center">
            <View className="flex-1">
              <View className="flex flex-row justify justify-between ">
                <Text className="text-base font-semibold text-slate-700 capitalize">{item.name}</Text>
                <View className="mt-2 flex-row items-center mb-auto">
                  <Feather name="user" size={14} color="#64748b" />
                  <Text className="ml-1 text-xs text-slate-500">{memberCount} members</Text>
                </View>
              </View>

              {item.supervisor ? (
                <View className="flex-row items-center mt-1 -ml-1">
                  <View className="bg-orange-400 rounded-lg py-1 px-2 mr-1">
                    <Text className="text-xs text-white">Supervisor</Text>
                  </View>
                  <Text className="text-sm text-slate-600 my-auto">{item.supervisor.email}</Text>
                </View>
              ) : (
                <Text className="text-sm text-slate-500 italic mt-1">No supervisor assigned</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Open the "actions" modal
  const openActionsModal = (dept) => {
    setActionsDepartment(dept || null);

    if (dept) {
      // existing department => load fields
      setDeptName(dept.name);
      setSelectedSupervisorId(dept.supervisor ? dept.supervisor.id : "");
      loadUsersForDepartment(dept);
    } else {
      // new department => blank
      setDeptName("");
      setSelectedSupervisorId("");
      setCurrentUsers([]);
      setAvailableUsers([]);
      setSelectedUserId(null);
      setDropdownItems([]);
    }

    // Rebuild the "supervisorOptions"
    const supOptions = [
      { label: "No Supervisor", value: "" },
      ...users
        .filter((u) => u.role.toLowerCase() === "supervisor")
        .map((u) => ({
          label: u.email,
          value: u.id,
        })),
    ];
    setSupervisorOptions(supOptions);

    setExpandedSection(null);
    setActionsModalVisible(true);

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

  // Re-fill the "currentUsers" and "availableUsers" (like your original code)
  const loadUsersForDepartment = (dept) => {
    const current = users.filter((user) => user.department && user.department.id === dept.id);
    const available = users.filter((user) => (!user.department || user.department.id !== dept.id) && user.role !== "superadmin");
    setCurrentUsers(current);
    setAvailableUsers(available);
    const ddData = available.map((user) => ({
      label: user.email,
      value: user.id,
    }));
    setDropdownItems(ddData);
    setSelectedUserId(null);
  };

  // Save (edit / create) department
  const handleSaveDepartment = async () => {
    if (!deptName.trim()) {
      Alert.alert("Validation Error", "Department name is required.");
      return;
    }
    if (!validateDeptName(deptName.trim())) {
      Alert.alert("Validation Error", "Department name must be alphanumeric (spaces allowed).");
      return;
    }
    if (!token) return;

    try {
      const payload = {
        name: deptName.trim(),
        supervisorId: selectedSupervisorId || null,
      };

      let url, method;
      if (actionsDepartment?.id) {
        // update
        url = `${API_BASE_URL}/api/departments/update/${actionsDepartment.id}`;
        method = "PUT";
      } else {
        // create
        url = `${API_BASE_URL}/api/departments/create`;
        method = "POST";
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
        Alert.alert("Success", actionsDepartment?.id ? "Department updated successfully." : "Department created successfully.");
        closeActionsModal();
        fetchDepartments(token);
        fetchUsers(token);
      } else {
        Alert.alert("Error", data.error || "Failed to save department.");
      }
    } catch (error) {
      console.error("Error saving department:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    }
  };

  // ***** KEY PART: Immediate local updates for add/remove members *****

  // Add user => local update, then optionally re-fetch
  const handleAssignUser = async () => {
    if (!selectedUserId) {
      Alert.alert("Validation Error", "Please select a user to add.");
      return;
    }
    try {
      const url = `${API_BASE_URL}/api/departments/${actionsDepartment.id}/assign-users`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds: [selectedUserId] }),
      });
      const data = await res.json();

      if (res.ok) {
        Alert.alert("Success", "User added to department successfully.");

        // 1) Immediate local update:
        const userObj = availableUsers.find((u) => u.id === selectedUserId);
        if (userObj) {
          setCurrentUsers((prev) => [...prev, userObj]);
          setAvailableUsers((prev) => prev.filter((u) => u.id !== selectedUserId));
        }
        setSelectedUserId(null);

        // 2) Optionally re-fetch so everything is eventually in sync:
        fetchDepartments(token);
        fetchUsers(token);
        // DO NOT re-run loadUsersForDepartment(actionsDepartment) right away,
        // or it might pull stale data from the server and overwrite your local update.
      } else {
        Alert.alert("Error", data.error || "Failed to add user.");
      }
    } catch (error) {
      console.error("Error assigning user:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    }
  };

  // Remove user => local update, then optionally re-fetch
  const handleRemoveUser = async (userId) => {
    try {
      const url = `${API_BASE_URL}/api/departments/${actionsDepartment.id}/remove-users`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds: [userId] }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success", data.message || "User removed successfully.");

        // 1) Immediate local update:
        const userObj = currentUsers.find((u) => u.id === userId);
        if (userObj) {
          setAvailableUsers((prev) => [...prev, userObj]);
          setCurrentUsers((prev) => prev.filter((u) => u.id !== userId));
        }

        // 2) Re-fetch for total sync
        fetchDepartments(token);
        fetchUsers(token);
        // Again, skip calling loadUsersForDepartment immediately,
        // to avoid pulling any stale data from the server.
      } else {
        Alert.alert("Error", data.error || "Failed to remove user.");
      }
    } catch (error) {
      console.error("Error removing user:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    }
  };

  // Delete department
  const handleDeleteDepartment = async () => {
    if (!actionsDepartment || !token) return;

    try {
      setDeleting(true);
      const res = await fetch(`${API_BASE_URL}/api/departments/delete/${actionsDepartment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success", data.message || "Department deleted successfully.");
        fetchDepartments(token);
        fetchUsers(token);
      } else {
        Alert.alert("Error", data.error || "Failed to delete department.");
      }
    } catch (error) {
      console.error("Error deleting department:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setDeleting(false);
      closeActionsModal();
    }
  };

  // Render the main UI
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
          <Text className="text-xl font-bold text-slate-700">Settings</Text>
        </View>

        {/* Title and Add Button */}
        <View className="px-4 py-4 flex-row justify-between items-center">
          <Text className="text-2xl font-bold text-slate-700">Department List</Text>
          <Animated.View style={{ transform: [{ scale: addButtonScale }] }}>
            <TouchableOpacity
              onPress={() => {
                animateButtonPress(addButtonScale);
                setTimeout(() => openActionsModal(null), 100);
              }}
              className="w-10 h-10 rounded-lg items-center justify-center "
            >
              <Ionicons name="add" size={24} color={"#404040"} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Department List */}
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={"#cbd5e1"} />
            <Text className="mt-4 text-slate-500">Loading departments...</Text>
          </View>
        ) : (
          <FlatList
            data={departments}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderDepartment}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#cbd5e1"]} tintColor={["#cbd5e1"]} />}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-16">
                <Ionicons name="git-branch-outline" size={48} color="#94a3b8" />
                <Text className="mt-4 text-slate-500 text-center">No departments found.</Text>
                <Text className="text-slate-400 text-center">Add your first department by tapping the + button.</Text>
              </View>
            }
          />
        )}

        {/* Bottom Sheet Actions Modal */}
        {actionsModalVisible && (
          <View className="absolute inset-0">
            {/* Dim backdrop */}
            <Animated.View className="absolute inset-0 bg-black/50" style={{ opacity: modalBgAnim }} onTouchEnd={closeActionsModal} />
            {/* Actual Bottom Sheet */}
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
              <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
                <Text className="text-lg font-bold text-slate-700">{actionsDepartment?.id ? "Department Actions" : "Add Department"}</Text>
              </View>

              <ScrollView className="px-5 py-4">
                {/* If we have an existing department => show action menu first. Otherwise, show "Edit" form to create new. */}
                {actionsDepartment?.id ? (
                  <>
                    {/* If expandedSection is null => main action menu */}
                    {!expandedSection && (
                      <>
                        {/* "Edit" */}
                        <TouchableOpacity
                          onPress={() => setExpandedSection("edit")}
                          className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                        >
                          <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                              <Feather name="edit-2" size={18} color="#ffff" />
                            </View>
                            <Text className="text-slate-700 font-medium">Edit Department</Text>
                          </View>
                          <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
                        </TouchableOpacity>

                        {/* "Manage Members" */}
                        <TouchableOpacity
                          onPress={() => setExpandedSection("members")}
                          className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                        >
                          <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                              <Feather name="users" size={18} color="#ffff" />
                            </View>
                            <Text className="text-slate-700 font-medium">Manage Members</Text>
                          </View>
                          <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
                        </TouchableOpacity>

                        {/* "Delete" */}
                        <TouchableOpacity
                          onPress={() => setExpandedSection("delete")}
                          className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                        >
                          <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                              <Feather name="trash-2" size={18} color="#ffff" />
                            </View>
                            <Text className="text-slate-700 font-medium">Delete Department</Text>
                          </View>
                          <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
                        </TouchableOpacity>
                      </>
                    )}

                    {/* Expand: Edit Department */}
                    {expandedSection === "edit" && (
                      <View className="bg-slate-50 rounded-lg p-4 mb-4">
                        <Text className="text-lg font-bold text-slate-700 mb-3">Edit Department</Text>
                        {renderEditDepartmentForm()}
                      </View>
                    )}

                    {/* Expand: Manage Members */}
                    {expandedSection === "members" && (
                      <View className="bg-slate-50 rounded-lg p-4 mb-4">
                        <Text className="text-lg font-bold text-slate-700 mb-3">Manage Members</Text>
                        {renderManageMembersSection()}
                      </View>
                    )}

                    {/* Expand: Delete Department */}
                    {expandedSection === "delete" && (
                      <View className="bg-slate-50 rounded-lg p-4 mb-4">
                        {deleting ? (
                          <View className="items-center py-4">
                            <ActivityIndicator size="large" color="#f97316" />
                            <Text className="text-slate-600 mt-3">Deleting department...</Text>
                          </View>
                        ) : (
                          <>
                            <Text className="text-lg font-bold text-slate-700 mb-2 text-center">Delete Department</Text>
                            <Text className="text-slate-600 text-center mb-6">Are you sure you want to delete {actionsDepartment.name} department?</Text>
                            <Animated.View style={{ transform: [{ scale: deleteButtonScale }] }}>
                              <TouchableOpacity
                                onPress={() => {
                                  animateButtonPress(deleteButtonScale);
                                  setTimeout(() => handleDeleteDepartment(), 100);
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
                                  setTimeout(() => setExpandedSection(null), 100);
                                }}
                                className="border border-slate-200 py-3.5 rounded-lg w-full items-center"
                              >
                                <Text className="text-slate-600 font-bold text-base">Cancel</Text>
                              </TouchableOpacity>
                            </Animated.View>
                          </>
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  // Creating a new department => skip straight to "Edit Department" form
                  <View className="bg-slate-50 rounded-lg p-4 mb-4">
                    <Text className="text-lg font-bold text-slate-700 mb-3">Add Department</Text>
                    {renderEditDepartmentForm()}
                  </View>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );

  // === RENDER SUB-SECTIONS ===

  function renderEditDepartmentForm() {
    return (
      <>
        {/* Department Name */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-slate-600 mb-2">
            Department Name <Text className="text-red-500">*</Text>
          </Text>
          <View className="flex-row items-center bg-white rounded-lg px-4 py-3">
            <FontAwesome5 name="building" size={18} color="#9ca3af" />
            <TextInput
              className="flex-1 ml-2 text-slate-700"
              value={deptName}
              onChangeText={setDeptName}
              placeholder="e.g. Sales, Marketing, IT"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <Text className="text-xs text-slate-500 mt-1">Only letters, numbers, and spaces are allowed.</Text>
        </View>

        {/* Supervisor Dropdown */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-slate-600 mb-2">Supervisor:</Text>
          <DropDownPicker
            open={supervisorDropdownOpen}
            value={selectedSupervisorId}
            items={supervisorOptions}
            setOpen={setSupervisorDropdownOpen}
            setValue={setSelectedSupervisorId}
            setItems={setSupervisorOptions}
            placeholder="Select Supervisor"
            style={{
              backgroundColor: "#ffff",
              borderColor: "#ffff",
              minHeight: 48,
            }}
            dropDownContainerStyle={{
              backgroundColor: "#ffff",
              borderColor: "#ffff",
            }}
            textStyle={{
              fontSize: 14,
              color: "#404040",
            }}
            placeholderStyle={{
              color: "#404040",
            }}
            zIndex={11000}
            zIndexInverse={1000}
            dropDownDirection="BOTTOM"
            listMode="SCROLLVIEW"
            scrollViewProps={{ nestedScrollEnabled: true }}
            Icon={() => <Ionicons name="chevron-down" size={20} color="#374151" />}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity onPress={handleSaveDepartment} className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3">
          <Text className="text-white font-bold text-base">{actionsDepartment?.id ? "Save Changes" : "Create Department"}</Text>
        </TouchableOpacity>

        {/* If editing existing => show a "Cancel" button to go back to main menu */}
        {actionsDepartment?.id && (
          <TouchableOpacity onPress={() => setExpandedSection(null)} className="border border-slate-200 py-3.5 rounded-lg w-full items-center">
            <Text className="text-slate-600 font-bold text-base">Cancel</Text>
          </TouchableOpacity>
        )}
      </>
    );
  }

  function renderManageMembersSection() {
    return (
      <>
        {/* Current Members */}
        <Text className="text-sm font-semibold text-slate-600 mb-2">Current Members:</Text>
        {currentUsers.length > 0 ? (
          <View className="bg-slate-50 rounded-lg p-2 mb-6">
            {currentUsers.map((user) => (
              <View key={user.id} className="flex-row items-center justify-between py-2 px-2 bg-white rounded-lg mb-2">
                <View className="flex-row items-center">
                  <View className="rounded-lg bg-orange-100 items-center justify-center mr-3">
                    <Text className="text-orange-700 font-medium capitalize p-2">
                      {user.profile.firstName.charAt(0)}
                      {user.profile.lastName.charAt(0)}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-slate-700 font-medium capitalize">
                      {user.profile.firstName} {user.profile.lastName}
                    </Text>
                    <Text className="text-xs text-slate-500">{user.email}</Text>
                    <Text className="text-xs text-slate-500">{user.username}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleRemoveUser(user.id)} className="p-2">
                  <Feather name="minus" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View className="bg-slate-50 rounded-lg p-4 items-center mb-6">
            <Text className="text-slate-500">No members assigned to this department.</Text>
          </View>
        )}

        {/* Add Member */}
        <Text className="text-sm font-semibold text-slate-600 mb-2">Add Member:</Text>
        <View className="mb-6">
          <DropDownPicker
            open={dropdownOpen}
            value={selectedUserId}
            items={dropdownItems}
            setOpen={setDropdownOpen}
            setValue={setSelectedUserId}
            setItems={setDropdownItems}
            placeholder="Select User"
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
              color: "#3f3f46",
            }}
            placeholderStyle={{
              color: "#3f3f46",
            }}
            zIndex={3000}
            zIndexInverse={1000}
            listMode="SCROLLVIEW"
            scrollViewProps={{ nestedScrollEnabled: true }}
            ListEmptyComponent={() => (
              <View className="p-3 items-center">
                <Text className="text-slate-500">No available users to add</Text>
              </View>
            )}
          />
        </View>
        <TouchableOpacity
          onPress={handleAssignUser}
          className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3"
          disabled={!selectedUserId}
          style={{ opacity: selectedUserId ? 1 : 0.6 }}
        >
          <Text className="text-white font-bold text-base">Add Member</Text>
        </TouchableOpacity>

        {/* Cancel Button => return to actions menu */}
        <TouchableOpacity onPress={() => setExpandedSection(null)} className="border border-slate-200 py-3.5 rounded-lg w-full items-center">
          <Text className="text-slate-600 font-bold text-base">Done</Text>
        </TouchableOpacity>
      </>
    );
  }
}
