// app/(tabs)/(shifts)/timekeeping-timeCard.jsx

"use client";

import React from "react";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Modal,
  Linking,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import DropDownPicker from "react-native-dropdown-picker";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import {
  API_BASE_URL,
  CONTEST_POLICY_MY_REQUESTS_PATH,
  CONTEST_POLICY_SUBMIT_PATH,
  DEFAULT_SHIFT_DISPLAY_TIMEZONE,
} from "../../../config/constant";
import {
  TIME_LOG_CONTESTED_LABEL,
  addPersistedContestedTimeLogId,
  extractContestListFromResponse,
  extractTimeLogIdsFromContestRows,
  getTimeLogId,
  isTimeLogContested,
  loadPersistedContestedTimeLogIds,
  mergeContestedIds,
  persistContestedTimeLogIds,
  tagTimeLogsWithContestedState,
} from "../../../utils/timeLogContestUtils";
import { parseApproversPayload } from "../../../utils/approversPayload";
import { useFocusEffect } from "expo-router";
import {
  buildInstantInCompanyZone,
  buildClockOutInstantInCompanyZone,
  combinePickerDateAndWallTime,
  formatUtcIsoForPunchLogApi,
  formatPickerWallTimeLabel,
  getContestPickerStateFromTimeLog,
  inferClockOutCrossesNextDayFromPickers,
  logCompanySettingsTimeZoneResult,
  parseCompanyTimeZone,
} from "../../../utils/companyTimeZoneUtils";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height } = Dimensions.get("window");

/** Punch / Shifts visual language: slate shells & borders; orange for icons & CTAs */
const TC = {
  bg: "#ffffff",
  card: "#ffffff",
  shell: "#f8fafc",
  shellRaised: "#f1f5f9",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  text: "#1e293b",
  textSecondary: "#334155",
  muted: "#64748b",
  mutedLight: "#94a3b8",
  accent: "#f97316",
  accentIcon: "#fb923c",
  orangeMutedBg: "#ffedd5",
  orangeBorder: "#fdba74",
  accentText: "#ea580c",
  purple: "#7c3aed",
  amber: "#f97316",
  slate: "#64748b",
  green: "#16a34a",
  noticeBorder: "#e9d5ff",
  noticeBg: "#faf5ff",
  noticeText: "#6b21a8",
  deviceBox: "#f8fafc",
  link: "#ea580c",
  punchBadgeBg: "#ffedd5",
  punchBadgeText: "#334155",
  punchBadgeIcon: "#f97316",
  grey50: "#f8fafc",
  grey100: "#f1f5f9",
  grey200: "#e2e8f0",
  grey400: "#94a3b8",
  grey600: "#475569",
  red: "#dc2626",
  redSoft: "#fef2f2",
};

const grossClockHours = (log) => {
  if (!log?.timeIn || !log?.timeOut) return null;
  const ms = new Date(log.timeOut).getTime() - new Date(log.timeIn).getTime();
  return Math.max(0, ms / 3600000);
};

const paidBreakHours = (log) => {
  let h = 0;
  if (log?.lunchBreak?.start && log?.lunchBreak?.end) {
    h +=
      (new Date(log.lunchBreak.end).getTime() -
        new Date(log.lunchBreak.start).getTime()) /
      3600000;
  }
  if (Array.isArray(log?.coffeeBreaks)) {
    log.coffeeBreaks.forEach((b) => {
      if (b?.start && b?.end) {
        h +=
          (new Date(b.end).getTime() - new Date(b.start).getTime()) / 3600000;
      }
    });
  }
  return Math.max(0, h);
};

const TimeLogContestedBadge = ({ style }) => (
  <View
    style={[
      {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: TC.noticeBg,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: TC.noticeBorder,
      },
      style,
    ]}
  >
    <Ionicons name="flag-outline" size={14} color={TC.noticeText} />
    <Text
      style={{
        color: TC.noticeText,
        fontSize: 12,
        fontWeight: "700",
        marginLeft: 6,
      }}
    >
      {TIME_LOG_CONTESTED_LABEL}
    </Text>
  </View>
);

const deviceLine = (node) => {
  if (!node || typeof node !== "object") return "—";
  const brand = node.brand ?? node.manufacturer ?? "";
  const model = node.modelName ?? node.model ?? "";
  const s = [brand, model].filter(Boolean).join(", ");
  return s.trim() || "—";
};

const formatShortDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

/** Device-local calendar day key for grouping (YYYY-MM-DD). */
const dateKeyLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatDayHeader = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatPunchInstant = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const locationCoords = (log) => {
  const loc =
    log?.locationIn ??
    log?.locationStart ??
    log?.location ??
    log?.deviceInfo?.start?.location ??
    log?.deviceInfo?.start?.coords;
  if (!loc || typeof loc !== "object") return null;
  const lat = loc.latitude ?? loc.lat;
  const lng = loc.longitude ?? loc.lng ?? loc.lon;
  if (lat == null || lng == null) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return { label: `${la.toFixed(5)}, ${ln.toFixed(5)}`, lat: la, lng: ln };
};

const scheduledHoursForLog = (log) => {
  const h = Number(log?.scheduledHours ?? log?.scheduledDurationHours);
  if (Number.isFinite(h) && h > 0) return h;
  const mins = Number(
    log?.scheduledDurationMinutes ?? log?.shiftDurationMinutes,
  );
  if (Number.isFinite(mins) && mins > 0) return mins / 60;
  const ss = log?.scheduledShiftStart
    ? new Date(log.scheduledShiftStart)
    : null;
  const se =
    log?.scheduledShiftEnd != null
      ? new Date(log.scheduledShiftEnd)
      : log?.scheduledShiftFinish != null
        ? new Date(log.scheduledShiftFinish)
        : null;
  if (ss && se && !Number.isNaN(ss.getTime()) && !Number.isNaN(se.getTime())) {
    const ms = se.getTime() - ss.getTime();
    if (ms > 0) return ms / 3600000;
  }
  return null;
};

const lateMinutesForLog = (log) => {
  const v = Number(
    log?.minutesLate ?? log?.lateMinutes ?? log?.minutesLateAfterGrace,
  );
  if (Number.isFinite(v) && v > 0) return Math.round(v);
  const sched = log?.scheduledShiftStart
    ? new Date(log.scheduledShiftStart)
    : null;
  const tin = log?.timeIn ? new Date(log.timeIn) : null;
  if (
    sched &&
    tin &&
    !Number.isNaN(sched.getTime()) &&
    !Number.isNaN(tin.getTime())
  ) {
    const diffMin = Math.round((tin.getTime() - sched.getTime()) / 60000);
    if (diffMin > 0) return diffMin;
  }
  return null;
};

const punchTypeLabel = (log) => {
  const raw = log?.punchType ?? log?.punch_type ?? "REGULAR";
  const s = String(raw).replace(/_/g, " ").trim();
  return s.length ? s : "Punch";
};

