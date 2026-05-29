// utils/companyTimeZoneUtils.js
// Company IANA timezone helpers for punch-log requests (not device local).

/**
 * Read company timezone from GET /api/company-settings.
 * API returns `timezone` on the settings object (e.g. data.data.timezone).
 * @returns {string|null} IANA zone e.g. "America/Los_Angeles"
 */
export function parseCompanyTimeZone(raw) {
  if (!raw || typeof raw !== "object") return null;
  const company =
    raw.company ??
    raw.Company ??
    raw.data?.company ??
    raw.settings?.company ??
    null;
  const candidates = [
    raw.timezone,
    raw.timeZone,
    raw.time_zone,
    company?.timezone,
    company?.timeZone,
    company?.time_zone,
    raw.companyTimeZone,
    raw.company_time_zone,
  ];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const tz = c.trim();
    if (!tz) continue;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      /* invalid IANA */
    }
  }
  return null;
}

const getOffsetMsForZone = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const second = Number(parts.find((p) => p.type === "second")?.value);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - date.getTime();
};

/** Wall-clock in `timeZone` → UTC instant. */
export const zonedDateTimeToDate = (
  { year, month, day, hour, minute, second = 0 },
  timeZone,
) => {
  let ts = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = getOffsetMsForZone(new Date(ts), timeZone);
    ts = Date.UTC(year, month - 1, day, hour, minute, second, 0) - offset;
  }
  return new Date(ts);
};

export const getDatePartsInTimeZone = (dateInput, timeZone) => {
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  )
    return null;
  return { year, month, day };
};

export const getWallClockPartsInTimeZone = (dateInput, timeZone) => {
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const second = Number(parts.find((p) => p.type === "second")?.value);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }
  return { hour, minute, second };
};

/** Calendar Y/M/D from a date picker (numbers shown on the wheel). */
export const getPickerCalendarParts = (dateInput) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!Number.isFinite(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
};

/** Wall-clock H:M:S from a time picker (numbers shown on the wheel). */
export const getPickerWallClockParts = (dateInput) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!Number.isFinite(d.getTime())) return null;
  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  };
};

export const addCalendarDays = ({ year, month, day }, days) => {
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
};

export const formatCompanyCalendarDateString = (reqDatePicker) => {
  const cal = getPickerCalendarParts(reqDatePicker);
  if (!cal) return null;
  const m = String(cal.month).padStart(2, "0");
  const day = String(cal.day).padStart(2, "0");
  return `${cal.year}-${m}-${day}`;
};

export const buildInstantInCompanyZone = (
  reqDatePicker,
  timePicker,
  companyTimeZone,
) => {
  const cal = getPickerCalendarParts(reqDatePicker);
  const wall = getPickerWallClockParts(timePicker);
  if (!cal || !wall || !companyTimeZone) return null;
  return zonedDateTimeToDate(
    {
      year: cal.year,
      month: cal.month,
      day: cal.day,
      hour: wall.hour,
      minute: wall.minute,
      second: wall.second,
    },
    companyTimeZone,
  );
};

export const buildClockOutInstantInCompanyZone = (
  reqDatePicker,
  timePicker,
  crossesNextDay,
  companyTimeZone,
) => {
  const cal = getPickerCalendarParts(reqDatePicker);
  const wall = getPickerWallClockParts(timePicker);
  if (!cal || !wall || !companyTimeZone) return null;
  const dayParts = crossesNextDay ? addCalendarDays(cal, 1) : cal;
  return zonedDateTimeToDate(
    {
      year: dayParts.year,
      month: dayParts.month,
      day: dayParts.day,
      hour: wall.hour,
      minute: wall.minute,
      second: wall.second,
    },
    companyTimeZone,
  );
};

/** API payload: UTC instant as ISO-8601 without trailing Z e.g. 2026-05-01T09:00:00.000 */
export const formatUtcIsoForPunchLogApi = (instant) => {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime()))
    return null;
  return instant.toISOString().replace(/Z$/i, "");
};

