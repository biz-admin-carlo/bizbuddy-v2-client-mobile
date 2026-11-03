export const REQUEST_LIST_PAGE_SIZE = 50;
export const REQUEST_LIST_MAX_PAGES = 20;

/** YYYY-MM-DD from a stored date, treating UTC midnight as a calendar date. */
export const calendarDateKey = (value) => {
  if (value == null || value === "") return "";
  const s = (
    value instanceof Date ? value.toISOString() : String(value).trim()
  ).trim();
  const utcMidnight = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.\d+)?Z$/i.exec(s);
  if (utcMidnight) return utcMidnight[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const prefixed = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
  if (prefixed) return prefixed[1];
  const parsed = new Date(s);
  if (!Number.isFinite(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const pickerDateKey = (date) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const dateKeyInInclusiveRange = (targetKey, startValue, endValue) => {
  if (!targetKey) return true;
  const startKey = calendarDateKey(startValue);
  const endKey = calendarDateKey(endValue) || startKey;
  if (!startKey) return false;
  const lo = startKey <= endKey ? startKey : endKey;
  const hi = startKey <= endKey ? endKey : startKey;
  return targetKey >= lo && targetKey <= hi;
};

export const requestRowId = (row) => {
  const id = row?.id ?? row?._id ?? row?.requestId;
  return id == null || id === "" ? null : String(id);
};

export const mergeRowsById = (...lists) => {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const id = requestRowId(row);
      if (id != null) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(row);
    }
  }
  return merged;
};

const extractList = (body) => {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.data?.requests)) return body.data.requests;
  if (Array.isArray(body.requests)) return body.requests;
  return [];
};

/**
 * Walks limit/offset pages when the API returns pagination.
 * If there is no pagination object, treats the first response as the full list.
 */
export const fetchAllPaged = async ({
  url,
  token,
  extraParams = {},
  pageSize = REQUEST_LIST_PAGE_SIZE,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  const pages = [];
  for (let page = 0; page < REQUEST_LIST_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value != null && value !== "") params.set(key, String(value));
    });
    const res = await fetch(`${url}?${params.toString()}`, { headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.message || "Failed to fetch requests.");
      err.status = res.status;
      err.body = body;
      throw err;
    }
    const list = extractList(body);
    pages.push(list);
    const pagination = body?.pagination ?? body?.data?.pagination ?? null;
    if (!pagination) break;
    if (!pagination.hasMore || list.length === 0) break;
  }
  return pages.flat();
};