const groupTimeLogsByDay = (logs, calcHours) => {
  const map = new Map();
  for (const log of logs) {
    const key = dateKeyLocal(log?.timeIn);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(log);
  }
  const keys = [...map.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return keys.map((key) => {
    const dayLogs = map.get(key);
    dayLogs.sort(
      (a, b) => new Date(a.timeIn).getTime() - new Date(b.timeIn).getTime(),
    );
    const sampleIso = dayLogs[0]?.timeIn;
    let total = 0;
    for (const l of dayLogs) total += calcHours(l);
    return {
      key,
      dateLabel: formatDayHeader(sampleIso),
      sampleIso,
      logs: dayLogs,
      totalHours: total,
    };
  });
};

const employeeDisplayName = (log) => {
  const fn = log?.user?.profile?.firstName ?? log?.profile?.firstName;
  const ln = log?.user?.profile?.lastName ?? log?.profile?.lastName;
  const joined = [fn, ln].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  if (log?.employeeName) return String(log.employeeName);
  if (log?.user?.username) return String(log.user.username);
  return "Employee";
};

const combineDateAndTime = (date, time) => {
  const combined = new Date(date);
  combined.setHours(time.getHours());
  combined.setMinutes(time.getMinutes());
  combined.setSeconds(time.getSeconds());
  combined.setMilliseconds(time.getMilliseconds());
  return combined;
};

const cloneJsDate = (d) =>
  d instanceof Date && Number.isFinite(d.getTime())
    ? new Date(d.getTime())
    : new Date();

const IOS_CONTEST_TIME_PICKER_ANCHOR = new Date(2000, 0, 1);

const TimecardHoursBar = ({ color, label, detail, hours }) => (
  <View style={{ marginBottom: 10 }}>
    <View
      style={{
        backgroundColor: color,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
          {label}
        </Text>
        {detail ? (
          <Text
            style={{
              color: "rgba(255,255,255,0.85)",
              fontSize: 11,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
        {typeof hours === "number" && Number.isFinite(hours)
          ? `${hours.toFixed(2)}h`
          : hours}
      </Text>
    </View>
  </View>
);

const TimekeepingTimeCard = () => {
  const [timeLogs, setTimeLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState("details"); // "actions", "delete", "details"
  const [selectedLog, setSelectedLog] = useState(null);
  // const [deleting, setDeleting] = useState(false);

  const [companyTimeZone, setCompanyTimeZone] = useState(null);
  const [contestModalVisible, setContestModalVisible] = useState(false);
  const [contestLog, setContestLog] = useState(null);
  const [contestedTimeLogIds, setContestedTimeLogIds] = useState([]);
  const [ctReqDate, setCtReqDate] = useState(() => new Date());
  const ctReqDateRef = useRef(ctReqDate);
  ctReqDateRef.current = ctReqDate;
  const [ctClockInTime, setCtClockInTime] = useState(() => new Date());
  const [ctClockOutTime, setCtClockOutTime] = useState(() => new Date());
  const [ctClockOutCrossesNextDay, setCtClockOutCrossesNextDay] =
    useState(false);
  const [ctApproverOpen, setCtApproverOpen] = useState(false);
  const [ctApproverItems, setCtApproverItems] = useState([]);
  const [ctApproverValue, setCtApproverValue] = useState("");
  const [ctReason, setCtReason] = useState("");
  const [ctDescription, setCtDescription] = useState("");
  const [ctSubmitting, setCtSubmitting] = useState(false);
  const [ctApproversLoading, setCtApproversLoading] = useState(false);
  const [ctReqDateModalVisible, setCtReqDateModalVisible] = useState(false);
  const [ctTimeModalVisible, setCtTimeModalVisible] = useState(false);
  const [ctAndroidPicker, setCtAndroidPicker] = useState(null);
  const [ctTimeModalKind, setCtTimeModalKind] = useState(null);
  const ctTimeModalKindRef = useRef(null);
  const ctTimePickerSessionRef = useRef(0);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const modalYAnim = useRef(new Animated.Value(height)).current;
  // const deleteButtonScale = useRef(new Animated.Value(1)).current;
  // const cancelButtonScale = useRef(new Animated.Value(1)).current;
  const cardScales = useRef({}).current;

  const insets = useSafeAreaInsets();

  // Function to calculate total hours worked
  const calculateTotalHours = (log) => {
    if (!log.timeIn) return 0;

    const timeIn = new Date(log.timeIn);
    const timeOut = log.timeOut ? new Date(log.timeOut) : new Date(); // Use current time if still clocked in

    // Calculate total time in milliseconds
    let totalTime = timeOut.getTime() - timeIn.getTime();

    // Subtract lunch break time if exists
    if (log.lunchBreak?.start && log.lunchBreak?.end) {
      const lunchStart = new Date(log.lunchBreak.start);
      const lunchEnd = new Date(log.lunchBreak.end);
      const lunchDuration = lunchEnd.getTime() - lunchStart.getTime();
      totalTime -= lunchDuration;
    }

    // Subtract coffee break times if they exist
    if (log.coffeeBreaks && Array.isArray(log.coffeeBreaks)) {
      log.coffeeBreaks.forEach((breakItem) => {
        if (breakItem.start && breakItem.end) {
          const breakStart = new Date(breakItem.start);
          const breakEnd = new Date(breakItem.end);
          const breakDuration = breakEnd.getTime() - breakStart.getTime();
          totalTime -= breakDuration;
        }
      });
    }

    // Convert to hours
    const totalHours = totalTime / (1000 * 60 * 60);
    return Math.max(0, totalHours); // Ensure non-negative
  };

  // Function to format hours display
  const formatHours = (hours) => {
    if (hours < 0) return "0h 0m";
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    return `${wholeHours}h ${minutes}m`;
  };

  const formatHoursDecimal = (hours) => {
    if (!Number.isFinite(hours) || hours < 0) return "0.00h";
    return `${hours.toFixed(2)}h`;
  };

  /** Company zone for contest submit only; cards and modal prefill use device-local display. */
  const contestTimeZone = companyTimeZone ?? DEFAULT_SHIFT_DISPLAY_TIMEZONE;

  const groupedByDay = useMemo(
    () => groupTimeLogsByDay(timeLogs, calculateTotalHours),
    [timeLogs],
  );

  const summaryEmployee =
    timeLogs.length > 0 ? employeeDisplayName(timeLogs[0]) : null;

  const dismissCtTimePickerSheet = () => {
    ctTimeModalKindRef.current = null;
    setCtTimeModalVisible(false);
    setCtTimeModalKind(null);
    setCtAndroidPicker(null);
  };

  const openCtTimePicker = (kind) => {
    setCtApproverOpen(false);
    setCtReqDateModalVisible(false);
    ctTimeModalKindRef.current = kind;
    ctTimePickerSessionRef.current += 1;
    setCtTimeModalKind(kind);
    if (Platform.OS === "android") {
      setCtAndroidPicker(kind);
    } else {
      setCtTimeModalVisible(true);
    }
  };

  const fetchCompanyTimeZone = async (token) => {
    try {
      const settingsRes = await axios.get(
        `${API_BASE_URL}/api/company-settings`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const logged = logCompanySettingsTimeZoneResult(
        settingsRes,
        "timecard:company-settings",
      );
      const raw =
        settingsRes?.data?.data ??
        settingsRes?.data?.settings ??
        settingsRes?.data ??
        {};
      const parsed = parseCompanyTimeZone(raw) ?? logged;
      setCompanyTimeZone(parsed ?? null);
    } catch (e) {
      console.error("Fetch company timezone:", e?.message);
      setCompanyTimeZone(null);
    }
  };

  const fetchCtApprovers = async () => {
    setCtApproversLoading(true);
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
      console.log("[CT Approvers] raw payload:", JSON.stringify(data));
      if (res.ok && data?.data) {
        setCtApproverItems(parseApproversPayload(data));
      } else {
        Alert.alert("Error", data?.message || "Failed to fetch approvers.");
      }
    } catch (e) {
      console.error("fetchCtApprovers", e);
      Alert.alert("Error", "Could not load approvers.");
    } finally {
      setCtApproversLoading(false);
    }
  };

  const initContestPickersFromLog = (log) => {
    const state = getContestPickerStateFromTimeLog(log);
    if (!state) return;
    setCtReqDate(cloneJsDate(state.reqDate));
    setCtClockInTime(cloneJsDate(state.clockInTime));
    setCtClockOutTime(cloneJsDate(state.clockOutTime));
    setCtClockOutCrossesNextDay(state.clockOutCrossesNextDay);
  };

  const fetchContestedTimeLogIdsFromApi = useCallback(async (token) => {
    if (!token) return [];
    try {
      const res = await axios.get(
        `${API_BASE_URL}${CONTEST_POLICY_MY_REQUESTS_PATH}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const rows = extractContestListFromResponse(res.data);
      return extractTimeLogIdsFromContestRows(rows);
    } catch {
      return [];
    }
  }, []);

  const openContestModal = (log) => {
    if (!getTimeLogId(log)) {
      Alert.alert("Error", "This time log cannot be contested.");
      return;
    }
    setContestLog(log);
    initContestPickersFromLog(log);
    setCtReason("");
    setCtDescription("");
    setCtApproverValue("");
    setCtReqDateModalVisible(false);
    dismissCtTimePickerSheet();
    setCtApproverOpen(false);
    setContestModalVisible(true);
    fetchCtApprovers();
  };

  const closeContestModal = () => {
    Keyboard.dismiss();
    setCtReqDateModalVisible(false);
    dismissCtTimePickerSheet();
    setCtApproverOpen(false);
    setContestModalVisible(false);
    setContestLog(null);
  };

  const syncCtClockStatesToRequestedDate = (rawSelected) => {
    if (!(rawSelected instanceof Date) || Number.isNaN(rawSelected.getTime())) {
      return;
    }
    const nextReqDate = cloneJsDate(
      new Date(
        rawSelected.getFullYear(),
        rawSelected.getMonth(),
        rawSelected.getDate(),
      ),
    );
    setCtReqDate(nextReqDate);
    setCtClockInTime((prev) =>
      cloneJsDate(combinePickerDateAndWallTime(nextReqDate, prev)),
    );
    setCtClockOutTime((prev) =>
      cloneJsDate(combinePickerDateAndWallTime(nextReqDate, prev)),
    );
  };

  const onCtReqDateModalChange = (_event, selectedDate) => {
    if (selectedDate) syncCtClockStatesToRequestedDate(selectedDate);
  };

  const onCtTimeModalChange = (_event, selectedDate) => {
    const kind = ctTimeModalKindRef.current;
    if (!selectedDate || !kind) return;
    const next = cloneJsDate(
      combinePickerDateAndWallTime(ctReqDateRef.current, selectedDate),
    );
    if (kind === "out") setCtClockOutTime(next);
    else setCtClockInTime(next);
  };

  const onCtAndroidPickerChange = (event, selectedDate) => {
    const picker = ctAndroidPicker;
    if (event?.type === "set" && selectedDate) {
      if (picker === "date") {
        syncCtClockStatesToRequestedDate(selectedDate);
      } else if (picker === "in" || picker === "out") {
        const next = cloneJsDate(
          combinePickerDateAndWallTime(ctReqDateRef.current, selectedDate),
        );
        if (picker === "out") setCtClockOutTime(next);
        else setCtClockInTime(next);
      }
    }
    if (event?.type === "set" || event?.type === "dismissed") {
      setCtAndroidPicker(null);
      ctTimeModalKindRef.current = null;
      setCtTimeModalKind(null);
    }
  };

  const renderCtAndroidPicker = () => {
    if (Platform.OS !== "android" || !ctAndroidPicker) return null;
    const isDate = ctAndroidPicker === "date";
    return (
      <DateTimePicker
        value={
          isDate
            ? ctReqDate
            : ctAndroidPicker === "out"
              ? ctClockOutTime
              : ctClockInTime
        }
        mode={isDate ? "date" : "time"}
        is24Hour
        display="default"
        onChange={onCtAndroidPickerChange}
      />
    );
  };

  const effectiveCtTimeModalKind =
    ctTimeModalVisible &&
    (ctTimeModalKindRef.current === "in" ||
      ctTimeModalKindRef.current === "out")
      ? ctTimeModalKindRef.current
      : ctTimeModalKind;

  const ctTimeModalValue =
    effectiveCtTimeModalKind === "out" ? ctClockOutTime : ctClockInTime;

  const submitContestTimeLog = async () => {
    const contestedLogId = getTimeLogId(contestLog);
    if (!contestedLogId) {
      Alert.alert("Error", "No time log selected.");
      return;
    }
    const trimmedApprover = String(ctApproverValue ?? "").trim();
    if (!trimmedApprover) {
      Alert.alert("Choose an approver", "Select an approver for this contest.");
      return;
    }
    if (
      !Number.isFinite(ctReqDate.getTime()) ||
      !Number.isFinite(ctClockInTime.getTime()) ||
      !Number.isFinite(ctClockOutTime.getTime())
    ) {
      Alert.alert(
        "Update your times",
        "Pick the date and corrected clock-in/out times.",
      );
      return;
    }

    const clockInInstant = buildInstantInCompanyZone(
      ctReqDate,
      ctClockInTime,
      contestTimeZone,
    );
    const clockOutInstant = buildClockOutInstantInCompanyZone(
      ctReqDate,
      ctClockOutTime,
      ctClockOutCrossesNextDay,
      contestTimeZone,
    );
    const requestedClockIn = formatUtcIsoForPunchLogApi(clockInInstant);
    const requestedClockOut = formatUtcIsoForPunchLogApi(clockOutInstant);
    if (!requestedClockIn || !requestedClockOut) {
      Alert.alert(
        "Update your times",
        "Could not format times for submission. Try again.",
      );
      return;
    }

    const nowMs = Date.now();
    if (clockInInstant.getTime() > nowMs || clockOutInstant.getTime() > nowMs) {
      Alert.alert(
        "Nothing in the future",
        "Corrected clock-in and clock-out must be at or before the current time.",
      );
      return;
    }
    if (
      !ctClockOutCrossesNextDay &&
      inferClockOutCrossesNextDayFromPickers(ctClockInTime, ctClockOutTime)
    ) {
      Alert.alert(
        "Overnight shift",
        "Clock-out is earlier than clock-in on the same day. Turn on “Clock-out crosses next day” before submitting.",
      );
      return;
    }
    if (clockOutInstant.getTime() <= clockInInstant.getTime()) {
      Alert.alert(
        "Check your times",
        "Clock-out must be after clock-in. Adjust the times or turn on “Clock-out crosses next day”.",
      );
      return;
    }

    const currentClockIn = contestLog?.timeIn
      ? formatUtcIsoForPunchLogApi(new Date(contestLog.timeIn))
      : undefined;
    const currentClockOut = contestLog?.timeOut
      ? formatUtcIsoForPunchLogApi(new Date(contestLog.timeOut))
      : undefined;

    const reasonTrim = ctReason.trim();
    const descriptionTrim = ctDescription.trim();
    const payload = {
      timeLogId: getTimeLogId(contestLog),
      requestedClockIn,
      requestedClockOut,
      approverId: trimmedApprover,
      submittedAt: new Date().toISOString(),
    };
    if (currentClockIn) payload.currentClockIn = currentClockIn;
    if (currentClockOut) payload.currentClockOut = currentClockOut;
    if (reasonTrim) payload.reason = reasonTrim;
    if (descriptionTrim) payload.description = descriptionTrim;

    setCtSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        Alert.alert("Authentication", "Please sign in again.");
        return;
      }
      const res = await axios.post(
        `${API_BASE_URL}${CONTEST_POLICY_SUBMIT_PATH}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      Alert.alert(
        "Submitted",
        res.data?.message || "Your time log contest was sent.",
      );
      const fromResponse = extractTimeLogIdsFromContestRows(
        extractContestListFromResponse(res.data),
      );
      const persisted = await addPersistedContestedTimeLogId(contestedLogId);
      const merged = mergeContestedIds(persisted, fromResponse);
      await persistContestedTimeLogIds(merged);
      setContestedTimeLogIds(merged);
      setTimeLogs((prev) => tagTimeLogsWithContestedState(prev, merged));
      closeContestModal();
    } catch (err) {
      const status = err?.response?.status;
      const responseData = err?.response?.data;
      const rawServerMsg = String(
        responseData?.message ||
          responseData?.error ||
          responseData?.details ||
          "",
      ).trim();
      let friendlyBody =
        rawServerMsg || "We couldn't submit your contest. Please try again.";
      if (status === 401 || status === 403) {
        friendlyBody =
          rawServerMsg ||
          "Your session may have expired. Sign in again and retry.";
      } else if (status >= 500) {
        friendlyBody =
          rawServerMsg ||
          "Our servers had a problem. Please try again shortly.";
      }
      Alert.alert("Couldn't submit", friendlyBody);
    } finally {
      setCtSubmitting(false);
    }
  };

  const renderShiftRow = (item, indexInDay, dayKey, dayLogCount) => {
    const sk = `${dayKey}-${String(item?.id ?? `idx-${indexInDay}`)}`;
    if (!cardScales[sk]) {
      cardScales[sk] = new Animated.Value(1);
    }
    const scaleRef = cardScales[sk];
    const netH = calculateTotalHours(item);
    const schedH = scheduledHoursForLog(item);
    const lateMin = lateMinutesForLog(item);
    const punchLabel = punchTypeLabel(item);
    const isLastInDay = indexInDay === dayLogCount - 1;
    const logContested = isTimeLogContested(item, contestedTimeLogIds);

    return (
      <Animated.View
        key={item.id ?? `${dayKey}-${indexInDay}`}
        style={{
          transform: [{ scale: scaleRef }],
          marginBottom: isLastInDay ? 0 : 12,
        }}
      >
        <View
          style={{
            backgroundColor: TC.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: TC.border,
            overflow: "hidden",
          }}
        >
          <TouchableOpacity
            onPress={() => {
              animateButtonPress(scaleRef);
              setTimeout(() => openModal(item), 100);
            }}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel={`Shift ${punchLabel}, ${formatHoursDecimal(netH)}`}
            style={{
              paddingVertical: 16,
              paddingHorizontal: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      alignSelf: "flex-start",
                      backgroundColor: TC.punchBadgeBg,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: TC.orangeBorder,
                    }}
                  >
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={TC.punchBadgeIcon}
                    />
                    <Text
                      style={{
                        color: TC.punchBadgeText,
                        fontSize: 13,
                        fontWeight: "700",
                        marginLeft: 6,
                        flexShrink: 1,
                      }}
                      numberOfLines={2}
                    >
                      {punchLabel}
                    </Text>
                  </View>
                  {logContested ? <TimeLogContestedBadge /> : null}
                </View>
              </View>
              <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
                <Text
                  style={{ color: TC.text, fontSize: 18, fontWeight: "700" }}
                >
                  {formatHoursDecimal(netH)}
                </Text>
                {schedH != null ? (
                  <Text
                    style={{
                      color: TC.muted,
                      fontSize: 12,
                      marginTop: 4,
                      fontWeight: "500",
                    }}
                  >
                    / {formatHoursDecimal(schedH)} sched.
                  </Text>
                ) : null}
              </View>
            </View>

            <Text
              style={{
                color: TC.textSecondary,
                fontSize: 14,
                lineHeight: 21,
                marginTop: 12,
              }}
            >
              In: {formatPunchInstant(item.timeIn)}
            </Text>
            <Text
              style={{
                color: TC.textSecondary,
                fontSize: 14,
                lineHeight: 21,
                marginTop: 4,
              }}
            >
              Out:{" "}
              {item.timeOut
                ? formatPunchInstant(item.timeOut)
                : "Still clocked in"}
            </Text>

            {lateMin != null && lateMin > 0 ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  marginTop: 12,
                  backgroundColor: TC.redSoft,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#fecaca",
                }}
              >
                <Text
                  style={{ color: TC.red, fontSize: 12, fontWeight: "700" }}
                >
                  {lateMin >= 60
                    ? `${(lateMin / 60).toFixed(1)}h late`
                    : `${lateMin} min late`}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: TC.border,
              backgroundColor: TC.grey50,
            }}
          >
            <Pressable
              onPress={() => {
                animateButtonPress(scaleRef);
                setTimeout(() => openModal(item), 100);
              }}
              accessibilityRole="button"
              accessibilityLabel="View shift details"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 18,
                paddingHorizontal: 18,
                minHeight: 56,
                alignSelf: "stretch",
                backgroundColor: pressed ? TC.grey100 : "transparent",
              })}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "nowrap",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                }}
              >
                <Text
                  style={{
                    color: TC.muted,
                    fontSize: 14,
                    fontWeight: "600",
                    marginRight: 8,
                  }}
                  numberOfLines={1}
                >
                  Details
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={TC.mutedLight}
                />
              </View>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    );
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

  // PanResponder for modal swipe gestures
  const modalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          modalYAnim.setValue(gestureState.dy);
        } else if (gestureState.dy < 0) {
          const newPosition = Math.max(gestureState.dy, -300);
          modalYAnim.setValue(newPosition);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          closeModal();
        } else if (gestureState.dy < -50) {
          Animated.spring(modalYAnim, {
            toValue: -300,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }).start();
        } else {
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

  const fetchTimeLogs = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (token) await fetchCompanyTimeZone(token);
      const persisted = await loadPersistedContestedTimeLogIds();
      const fromContests = token
        ? await fetchContestedTimeLogIdsFromApi(token)
        : [];
      const url = `${API_BASE_URL}/api/timelogs/user`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200 && res.data.data) {
        const sortedLogs = res.data.data.sort(
          (a, b) => new Date(b.timeIn) - new Date(a.timeIn),
        );
        const fromLogs = [];
        for (const l of sortedLogs) {
          const id = getTimeLogId(l);
          if (id && isTimeLogContested(l, persisted)) fromLogs.push(id);
        }
        const merged = mergeContestedIds(persisted, fromContests, fromLogs);
        await persistContestedTimeLogIds(merged);
        setContestedTimeLogIds(merged);
        setTimeLogs(tagTimeLogsWithContestedState(sortedLogs, merged));
      } else {
        Alert.alert("Error", "Failed to fetch time logs.");
      }
    } catch (error) {
      console.error("Fetch time logs error:", error.message);
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to fetch time logs.",
      );
    } finally {
      setLoading(false);
    }
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
    fetchTimeLogs();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const token = await SecureStore.getItemAsync("token");
        if (!token || cancelled) return;
        await fetchCompanyTimeZone(token);
        const persisted = await loadPersistedContestedTimeLogIds();
        const fromApi = await fetchContestedTimeLogIdsFromApi(token);
        const merged = mergeContestedIds(persisted, fromApi);
        if (cancelled) return;
        await persistContestedTimeLogIds(merged);
        setContestedTimeLogIds(merged);
        setTimeLogs((prev) => tagTimeLogsWithContestedState(prev, merged));
      })();
      return () => {
        cancelled = true;
      };
    }, [fetchContestedTimeLogIdsFromApi]),
  );

  useEffect(() => {
    if (contestModalVisible && contestLog) {
      initContestPickersFromLog(contestLog);
    }
  }, [contestModalVisible, contestLog]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTimeLogs();
    setRefreshing(false);
  };

  const openModal = (log) => {
    setSelectedLog(log);
    setModalMode("details");
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
      setSelectedLog(null);
      setModalMode("details");
    });
  };

  // const handleDeleteTimeLog = async () => {
  //   if (!selectedLog || !selectedLog.id) {
  //     Alert.alert("Error", "No time log selected for deletion.");
  //     return;
  //   }
  //
  //   try {
  //     setDeleting(true);
  //     const token = await SecureStore.getItemAsync("token");
  //     const url = `${API_BASE_URL}/api/timelogs/delete/${selectedLog.id}`;
  //     const res = await axios.delete(url, {
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //     if (res.status === 200) {
  //       Alert.alert("Success", res.data.message);
  //       setTimeLogs((prev) => prev.filter((log) => log.id !== selectedLog.id));
  //       closeModal();
  //     } else {
  //       Alert.alert("Error", "Failed to delete time log.");
  //     }
  //   } catch (error) {
  //     console.error("Delete error:", error.message);
  //     Alert.alert(
  //       "Error",
  //       error.response?.data?.message || "Failed to delete time log."
  //     );
  //   } finally {
  //     setDeleting(false);
  //   }
  // };

  const renderModalContent = () => {
    if (!selectedLog) return null;

    if (modalMode === "actions") {
      return (
        <View className="p-5">
          <Text className="text-lg font-bold text-slate-700 mb-4 text-center">
            Time Log Actions
          </Text>
          <Text className="text-sm text-slate-500 mb-6 text-center">
            ID: {selectedLog.id}
          </Text>

          <TouchableOpacity
            onPress={() => setModalMode("details")}
            className="flex-row items-center justify-between p-4 mb-3 bg-orange-50 rounded-lg"
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                <Feather name="info" size={18} color="#ffffff" />
              </View>
              <Text className="text-slate-700 font-medium">View Details</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>

          {/* Delete action intentionally disabled; keep block for quick restore. */}
          {/*
          <TouchableOpacity
            onPress={() => setModalMode("delete")}
            className="flex-row items-center justify-between p-4 mb-3 bg-orange-50 rounded-lg"
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-md bg-orange-400 items-center justify-center mr-3">
                <Feather name="trash-2" size={18} color="#ffffff" />
              </View>
              <Text className="text-slate-700 font-medium">
                Delete Time Log
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>
          */}

          <TouchableOpacity
            onPress={closeModal}
            className="border border-slate-200 py-3.5 rounded-lg w-full items-center mt-4"
          >
            <Text className="text-slate-600 font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      );
      // Delete confirmation modal intentionally disabled; keep block for quick restore.
      /*
    } else if (modalMode === "delete") {
      return (
        <View className="p-5">
          <Text className="text-lg font-bold text-slate-700 mb-2 text-center">
            Delete Time Log
          </Text>
          <Text className="text-slate-600 text-center mb-6">
            Are you sure you want to delete this time log?
          </Text>

          {deleting ? (
            <View className="items-center py-4">
              <ActivityIndicator size="large" color="#f97316" />
              <Text className="text-slate-600 mt-3">Deleting time log...</Text>
            </View>
          ) : (
            <>
              <Animated.View
                style={{ transform: [{ scale: deleteButtonScale }] }}
              >
                <TouchableOpacity
                  onPress={() => {
                    animateButtonPress(deleteButtonScale);
                    setTimeout(() => handleDeleteTimeLog(), 100);
                  }}
                  className="bg-orange-400 py-3.5 rounded-lg w-full items-center mb-3"
                >
                  <Text className="text-white font-bold text-base">
                    Yes, Delete
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              <Animated.View
                style={{ transform: [{ scale: cancelButtonScale }] }}
              >
                <TouchableOpacity
                  onPress={() => {
                    animateButtonPress(cancelButtonScale);
                    setTimeout(() => setModalMode("actions"), 100);
                  }}
                  className="border border-slate-200 py-3.5 rounded-lg w-full items-center"
                >
                  <Text className="text-slate-600 font-bold text-base">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}
        </View>
      );
    */
    } else if (modalMode === "details") {
      const log = selectedLog;
      const name = employeeDisplayName(log);
      const netH = calculateTotalHours(log);
      const grossH = grossClockHours(log);
      const breakH = paidBreakHours(log);
      const loc = locationCoords(log);
      const punchRaw = log?.punchType ?? log?.punch_type ?? "REGULAR";
      const punchLabel = String(punchRaw).replace(/_/g, " ");
      const isDriverAide = /driver|aide/i.test(punchLabel);
      const complete = Boolean(log?.timeOut);
      const systemNote =
        log?.closureNote ??
        log?.systemMessage ??
        log?.autoClosedReason ??
        log?.reviewNote ??
        null;
      const dept =
        log?.department?.name ??
        log?.department ??
        log?.jobTitle ??
        (isDriverAide ? "Driver/Aide" : "—");
      const shiftLabel =
        log?.shiftName ??
        log?.shift?.name ??
        log?.scheduledShiftLabel ??
        (Array.isArray(log?.shifts)
          ? log.shifts
              .map((s) => s?.name || s)
              .filter(Boolean)
              .join(", ")
          : "—");
      const otStatus = log?.otStatus ?? log?.overtimeStatus ?? "—";
      const grace =
        log?.gracePeriodMinutes != null
          ? `${log.gracePeriodMinutes} min`
          : log?.graceMinutes != null
            ? `${log.graceMinutes} min`
            : "—";
      const cutoffLabel = log?.cutoffStatus ?? "Not in cutoff";
      const segments = Array.isArray(log?.hourSegments)
        ? log.hourSegments
        : null;
      const logContested = isTimeLogContested(log, contestedTimeLogIds);

      const openMaps = () => {
        if (!loc) return;
        const url = `https://maps.apple.com/?ll=${loc.lat},${loc.lng}`;
        Linking.openURL(url).catch(() => {});
      };

      return (
        <View style={{ backgroundColor: TC.bg, flex: 1, minHeight: 0 }}>
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: TC.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <TouchableOpacity
                  onPress={closeModal}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ marginRight: 10, marginTop: 2 }}
                >
                  <Ionicons name="chevron-back" size={22} color={TC.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="time-outline" size={20} color={TC.muted} />
                    <Text
                      style={{
                        color: TC.text,
                        fontSize: 17,
                        fontWeight: "700",
                        marginLeft: 8,
                        flex: 1,
                      }}
                      numberOfLines={2}
                    >
                      {name}
                    </Text>
                  </View>
                  <Text style={{ color: TC.muted, fontSize: 12, marginTop: 8 }}>
                    {formatShortDateTime(log.timeIn)} →{" "}
                    {log.timeOut ? formatShortDateTime(log.timeOut) : "—"}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginTop: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: TC.text,
                        fontSize: 15,
                        fontWeight: "700",
                        marginRight: 8,
                        marginBottom: 6,
                      }}
                    >
                      {netH.toFixed(1)} hrs
                    </Text>
                    {complete ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: "#ecfdf5",
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          marginRight: 8,
                          marginBottom: 6,
                        }}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={TC.green}
                        />
                        <Text
                          style={{
                            color: TC.green,
                            fontSize: 12,
                            fontWeight: "600",
                            marginLeft: 4,
                          }}
                        >
                          Complete
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: "#fffbeb",
                          marginRight: 8,
                          marginBottom: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: "#b45309",
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          In progress
                        </Text>
                      </View>
                    )}
                    {isDriverAide ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: "#fff7ed",
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          marginRight: 8,
                          marginBottom: 6,
                        }}
                      >
                        <Ionicons
                          name="car-outline"
                          size={14}
                          color="#ea580c"
                        />
                        <Text
                          style={{
                            color: "#c2410c",
                            fontSize: 12,
                            fontWeight: "600",
                            marginLeft: 4,
                          }}
                        >
                          Driver/Aide
                        </Text>
                      </View>
                    ) : null}
                    {logContested ? (
                      <TimeLogContestedBadge
                        style={{ marginRight: 8, marginBottom: 6 }}
                      />
                    ) : null}
                    {grossH != null ? (
                      <Text
                        style={{
                          color: TC.muted,
                          fontSize: 12,
                          marginRight: 8,
                          marginBottom: 6,
                        }}
                      >
                        Clock span {grossH.toFixed(2)} hrs
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <Text style={{ color: TC.muted, fontSize: 11, marginBottom: 6 }}>
                Log ID {log.id}
              </Text>

              <View
                style={{
                  backgroundColor: TC.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: TC.border,
                  padding: 14,
                  marginBottom: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Ionicons name="car-outline" size={18} color={TC.muted} />
                  <Text
                    style={{
                      color: TC.text,
                      fontSize: 15,
                      fontWeight: "700",
                      marginLeft: 8,
                    }}
                  >
                    Hours breakdown
                  </Text>
                </View>
                {segments && segments.length > 0 ? (
                  segments.map((seg, i) => (
                    <TimecardHoursBar
                      key={seg.id ?? i}
                      color={seg.color ?? TC.purple}
                      label={seg.label ?? seg.name ?? "Segment"}
                      detail={seg.detail ?? seg.range ?? null}
                      hours={Number(seg.hours ?? seg.durationHours) || 0}
                    />
                  ))
                ) : (
                  <>
                    <TimecardHoursBar
                      color={TC.purple}
                      label="Work time (excl. breaks)"
                      detail="Net hours between clock-in and clock-out minus breaks"
                      hours={netH}
                    />
                    {breakH > 0.001 ? (
                      <TimecardHoursBar
                        color={TC.slate}
                        label="Breaks (coffee + lunch)"
                        detail="Unpaid break window on this log"
                        hours={breakH}
                      />
                    ) : null}
                    {grossH != null ? (
                      <TimecardHoursBar
                        color={TC.amber}
                        label="Total clock span"
                        detail={`${formatShortDateTime(log.timeIn)} → ${formatShortDateTime(log.timeOut)}`}
                        hours={grossH}
                      />
                    ) : null}
                  </>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 8,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: TC.border,
                  }}
                >
                  <Text style={{ color: TC.muted, fontSize: 12 }}>
                    Coffee break
                  </Text>
                  <Text
                    style={{ color: TC.text, fontSize: 12, fontWeight: "600" }}
                  >
                    {(() => {
                      let m = 0;
                      if (Array.isArray(log?.coffeeBreaks)) {
                        log.coffeeBreaks.forEach((b) => {
                          if (b?.start && b?.end)
                            m += (new Date(b.end) - new Date(b.start)) / 60000;
                        });
                      }
                      return `${(m / 60).toFixed(2)}h`;
                    })()}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 6,
                  }}
                >
                  <Text style={{ color: TC.muted, fontSize: 12 }}>
                    Lunch break
                  </Text>
                  <Text
                    style={{ color: TC.text, fontSize: 12, fontWeight: "600" }}
                  >
                    {log?.lunchBreak?.start && log?.lunchBreak?.end
                      ? `${(
                          (new Date(log.lunchBreak.end) -
                            new Date(log.lunchBreak.start)) /
                          3600000
                        ).toFixed(2)}h`
                      : "0.00h"}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  backgroundColor: TC.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: TC.border,
                  padding: 14,
                  marginBottom: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={TC.muted}
                  />
                  <Text
                    style={{
                      color: TC.text,
                      fontSize: 15,
                      fontWeight: "700",
                      marginLeft: 8,
                    }}
                  >
                    Device & location
                  </Text>
                </View>
                <Text
                  style={{ color: TC.muted, fontSize: 11, marginBottom: 4 }}
                >
                  Device in
                </Text>
                <View
                  style={{
                    backgroundColor: TC.deviceBox,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: TC.border,
                  }}
                >
                  <Text style={{ color: TC.text, fontSize: 13 }}>
                    {deviceLine(log?.deviceInfo?.start)}
                  </Text>
                </View>
                <Text
                  style={{ color: TC.muted, fontSize: 11, marginBottom: 4 }}
                >
                  Device out
                </Text>
                <View
                  style={{
                    backgroundColor: TC.deviceBox,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: TC.border,
                  }}
                >
                  <Text style={{ color: TC.text, fontSize: 13 }}>
                    {deviceLine(log?.deviceInfo?.end)}
                  </Text>
                </View>
                <Text
                  style={{ color: TC.muted, fontSize: 11, marginBottom: 4 }}
                >
                  Location in
                </Text>
                {loc ? (
                  <TouchableOpacity onPress={openMaps} activeOpacity={0.7}>
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Ionicons
                        name="navigate-circle-outline"
                        size={16}
                        color={TC.link}
                      />
                      <Text
                        style={{
                          color: TC.link,
                          fontSize: 13,
                          marginLeft: 6,
                          textDecorationLine: "underline",
                          fontWeight: "600",
                        }}
                      >
                        {loc.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: TC.muted, fontSize: 13 }}>—</Text>
                )}
              </View>

              <View
                style={{
                  backgroundColor: TC.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: TC.border,
                  padding: 14,
                  marginBottom: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Ionicons name="person-outline" size={18} color={TC.muted} />
                  <Text
                    style={{
                      color: TC.text,
                      fontSize: 15,
                      fontWeight: "700",
                      marginLeft: 8,
                    }}
                  >
                    Employee details
                  </Text>
                </View>
                <View
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: TC.border,
                    paddingBottom: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: TC.muted, fontSize: 11 }}>
                    Employee
                  </Text>
                  <Text style={{ color: TC.text, fontSize: 14, marginTop: 4 }}>
                    {name}
                  </Text>
                </View>
                <View
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: TC.border,
                    paddingBottom: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: TC.muted, fontSize: 11 }}>
                    Department
                  </Text>
                  <Text style={{ color: TC.text, fontSize: 14, marginTop: 4 }}>
                    {typeof dept === "string" ? dept : (dept?.name ?? "—")}
                  </Text>
                </View>
                <View
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: TC.border,
                    paddingBottom: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: TC.muted, fontSize: 11 }}>Shift</Text>
                  <Text style={{ color: TC.text, fontSize: 14, marginTop: 4 }}>
                    {shiftLabel}
                  </Text>
                </View>
                <View
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: TC.border,
                    paddingBottom: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: TC.muted, fontSize: 11 }}>
                    Punch type
                  </Text>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      backgroundColor: TC.punchBadgeBg,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 8,
                      marginTop: 6,
                      borderWidth: 1,
                      borderColor: TC.orangeBorder,
                    }}
                  >
                    <Text
                      style={{
                        color: TC.punchBadgeText,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {punchLabel}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: TC.border,
                    paddingBottom: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: TC.muted, fontSize: 11 }}>
                    OT status
                  </Text>
                  <Text style={{ color: TC.text, fontSize: 14, marginTop: 4 }}>
                    {String(otStatus)}
                  </Text>
                </View>
                <View
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: TC.border,
                    paddingBottom: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: TC.muted, fontSize: 11 }}>
                    Grace period
                  </Text>
                  <Text style={{ color: TC.text, fontSize: 14, marginTop: 4 }}>
                    {grace}
                  </Text>
                </View>
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: TC.muted, fontSize: 11 }}>Cutoff</Text>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: TC.deviceBox,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      marginTop: 6,
                      borderWidth: 1,
                      borderColor: TC.border,
                    }}
                  >
                    <Ionicons name="time-outline" size={14} color={TC.muted} />
                    <Text
                      style={{ color: TC.text, fontSize: 12, marginLeft: 6 }}
                    >
                      {cutoffLabel}
                    </Text>
                  </View>
                </View>

                {systemNote ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: TC.noticeBorder,
                      borderRadius: 10,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "flex-start",
                      backgroundColor: TC.noticeBg,
                    }}
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={18}
                      color="#7c3aed"
                      style={{ marginTop: 1 }}
                    />
                    <Text
                      style={{
                        color: TC.noticeText,
                        fontSize: 12,
                        marginLeft: 10,
                        flex: 1,
                        lineHeight: 18,
                      }}
                    >
                      {String(systemNote)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  backgroundColor: TC.grey50,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: TC.border,
                  padding: 14,
                }}
              >
                <Text
                  style={{ color: TC.muted, fontSize: 11, marginBottom: 6 }}
                >
                  Summary
                </Text>
                <Text
                  style={{ color: TC.text, fontSize: 22, fontWeight: "800" }}
                >
                  {formatHours(netH)}
                </Text>
                <Text style={{ color: TC.muted, fontSize: 12, marginTop: 4 }}>
                  {complete
                    ? "Completed shift"
                    : "Session still open — totals update when you clock out"}
                </Text>
              </View>

              {logContested ? (
                <View
                  style={{
                    marginHorizontal: 16,
                    marginTop: 16,
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: TC.noticeBg,
                    borderWidth: 1,
                    borderColor: TC.noticeBorder,
                  }}
                >
                  <TimeLogContestedBadge />
                  <Text
                    style={{
                      color: TC.noticeText,
                      fontSize: 13,
                      marginTop: 10,
                      textAlign: "center",
                      lineHeight: 18,
                    }}
                  >
                    Your contest was submitted and is awaiting review.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    const logToContest = log;
                    closeModal();
                    setTimeout(() => openContestModal(logToContest), 320);
                  }}
                  style={{
                    marginHorizontal: 16,
                    marginTop: 16,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: TC.accent,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}
                  >
                    Contest time log
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={closeModal}
                style={{
                  marginHorizontal: 16,
                  marginTop: 10,
                  marginBottom: 8,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: TC.borderStrong,
                  alignItems: "center",
                  backgroundColor: TC.card,
                }}
              >
                <Text
                  style={{
                    color: TC.textSecondary,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      );
    }

    return null;
  };

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
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#f97316" />
            <Text className="mt-4 text-slate-600">Loading time logs...</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 4,
              paddingBottom: Math.max(insets.bottom, 12) + 28,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#f97316"
              />
            }
          >
            {timeLogs.length === 0 ? (
              <View className="items-center justify-center py-10 bg-slate-50 rounded-xl mb-6 border border-slate-200">
                <Ionicons name="time-outline" size={48} color="#f97316" />
                <Text className="mt-4 text-slate-700 text-center font-medium">
                  No time logs available.
                </Text>
                <Text className="text-slate-500 text-center mt-1">
                  Your punch records will appear here.
                </Text>
              </View>
            ) : (
              <View style={{ marginBottom: 8 }}>
                <View
                  style={{
                    marginBottom: 16,
                    paddingVertical: 16,
                    paddingHorizontal: 16,
                    backgroundColor: TC.grey50,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: TC.grey200,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 23,
                        backgroundColor: TC.grey100,
                        borderWidth: 1,
                        borderColor: TC.grey200,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 14,
                      }}
                    >
                      <Ionicons
                        name="person-outline"
                        size={24}
                        color={TC.grey400}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {summaryEmployee ? (
                        <Text
                          style={{
                            color: TC.text,
                            fontSize: 18,
                            fontWeight: "800",
                            lineHeight: 24,
                          }}
                          numberOfLines={2}
                        >
                          {summaryEmployee}
                        </Text>
                      ) : null}
                      <Text
                        style={{
                          color: TC.grey600,
                          fontSize: 14,
                          marginTop: 6,
                          lineHeight: 20,
                          fontWeight: "500",
                        }}
                      >
                        {timeLogs.length}{" "}
                        {timeLogs.length === 1 ? "punch" : "punches"} on record
                      </Text>
                    </View>
                  </View>
                </View>

                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: TC.grey600,
                    marginBottom: 12,
                    marginLeft: 2,
                    letterSpacing: 0.3,
                  }}
                >
                  By day
                </Text>

                {groupedByDay.map((group) => (
                  <View
                    key={group.key}
                    style={{
                      marginBottom: 18,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: TC.border,
                      overflow: "hidden",
                      backgroundColor: TC.shell,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        rowGap: 10,
                        columnGap: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        backgroundColor: TC.card,
                        borderBottomWidth: 1,
                        borderBottomColor: TC.border,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          alignItems: "center",
                          flexGrow: 1,
                          flexShrink: 1,
                          rowGap: 8,
                          columnGap: 10,
                        }}
                      >
                        <Text
                          style={{
                            color: TC.text,
                            fontSize: 17,
                            fontWeight: "700",
                          }}
                        >
                          {group.dateLabel}
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: TC.punchBadgeBg,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: TC.orangeBorder,
                          }}
                        >
                          <Ionicons
                            name="time-outline"
                            size={14}
                            color={TC.punchBadgeIcon}
                          />
                          <Text
                            style={{
                              color: TC.punchBadgeText,
                              fontSize: 13,
                              fontWeight: "700",
                              marginLeft: 6,
                            }}
                          >
                            {group.logs.length}{" "}
                            {group.logs.length === 1 ? "shift" : "shifts"}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={{
                          color: TC.text,
                          fontSize: 16,
                          fontWeight: "700",
                          flexShrink: 0,
                        }}
                      >
                        {formatHoursDecimal(group.totalHours)} total
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: 12,
                        paddingTop: 12,
                        paddingBottom: 14,
                      }}
                    >
                      {group.logs.map((log, idx) =>
                        renderShiftRow(log, idx, group.key, group.logs.length),
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </Animated.View>

      <Modal
        visible={contestModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={closeContestModal}
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
                onPress={closeContestModal}
              />
              <TouchableWithoutFeedback
                onPress={Keyboard.dismiss}
                accessible={false}
              >
                <View
                  style={{
                    backgroundColor: TC.bg,
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    maxHeight: height * 0.92,
                    paddingBottom: Math.max(insets.bottom, 12) + 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      paddingTop: 14,
                      paddingBottom: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: TC.border,
                    }}
                  >
                    <Text
                      style={{
                        color: TC.text,
                        fontSize: 18,
                        fontWeight: "700",
                      }}
                    >
                      Contest time log
                    </Text>
                    <TouchableOpacity onPress={closeContestModal} hitSlop={12}>
                      <Ionicons name="close" size={26} color={TC.muted} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    scrollEnabled={
                      !(
                        ctReqDateModalVisible ||
                        ctTimeModalVisible ||
                        ctAndroidPicker
                      )
                    }
                    contentContainerStyle={{
                      paddingHorizontal: 16,
                      paddingTop: 12,
                      paddingBottom: 24,
                    }}
                  >
                    {contestLog ? (
                      <View
                        style={{
                          backgroundColor: TC.shell,
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 14,
                          borderWidth: 1,
                          borderColor: TC.border,
                        }}
                      >
                        <Text style={{ color: TC.muted, fontSize: 11 }}>
                          Log on record
                        </Text>
                        <Text
                          style={{ color: TC.text, fontSize: 13, marginTop: 4 }}
                        >
                          In: {formatPunchInstant(contestLog.timeIn)}
                        </Text>
                        <Text
                          style={{ color: TC.text, fontSize: 13, marginTop: 2 }}
                        >
                          Out:{" "}
                          {contestLog.timeOut
                            ? formatPunchInstant(contestLog.timeOut)
                            : "Still clocked in"}
                        </Text>
                        <Text
                          style={{
                            color: TC.muted,
                            fontSize: 11,
                            marginTop: 6,
                          }}
                        >
                          Log ID {contestLog.id}
                        </Text>
                      </View>
                    ) : null}

                    <Text
                      style={{
                        color: TC.muted,
                        fontSize: 13,
                        marginBottom: 14,
                        lineHeight: 18,
                      }}
                    >
                      Propose corrected clock-in and clock-out for approval.
                      Times below match the log as shown; when you submit, they
                      are converted using company timezone ({contestTimeZone})
                      and sent as UTC.
                    </Text>

                    <Text
                      style={{
                        color: TC.text,
                        fontSize: 15,
                        fontWeight: "700",
                        marginBottom: 8,
                      }}
                    >
                      Shift date <Text style={{ color: TC.red }}>*</Text>
                    </Text>
                    <TouchableOpacity
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: TC.shell,
                        borderRadius: 10,
                        marginBottom: 14,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: TC.border,
                      }}
                      onPress={() => {
                        dismissCtTimePickerSheet();
                        setCtApproverOpen(false);
                        if (Platform.OS === "android") {
                          setCtAndroidPicker("date");
                        } else {
                          setCtReqDateModalVisible(true);
                        }
                      }}
                    >
                      <Text style={{ color: TC.text }}>
                        {ctReqDate.toLocaleDateString()}
                      </Text>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={TC.muted}
                      />
                    </TouchableOpacity>

                    <Text
                      style={{
                        color: TC.text,
                        fontSize: 15,
                        fontWeight: "700",
                        marginBottom: 8,
                      }}
                    >
                      Corrected clock-in{" "}
                      <Text style={{ color: TC.red }}>*</Text>
                    </Text>
                    <TouchableOpacity
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: TC.shell,
                        borderRadius: 10,
                        marginBottom: 14,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: TC.border,
                      }}
                      onPress={() => openCtTimePicker("in")}
                    >
                      <Text style={{ color: TC.text }}>
                        {formatPickerWallTimeLabel(ctClockInTime)}
                      </Text>
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color={TC.muted}
                      />
                    </TouchableOpacity>

                    <Text
                      style={{
                        color: TC.text,
                        fontSize: 15,
                        fontWeight: "700",
                        marginBottom: 8,
                      }}
                    >
                      Corrected clock-out{" "}
                      <Text style={{ color: TC.red }}>*</Text>
                    </Text>
                    <TouchableOpacity
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: TC.shell,
                        borderRadius: 10,
                        marginBottom: 14,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: TC.border,
                      }}
                      onPress={() => openCtTimePicker("out")}
                    >
                      <Text style={{ color: TC.text }}>
                        {formatPickerWallTimeLabel(ctClockOutTime)}
                      </Text>
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color={TC.muted}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 14,
                      }}
                      onPress={() =>
                        setCtClockOutCrossesNextDay((prev) => !prev)
                      }
                      activeOpacity={0.7}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: ctClockOutCrossesNextDay }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: ctClockOutCrossesNextDay
                            ? TC.accent
                            : TC.borderStrong,
                          backgroundColor: ctClockOutCrossesNextDay
                            ? TC.accent
                            : TC.bg,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 10,
                        }}
                      >
                        {ctClockOutCrossesNextDay ? (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        ) : null}
                      </View>
                      <Text
                        style={{
                          color: TC.textSecondary,
                          fontSize: 14,
                          flexShrink: 1,
                        }}
                      >
                        Clock-out crosses next day?
                      </Text>
                    </TouchableOpacity>

                    <View style={{ marginBottom: 14, zIndex: 8000 }}>
                      <Text
                        style={{
                          color: TC.text,
                          fontSize: 15,
                          fontWeight: "700",
                          marginBottom: 8,
                        }}
                      >
                        Approver <Text style={{ color: TC.red }}>*</Text>
                      </Text>
                      {ctApproversLoading ? (
                        <ActivityIndicator color={TC.accent} />
                      ) : (
                        <DropDownPicker
                          open={ctApproverOpen}
                          value={ctApproverValue}
                          items={ctApproverItems}
                          setOpen={(open) => {
                            setCtApproverOpen(open);
                            if (open) {
                              setCtReqDateModalVisible(false);
                              dismissCtTimePickerSheet();
                              Keyboard.dismiss();
                            }
                          }}
                          setValue={setCtApproverValue}
                          setItems={setCtApproverItems}
                          placeholder="Select approver"
                          textStyle={{ color: TC.textSecondary }}
                          style={{
                            borderColor: TC.border,
                            backgroundColor: TC.shell,
                            minHeight: 50,
                          }}
                          dropDownContainerStyle={{
                            borderColor: TC.border,
                            backgroundColor: TC.bg,
                            maxHeight: 220,
                          }}
                          placeholderStyle={{ color: TC.mutedLight }}
                          zIndex={8000}
                          zIndexInverse={6000}
                          listMode="SCROLLVIEW"
                          nestedScrollEnabled
                        />
                      )}
                    </View>

                    <Text
                      style={{
                        color: TC.text,
                        fontSize: 15,
                        fontWeight: "700",
                        marginBottom: 8,
                      }}
                    >
                      Reason (optional)
                    </Text>
                    <TextInput
                      style={{
                        borderWidth: 1,
                        borderColor: TC.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: TC.text,
                        marginBottom: 14,
                        minHeight: 72,
                        textAlignVertical: "top",
                        backgroundColor: TC.bg,
                      }}
                      placeholder="e.g. Wrong punch time"
                      placeholderTextColor={TC.mutedLight}
                      multiline
                      value={ctReason}
                      onChangeText={setCtReason}
                    />

                    <Text
                      style={{
                        color: TC.text,
                        fontSize: 15,
                        fontWeight: "700",
                        marginBottom: 8,
                      }}
                    >
                      Description (optional)
                    </Text>
                    <TextInput
                      style={{
                        borderWidth: 1,
                        borderColor: TC.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: TC.text,
                        marginBottom: 16,
                        minHeight: 80,
                        textAlignVertical: "top",
                        backgroundColor: TC.bg,
                      }}
                      placeholder="Additional details for your approver"
                      placeholderTextColor={TC.mutedLight}
                      multiline
                      value={ctDescription}
                      onChangeText={setCtDescription}
                    />

                    <TouchableOpacity
                      onPress={submitContestTimeLog}
                      disabled={ctSubmitting || ctApproversLoading}
                      style={{
                        paddingVertical: 14,
                        borderRadius: 12,
                        alignItems: "center",
                        backgroundColor:
                          ctSubmitting || ctApproversLoading
                            ? TC.mutedLight
                            : TC.accent,
                      }}
                    >
                      {ctSubmitting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: 16,
                          }}
                        >
                          Submit contest
                        </Text>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </KeyboardAvoidingView>

          {Platform.OS === "ios" && ctReqDateModalVisible ? (
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
                onPress={() => setCtReqDateModalVisible(false)}
              />
              <View
                style={{
                  backgroundColor: TC.bg,
                  borderRadius: 16,
                  padding: 16,
                  width: "100%",
                  maxWidth: 400,
                  alignSelf: "center",
                  zIndex: 50001,
                }}
              >
                <Text
                  style={{
                    color: TC.text,
                    fontSize: 17,
                    fontWeight: "700",
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  Shift date
                </Text>
                <DateTimePicker
                  value={ctReqDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onCtReqDateModalChange}
                  themeVariant={Platform.OS === "ios" ? "light" : undefined}
                />
                {Platform.OS === "ios" ? (
                  <TouchableOpacity
                    onPress={() => setCtReqDateModalVisible(false)}
                    style={{
                      backgroundColor: TC.accent,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      Done
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {Platform.OS === "ios" &&
          ctTimeModalVisible &&
          (ctTimeModalKind === "in" || ctTimeModalKind === "out") ? (
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
                onPress={dismissCtTimePickerSheet}
              />
              <View
                style={{
                  backgroundColor: TC.bg,
                  borderRadius: 16,
                  padding: 16,
                  width: "100%",
                  maxWidth: 400,
                  alignSelf: "center",
                  zIndex: 50001,
                }}
              >
                <Text
                  style={{
                    color: TC.text,
                    fontSize: 17,
                    fontWeight: "700",
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  {ctTimeModalKind === "out"
                    ? "Clock out time"
                    : "Clock in time"}
                </Text>
                <DateTimePicker
                  key={`ct-time-${ctTimeModalKind}-${ctTimePickerSessionRef.current}`}
                  value={
                    Platform.OS === "ios"
                      ? cloneJsDate(
                          combinePickerDateAndWallTime(
                            IOS_CONTEST_TIME_PICKER_ANCHOR,
                            ctTimeModalValue,
                          ),
                        )
                      : ctTimeModalValue
                  }
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  is24Hour={Platform.OS === "android" ? true : undefined}
                  onChange={onCtTimeModalChange}
                  themeVariant={Platform.OS === "ios" ? "light" : undefined}
                />
                {Platform.OS === "ios" ? (
                  <TouchableOpacity
                    onPress={dismissCtTimePickerSheet}
                    style={{
                      backgroundColor: TC.accent,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      Done
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {modalVisible && (
        <Modal
          transparent={true}
          animationType="none"
          visible={modalVisible}
          onRequestClose={closeModal}
        >
          <View style={{ flex: 1 }}>
            {/* Backdrop */}
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

            {/* Modal Content — details needs fixed height so inner ScrollView can scroll */}
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
                ...(modalMode === "details"
                  ? {
                      height: Math.min(height * 0.9, height - insets.top - 32),
                      maxHeight: height * 0.92,
                    }
                  : {
                      minHeight: height * 0.65,
                      maxHeight: height * 0.8,
                    }),
                paddingBottom:
                  Platform.OS === "ios" ? Math.max(insets.bottom, 8) : 20,
              }}
            >
              {/* Drag Handle */}
              <View
                className="items-center py-3"
                {...modalPanResponder.panHandlers}
              >
                <View className="w-10 h-1 bg-slate-200 rounded-lg" />
              </View>

              <View style={{ flex: 1, minHeight: 0 }}>
                {renderModalContent()}
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}

      {renderCtAndroidPicker()}
    </SafeAreaView>
  );
};

export default TimekeepingTimeCard;
