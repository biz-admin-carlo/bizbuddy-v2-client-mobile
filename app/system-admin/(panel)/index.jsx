import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  AdminHeader,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  MethodBadge,
  SectionCard,
  StatCard,
  TimeRangeChips,
  VerticalBars,
} from "../../../components/system-admin/ui";
import { systemAdminGet } from "../../../utils/systemAdminApi";
import {
  downsampleTrends,
  formatCount,
  formatTrendLabel,
  systemStatus,
  unwrapEndpoints,
} from "../../../utils/systemAdminFormat";

export default function SystemAdminOverview() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState("24h");
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError("");
      const [overviewResult, trendsResult, performanceResult] = await Promise.all([
        systemAdminGet(`/api/system-admin/overview?timeRange=${timeRange}`),
        systemAdminGet(`/api/system-admin/trends?timeRange=${timeRange}`),
        systemAdminGet(`/api/system-admin/performance?timeRange=${timeRange}&limit=5`),
      ]);
      if (overviewResult.unauthorized || trendsResult.unauthorized || performanceResult.unauthorized) {
        return;
      }
      if (!overviewResult.ok || !trendsResult.ok || !performanceResult.ok) {
        setError(
          overviewResult.message ||
            trendsResult.message ||
            performanceResult.message ||
            "Could not load the dashboard.",
        );
      } else {
        setOverview(overviewResult.data);
        setTrends(Array.isArray(trendsResult.data) ? trendsResult.data : []);
        setEndpoints(unwrapEndpoints(performanceResult.data).slice(0, 6));
        setUpdatedAt(new Date());
      }
      setLoading(false);
    },
    [timeRange],
  );

  useEffect(() => {
    load(false);
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const status = systemStatus(overview?.errorRate);
  const bars = downsampleTrends(trends);
  const showEmptyCharts = !loading && bars.length === 0;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <AdminHeader
          title="System Dashboard"
          onRefresh={() => load(false)}
          loading={loading}
          subtitle={
            updatedAt
              ? `${status.label} · Updated ${updatedAt.toLocaleTimeString()}`
              : status.label
          }
          extra={<TimeRangeChips value={timeRange} onChange={setTimeRange} disabled={loading} />}
        />

        <View className="flex-row items-center gap-2 mb-4">
          <Ionicons name="ellipse" size={10} color={status.color} />
          <Text style={{ color: status.color }} className="text-xs font-medium">
            {status.label}
          </Text>
        </View>

        <ErrorNote message={error} />

        {loading && !overview ? (
          <LoadingBlock />
        ) : (
          <>
            <View className="flex-row flex-wrap gap-3 mb-4">
              <StatCard
                label="Requests"
                icon="pulse-outline"
                value={formatCount(overview?.totalRequests)}
                detail={`${formatCount(overview?.successfulRequests)} successful`}
              />
              <StatCard
                label="Error rate"
                icon="warning-outline"
                value={`${overview?.errorRate ?? "0.00"}%`}
                detail={`${formatCount(overview?.failedRequests)} errors`}
              />
              <StatCard
                label="Response time"
                icon="time-outline"
                value={`${formatCount(overview?.avgResponseTime)} ms`}
                detail={`${formatCount(overview?.slowRequests)} slow requests`}
              />
              <StatCard
                label="Active users"
                icon="people-outline"
                value={formatCount(overview?.uniqueUsers)}
                detail={`${formatCount(overview?.uniqueCompanies)} companies`}
              />
            </View>

            <SectionCard title="Request volume" subtitle={`Last ${timeRange}`} icon="flash-outline">
              <View className="px-3 pt-3 pb-2">
                {showEmptyCharts ? (
                  <Text className="text-sm text-slate-500 text-center py-4">
                    No request volume for this range.
                  </Text>
                ) : (
                  <>
                    <VerticalBars points={bars} valueKey="request_count" color="#0969da" height={72} />
                    <Text className="text-[10px] text-slate-400 mt-1.5">
                      {formatTrendLabel(bars[0]?.hour, timeRange)} –{" "}
                      {formatTrendLabel(bars[bars.length - 1]?.hour, timeRange)}
                    </Text>
                  </>
                )}
              </View>
            </SectionCard>

            <SectionCard title="Response times" subtitle="Average milliseconds" icon="server-outline">
              <View className="px-3 pt-3 pb-3">
                {showEmptyCharts ? (
                  <Text className="text-sm text-slate-500 text-center py-4">
                    No response times for this range.
                  </Text>
                ) : (
                  <VerticalBars points={bars} valueKey="avg_response_time" color="#1f883d" height={72} />
                )}
              </View>
            </SectionCard>

            <SectionCard title="Top endpoints">
              {endpoints.length === 0 ? (
                <Text className="text-sm text-slate-500 text-center p-6">
                  No endpoint data available
                </Text>
              ) : (
                endpoints.map((endpoint, index) => (
                  <View
                    key={`${endpoint.method}-${endpoint.endpoint}-${index}`}
                    className="p-4 border-t border-slate-100"
                  >
                    <View className="flex-row items-center gap-2 mb-1">
                      <MethodBadge method={endpoint.method} />
                      <Text className="flex-1 text-sm text-slate-900" numberOfLines={1}>
                        {endpoint.endpoint}
                      </Text>
                    </View>
                    <Text className="text-xs text-slate-500">
                      {formatCount(endpoint.requestCount)} requests · {endpoint.avgResponseTime}ms avg
                      · {endpoint.errorRate}% errors
                    </Text>
                  </View>
                ))
              )}
              <TouchableOpacity
                onPress={() => router.push("/system-admin/performance")}
                className="p-3 border-t border-slate-200"
              >
                <Text className="text-xs font-medium text-slate-700 text-center">
                  View all endpoints
                </Text>
              </TouchableOpacity>
            </SectionCard>

            <SectionCard title="System activity">
              <ActivityRow
                icon="warning-outline"
                tint="#fee2e2"
                color="#dc2626"
                title="Error log"
                detail={`${formatCount(overview?.failedRequests)} errors in the last ${timeRange}`}
                onPress={() => router.push("/system-admin/errors")}
              />
              <ActivityRow
                icon="trending-up-outline"
                tint="#dcfce7"
                color="#16a34a"
                title="Performance metrics"
                detail={`Average response time: ${formatCount(overview?.avgResponseTime)}ms`}
                onPress={() => router.push("/system-admin/performance")}
              />
              <ActivityRow
                icon="shield-outline"
                tint="#ffedd5"
                color="#ea580c"
                title="Security monitoring"
                detail="Monitor unauthorized access attempts"
                onPress={() => router.push("/system-admin/security")}
              />
              <View className="p-4 border-t border-slate-100 flex-row items-center">
                <View className="w-8 h-8 rounded-md bg-blue-100 items-center justify-center mr-3">
                  <Ionicons name="pulse-outline" size={16} color="#2563eb" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-slate-900">System status</Text>
                  <Text className="text-xs text-slate-500">
                    {formatCount(overview?.uniqueUsers)} active users ·{" "}
                    {formatCount(overview?.uniqueCompanies)} companies
                  </Text>
                </View>
              </View>
            </SectionCard>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityRow({ icon, tint, color, title, detail, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="p-4 border-t border-slate-100 flex-row items-center"
    >
      <View
        className="w-8 h-8 rounded-md items-center justify-center mr-3"
        style={{ backgroundColor: tint }}
      >
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-slate-900">{title}</Text>
        <Text className="text-xs text-slate-500">{detail}</Text>
      </View>
      <Ionicons name="arrow-up-outline" size={14} color="#94a3b8" />
    </TouchableOpacity>
  );
}