const pad2 = (n) => String(n).padStart(2, "0");

/** Naive local datetime for API from picker wheels (device local, no TZ conversion). */
export const formatNaiveLocalDateTimeFromPickers = (
  reqDatePicker,
  timePicker,
) => {
  const cal = getPickerCalendarParts(reqDatePicker);
  const wall = getPickerWallClockParts(timePicker);
  if (!cal || !wall) return null;
  return `${cal.year}-${pad2(cal.month)}-${pad2(cal.day)}T${pad2(wall.hour)}:${pad2(wall.minute)}`;
};

/** Naive local clock-out; optional +1 calendar day when shift crosses midnight. */
export const formatNaiveLocalClockOutFromPickers = (
  reqDatePicker,
  timePicker,
  crossesNextDay,
) => {
  const cal = getPickerCalendarParts(reqDatePicker);
  const wall = getPickerWallClockParts(timePicker);
  if (!cal || !wall) return null;
  const dayParts = crossesNextDay ? addCalendarDays(cal, 1) : cal;
  return `${dayParts.year}-${pad2(dayParts.month)}-${pad2(dayParts.day)}T${pad2(wall.hour)}:${pad2(wall.minute)}`;
};

/** Device-local Date for validation (future check, duration). */
export const buildLocalDateFromPickers = (
  reqDatePicker,
  timePicker,
  crossesNextDay = false,
) => {
  const cal = getPickerCalendarParts(reqDatePicker);
  const wall = getPickerWallClockParts(timePicker);
  if (!cal || !wall) return null;
  const dayParts = crossesNextDay ? addCalendarDays(cal, 1) : cal;
  const d = new Date(
    dayParts.year,
    dayParts.month - 1,
    dayParts.day,
    wall.hour,
    wall.minute,
    wall.second,
    0,
  );
  return Number.isFinite(d.getTime()) ? d : null;
};

/** Default punch-log picker values using device local calendar/wall clock. */
export const getDefaultPunchLogPickerDatesLocal = () => {
  const now = new Date();
  const reqDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const clockIn = new Date(2000, 0, 1, now.getHours(), now.getMinutes(), 0);
  const outAnchor = new Date(now.getTime() + 8 * 3600000);
  const clockOut = new Date(
    2000,
    0,
    1,
    outAnchor.getHours(),
    outAnchor.getMinutes(),
    0,
  );
  return { reqDate, clockIn, clockOut };
};

/** Merge calendar day from date picker with wall-clock fields from time picker. */
export const combinePickerDateAndWallTime = (calendarDate, wallTimeDate) => {
  const combined = new Date(calendarDate);
  combined.setHours(
    wallTimeDate.getHours(),
    wallTimeDate.getMinutes(),
    wallTimeDate.getSeconds(),
    wallTimeDate.getMilliseconds(),
  );
  return combined;
};

const wallTimePickerFromInstant = (iso, companyTimeZone) => {
  if (!iso) return null;
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return null;

  if (companyTimeZone) {
    const cal = getDatePartsInTimeZone(instant, companyTimeZone);
    const wall = getWallClockPartsInTimeZone(instant, companyTimeZone);
    if (cal && wall) {
      return {
        reqDate: new Date(cal.year, cal.month - 1, cal.day),
        wallTime: new Date(2000, 0, 1, wall.hour, wall.minute, wall.second),
      };
    }
  }

  return {
    reqDate: new Date(
      instant.getFullYear(),
      instant.getMonth(),
      instant.getDate(),
    ),
    wallTime: new Date(
      2000,
      0,
      1,
      instant.getHours(),
      instant.getMinutes(),
      instant.getSeconds(),
    ),
  };
};

const calendarDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/**
 * Prefill contest pickers from timelog ISO values using device-local calendar/wall clock
 * (same as time card display). Company timezone is applied only when submitting via
 * buildInstantInCompanyZone / buildClockOutInstantInCompanyZone.
 * @returns {{ reqDate: Date, clockInTime: Date, clockOutTime: Date, clockOutCrossesNextDay: boolean } | null}
 */
export const getContestPickerStateFromTimeLog = (log) => {
  if (!log?.timeIn) return null;

  const inParsed = wallTimePickerFromInstant(log.timeIn, null);
  if (!inParsed) return null;

  const reqDate = new Date(inParsed.reqDate);
  const clockInTime = combinePickerDateAndWallTime(reqDate, inParsed.wallTime);

  let clockOutTime = new Date(clockInTime);
  let clockOutCrossesNextDay = false;

  if (log.timeOut) {
    const outParsed = wallTimePickerFromInstant(log.timeOut, null);
    if (outParsed) {
      clockOutCrossesNextDay =
        calendarDateKey(inParsed.reqDate) !== calendarDateKey(outParsed.reqDate);
      const outCalDate = clockOutCrossesNextDay ? outParsed.reqDate : reqDate;
      clockOutTime = combinePickerDateAndWallTime(outCalDate, outParsed.wallTime);
    }
  }

  return { reqDate, clockInTime, clockOutTime, clockOutCrossesNextDay };
};

/** Label for time-picker buttons (uses wall-clock fields only, no TZ conversion). */
export const formatPickerWallTimeLabel = (dateInput) => {
  const wall = getPickerWallClockParts(dateInput);
  if (!wall) return "—";
  return formatFriendlyTime12h(wall.hour, wall.minute, wall.second);
};

/** Default picker values: “now” in company zone; clock-out +8h company wall time. */
export const getDefaultPunchLogPickerDates = (companyTimeZone) => {
  const now = new Date();
  const cal = getDatePartsInTimeZone(now, companyTimeZone);
  const wall = getWallClockPartsInTimeZone(now, companyTimeZone);
  if (!cal || !wall) return null;
  const reqDate = new Date(cal.year, cal.month - 1, cal.day);
  const clockIn = new Date(2000, 0, 1, wall.hour, wall.minute, wall.second);
  const clockInInstant = zonedDateTimeToDate(
    { ...cal, hour: wall.hour, minute: wall.minute, second: wall.second },
    companyTimeZone,
  );
  const clockOutInstant = new Date(clockInInstant.getTime() + 8 * 3600000);
  const outWall = getWallClockPartsInTimeZone(clockOutInstant, companyTimeZone);
  const clockOut = outWall
    ? new Date(2000, 0, 1, outWall.hour, outWall.minute, outWall.second)
    : new Date(clockIn.getTime() + 8 * 3600000);
  return { reqDate, clockIn, clockOut };
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatFriendlyDateOnly = (year, month, day) => {
  const wd =
    WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const mon = MONTH_SHORT[month - 1];
  return `${wd}, ${mon} ${day}, ${year}`;
};

const formatFriendlyTime12h = (hour, minute, second) => {
  const isAm = hour < 12;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, "0");
  if (second !== 0) {
    const ss = String(second).padStart(2, "0");
    return `${h12}:${mm}:${ss} ${isAm ? "AM" : "PM"}`;
  }
  return `${h12}:${mm} ${isAm ? "AM" : "PM"}`;
};

/** YYYY-MM-DD calendar key for grouping logs in a given IANA zone. */
export const dateKeyInTimeZone = (iso, timeZone) => {
  if (!iso || !timeZone) return "";
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return "";
  const cal = getDatePartsInTimeZone(instant, timeZone);
  if (!cal) return "";
  const m = String(cal.month).padStart(2, "0");
  const d = String(cal.day).padStart(2, "0");
  return `${cal.year}-${m}-${d}`;
};

/** Day group header, e.g. "May 21". */
export const formatDayHeaderInTimeZone = (iso, timeZone) => {
  if (!iso || !timeZone) return "—";
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return "—";
  const cal = getDatePartsInTimeZone(instant, timeZone);
  if (!cal) return "—";
  return `${MONTH_SHORT[cal.month - 1]} ${cal.day}`;
};

