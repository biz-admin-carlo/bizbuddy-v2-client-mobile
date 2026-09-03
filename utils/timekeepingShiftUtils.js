// utils/timekeepingShiftUtils.js

import { DEFAULT_SHIFT_DISPLAY_TIMEZONE } from "../config/constant";

const DATE_PREFIX_REGEX = /^(\d{4}-\d{2}-\d{2})/;

const resolveTimeZone = (value) => {
  if (typeof value !== "string") return null;
  const tz = value.trim();
  if (!tz) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
};

const getShiftTimeZone = (userShift, fallbackTimeZone) =>
  resolveTimeZone(userShift?.shift?.timeZone) ||
  resolveTimeZone(userShift?.shift?.time_zone) ||
  resolveTimeZone(userShift?.timeZone) ||
  resolveTimeZone(userShift?.time_zone) ||
  resolveTimeZone(fallbackTimeZone) ||
  DEFAULT_SHIFT_DISPLAY_TIMEZONE;

const parseNaiveTime = (value) => {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const m =
    s.match(/T?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z)?$/i) ||
    s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3] ?? 0);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  )
    return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59)
    return null;
  return { hour, minute, second };
};

const getDatePartsInTimeZone = (dateInput, timeZone) => {
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
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day))
    return null;
  return { year, month, day };
};

const ymdFromDateOnlyString = (yyyyMmDd) => {
  const [year, month, day] = String(yyyyMmDd)
    .split("-")
    .map((part) => Number(part));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
};

/**
 * Calendar Y/M/D for a user-shift assignedDate.
 *
 * assignedDate is a workday, not a UTC instant. Taking the YYYY-MM-DD prefix
 * avoids the Friday-last-shift miss: UTC midnight Friday is still Thursday
 * evening in US zones, and there is often no Saturday assignment to look ahead
 * to. Same instant is Friday night in Asia/Manila and Friday morning in
 * America/Los_Angeles — both must still match Friday's shift.
 */
const parseAssignedDateParts = (assignedDate, timeZone) => {
  const s = String(assignedDate ?? "").trim();
  if (!s) return null;
  const prefix = s.match(DATE_PREFIX_REGEX);
  if (prefix) return ymdFromDateOnlyString(prefix[1]);
  return getDatePartsInTimeZone(assignedDate, timeZone);
};

const datePartsKey = (parts) => {
  if (!parts) return "";
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
};

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

const zonedDateTimeToDate = (
  { year, month, day, hour, minute, second = 0 },
  timeZone
) => {
  // Iterative conversion handles DST transitions more reliably.
  let ts = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = getOffsetMsForZone(new Date(ts), timeZone);
    ts = Date.UTC(year, month - 1, day, hour, minute, second, 0) - offset;
  }
  return new Date(ts);
};

/**
 * Build a concrete shift window (start/end Date) from a user shift assignment.
 *
 * Expected shape (based on `/api/usershifts` used in `timekeeping-schedule.jsx`):
 * - userShift.assignedDate: workday (`YYYY-MM-DD` or ISO whose date prefix is that day)
 * - userShift.shift.startTime: ISO date string (time component is what we care about)
 * - userShift.shift.endTime: ISO date string
 *
 * Handles overnight shifts by rolling `end` to the next day when needed.
 *
 * @param {object} userShift
 * @param {string} [fallbackTimeZone] company IANA zone when the shift has none
 */
export function buildShiftWindowFromUserShift(userShift, fallbackTimeZone) {
  const assignedDate = userShift?.assignedDate;
  const startIso = userShift?.shift?.startTime;
  const endIso = userShift?.shift?.endTime;
  if (!assignedDate || !startIso || !endIso) return null;

  const timeZone = getShiftTimeZone(userShift, fallbackTimeZone);
  const dateParts = parseAssignedDateParts(assignedDate, timeZone);
  const startParts = parseNaiveTime(startIso);
  const endParts = parseNaiveTime(endIso);
  if (!dateParts || !startParts || !endParts) return null;

  const start = zonedDateTimeToDate(
    {
      ...dateParts,
      hour: startParts.hour,
      minute: startParts.minute,
      second: startParts.second,
    },
    timeZone
  );
  let end = zonedDateTimeToDate(
    {
      ...dateParts,
      hour: endParts.hour,
      minute: endParts.minute,
      second: endParts.second,
    },
    timeZone
  );

  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return { start, end, timeZone };
}

/**
 * Given a set of shift windows, find the nearest "gap" around `at`:
 * - lastShiftEnd: latest end <= at
 * - nextShiftStart: earliest start >= at
 */
