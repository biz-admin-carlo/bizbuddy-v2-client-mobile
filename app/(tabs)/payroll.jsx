// File: app/(tabs)/payroll.jsx

"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Alert as RNAlert,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Modal,
  Dimensions,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { API_BASE_URL } from "../../config/constant";

// Mock payslips for development/testing fallback
const MOCK_PAYSLIPS = [
  {
    id: "PS-2025-11B",
    period: { start: "2025-11-16", end: "2025-11-30" },
    generatedAt: "2025-12-01T09:12:00Z",
    status: "Paid",
    gross: 145000.0,
    deductions: 25000.0,
    net: 120000.0,
    earnings: [
      { label: "Basic Pay", amount: 120000 },
      { label: "Overtime", amount: 5000 },
      { label: "Allowance", amount: 20000 },
    ],
    deductionItems: [
      { label: "Withholding Tax", amount: 12000 },
      { label: "SSS", amount: 6000 },
      { label: "PhilHealth", amount: 4000 },
      { label: "Pag-IBIG", amount: 3000 },
    ],
    pdfUrl: "https://mybizbuddy.co/mock-payslip-PS-2025-11B.pdf",
  },
  {
    id: "PS-2025-11A",
    period: { start: "2025-11-01", end: "2025-11-15" },
    generatedAt: "2025-11-16T09:10:00Z",
    status: "Paid",
    gross: 140000.0,
    deductions: 22000.0,
    net: 118000.0,
    earnings: [
      { label: "Basic Pay", amount: 115000 },
      { label: "Overtime", amount: 4000 },
      { label: "Allowance", amount: 21000 },
    ],
    deductionItems: [
      { label: "Withholding Tax", amount: 11000 },
      { label: "SSS", amount: 5500 },
      { label: "PhilHealth", amount: 3500 },
      { label: "Pag-IBIG", amount: 2000 },
    ],
    pdfUrl: "https://mybizbuddy.co/mock-payslip-PS-2025-11A.pdf",
  },
  {
    id: "PS-2025-10B",
    period: { start: "2025-10-16", end: "2025-10-31" },
    generatedAt: "2025-11-01T09:00:00Z",
    status: "Paid",
    gross: 138000.0,
    deductions: 21000.0,
    net: 117000.0,
    earnings: [
      { label: "Basic Pay", amount: 114000 },
      { label: "Overtime", amount: 3000 },
      { label: "Allowance", amount: 21000 },
    ],
    deductionItems: [
      { label: "Withholding Tax", amount: 10500 },
      { label: "SSS", amount: 5200 },
      { label: "PhilHealth", amount: 3300 },
      { label: "Pag-IBIG", amount: 2000 },
    ],
    pdfUrl: "https://mybizbuddy.co/mock-payslip-PS-2025-10B.pdf",
  },
];

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

const formatRange = (startIso, endIso) =>
  `${new Date(startIso).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
  })} - ${new Date(endIso).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  })}`;

