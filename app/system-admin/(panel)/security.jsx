import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AdminHeader,
  ErrorNote,
  ListAccordion,
  LoadingBlock,
  ShowMore,
  TimeRangeChips,
} from "../../../components/system-admin/ui";
import { systemAdminGet } from "../../../utils/systemAdminApi";
import { formatCount } from "../../../utils/systemAdminFormat";

const SEVERITIES = [
  { id: "critical", label: "Critical", color: "#dc2626" },
  { id: "warning", label: "Warning", color: "#d97706" },
  { id: "info", label: "Info", color: "#2563eb" },
];

const SIGNAL_FILTERS = [
  {
    id: "signin",
    label: "Sign-in",
    match: (type) =>
      ["account_failed_signins", "credential_stuffing", "new_network_signin"].includes(type) ||
      type.startsWith("reset_spike_"),
  },
  { id: "access", label: "Access", match: (type) => type === "repeated_access_denied" },
  { id: "bbuddy", label: "B. Buddy", match: (type) => type.startsWith("bbuddy_") },
  { id: "admin", label: "System admin", match: (type) => type.startsWith("admin_") },
  {
    id: "platform",
    label: "Platform",
    match: (type) => ["server_errors", "request_flood"].includes(type),
  },
];

function signalGroup(type) {
  const value = String(type || "");
  return SIGNAL_FILTERS.find((filter) => filter.match(value))?.id || "other";
}

function subjectLine(subject) {
  if (!subject) return "";
  return [
    subject.email,
    subject.ip ? `IP ${subject.ip}` : null,
    subject.agentCode ? `Staff ${subject.agentCode}` : null,
    subject.endpoint,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  const abs = Math.abs(minutes);
  if (abs < 1) return "just now";
  if (abs < 60) return `${abs} minute${abs === 1 ? "" : "s"} ago`;
  const hours = Math.round(abs / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function SystemAdminSecurity() {
  const [timeRange, setTimeRange] = useState("24h");
  const [filter, setFilter] = useState("all");
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await systemAdminGet(
      `/api/system-admin/security/signals?timeRange=${timeRange}`,
    );
    if (result.unauthorized) return;
    if (!result.ok) {
      setError(result.message || "Could not load security signals.");
    } else {
      setPayload(result.data || {});
    }
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    load();
  }, [load]);

  const signals = Array.isArray(payload?.signals) ? payload.signals : [];
  const countsByGroup = useMemo(() => {
    const totals = {};
    signals.forEach((signal) => {
      const group = signalGroup(signal.type);
      totals[group] = (totals[group] || 0) + 1;
    });
    return totals;
  }, [signals]);
  const visible =
    filter === "all" ? signals : signals.filter((signal) => signalGroup(signal.type) === filter);
  const updated = payload?.generatedAt ? formatAgo(payload.generatedAt) : "";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <AdminHeader
          title="Security Monitor"
          subtitle={`Suspicious activity across sign-ins, access, B. Buddy and system admins.${
            updated ? ` Updated ${updated}.` : ""
          }`}
          onRefresh={load}
          loading={loading}
          extra={<TimeRangeChips value={timeRange} onChange={setTimeRange} disabled={loading} />}
        />
        <ErrorNote message={error} />

        {loading && !payload ? (
          <LoadingBlock />
        ) : (
          <>
            <View className="flex-row gap-3 mb-4">
              {SEVERITIES.map((severity) => {
                const count = Number(payload?.counts?.[severity.id] ?? 0);
                return (
                  <View
                    key={severity.id}
                    className="flex-1 border border-slate-300 rounded-md bg-white p-3"
                  >
                    <Text className="text-sm text-slate-500 mb-2">{severity.label}</Text>
                    <Text
                      className="text-2xl font-bold"
                      style={{ color: count > 0 ? severity.color : "#0f172a" }}
                    >
                      {formatCount(count)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <ListAccordion
              title="Signals"
              subtitle={`${visible.length} in this view`}
              extra={
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-3 pb-3">
                  {[{ id: "all", label: "All" }, ...SIGNAL_FILTERS].map((item) => {
                    const selected = filter === item.id;
                    const count = item.id === "all" ? signals.length : countsByGroup[item.id] || 0;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => setFilter(item.id)}
                        className="mr-2 px-3 py-1 rounded-full border"
                        style={{
                          backgroundColor: selected ? "#0f172a" : "#ffffff",
                          borderColor: selected ? "#0f172a" : "#e2e8f0",
                        }}
                      >
                        <Text
                          className="text-xs"
                          style={{ color: selected ? "#ffffff" : "#64748b" }}
                        >
                          {item.label} {count}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              }
            >
              {visible.length === 0 ? (
                <Text className="text-sm text-slate-500 text-center py-8">
                  No security signals in this period.
                </Text>
              ) : (
                <ShowMore>
                {visible.map((signal, index) => {
                  const severity =
                    SEVERITIES.find((item) => item.id === signal.severity) || SEVERITIES[2];
                  const subject = subjectLine(signal.subject);
                  return (
                    <View
                      key={`${signal.type}-${index}`}
                      className="px-4 py-3 border-t border-slate-100"
                    >
                      <View className="flex-row items-center flex-wrap gap-2 mb-1">
                        <View
                          className="px-2 py-0.5 rounded border"
                          style={{
                            borderColor: `${severity.color}33`,
                            backgroundColor: `${severity.color}14`,
                          }}
                        >
                          <Text className="text-[11px] font-medium" style={{ color: severity.color }}>
                            {severity.label}
                          </Text>
                        </View>
                        <Text className="text-sm font-medium text-slate-900 flex-shrink">
                          {signal.title}
                        </Text>
                        {signal.count != null ? (
                          <Text className="text-xs text-slate-500">×{formatCount(signal.count)}</Text>
                        ) : null}
                      </View>
                      {signal.detail ? (
                        <Text className="text-sm text-slate-500">{signal.detail}</Text>
                      ) : null}
                      {subject ? (
                        <Text className="text-xs text-slate-500 mt-1">{subject}</Text>
                      ) : null}
                      {signal.lastSeen ? (
                        <Text className="text-xs text-slate-400 mt-1">
                          Last seen {formatAgo(signal.lastSeen)}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                </ShowMore>
              )}
            </ListAccordion>

            <Text className="text-xs text-slate-500">
              Signals show suspicious activity; they don't block it. Blocking is handled by sign-in
              limits, lockouts and 2FA.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
