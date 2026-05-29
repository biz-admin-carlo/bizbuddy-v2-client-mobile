// app/(tabs)/(shifts)/timekeeping-punch.jsx

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  TextInput,
  KeyboardAvoidingView,
  AppState,
  Keyboard,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import DropDownPicker from "react-native-dropdown-picker";
import NetInfo from "@react-native-community/netinfo";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import * as Location from "expo-location";
import io from "socket.io-client";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import {
  API_BASE_URL,
  CLOCK_OUT_DEVIATION_THRESHOLD_MINUTES,
  CLOCK_OUT_DEVIATION_COMPANY_IDS,
  DEMO_FORCE_NO_SCHEDULED_SHIFT_CLOCK_IN_MODAL,
  DRIVER_AIDE_JOB_TITLES,
  REQUEST_PUNCH_LOG_SUBMIT_PATH,
} from "../../../config/constant";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildShiftWindowFromUserShift,
  findSurroundingShiftBoundaries,
  getClockOutScheduleSummary,
} from "../../../utils/timekeepingShiftUtils";
import {
  parseCompanyTimeZone,
  formatCompanyCalendarDateString,
  formatNaiveLocalDateTimeFromPickers,
  formatNaiveLocalClockOutFromPickers,
  buildLocalDateFromPickers,
  getDefaultPunchLogPickerDatesLocal,
  logCompanySettingsTimeZoneResult,
} from "../../../utils/companyTimeZoneUtils";

const PENDING_ACTIONS_KEY = "pendingPunchActions";
const CLOCK_OUT_DEVIATION_RESPONSES_KEY = "clockOutDeviationResponses";

// Developer logs for punch / deviation flow (only in __DEV__)
const devLog = (...args) => {
  if (__DEV__) {
    console.log("[BizBuddy Punch]", ...args);
  }
};

/**
 * getSettings / GET company-settings fields used by punch:
 * - timezone (GET /api/company-settings data) — IANA zone for shift/deviation logic
 * - shiftAssignmentWindowMinutes — assignment window (minutes)
 * - driverAideThresholdMinutes — DayCare driver/aide early/late threshold (minutes)
 * Legacy keys kept as fallbacks.
 */
const parseCompanySettingsPunchFields = (raw) => {
  if (!raw || typeof raw !== "object") {
    return {
      shiftAssignmentWindowMinutes: null,
      driverAideThresholdMinutes: null,
      timeZone: null,
    };
  }
  const readNum = (...keys) => {
    for (const k of keys) {
      if (!(k in raw)) continue;
      const v = raw[k];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  return {
    shiftAssignmentWindowMinutes: readNum(
      "shiftAssignmentWindowMinutes",
      "shift_assignment_window_minutes",
      "ShiftAssignmentWindowMinutes",
      "WindowMinutes",
      "windowMinutes",
      "window_minutes",
    ),
    driverAideThresholdMinutes: readNum(
      "driverAideThresholdMinutes",
      "driver_aide_threshold_minutes",
      "DriverAideThresholdMinutes",
      "ThresholdMinutes",
      "thresholdMinutes",
      "threshold_minutes",
    ),
    timeZone: parseCompanyTimeZone(raw),
  };
};

/** GET /api/employment-details/me — `isDriver` drives time-in / time-out punch behavior. */
const parseEmploymentIsDriver = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const v = raw.isDriver ?? raw.is_driver ?? raw.IsDriver;
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "1" || s === "true" || s === "yes") return true;
    if (s === "0" || s === "false" || s === "no") return false;
  }
  return null;
};

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

