import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AdminHeader,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  MethodBadge,
  SectionCard,
  ShowMore,
  StatCard,
  TimeRangeChips,
} from "../../../components/system-admin/ui";
import { systemAdminGet } from "../../../utils/systemAdminApi";
import { formatCount, unwrapEndpoints, unwrapSlowest } from "../../../utils/systemAdminFormat";

function responseTone(ms) {
  const time = Number(ms) || 0;
  if (time < 100) return "text-green-600";
  if (time < 500) return "text-yellow-600";
  return "text-red-600";
}

export default function SystemAdminPerformance() {
  const [timeRange, setTimeRange] = useState("24h");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await systemAdminGet(
      `/api/system-admin/performance?timeRange=${timeRange}&limit=50`,
    );
    if (result.unauthorized) return;
    if (!result.ok) {
      setError(result.message || "Could not load performance.");
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    load();
  }, [load]);

  const endpoints = unwrapEndpoints(data);
  const slowest = unwrapSlowest(data);
  const fast = endpoints.filter((row) => row.avgResponseTime < 100).length;
  const moderate = endpoints.filter(
    (row) => row.avgResponseTime >= 100 && row.avgResponseTime < 500,
  ).length;
  const slow = endpoints.filter((row) => row.avgResponseTime >= 500).length;
  const percentileRows = endpoints.slice(0, 10);
  const percentileMax = Math.max(
    ...percentileRows.map((row) => Number(row.p99ResponseTime) || 0),
    1,
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <AdminHeader
          title="Performance Metrics"
          subtitle="Endpoint response times, percentiles, and optimization insights"
          onRefresh={load}
          loading={loading}
          extra={<TimeRangeChips value={timeRange} onChange={setTimeRange} disabled={loading} />}
        />
        <ErrorNote message={error} />

        {loading && !data ? (
          <LoadingBlock />
        ) : (
          <>
            <View className="gap-3 mb-4">
              <StatCard
                label="Fast endpoints"
                icon="flash-outline"
                iconColor="#16a34a"
                value={formatCount(fast)}
                detail="Response time under 100ms"
              />
              <StatCard
                label="Moderate"
                icon="pulse-outline"
                iconColor="#ca8a04"
                value={formatCount(moderate)}
                detail="Response time 100–500ms"
              />
              <StatCard
                label="Needs optimization"
                icon="alert-circle-outline"
                iconColor="#dc2626"
                value={formatCount(slow)}
                detail="Response time over 500ms"
              />
            </View>

            {percentileRows.length > 0 ? (
              <SectionCard
                title="Response time percentiles"
                subtitle="Top 10 endpoints by request volume"
              >
                <View className="px-4 pt-3 flex-row gap-4">
                  <Legend swatch="#16a34a" label="P50" />
                  <Legend swatch="#d97706" label="P95" />
                  <Legend swatch="#dc2626" label="P99" />
                </View>
                <ShowMore>
                {percentileRows.map((row, index) => (
                  <View key={`${row.method}-${row.endpoint}-${index}`} className="px-4 py-3 border-t border-slate-100">
                    <Text className="text-xs text-slate-800 mb-2" numberOfLines={1}>
                      {row.method} {row.endpoint}
                    </Text>
                    <PercentBar label="P50" value={row.p50ResponseTime} max={percentileMax} color="#16a34a" />
                    <PercentBar label="P95" value={row.p95ResponseTime} max={percentileMax} color="#d97706" />
                    <PercentBar label="P99" value={row.p99ResponseTime} max={percentileMax} color="#dc2626" />
                  </View>
                ))}
                </ShowMore>
              </SectionCard>
            ) : null}

            {slowest.length > 0 ? (
              <SectionCard
                title="Slowest endpoints"
                subtitle="Endpoints requiring immediate optimization"
                icon="time-outline"
              >
                <ShowMore>
                {slowest.map((row, index) => (
                  <View
                    key={`${row.method}-${row.endpoint}-${index}`}
                    className="p-4 border-t border-slate-100 flex-row items-center"
                  >
                    <View className="flex-1 pr-3">
                      <View className="flex-row items-center gap-2 mb-1">
                        <MethodBadge method={row.method} tone="red" />
                        <Text className="flex-1 text-sm text-slate-900" numberOfLines={1}>
                          {row.endpoint}
                        </Text>
                      </View>
                      <Text className="text-xs text-slate-500">
                        {formatCount(row.request_count)} requests
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-base font-semibold text-red-600">
                        {formatCount(row.avg_response_time)}ms
                      </Text>
                      <Text className="text-xs text-slate-400">
                        max {formatCount(row.max_response_time)}ms
                      </Text>
                    </View>
                  </View>
                ))}
                </ShowMore>
              </SectionCard>
            ) : null}

            {endpoints.length > 0 ? (
              <SectionCard title="All endpoints" subtitle="Complete performance breakdown">
                <ShowMore>
                {endpoints.map((row, index) => (
                  <View
                    key={`${row.method}-${row.endpoint}-${index}`}
                    className="p-4 border-t border-slate-100"
                  >
                    <View className="flex-row items-center gap-2 mb-2">
                      <MethodBadge method={row.method} />
                      <Text className="flex-1 text-sm text-slate-900" numberOfLines={2}>
                        {row.endpoint}
                      </Text>
                    </View>
                    <Text className="text-xs text-slate-500">
                      {formatCount(row.requestCount)} requests
                    </Text>
                    <View className="flex-row flex-wrap mt-2 gap-x-3 gap-y-1">
                      <Metric label="Avg" value={`${row.avgResponseTime}ms`} className={responseTone(row.avgResponseTime)} />
                      <Metric label="P50" value={`${row.p50ResponseTime}ms`} />
                      <Metric label="P95" value={`${row.p95ResponseTime}ms`} />
                      <Metric label="P99" value={`${row.p99ResponseTime}ms`} />
                      <Metric label="Max" value={`${row.maxResponseTime}ms`} />
                      <Metric
                        label="Errors"
                        value={`${formatCount(row.errorCount)} (${row.errorRate}%)`}
                        className={Number(row.errorCount) > 0 ? "text-red-600" : "text-green-600"}
                      />
                    </View>
                  </View>
                ))}
                </ShowMore>
              </SectionCard>
            ) : (
              !loading && (
                <EmptyState
                  icon="pulse-outline"
                  title="No performance data"
                  body="No endpoint performance data available for the selected time range."
                />
              )
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({ swatch, label }) {
  return (
    <View className="flex-row items-center gap-1.5 mb-2">
      <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: swatch }} />
      <Text className="text-[11px] text-slate-500">{label}</Text>
    </View>
  );
}

function PercentBar({ label, value, max, color }) {
  const width = Math.max(4, ((Number(value) || 0) / max) * 100);
  return (
    <View className="flex-row items-center mb-1">
      <Text className="w-8 text-[10px] text-slate-400">{label}</Text>
      <View className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <View style={{ width: `${width}%`, height: "100%", backgroundColor: color }} />
      </View>
      <Text className="w-12 text-right text-[10px] text-slate-500">{value}ms</Text>
    </View>
  );
}

function Metric({ label, value, className = "text-slate-700" }) {
  return (
    <Text className="text-xs text-slate-500">
      {label} <Text className={`font-semibold ${className}`}>{value}</Text>
    </Text>
  );
}
