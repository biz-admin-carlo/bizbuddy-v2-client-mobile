// app/(tabs)/(leaves)/leaves-request.jsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import DropDownPicker from "react-native-dropdown-picker";
import { useRouter, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import {
  API_BASE_URL,
  DEFAULT_SHIFT_DISPLAY_TIMEZONE,
} from "../../../config/constant";
import { formatLocalTimeHm } from "../../../utils/dateOnlyUtils";
import { buildShiftWindowFromUserShift } from "../../../utils/timekeepingShiftUtils";
import { parseApproversPayload } from "../../../utils/approversPayload";

const { height } = Dimensions.get("window");

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MIN_LEAVE_REASON_LENGTH = 10;

const getLocalDateKey = (dateInput) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDateKeyInTimeZone = (dateInput, timeZone) => {
  if (!dateInput) return "";
  const normalizedDateInput = String(dateInput).trim();
  if (DATE_ONLY_REGEX.test(normalizedDateInput)) return normalizedDateInput;
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return "";
  const tz = timeZone || DEFAULT_SHIFT_DISPLAY_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

const getShiftTimeZone = (shift) =>
  shift?.shift?.timeZone ||
  shift?.shift?.time_zone ||
  shift?.timeZone ||
  shift?.time_zone ||
  DEFAULT_SHIFT_DISPLAY_TIMEZONE;

const getShiftDateKey = (shift) =>
  getDateKeyInTimeZone(shift?.assignedDate, getShiftTimeZone(shift));

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

const formatNaiveTimeInZone = (naiveTimeStr) => {
  const t = parseNaiveTime(naiveTimeStr);
  if (!t) return "";
  const h = t.hour % 12 || 12;
  const m = String(t.minute).padStart(2, "0");
  const ampm = t.hour >= 12 ? "PM" : "AM";
  return `${h}:${m} ${ampm}`;
};

/** Compact hour label matching web leave UI (e.g. "3h", "1.5h"). */
const formatCompactHours = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n * 10) / 10;
  const label = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.0$/, "");
  return `${label}h`;
};

// Utility to combine date and time into one
const combineDateAndTime = (date, time) => {
  const combined = new Date(date);
  combined.setHours(time.getHours());
  combined.setMinutes(time.getMinutes());
  combined.setSeconds(time.getSeconds());
  combined.setMilliseconds(time.getMilliseconds());
  return combined;
};

/** Pull an array of balance rows from typical API wrapper shapes */
const extractBalancesList = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const d = payload.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.balances)) return d.balances;
  if (d && Array.isArray(d.items)) return d.items;
  if (Array.isArray(payload.balances)) return payload.balances;
  return [];
};

const balanceRowLabel = (row) =>
  row?.displayName ??
  row?.leaveType ??
  row?.name ??
  row?.type ??
  row?.code ??
  "Leave";

const formatBalanceNumber = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  }
  return String(v);
};

const rowSaysHours = (row) =>
  /hour/i.test(
    String(row?.unit ?? row?.creditUnit ?? row?.balanceUnit ?? row?.type ?? ""),
  );

/**
 * Resolves day vs hour amounts from mixed API shapes.
 * Hour-only payloads (e.g. `{ hours: 40 }` or `{ remainingHours: 8 }`) were
 * previously invisible because only generic "credits" fields were read.
 */
