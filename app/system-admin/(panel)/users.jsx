import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  AdminHeader,
  ErrorNote,
  ListAccordion,
  LoadingBlock,
  ShowMore,
  VerticalBars,
} from "../../../components/system-admin/ui";
import { systemAdminGet } from "../../../utils/systemAdminApi";
import { formatCount } from "../../../utils/systemAdminFormat";

const PERIODS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

const FEATURE_LABELS = {
  clock_in_out: "Clock in/out",
  time_logs: "Time logs",
  leave: "Leave",
  overtime: "Overtime",
  punch_requests: "Punch requests",
  cutoff_approvals: "Cutoff approvals",
  payroll: "Payroll",
  schedules: "Schedules",
  employees: "Employees",
  reports: "Reports",
  notifications: "Notifications",
  other: "Other",
};

const CLIENT_COLORS = { web: "#f97316", app: "#16a34a", other: "#64748b" };
const CLIENT_LABELS = { web: "Web", app: "App", other: "Other" };

function activityQuery(days, companyId) {
  const params = new URLSearchParams({ days: String(days) });
  if (companyId && companyId !== "all") params.set("companyId", companyId);
  return params.toString();
}

function parseDay(day) {
  if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date);
  }
  return new Date(day);
}

function formatDay(day) {
  const date = parseDay(day);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatAgo(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  const abs = Math.abs(minutes);
  if (abs < 1) return "just now";
  if (abs < 60) return `${abs} minute${abs === 1 ? "" : "s"} ago`;
  const hours = Math.round(abs / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatCreated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function heatColor(ratio) {
  if (!ratio) return "#f1f5f9";
  return `rgba(249, 115, 22, ${0.15 + 0.85 * ratio})`;
}

export default function SystemAdminUsers() {
  const [days, setDays] = useState("30");
  const [companyId, setCompanyId] = useState("all");
  const [companies, setCompanies] = useState([]);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [peakOpen, setPeakOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [features, setFeatures] = useState([]);
  const [peakRows, setPeakRows] = useState([]);
  const [inactiveDays, setInactiveDays] = useState("30");
  const [appliedInactiveDays, setAppliedInactiveDays] = useState(30);
  const [inactiveRows, setInactiveRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCompanies = useCallback(async () => {
    const result = await systemAdminGet("/api/system-admin/bbuddy/accounts");
    if (!result.ok) return;
    const list = Array.isArray(result.data) ? result.data : [];
    setCompanies(list);
  }, []);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = activityQuery(days, companyId);
    const [overviewResult, featureResult, peakResult] = await Promise.all([
      systemAdminGet(`/api/system-admin/activity/overview?${query}`),
      systemAdminGet(`/api/system-admin/activity/features?${query}`),
      systemAdminGet(`/api/system-admin/activity/peak-hours?${query}`),
    ]);
    if (overviewResult.unauthorized || featureResult.unauthorized || peakResult.unauthorized) {
      return;
    }
    if (!overviewResult.ok) {
      setError(overviewResult.message || "Could not load user activity.");
    } else {
      setOverview(overviewResult.data || {});
    }
    setFeatures(Array.isArray(featureResult.data?.rows) ? featureResult.data.rows : []);
    setPeakRows(Array.isArray(peakResult.data?.rows) ? peakResult.data.rows : []);
    setLoading(false);
  }, [companyId, days]);

  const loadInactive = useCallback(async () => {
    const query = activityQuery(appliedInactiveDays, companyId);
    const result = await systemAdminGet(`/api/system-admin/activity/inactive?${query}`);
    if (result.unauthorized) return;
    if (result.ok) setInactiveRows(Array.isArray(result.data?.rows) ? result.data.rows : []);
  }, [appliedInactiveDays, companyId]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    loadInactive();
  }, [loadInactive]);

  const companyName =
    companyId === "all"
      ? "All companies"
      : companies.find((company) => company.companyId === companyId)?.companyName || "Company";

  const active = overview?.activeUsers || {};
  const daily = Array.isArray(overview?.dailyActiveUsers) ? overview.dailyActiveUsers : [];
  const signIns = Array.isArray(overview?.signIns) ? overview.signIns : [];
  const clients = (Array.isArray(overview?.clients) ? overview.clients : []).filter(
    (client) => Number(client.users) > 0,
  );
  const clientTotal = clients.reduce((sum, client) => sum + Number(client.users || 0), 0);

  const featureRows = useMemo(
    () =>
      [...features].sort((left, right) => Number(right.actions || 0) - Number(left.actions || 0)),
    [features],
  );

  const peakCompanies = useMemo(() => {
    const grouped = new Map();
    peakRows.forEach((row) => {
      const current = grouped.get(row.companyId) || {
        companyId: row.companyId,
        companyName: row.companyName,
        hours: {},
        max: 0,
      };
      current.hours[row.hour] = Number(row.requests || 0);
      current.max = Math.max(current.max, Number(row.requests || 0));
      grouped.set(row.companyId, current);
    });
    return [...grouped.values()].sort((left, right) => right.max - left.max);
  }, [peakRows]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <AdminHeader
          title="User Activity"
          subtitle="Who uses BizBuddy, how, and when."
          onRefresh={() => {
            loadActivity();
            loadInactive();
          }}
          loading={loading}
        />

        <View className="flex-row items-center mb-4">
          {PERIODS.map((period) => {
            const selected = days === period.value;
            return (
              <TouchableOpacity
                key={period.value}
                onPress={() => setDays(period.value)}
                disabled={loading}
                className="mr-2 px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: selected ? "#f97316" : "#ffffff",
                  borderColor: selected ? "#f97316" : "#cbd5e1",
                }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: selected ? "#ffffff" : "#475569" }}
                >
                  {period.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => setCompanyOpen(true)}
            className="flex-1 flex-row items-center border border-slate-300 bg-white rounded-full px-3 py-1.5"
          >
            <Text className="flex-1 text-xs text-slate-700" numberOfLines={1}>
              {companyName}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#64748b" />
          </TouchableOpacity>
        </View>

        <ErrorNote message={error} />

        {loading && !overview ? (
          <LoadingBlock />
        ) : (
          <>
            <View className="flex-row gap-2 mb-3">
              <Stat label="Active today" value={active.last24h} hint="Last 24 hours" />
              <Stat label="Active this week" value={active.last7Days} hint="Last 7 days" />
              <Stat label="Active this month" value={active.last30Days} hint="Last 30 days" />
            </View>

            <View className="border border-slate-300 rounded-md bg-white p-3 mb-4">
              <Text className="text-sm text-slate-500 mb-2">Web vs app</Text>
              {clientTotal === 0 ? (
                <Text className="text-2xl font-bold text-slate-900">—</Text>
              ) : (
                <>
                  <View className="flex-row h-2 rounded-full overflow-hidden bg-slate-100">
                    {clients.map((client) => (
                      <View
                        key={client.client}
                        style={{
                          width: `${(Number(client.users) / clientTotal) * 100}%`,
                          backgroundColor: CLIENT_COLORS[client.client] || CLIENT_COLORS.other,
                        }}
                      />
                    ))}
                  </View>
                  <View className="flex-row flex-wrap mt-2">
                    {clients.map((client) => (
                      <Text key={client.client} className="text-xs text-slate-500 mr-3">
                        {CLIENT_LABELS[client.client] || client.client}{" "}
                        {Math.round((Number(client.users) / clientTotal) * 100)}%
                      </Text>
                    ))}
                  </View>
                </>
              )}
              <Text className="text-[11px] text-slate-400 mt-1">Share of active users</Text>
            </View>

            <ChartCard title="Active users per day">
              {daily.length === 0 ? (
                <EmptyChart />
              ) : (
                <>
                  <VerticalBars points={daily} valueKey="activeUsers" color="#f97316" height={72} />
                  <RangeLabel start={daily[0]?.day} end={daily[daily.length - 1]?.day} />
                </>
              )}
            </ChartCard>

            <ChartCard title="Sign-ins per day">
              {signIns.length === 0 ? (
                <EmptyChart />
              ) : (
                <>
                  <SignInBars points={signIns} />
                  <View className="flex-row mt-2">
                    <Legend color="#16a34a" label="Succeeded" />
                    <Legend color="#dc2626" label="Failed" />
                  </View>
                  <RangeLabel start={signIns[0]?.day} end={signIns[signIns.length - 1]?.day} />
                </>
              )}
            </ChartCard>

            <ListAccordion
              title="Feature usage"
              subtitle={`Actions are changes; views are reads. ${featureRows.length} rows.`}
            >
              {featureRows.length === 0 ? (
                <Text className="text-sm text-slate-500 text-center py-6">No activity in this period.</Text>
              ) : (
                <ShowMore>
                  {featureRows.map((row) => (
                  <View
                    key={`${row.companyId}-${row.feature}`}
                    className="px-3 py-3 border-t border-slate-100"
                  >
                    <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>
                      {row.companyName || "—"}
                    </Text>
                    <Text className="text-xs text-slate-500 mt-0.5">
                      {FEATURE_LABELS[row.feature] || row.feature}
                    </Text>
                    <Text className="text-xs text-slate-600 mt-1">
                      {formatCount(row.actions)} actions · {formatCount(row.views)} views ·{" "}
                      {formatCount(row.users)} users
                    </Text>
                  </View>
                  ))}
                </ShowMore>
              )}
            </ListAccordion>

            <ListAccordion
              title="Peak hours"
              subtitle={`${peakCompanies.length} companies. Darker means busier in that company's time zone.`}
            >
              {peakCompanies.length === 0 ? (
                <Text className="text-sm text-slate-500 text-center py-4">No activity in this period.</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="p-3 border-t border-slate-200"
                >
                  <View>
                    <View className="flex-row mb-1">
                      <View style={{ width: 108 }} />
                      {Array.from({ length: 24 }, (_, hour) => (
                        <Text
                          key={hour}
                          style={{ width: 14 }}
                          className="text-[8px] text-slate-400 text-center"
                        >
                          {hour % 6 === 0 ? hourLabel(hour) : ""}
                        </Text>
                      ))}
                    </View>
                    {(peakOpen ? peakCompanies : peakCompanies.slice(0, 5)).map((company) => (
                      <View key={company.companyId} className="flex-row items-center mb-1">
                        <Text style={{ width: 108 }} className="text-[11px] text-slate-700 pr-2" numberOfLines={1}>
                          {company.companyName}
                        </Text>
                        {Array.from({ length: 24 }, (_, hour) => (
                          <View
                            key={hour}
                            style={{
                              width: 12,
                              height: 14,
                              marginRight: 2,
                              borderRadius: 2,
                              backgroundColor: heatColor(
                                company.max ? (company.hours[hour] || 0) / company.max : 0,
                              ),
                            }}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
              {peakCompanies.length > 5 ? (
                <TouchableOpacity
                  onPress={() => setPeakOpen((value) => !value)}
                  className="py-3 flex-row items-center justify-center border-t border-slate-100"
                >
                  <Text className="text-sm font-medium text-slate-700 mr-1">
                    {peakOpen ? "Show less" : "Show all"}
                  </Text>
                  <Ionicons
                    name={peakOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#64748b"
                  />
                </TouchableOpacity>
              ) : null}
            </ListAccordion>

            <ListAccordion
              title="Inactive accounts"
              subtitle={`No sign-in or activity for ${appliedInactiveDays}+ days. ${inactiveRows.length} found.`}
              extra={
                <View className="flex-row items-center px-3 pb-3">
                  <TextInput
                    value={inactiveDays}
                    onChangeText={setInactiveDays}
                    keyboardType="number-pad"
                    className="w-20 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 mr-2"
                  />
                  <TouchableOpacity
                    onPress={() => {
                      const next = Math.min(Math.max(parseInt(inactiveDays, 10) || 30, 1), 365);
                      setInactiveDays(String(next));
                      setAppliedInactiveDays(next);
                    }}
                    className="border border-slate-300 rounded-lg px-3 py-2"
                  >
                    <Text className="text-sm text-slate-800">Apply</Text>
                  </TouchableOpacity>
                </View>
              }
            >
              {inactiveRows.length === 0 ? (
                <Text className="text-sm text-slate-500 text-center py-6">No inactive accounts.</Text>
              ) : (
                <ShowMore>
                  {inactiveRows.map((row) => (
                  <View key={row.userId || row.email} className="px-3 py-3 border-t border-slate-100">
                    <Text className="text-sm font-medium text-slate-900">{row.name || "—"}</Text>
                    <Text className="text-xs text-slate-500">{row.email}</Text>
                    <Text className="text-xs text-slate-600 mt-1">
                      {row.companyName || "—"} · {row.role || "—"}
                    </Text>
                    <Text className="text-xs text-slate-400 mt-1">
                      Last seen {formatAgo(row.lastSeenAt)} · Created {formatCreated(row.createdAt)}
                    </Text>
                  </View>
                  ))}
                </ShowMore>
              )}
            </ListAccordion>

            <Text className="text-xs text-slate-500">
              B. Buddy and system-admin activity aren't counted. Web vs app is estimated from the
              device.
            </Text>
          </>
        )}
      </ScrollView>

      <Modal visible={companyOpen} transparent animationType="slide" onRequestClose={() => setCompanyOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setCompanyOpen(false)}>
          <View className="flex-1 bg-black/40 justify-end">
          <View
            className="bg-white rounded-t-3xl px-5 pt-5 pb-8 max-h-[70%]"
            onStartShouldSetResponder={() => true}
          >
            <Text className="text-lg font-semibold text-slate-900 mb-3">Company</Text>
            <ScrollView>
              <CompanyChoice
                label="All companies"
                selected={companyId === "all"}
                onPress={() => {
                  setCompanyId("all");
                  setCompanyOpen(false);
                }}
              />
              {companies.map((company) => (
                <CompanyChoice
                  key={company.companyId}
                  label={company.companyName}
                  selected={companyId === company.companyId}
                  onPress={() => {
                    setCompanyId(company.companyId);
                    setCompanyOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, hint }) {
  return (
    <View className="flex-1 border border-slate-300 rounded-md bg-white p-2">
      <Text className="text-[10px] text-slate-500" numberOfLines={2}>
        {label}
      </Text>
      <Text className="text-xl font-bold text-slate-900 mt-1">{formatCount(value)}</Text>
      <Text className="text-[10px] text-slate-400 mt-1">{hint}</Text>
    </View>
  );
}

function ChartCard({ title, children }) {
  return (
    <View className="border border-slate-300 rounded-md bg-white p-3 mb-4">
      <Text className="text-sm font-semibold text-slate-900 mb-3">{title}</Text>
      {children}
    </View>
  );
}

function EmptyChart() {
  return <Text className="text-sm text-slate-500 text-center py-4">No activity in this period.</Text>;
}

function RangeLabel({ start, end }) {
  if (!start) return null;
  return (
    <Text className="text-[10px] text-slate-400 mt-1.5">
      {formatDay(start)} – {formatDay(end)}
    </Text>
  );
}

function Legend({ color, label }) {
  return (
    <View className="flex-row items-center mr-3">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 4 }} />
      <Text className="text-[11px] text-slate-500">{label}</Text>
    </View>
  );
}

function SignInBars({ points }) {
  const height = 72;
  const max = Math.max(
    ...points.map((point) => Number(point.succeeded || 0) + Number(point.failed || 0)),
    1,
  );
  return (
    <View
      style={{
        height,
        flexDirection: "row",
        alignItems: "flex-end",
        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
      }}
    >
      {points.map((point, index) => {
        const succeeded = Number(point.succeeded || 0);
        const failed = Number(point.failed || 0);
        const total = succeeded + failed;
        const barHeight = total === 0 ? 0 : Math.max(3, (total / max) * (height - 4));
        const failedHeight = total ? (failed / total) * barHeight : 0;
        const succeededHeight = barHeight - failedHeight;
        return (
          <View
            key={point.day || index}
            style={{ flex: 1, height, justifyContent: "flex-end", alignItems: "center" }}
          >
            <View style={{ width: 6, height: barHeight, justifyContent: "flex-end" }}>
              <View
                style={{
                  height: failedHeight,
                  backgroundColor: "#dc2626",
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                }}
              />
              <View style={{ height: succeededHeight, backgroundColor: "#16a34a" }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function hourLabel(hour) {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

function CompanyChoice({ label, selected, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} className="py-3 border-t border-slate-100 flex-row items-center">
      <Text className={`flex-1 text-base ${selected ? "text-orange-600 font-semibold" : "text-slate-800"}`}>
        {label}
      </Text>
      {selected ? <Ionicons name="checkmark" size={18} color="#f97316" /> : null}
    </TouchableOpacity>
  );
}