const storeClockOutDeviationResponse = async (entry) => {
  try {
    const existing = await AsyncStorage.getItem(
      CLOCK_OUT_DEVIATION_RESPONSES_KEY,
    );
    const parsed = existing ? JSON.parse(existing) : [];
    const next = Array.isArray(parsed) ? parsed : [];
    next.push(entry);
    await AsyncStorage.setItem(
      CLOCK_OUT_DEVIATION_RESPONSES_KEY,
      JSON.stringify(next),
    );
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

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toRadians = (deg) => (deg * Math.PI) / 180;

const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const normalizeAssignedLocation = (rawLocation) => {
  const loc = rawLocation?.location ?? rawLocation ?? {};
  const latitude = toFiniteNumber(loc.latitude ?? loc.lat);
  const longitude = toFiniteNumber(loc.longitude ?? loc.lng ?? loc.lon);
  if (latitude == null || longitude == null) return null;

  const radius =
    toFiniteNumber(
      loc.radius ??
        loc.radiusMeters ??
        loc.radius_meters ??
        loc.allowedRadius ??
        loc.allowedRadiusMeters,
    ) ?? 500;

  return {
    name:
      loc.name ??
      loc.locationName ??
      loc.branchName ??
      loc.title ??
      "assigned location",
    latitude,
    longitude,
    radius,
  };
};

const combineDateAndTime = (date, time) => {
  const combined = new Date(date);
  combined.setHours(time.getHours());
  combined.setMinutes(time.getMinutes());
  combined.setSeconds(time.getSeconds());
  combined.setMilliseconds(time.getMilliseconds());
  return combined;
};

/** Native UIDatePicker may mutate the `value` Date in place — never reuse one instance for multiple pickers or state fields. */
const cloneJsDate = (d) =>
  d instanceof Date && Number.isFinite(d.getTime())
    ? new Date(d.getTime())
    : new Date();

/**
 * iOS `UIDatePicker` in time mode still ties `value` to a calendar day. Using the requested punch
 * date (often in the past) makes the wheel behave like “today on that old day” and caps selectable
 * times relative to the clock (e.g. nothing after ~8 AM). Anchor to a fixed local calendar date so
 * the full day is scrollable; `onChange` still merges hours onto `plReqDate` via `combineDateAndTime`.
 */
const IOS_PL_REQ_LOG_TIME_PICKER_ANCHOR_DATE = new Date(2000, 0, 1);

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
  const [assignedLocations, setAssignedLocations] = useState([]);
  const [isWithinPunchLocation, setIsWithinPunchLocation] = useState(true);
  const [punchLocationErrorMessage, setPunchLocationErrorMessage] =
    useState("");

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
  const [subscriptionModalVisible, setSubscriptionModalVisible] =
    useState(false);
  const [clockOutDeviationModalVisible, setClockOutDeviationModalVisible] =
    useState(false);
  const [clockOutDeviationDetails, setClockOutDeviationDetails] =
    useState(null);
  // When clock-out is deferred for deviation modal: payload to send when user picks Regular or Driver/Aide
  const [pendingClockOutPayload, setPendingClockOutPayload] = useState(null);
  // Clock-in early modal (for allowed company, non–driver/aide): early clock-in vs driverAideThresholdMinutes from /api/company-settings
  const [clockInEarlyModalVisible, setClockInEarlyModalVisible] =
    useState(false);
  const [clockInEarlyDetails, setClockInEarlyDetails] = useState(null);
  const [pendingClockInPayload, setPendingClockInPayload] = useState(null);
  const [
    noScheduledShiftClockInModalVisible,
    setNoScheduledShiftClockInModalVisible,
  ] = useState(false);
  const [noScheduledShiftClockInNotes, setNoScheduledShiftClockInNotes] =
    useState("");
  const [clockOutConfirmModalVisible, setClockOutConfirmModalVisible] =
    useState(false);
  const [clockOutConfirmSchedule, setClockOutConfirmSchedule] = useState(null);
  const [pendingClockOutConfirmPayload, setPendingClockOutConfirmPayload] =
    useState(null);
  const pendingClockOutAfterConfirmRef = useRef(null);
  const executeOnlineClockOutRef = useRef(null);

  // Request punch log (correction / missing punch) modal
  const [punchLogRequestModalVisible, setPunchLogRequestModalVisible] =
    useState(false);
  const [plReqDate, setPlReqDate] = useState(() => new Date());
  const plReqDateRef = useRef(plReqDate);
  plReqDateRef.current = plReqDate;
  const [plClockInTime, setPlClockInTime] = useState(() => new Date());
  const [plClockOutTime, setPlClockOutTime] = useState(() => new Date());
  const [plApproverOpen, setPlApproverOpen] = useState(false);
  const [plApproverItems, setPlApproverItems] = useState([]);
  const [plApproverValue, setPlApproverValue] = useState("");
  const [plReason, setPlReason] = useState("");
  const [plDescription, setPlDescription] = useState("");
  const [plSubmitting, setPlSubmitting] = useState(false);
  const [plApproversLoading, setPlApproversLoading] = useState(false);
  const [plReqDateModalVisible, setPlReqDateModalVisible] = useState(false);
  const [plTimeModalVisible, setPlTimeModalVisible] = useState(false);
  /** "in" | "out" — clock times use calendar day of requested date (out may roll to next day if earlier than in). */
  const [plTimeModalKind, setPlTimeModalKind] = useState(null);
  /** Ref mirrors kind so Android native picker callbacks always see the correct target (in vs out). */
  const plTimeModalKindRef = useRef(null);
  /** Bumps when opening time picker so iOS remounts UIDatePicker (avoids stale wheel / wrong callback). */
  const plTimePickerSessionRef = useRef(0);

  /** Clock-out applies to the calendar day after the requested date (overnight shift). */
  const [plClockOutCrossesNextDay, setPlClockOutCrossesNextDay] =
    useState(false);

  const dismissPlTimePickerSheet = () => {
    plTimeModalKindRef.current = null;
    setPlTimeModalVisible(false);
    setPlTimeModalKind(null);
  };

  const openPlRequestTimePicker = (kind) => {
    setPlApproverOpen(false);
    setPlReqDateModalVisible(false);
    plTimeModalKindRef.current = kind;
    plTimePickerSessionRef.current += 1;
    setPlTimeModalKind(kind);
    setPlTimeModalVisible(true);
  };

  /** From GET /api/company-settings (getSettings) — loaded first on this screen. */
  const companySettingsShiftAssignmentWindowMinutesRef = useRef(null);
  const companySettingsDriverAideThresholdMinutesRef = useRef(null);
  /** IANA zone from GET /api/company-settings → data.timezone */
  const companySettingsTimeZoneRef = useRef(null);
  /** From GET /api/employment-details/me — used for time-in / time-out (driver vs non-driver). */
  const employmentDetailsIsDriverRef = useRef(null);
  /** Time In/Out stays disabled until company-settings and employment-details (first load) finish. */
  const [companySettingsFetched, setCompanySettingsFetched] = useState(false);

  // Timer reference
  const masterTimerRef = useRef(null);

  // Socket
  const socketRef = useRef(null);

  const resetAllStates = useCallback(() => {
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
  }, []);

  /** Sync punch UI with server: clears local timers if there is no active timelog (e.g. server auto clock-out). */
  const fetchAndSyncActiveTimelog = useCallback(async () => {
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
            const lastCoffee =
              activeLog.coffeeBreaks[activeLog.coffeeBreaks.length - 1];
            if (lastCoffee && !lastCoffee.end) {
              setIsCoffeeBreakActive(true);
              const cStart = new Date(lastCoffee.start);
              setCoffeeBreakStartTime(cStart);
              setTotalCoffeeTime(
                Math.floor((Date.now() - cStart.getTime()) / 1000),
              );
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
          if (
            activeLog.lunchBreak &&
            activeLog.lunchBreak.start &&
            !activeLog.lunchBreak.end
          ) {
            setIsLunchBreakActive(true);
            const lStart = new Date(activeLog.lunchBreak.start);
            setLunchBreakStartTime(lStart);
            setTotalLunchTime(
              Math.floor((Date.now() - lStart.getTime()) / 1000),
            );
          } else {
            setIsLunchBreakActive(false);
            setLunchBreakStartTime(null);
            setTotalLunchTime(0);
          }
        } else {
          resetAllStates();
        }
      }
    } catch {}
  }, [resetAllStates]);

  useFocusEffect(
    useCallback(() => {
      fetchAndSyncActiveTimelog();
    }, [fetchAndSyncActiveTimelog]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        fetchAndSyncActiveTimelog();
      }
    });
    return () => sub.remove();
  }, [fetchAndSyncActiveTimelog]);

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
          const coffeeElapsed = Math.floor(
            (Date.now() - coffeeBreakStartTime.getTime()) / 1000,
          );
          setTotalCoffeeTime(coffeeElapsed);
        }
        if (isLunchBreakActive && lunchBreakStartTime) {
          const lunchElapsed = Math.floor(
            (Date.now() - lunchBreakStartTime.getTime()) / 1000,
          );
          setTotalLunchTime(lunchElapsed);
        }
      }, 1000);
    } else {
      if (masterTimerRef.current) clearInterval(masterTimerRef.current);
    }

    return () => {
      if (masterTimerRef.current) clearInterval(masterTimerRef.current);
    };
  }, [
    isTimeIn,
    punchTime,
    isCoffeeBreakActive,
    coffeeBreakStartTime,
    isLunchBreakActive,
    lunchBreakStartTime,
  ]);

  const fetchCompanySettingsForPunch = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        devLog("company-settings: skip fetch (no token)");
        return;
      }
      const settingsRes = await axios.get(
        `${API_BASE_URL}/api/company-settings`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      logCompanySettingsTimeZoneResult(settingsRes, "punch:company-settings");
      const raw =
        settingsRes?.data?.data ??
        settingsRes?.data?.settings ??
        settingsRes?.data ??
        {};
      const {
        shiftAssignmentWindowMinutes,
        driverAideThresholdMinutes,
        timeZone,
      } = parseCompanySettingsPunchFields(raw);

      devLog("company-settings fetched", {
        shiftAssignmentWindowMinutes,
        driverAideThresholdMinutes,
        timeZone,
        httpStatus: settingsRes?.status,
        responseData: settingsRes?.data,
      });

      companySettingsShiftAssignmentWindowMinutesRef.current =
        shiftAssignmentWindowMinutes;
      companySettingsDriverAideThresholdMinutesRef.current =
        driverAideThresholdMinutes;
      companySettingsTimeZoneRef.current = timeZone;

      devLog("company-settings stored (refs)", {
        shiftAssignmentWindowMinutes:
          companySettingsShiftAssignmentWindowMinutesRef.current,
        driverAideThresholdMinutes:
          companySettingsDriverAideThresholdMinutesRef.current,
        timeZone: companySettingsTimeZoneRef.current,
      });
    } catch (e) {
      devLog("company-settings fetch failed", e?.message ?? String(e));
      companySettingsShiftAssignmentWindowMinutesRef.current = null;
      companySettingsDriverAideThresholdMinutesRef.current = null;
      companySettingsTimeZoneRef.current = null;
    }
  }, []);

  const fetchEmploymentDetailsForPunch = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        devLog("employment-details/me: skip fetch (no token)");
        employmentDetailsIsDriverRef.current = null;
        return;
      }
      const res = await axios.get(`${API_BASE_URL}/api/employment-details/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = res?.data?.data ?? res?.data ?? {};
      let isDriver = parseEmploymentIsDriver(raw);
      if (isDriver === null) {
        const nested =
          raw?.employment ??
          raw?.employmentDetails ??
          raw?.employment_detail ??
          raw?.details;
        if (nested && typeof nested === "object") {
          isDriver = parseEmploymentIsDriver(nested);
        }
      }
      devLog("employment-details/me fetched", {
        isDriver,
        httpStatus: res?.status,
      });
      employmentDetailsIsDriverRef.current = isDriver;
      devLog("employment-details/me stored (ref)", {
        isDriver: employmentDetailsIsDriverRef.current,
      });
    } catch (e) {
      devLog("employment-details/me fetch failed", e?.message ?? String(e));
      employmentDetailsIsDriverRef.current = null;
    }
  }, []);

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
        const assignedLocs = Array.isArray(res.data.data) ? res.data.data : [];
        const normalized = assignedLocs
          .map(normalizeAssignedLocation)
          .filter(Boolean);
        setAssignedLocations(normalized);
        setIsLocationRestricted(assignedLocs.length > 0);
      }
    } catch (error) {
      // If error, assume not restricted for fallback
      setIsLocationRestricted(false);
      setAssignedLocations([]);
    }
  };

  const validatePunchLocation = useCallback(async () => {
    if (!isLocationRestricted) {
      setIsWithinPunchLocation(true);
      setPunchLocationErrorMessage("");
      return;
    }

    if (!locationEnabled) {
      setIsWithinPunchLocation(false);
      setPunchLocationErrorMessage("Enable location services to punch in/out.");
      return;
    }

    if (!assignedLocations.length) {
      setIsWithinPunchLocation(true);
      setPunchLocationErrorMessage("");
      return;
    }

    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const currentLat = current?.coords?.latitude;
      const currentLng = current?.coords?.longitude;
      if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) {
        setIsWithinPunchLocation(false);
        setPunchLocationErrorMessage("Current location is unavailable.");
        return;
      }

      let nearest = null;
      let isInsideAny = false;
      for (const loc of assignedLocations) {
        const metersAway = distanceMeters(
          currentLat,
          currentLng,
          loc.latitude,
          loc.longitude,
        );
        if (!nearest || metersAway < nearest.metersAway) {
          nearest = { ...loc, metersAway };
        }
        if (metersAway <= loc.radius) {
          isInsideAny = true;
          break;
        }
      }

      if (isInsideAny) {
        setIsWithinPunchLocation(true);
        setPunchLocationErrorMessage("");
      } else {
        const roundedDistance = Math.round(nearest?.metersAway ?? 0);
        const roundedRadius = Math.round(nearest?.radius ?? 0);
        setIsWithinPunchLocation(false);
        setPunchLocationErrorMessage(
          `You are outside the punch area (${roundedDistance}m away; allowed ${roundedRadius}m).`,
        );
      }
    } catch (error) {
      setIsWithinPunchLocation(false);
      setPunchLocationErrorMessage("Unable to verify your punch location.");
    }
  }, [assignedLocations, isLocationRestricted, locationEnabled]);

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([
          fetchCompanySettingsForPunch(),
          fetchEmploymentDetailsForPunch(),
        ]);
      } finally {
        setCompanySettingsFetched(true);
      }
      fetchSubscription();
      fetchAssignedLocations();
    };
    init();
  }, [fetchCompanySettingsForPunch, fetchEmploymentDetailsForPunch]);

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
    }),
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
        ]),
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
            setSessionElapsed(
              Math.floor((Date.now() - actualIn.getTime()) / 1000),
            );
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

  useEffect(() => {
    validatePunchLocation();
  }, [validatePunchLocation]);

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
      await Promise.all([
        fetchCompanySettingsForPunch(),
        fetchEmploymentDetailsForPunch(),
      ]);
      await fetchAndSyncActiveTimelog();
      updateLocationStatus();
      fetchAssignedLocations(); // re-check location restrictions
      validatePunchLocation();
    } catch {}
    setRefreshing(false);
  };

  // Time In/Out (with localTimestamp)
  const handlePunch = async () => {
    try {
      if (!companySettingsFetched) return;
      if (isLocationRestricted && !isWithinPunchLocation) {
        Alert.alert(
          "Outside Punch Location",
          "You must be inside your assigned punch location to continue.",
        );
        return;
      }
      if (isTimeIn && (isCoffeeBreakActive || isLunchBreakActive)) {
        Alert.alert("Cannot Time Out", "Please end your active break first.");
        return;
      }
      animateButtonPress(buttonScale);
      setLoading(true);

      // If user is location restricted, we DO NOT allow offline punching.
      if (isLocationRestricted && !wifiConnected) {
        setLoading(false);
        Alert.alert(
          "Cannot Punch Offline",
          "You are location-restricted and must be online with location enabled to Time In or Time Out.",
        );
        return;
      }

      // If offline + not pro => block
      if (!wifiConnected && (subscriptionPlan || "").toLowerCase() !== "pro") {
        setLoading(false);
        Alert.alert(
          "Offline Punch Not Allowed",
          "Your plan requires internet connection for punching.",
        );
        return;
      }

      const token = await SecureStore.getItemAsync("token");
      const endpoint = isTimeIn ? "/time-out" : "/time-in";
      devLog("punch context", {
        endpoint,
        isDriver: employmentDetailsIsDriverRef.current,
      });
      const { deviceInfo, location } = await getPunchData();

      // If location is restricted but location is missing => block
      if (isLocationRestricted && (!location.latitude || !location.longitude)) {
        setLoading(false);
        Alert.alert(
          "Location Required",
          "Location services are disabled. Please enable location to Time In/Out.",
        );
        return;
      }

      // This is the local date/time for the punch
      const localTimestamp = new Date().toISOString();

      const payload = {
        deviceInfo,
        location,
        localTimestamp,
      };
      const isDriverEmployment = employmentDetailsIsDriverRef.current === true;
      const baseTimeInPayload =
        !isTimeIn && isDriverEmployment
          ? { ...payload, punchType: "DRIVER_AIDE" }
          : payload;
      if (!isTimeIn && isDriverEmployment) {
        devLog(
          "Time-in payload: forcing DRIVER_AIDE from employment isDriver=true",
        );
      }

      // If user is offline and plan=pro => store offline
      if (!wifiConnected) {
        const offlinePayload =
          endpoint === "/time-in" ? baseTimeInPayload : payload;
        await storePendingAction({ endpoint, payload: offlinePayload });
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
        // If user is online => normal punch (or defer to deviation/early modals for that company)
        let timeInPayload = baseTimeInPayload;
        let clockInEarlyCheck = null;

        if (isTimeIn) {
          try {
            const shiftsRes = await axios.get(
              `${API_BASE_URL}/api/usershifts`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            const userShifts = shiftsRes?.data?.data;
            console.log(
              "Timekeeping punch userShifts (clock-out confirm):",
              userShifts,
            );
            const windows = Array.isArray(userShifts)
              ? userShifts.map(buildShiftWindowFromUserShift).filter(Boolean)
              : [];
            setClockOutConfirmSchedule(
              getClockOutScheduleSummary(windows, new Date()),
            );
          } catch (e) {
            devLog("Clock-out confirm schedule fetch error:", e?.message);
            setClockOutConfirmSchedule({ status: "no_shifts" });
          }
          setPendingClockOutConfirmPayload({
            token,
            deviceInfo,
            location,
            localTimestamp,
          });
          openModal("clockOutConfirm");
          setLoading(false);
          return;
        }

        if (!isTimeIn) {
          if (DEMO_FORCE_NO_SCHEDULED_SHIFT_CLOCK_IN_MODAL) {
            devLog("Demo: forcing no-scheduled-shift clock-in modal");
            let demoTimeInPayload = { ...payload };
            try {
              const demoEarly = await checkClockInEarly({
                token,
                clockInAt: new Date(),
              });
              if (demoEarly?.addPunchTypeAM) {
                demoTimeInPayload = { ...payload, punchType: "DRIVER_AIDE_AM" };
              }
            } catch {
              // ignore; use base payload
            }
            setPendingClockInPayload({
              token,
              deviceInfo,
              location,
              localTimestamp,
              punchType: demoTimeInPayload?.punchType,
            });
            openModal("noScheduledShiftClockIn");
            setLoading(false);
            return;
          }
          // Time-in: allowed company + non–driver/aide — early clock-in vs driverAideThresholdMinutes from /api/company-settings
          try {
            clockInEarlyCheck = await checkClockInEarly({
              token,
              clockInAt: new Date(),
            });
            devLog("Time-in check:", {
              showModal: clockInEarlyCheck?.showModal,
              addPunchTypeAM: clockInEarlyCheck?.addPunchTypeAM,
              useRegularPunch: clockInEarlyCheck?.useRegularPunch,
              isDriver: employmentDetailsIsDriverRef.current,
              minutesEarly: clockInEarlyCheck?.details?.minutesEarly,
            });
            if (clockInEarlyCheck.showModal && clockInEarlyCheck.details) {
              devLog("Showing clock-in early modal");
              setPendingClockInPayload({
                token,
                deviceInfo,
                location,
                localTimestamp,
              });
              setClockInEarlyDetails(clockInEarlyCheck.details);
              openModal("clockInEarly");
              setLoading(false);
              return;
            }
            if (clockInEarlyCheck.addPunchTypeAM) {
              timeInPayload = { ...payload, punchType: "DRIVER_AIDE_AM" };
              devLog("Time-in payload: punchType = DRIVER_AIDE_AM");
            } else if (clockInEarlyCheck.useRegularPunch) {
              timeInPayload = { ...payload, punchType: "REGULAR" };
              devLog(
                "Time-in payload: punchType = REGULAR (non-driver / not early)",
              );
            }
            if (clockInEarlyCheck.hasScheduledShift === false) {
              devLog("Showing no-scheduled-shift clock-in modal");
              setPendingClockInPayload({
                token,
                deviceInfo,
                location,
                localTimestamp,
                punchType: timeInPayload?.punchType,
              });
              openModal("noScheduledShiftClockIn");
              setLoading(false);
              return;
            }
          } catch (e) {
            devLog("Clock-in early check error:", e?.message);
            // If check fails, proceed with normal time-in
          }
        }

        const url = `${API_BASE_URL}/api/timelogs/time-in`;
        const body = timeInPayload;
        devLog("Punch request:", "/time-in", {
          punchType: body.punchType,
          localTimestamp: body.localTimestamp,
        });
        try {
          const res = await axios.post(url, body, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 200 || res.status === 201) {
            devLog("Punch success:", endpoint, res.data?.message);
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
        Alert.alert(
          "Offline Break Not Allowed",
          "You are location-restricted and must be online with location enabled.",
        );
        return;
      }
      if (!wifiConnected) {
        Alert.alert(
          "Offline Break Not Allowed",
          "Coffee breaks can only be done when online.",
        );
        return;
      }
      animateButtonPress(coffeeButtonScale);
      setLoading(true);

      const token = await SecureStore.getItemAsync("token");
      const { deviceInfo, location } = await getPunchData();

      // If location is missing but user restricted => block
      if (isLocationRestricted && (!location.latitude || !location.longitude)) {
        setLoading(false);
        Alert.alert(
          "Location Required",
          "Please enable location services to start/end a break.",
        );
        return;
      }

      const endpoint = isCoffeeBreakActive
        ? "/coffee-break/end"
        : "/coffee-break/start";
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
        Alert.alert(
          "Offline Break Not Allowed",
          "You are location-restricted and must be online with location enabled.",
        );
        return;
      }
      if (!wifiConnected) {
        Alert.alert(
          "Offline Break Not Allowed",
          "Lunch breaks can only be done when online.",
        );
        return;
      }
      animateButtonPress(lunchButtonScale);
      setLoading(true);

      const token = await SecureStore.getItemAsync("token");
      const { deviceInfo, location } = await getPunchData();

      if (isLocationRestricted && (!location.latitude || !location.longitude)) {
        setLoading(false);
        Alert.alert(
          "Location Required",
          "Please enable location services to start/end a lunch break.",
        );
        return;
      }

      const endpoint = isLunchBreakActive
        ? "/lunch-break/end"
        : "/lunch-break/start";
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
    else if (type === "clockOutDeviation")
      setClockOutDeviationModalVisible(true);
    else if (type === "clockOutConfirm") setClockOutConfirmModalVisible(true);
    else if (type === "clockInEarly") setClockInEarlyModalVisible(true);
    else if (type === "noScheduledShiftClockIn")
      setNoScheduledShiftClockInModalVisible(true);

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
      setClockOutDeviationModalVisible(false);
      setClockOutDeviationDetails(null);
      setPendingClockOutPayload(null);
      setClockInEarlyModalVisible(false);
      setClockInEarlyDetails(null);
      setPendingClockInPayload(null);
      setNoScheduledShiftClockInModalVisible(false);
      setNoScheduledShiftClockInNotes("");
      setClockOutConfirmModalVisible(false);
      setClockOutConfirmSchedule(null);
      setPendingClockOutConfirmPayload(null);

      const proceed = pendingClockOutAfterConfirmRef.current;
      pendingClockOutAfterConfirmRef.current = null;
      if (proceed && executeOnlineClockOutRef.current) {
        executeOnlineClockOutRef.current(proceed);
      }
    });
  };

  const onPlReqDateModalChange = (event, selectedDate) => {
    const toRequestedLocalDate = (dateValue) => {
      if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
        return cloneJsDate(plReqDateRef.current);
      }
      return cloneJsDate(
        new Date(
          dateValue.getFullYear(),
          dateValue.getMonth(),
          dateValue.getDate(),
        ),
      );
    };

    /** Keep clock-in/out wall-clock times but align their calendar day to the requested date. */
    const syncClockStatesToRequestedDate = (rawSelected) => {
      if (
        !(rawSelected instanceof Date) ||
        Number.isNaN(rawSelected.getTime())
      ) {
        return;
      }
      const nextReqDate = toRequestedLocalDate(rawSelected);
      setPlReqDate(nextReqDate);
      setPlClockInTime((prev) =>
        cloneJsDate(combineDateAndTime(nextReqDate, prev)),
      );
      setPlClockOutTime((prev) =>
        cloneJsDate(combineDateAndTime(nextReqDate, prev)),
      );
    };

    if (Platform.OS === "android") {
      setPlReqDateModalVisible(false);
      if (event?.type === "set" && selectedDate) {
        syncClockStatesToRequestedDate(selectedDate);
      }
      return;
    }
    if (selectedDate) syncClockStatesToRequestedDate(selectedDate);
  };

  const onPlTimeModalChange = (event, selectedDate) => {
    const kind = plTimeModalKindRef.current;
    /** Time wheels often return today's calendar date — lock wall-clock to the selected punch-log date. */
    const applyTimeToRequestedDate = () => {
      if (!selectedDate || !kind) return;
      const next = cloneJsDate(
        combineDateAndTime(plReqDateRef.current, selectedDate),
      );
      if (kind === "out") setPlClockOutTime(next);
      else setPlClockInTime(next);
    };
    if (Platform.OS === "android") {
      if (event?.type === "set") applyTimeToRequestedDate();
      dismissPlTimePickerSheet();
      return;
    }
    applyTimeToRequestedDate();
  };

  /** Prefer ref kind while sheet is open so value tracks clock-out vs clock-in even if state batches oddly. */
  const effectivePlTimeModalKind =
    plTimeModalVisible &&
    (plTimeModalKindRef.current === "in" ||
      plTimeModalKindRef.current === "out")
      ? plTimeModalKindRef.current
      : plTimeModalKind;

  const plTimeModalValue =
    effectivePlTimeModalKind === "out" ? plClockOutTime : plClockInTime;

  const fetchPlApprovers = useCallback(async () => {
    setPlApproversLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        Alert.alert("Authentication", "Please sign in again.");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/leaves/approvers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.data)) {
        const items = data.data.map((approver) => {
          const firstName = approver.profile?.firstName || "";
          const lastName = approver.profile?.lastName || "";
          const fullName = `${firstName} ${lastName}`.trim();
          return {
            label: fullName || approver.username || `User ${approver.id}`,
            value: String(approver.id),
          };
        });
        setPlApproverItems(items);
      } else {
        Alert.alert("Error", data?.message || "Failed to fetch approvers.");
      }
    } catch (e) {
      console.error("fetchPlApprovers", e);
      Alert.alert("Error", "Could not load approvers.");
    } finally {
      setPlApproversLoading(false);
    }
  }, []);

  const openPunchLogRequestModal = () => {
    const defaults = getDefaultPunchLogPickerDatesLocal();
    setPlReqDate(cloneJsDate(defaults.reqDate));
    setPlClockInTime(cloneJsDate(defaults.clockIn));
    setPlClockOutTime(cloneJsDate(defaults.clockOut));
    setPlReason("");
    setPlDescription("");
    setPlApproverValue("");
    setPlClockOutCrossesNextDay(false);
    setPlReqDateModalVisible(false);
    dismissPlTimePickerSheet();
    setPlApproverOpen(false);
    setPunchLogRequestModalVisible(true);
    fetchPlApprovers();
  };

  const closePunchLogRequestModal = () => {
    Keyboard.dismiss();
    setPlReqDateModalVisible(false);
    dismissPlTimePickerSheet();
    setPlApproverOpen(false);
    setPunchLogRequestModalVisible(false);
  };

  const submitPunchLogRequest = async () => {
    const nowMs = Date.now();

    const trimmedApprover = String(plApproverValue ?? "").trim();
    if (!trimmedApprover) {
      Alert.alert(
        "Choose an approver",
        "Pick someone from the Approver list—they need to approve this punch log.",
      );
      return;
    }

    if (
      !Number.isFinite(plReqDate.getTime()) ||
      !Number.isFinite(plClockInTime.getTime()) ||
      !Number.isFinite(plClockOutTime.getTime())
    ) {
      Alert.alert(
        "Update your times",
        "Close this screen and open Request punch log again, then choose the date and clock-in/out times.",
      );
      return;
    }

    const requestedDate = formatCompanyCalendarDateString(plReqDate);
    const requestedClockIn = formatNaiveLocalDateTimeFromPickers(
      plReqDate,
      plClockInTime,
    );
    const requestedClockOut = formatNaiveLocalClockOutFromPickers(
      plReqDate,
      plClockOutTime,
      plClockOutCrossesNextDay,
    );
    const clockInLocal = buildLocalDateFromPickers(plReqDate, plClockInTime);
    const clockOutLocal = buildLocalDateFromPickers(
      plReqDate,
      plClockOutTime,
      plClockOutCrossesNextDay,
    );

    if (
      !requestedDate ||
      !requestedClockIn ||
      !requestedClockOut ||
      !clockInLocal ||
      !clockOutLocal
    ) {
      Alert.alert(
        "Update your times",
        "Something went wrong combining your date and times. Please pick them again.",
      );
      return;
    }

    if (clockInLocal.getTime() > nowMs || clockOutLocal.getTime() > nowMs) {
      Alert.alert(
        "Nothing in the future",
        "Requested clock-in and clock-out must be at or before the current time. Change the date or times so nothing is in the future.",
      );
      return;
    }

    const diffMs = clockOutLocal.getTime() - clockInLocal.getTime();
    const estimatedDuration = Math.round(diffMs / 60000);
    const estimatedNetHours =
      Math.round((estimatedDuration / 60) * 1000) / 1000;

    const reasonTrim = plReason.trim();
    const descriptionTrim = plDescription.trim();
    const payload = {
      requestedDate,
      requestedClockIn,
      requestedClockOut,
      approverId: trimmedApprover,
      reason: reasonTrim,
      description: descriptionTrim,
      estimatedDuration,
      estimatedNetHours,
    };

    const submitUrl = `${API_BASE_URL}${REQUEST_PUNCH_LOG_SUBMIT_PATH}`;
    console.log("[BizBuddy Punch] request punch log submit", {
      method: "POST",
      url: submitUrl,
    });
    console.log(
      "[BizBuddy Punch] request punch log req body",
      JSON.stringify(payload, null, 2),
    );
    devLog("request punch log submit", {
      url: submitUrl,
      reqBody: payload,
    });

    setPlSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        Alert.alert("Authentication", "Please sign in again.");
        return;
      }

      const res = await axios.post(submitUrl, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      Alert.alert(
        "Submitted",
        res.data?.message || "Your punch log request was sent.",
      );
      closePunchLogRequestModal();
    } catch (err) {
      const submitUrl = `${API_BASE_URL}${REQUEST_PUNCH_LOG_SUBMIT_PATH}`;
      const status = err?.response?.status;
      const responseData = err?.response?.data;
      console.error("[BizBuddy Punch] request punch log submit failed", {
        url: submitUrl,
        payload,
        status,
        statusText: err?.response?.statusText,
        responseData,
        axiosMessage: err?.message,
        code: err?.code,
      });
      const rawServerMsg = String(
        responseData?.message ||
          responseData?.error ||
          responseData?.details ||
          "",
      ).trim();
      const axiosMsg = String(err?.message ?? "").toLowerCase();
      let friendlyBody =
        rawServerMsg ||
        (axiosMsg.includes("network") || err?.code === "ERR_NETWORK"
          ? "Check your connection and try again."
          : axiosMsg.includes("timeout") || err?.code === "ECONNABORTED"
            ? "The request took too long. Try again in a moment."
            : "We couldn't send your punch log request. Please try again.");

      if (status === 401 || status === 403) {
        friendlyBody =
          rawServerMsg ||
          "Your session may have expired. Sign in again and retry.";
      } else if (status === 404) {
        friendlyBody = rawServerMsg || "This action isn't available right now.";
      } else if (status === 409) {
        friendlyBody =
          rawServerMsg ||
          "A punch log for this date may already exist. Check your requests or pick another date.";
      } else if (status >= 500) {
        friendlyBody =
          rawServerMsg ||
          "Our servers had a problem. Please try again in a little while.";
      }

      Alert.alert("Couldn't submit", friendlyBody);
    } finally {
      setPlSubmitting(false);
    }
  };

  // Returns { showModal: true, details } when clock-out needs the type-selection modal.
  const checkClockOutDeviation = async ({ token, clockOutAt }) => {
    try {
      if (!token) return { showModal: false };
      if (
        !(clockOutAt instanceof Date) ||
        !Number.isFinite(clockOutAt.getTime())
      )
        return { showModal: false };

      const profRes = await axios.get(`${API_BASE_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const company =
        profRes?.data?.data?.company ||
        profRes?.data?.data?.profile?.company ||
        null;
      const companyId =
        company?.id || company?._id || company?.companyId || null;

      const allowedCompanyIds = Array.isArray(CLOCK_OUT_DEVIATION_COMPANY_IDS)
        ? CLOCK_OUT_DEVIATION_COMPANY_IDS.map((id) => String(id).trim()).filter(
            Boolean,
          )
        : [];
      if (!companyId || !allowedCompanyIds.includes(String(companyId).trim())) {
        devLog("checkClockOutDeviation: company outside allowlist", {
          companyId,
        });
        return { showModal: false };
      }

      const shiftsRes = await axios.get(`${API_BASE_URL}/api/usershifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userShifts = shiftsRes?.data?.data;
      console.log(
        "Timekeeping punch userShifts (clock-out deviation check):",
        userShifts,
      );
      if (!Array.isArray(userShifts) || userShifts.length === 0)
        return { showModal: false };

      const windows = userShifts
        .map(buildShiftWindowFromUserShift)
        .filter(Boolean);
      if (!windows.length) return { showModal: false };

      const boundaries = findSurroundingShiftBoundaries(windows, clockOutAt);
      const lastShiftEnd = boundaries?.lastShiftEnd;
      const nextShiftStart = boundaries?.nextShiftStart;
      if (!lastShiftEnd) return { showModal: false };

      const minutesAfterEnd =
        (clockOutAt.getTime() - lastShiftEnd.getTime()) / 60000;
      const minutesBeforeNextStart =
        nextShiftStart instanceof Date
          ? (nextShiftStart.getTime() - clockOutAt.getTime()) / 60000
          : null;

      let threshold = Number(CLOCK_OUT_DEVIATION_THRESHOLD_MINUTES) || 60;
      const cached = companySettingsDriverAideThresholdMinutesRef.current;
      if (Number.isFinite(cached) && cached > 0) {
        threshold = cached;
      } else {
        try {
          const settingsRes = await axios.get(
            `${API_BASE_URL}/api/company-settings`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const raw = settingsRes?.data?.data ?? settingsRes?.data ?? {};
          const parsed = parseCompanySettingsPunchFields(raw);
          if (
            Number.isFinite(parsed.driverAideThresholdMinutes) &&
            parsed.driverAideThresholdMinutes > 0
          ) {
            threshold = parsed.driverAideThresholdMinutes;
            companySettingsDriverAideThresholdMinutesRef.current =
              parsed.driverAideThresholdMinutes;
          }
          if (Number.isFinite(parsed.shiftAssignmentWindowMinutes)) {
            companySettingsShiftAssignmentWindowMinutesRef.current =
              parsed.shiftAssignmentWindowMinutes;
          }
          if (parsed.timeZone) {
            companySettingsTimeZoneRef.current = parsed.timeZone;
          }
        } catch (e) {
          devLog(
            "checkClockOutDeviation: company-settings fetch failed, using fallback threshold",
            e?.message,
          );
        }
      }

      const isDriverEmployment = employmentDetailsIsDriverRef.current;
      let showModal = false;

      if (isDriverEmployment === false) {
        showModal = minutesAfterEnd >= threshold;
      } else if (isDriverEmployment === true) {
        showModal = false;
      } else {
        showModal =
          minutesAfterEnd >= threshold &&
          Number.isFinite(minutesBeforeNextStart) &&
          minutesBeforeNextStart >= threshold;
      }

      devLog("checkClockOutDeviation:", {
        companyId,
        isDriver: isDriverEmployment,
        minutesAfterEnd: Math.floor(minutesAfterEnd),
        minutesBeforeNextStart: Number.isFinite(minutesBeforeNextStart)
          ? Math.floor(minutesBeforeNextStart)
          : null,
        threshold,
        showModal,
      });
      if (showModal) {
        return {
          showModal: true,
          details: {
            companyId: String(companyId ?? ""),
            clockOutAt,
            lastShiftEnd,
            nextShiftStart,
            minutesAfterEnd: Math.floor(minutesAfterEnd),
            minutesBeforeNextStart: Number.isFinite(minutesBeforeNextStart)
              ? Math.floor(minutesBeforeNextStart)
              : null,
            thresholdMinutes: threshold,
          },
        };
      }
      return { showModal: false };
    } catch (e) {
      devLog("checkClockOutDeviation error:", e?.message);
      return { showModal: false };
    }
  };

  /**
   * Time-in early flow:
   * - Companies outside CLOCK_OUT_DEVIATION_COMPANY_IDS: punch REGULAR with no clock-in
   *   deviation modals (early Driver/Aide vs Regular, nor no-scheduled-shift notes).
   * - If employment `isDriver === false` in an allowed company: show Driver/Aide (AM) vs Regular
   *   modal when clock-in is >= driverAideThresholdMinutes before the next shift start, except when
   *   minutesEarly <= shiftAssignmentWindowMinutes (assignment window bypass -> default REGULAR).
   * - If employment `isDriver === true`: skip that modal (no automatic DRIVER_AIDE_AM).
   * - If `isDriver` is unknown (null): legacy allowed-company + job-title rules (DRIVER_AIDE_AM default).
   */
  const checkClockInEarly = async ({ token, clockInAt }) => {
    const baseResult = (over = {}) => ({
      showModal: false,
      addPunchTypeAM: false,
      hasScheduledShift: true,
      useRegularPunch: false,
      ...over,
    });

    try {
      if (!token) return baseResult();
      if (!(clockInAt instanceof Date) || !Number.isFinite(clockInAt.getTime()))
        return baseResult();

      const profRes = await axios.get(`${API_BASE_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = profRes?.data?.data ?? {};
      const profile = data?.profile ?? data;
      const company = data?.company ?? profile?.company ?? null;
      const companyId =
        company?.id ?? company?._id ?? company?.companyId ?? null;
      const jobTitle = (
        profile?.jobTitle ??
        profile?.job_title ??
        profile?.title ??
        ""
      )
        .toString()
        .trim();

      const shiftsRes = await axios.get(`${API_BASE_URL}/api/usershifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userShifts = shiftsRes?.data?.data;
      console.log(
        "Timekeeping punch userShifts (clock-in early check):",
        userShifts,
      );
      const windows = Array.isArray(userShifts)
        ? userShifts.map(buildShiftWindowFromUserShift).filter(Boolean)
        : [];
      const hasScheduledShift = windows.length > 0;
      const allowedCompanyIds = Array.isArray(CLOCK_OUT_DEVIATION_COMPANY_IDS)
        ? CLOCK_OUT_DEVIATION_COMPANY_IDS.map((id) => String(id).trim()).filter(
            Boolean,
          )
        : [];

      if (!companyId || !allowedCompanyIds.includes(String(companyId).trim())) {
        devLog(
          "checkClockInEarly: company outside allowlist, REGULAR, skip deviation modals",
          {
            companyId,
          },
        );
        return baseResult({ hasScheduledShift: true, useRegularPunch: true });
      }

      const resolveCompanySettingsThresholds = async () => {
        let threshold = Number(CLOCK_OUT_DEVIATION_THRESHOLD_MINUTES) || 45;
        let assignmentWindow = null;
        const cachedDriverAide =
          companySettingsDriverAideThresholdMinutesRef.current;
        const cachedAssignmentWindow =
          companySettingsShiftAssignmentWindowMinutesRef.current;
        if (Number.isFinite(cachedDriverAide) && cachedDriverAide > 0) {
          devLog(
            "checkClockInEarly: using driverAideThresholdMinutes from company-settings cache",
            {
              threshold: cachedDriverAide,
            },
          );
          threshold = cachedDriverAide;
        }
        if (
          Number.isFinite(cachedAssignmentWindow) &&
          cachedAssignmentWindow > 0
        ) {
          assignmentWindow = cachedAssignmentWindow;
        }
        if (
          Number.isFinite(threshold) &&
          threshold > 0 &&
          assignmentWindow != null
        ) {
          return { threshold, assignmentWindow };
        }
        try {
          const settingsRes = await axios.get(
            `${API_BASE_URL}/api/company-settings`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const raw = settingsRes?.data?.data ?? settingsRes?.data ?? {};
          const parsed = parseCompanySettingsPunchFields(raw);
          if (
            Number.isFinite(parsed.driverAideThresholdMinutes) &&
            parsed.driverAideThresholdMinutes > 0
          ) {
            threshold = parsed.driverAideThresholdMinutes;
            companySettingsDriverAideThresholdMinutesRef.current =
              parsed.driverAideThresholdMinutes;
          }
          if (Number.isFinite(parsed.shiftAssignmentWindowMinutes)) {
            companySettingsShiftAssignmentWindowMinutesRef.current =
              parsed.shiftAssignmentWindowMinutes;
            assignmentWindow = parsed.shiftAssignmentWindowMinutes;
          }
          if (parsed.timeZone) {
            companySettingsTimeZoneRef.current = parsed.timeZone;
          }
        } catch (e) {
          devLog(
            "checkClockInEarly: company-settings fetch failed, using fallback threshold",
            e?.message,
          );
        }
        return { threshold, assignmentWindow };
      };

      const isDriverEmployment = employmentDetailsIsDriverRef.current;

      if (isDriverEmployment === false) {
        if (!hasScheduledShift) {
          devLog("checkClockInEarly: isDriver false, no scheduled shift", {
            jobTitle,
          });
          return baseResult({
            hasScheduledShift: false,
            useRegularPunch: true,
          });
        }
        const boundaries = findSurroundingShiftBoundaries(windows, clockInAt);
        const nextShiftStart = boundaries?.nextShiftStart;
        if (!nextShiftStart) {
          devLog("checkClockInEarly: isDriver false, no next shift start", {
            jobTitle,
          });
          return baseResult({ hasScheduledShift: true, useRegularPunch: true });
        }
        const minutesEarly =
          (nextShiftStart.getTime() - clockInAt.getTime()) / 60000;
        const { threshold, assignmentWindow } =
          await resolveCompanySettingsThresholds();
        const bypassModalByAssignmentWindow =
          Number.isFinite(assignmentWindow) &&
          assignmentWindow > 0 &&
          minutesEarly <= assignmentWindow;
        const showModal =
          !bypassModalByAssignmentWindow && minutesEarly >= threshold;
        devLog("checkClockInEarly (isDriver false):", {
          companyId,
          jobTitle,
          minutesEarly: Math.floor(minutesEarly),
          threshold,
          shiftAssignmentWindowMinutes: assignmentWindow,
          bypassModalByAssignmentWindow,
          showModal,
        });
        if (bypassModalByAssignmentWindow) {
          devLog(
            "checkClockInEarly: bypass modal, use REGULAR (isDriver false + within assignment window)",
            {
              minutesEarly: Math.floor(minutesEarly),
              shiftAssignmentWindowMinutes: assignmentWindow,
            },
          );
          return baseResult({ hasScheduledShift: true, useRegularPunch: true });
        }
        if (showModal) {
          return {
            showModal: true,
            addPunchTypeAM: false,
            hasScheduledShift: true,
            useRegularPunch: false,
            details: {
              companyId: String(companyId ?? ""),
              clockInAt,
              scheduledShiftStart: nextShiftStart,
              minutesEarly: Math.floor(minutesEarly),
              thresholdMinutes: threshold,
            },
          };
        }
        return baseResult({ hasScheduledShift: true, useRegularPunch: true });
      }

      if (isDriverEmployment === true) {
        devLog(
          "checkClockInEarly: isDriver true, skip early Driver/Aide vs Regular modal",
          {
            jobTitle,
          },
        );
        return baseResult({ hasScheduledShift });
      }

      const driverAideTitles = Array.isArray(DRIVER_AIDE_JOB_TITLES)
        ? DRIVER_AIDE_JOB_TITLES
        : [];
      if (
        driverAideTitles.some(
          (t) => String(t).trim().toLowerCase() === jobTitle.toLowerCase(),
        )
      ) {
        devLog("checkClockInEarly: driver/aide job title, skip (legacy)", {
          jobTitle,
        });
        return baseResult({ hasScheduledShift });
      }

      const addPunchTypeAM = true;
      if (!hasScheduledShift) {
        return baseResult({
          addPunchTypeAM: true,
          hasScheduledShift: false,
          useRegularPunch: false,
        });
      }

      const boundaries = findSurroundingShiftBoundaries(windows, clockInAt);
      const nextShiftStart = boundaries?.nextShiftStart;
      if (!nextShiftStart) {
        return baseResult({
          addPunchTypeAM: true,
          hasScheduledShift: true,
          useRegularPunch: false,
        });
      }

      const minutesEarly =
        (nextShiftStart.getTime() - clockInAt.getTime()) / 60000;
      const { threshold } = await resolveCompanySettingsThresholds();

      const showModal = minutesEarly >= threshold;
      devLog("checkClockInEarly (legacy):", {
        companyId,
        jobTitle,
        minutesEarly: Math.floor(minutesEarly),
        threshold,
        showModal,
        addPunchTypeAM,
      });
      if (showModal) {
        return {
          showModal: true,
          addPunchTypeAM,
          hasScheduledShift: true,
          useRegularPunch: false,
          details: {
            companyId: String(companyId),
            clockInAt,
            scheduledShiftStart: nextShiftStart,
            minutesEarly: Math.floor(minutesEarly),
            thresholdMinutes: threshold,
          },
        };
      }
      return baseResult({
        addPunchTypeAM: true,
        hasScheduledShift: true,
        useRegularPunch: false,
      });
    } catch (e) {
      devLog("checkClockInEarly error:", e?.message);
      return baseResult();
    }
  };

  executeOnlineClockOutRef.current = async ({
    token,
    deviceInfo,
    location,
    localTimestamp,
  }) => {
    const payload = { deviceInfo, location, localTimestamp };
    let timeOutPayload = { ...payload };
    setLoading(true);
    try {
      try {
        const profRes = await axios.get(`${API_BASE_URL}/api/account/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const profile =
          profRes?.data?.data?.profile ?? profRes?.data?.data ?? {};
        const jobTitle = (
          profile.jobTitle ??
          profile.job_title ??
          profile.title ??
          ""
        )
          .toString()
          .trim();
        const driverAideTitles = Array.isArray(DRIVER_AIDE_JOB_TITLES)
          ? DRIVER_AIDE_JOB_TITLES
          : [];
        const isDriverAideJob = driverAideTitles.some(
          (t) => String(t).trim().toLowerCase() === jobTitle.toLowerCase(),
        );
        const isDriverEmployment = employmentDetailsIsDriverRef.current;
        devLog("Time-out check:", {
          jobTitle,
          isDriverAideJob,
          isDriver: isDriverEmployment,
        });
        if (isDriverEmployment === true) {
          timeOutPayload = { ...payload, punchType: "DRIVER_AIDE" };
          devLog("Time-out payload: punchType = DRIVER_AIDE (isDriver=true)");
        } else if (isDriverEmployment === false) {
          const clockOutAt = new Date();
          const deviationCheck = await checkClockOutDeviation({
            token,
            clockOutAt,
          });
          devLog("Clock-out deviation check (isDriver=false):", {
            showModal: deviationCheck?.showModal,
            minutesAfterEnd: deviationCheck?.details?.minutesAfterEnd,
            thresholdMinutes: deviationCheck?.details?.thresholdMinutes,
          });
          if (deviationCheck.showModal && deviationCheck.details) {
            devLog("Showing clock-out deviation modal");
            setPendingClockOutPayload({
              token,
              deviceInfo,
              location,
              localTimestamp,
            });
            setClockOutDeviationDetails(deviationCheck.details);
            openModal("clockOutDeviation");
            return;
          }
          timeOutPayload = { ...payload, punchType: "REGULAR" };
          devLog("Time-out payload: punchType = REGULAR (isDriver=false)");
        } else {
          const clockOutAt = new Date();
          const deviationCheck = await checkClockOutDeviation({
            token,
            clockOutAt,
          });
          devLog("Clock-out deviation check:", {
            showModal: deviationCheck?.showModal,
            minutesAfterEnd: deviationCheck?.details?.minutesAfterEnd,
            minutesBeforeNextStart:
              deviationCheck?.details?.minutesBeforeNextStart,
          });
          if (deviationCheck.showModal && deviationCheck.details) {
            devLog("Showing clock-out deviation modal");
            setPendingClockOutPayload({
              token,
              deviceInfo,
              location,
              localTimestamp,
            });
            setClockOutDeviationDetails(deviationCheck.details);
            openModal("clockOutDeviation");
            return;
          }
          timeOutPayload = { ...payload, punchType: "DRIVER_AIDE_PM" };
          devLog("Time-out payload: punchType = DRIVER_AIDE_PM (legacy)");
        }
      } catch (e) {
        devLog("Time-out profile/deviation check error:", e?.message);
      }

      const url = `${API_BASE_URL}/api/timelogs/time-out`;
      const body = timeOutPayload;
      devLog("Punch request:", "/time-out", {
        punchType: body.punchType,
        localTimestamp: body.localTimestamp,
      });
      try {
        const res = await axios.post(url, body, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 200 || res.status === 201) {
          devLog("Punch success:", "/time-out", res.data?.message);
          Alert.alert("Success", res.data.message);
          resetAllStates();
        }
      } catch (err) {
        if (err?.response?.data?.message) {
          Alert.alert("Error", err.response.data.message);
        } else {
          Alert.alert("Error", "Punch failed. Please try again.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Modal content
  const renderModalContent = () => {
    if (clockOutConfirmModalVisible) {
      const s = clockOutConfirmSchedule;
      return (
        <ScrollView
          style={{ maxHeight: height * 0.72 }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: modalContentBottomPadding,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          bounces
        >
          <View className="items-center mb-6">
            <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center mb-4">
              <Ionicons name="log-out-outline" size={32} color="#475569" />
            </View>
            <Text className="text-2xl font-bold text-slate-900 mb-2 text-center">
              Clock out?
            </Text>
            <Text className="text-base text-slate-600 text-center px-2 leading-5">
              You are about to record your time out. Confirm to finish your
              shift.
            </Text>
          </View>

          {s?.status === "in_shift" && s.shiftEnd && (
            <View className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-200 shadow-sm">
              <View className="flex-row items-center mb-2">
                <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center mr-3">
                  <Ionicons name="calendar-outline" size={18} color="#3b82f6" />
                </View>
                <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                  Scheduled shift
                </Text>
              </View>
              <Text className="text-base font-semibold text-slate-800 ml-11 mb-1">
                Ends{" "}
                {new Date(s.shiftEnd).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </Text>
              <View className="ml-11 mt-2">
                <View className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-lg self-start">
                  <Ionicons name="time" size={14} color="#2563eb" />
                  <Text className="text-xs font-medium text-blue-800 ml-1.5">
                    {Number.isFinite(s.minutesUntilShiftEnd)
                      ? s.minutesUntilShiftEnd === 0
                        ? "Less than 1 minute until scheduled shift end"
                        : `${s.minutesUntilShiftEnd} minute${s.minutesUntilShiftEnd === 1 ? "" : "s"} until scheduled shift end`
                      : ""}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {s?.status === "after_scheduled_end" && s.shiftEnd && (
            <View className="bg-amber-50 rounded-2xl p-5 mb-6 border border-amber-200 shadow-sm">
              <View className="flex-row items-center mb-2">
                <View className="w-8 h-8 rounded-full bg-amber-100 items-center justify-center mr-3">
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color="#d97706"
                  />
                </View>
                <Text className="text-sm font-semibold text-amber-900 uppercase tracking-wide">
                  Past scheduled end
                </Text>
              </View>
              <Text className="text-base text-amber-950 ml-11 leading-5">
                Your shift was scheduled to end at{" "}
                {new Date(s.shiftEnd).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
                .
                {Number.isFinite(s.minutesPastScheduledEnd) &&
                s.minutesPastScheduledEnd > 0
                  ? ` (${s.minutesPastScheduledEnd} minute${s.minutesPastScheduledEnd === 1 ? "" : "s"} after scheduled end)`
                  : ""}
              </Text>
            </View>
          )}

          {s?.status === "not_in_shift" && (
            <View className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-200">
              <Text className="text-sm text-slate-600 text-center leading-5">
                You have shifts on your schedule, but this time is not inside a
                scheduled shift window.
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={() => {
              const p = pendingClockOutConfirmPayload;
              if (p) pendingClockOutAfterConfirmRef.current = p;
              closeModal();
            }}
            className="py-4 rounded-2xl items-center justify-center bg-slate-900 mb-3"
            activeOpacity={0.88}
          >
            <Text className="text-white font-bold text-base">Clock out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={closeModal}
            className="py-3.5 rounded-2xl items-center justify-center bg-slate-100 border border-slate-200"
            activeOpacity={0.85}
          >
            <Text className="text-slate-700 font-semibold text-base">
              Cancel
            </Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    if (clockInEarlyModalVisible) {
      const d = clockInEarlyDetails;
      return (
        <ScrollView
          style={{ maxHeight: height * 0.72 }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: modalContentBottomPadding,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          bounces
        >
          <View className="items-center mb-6">
            <View className="w-16 h-16 rounded-full bg-amber-100 items-center justify-center mb-4">
              <Ionicons name="time-outline" size={32} color="#f59e0b" />
            </View>
            <Text className="text-2xl font-bold text-slate-900 mb-2 text-center">
              Clock-In Time Notice
            </Text>
            <Text className="text-base text-slate-600 text-center px-2 leading-5">
              {`You are clocking in ${d?.thresholdMinutes ?? CLOCK_OUT_DEVIATION_THRESHOLD_MINUTES} or more minutes before your scheduled shift start (company driver/aide threshold).`}
            </Text>
            <Text className="text-sm text-slate-500 text-center px-2 leading-5 mt-3">
              Choose how to record this time-in:{" "}
              <Text className="font-semibold text-slate-700">Regular</Text> or{" "}
              <Text className="font-semibold text-slate-700">
                Driver / Aide (AM)
              </Text>{" "}
              (<Text className="font-mono text-xs">DRIVER_AIDE_AM</Text>).
            </Text>
          </View>
          <View className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-200 shadow-sm">
            <View className="mb-4">
              <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Clock-In Time
              </Text>
              <Text className="text-lg font-bold text-slate-900">
                {d?.clockInAt
                  ? new Date(d.clockInAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—"}
              </Text>
            </View>
            <View className="h-px bg-slate-200 my-4" />
            <View>
              <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Scheduled Shift Start
              </Text>
              <Text className="text-base font-semibold text-slate-800">
                {d?.scheduledShiftStart
                  ? new Date(d.scheduledShiftStart).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—"}
              </Text>
              {Number.isFinite(d?.minutesEarly) && (
                <View className="mt-2">
                  <View className="flex-row items-center bg-amber-50 px-3 py-1.5 rounded-lg self-start">
                    <Ionicons name="time" size={14} color="#f59e0b" />
                    <Text className="text-xs font-medium text-amber-700 ml-1.5">
                      {d.minutesEarly} minutes before scheduled start
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Action: Regular vs Driver/Aide AM (non-drivers clocking in early) */}
          <View className="flex-row gap-4 justify-center items-stretch">
            <TouchableOpacity
              onPress={async () => {
                const pending = pendingClockInPayload;
                if (pending) {
                  devLog("Modal: Regular punch clock-in (REGULAR)");
                  try {
                    const res = await axios.post(
                      `${API_BASE_URL}/api/timelogs/time-in`,
                      {
                        deviceInfo: pending.deviceInfo,
                        location: pending.location,
                        localTimestamp: pending.localTimestamp,
                        punchType: "REGULAR",
                      },
                      { headers: { Authorization: `Bearer ${pending.token}` } },
                    );
                    if (res.status === 200 || res.status === 201) {
                      Alert.alert("Success", res.data.message);
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
                      closeModal();
                    }
                  } catch (err) {
                    Alert.alert(
                      "Error",
                      err?.response?.data?.message ||
                        "Punch failed. Please try again.",
                    );
                  }
                  return;
                }
                closeModal();
              }}
              className="flex-1 items-center justify-center py-5 rounded-xl border-2 border-slate-200 bg-slate-50"
              activeOpacity={0.85}
            >
              <View className="w-14 h-14 rounded-full bg-slate-200 items-center justify-center mb-2">
                <Ionicons name="time-outline" size={28} color="#475569" />
              </View>
              <Text className="text-slate-700 font-semibold text-sm text-center">
                Regular punch
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                const pending = pendingClockInPayload;
                if (pending) {
                  devLog("Modal: Driver/Aide clock-in (DRIVER_AIDE_AM)");
                  try {
                    const res = await axios.post(
                      `${API_BASE_URL}/api/timelogs/time-in`,
                      {
                        deviceInfo: pending.deviceInfo,
                        location: pending.location,
                        localTimestamp: pending.localTimestamp,
                        punchType: "DRIVER_AIDE_AM",
                      },
                      { headers: { Authorization: `Bearer ${pending.token}` } },
                    );
                    if (res.status === 200 || res.status === 201) {
                      Alert.alert("Success", res.data.message);
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
                      closeModal();
                    }
                  } catch (err) {
                    Alert.alert(
                      "Error",
                      err?.response?.data?.message ||
                        "Punch failed. Please try again.",
                    );
                  }
                  return;
                }
                closeModal();
              }}
              className="flex-1 items-center justify-center py-5 rounded-xl border-2 border-amber-400 bg-amber-50"
              activeOpacity={0.85}
              style={{
                shadowColor: "#f59e0b",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <View className="w-14 h-14 rounded-full bg-amber-400 items-center justify-center mb-2">
                <Ionicons name="person-outline" size={28} color="#fff" />
              </View>
              <Text className="text-amber-800 font-semibold text-sm text-center">
                Driver / Aide (AM)
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    if (noScheduledShiftClockInModalVisible) {
      const confirmNoScheduleClockIn = async () => {
        const pending = pendingClockInPayload;
        if (!pending) {
          closeModal();
          return;
        }
        try {
          const reqBody = {
            deviceInfo: pending.deviceInfo,
            location: pending.location,
            localTimestamp: pending.localTimestamp,
          };
          if (pending.punchType) {
            reqBody.punchType = pending.punchType;
          }
          const trimmedNotes = noScheduledShiftClockInNotes.trim();
          if (trimmedNotes) {
            reqBody.remarks = trimmedNotes;
          }
          const res = await axios.post(
            `${API_BASE_URL}/api/timelogs/time-in`,
            reqBody,
            { headers: { Authorization: `Bearer ${pending.token}` } },
          );
          if (res.status === 200 || res.status === 201) {
            Alert.alert("Success", res.data.message);
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
            closeModal();
          }
        } catch (err) {
          Alert.alert(
            "Error",
            err?.response?.data?.message || "Punch failed. Please try again.",
          );
        }
      };

      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%", flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 4,
              paddingBottom: modalContentBottomPadding + 12,
            }}
          >
            <View className="items-center mb-5">
              <View
                className="w-[72px] h-[72px] rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: "#fff7ed" }}
              >
                <Ionicons name="calendar-outline" size={36} color="#ea580c" />
              </View>
              <Text className="text-xl font-bold text-slate-900 text-center tracking-tight">
                No shift on your schedule
              </Text>
              <Text className="text-base text-slate-500 text-center mt-2.5 leading-6 px-1">
                Nothing is assigned for you right now. You can still clock
                in—add a short note if your team should know why.
              </Text>
            </View>

            <View
              className="flex-row rounded-2xl p-4 mb-5 border"
              style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}
            >
              <Ionicons
                name="information-circle"
                size={22}
                color="#d97706"
                style={{ marginTop: 1 }}
              />
              <Text className="flex-1 ml-3 text-sm text-amber-950 leading-5">
                Your time-in will be recorded the same as a normal punch.
              </Text>
            </View>

            <View className="mb-6">
              <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Note (optional)
              </Text>
              <TextInput
                multiline
                value={noScheduledShiftClockInNotes}
                onChangeText={setNoScheduledShiftClockInNotes}
                placeholder="e.g. covering for Juan, training, on-call…"
                placeholderTextColor="#94a3b8"
                style={{
                  backgroundColor: "#ffffff",
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                  color: "#0f172a",
                  minHeight: 100,
                  maxHeight: 160,
                  textAlignVertical: "top",
                }}
              />
            </View>

            <TouchableOpacity
              onPress={confirmNoScheduleClockIn}
              className="py-4 rounded-2xl items-center justify-center bg-orange-500 mb-3"
              activeOpacity={0.88}
              style={{
                shadowColor: "#ea580c",
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.25,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              <Text className="text-white font-bold text-base">Clock in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={closeModal}
              className="py-3.5 rounded-2xl items-center justify-center bg-slate-100 border border-slate-200"
              activeOpacity={0.85}
            >
              <Text className="text-slate-700 font-semibold text-base">
                Cancel
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      );
    }

    if (clockOutDeviationModalVisible) {
      const d = clockOutDeviationDetails;
      return (
        <ScrollView
          style={{ maxHeight: height * 0.72 }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: modalContentBottomPadding,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          bounces
        >
          {/* Header Section */}
          <View className="items-center mb-6">
            <View className="w-16 h-16 rounded-full bg-amber-100 items-center justify-center mb-4">
              <Ionicons name="time-outline" size={32} color="#f59e0b" />
            </View>
            <Text className="text-2xl font-bold text-slate-900 mb-2 text-center">
              Clock-Out Time Notice
            </Text>
            <Text className="text-base text-slate-600 text-center px-2 leading-5">
              Your clock-out time is outside your scheduled shift window.
            </Text>
          </View>

          {/* Time Details Card */}
          <View className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-200 shadow-sm">
            {/* Clock-out Time */}
            <View className="mb-4">
              <View className="flex-row items-center mb-2">
                <View className="w-8 h-8 rounded-full bg-amber-100 items-center justify-center mr-3">
                  <Ionicons name="log-out-outline" size={18} color="#f59e0b" />
                </View>
                <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                  Clock-Out Time
                </Text>
              </View>
              <Text className="text-lg font-bold text-slate-900 ml-11">
                {d?.clockOutAt
                  ? new Date(d.clockOutAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—"}
              </Text>
            </View>

            <View className="h-px bg-slate-200 my-4" />

            {/* Last Shift End */}
            <View className="mb-4">
              <View className="flex-row items-center mb-2">
                <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center mr-3">
                  <Ionicons
                    name="arrow-down-circle-outline"
                    size={18}
                    color="#3b82f6"
                  />
                </View>
                <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                  Last Shift Ended
                </Text>
              </View>
              <Text className="text-base font-semibold text-slate-800 ml-11 mb-1">
                {d?.lastShiftEnd
                  ? new Date(d.lastShiftEnd).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—"}
              </Text>
              {Number.isFinite(d?.minutesAfterEnd) && (
                <View className="ml-11 mt-1">
                  <View className="flex-row items-center bg-amber-50 px-3 py-1.5 rounded-lg self-start">
                    <Ionicons name="time" size={14} color="#f59e0b" />
                    <Text className="text-xs font-medium text-amber-700 ml-1.5">
                      {d.minutesAfterEnd} minutes after shift end
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Next Shift Start */}
            <View>
              <View className="flex-row items-center mb-2">
                <View className="w-8 h-8 rounded-full bg-green-100 items-center justify-center mr-3">
                  <Ionicons
                    name="arrow-up-circle-outline"
                    size={18}
                    color="#10b981"
                  />
                </View>
                <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                  Next Shift Starts
                </Text>
              </View>
              <Text className="text-base font-semibold text-slate-800 ml-11 mb-1">
                {d?.nextShiftStart
                  ? new Date(d.nextShiftStart).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—"}
              </Text>
              {Number.isFinite(d?.minutesBeforeNextStart) && (
                <View className="ml-11 mt-1">
                  <View className="flex-row items-center bg-green-50 px-3 py-1.5 rounded-lg self-start">
                    <Ionicons name="time" size={14} color="#10b981" />
                    <Text className="text-xs font-medium text-green-700 ml-1.5">
                      {d.minutesBeforeNextStart} minutes before next shift
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Action: Regular punch or Driver/Aide (icon buttons) */}
          <View className="flex-row gap-4 justify-center items-stretch">
            <TouchableOpacity
              onPress={async () => {
                const pending = pendingClockOutPayload;
                if (pending) {
                  devLog("Modal: Regular punch clock-out (REGULAR)");
                  try {
                    const reqBody = {
                      deviceInfo: pending.deviceInfo,
                      location: pending.location,
                      localTimestamp: pending.localTimestamp,
                      punchType: "REGULAR",
                    };
                    const res = await axios.post(
                      `${API_BASE_URL}/api/timelogs/time-out`,
                      reqBody,
                      { headers: { Authorization: `Bearer ${pending.token}` } },
                    );
                    if (res.status === 200 || res.status === 201) {
                      if (d?.clockOutAt) {
                        await storeClockOutDeviationResponse({
                          ...d,
                          clockOutAt: new Date(d.clockOutAt).toISOString(),
                          lastShiftEnd: d?.lastShiftEnd
                            ? new Date(d.lastShiftEnd).toISOString()
                            : null,
                          nextShiftStart: d?.nextShiftStart
                            ? new Date(d.nextShiftStart).toISOString()
                            : null,
                          workedAsAide: false,
                          recordedAt: new Date().toISOString(),
                        });
                      }
                      Alert.alert("Success", res.data.message);
                      resetAllStates();
                      closeModal();
                    }
                  } catch (err) {
                    Alert.alert(
                      "Error",
                      err?.response?.data?.message ||
                        "Punch failed. Please try again.",
                    );
                  }
                  return;
                }
                if (d?.clockOutAt) {
                  await storeClockOutDeviationResponse({
                    ...d,
                    clockOutAt: new Date(d.clockOutAt).toISOString(),
                    lastShiftEnd: d?.lastShiftEnd
                      ? new Date(d.lastShiftEnd).toISOString()
                      : null,
                    nextShiftStart: d?.nextShiftStart
                      ? new Date(d.nextShiftStart).toISOString()
                      : null,
                    workedAsAide: false,
                    recordedAt: new Date().toISOString(),
                  });
                }
                closeModal();
              }}
              className="flex-1 items-center justify-center py-5 rounded-xl border-2 border-slate-200 bg-slate-50"
              activeOpacity={0.85}
            >
              <View className="w-14 h-14 rounded-full bg-slate-200 items-center justify-center mb-2">
                <Ionicons name="time-outline" size={28} color="#475569" />
              </View>
              <Text className="text-slate-700 font-semibold text-sm text-center">
                Regular punch
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                const pending = pendingClockOutPayload;
                if (pending) {
                  devLog("Modal: Driver/Aide clock-out (DRIVER_AIDE_PM)");
                  try {
                    const reqBody = {
                      deviceInfo: pending.deviceInfo,
                      location: pending.location,
                      localTimestamp: pending.localTimestamp,
                      punchType: "DRIVER_AIDE_PM",
                    };
                    const res = await axios.post(
                      `${API_BASE_URL}/api/timelogs/time-out`,
                      reqBody,
                      { headers: { Authorization: `Bearer ${pending.token}` } },
                    );
                    if (res.status === 200 || res.status === 201) {
                      if (d?.clockOutAt) {
                        await storeClockOutDeviationResponse({
                          ...d,
                          clockOutAt: new Date(d.clockOutAt).toISOString(),
                          lastShiftEnd: d?.lastShiftEnd
                            ? new Date(d.lastShiftEnd).toISOString()
                            : null,
                          nextShiftStart: d?.nextShiftStart
                            ? new Date(d.nextShiftStart).toISOString()
                            : null,
                          workedAsAide: true,
                          recordedAt: new Date().toISOString(),
                        });
                      }
                      Alert.alert("Success", res.data.message);
                      resetAllStates();
                      closeModal();
                    }
                  } catch (err) {
                    Alert.alert(
                      "Error",
                      err?.response?.data?.message ||
                        "Punch failed. Please try again.",
                    );
                  }
                  return;
                }
                if (d?.clockOutAt) {
                  await storeClockOutDeviationResponse({
                    ...d,
                    clockOutAt: new Date(d.clockOutAt).toISOString(),
                    lastShiftEnd: d?.lastShiftEnd
                      ? new Date(d.lastShiftEnd).toISOString()
                      : null,
                    nextShiftStart: d?.nextShiftStart
                      ? new Date(d.nextShiftStart).toISOString()
                      : null,
                    workedAsAide: true,
                    recordedAt: new Date().toISOString(),
                  });
                }
                closeModal();
              }}
              className="flex-1 items-center justify-center py-5 rounded-xl border-2 border-amber-400 bg-amber-50"
              activeOpacity={0.85}
              style={{
                shadowColor: "#f59e0b",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <View className="w-14 h-14 rounded-full bg-amber-400 items-center justify-center mb-2">
                <Ionicons name="person-outline" size={28} color="#fff" />
              </View>
              <Text className="text-amber-800 font-semibold text-sm text-center">
                Driver / Aide
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    if (networkModalVisible) {
      return (
        <View className="p-5">
          <Text className="text-xl font-bold text-slate-800 mb-4 text-center">
            Network Details
          </Text>
          <View className="bg-slate-50 rounded-xl p-4 mb-6">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                <Ionicons name="wifi" size={20} color="#f97316" />
              </View>
              <Text className="text-lg font-semibold text-slate-700">
                {wifiConnected ? "Connected" : "Disconnected"}
              </Text>
            </View>
            <Text className="text-base text-slate-700">
              Internet is required to sync time logs unless you have Pro (time
              in/out only). Location-restricted users must also have location
              enabled.
            </Text>
          </View>
          <TouchableOpacity
            onPress={closeModal}
            className="bg-orange-400 py-3.5 rounded-xl items-center justify-center"
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      );
    } else if (locationModalVisible) {
      return (
        <View className="p-5">
          <Text className="text-xl font-bold text-slate-800 mb-4 text-center">
            Location Services
          </Text>
          <View className="bg-slate-50 rounded-xl p-4 mb-6">
            <View className="flex-row items-center mb-4">
              <View
                className={`w-10 h-10 rounded-full ${locationEnabled ? "bg-orange-100" : "bg-slate-100"} items-center justify-center mr-3`}
              >
                <Ionicons name="location" size={20} color="#f97316" />
              </View>
              <Text className="text-lg font-semibold text-slate-700">
                {locationEnabled ? "Enabled" : "Disabled"}
              </Text>
            </View>
            <Text className="text-base text-slate-700">
              We only request your location for Time In/Out if needed. This is
              not continuous tracking.
            </Text>
          </View>
          <TouchableOpacity
            onPress={closeModal}
            className="bg-orange-400 py-3.5 rounded-xl items-center justify-center"
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      );
    } else if (subscriptionModalVisible) {
      return (
        <View className="p-5">
          <Text className="text-xl font-bold text-slate-800 mb-4 text-center">
            Package Details
          </Text>
          <View className="bg-slate-50 rounded-xl p-4 mb-6">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                <Ionicons name="pricetag-outline" size={20} color="#f97316" />
              </View>
              <Text className="text-lg font-semibold text-slate-700">
                {subscriptionPlan || "Loading..."}
              </Text>
            </View>
            {subscriptionPlan && subscriptionPlan.toLowerCase() === "pro" ? (
              <Text className="text-base text-slate-700">
                As a Pro user, you can do offline time in/out (unless you're
                location-restricted).
              </Text>
            ) : (
              <Text className="text-base text-slate-700">
                Your current package does not allow offline punching. Please
                remain connected.
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={closeModal}
            className="bg-orange-400 py-3.5 rounded-xl items-center justify-center"
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  const isPunchLocationBlocked = isLocationRestricted && !isWithinPunchLocation;
  const androidBottomInset =
    Platform.OS === "android" ? Math.max(insets.bottom, 28) : insets.bottom;
  const mainScrollBottomPadding =
    Platform.OS === "android" ? androidBottomInset + 40 : 32;
  const modalContentBottomPadding =
    Platform.OS === "android"
      ? androidBottomInset + 16
      : Math.max(insets.bottom, 20);
  const modalSheetBottomPadding =
    Platform.OS === "android" ? androidBottomInset + 8 : 0;

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
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: mainScrollBottomPadding,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {/* Status cards */}
          <View className="flex-row justify-between mb-6 gap-2">
            {/* Network */}
            <TouchableOpacity
              className="flex-1 bg-slate-50 rounded-xl p-2 active:opacity-80"
              onPress={() => openModal("network")}
            >
              <View className="flex-row items-center">
                <View
                  className={`w-7 h-7 rounded-full ${wifiConnected ? "bg-orange-100" : "bg-slate-100"} items-center justify-center mr-2`}
                >
                  <Ionicons
                    name="wifi"
                    size={16}
                    color={wifiConnected ? "#fb923c" : "#94a3b8"}
                  />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">Network</Text>
                  <Text className="text-sm font-medium text-slate-700">
                    {wifiConnected ? "Connected" : "Disconnected"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Location */}
            <TouchableOpacity
              className="flex-1 bg-slate-50 rounded-xl p-2 active:opacity-80"
              onPress={() => openModal("location")}
            >
              <View className="flex-row items-center">
                <View
                  className={`w-7 h-7 rounded-full ${locationEnabled ? "bg-orange-100" : "bg-slate-100"} items-center justify-center mr-2`}
                >
                  <Ionicons
                    name="location"
                    size={16}
                    color={locationEnabled ? "#fb923c" : "#94a3b8"}
                  />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">Location</Text>
                  <Text className="text-sm font-medium text-slate-700">
                    {locationEnabled ? "Enabled" : "Disabled"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Subscription/Package */}
            <TouchableOpacity
              className="flex-1 bg-slate-50 rounded-xl p-2 active:opacity-80"
              onPress={() => openModal("subscription")}
            >
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-full bg-orange-100 items-center justify-center mr-2">
                  <Ionicons name="pricetag-outline" size={16} color="#fb923c" />
                </View>
                <View>
                  <Text className="text-xs text-slate-500">Package</Text>
                  <Text className="text-sm font-medium text-slate-700">
                    {subscriptionPlan || "Loading..."}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Main status card */}
          <Animated.View
            className="bg-slate-50 rounded-xl p-5 mb-6 "
            style={{ transform: [{ scale: pulseAnim }] }}
          >
            <View className="items-center mb-4">
              <View
                className={`w-16 h-16 rounded-full items-center justify-center mb-2 ${isTimeIn ? "bg-orange-100" : "bg-slate-100"}`}
              >
                <Ionicons
                  name="time-outline"
                  size={32}
                  color={isTimeIn ? "#fb923c" : "#94a3b8"}
                />
              </View>
              <Text className="text-2xl font-bold text-slate-800">
                {isTimeIn ? "On the Clock" : "Off the Clock"}
              </Text>
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
                  <Text className="ml-2 text-sm font-medium text-slate-700">
                    Session Time
                  </Text>
                </View>
                <Text className="text-base font-semibold text-slate-800">
                  {formatTime(sessionElapsed)}
                </Text>
              </View>
            </View>

            {/* Coffee */}
            <View className="bg-white rounded-lg p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Feather name="coffee" size={16} color="#f97316" />
                  <Text className="ml-2 text-sm font-medium text-slate-700">
                    Coffee Break
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-base font-semibold text-slate-800">
                    {formatTime(totalCoffeeTime)}
                  </Text>
                  {isCoffeeBreakActive && (
                    <View className="ml-2 w-2 h-2 rounded-full bg-orange-400" />
                  )}
                </View>
              </View>
              <Text className="text-xs text-slate-500 mt-1">
                {coffeeBreakCount}/2 breaks used
              </Text>
            </View>

            {/* Lunch */}
            <View className="bg-white rounded-lg p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Feather name="coffee" size={16} color="#f97316" />
                  <Text className="ml-2 text-sm font-medium text-slate-700">
                    Lunch Break
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-base font-semibold text-slate-800">
                    {formatTime(totalLunchTime)}
                  </Text>
                  {isLunchBreakActive && (
                    <View className="ml-2 w-2 h-2 rounded-full bg-orange-400" />
                  )}
                </View>
              </View>
            </View>
          </Animated.View>

          <TouchableOpacity
            onPress={openPunchLogRequestModal}
            className="mb-4 py-3 rounded-xl border border-orange-300 bg-orange-50 flex-row items-center justify-center active:opacity-80"
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={20} color="#ea580c" />
            <Text className="text-orange-600 font-semibold ml-2">
              Request Punch Log
            </Text>
          </TouchableOpacity>

          {/* Time In/Out button */}
          {isPunchLocationBlocked && (
            <View className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <Text className="text-sm text-red-700">
                {punchLocationErrorMessage ||
                  "You are outside your assigned punch location."}
              </Text>
            </View>
          )}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              onPress={handlePunch}
              disabled={
                loading || !companySettingsFetched || isPunchLocationBlocked
              }
              className={`py-4 rounded-lg items-center justify-center mb-4 ${
                isPunchLocationBlocked
                  ? "bg-slate-300"
                  : isTimeIn
                    ? "bg-slate-500"
                    : "bg-orange-400"
              } ${!companySettingsFetched || isPunchLocationBlocked ? "opacity-60" : ""}`}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : !companySettingsFetched ? (
                <View className="flex-row items-center justify-center px-2">
                  <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
                  <Text className="text-white text-base font-bold shrink">
                    Loading punch settings…
                  </Text>
                </View>
              ) : (
                <Text className="text-white text-lg font-bold">
                  {isTimeIn ? "Time Out" : "Time In"}
                </Text>
              )}
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
                  disabled={
                    loading || (!isCoffeeBreakActive && coffeeBreakCount >= 2)
                  }
                  className={`py-3.5 rounded-lg items-center justify-center ${
                    isCoffeeBreakActive
                      ? "bg-slate-500"
                      : coffeeBreakCount >= 2
                        ? "bg-slate-300"
                        : "bg-orange-400"
                  }`}
                  activeOpacity={0.8}
                >
                  <View className="flex-row items-center">
                    <Feather name="coffee" size={16} color="#fff" />
                    <Text className="text-white font-semibold ml-2">
                      {isCoffeeBreakActive ? "End Coffee" : "Coffee Break"}
                    </Text>
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
                  disabled={
                    loading || (!isLunchBreakActive && totalLunchTime > 0)
                  }
                  className={`py-3.5 rounded-lg items-center justify-center ${
                    isLunchBreakActive
                      ? "bg-slate-500"
                      : totalLunchTime > 0
                        ? "bg-slate-300"
                        : "bg-orange-400"
                  }`}
                  activeOpacity={0.8}
                >
                  <View className="flex-row items-center">
                    <Feather name="coffee" size={16} color="#fff" />
                    <Text className="text-white font-semibold ml-2">
                      {isLunchBreakActive ? "End Lunch" : "Lunch Break"}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      <Modal
        visible={punchLogRequestModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={closePunchLogRequestModal}
      >
        <View style={{ flex: 1 }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}
          >
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)" }}
                activeOpacity={1}
                onPress={closePunchLogRequestModal}
              />
              <TouchableWithoutFeedback
                onPress={Keyboard.dismiss}
                accessible={false}
              >
                <View
                  className="bg-white rounded-t-2xl"
                  style={{
                    maxHeight: height * 0.92,
                    paddingBottom: modalContentBottomPadding,
                  }}
                >
                  <View className="flex-row items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
                    <Text className="text-lg font-bold text-slate-800">
                      Request punch log
                    </Text>
                    <TouchableOpacity
                      onPress={closePunchLogRequestModal}
                      hitSlop={12}
                    >
                      <Ionicons name="close" size={26} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    scrollEnabled={
                      !(plReqDateModalVisible || plTimeModalVisible)
                    }
                    contentContainerStyle={{
                      paddingHorizontal: 16,
                      paddingTop: 12,
                      paddingBottom: 24,
                    }}
                  >
                    <Text className="text-sm text-slate-500 mb-4">
                      Submit missing or corrected times for approval. Date and
                      times are sent as you pick them on this device (local
                      time, no timezone conversion). Clock-in and clock-out must
                      not be in the future.
                    </Text>

                    <Text className="text-base font-semibold text-slate-800 mb-2">
                      Requested date <Text className="text-red-500">*</Text>
                    </Text>
                    <TouchableOpacity
                      className="py-3 px-4 bg-slate-50 rounded-lg mb-4 flex-row justify-between items-center"
                      onPress={() => {
                        dismissPlTimePickerSheet();
                        setPlApproverOpen(false);
                        setPlReqDateModalVisible(true);
                      }}
                    >
                      <Text className="text-slate-800">
                        {plReqDate.toLocaleDateString()}
                      </Text>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color="#6B7280"
                      />
                    </TouchableOpacity>

                    <Text className="text-base font-semibold text-slate-800 mb-2">
                      Requested clock-in <Text className="text-red-500">*</Text>
                    </Text>
                    <TouchableOpacity
                      className="py-3 px-4 bg-slate-50 rounded-lg mb-4 flex-row justify-between items-center"
                      onPress={() => openPlRequestTimePicker("in")}
                    >
                      <Text className="text-slate-800">
                        {plClockInTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      <Ionicons name="time-outline" size={18} color="#6B7280" />
                    </TouchableOpacity>

                    <Text className="text-base font-semibold text-slate-800 mb-2">
                      Requested clock-out{" "}
                      <Text className="text-red-500">*</Text>
                    </Text>
                    <TouchableOpacity
                      className="py-3 px-4 bg-slate-50 rounded-lg mb-4 flex-row justify-between items-center"
                      onPress={() => openPlRequestTimePicker("out")}
                    >
                      <Text className="text-slate-800">
                        {plClockOutTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      <Ionicons name="time-outline" size={18} color="#6B7280" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      className="flex-row items-center mb-4 py-1"
                      onPress={() =>
                        setPlClockOutCrossesNextDay((prev) => !prev)
                      }
                      activeOpacity={0.7}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: plClockOutCrossesNextDay,
                      }}
                    >
                      <View
                        className={`w-6 h-6 rounded border mr-3 items-center justify-center ${
                          plClockOutCrossesNextDay
                            ? "bg-orange-500 border-orange-500"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {plClockOutCrossesNextDay ? (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        ) : null}
                      </View>
                      <Text className="text-slate-700 flex-shrink">
                        Clock-out crosses next day?
                      </Text>
                    </TouchableOpacity>

                    <Text className="text-xs text-slate-500 mb-1">
                      Clock-in will be sent as local time (e.g.{" "}
                      {formatNaiveLocalDateTimeFromPickers(
                        plReqDate,
                        plClockInTime,
                      ) ?? "—"}
                      ). Turn on{" "}
                      <Text className="font-medium text-slate-600">
                        Clock-out crosses next day?
                      </Text>{" "}
                      if out-time is on the next calendar day.
                    </Text>

                    <View className="mb-4 mt-2" style={{ zIndex: 8000 }}>
                      <Text className="text-base font-semibold text-slate-800 mb-2">
                        Approver <Text className="text-red-500">*</Text>
                      </Text>
                      {plApproversLoading ? (
                        <ActivityIndicator color="#ea580c" />
                      ) : (
                        <DropDownPicker
                          open={plApproverOpen}
                          value={plApproverValue}
                          items={plApproverItems}
                          setOpen={(open) => {
                            setPlApproverOpen(open);
                            if (open) {
                              setPlReqDateModalVisible(false);
                              dismissPlTimePickerSheet();
                              Keyboard.dismiss();
                            }
                          }}
                          setValue={setPlApproverValue}
                          setItems={setPlApproverItems}
                          placeholder="Select approver"
                          textStyle={{ color: "#374151" }}
                          style={{
                            borderColor: "#F1F5F9",
                            backgroundColor: "#F8FAFC",
                            minHeight: 50,
                          }}
                          dropDownContainerStyle={{
                            borderColor: "#F1F5F9",
                            backgroundColor: "#F9FAFB",
                            maxHeight: 220,
                          }}
                          placeholderStyle={{ color: "#9CA3AF" }}
                          zIndex={8000}
                          zIndexInverse={6000}
                          listMode="SCROLLVIEW"
                          nestedScrollEnabled
                          scrollViewProps={{ nestedScrollEnabled: true }}
                          autoScroll={false}
                        />
                      )}
                    </View>

                    <View style={{ zIndex: 1 }}>
                      <Text className="text-base font-semibold text-slate-800 mb-2">
                        Reason (optional)
                      </Text>
                      <TextInput
                        className="border border-slate-200 rounded-lg px-3 py-3 text-slate-800 mb-4 bg-white"
                        placeholder="e.g. Forgot to clock in"
                        placeholderTextColor="#94a3b8"
                        multiline
                        value={plReason}
                        onChangeText={setPlReason}
                        style={{ minHeight: 72, textAlignVertical: "top" }}
                      />

                      <Text className="text-base font-semibold text-slate-800 mb-2">
                        Description (optional)
                      </Text>
                      <TextInput
                        className="border border-slate-200 rounded-lg px-3 py-3 text-slate-800 mb-4 bg-white"
                        placeholder="e.g. Was on site from opening"
                        placeholderTextColor="#94a3b8"
                        multiline
                        value={plDescription}
                        onChangeText={setPlDescription}
                        style={{ minHeight: 80, textAlignVertical: "top" }}
                      />

                      <TouchableOpacity
                        onPress={submitPunchLogRequest}
                        disabled={plSubmitting || plApproversLoading}
                        className={`py-3.5 rounded-xl items-center ${plSubmitting || plApproversLoading ? "bg-slate-300" : "bg-orange-400"}`}
                      >
                        {plSubmitting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text className="text-white font-bold">
                            Submit request
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </KeyboardAvoidingView>

          {plReqDateModalVisible ? (
            <View
              pointerEvents="box-none"
              style={[
                StyleSheet.absoluteFillObject,
                {
                  zIndex: 50000,
                  elevation: Platform.OS === "android" ? 48 : 0,
                  justifyContent: "center",
                  paddingHorizontal: 24,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  StyleSheet.absoluteFillObject,
                  { backgroundColor: "rgba(15,23,42,0.55)" },
                ]}
                activeOpacity={1}
                onPress={() => setPlReqDateModalVisible(false)}
              />
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 16,
                  padding: 16,
                  width: "100%",
                  maxWidth: 400,
                  alignSelf: "center",
                  zIndex: 50001,
                  elevation: Platform.OS === "android" ? 49 : 0,
                }}
              >
                <Text className="text-lg font-bold text-slate-800 mb-2 text-center">
                  Requested date
                </Text>
                <DateTimePicker
                  value={plReqDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onPlReqDateModalChange}
                  themeVariant={Platform.OS === "ios" ? "light" : undefined}
                  textColor={Platform.OS === "ios" ? "#0f172a" : undefined}
                  style={Platform.OS === "ios" ? { width: "100%" } : undefined}
                />
                {Platform.OS === "ios" && (
                  <TouchableOpacity
                    onPress={() => setPlReqDateModalVisible(false)}
                    className="bg-orange-400 py-3 rounded-xl items-center mt-2"
                  >
                    <Text className="text-white font-bold">Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : null}

          {plTimeModalVisible &&
          (plTimeModalKind === "in" || plTimeModalKind === "out") ? (
            <View
              pointerEvents="box-none"
              style={[
                StyleSheet.absoluteFillObject,
                {
                  zIndex: 50000,
                  elevation: Platform.OS === "android" ? 48 : 0,
                  justifyContent: "center",
                  paddingHorizontal: 24,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  StyleSheet.absoluteFillObject,
                  { backgroundColor: "rgba(15,23,42,0.55)" },
                ]}
                activeOpacity={1}
                onPress={dismissPlTimePickerSheet}
              />
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 16,
                  padding: 16,
                  width: "100%",
                  maxWidth: 400,
                  alignSelf: "center",
                  zIndex: 50001,
                  elevation: Platform.OS === "android" ? 49 : 0,
                }}
              >
                <Text className="text-lg font-bold text-slate-800 mb-2 text-center">
                  {plTimeModalKind === "out"
                    ? "Clock out time"
                    : "Clock in time"}
                </Text>
                <DateTimePicker
                  key={`pl-request-time-${plTimeModalKind}-${plTimePickerSessionRef.current}`}
                  value={
                    Platform.OS === "ios"
                      ? cloneJsDate(
                          combineDateAndTime(
                            IOS_PL_REQ_LOG_TIME_PICKER_ANCHOR_DATE,
                            plTimeModalValue,
                          ),
                        )
                      : plTimeModalValue
                  }
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  is24Hour={Platform.OS === "android" ? true : undefined}
                  onChange={onPlTimeModalChange}
                  themeVariant={Platform.OS === "ios" ? "light" : undefined}
                  textColor={Platform.OS === "ios" ? "#0f172a" : undefined}
                  style={Platform.OS === "ios" ? { width: "100%" } : undefined}
                />
                {Platform.OS === "ios" && (
                  <TouchableOpacity
                    onPress={dismissPlTimePickerSheet}
                    className="bg-orange-400 py-3 rounded-xl items-center mt-2"
                  >
                    <Text className="text-white font-bold">Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Bottom-sheet modals */}
      {(networkModalVisible ||
        locationModalVisible ||
        subscriptionModalVisible ||
        clockOutDeviationModalVisible ||
        clockOutConfirmModalVisible ||
        clockInEarlyModalVisible ||
        noScheduledShiftClockInModalVisible) && (
        <Modal
          transparent
          animationType="none"
          visible
          onRequestClose={closeModal}
        >
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
                paddingBottom: modalSheetBottomPadding,
              }}
            >
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
}
