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

  const start = new Date(base);
  start.setHours(
    startT.getHours(),
    startT.getMinutes(),
    startT.getSeconds(),
    0,
  );

  const end = new Date(base);
  end.setHours(endT.getHours(), endT.getMinutes(), endT.getSeconds(), 0);

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