function Payroll() {
  const [loading, setLoading] = useState(false);
  const [payslips, setPayslips] = useState([]);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [pdfViewerSource, setPdfViewerSource] = useState(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState("");
  const itemsPerPage = 3;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const modalBgAnim = useRef(new Animated.Value(0)).current;
  const modalYAnim = useRef(
    new Animated.Value(Dimensions.get("window").height)
  ).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loadPayslips = async ({ showLoader = true } = {}) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        setPayslips(MOCK_PAYSLIPS);
        setPage(1);
        return;
      }
      const handleSuccessPayload = (payload) => {
        // Try to normalize common API shapes into a flat list
        let list = [];
        if (Array.isArray(payload?.data)) {
          list = payload.data;
        } else if (
          payload?.data &&
          typeof payload.data === "object" &&
          !Array.isArray(payload.data)
        ) {
          const nested =
            payload.data.payslips ||
            payload.data.items ||
            payload.data.results ||
            payload.data.records ||
            payload.data.rows;
          if (Array.isArray(nested)) {
            list = nested;
          }
        } else if (Array.isArray(payload?.payslips)) {
          list = payload.payslips;
        } else if (Array.isArray(payload?.items)) {
          list = payload.items;
        } else if (Array.isArray(payload?.results)) {
          list = payload.results;
        } else if (Array.isArray(payload)) {
          list = payload;
        }

        console.log("[Payroll] Raw payslip payload:", payload);
        console.log("[Payroll] Normalized payslip list:", list);

        const mapped = list.map(mapApiPayslipToUi).filter(Boolean);
        console.log("[Payroll] Mapped payslips for UI:", mapped);

        const sorted = mapped.sort((a, b) => {
          const aKey =
            new Date(a?.period?.end || a?.generatedAt || 0).getTime() || 0;
          const bKey =
            new Date(b?.period?.end || b?.generatedAt || 0).getTime() || 0;
          return bKey - aKey;
        });
        setPayslips(sorted.length > 0 ? sorted : MOCK_PAYSLIPS);
        setPage(1);
      };

      // Primary endpoint: new employee payslips route
      const primaryUrl = `${API_BASE_URL}/api/payroll-system/my-payslips`;
      let res = await fetch(primaryUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.log(
          "[Payroll] Error (primary /my-payslips):",
          res.status,
          res.statusText,
          data
        );

        // Fallback to legacy endpoint `/api/payroll/my` if primary fails
        const fallbackUrl = `${API_BASE_URL}/api/payroll/my`;
        try {
          res = await fetch(fallbackUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          data = await res.json().catch(() => ({}));
        } catch (fallbackErr) {
          console.error(
            "[Payroll] Fallback /my fetch error:",
            fallbackErr?.message || fallbackErr
          );
        }

        if (!res.ok) {
          console.log(
            "[Payroll] Error (fallback /my):",
            res.status,
            res.statusText,
            data
          );
          setPayslips(MOCK_PAYSLIPS);
          setPage(1);
        } else {
          handleSuccessPayload(data);
        }
      } else {
        handleSuccessPayload(data);
      }
    } catch (e) {
      console.error("[Payroll] Fetch error:", e);
      setPayslips(MOCK_PAYSLIPS);
      setPage(1);
      RNAlert?.alert?.("Error", "Failed to load payslips. Please try again.");
    } finally {
      if (showLoader) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPayslips({ showLoader: true });
  }, []);

  const onRefresh = () => {
    loadPayslips({ showLoader: false });
  };

  const mapApiPayslipToUi = (item) => {
    if (!item || typeof item !== "object") return null;
    const idCandidate =
      item.id ??
      item.reference ??
      item.code ??
      item.ref ??
      `${item?.periodStart || item?.startDate || ""}-${
        item?.periodEnd || item?.endDate || ""
      }`.trim();
    const id = idCandidate || String(Math.random()).slice(2);
    const start =
      item?.period?.start ||
      item?.periodStart ||
      item?.cutoffStart ||
      item?.cutOffStart ||
      item?.startDate ||
      item?.fromDate ||
      item?.from ||
      null;
    const end =
      item?.period?.end ||
      item?.periodEnd ||
      item?.cutoffEnd ||
      item?.cutOffEnd ||
      item?.endDate ||
      item?.toDate ||
      item?.to ||
      null;
    const generatedAt =
      item.generatedAt ||
      item.dateGenerated ||
      item.createdAt ||
      item.createdOn ||
      item.updatedAt ||
      end ||
      start ||
      new Date().toISOString();
    const status = item.status || item.state || "Paid";
    const payrollId =
      item.payrollId || item.payrollRunId || item.payrollID || item.id || id;
    const gross = toNum(
      item.gross ??
        item.grossPay ??
        item.totalEarnings ??
        item.earningsTotal ??
        0
    );
    const taxesAmount = toNum(
      item.taxes ?? item.tax ?? item.taxTotal ?? item.totalTaxes ?? 0
    );
    let deductions = toNum(
      item.deductions ?? item.totalDeductions ?? item.deductionsTotal ?? 0
    );
    // If backend separates taxes from deductions (like your sample),
    // treat taxes as part of total deductions when the plain deductions field is 0.
    if (deductions === 0 && taxesAmount > 0) {
      deductions = taxesAmount;
    }
    const net = toNum(
      item.net ?? item.netPay ?? item.takeHome ?? gross - deductions
    );
    const earningsRaw =
      item.earnings ||
      item.earningItems ||
      item.earningBreakdown ||
      item.incomeItems ||
      [];
    let deductionRaw =
      item.deductionItems ||
      item.deductionsBreakdown ||
      item.deductionsList ||
      [];

    // Ensure tax-related entries are also included in deductions
    const taxArrays = [
      item.taxItems,
      item.taxes,
      item.taxesBreakdown,
      item.taxBreakdown,
    ].filter((arr) => Array.isArray(arr));
    if (taxArrays.length > 0) {
      deductionRaw = deductionRaw.concat(...taxArrays);
    }
    // If we have only a numeric tax (no breakdown), add a synthetic "Taxes" line item
    if (
      taxesAmount > 0 &&
      Array.isArray(deductionRaw) &&
      !deductionRaw.some((row) =>
        String(row?.label || row?.name || row?.type || "")
          .toLowerCase()
          .includes("tax")
      )
    ) {
      deductionRaw = deductionRaw.concat({
        label: "Taxes",
        amount: taxesAmount,
      });
    }
    const earnings = Array.isArray(earningsRaw)
      ? earningsRaw.map((row, idx) => ({
          label:
            row?.label ||
            row?.name ||
            row?.type ||
            row?.description ||
            `Earning ${idx + 1}`,
          amount: toNum(row?.amount ?? row?.value ?? row?.total ?? 0),
        }))
      : [];
    const deductionItems = Array.isArray(deductionRaw)
      ? deductionRaw.map((row, idx) => ({
          label:
            row?.label ||
            row?.name ||
            row?.type ||
            row?.description ||
            `Deduction ${idx + 1}`,
          amount: toNum(row?.amount ?? row?.value ?? row?.total ?? 0),
        }))
      : [];
    const employeeId =
      item.employeeId ||
      item.userId ||
      item.employee?.id ||
      item.user?.id ||
      null;
    // Prefer constructing the PDF URL from payroll/employee IDs using
    // the dedicated generate-payslip endpoint so it always reflects
    // the latest server logic.
    let pdfUrl = null;
    if (payrollId && employeeId) {
      pdfUrl = `${API_BASE_URL}/api/payroll-system/generate-payslip-pdf/${encodeURIComponent(
        String(payrollId)
      )}/${encodeURIComponent(String(employeeId))}`;
    } else {
      // Fallback to any direct URL provided by the backend
      pdfUrl =
        item.pdfUrl ||
        item.pdfURL ||
        item.payslipUrl ||
        item.payslipURL ||
        item.downloadUrl ||
        item.downloadURL ||
        item.url ||
        null;
    }
    return {
      id: String(id),
      period: { start, end },
      generatedAt,
      status,
      payrollId: String(payrollId),
      gross,
      deductions,
      taxes: taxesAmount,
      net,
      earnings,
      deductionItems,
      pdfUrl,
    };
  };

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const latest = payslips[0] || null;
  const totalPages = Math.max(1, Math.ceil(payslips.length / itemsPerPage));
  const startIdx = (page - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const currentPageItems = payslips.slice(startIdx, endIdx);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const fetchPayslipDetails = async (slip) => {
    try {
      const payrollId =
        slip?.payrollId || slip?.id || slip?.reference || slip?.code || null;
      if (!payrollId) {
        console.log("[Payroll] No payrollId available for detail fetch");
        return;
      }

      setDetailsLoading(true);
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        console.log("[Payroll] Missing token, cannot load payslip details");
        return;
      }

      const detailUrl = `${API_BASE_URL}/api/payroll-system/my-payslip/${encodeURIComponent(
        String(payrollId)
      )}`;
      console.log("[Payroll] Fetching payslip detail from:", detailUrl);
      const res = await fetch(detailUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      console.log("[Payroll] Payslip detail raw response:", data);

      if (!res.ok) {
        console.log(
          "[Payroll] Error loading payslip detail:",
          res.status,
          res.statusText,
          data
        );
        return;
      }

      // Normalize detail payload, but keep original shape from backend
      let payload = null;
      if (Array.isArray(data?.data)) {
        payload = data.data[0];
      } else if (data?.data) {
        payload = data.data;
      } else if (Array.isArray(data)) {
        payload = data[0];
      } else {
        payload = data;
      }

      // Derive a payslip download URL from payrollRunId + employeeId
      const rawPayrollId =
        payload?.payrollRunId ||
        payload?.payrollId ||
        slip?.payrollId ||
        slip?.id ||
        null;

      // Employee ID should come from the authenticated user (JWT),
      // not from the payload shape, so decode it from the token.
      let authEmployeeId = null;
      try {
        const parts = (token || "").split(".");
        if (parts.length === 3 && typeof atob === "function") {
          const jwtPayload = JSON.parse(atob(parts[1] || ""));
          authEmployeeId =
            jwtPayload?.employeeId ??
            jwtPayload?.userId ??
            jwtPayload?.id ??
            jwtPayload?.sub ??
            null;
        }
      } catch (err) {
        console.log(
          "[Payroll] Failed to decode employeeId from token:",
          err?.message || err
        );
      }

      const rawEmployeeId = authEmployeeId;
      const detailPdfUrl =
        rawPayrollId && rawEmployeeId
          ? `${API_BASE_URL}/api/payroll-system/generate-payslip-pdf/${encodeURIComponent(
              String(rawPayrollId)
            )}/${encodeURIComponent(String(rawEmployeeId))}`
          : null;

      // Merge raw payload "as is" into the currently selected slip so we don't
      // lose any backend fields or be constrained by a fixed UI shape, and
      // also refresh the `pdfUrl` used by the download button from the detail.
      if (payload && typeof payload === "object") {
        setSelectedSlip((prev) => ({
          ...(prev || {}),
          ...payload,
          ...(detailPdfUrl ? { pdfUrl: detailPdfUrl } : {}),
        }));
      }
    } catch (e) {
      console.error("[Payroll] Detail fetch error:", e);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openModal = (slip) => {
    // Start with the summary info we already have from the list
    setSelectedSlip(slip);
    setModalVisible(true);
    modalYAnim.setValue(Dimensions.get("window").height);
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(modalYAnim, {
        toValue: 0,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();

    // Then fetch full payslip details using the payrollId
    fetchPayslipDetails(slip);
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalBgAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalYAnim, {
        toValue: Dimensions.get("window").height,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      setSelectedSlip(null);
    });
  };

  const StatusPill = ({ status }) => {
    const isPaid = status?.toLowerCase() === "paid";
    const pillClasses = isPaid
      ? "bg-green-100 text-green-700"
      : "bg-orange-100 text-orange-700";
    const icon = isPaid ? "checkmark-circle" : "time-outline";
    const color = isPaid ? "#16a34a" : "#f59e0b";
    return (
      <View
        className={`flex-row items-center px-2.5 py-1 rounded-full ${pillClasses}`}
      >
        <Ionicons name={icon} size={14} color={color} />
        <Text className="ml-1 text-xs font-semibold">{status}</Text>
      </View>
    );
  };

  const SummaryCard = ({ slip }) => {
    if (!slip) {
      return (
        <View className="bg-orange-50 p-5 rounded-xl mb-6">
          <View className="flex-row items-center mb-3">
            <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
              <Ionicons name="cash-outline" size={20} color="#f97316" />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-semibold text-slate-700">
                Latest Cut-off
              </Text>
              <Text className="text-sm text-slate-500">No payroll yet</Text>
            </View>
            <View className="flex-row items-center px-2.5 py-1 rounded-full bg-slate-100">
              <Ionicons name="time-outline" size={14} color="#64748b" />
              <Text className="ml-1 text-xs font-semibold text-slate-600">
                Pending
              </Text>
            </View>
          </View>
          <View className="bg-white p-3 rounded-lg mb-2 flex-row justify-between">
            <Text className="text-sm font-medium text-slate-400">Gross</Text>
            <Text className="text-sm text-slate-400">—</Text>
          </View>
          <View className="bg-white p-3 rounded-lg mb-2 flex-row justify-between">
            <Text className="text-sm font-medium text-slate-400">
              Deductions
            </Text>
            <Text className="text-sm text-slate-400">—</Text>
          </View>
          <View className="bg-orange-100 p-3 rounded-lg flex-row justify-between">
            <Text className="text-sm font-semibold text-slate-600">
              Net Pay
            </Text>
            <Text className="text-sm font-bold text-orange-600">—</Text>
          </View>
        </View>
      );
    }
    return (
      <View className="bg-orange-50 p-5 rounded-xl mb-6">
        <View className="flex-row items-center mb-3">
          <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
            <Ionicons name="cash-outline" size={20} color="#f97316" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-slate-700">
              Latest Cut-off
            </Text>
            <Text className="text-sm text-slate-500">
              {formatRange(slip.period.start, slip.period.end)}
            </Text>
          </View>
          <StatusPill status={slip.status} />
        </View>

        <View className="bg-white p-3 rounded-lg mb-2 flex-row justify-between">
          <Text className="text-sm font-medium text-slate-600">Gross</Text>
          <Text className="text-sm text-slate-700">
            {formatCurrency(slip.gross)}
          </Text>
        </View>
        <View className="bg-white p-3 rounded-lg mb-2 flex-row justify-between">
          <Text className="text-sm font-medium text-slate-600">Deductions</Text>
          <Text className="text-sm text-slate-700">
            {formatCurrency(slip.deductions)}
          </Text>
        </View>
        <View className="bg-orange-100 p-3 rounded-lg flex-row justify-between">
          <Text className="text-sm font-semibold text-slate-700">Net Pay</Text>
          <Text className="text-sm font-bold text-orange-600">
            {formatCurrency(slip.net)}
          </Text>
        </View>

        <View className="mt-3">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <Ionicons name="calendar-outline" size={16} color="#64748b" />
              <Text className="ml-1 text-xs text-slate-500">
                Generated {formatDate(slip.generatedAt)}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Ionicons name="pricetag-outline" size={16} color="#64748b" />
              <Text className="ml-1 text-xs text-slate-500">{slip.id}</Text>
            </View>
          </View>
          <View className="flex-row mt-1">
            <TouchableOpacity
              className="flex-1 py-2.5 rounded-lg bg-white border border-orange-400 mr-2 items-center"
              activeOpacity={0.9}
              onPress={() => handleViewPayslip(slip)}
            >
              <View className="flex-row items-center">
                <Ionicons
                  name="eye-outline"
                  size={16}
                  color="#fb923c"
                  style={{ marginRight: 6 }}
                />
                <Text className="text-orange-500 text-xs font-semibold">
                  View Payslip
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 py-2.5 rounded-lg bg-orange-400 items-center"
              activeOpacity={0.9}
              onPress={() => handleDownloadPayslip(slip)}
            >
              <View className="flex-row items-center">
                <Ionicons
                  name="download-outline"
                  size={16}
                  color="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
                <Text className="text-white text-xs font-semibold">
                  Download Payslip
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const PayslipCard = ({ slip }) => {
    return (
      <View className="mb-3 p-4 bg-slate-50 rounded-xl">
        <TouchableOpacity activeOpacity={0.85} onPress={() => openModal(slip)}>
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-1">
              <Text className="font-semibold text-slate-700 text-sm">
                {formatRange(slip.period.start, slip.period.end)}
              </Text>
              <Text className="text-xs text-slate-500 mt-0.5">
                Ref: {slip.id} • {formatDate(slip.generatedAt)}
              </Text>
            </View>
            <StatusPill status={slip.status} />
          </View>

          <View className="mt-3 flex-row justify-end">
            <View className="flex-row items-center px-3 py-2 rounded-lg bg-white border border-slate-200">
              <Ionicons
                name="document-text-outline"
                size={16}
                color="#64748b"
              />
              <Text className="ml-1.5 text-xs font-medium text-slate-600">
                View Details
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View className="mt-2 flex-row justify-end">
          <TouchableOpacity
            className="py-2.5 px-3 rounded-lg bg-white border border-orange-400 mr-2"
            activeOpacity={0.9}
            onPress={() => handleViewPayslip(slip)}
          >
            <View className="flex-row items-center">
              <Ionicons
                name="eye-outline"
                size={16}
                color="#fb923c"
                style={{ marginRight: 6 }}
              />
              <Text className="text-orange-500 text-xs font-semibold">
                View Payslip
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            className="py-2.5 px-3 rounded-lg bg-orange-400"
            activeOpacity={0.9}
            onPress={() => handleDownloadPayslip(slip)}
          >
            <View className="flex-row items-center">
              <Ionicons
                name="download-outline"
                size={16}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
              <Text className="text-white text-xs font-semibold">
                Download Payslip
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const handleDownloadPayslip = async (slip) => {
    try {
      setDownloading(true);

      const payrollId =
        slip?.payrollId || slip?.id || slip?.reference || slip?.code || null;

      // Prefer using the dedicated my-payslip/{payrollId} PDF endpoint which
      // returns the PDF file itself (not just a URL).
      if (payrollId) {
        const token = await SecureStore.getItemAsync("token");
        if (!token) {
          console.log(
            "[Payroll] Missing token, cannot download payslip for",
            payrollId
          );
        } else {
          const pdfEndpoint = `${API_BASE_URL}/api/payroll-system/my-payslip/${encodeURIComponent(
            String(payrollId)
          )}`;
          console.log("[Payroll] Downloading payslip PDF from:", pdfEndpoint);

          const fileUri = `${
            FileSystem.documentDirectory || ""
          }payslip-${encodeURIComponent(String(payrollId))}.pdf`;

          try {
            const { uri } = await FileSystem.downloadAsync(
              pdfEndpoint,
              fileUri,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/pdf",
                },
              }
            );

            await Sharing.shareAsync(uri, {
              mimeType: "application/pdf",
              dialogTitle: "Download Payslip",
            });
            return;
          } catch (downloadErr) {
            console.error(
              "[Payroll] Error downloading payslip PDF:",
              downloadErr
            );
            // Fall through to legacy URL-based handling below.
          }
        }
      }

      // Legacy / fallback behaviour: open whatever direct URL the backend
      // provided on the payslip itself (useful for mocks or older APIs).
      const url = slip?.pdfUrl;
      if (!url) {
        RNAlert?.alert?.(
          "Unavailable",
          "No downloadable PDF was provided for this payslip."
        );
        return;
      }

      await Linking.openURL(String(url));
    } catch (err) {
      console.error("[Payroll] Download error:", err);
      RNAlert?.alert?.(
        "Download failed",
        "Something went wrong while preparing the download."
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleViewPayslip = async (slip) => {
    try {
      const payrollId =
        slip?.payrollId || slip?.id || slip?.reference || slip?.code || null;
      let url = slip?.pdfUrl || null;

      // Prefer the authenticated my-payslip/{payrollId} endpoint for viewing,
      // so the PDF is rendered directly in-app via WebView.
      if (payrollId) {
        const token = await SecureStore.getItemAsync("token");
        if (!token) {
          console.log(
            "[Payroll] Missing token, cannot view payslip for",
            payrollId
          );
        } else {
          const pdfEndpoint = `${API_BASE_URL}/api/payroll-system/my-payslip/${encodeURIComponent(
            String(payrollId)
          )}`;
          console.log("[Payroll] Viewing payslip PDF from:", pdfEndpoint);

          setPdfViewerSource({
            uri: pdfEndpoint,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/pdf",
            },
          });
          setPdfViewerTitle(slip?.id || `Payslip ${payrollId}`);
          return;
        }
      }

      // Fallback to any direct URL stored on the payslip itself.
      if (url) {
        setPdfViewerSource({ uri: String(url) });
        setPdfViewerTitle(slip?.id || "Payslip");
      } else {
        RNAlert?.alert?.(
          "Unavailable",
          "No viewable PDF was provided for this payslip."
        );
      }
    } catch (err) {
      console.error("[Payroll] View error:", err);
      RNAlert?.alert?.(
        "View failed",
        "Something went wrong while opening the payslip."
      );
    }
  };

  const PayslipDetails = ({ slip, loading }) => {
    if (!slip) return null;
    const allDeductionItems = slip.deductionItems || [];

    // Split out tax lines for clearer UI, but still include them in totals
    const taxKeywords = ["tax", "withholding"];
    const taxItems = allDeductionItems.filter((row) => {
      const labelLower = String(row.label || "").toLowerCase();
      return taxKeywords.some((k) => labelLower.includes(k));
    });
    const nonTaxDeductions = allDeductionItems.filter(
      (row) => !taxItems.includes(row)
    );

    const displayedDeductionsTotal = allDeductionItems.reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0
    );
    return (
      <View className="p-5">
        <Text className="text-lg font-bold text-slate-700 mb-1 text-center">
          Payslip Details
        </Text>
        <Text className="text-xs text-slate-500 mb-4 text-center">
          {slip.id}
        </Text>

        <View className="bg-slate-50 rounded-lg p-4 mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-medium text-slate-600">Period</Text>
            <Text className="text-sm text-slate-700">
              {formatRange(slip.period.start, slip.period.end)}
            </Text>
          </View>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-medium text-slate-600">
              Generated
            </Text>
            <Text className="text-sm text-slate-700">
              {formatDate(slip.generatedAt)}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-slate-600">Status</Text>
            <StatusPill status={slip.status} />
          </View>
        </View>

        <Text className="text-sm font-bold text-slate-700 mb-2">Earnings</Text>
        <View className="bg-white rounded-lg border border-slate-200 mb-4">
          {(slip.earnings || []).map((row, idx) => (
            <View
              key={`${row.label}-${idx}`}
              className={`flex-row justify-between p-3 ${
                idx !== (slip.earnings || []).length - 1
                  ? "border-b border-slate-100"
                  : ""
              }`}
            >
              <Text className="text-sm text-slate-700">{row.label}</Text>
              <Text className="text-sm text-slate-700">
                {formatCurrency(row.amount)}
              </Text>
            </View>
          ))}
          <View className="flex-row justify-between p-3 bg-orange-50 rounded-b-lg">
            <Text className="text-sm font-semibold text-slate-700">Gross</Text>
            <Text className="text-sm font-semibold text-orange-600">
              {formatCurrency(slip.gross)}
            </Text>
          </View>
        </View>

        {nonTaxDeductions.length > 0 && (
          <>
            <Text className="text-sm font-bold text-slate-700 mb-2">
              Deductions
            </Text>
            <View className="bg-white rounded-lg border border-slate-200 mb-4">
              {nonTaxDeductions.map((row, idx) => (
                <View
                  key={`${row.label}-${idx}`}
                  className={`flex-row justify-between p-3 ${
                    idx !== nonTaxDeductions.length - 1
                      ? "border-b border-slate-100"
                      : ""
                  }`}
                >
                  <Text className="text-sm text-slate-700">{row.label}</Text>
                  <Text className="text-sm text-slate-700">
                    {formatCurrency(row.amount)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {taxItems.length > 0 && (
          <>
            <Text className="text-sm font-bold text-slate-700 mb-2">Taxes</Text>
            <View className="bg-white rounded-lg border border-slate-200 mb-4">
              {taxItems.map((row, idx) => (
                <View
                  key={`${row.label}-${idx}`}
                  className={`flex-row justify-between p-3 ${
                    idx !== taxItems.length - 1
                      ? "border-b border-slate-100"
                      : ""
                  }`}
                >
                  <Text className="text-sm text-slate-700">{row.label}</Text>
                  <Text className="text-sm text-slate-700">
                    {formatCurrency(row.amount)}
                  </Text>
                </View>
              ))}
              <View className="flex-row justify-between p-3 bg-slate-50 rounded-b-lg">
                <Text className="text-sm font-semibold text-slate-700">
                  Total Deductions (incl. taxes)
                </Text>
                <Text className="text-sm font-semibold text-slate-700">
                  {formatCurrency(displayedDeductionsTotal)}
                </Text>
              </View>
            </View>
          </>
        )}

        <View className="flex-row items-center justify-between bg-orange-100 p-4 rounded-lg">
          <Text className="text-base font-semibold text-slate-700">
            Net Pay
          </Text>
          <Text className="text-base font-bold text-orange-600">
            {formatCurrency(slip.net)}
          </Text>
        </View>

        <TouchableOpacity
          className="border border-slate-200 py-3.5 rounded-lg w-full items-center mt-5"
          onPress={closeModal}
        >
          <Text className="text-slate-600 font-bold text-base">Close</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top + 60 }}
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#cbd5e1" />
            <Text className="mt-4 text-slate-500">Loading payslips...</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-4 pb-6"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#fb923c"
                colors={["#fb923c"]}
              />
            }
          >
            {payslips.length === 0 ? (
              <>
                <Text className="text-xl font-bold text-slate-700 mb-3">
                  Payroll
                </Text>
                <SummaryCard slip={null} />
                <View className="items-center justify-center py-8 bg-slate-50 rounded-xl">
                  <Ionicons
                    name="document-text-outline"
                    size={40}
                    color="#94a3b8"
                  />
                  <Text className="mt-3 text-slate-500 text-center">
                    No payslip logs yet.
                  </Text>
                  <Text className="text-slate-400 text-center mt-1">
                    Your payslips will appear here when available.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text className="text-xl font-bold text-slate-700 mb-3">
                  Payroll
                </Text>
                <SummaryCard slip={latest} />
                <Text className="text-xl font-bold text-slate-700 mb-3">
                  Payslip History
                </Text>
                {currentPageItems.map((slip) => (
                  <PayslipCard key={slip.id} slip={slip} />
                ))}
                <View className="flex-row items-center justify-between mt-2">
                  <TouchableOpacity
                    className={`px-4 py-2 rounded-lg border ${
                      page === 1
                        ? "border-slate-200 bg-white opacity-50"
                        : "border-slate-200 bg-white"
                    }`}
                    disabled={page === 1}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                    activeOpacity={0.8}
                  >
                    <Text className="text-slate-700 text-sm">Previous</Text>
                  </TouchableOpacity>
                  <Text className="text-slate-500 text-sm">
                    Page {page} of {totalPages}
                  </Text>
                  <TouchableOpacity
                    className={`px-4 py-2 rounded-lg ${
                      page === totalPages
                        ? "bg-orange-100 opacity-50"
                        : "bg-orange-400"
                    }`}
                    disabled={page === totalPages}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                    activeOpacity={0.9}
                    style={
                      page === totalPages
                        ? undefined
                        : {
                            shadowColor: "#fb923c",
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.15,
                            shadowRadius: 4,
                            elevation: 3,
                          }
                    }
                  >
                    <Text
                      className={`${
                        page === totalPages ? "text-orange-600" : "text-white"
                      } text-sm font-semibold`}
                    >
                      Next
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </Animated.View>
      {modalVisible && (
        <Modal
          transparent={true}
          animationType="none"
          visible={modalVisible}
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
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                minHeight: Dimensions.get("window").height * 0.6,
                maxHeight: Dimensions.get("window").height * 0.85,
                paddingBottom: Platform.OS === "ios" ? 0 : 20,
              }}
            >
              <View className="items-center py-3">
                <View className="w-10 h-1 bg-slate-200 rounded-lg" />
              </View>
              <ScrollView className="flex-1" contentContainerClassName="pb-6">
                <PayslipDetails slip={selectedSlip} loading={detailsLoading} />
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>
      )}
      {pdfViewerSource && (
        <Modal
          visible={true}
          animationType="slide"
          onRequestClose={() => setPdfViewerSource(null)}
        >
          <SafeAreaView className="flex-1 bg-black">
            <View className="h-12 flex-row items-center px-4 bg-black/80">
              <TouchableOpacity
                onPress={() => setPdfViewerSource(null)}
                className="mr-3"
              >
                <Ionicons name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
              <Text
                className="text-white text-sm font-semibold flex-1"
                numberOfLines={1}
              >
                {pdfViewerTitle || "Payslip"}
              </Text>
            </View>
            <WebView
              source={pdfViewerSource}
              style={{ flex: 1 }}
              originWhitelist={["*"]}
              startInLoadingState
            />
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

export default Payroll;
