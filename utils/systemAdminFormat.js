export const SYSTEM_ADMIN_TIME_RANGES = ["1h", "6h", "24h", "7d", "30d"];

export function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Math.round(number).toLocaleString();
}

export function systemStatus(errorRate) {
  const rate = parseFloat(errorRate);
  if (!Number.isFinite(rate) || rate < 1) {
    return { label: "All systems operational", color: "#16a34a" };
  }
  if (rate < 5) {
    return { label: "Degraded performance", color: "#ca8a04" };
  }
  return { label: "System issues detected", color: "#dc2626" };
}

export function unwrapEndpoints(data) {
  if (!data) return [];
  if (Array.isArray(data.endpoints)) return data.endpoints;
  if (Array.isArray(data.endpoints?.endpoints)) return data.endpoints.endpoints;
  return [];
}

export function unwrapSlowest(data) {
  if (!data) return [];
  if (Array.isArray(data.slowestEndpoints)) return data.slowestEndpoints;
  if (Array.isArray(data.endpoints?.slowestEndpoints)) {
    return data.endpoints.slowestEndpoints;
  }
  return [];
}

export function downsampleTrends(items, max = 24) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= max) return list;
  const bucket = list.length / max;
  const out = [];
  for (let i = 0; i < max; i += 1) {
    const start = Math.floor(i * bucket);
    const end = Math.max(Math.floor((i + 1) * bucket), start + 1);
    const slice = list.slice(start, end);
    if (slice.length === 0) continue;
    const requests = slice.reduce((sum, row) => sum + Number(row.request_count || 0), 0);
    const errors = slice.reduce((sum, row) => sum + Number(row.error_count || 0), 0);
    const avg =
      slice.reduce((sum, row) => sum + Number(row.avg_response_time || 0), 0) /
      slice.length;
    out.push({
      hour: slice[0].hour,
      request_count: requests,
      error_count: errors,
      avg_response_time: Math.round(avg),
    });
  }
  return out;
}

export function formatTrendLabel(hour, timeRange) {
  const date = new Date(hour);
  if (Number.isNaN(date.getTime())) return "";
  if (timeRange === "7d" || timeRange === "30d") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString(undefined, { hour: "numeric" });
}