export function findSurroundingShiftBoundaries(windows, at) {
  if (!Array.isArray(windows) || !windows.length) return null;
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) return null;

  let lastShiftEnd = null;
  let nextShiftStart = null;

  for (const w of windows) {
    const s = w?.start instanceof Date ? w.start : null;
    const e = w?.end instanceof Date ? w.end : null;
    if (!s || !e) continue;
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()))
      continue;

    if (e.getTime() <= at.getTime()) {
      if (!lastShiftEnd || e.getTime() > lastShiftEnd.getTime())
        lastShiftEnd = e;
    }
    if (s.getTime() >= at.getTime()) {
      if (!nextShiftStart || s.getTime() < nextShiftStart.getTime())
        nextShiftStart = s;
    }
  }

  return { lastShiftEnd, nextShiftStart };
}

/**
 * Whether the user has a shift relevant for clock-in at `at` (no-schedule modal, punch type).
 * True when currently inside a shift window, or any window starts on the same
 * company calendar day as `at` (overnight windows still match via in-window).
 * Company calendar day (not device local) is what matters: a PH Friday night
 * punch is still Friday morning in America/Los_Angeles.
 */
export function hasRelevantScheduledShiftForClockIn(windows, at) {
  if (!Array.isArray(windows) || !windows.length) return false;
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) return false;

  const t = at.getTime();
  for (const w of windows) {
    const s = w?.start instanceof Date ? w.start : null;
    const e = w?.end instanceof Date ? w.end : null;
    if (
      !s ||
      !e ||
      !Number.isFinite(s.getTime()) ||
      !Number.isFinite(e.getTime())
    )
      continue;
    if (s.getTime() <= t && t < e.getTime()) return true;
  }

  for (const w of windows) {
    const s = w?.start instanceof Date ? w.start : null;
    if (!s || !Number.isFinite(s.getTime())) continue;
    const tz = resolveTimeZone(w?.timeZone) || DEFAULT_SHIFT_DISPLAY_TIMEZONE;
    const atKey = datePartsKey(getDatePartsInTimeZone(at, tz));
    const startKey = datePartsKey(getDatePartsInTimeZone(s, tz));
    if (atKey && startKey && atKey === startKey) return true;
  }

  return false;
}

/**
 * For clock-out UX: describe how the current moment relates to assigned shifts.
 *
 * @param {Array<{ start: Date, end: Date }>} windows from buildShiftWindowFromUserShift
 * @param {Date} at - usually "now"
 * @returns {{ status: 'no_shifts' } | { status: 'in_shift', shiftEnd: Date, shiftStart: Date, minutesUntilShiftEnd: number } | { status: 'after_scheduled_end', shiftEnd: Date, shiftStart: Date, minutesPastScheduledEnd: number } | { status: 'not_in_shift' }}
 */
export function getClockOutScheduleSummary(windows, at) {
  if (!Array.isArray(windows) || !windows.length) {
    return { status: "no_shifts" };
  }
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    return { status: "no_shifts" };
  }

  const t = at.getTime();

  for (const w of windows) {
    const s = w?.start instanceof Date ? w.start : null;
    const e = w?.end instanceof Date ? w.end : null;
    if (
      !s ||
      !e ||
      !Number.isFinite(s.getTime()) ||
      !Number.isFinite(e.getTime())
    )
      continue;
    if (s.getTime() <= t && t < e.getTime()) {
      const minutesUntilShiftEnd = Math.max(
        0,
        Math.floor((e.getTime() - t) / 60000),
      );
      return {
        status: "in_shift",
        shiftStart: s,
        shiftEnd: e,
        minutesUntilShiftEnd,
      };
    }
  }

  let latestStarted = null;
  for (const w of windows) {
    const s = w?.start instanceof Date ? w.start : null;
    const e = w?.end instanceof Date ? w.end : null;
    if (
      !s ||
      !e ||
      !Number.isFinite(s.getTime()) ||
      !Number.isFinite(e.getTime())
    )
      continue;
    if (s.getTime() <= t) {
      if (!latestStarted || s.getTime() > latestStarted.start.getTime()) {
        latestStarted = { start: s, end: e };
      }
    }
  }

  if (latestStarted && t >= latestStarted.end.getTime()) {
    return {
      status: "after_scheduled_end",
      shiftStart: latestStarted.start,
      shiftEnd: latestStarted.end,
      minutesPastScheduledEnd: Math.floor(
        (t - latestStarted.end.getTime()) / 60000,
      ),
    };
  }

  return { status: "not_in_shift" };
}