/** Short label for timelog punch lines, e.g. "May 21 at 9:26 AM". */
export const formatTimeLogPunchLabel = (iso, timeZone) => {
  if (!iso || !timeZone) return "—";
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return "—";
  const cal = getDatePartsInTimeZone(instant, timeZone);
  const wall = getWallClockPartsInTimeZone(instant, timeZone);
  if (!cal || !wall) return "—";
  const mon = MONTH_SHORT[cal.month - 1];
  return `${mon} ${cal.day} at ${formatFriendlyTime12h(wall.hour, wall.minute, wall.second)}`;
};

/** Compact date + time for detail rows (company zone). */
export const formatShortDateTimeInCompanyZone = (iso, timeZone) => {
  if (!iso || !timeZone) return "—";
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return "—";
  const cal = getDatePartsInTimeZone(instant, timeZone);
  const wall = getWallClockPartsInTimeZone(instant, timeZone);
  if (!cal || !wall) return "—";
  const mm = String(cal.month).padStart(2, "0");
  const dd = String(cal.day).padStart(2, "0");
  return `${mm}/${dd}/${cal.year}, ${formatFriendlyTime12h(wall.hour, wall.minute, wall.second)}`;
};

/**
 * Display punch-log API datetime as naive wall clock (no IANA / UTC conversion).
 * Strips trailing Z, milliseconds, or offset if the server echoes them.
 */
export const formatNaivePunchLogDateTimeDisplay = (value) => {
  if (value == null || value === "") return "—";
  let s = typeof value === "string" ? value.trim() : String(value);
  s = s.replace(/\.\d{3}Z$/i, "Z").replace(/Z$/i, "");
  const offsetTail = s.match(/([+-]\d{2}:\d{2})$/);
  if (offsetTail) s = s.slice(0, -offsetTail[0].length);

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, mo, d] = s.split("-").map(Number);
    if (y && mo && d) return formatFriendlyDateOnly(y, mo, d);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4]);
    const min = Number(m[5]);
    const sec = m[6] ? Number(m[6]) : 0;
    return `${formatFriendlyDateOnly(y, mo, d)} · ${formatFriendlyTime12h(h, min, sec)}`;
  }
  return s || "—";
};

/** @deprecated Use formatNaivePunchLogDateTimeDisplay — punch logs are naive, not company-zone. */
export const formatPunchLogDateTimeInCompanyZone = (value, _companyTimeZone) =>
  formatNaivePunchLogDateTimeDisplay(value);

export const extractCompanySettingsRaw = (settingsRes) =>
  settingsRes?.data?.data ??
  settingsRes?.data?.settings ??
  settingsRes?.data ??
  {};

/**
 * Log GET /api/company-settings response for timezone debugging.
 * @returns {string|null} parsed IANA timezone
 */
export function logCompanySettingsTimeZoneResult(
  settingsRes,
  source = "company-settings",
) {
  const raw = extractCompanySettingsRaw(settingsRes);
  const company = raw?.company ?? raw?.Company ?? null;
  const parsedTimeZone = parseCompanyTimeZone(raw);
  const logPayload = {
    source,
    endpoint: "/api/company-settings",
    httpStatus: settingsRes?.status,
    parsedTimeZone,
    companyFields: company
      ? {
          timeZone: company.timeZone,
          time_zone: company.time_zone,
          timezone: company.timezone,
        }
      : null,
    rawTopLevel: {
      timezone: raw?.timezone,
      timeZone: raw?.timeZone,
      time_zone: raw?.time_zone,
    },
    extractedRaw: raw,
    responseData: settingsRes?.data,
  };
  console.log(
    "[BizBuddy] company-settings timezone endpoint result",
    logPayload,
  );
  return parsedTimeZone;
}
