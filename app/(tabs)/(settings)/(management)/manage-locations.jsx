// app/(tabs)/(settings)/(management)/manage-locations.jsx

"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
  TextInput,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import DropDownPicker from "react-native-dropdown-picker";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, Feather, MaterialIcons } from "@expo/vector-icons";
import { API_BASE_URL } from "../../../../config/constant";

const { height, width } = Dimensions.get("window");

export default function ManageLocations() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  // Data
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);

  // UI states
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The bottom-sheet style modal
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsLocation, setActionsLocation] = useState(null); // current location item

  // Which expanded section: "edit", "members", "delete" or null
  const [expandedSection, setExpandedSection] = useState(null);

  // Animated values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const modalYAnim = useRef(new Animated.Value(height)).current;

  // For listing
  const cardScales = useRef({}).current;
  const addButtonScale = useRef(new Animated.Value(1)).current;

  // Location form fields
  const [locationName, setLocationName] = useState("");
  const [latitude, setLatitude] = useState(14.5995);
  const [longitude, setLongitude] = useState(120.9842);
  const [radius, setRadius] = useState("500");

  // For the map region
  const [mapRegion, setMapRegion] = useState({
    latitude: 14.5995,
    longitude: 120.9842,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // Manage Members
  const [currentUsers, setCurrentUsers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownItems, setDropdownItems] = useState([]);

  // PanResponder for bottom sheet
  const actionsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          modalYAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeActionsModal();
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

  useEffect(() => {
    // Animate page in
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    const initialize = async () => {
      const storedToken = await SecureStore.getItemAsync("token");
      if (!storedToken) {
        Alert.alert("Authentication Error", "Please sign in again.");
        router.replace("(auth)/signin");
        return;
      }
      setToken(storedToken);
      await fetchLocations(storedToken);
      await fetchUsers(storedToken);
    };
    initialize();
  }, []);

  // Fetch all locations
  const fetchLocations = async (authToken) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/location`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setLocations(data.data);
      } else {
        Alert.alert("Error", data.error || "Failed to fetch locations.");
      }
    } catch (error) {
      console.error("Error fetching locations:", error);
      Alert.alert("Error", "An unexpected error occurred while fetching locations.");
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
    await fetchLocations(token);
    await fetchUsers(token);
    setRefreshing(false);
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

  // Open modal
  const openActionsModal = (loc) => {
    setActionsLocation(loc || null);

    if (loc) {
      // editing existing
      setLocationName(loc.name || "");
      setLatitude(Number(loc.latitude));
      setLongitude(Number(loc.longitude));
      setRadius(loc.radius?.toString() || "500");
      setMapRegion({
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      loadUsersForLocation(loc);
    } else {
      // new
      setLocationName("");
      setLatitude(14.5995);
      setLongitude(120.9842);
      setRadius("500");
      setMapRegion({
        latitude: 14.5995,
        longitude: 120.9842,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      setCurrentUsers([]);
      setAvailableUsers([]);
      setSelectedUserId(null);
      setDropdownItems([]);
    }
    setExpandedSection(null);

    setActionsModalVisible(true);
    modalYAnim.setValue(height);
    Animated.parallel([
      Animated.timing(modalBgAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(modalYAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start();
  };

  // Close modal
  const closeActionsModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(modalYAnim, { toValue: height, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setActionsModalVisible(false);
      setExpandedSection(null);
    });
  };

  // Load assigned / available users
  const loadUsersForLocation = async (loc) => {
    if (!token || !loc?.id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/location/${loc.id}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error || "Failed to get assigned users");
        return;
      }
      const assigned = data.data || [];
      setCurrentUsers(assigned);

      const assignedIds = assigned.map((u) => u.id);
      const available = users.filter((u) => !assignedIds.includes(u.id) && u.role !== "superadmin");
      setAvailableUsers(available);

      const dd = available.map((u) => ({
        label: u.email,
        value: u.id,
      }));
      setDropdownItems(dd);
      setSelectedUserId(null);
    } catch (error) {
      console.error("Error loading users for location:", error);
      Alert.alert("Error", "An unexpected error occurred loading location’s assigned users.");
    }
  };

  // Create/Update location
  const handleSaveLocation = async () => {
    if (!token) return;

    // Check required fields
    if (!locationName.trim()) {
      Alert.alert("Validation Error", "Location name is required.");
      return;
    }
    if (!latitude || !longitude) {
      Alert.alert("Validation Error", "Please pick valid latitude/longitude for this location.");
      return;
    }

    const numericRadius = Number(radius) || 500;
    const payload = {
      name: locationName.trim(),
      latitude,
      longitude,
      radius: numericRadius,
    };

    try {
      let url, method;
      if (actionsLocation?.id) {
        // update
        url = `${API_BASE_URL}/api/location/update/${actionsLocation.id}`;
        method = "PUT";
      } else {
        // create
        url = `${API_BASE_URL}/api/location/create`;
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
        Alert.alert("Success", data.message || "Location saved successfully.");
        closeActionsModal();
        fetchLocations(token);
        fetchUsers(token);
      } else {
        Alert.alert("Error", data.error || "Failed to save location.");
      }
    } catch (error) {
      console.error("Error saving location:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    }
  };

  // Assign user => local update
  const handleAssignUser = async () => {
    if (!selectedUserId) {
      Alert.alert("Validation Error", "Please select a user to add.");
      return;
    }
    if (!actionsLocation?.id) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/location/${actionsLocation.id}/assign-users`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds: [selectedUserId] }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success", data.message || "User assigned to location.");

        // local update
        const userObj = availableUsers.find((u) => u.id === selectedUserId);
        if (userObj) {
          setCurrentUsers((prev) => [...prev, userObj]);
          setAvailableUsers((prev) => prev.filter((u) => u.id !== selectedUserId));
        }
        setSelectedUserId(null);

        // optionally re-fetch
        fetchLocations(token);
        fetchUsers(token);
      } else {
        Alert.alert("Error", data.error || "Failed to assign user.");
      }
    } catch (error) {
      console.error("Error assigning user:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    }
  };

  // Remove user => local update
  const handleRemoveUser = async (userId) => {
    if (!actionsLocation?.id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/location/${actionsLocation.id}/remove-users`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds: [userId] }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success", data.message || "User removed from location.");

        // local update
        const userObj = currentUsers.find((u) => u.id === userId);
        if (userObj) {
          setAvailableUsers((prev) => [...prev, userObj]);
          setCurrentUsers((prev) => prev.filter((u) => u.id !== userId));
        }
        fetchLocations(token);
        fetchUsers(token);
      } else {
        Alert.alert("Error", data.error || "Failed to remove user.");
      }
    } catch (error) {
      console.error("Error removing user:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    }
  };

  // Delete location
  const handleDeleteLocation = async () => {
    if (!actionsLocation?.id || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/location/delete/${actionsLocation.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success", data.message || "Location deleted successfully.");
        fetchLocations(token);
        fetchUsers(token);
      } else {
        Alert.alert("Error", data.error || "Failed to delete location.");
      }
    } catch (error) {
      console.error("Error deleting location:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
      closeActionsModal();
    }
  };

  // Render each location item
  const renderLocation = ({ item, index }) => {
    if (!cardScales[index]) {
      cardScales[index] = new Animated.Value(1);
    }
    // how many assigned?
    const assignedCount = item.LocationRestriction?.filter((lr) => lr.restrictionStatus).length || 0;

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
              <Text className="text-base font-semibold text-slate-700">{item.name || "Untitled Location"}</Text>
              <Text className="text-sm text-slate-600 mt-1">
                Lat: {item.latitude}, Lng: {item.longitude}
              </Text>
              <Text className="text-sm text-slate-600 mt-1">Radius: {item.radius ?? 500}m</Text>
              <Text className="text-xs text-slate-500 mt-2">
                {assignedCount} assigned user{assignedCount !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
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
          <Text className="text-xl font-bold text-slate-700">Settings</Text>
        </View>

        {/* Title + Add button */}
        <View className="px-4 py-4 flex-row justify-between items-center">
          <Text className="text-2xl font-bold text-slate-700">Locations</Text>
          <Animated.View style={{ transform: [{ scale: addButtonScale }] }}>
            <TouchableOpacity
              onPress={() => {
                animateButtonPress(addButtonScale);
                setTimeout(() => openActionsModal(null), 100);
              }}
              className="w-10 h-10 rounded-lg items-center justify-center"
            >
              <Ionicons name="add" size={24} color="#404040" />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* List */}
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#cbd5e1" />
            <Text className="mt-4 text-slate-500">Loading locations...</Text>
          </View>
        ) : (
          <FlatList
            data={locations}
            keyExtractor={(item) => item.id}
            renderItem={renderLocation}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#cbd5e1"]} tintColor="#cbd5e1" />}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-16">
                <Feather name="map-pin" size={48} color="#94a3b8" />
                <Text className="mt-4 text-slate-500 text-center">No locations found.</Text>
                <Text className="text-slate-400 text-center">Tap + to add a location for punch radius checks.</Text>
              </View>
            }
          />
        )}
      </Animated.View>

      {/* Bottom Sheet for Actions */}
      {actionsModalVisible && (
        <View className="absolute inset-0">
          {/* Backdrop */}
          <Animated.View className="absolute inset-0 bg-black/50" style={{ opacity: modalBgAnim }} onTouchEnd={closeActionsModal} />
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
            }}
          >
            <View className="items-center py-3" {...actionsPanResponder.panHandlers}>
              <View className="w-10 h-1 bg-slate-200 rounded-lg" />
            </View>
            <View className="flex-row justify-between items-center px-5 pb-4 border-b border-slate-100">
              <Text className="text-lg font-bold text-slate-700">{actionsLocation?.id ? "Location Actions" : "Add Location"}</Text>
            </View>

            <ScrollView className="px-5 py-4" nestedScrollEnabled>
              {actionsLocation?.id ? (
                // If location exists => show main action menu first
                !expandedSection ? (
                  <>
                    <TouchableOpacity
                      onPress={() => setExpandedSection("edit")}
                      className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                    >
                      <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                          <Feather name="edit-2" size={18} color="#fff" />
                        </View>
                        <Text className="text-slate-700 font-medium">Edit Location</Text>
                      </View>
                      <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setExpandedSection("members")}
                      className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                    >
                      <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                          <Feather name="users" size={18} color="#fff" />
                        </View>
                        <Text className="text-slate-700 font-medium">Manage Assigned Users</Text>
                      </View>
                      <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setExpandedSection("delete")}
                      className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-lg"
                    >
                      <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                          <Feather name="trash-2" size={18} color="#fff" />
                        </View>
                        <Text className="text-slate-700 font-medium">Delete Location</Text>
                      </View>
                      <MaterialIcons name="keyboard-arrow-right" size={24} color="#64748b" />
                    </TouchableOpacity>
                  </>
                ) : expandedSection === "edit" ? (
                  <View className="bg-slate-50 rounded-lg p-4 mb-4">{renderEditLocationForm()}</View>
                ) : expandedSection === "members" ? (
                  <View className="bg-slate-50 rounded-lg p-4 mb-4">
                    <Text className="text-lg font-bold text-slate-700 mb-3">Manage Assigned Users</Text>
                    {renderManageMembersSection()}
                  </View>
                ) : expandedSection === "delete" ? (
                  <View className="bg-slate-50 rounded-lg p-4 mb-4">
                    <Text className="text-lg font-bold text-slate-700 mb-2 text-center">Delete Location</Text>
                    <Text className="text-slate-600 text-center mb-6">Are you sure you want to delete this location?</Text>
                    <TouchableOpacity onPress={handleDeleteLocation} className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3">
                      <Text className="text-white font-bold text-base">Yes, Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setExpandedSection(null)} className="border border-slate-200 py-3.5 rounded-lg w-full items-center">
                      <Text className="text-slate-600 font-bold text-base">Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              ) : (
                // Creating new => show the form
                <View className="bg-slate-50 rounded-lg p-4 mb-4">{renderEditLocationForm()}</View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );

  // ======== SUB-RENDERS ========

  function renderEditLocationForm() {
    const isEditing = !!actionsLocation?.id;

    return (
      <>
        {/* Required Name */}
        <Text className="text-sm font-semibold text-slate-600 mb-2">Location Name:</Text>
        <View className="bg-white rounded-lg px-4 py-3 mb-4">
          <TextInput value={locationName} onChangeText={setLocationName} placeholder="e.g. Main Office" placeholderTextColor="#9CA3AF" />
        </View>

        {/* Map */}
        <Text className="text-sm font-semibold text-slate-600 mb-2">Select Location on Map:</Text>
        <View className="h-64 w-full rounded-lg overflow-hidden mb-4">
          <MapView
            style={{ flex: 1 }}
            region={{
              latitude: Number(latitude),
              longitude: Number(longitude),
              latitudeDelta: mapRegion.latitudeDelta,
              longitudeDelta: mapRegion.longitudeDelta,
            }}
            onPress={(e) => {
              const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
              setLatitude(lat);
              setLongitude(lng);
            }}
          >
            <Marker
              coordinate={{ latitude: Number(latitude), longitude: Number(longitude) }}
              draggable
              onDragEnd={(e) => {
                const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
                setLatitude(lat);
                setLongitude(lng);
              }}
            />
          </MapView>
        </View>

        {/* Lat/Long side by side */}
        <View className="flex-row mb-4">
          {/* Latitude */}
          <View className="flex-1 bg-white rounded-lg px-4 py-3 mr-2">
            <Text className="text-sm font-semibold text-slate-600 mb-1">Latitude</Text>
            <TextInput
              keyboardType="decimal-pad"
              value={String(latitude)}
              onChangeText={(val) => {
                const parsed = parseFloat(val) || 0;
                setLatitude(parsed);
                setMapRegion((prev) => ({ ...prev, latitude: parsed }));
              }}
              placeholder="e.g. 14.5995"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Longitude */}
          <View className="flex-1 bg-white rounded-lg px-4 py-3">
            <Text className="text-sm font-semibold text-slate-600 mb-1">Longitude</Text>
            <TextInput
              keyboardType="decimal-pad"
              value={String(longitude)}
              onChangeText={(val) => {
                const parsed = parseFloat(val) || 0;
                setLongitude(parsed);
                setMapRegion((prev) => ({ ...prev, longitude: parsed }));
              }}
              placeholder="e.g. 120.9842"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Radius */}
        <Text className="text-sm font-semibold text-slate-600 mb-2">Allowed Radius (meters):</Text>
        <View className="bg-white rounded-lg px-4 py-3 mb-4">
          <TextInput
            keyboardType="decimal-pad"
            value={radius}
            onChangeText={(val) => setRadius(val)}
            placeholder="e.g. 500"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Save / Cancel */}
        <TouchableOpacity onPress={handleSaveLocation} className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3">
          <Text className="text-white font-bold text-base">{isEditing ? "Save Changes" : "Create Location"}</Text>
        </TouchableOpacity>

        {isEditing && (
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
        {/* Current Users */}
        <Text className="text-sm font-semibold text-slate-600 mb-2">Assigned Users:</Text>
        {currentUsers.length > 0 ? (
          <View className="bg-slate-50 rounded-lg p-2 mb-6">
            {currentUsers.map((u) => (
              <View key={u.id} className="flex-row items-center justify-between py-2 px-2 bg-white rounded-lg mb-2">
                <View>
                  <Text className="text-slate-700 font-medium">
                    {u.profile?.firstName} {u.profile?.lastName}
                  </Text>
                  <Text className="text-xs text-slate-500">{u.email}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveUser(u.id)} className="p-2">
                  <Feather name="minus" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View className="bg-slate-50 rounded-lg p-4 items-center mb-6">
            <Text className="text-slate-500">No users assigned to this location.</Text>
          </View>
        )}

        {/* Add User */}
        <Text className="text-sm font-semibold text-slate-600 mb-2">Add User:</Text>
        <DropDownPicker
          open={dropdownOpen}
          value={selectedUserId}
          items={dropdownItems}
          setOpen={setDropdownOpen}
          setValue={setSelectedUserId}
          setItems={setDropdownItems}
          placeholder="Select a user"
          style={{
            backgroundColor: "#fff",
            borderColor: "#fff",
            minHeight: 48,
            borderRadius: 12,
            marginBottom: 10,
          }}
          dropDownContainerStyle={{
            backgroundColor: "#fff",
            borderColor: "#fff",
            borderRadius: 12,
          }}
          textStyle={{
            fontSize: 14,
            color: "#404040",
          }}
          placeholderStyle={{
            color: "#404040",
          }}
          listMode="SCROLLVIEW"
          scrollViewProps={{ nestedScrollEnabled: true }}
        />

        <TouchableOpacity
          onPress={handleAssignUser}
          className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3"
          disabled={!selectedUserId}
          style={{ opacity: selectedUserId ? 1 : 0.6 }}
        >
          <Text className="text-white font-bold text-base">Add User</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setExpandedSection(null)} className="border border-slate-200 py-3.5 rounded-lg w-full items-center">
          <Text className="text-slate-600 font-bold text-base">Done</Text>
        </TouchableOpacity>
      </>
    );
  }
}