const balanceRowDaysAndHours = (row) => {
  const nested = row?.balance;
  const hours = formatBalanceNumber(
    row?.hours ??
      row?.remainingHours ??
      row?.availableHours ??
      row?.creditHours ??
      row?.balanceHours ??
      row?.hoursRemaining ??
      row?.totalHours ??
      row?.accruedHours ??
      row?.hourBalance ??
      nested?.hours ??
      nested?.remainingHours ??
      nested?.availableHours,
  );

  const daysExplicit = formatBalanceNumber(
    row?.availableDays ??
      row?.daysRemaining ??
      row?.days ??
      row?.dayBalance ??
      row?.remainingDays ??
      nested?.availableDays ??
      nested?.daysRemaining ??
      nested?.days,
  );

  const generic = formatBalanceNumber(
    row?.credits ??
      row?.credit ??
      row?.balance ??
      row?.remainingBalance ??
      row?.remaining ??
      row?.available,
  );

  if (rowSaysHours(row) && hours == null && generic != null) {
    return { days: daysExplicit, hours: generic };
  }

  if (daysExplicit != null) {
    return { days: daysExplicit, hours };
  }

  if (hours != null) {
    return { days: null, hours };
  }

  return { days: generic, hours: null };
};

const creditsHint = (valueStr, kind /* "day" | "hour" */) => {
  if (valueStr == null) return null;
  const n = Number(String(valueStr).replace(",", ""));
  if (!Number.isFinite(n)) return null;
  if (kind === "hour") {
    return n === 1 ? "1 hour available" : `${n} hours available`;
  }
  return n === 1 ? "1 day available" : `${n} days available`;
};

