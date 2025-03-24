// app/(tabs)/(shifts)/timekeeping-punch.jsx

"use client";

import { useState, useEffect, useRef } from "react";
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
  Modal,
  Platform,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import * as Location from "expo-location";
import io from "socket.io-client";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../../config/constant";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PENDING_ACTIONS_KEY = "pendingPunchActions";

// Offline queue helpers
const storePendingAction = async (action) => {
  try {
    const existing = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
    const pending = existing ? JSON.parse(existing) : [];
    pending.push(action);
    await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(pending));
  } catch {}
};

const getPendingActions = async () => {
  try {
    const existing = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch {
    return [];
  }
};

const clearPendingActions = async () => {
  try {
    await AsyncStorage.removeItem(PENDING_ACTIONS_KEY);
  } catch {}
};

const { width, height } = Dimensions.get("window");

// Gathers device info + current location (if available)
const getPunchData = async () => {
  const deviceInfo = {
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    modelName: Device.modelName,
    modelId: Device.modelId,
    osName: Device.osName,
    osVersion: Device.osVersion,
    deviceName: Device.deviceName,
  };

  let locationData = null;
  const { status } = await Location.requestForegroundPermissionsAsync();
  const servicesEnabled = await Location.hasServicesEnabledAsync();

  // If user denies or location is off, locationData stays null
  if (status === "granted" && servicesEnabled) {
    locationData = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
  }

  const location = locationData
    ? {
        latitude: locationData.coords.latitude,
        longitude: locationData.coords.longitude,
      }
    : {
        latitude: null,
        longitude: null,
      };

  return { deviceInfo, location };
};

export default function TimekeepingPunch() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Time in/out states
  const [isTimeIn, setIsTimeIn] = useState(false);
  const [punchTime, setPunchTime] = useState(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Coffee break states
  const [isCoffeeBreakActive, setIsCoffeeBreakActive] = useState(false);
  const [coffeeBreakCount, setCoffeeBreakCount] = useState(0);
  const [coffeeBreakStartTime, setCoffeeBreakStartTime] = useState(null);
  const [totalCoffeeTime, setTotalCoffeeTime] = useState(0);

  // Lunch break states
  const [isLunchBreakActive, setIsLunchBreakActive] = useState(false);
  const [lunchBreakStartTime, setLunchBreakStartTime] = useState(null);
  const [totalLunchTime, setTotalLunchTime] = useState(0);

  // Connectivity & subscription
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [wifiConnected, setWifiConnected] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState(null);

  // Whether the user is location restricted
  const [isLocationRestricted, setIsLocationRestricted] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const coffeeButtonScale = useRef(new Animated.Value(1)).current;
  const lunchButtonScale = useRef(new Animated.Value(1)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const modalYAnim = useRef(new Animated.Value(height)).current;

  // Bottom-sheet modals
  const [networkModalVisible, setNetworkModalVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);

  // Timer reference
  const masterTimerRef = useRef(null);

  // Socket
  const socketRef = useRef(null);

  // Single interval for session + break timers
  useEffect(() => {
    if (isTimeIn) {
      if (masterTimerRef.current) clearInterval(masterTimerRef.current);
      masterTimerRef.current = setInterval(() => {
        if (punchTime) {
          const elapsed = Math.floor((Date.now() - punchTime.getTime()) / 1000);
          setSessionElapsed(elapsed);
        }
        if (isCoffeeBreakActive && coffeeBreakStartTime) {
          const coffeeElapsed = Math.floor((Date.now() - coffeeBreakStartTime.getTime()) / 1000);
          setTotalCoffeeTime(coffeeElapsed);
        }
        if (isLunchBreakActive && lunchBreakStartTime) {
          const lunchElapsed = Math.floor((Date.now() - lunchBreakStartTime.getTime()) / 1000);
          setTotalLunchTime(lunchElapsed);
        }
      }, 1000);
    } else {
      if (masterTimerRef.current) clearInterval(masterTimerRef.current);
    }

    return () => {
      if (masterTimerRef.current) clearInterval(masterTimerRef.current);
    };
  }, [isTimeIn, punchTime, isCoffeeBreakActive, coffeeBreakStartTime, isLunchBreakActive, lunchBreakStartTime]);

  // Fetch subscription plan
  const fetchSubscription = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await axios.get(`${API_BASE_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data?.data?.subscription?.plan) {
        setSubscriptionPlan(res.data.data.subscription.plan.name);
      }
    } catch {}
  };

  // Check if user is location restricted
  const fetchAssignedLocations = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      // This endpoint returns the location(s) that the user is restricted to
      const res = await axios.get(`${API_BASE_URL}/api/location/assigned`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data?.data) {
        const assignedLocs = res.data.data;
        setIsLocationRestricted(assignedLocs.length > 0);
      }
    } catch (error) {
      // If error, assume not restricted for fallback
      setIsLocationRestricted(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
    fetchAssignedLocations();
  }, []);

  // PanResponder for bottom-sheet drag
  const modalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) modalYAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100) closeModal();
        else {
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

  // Animate "On the Clock" if isTimeIn
  useEffect(() => {
    if (isTimeIn) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isTimeIn]);

  // Fade + slide in on mount
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
  }, []);

  // Listen for net connectivity changes
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setWifiConnected(state.isConnected && state.isInternetReachable);
    });
    return () => unsub();
  }, []);

  // On mount, check if there's an active log
  useEffect(() => {
    const checkActiveLog = async () => {
      try {
        const token = await SecureStore.getItemAsync("token");
        if (!token) return;
        const res = await axios.get(`${API_BASE_URL}/api/timelogs/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 200 && res.data.data) {
          const activeLog = res.data.data.find((log) => log.status === true);
          if (activeLog) {
            setIsTimeIn(true);
            const ti = new Date(activeLog.timeIn);
            setPunchTime(ti);
            setSessionElapsed(Math.floor((Date.now() - ti.getTime()) / 1000));

            if (Array.isArray(activeLog.coffeeBreaks)) {
              setCoffeeBreakCount(activeLog.coffeeBreaks.length);
              const lastCoffee = activeLog.coffeeBreaks[activeLog.coffeeBreaks.length - 1];
              if (lastCoffee && !lastCoffee.end) {
                setIsCoffeeBreakActive(true);
                const cStart = new Date(lastCoffee.start);
                setCoffeeBreakStartTime(cStart);
                setTotalCoffeeTime(Math.floor((Date.now() - cStart.getTime()) / 1000));
              } else {
                setIsCoffeeBreakActive(false);
                setCoffeeBreakStartTime(null);
                setTotalCoffeeTime(0);
              }
            }
            if (activeLog.lunchBreak && activeLog.lunchBreak.start && !activeLog.lunchBreak.end) {
              setIsLunchBreakActive(true);
              const lStart = new Date(activeLog.lunchBreak.start);
              setLunchBreakStartTime(lStart);
              setTotalLunchTime(Math.floor((Date.now() - lStart.getTime()) / 1000));
            }
          }
        }
      } catch {}
    };
    checkActiveLog();
  }, []);

  // Socket real-time updates
  useEffect(() => {
    const initSocket = async () => {
      try {
        const userId = await SecureStore.getItemAsync("userId");
        if (!userId) return;
        socketRef.current = io(API_BASE_URL, { transports: ["websocket"] });
        socketRef.current.emit("joinUserRoom", userId);

        socketRef.current.on("timeLogUpdated", (data) => {
          if (data.type === "timeIn") {
            setIsTimeIn(true);
            const actualIn = new Date(data.data.timeIn);
            setPunchTime(actualIn);
            setSessionElapsed(Math.floor((Date.now() - actualIn.getTime()) / 1000));
          } else if (data.type === "timeOut") {
            resetAllStates();
          } else if (data.type === "coffeeBreakStart") {
            setIsCoffeeBreakActive(true);
            const now = new Date();
            setCoffeeBreakStartTime(now);
            setTotalCoffeeTime(0);
          } else if (data.type === "coffeeBreakEnd") {
            setIsCoffeeBreakActive(false);
            setCoffeeBreakStartTime(null);
            setCoffeeBreakCount((p) => p + 1);
            setTotalCoffeeTime(0);
          } else if (data.type === "lunchBreakStart") {
            setIsLunchBreakActive(true);
            const now = new Date();
            setLunchBreakStartTime(now);
            setTotalLunchTime(0);
          } else if (data.type === "lunchBreakEnd") {
            setIsLunchBreakActive(false);
            setLunchBreakStartTime(null);
            setTotalLunchTime(0);
          }
        });

        socketRef.current.on("subscriptionUpdated", () => {
          fetchSubscription();
        });
      } catch {}
    };
    initSocket();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // Check location permission
  const updateLocationStatus = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    const sv = await Location.hasServicesEnabledAsync();
    setLocationEnabled(status === "granted" && sv);
  };
  useEffect(() => {
    updateLocationStatus();
  }, []);

  // Offline sync
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      setWifiConnected(state.isConnected && state.isInternetReachable);
      if (state.isConnected && state.isInternetReachable) {
        const pending = await getPendingActions();
        if (pending.length > 0) {
          for (const action of pending) {
            try {
              const token = await SecureStore.getItemAsync("token");
              const url = `${API_BASE_URL}/api/timelogs${action.endpoint}`;
              await axios.post(url, action.payload, {
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
              });
            } catch {}
          }
          await clearPendingActions();
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Reset all states
  const resetAllStates = () => {
    setIsTimeIn(false);
    setPunchTime(null);
    setSessionElapsed(0);
    setIsCoffeeBreakActive(false);
    setCoffeeBreakStartTime(null);
    setCoffeeBreakCount(0);
    setTotalCoffeeTime(0);
    setIsLunchBreakActive(false);
    setLunchBreakStartTime(null);
    setTotalLunchTime(0);
  };

  // Animate button press
  const animateButtonPress = (scaleRef) => {
    Animated.sequence([
      Animated.timing(scaleRef, { toValue: 0.95, duration: 70, useNativeDriver: true }),
      Animated.spring(scaleRef, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
    ]).start();
  };

  // Format time to HH:MM:SS
  const formatTime = (secs = 0) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Refresh user logs
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${API_BASE_URL}/api/timelogs/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data.data) {
        const activeLog = res.data.data.find((log) => log.status === true);
        if (activeLog) {
          setIsTimeIn(true);
          const ti = new Date(activeLog.timeIn);
          setPunchTime(ti);
          setSessionElapsed(Math.floor((Date.now() - ti.getTime()) / 1000));
          if (Array.isArray(activeLog.coffeeBreaks)) {
            setCoffeeBreakCount(activeLog.coffeeBreaks.length);
            const lastCoffee = activeLog.coffeeBreaks[activeLog.coffeeBreaks.length - 1];
            if (lastCoffee && !lastCoffee.end) {
              setIsCoffeeBreakActive(true);
              const cStart = new Date(lastCoffee.start);
              setCoffeeBreakStartTime(cStart);
              setTotalCoffeeTime(Math.floor((Date.now() - cStart.getTime()) / 1000));
            } else {
              setIsCoffeeBreakActive(false);
              setCoffeeBreakCount(0);
              setCoffeeBreakStartTime(null);
              setTotalCoffeeTime(0);
            }
          } else {
            setIsCoffeeBreakActive(false);
            setCoffeeBreakCount(0);
            setCoffeeBreakStartTime(null);
            setTotalCoffeeTime(0);
          }
          if (activeLog.lunchBreak && activeLog.lunchBreak.start && !activeLog.lunchBreak.end) {
            setIsLunchBreakActive(true);
            const lStart = new Date(activeLog.lunchBreak.start);
            setLunchBreakStartTime(lStart);
            setTotalLunchTime(Math.floor((Date.now() - lStart.getTime()) / 1000));
          } else {
            setIsLunchBreakActive(false);
            setLunchBreakStartTime(null);
            setTotalLunchTime(0);
          }
        } else {
          resetAllStates();
        }
      }
      updateLocationStatus();
      fetchAssignedLocations(); // re-check location restrictions
    } catch {}
    setRefreshing(false);
  };

  // Time In/Out (with localTimestamp)
  const handlePunch = async () => {
    try {
      if (isTimeIn && (isCoffeeBreakActive || isLunchBreakActive)) {
        Alert.alert("Cannot Time Out", "Please end your active break first.");
        return;
      }
      animateButtonPress(buttonScale);
      setLoading(true);

      // If user is location restricted, we DO NOT allow offline punching.
      if (isLocationRestricted && !wifiConnected) {
        setLoading(false);
        Alert.alert("Cannot Punch Offline", "You are location-restricted and must be online with location enabled to Time In or Time Out.");
        return;
      }

      // If offline + not pro => block
      if (!wifiConnected && (subscriptionPlan || "").toLowerCase() !== "pro") {
        setLoading(false);
        Alert.alert("Offline Punch Not Allowed", "Your plan requires internet connection for punching.");
        return;
      }

      const token = await SecureStore.getItemAsync("token");
      const endpoint = isTimeIn ? "/time-out" : "/time-in";
      const { deviceInfo, location } = await getPunchData();

      // If location is restricted but location is missing => block
      if (isLocationRestricted && (!location.latitude || !location.longitude)) {
        setLoading(false);
        Alert.alert("Location Required", "Location services are disabled. Please enable location to Time In/Out.");
        return;
      }

      // This is the local date/time for the punch
      const localTimestamp = new Date().toISOString();

      const payload = {
        deviceInfo,
        location,
        localTimestamp,
      };

      // If user is offline and plan=pro => store offline
      if (!wifiConnected) {
        await storePendingAction({ endpoint, payload });
        Alert.alert("Offline Mode", "Your punch action is saved locally.");

        // Update local UI
        if (!isTimeIn) {
          const now = new Date();
          setPunchTime(now);
          setSessionElapsed(0);
          setIsTimeIn(true);
          setIsCoffeeBreakActive(false);
          setCoffeeBreakCount(0);
          setCoffeeBreakStartTime(null);
          setTotalCoffeeTime(0);
          setIsLunchBreakActive(false);
          setLunchBreakStartTime(null);
          setTotalLunchTime(0);
        } else {
          resetAllStates();
        }
      } else {
        // If user is online => normal punch
        const url = `${API_BASE_URL}/api/timelogs${endpoint}`;
        try {
          const res = await axios.post(url, payload, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 200 || res.status === 201) {
            Alert.alert("Success", res.data.message);
            if (!isTimeIn) {
              const now = new Date();
              setIsTimeIn(true);
              setPunchTime(now);
              setSessionElapsed(0);
              setIsCoffeeBreakActive(false);
              setCoffeeBreakCount(0);
              setCoffeeBreakStartTime(null);
              setTotalCoffeeTime(0);
              setIsLunchBreakActive(false);
              setLunchBreakStartTime(null);
              setTotalLunchTime(0);
            } else {
              resetAllStates();
            }
          }
        } catch (err) {
          if (err?.response?.data?.message) {
            Alert.alert("Error", err.response.data.message);
          } else {
            Alert.alert("Error", "Punch failed. Please try again.");
          }
        }
      }
    } catch (err) {
      Alert.alert("Error", "Punch failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Coffee Break (no offline)
  const handleCoffeeBreak = async () => {
    try {
      if (!isTimeIn) {
        Alert.alert("Coffee Break", "You must be timed in first.");
        return;
      }
      if (isLocationRestricted && !wifiConnected) {
        Alert.alert("Offline Break Not Allowed", "You are location-restricted and must be online with location enabled.");
        return;
      }
      if (!wifiConnected) {
        Alert.alert("Offline Break Not Allowed", "Coffee breaks can only be done when online.");
        return;
      }
      animateButtonPress(coffeeButtonScale);
      setLoading(true);

      const token = await SecureStore.getItemAsync("token");
      const { deviceInfo, location } = await getPunchData();

      // If location is missing but user restricted => block
      if (isLocationRestricted && (!location.latitude || !location.longitude)) {
        setLoading(false);
        Alert.alert("Location Required", "Please enable location services to start/end a break.");
        return;
      }

      const endpoint = isCoffeeBreakActive ? "/coffee-break/end" : "/coffee-break/start";
      const payload = { deviceInfo, location };

      try {
        const url = `${API_BASE_URL}/api/timelogs${endpoint}`;
        const res = await axios.post(url, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 200) {
          Alert.alert("Success", res.data.message);
          if (isCoffeeBreakActive) {
            setIsCoffeeBreakActive(false);
            setCoffeeBreakStartTime(null);
            setCoffeeBreakCount((p) => p + 1);
            setTotalCoffeeTime(0);
          } else {
            setIsCoffeeBreakActive(true);
            const now = new Date();
            setCoffeeBreakStartTime(now);
            setTotalCoffeeTime(0);
          }
        }
      } catch (err) {
        if (err?.response?.data?.message) {
          Alert.alert("Error", err.response.data.message);
        } else {
          Alert.alert("Error", "Failed to start/end coffee break.");
        }
      }
    } catch (err) {
      Alert.alert("Error", "Coffee break failed.");
    } finally {
      setLoading(false);
    }
  };

  // Lunch Break (no offline)
  const handleLunchBreak = async () => {
    try {
      if (!isTimeIn) {
        Alert.alert("Lunch Break", "You must be timed in first.");
        return;
      }
      if (isLocationRestricted && !wifiConnected) {
        Alert.alert("Offline Break Not Allowed", "You are location-restricted and must be online with location enabled.");
        return;
      }
      if (!wifiConnected) {
        Alert.alert("Offline Break Not Allowed", "Lunch breaks can only be done when online.");
        return;
      }
      animateButtonPress(lunchButtonScale);
      setLoading(true);

      const token = await SecureStore.getItemAsync("token");
      const { deviceInfo, location } = await getPunchData();

      if (isLocationRestricted && (!location.latitude || !location.longitude)) {
        setLoading(false);
        Alert.alert("Location Required", "Please enable location services to start/end a lunch break.");
        return;
      }

      const endpoint = isLunchBreakActive ? "/lunch-break/end" : "/lunch-break/start";
      const payload = { deviceInfo, location };

      try {
        const url = `${API_BASE_URL}/api/timelogs${endpoint}`;
        const res = await axios.post(url, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 200) {
          Alert.alert("Success", res.data.message);
          if (isLunchBreakActive) {
            setIsLunchBreakActive(false);
            setLunchBreakStartTime(null);
            setTotalLunchTime(0);
          } else {
            setIsLunchBreakActive(true);
            const now = new Date();
            setLunchBreakStartTime(now);
            setTotalLunchTime(0);
          }
        }
      } catch (err) {
        if (err?.response?.data?.message) {
          Alert.alert("Error", err.response.data.message);
        } else {
          Alert.alert("Error", "Failed to start/end lunch break.");
        }
      }
    } catch {
      Alert.alert("Error", "Lunch break failed.");
    } finally {
      setLoading(false);
    }
  };

  // Open modals
  const openModal = (type) => {
    if (type === "network") setNetworkModalVisible(true);
    else if (type === "location") setLocationModalVisible(true);
    else if (type === "subscription") setSubscriptionModalVisible(true);

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

  // Close modals
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
      setNetworkModalVisible(false);
      setLocationModalVisible(false);
      setSubscriptionModalVisible(false);
    });
  };

  // Modal content
  const renderModalContent = () => {
    if (networkModalVisible) {
      return (
        <View className="p-5">
          <Text className="text-xl font-bold text-slate-800 mb-4 text-center">Network Details</Text>
          <View className="bg-slate-50 rounded-xl p-4 mb-6">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                <Ionicons name="wifi" size={20} color="#f97316" />
              </View>
              <Text className="text-lg font-semibold text-slate-700">{wifiConnected ? "Connected" : "Disconnected"}</Text>
            </View>
            <Text className="text-base text-slate-700">
              Internet is required to sync time logs unless you have Pro (time in/out only). Location-restricted users must also have location enabled.
            </Text>
          </View>
          <TouchableOpacity onPress={closeModal} className="bg-orange-400 py-3.5 rounded-xl items-center justify-center" activeOpacity={0.8}>
            <Text className="text-white font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      );
    } else if (locationModalVisible) {
      return (
        <View className="p-5">
          <Text className="text-xl font-bold text-slate-800 mb-4 text-center">Location Services</Text>
          <View className="bg-slate-50 rounded-xl p-4 mb-6">
            <View className="flex-row items-center mb-4">
              <View className={`w-10 h-10 rounded-full ${locationEnabled ? "bg-orange-100" : "bg-slate-100"} items-center justify-center mr-3`}>
                <Ionicons name="location" size={20} color="#f97316" />
              </View>
              <Text className="text-lg font-semibold text-slate-700">{locationEnabled ? "Enabled" : "Disabled"}</Text>
            </View>
            <Text className="text-base text-slate-700">We only request your location for Time In/Out if needed. This is not continuous tracking.</Text>
          </View>
          <TouchableOpacity onPress={closeModal} className="bg-orange-400 py-3.5 rounded-xl items-center justify-center" activeOpacity={0.8}>
            <Text className="text-white font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      );
    } else if (subscriptionModalVisible) {
      return (
        <View className="p-5">
          <Text className="text-xl font-bold text-slate-800 mb-4 text-center">Package Details</Text>
          <View className="bg-slate-50 rounded-xl p-4 mb-6">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                <Ionicons name="pricetag-outline" size={20} color="#f97316" />
              </View>
              <Text className="text-lg font-semibold text-slate-700">{subscriptionPlan || "Loading..."}</Text>
            </View>
            {subscriptionPlan && subscriptionPlan.toLowerCase() === "pro" ? (
              <Text className="text-base text-slate-700">As a Pro user, you can do offline time in/out (unless you're location-restricted).</Text>
            ) : (
              <Text className="text-base text-slate-700">Your current package does not allow offline punching. Please remain connected.</Text>
            )}
          </View>
          <TouchableOpacity onPress={closeModal} className="bg-orange-400 py-3.5 rounded-xl items-center justify-center" activeOpacity={0.8}>
            <Text className="text-white font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ paddingTop: insets.top + 60 }}>
      <Animated.View
        style={{
          flex: 1,
          paddingTop: insets.top,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4 pb-8"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          {/* Status cards */}
          <View className="flex-row justify-between mb-6 gap-2">
            {/* Network */}
            <TouchableOpacity className="flex-1 bg-slate-50 rounded-xl p-2 active:opacity-80" onPress={() => openModal("network")}>
              <View className="flex-row items-center">
                <View className={`w-7 h-7 rounded-full ${wifiConnected ? "bg-orange-100" : "bg-slate-100"} items-center justify-center mr-2`}>
                  <Ionicons name="wifi" size={16} color={wifiConnected ? "#fb923c" : "#94a3b8"} />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">Network</Text>
                  <Text className="text-sm font-medium text-slate-700">{wifiConnected ? "Connected" : "Disconnected"}</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Location */}
            <TouchableOpacity className="flex-1 bg-slate-50 rounded-xl p-2 active:opacity-80" onPress={() => openModal("location")}>
              <View className="flex-row items-center">
                <View className={`w-7 h-7 rounded-full ${locationEnabled ? "bg-orange-100" : "bg-slate-100"} items-center justify-center mr-2`}>
                  <Ionicons name="location" size={16} color={locationEnabled ? "#fb923c" : "#94a3b8"} />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">Location</Text>
                  <Text className="text-sm font-medium text-slate-700">{locationEnabled ? "Enabled" : "Disabled"}</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Subscription/Package */}
            <TouchableOpacity className="flex-1 bg-slate-50 rounded-xl p-2 active:opacity-80" onPress={() => openModal("subscription")}>
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-orange-100 items-center justify-center mr-2">
                  <Ionicons name="pricetag-outline" size={16} color="#fb923c" />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">Package</Text>
                  <Text className="text-sm font-medium text-slate-700">{subscriptionPlan || "Loading..."}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Main status card */}
          <Animated.View className="bg-slate-50 rounded-xl p-5 mb-6 " style={{ transform: [{ scale: pulseAnim }] }}>
            <View className="items-center mb-4">
              <View className={`w-16 h-16 rounded-full items-center justify-center mb-2 ${isTimeIn ? "bg-orange-100" : "bg-slate-100"}`}>
                <Ionicons name="time-outline" size={32} color={isTimeIn ? "#fb923c" : "#94a3b8"} />
              </View>
              <Text className="text-2xl font-bold text-slate-800">{isTimeIn ? "On the Clock" : "Off the Clock"}</Text>
              {punchTime && (
                <Text className="text-sm text-slate-500 mt-1">
                  {isTimeIn ? "Timed in at: " : "Timed out at: "}
                  {new Date(punchTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </Text>
              )}
            </View>

            {/* Session time */}
            <View className="bg-white rounded-lg p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Feather name="clock" size={16} color="#f97316" />
                  <Text className="ml-2 text-sm font-medium text-slate-700">Session Time</Text>
                </View>
                <Text className="text-base font-semibold text-slate-800">{formatTime(sessionElapsed)}</Text>
              </View>
            </View>

            {/* Coffee */}
            <View className="bg-white rounded-lg p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Feather name="coffee" size={16} color="#f97316" />
                  <Text className="ml-2 text-sm font-medium text-slate-700">Coffee Break</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-base font-semibold text-slate-800">{formatTime(totalCoffeeTime)}</Text>
                  {isCoffeeBreakActive && <View className="ml-2 w-2 h-2 rounded-full bg-orange-400" />}
                </View>
              </View>
              <Text className="text-xs text-slate-500 mt-1">{coffeeBreakCount}/2 breaks used</Text>
            </View>

            {/* Lunch */}
            <View className="bg-white rounded-lg p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Feather name="coffee" size={16} color="#f97316" />
                  <Text className="ml-2 text-sm font-medium text-slate-700">Lunch Break</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-base font-semibold text-slate-800">{formatTime(totalLunchTime)}</Text>
                  {isLunchBreakActive && <View className="ml-2 w-2 h-2 rounded-full bg-orange-400" />}
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Time In/Out button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              onPress={handlePunch}
              disabled={loading}
              className={`py-4 rounded-lg items-center justify-center mb-4 ${isTimeIn ? "bg-slate-500" : "bg-orange-400"}`}
              activeOpacity={0.8}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">{isTimeIn ? "Time Out" : "Time In"}</Text>}
            </TouchableOpacity>
          </Animated.View>

          {/* Break buttons if time in */}
          {isTimeIn && (
            <View className="flex-row justify-between">
              {/* Coffee */}
              <Animated.View
                style={{
                  transform: [{ scale: coffeeButtonScale }],
                  flex: 1,
                  marginRight: 4,
                }}
              >
                <TouchableOpacity
                  onPress={handleCoffeeBreak}
                  disabled={loading || (!isCoffeeBreakActive && coffeeBreakCount >= 2)}
                  className={`py-3.5 rounded-lg items-center justify-center ${
                    isCoffeeBreakActive ? "bg-slate-500" : coffeeBreakCount >= 2 ? "bg-slate-300" : "bg-orange-400"
                  }`}
                  activeOpacity={0.8}
                >
                  <View className="flex-row items-center">
                    <Feather name="coffee" size={16} color="#fff" />
                    <Text className="text-white font-semibold ml-2">{isCoffeeBreakActive ? "End Coffee" : "Coffee Break"}</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Lunch */}
              <Animated.View
                style={{
                  transform: [{ scale: lunchButtonScale }],
                  flex: 1,
                  marginLeft: 4,
                }}
              >
                <TouchableOpacity
                  onPress={handleLunchBreak}
                  disabled={loading || (!isLunchBreakActive && totalLunchTime > 0)}
                  className={`py-3.5 rounded-lg items-center justify-center ${
                    isLunchBreakActive ? "bg-slate-500" : totalLunchTime > 0 ? "bg-slate-300" : "bg-orange-400"
                  }`}
                  activeOpacity={0.8}
                >
                  <View className="flex-row items-center">
                    <Feather name="coffee" size={16} color="#fff" />
                    <Text className="text-white font-semibold ml-2">{isLunchBreakActive ? "End Lunch" : "Lunch Break"}</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Bottom-sheet modals */}
      {(networkModalVisible || locationModalVisible || subscriptionModalVisible) && (
        <Modal transparent animationType="none" visible onRequestClose={closeModal}>
          <View style={{ flex: 1 }}>
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
              <View style={{ alignItems: "center", paddingVertical: 12 }} {...modalPanResponder.panHandlers}>
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
}
