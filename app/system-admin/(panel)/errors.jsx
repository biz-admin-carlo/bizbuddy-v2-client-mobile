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
  TimeRangeChips,
} from "../../../components/system-admin/ui";
import { systemAdminGet } from "../../../utils/systemAdminApi";
import { formatCount } from "../../../utils/systemAdminFormat";

function statusColor(code) {
  const value = Number(code);
  if (value >= 500) return "text-red-600";
  if (value >= 400) return "text-yellow-600";
  return "text-slate-600";
}

function statusLabel(code) {
  const value = Number(code);
  if (value >= 500) return "Server error";
  if (value >= 400) return "Client error";
  return "Unknown";
}

export default function SystemAdminErrors() {
  const [timeRange, setTimeRange] = useState("24h");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await systemAdminGet(`/api/system-admin/errors?timeRange=${timeRange}`);
    if (result.unauthorized) return;
    if (!result.ok) {
      setError(result.message || "Could not load errors.");
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, [timeRange]);

  useEffect(() => {
    load();
  }, [load]);

  const byEndpoint = data?.errorsByEndpoint || [];
  const byStatus = data?.errorsByStatusCode || [];
  const byType = data?.errorsByType || [];
  const isEmpty = byEndpoint.length === 0 && byStatus.length === 0 && byType.length === 0;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <AdminHeader
          title="Error Tracking"
          subtitle="Monitor and analyze system errors and failures"
          onRefresh={load}
          loading={loading}
          extra={<TimeRangeChips value={timeRange} onChange={setTimeRange} disabled={loading} />}
        />
        <ErrorNote message={error} />

        {loading && !data ? (
          <LoadingBlock />
        ) : (
          <>
            {byEndpoint.length > 0 ? (
              <SectionCard
                title="Errors by endpoint"
                subtitle="Endpoints with the most errors"
                icon="warning-outline"
              >
                <ShowMore>
                {byEndpoint.map((item, index) => {
                  const code = item.status_code ?? item.statusCode;
                  const count = item.error_count ?? item.errorCount;
                  return (
                    <View key={`${item.method}-${item.endpoint}-${code}-${index}`} className="p-4 border-t border-slate-100">
                      <View className="flex-row items-center gap-2">
                        <MethodBadge method={item.method} tone="red" />
                        <Text className="flex-1 text-sm text-slate-900" numberOfLines={1}>
                          {item.endpoint}
                        </Text>
                        <Text className="text-base font-semibold text-red-600">{formatCount(count)}</Text>
                      </View>
                      <Text className="text-xs text-slate-500 mt-1">
                        Status code{" "}
                        <Text className={`font-medium ${statusColor(code)}`}>{code}</Text>
                      </Text>
                    </View>
                  );
                })}
                </ShowMore>
              </SectionCard>
            ) : null}

            {byStatus.length > 0 ? (
              <SectionCard
                title="Errors by status code"
                subtitle="Distribution of HTTP error codes"
                icon="close-circle-outline"
              >
                <ShowMore>
                {byStatus.map((item) => (
                  <View
                    key={item.statusCode}
                    className="p-4 border-t border-slate-100 flex-row items-center justify-between"
                  >
                    <View>
                      <Text className={`text-xl font-semibold ${statusColor(item.statusCode)}`}>
                        {item.statusCode}
                      </Text>
                      <Text className="text-xs text-slate-500">{statusLabel(item.statusCode)}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-2xl font-semibold text-slate-900">
                        {formatCount(item.count)}
                      </Text>
                      <Text className="text-xs text-slate-500">errors</Text>
                    </View>
                  </View>
                ))}
                </ShowMore>
              </SectionCard>
            ) : null}

            {byType.length > 0 ? (
              <SectionCard
                title="Errors by type"
                subtitle="Error classification and categories"
                icon="server-outline"
              >
                <View className="p-4 flex-row flex-wrap gap-3">
                  {byType.map((item) => (
                    <View
                      key={item.errorType || "unknown"}
                      className="border border-slate-200 rounded-md p-3 min-w-[46%] flex-1"
                    >
                      <Text className="text-sm font-medium text-slate-900" numberOfLines={2}>
                        {item.errorType || "Unknown"}
                      </Text>
                      <Text className="text-2xl font-semibold text-red-600 mt-1">
                        {formatCount(item.count)}
                      </Text>
                      <Text className="text-xs text-slate-500">occurrences</Text>
                    </View>
                  ))}
                </View>
              </SectionCard>
            ) : null}

            {isEmpty && !loading ? (
              <EmptyState
                icon="warning-outline"
                title="No errors found"
                body="No errors detected in the selected time range. System is running smoothly."
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