/** Subtle card elevation (NativeWind shadow is inconsistent on Android) */
const balanceCardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  android: { elevation: 2 },
});

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
  const [leaveTypeItems, setLeaveTypeItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateTimeModalVisible, setDateTimeModalVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");
  const [pickerTitle, setPickerTitle] = useState("");
  const [currentDateTimeField, setCurrentDateTimeField] = useState(null);
  /** true = paid leave, false = unpaid */
  const [isPaidLeave, setIsPaidLeave] = useState(true);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [balancesError, setBalancesError] = useState(null);
  const [refreshingBalances, setRefreshingBalances] = useState(false);
  const [userShifts, setUserShifts] = useState([]);

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
    }),
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
        RNAlert.alert(
          "Authentication Error",
          "You are not logged in. Please sign in again.",
          [{ text: "OK", onPress: () => router.replace("(auth)/login-user") }],
        );
        return;
      }
      await Promise.all([
        fetchApprovers(token),
        fetchLeavePolicies(token),
        fetchUserShifts(token),
      ]);
    };
    initialize();
  }, [router]);

  const fetchUserShifts = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/usershifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.data)) {
        setUserShifts(data.data);
      } else {
        setUserShifts([]);
      }
    } catch (error) {
      console.error("Error fetching user shifts:", error);
      setUserShifts([]);
    }
  };

  const fetchLeaveBalances = useCallback(async (token, options = {}) => {
    const soft = options.soft === true;
    if (!soft) {
      setBalancesLoading(true);
      setBalancesError(null);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/leaves/balances`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setLeaveBalances([]);
        setBalancesError(
          data?.message || "We could not load your balances. Try again.",
        );
        return;
      }
      const list = extractBalancesList(data);
      const rows = list.map((row, index) => {
        const { days, hours } = balanceRowDaysAndHours(row);
        return {
          key: String(
            row?.id ?? row?.leaveTypeId ?? `${balanceRowLabel(row)}-${index}`,
          ),
          label: balanceRowLabel(row),
          credits: days,
          hours,
        };
      });
      setLeaveBalances(rows);
      setBalancesError(null);
    } catch (error) {
      console.error("Error fetching leave balances:", error);
      setLeaveBalances([]);
      setBalancesError(
        "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  const onRefreshBalances = useCallback(async () => {
    setRefreshingBalances(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (token) await fetchLeaveBalances(token, { soft: true });
    } finally {
      setRefreshingBalances(false);
    }
  }, [fetchLeaveBalances]);

  const handleRetryBalances = useCallback(async () => {
    const token = await SecureStore.getItemAsync("token");
    if (!token) return;
    await fetchLeaveBalances(token);
  }, [fetchLeaveBalances]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const token = await SecureStore.getItemAsync("token");
        if (!token || cancelled) {
          if (!token) setBalancesLoading(false);
          return;
        }
        await fetchLeaveBalances(token, { soft: true });
      })();
      return () => {
        cancelled = true;
      };
    }, [fetchLeaveBalances]),
  );

  const fetchApprovers = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/leaves/approvers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("[Approvers] raw payload:", JSON.stringify(data));
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

  const fetchLeavePolicies = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/leaves/policies`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      console.log("[Policies] status:", res.status, "ok:", res.ok);
      console.log("[Policies] response:", data);
      if (res.ok) {
        const list = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];

        // IMPORTANT:
        // Backend expects a "type" (e.g. SICK, VACATION) when submitting a leave.
        // Previously we were sending the policy ID as `type`, which causes
        // "leave policy not found for this type" errors.
        //
        // To fix this, we now use the policy's *type-like* field as the
        // dropdown value so `payload.type` matches what the API expects.
        const formatted = list.map((policy) => {
          // This should line up with whatever the backend uses as its type key.
          const typeKey =
            policy?.leaveType ??
            policy?.type ??
            policy?.code ??
            policy?.name ??
            String(policy?.id ?? "");

          const label =
            policy?.displayName ??
            policy?.leaveType ??
            policy?.name ??
            policy?.type ??
            policy?.code ??
            String(policy?.id ?? "");

          return {
            label,
            value: String(typeKey),
          };
        });

        setLeaveTypeItems(formatted);
      } else {
        RNAlert.alert(
          "Error",
          data?.message || "Failed to fetch leave policies.",
        );
      }
    } catch (error) {
      console.error("Error fetching leave policies:", error);
      RNAlert.alert(
        "Error",
        "An error occurred while fetching leave policies.",
      );
    }
  };

  const handleSubmit = async () => {
    animateButtonPress(submitButtonScale);

    if (!leaveType || !approverValue) {
      RNAlert.alert(
        "Incomplete Form",
        "Please fill in all required fields, including selecting an approver.",
      );
      return;
    }
    const trimmedReason = leaveReason.trim();
    if (trimmedReason.length < MIN_LEAVE_REASON_LENGTH) {
      RNAlert.alert(
        "Reason Required",
        `Please provide a reason of at least ${MIN_LEAVE_REASON_LENGTH} characters.`,
      );
      return;
    }
    const combinedStart = combineDateAndTime(leaveStartDate, leaveStartTime);
    const combinedEnd = combineDateAndTime(leaveEndDate, leaveEndTime);
    if (combinedStart > combinedEnd) {
      RNAlert.alert(
        "Invalid Dates",
        "Start Date and Time cannot be after End Date and Time.",
      );
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
      const startIso = combinedStart.toISOString();
      const endIso = combinedEnd.toISOString();
      const payload = {
        type: leaveType,
        fromDate: startIso,
        toDate: endIso,
        startDate: startIso,
        endDate: endIso,
        fromTime: formatLocalTimeHm(combinedStart),
        toTime: formatLocalTimeHm(combinedEnd),
        startTime: formatLocalTimeHm(combinedStart),
        endTime: formatLocalTimeHm(combinedEnd),
        approverId: approverValue,
        leaveReason: trimmedReason,
        isPaid: isPaidLeave,
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
        setIsPaidLeave(true);
        await fetchLeaveBalances(token, { soft: true });
      } else {
        RNAlert.alert(
          "Error",
          data.message || "Failed to submit leave request.",
        );
      }
    } catch (error) {
      console.error("Error submitting leave request:", error);
      RNAlert.alert(
        "Error",
        "There was an issue submitting your leave request.",
      );
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

  const leaveRangeStartKey = getLocalDateKey(leaveStartDate);
  const leaveRangeEndKey = getLocalDateKey(leaveEndDate);
  const affectedShifts = useMemo(() => {
    if (!leaveRangeStartKey || !leaveRangeEndKey) return [];
    const startKey =
      leaveRangeStartKey <= leaveRangeEndKey
        ? leaveRangeStartKey
        : leaveRangeEndKey;
    const endKey =
      leaveRangeStartKey <= leaveRangeEndKey
        ? leaveRangeEndKey
        : leaveRangeStartKey;
    return userShifts
      .filter((userShift) => {
        const shiftDate = getShiftDateKey(userShift);
        return shiftDate && shiftDate >= startKey && shiftDate <= endKey;
      })
      .sort((a, b) => getShiftDateKey(a).localeCompare(getShiftDateKey(b)));
  }, [userShifts, leaveRangeStartKey, leaveRangeEndKey]);

  const selectedLeaveBalance = useMemo(() => {
    if (!leaveType || !leaveBalances.length) return null;
    const normalize = (v) =>
      String(v ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
    const target = normalize(leaveType);
    return (
      leaveBalances.find((row) => {
        const candidates = [row.label, row.key];
        return candidates.some((c) => normalize(c) === target);
      }) ?? null
    );
  }, [leaveType, leaveBalances]);

  const estimatedHoursUsed = useMemo(() => {
    let totalMs = 0;
    if (affectedShifts.length > 0) {
      for (const userShift of affectedShifts) {
        const window = buildShiftWindowFromUserShift(userShift);
        if (window?.start && window?.end) {
          totalMs += Math.max(0, window.end.getTime() - window.start.getTime());
        }
      }
    }
    if (totalMs <= 0) {
      const start = combineDateAndTime(leaveStartDate, leaveStartTime);
      const end = combineDateAndTime(leaveEndDate, leaveEndTime);
      totalMs = Math.max(0, end.getTime() - start.getTime());
    }
    if (totalMs <= 0) return null;
    return totalMs / (1000 * 60 * 60);
  }, [
    affectedShifts,
    leaveStartDate,
    leaveStartTime,
    leaveEndDate,
    leaveEndTime,
  ]);

  const availableBalanceLabel = (() => {
    const hoursLabel = formatCompactHours(selectedLeaveBalance?.hours);
    if (hoursLabel) return `${hoursLabel} available balance`;
    if (selectedLeaveBalance?.credits != null) {
      const n = Number(selectedLeaveBalance.credits);
      if (Number.isFinite(n)) {
        const days = Number.isInteger(n)
          ? String(n)
          : String(Math.round(n * 10) / 10);
        return `${days}d available balance`;
      }
    }
    // Fallback: first balance row that has hours
    for (const row of leaveBalances) {
      const hoursLabel = formatCompactHours(row.hours);
      if (hoursLabel) return `${hoursLabel} available balance`;
    }
    return null;
  })();
  const hoursUsedLabel = formatCompactHours(estimatedHoursUsed);

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
        value={
          isStartPicker
            ? isDatePicker
              ? leaveStartDate
              : leaveStartTime
            : isDatePicker
              ? leaveEndDate
              : leaveEndTime
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
                refreshing={refreshingBalances}
                onRefresh={onRefreshBalances}
                tintColor="#EA580C"
                colors={["#EA580C"]}
                progressViewOffset={Platform.OS === "android" ? 70 : 0}
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
                <View className="flex-row justify-between items-center mb-1">
                  <View>
                    <Text className="text-2xl font-bold text-slate-800">
                      Request Leave
                    </Text>
                    <Text className="text-slate-500">
                      Fill in the details to submit your leave request
                    </Text>
                  </View>
                  {/* <TouchableOpacity
                    onPress={() =>
                      router.push("/(tabs)/(leaves)/leaves-approval")
                    }
                    activeOpacity={0.8}
                    className="ml-3 px-3 py-2 rounded-full bg-slate-100"
                  >
                    <Text className="text-xs font-semibold text-slate-700">
                      View Leave History
                    </Text>
                  </TouchableOpacity> */}
                </View>
              </View>

              {/* Leave credits from GET /api/leaves/balances */}
              <View className="px-5 mb-5">
                <View className="rounded-2xl border border-orange-100 bg-orange-50/60 overflow-hidden">
                  <View className="h-1 bg-orange-400" />
                  <View className="p-4">
                    <View className="flex-row items-start">
                      <View className="w-11 h-11 rounded-2xl bg-orange-100 items-center justify-center mr-3">
                        <Ionicons
                          name="pie-chart-outline"
                          size={22}
                          color="#C2410C"
                        />
                      </View>
                      <View className="flex-1 pt-0.5">
                        <Text className="text-lg font-bold text-slate-800">
                          Your leave balance
                        </Text>
                        <Text className="text-sm text-slate-600 mt-1 leading-5">
                          See how much paid leave you still have before you
                          choose a type below. Pull down on this screen anytime
                          to refresh.
                        </Text>
                      </View>
                    </View>

                    <View className="mt-4">
                      {balancesLoading ? (
                        <View
                          className="bg-white/90 rounded-xl py-8 px-4 items-center border border-orange-100/80"
                          style={balanceCardShadow}
                        >
                          <ActivityIndicator size="large" color="#EA580C" />
                          <Text className="text-sm font-medium text-slate-600 mt-4 text-center">
                            Loading your balances…
                          </Text>
                          <Text className="text-xs text-slate-500 mt-1 text-center">
                            This only takes a moment
                          </Text>
                        </View>
                      ) : balancesError ? (
                        <View
                          className="bg-white rounded-xl py-5 px-4 border border-amber-200"
                          style={balanceCardShadow}
                          accessibilityRole="alert"
                        >
                          <View className="flex-row items-start">
                            <View className="w-9 h-9 rounded-full bg-amber-100 items-center justify-center mr-3 mt-0.5">
                              <Ionicons
                                name="cloud-offline-outline"
                                size={20}
                                color="#B45309"
                              />
                            </View>
                            <View className="flex-1">
                              <Text className="text-base font-semibold text-slate-800">
                                Balances could not be loaded
                              </Text>
                              <Text className="text-sm text-slate-600 mt-1 leading-5">
                                {balancesError}
                              </Text>
                              <TouchableOpacity
                                onPress={handleRetryBalances}
                                activeOpacity={0.85}
                                className="mt-4 self-start flex-row items-center bg-orange-500 px-4 py-2.5 rounded-xl"
                                accessibilityRole="button"
                                accessibilityLabel="Retry loading leave balances"
                              >
                                <Ionicons
                                  name="refresh"
                                  size={18}
                                  color="#FFFFFF"
                                />
                                <Text className="text-white font-semibold text-sm ml-2">
                                  Try again
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      ) : leaveBalances.length === 0 ? (
                        <View
                          className="bg-white rounded-xl py-8 px-4 items-center border border-slate-100"
                          style={balanceCardShadow}
                        >
                          <View className="w-14 h-14 rounded-full bg-slate-100 items-center justify-center mb-3">
                            <Ionicons
                              name="file-tray-outline"
                              size={32}
                              color="#94A3B8"
                            />
                          </View>
                          <Text className="text-base font-semibold text-slate-800 text-center">
                            No balances to show yet
                          </Text>
                          <Text className="text-sm text-slate-500 mt-2 text-center leading-5 px-1">
                            When your employer assigns leave credits, they will
                            appear here automatically.
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-col gap-2">
                          {leaveBalances.map((row) => {
                            const hasDays = row.credits != null;
                            const hasHours = row.hours != null;
                            const hintParts = [];
                            if (hasDays)
                              hintParts.push(creditsHint(row.credits, "day"));
                            if (hasHours)
                              hintParts.push(creditsHint(row.hours, "hour"));
                            const hint =
                              hintParts.length > 1
                                ? hintParts.join(" · ")
                                : (hintParts[0] ?? null);

                            const a11yAmount = [
                              hasDays ? `${row.credits} days` : null,
                              hasHours ? `${row.hours} hours` : null,
                            ]
                              .filter(Boolean)
                              .join(", ");

                            return (
                              <View
                                key={row.key}
                                className="bg-white rounded-xl px-4 py-3.5 border border-slate-100 flex-row items-center justify-between"
                                style={balanceCardShadow}
                                accessibilityLabel={`${row.label}. ${a11yAmount || "No balance data"}`}
                              >
                                <View className="flex-1 pr-3 flex-row items-center min-w-0">
                                  <View className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center mr-3">
                                    <Ionicons
                                      name="leaf-outline"
                                      size={18}
                                      color="#64748B"
                                    />
                                  </View>
                                  <View className="flex-1 min-w-0">
                                    <Text
                                      className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide"
                                      numberOfLines={1}
                                    >
                                      {row.label}
                                    </Text>
                                    {hint ? (
                                      <Text
                                        className="text-xs text-slate-400 mt-0.5"
                                        numberOfLines={2}
                                      >
                                        {hint}
                                      </Text>
                                    ) : null}
                                  </View>
                                </View>
                                <View className="items-end shrink-0">
                                  {!hasDays && !hasHours ? (
                                    <Text className="text-2xl font-bold text-orange-600">
                                      —
                                    </Text>
                                  ) : (
                                    <>
                                      {hasDays ? (
                                        <View className="items-end mb-1">
                                          <Text className="text-2xl font-bold text-orange-600 tabular-nums">
                                            {row.credits}
                                          </Text>
                                          <Text className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                                            days
                                          </Text>
                                        </View>
                                      ) : null}
                                      {hasHours ? (
                                        <View className="items-end">
                                          <Text
                                            className={`font-bold text-orange-600 tabular-nums ${
                                              hasDays ? "text-xl" : "text-2xl"
                                            }`}
                                          >
                                            {row.hours}
                                          </Text>
                                          <Text className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                                            hours
                                          </Text>
                                        </View>
                                      ) : null}
                                    </>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
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
                  onChangeValue={(val) => {
                    console.log("[LeaveType] value:", val, "type:", typeof val);
                  }}
                  onSelectItem={(item) => {
                    console.log(
                      "[LeaveType] item:",
                      item,
                      "value type:",
                      typeof item?.value,
                    );
                  }}
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

              {/* Paid / unpaid leave — matches web segmented control + info card */}
              <View className="px-5 mb-5">
                <FormLabel text="Leave compensation" required={false} />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setIsPaidLeave(true)}
                    activeOpacity={0.85}
                    className={`flex-1 py-3 rounded-xl border items-center ${
                      isPaidLeave
                        ? "bg-emerald-50 border-emerald-600"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <Text
                      className={`text-base font-semibold ${
                        isPaidLeave ? "text-emerald-800" : "text-slate-500"
                      }`}
                    >
                      Paid
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIsPaidLeave(false)}
                    activeOpacity={0.85}
                    className={`flex-1 py-3 rounded-xl border items-center ${
                      !isPaidLeave
                        ? "bg-slate-100 border-slate-400"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <Text
                      className={`text-base font-semibold ${
                        !isPaidLeave ? "text-slate-700" : "text-slate-500"
                      }`}
                    >
                      Unpaid
                    </Text>
                  </TouchableOpacity>
                </View>

                {isPaidLeave ? (
                  <View className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
                    <View className="flex-row items-center mb-1.5">
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#047857"
                        style={{ marginRight: 6 }}
                      />
                      <Text className="text-base font-bold text-emerald-800">
                        Paid leave
                      </Text>
                    </View>
                    <Text className="text-sm text-emerald-900/80 leading-5 mb-3">
                      You will be compensated for this leave period.
                    </Text>
                    {hoursUsedLabel ? (
                      <View className="flex-row items-center mb-1.5">
                        <Ionicons
                          name="time-outline"
                          size={16}
                          color="#EA580C"
                          style={{ marginRight: 6 }}
                        />
                        <Text className="text-sm font-semibold text-orange-600">
                          {hoursUsedLabel} will be used
                        </Text>
                      </View>
                    ) : null}
                    {availableBalanceLabel ? (
                      <View className="flex-row items-center">
                        <Ionicons
                          name="time-outline"
                          size={16}
                          color="#EA580C"
                          style={{ marginRight: 6 }}
                        />
                        <Text className="text-sm font-semibold text-orange-600">
                          {availableBalanceLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                    <View className="flex-row items-center mb-1.5">
                      <Ionicons
                        name="information-circle"
                        size={18}
                        color="#64748b"
                        style={{ marginRight: 6 }}
                      />
                      <Text className="text-base font-bold text-slate-700">
                        Unpaid leave
                      </Text>
                    </View>
                    <Text className="text-sm text-slate-600 leading-5">
                      This leave will not deduct from your paid leave balance.
                    </Text>
                  </View>
                )}
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
                <FormLabel text="Reason" />
                <View className="bg-slate-50 rounded-lg px-3 py-3">
                  <TextInput
                    multiline
                    style={{ color: "#374151", minHeight: 80 }}
                    value={leaveReason}
                    onChangeText={setLeaveReason}
                    placeholder="Explain your reason (at least 10 characters)"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <Text
                  className={`text-xs mt-1.5 ${
                    leaveReason.trim().length >= MIN_LEAVE_REASON_LENGTH
                      ? "text-slate-400"
                      : "text-slate-500"
                  }`}
                >
                  {leaveReason.trim().length}/{MIN_LEAVE_REASON_LENGTH} characters
                  minimum
                </Text>
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

                <View className="mb-5">
                  <Text className="text-base font-semibold text-slate-800 mb-2">
                    Affected schedule
                  </Text>
                  {affectedShifts.length === 0 ? (
                    <Text className="text-sm text-slate-500">
                      No scheduled shifts in this date range
                    </Text>
                  ) : (
                    <>
                      {(affectedShifts.length >= 5
                        ? affectedShifts.slice(0, 4)
                        : affectedShifts
                      ).map((userShift, index) => {
                        const shiftName =
                          userShift?.shift?.shiftName ||
                          userShift?.shift?.name ||
                          "Shift";
                        const startLabel = formatNaiveTimeInZone(
                          userShift?.shift?.startTime,
                        );
                        const endLabel = formatNaiveTimeInZone(
                          userShift?.shift?.endTime,
                        );
                        const timeRange =
                          startLabel && endLabel
                            ? `${startLabel} - ${endLabel}`
                            : startLabel || endLabel || "—";
                        const assignedKey = getShiftDateKey(userShift);
                        return (
                          <View
                            key={String(userShift?.id ?? index)}
                            className="mb-2 p-3 bg-slate-50 rounded-xl border border-slate-100"
                          >
                            <Text className="text-sm font-semibold text-slate-800">
                              {shiftName}
                            </Text>
                            <View className="flex-row items-center mt-1">
                              <Ionicons
                                name="time-outline"
                                size={14}
                                color="#64748b"
                              />
                              <Text className="ml-1 text-slate-600 text-sm">
                                {timeRange}
                              </Text>
                            </View>
                            {assignedKey ? (
                              <Text className="text-xs text-slate-500 mt-1">
                                {new Date(
                                  `${assignedKey}T12:00:00`,
                                ).toLocaleDateString()}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                      {affectedShifts.length >= 5 ? (
                        <Text className="text-sm text-slate-500 mt-1 text-right">
                          and {affectedShifts.length - 4} more
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>

                {/* Submit Button */}
                <View className="mt-6">
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
                          : "Submit Leave Request"}
                      </Text>
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
    </SafeAreaView>
  );
};

export default SubmitLeaves;
