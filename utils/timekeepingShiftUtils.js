// utils/timekeepingShiftUtils.js

/**
 * Build a concrete shift window (start/end Date) from a user shift assignment.
 *
 * Expected shape (based on `/api/usershifts` used in `timekeeping-schedule.jsx`):
 * - userShift.assignedDate: ISO date string
 * - userShift.shift.startTime: ISO date string (time component is what we care about)
 * - userShift.shift.endTime: ISO date string
 *
 * Handles overnight shifts by rolling `end` to the next day when needed.
 */
export function buildShiftWindowFromUserShift(userShift) {
  const assignedDate = userShift?.assignedDate;
  const startIso = userShift?.shift?.startTime;
  const endIso = userShift?.shift?.endTime;
  if (!assignedDate || !startIso || !endIso) return null;

  const base = new Date(assignedDate);
  const startT = new Date(startIso);
  const endT = new Date(endIso);
  if (!Number.isFinite(base.getTime())) return null;
  if (!Number.isFinite(startT.getTime())) return null;
  if (!Number.isFinite(endT.getTime())) return null;

  // Shift times are "wall clock" values (e.g. 17:00) and should not drift
  // with timezone conversion from Date parsing.
  const parseClockParts = (isoLike, fallbackDate) => {
    const text = String(isoLike || "");
    const match = text.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      return {
        hours: Number(match[1]),
        minutes: Number(match[2]),
        seconds: Number(match[3] ?? 0),
      };
    }
    return {
      hours: fallbackDate.getUTCHours(),
      minutes: fallbackDate.getUTCMinutes(),
      seconds: fallbackDate.getUTCSeconds(),
    };
  };
  const startParts = parseClockParts(startIso, startT);
  const endParts = parseClockParts(endIso, endT);

  const start = new Date(base);
  start.setHours(
    startParts.hours,
    startParts.minutes,
    startParts.seconds,
    0,
  );

  const end = new Date(base);
  end.setHours(endParts.hours, endParts.minutes, endParts.seconds, 0);

  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
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
    if (!s || !e || !Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()))
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
    if (!s || !e || !Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()))
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
