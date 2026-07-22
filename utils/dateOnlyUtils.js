/** YYYY-MM-DD (calendar date, no time zone suffix). */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const START_BOUNDARY_KEYS = [
  "fromDate",
  "startDate",
  "start",
  "from",
  "leaveStartDate",
];
const END_BOUNDARY_KEYS = ["toDate", "endDate", "end", "to", "leaveEndDate"];
const START_TIME_KEYS = [
  "fromTime",
  "startTime",
  "timeStart",
  "leaveStartTime",
];
const END_TIME_KEYS = ["toTime", "endTime", "timeEnd", "leaveEndTime"];

const LOCALE_DATE_TIME_OPTS = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

const hasTimeInString = (value) => {
  const s = String(value).trim();
  if (DATE_ONLY_REGEX.test(s)) return false;
  return /T\d{1,2}:\d{2}/.test(s) || /\s\d{1,2}:\d{2}/.test(s);
};

/** Calendar day in the device-local timezone for API payloads. */
export const formatLocalDateOnly = (dateInput) => {
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Local wall-clock time HH:mm for APIs that expect hours and minutes only. */
export const formatLocalTimeHm = (dateInput) => {
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return "";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
};

/** Local wall-clock time HH:mm:ss for APIs that store date and time separately. */
export const formatLocalTimeHms = (dateInput) => {
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return "";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${hour}:${minute}:${second}`;
};

/** Parse YYYY-MM-DD as local midnight (avoids UTC off-by-one in display). */
export const parseDateOnlyToLocalDate = (dateString) => {
  if (!DATE_ONLY_REGEX.test(String(dateString || "").trim())) return null;
  const [year, month, day] = String(dateString)
    .trim()
    .split("-")
    .map((part) => parseInt(part, 10));
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
};

const parseWallTimeParts = (timeValue) => {
  if (timeValue == null || timeValue === "") return null;
  const s = String(timeValue).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const second = match[3] != null ? parseInt(match[3], 10) : 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
};

const mergeDateOnlyAndWallTime = (dateString, timeValue) => {
  const base = parseDateOnlyToLocalDate(dateString);
  const parts = parseWallTimeParts(timeValue);
  if (!base || !parts) return null;
  base.setHours(parts.hour, parts.minute, parts.second, 0);
  return base;
};

/** Prefer API fields that still include a time component. */
export const resolveLeaveBoundaryValue = (item, boundary /* "start" | "end" */) => {
  if (!item) return null;
  const keys = boundary === "start" ? START_BOUNDARY_KEYS : END_BOUNDARY_KEYS;
  const withTime = [];
  const dateOnly = [];
  for (const key of keys) {
    const value = item[key];
    if (value == null || value === "") continue;
    if (hasTimeInString(value)) withTime.push(value);
    else if (DATE_ONLY_REGEX.test(String(value).trim())) dateOnly.push(value);
    else withTime.push(value);
  }
  return withTime[0] ?? dateOnly[0] ?? null;
};

const resolveLeaveBoundaryTimeValue = (item, boundary) => {
  const keys = boundary === "start" ? START_TIME_KEYS : END_TIME_KEYS;
  for (const key of keys) {
    const value = item?.[key];
    if (value != null && value !== "") return value;
  }
  return null;
};

/** Leave list labels: full datetimes with time; merges date-only + time fields when needed. */
export const formatLeaveDateTimeLabel = (dateString, timeString) => {
  if (dateString == null || dateString === "") return "—";

  const trimmed = String(dateString).trim();

  if (DATE_ONLY_REGEX.test(trimmed)) {
    const merged = mergeDateOnlyAndWallTime(trimmed, timeString);
    if (merged) {
      return merged.toLocaleString("en-US", LOCALE_DATE_TIME_OPTS);
    }
    const dateOnly = parseDateOnlyToLocalDate(trimmed);
    if (dateOnly) {
      return dateOnly.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return trimmed;
  return date.toLocaleString("en-US", LOCALE_DATE_TIME_OPTS);
};

/** Format start/end on a leave row using all common API field shapes. */
export const formatLeaveBoundaryLabel = (item, boundary) => {
  const dateValue = resolveLeaveBoundaryValue(item, boundary);
  const timeValue = resolveLeaveBoundaryTimeValue(item, boundary);
  return formatLeaveDateTimeLabel(dateValue, timeValue);
};

/** Normalize list items so startDate/endDate prefer datetime fields from the API. */
export const normalizeLeaveRecord = (item) => {
  if (!item || typeof item !== "object") return item;
  const startDate = resolveLeaveBoundaryValue(item, "start");
  const endDate = resolveLeaveBoundaryValue(item, "end");
  return { ...item, startDate, endDate };
};
