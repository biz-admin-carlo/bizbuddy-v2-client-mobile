import * as SecureStore from "expo-secure-store";

export const TIME_LOG_CONTESTED_LABEL = "Time log contested";
const CONTESTED_IDS_KEY = "bb_contested_time_log_ids_v1";

/** Normalize time log primary key from API shapes. */
export const getTimeLogId = (log) => {
  if (!log || typeof log !== "object") return null;
  const raw =
    log.id ??
    log._id ??
    log.timeLogId ??
    log.TimeLogId ??
    log.time_log_id ??
    log.timelogId ??
    log.timeLog?.id ??
    log.timeLog?._id;
  if (raw == null || raw === "") return null;
  return String(raw);
};

const extractContestList = (body) => {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  const d = body.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    if (Array.isArray(d.contests)) return d.contests;
    if (Array.isArray(d.requests)) return d.requests;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.policies)) return d.policies;
  }
  if (Array.isArray(body.contests)) return body.contests;
  if (Array.isArray(body.requests)) return body.requests;
  return [];
};

export const extractContestListFromResponse = (body) => extractContestList(body);

export const extractTimeLogIdsFromContestRows = (rows) => {
  const ids = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const candidates = [
      row.timeLogId,
      row.time_log_id,
      row.TimeLogId,
      row.timelogId,
      row.timeLog?.id,
      row.timeLog?._id,
      row.timelog?.id,
      row.timeLog?.timeLogId,
    ];
    for (const c of candidates) {
      if (c != null && c !== "") {
        ids.push(String(c));
        break;
      }
    }
  }
  return ids;
};

/** Any contest-related field on the timelog payload from GET /api/timelogs/user. */
export const logHasContestSignalFromApi = (log) => {
  if (!log || typeof log !== "object") return false;
  if (
    log.isContested === true ||
    log.contested === true ||
    log.hasContest === true ||
    log.hasActiveContest === true ||
    log.hasPendingContest === true
  ) {
    return true;
  }
  const statusRaw =
    log.contestStatus ??
    log.contestPolicyStatus ??
    log.contest?.status ??
    log.contestPolicy?.status;
  if (statusRaw != null && String(statusRaw).trim() !== "") {
    const status = String(statusRaw).trim().toLowerCase();
    if (
      status === "contested" ||
      status === "pending" ||
      status === "submitted" ||
      status === "open" ||
      status === "awaiting" ||
      status === "awaiting approval" ||
      /contest/.test(status)
    ) {
      return true;
    }
  }
  if (Array.isArray(log.contests) && log.contests.length > 0) return true;
  if (log.contestPolicy != null && typeof log.contestPolicy === "object") return true;

  for (const [key, val] of Object.entries(log)) {
    if (!/contest/i.test(key)) continue;
    if (val === true) return true;
    if (typeof val === "string" && val.trim() && !/^(none|not|no|false)$/i.test(val)) {
      return true;
    }
    if (Array.isArray(val) && val.length > 0) return true;
    if (val && typeof val === "object") return true;
  }
  return false;
};

export const isTimeLogContested = (log, contestedIdList) => {
  const id = getTimeLogId(log);
  if (id && Array.isArray(contestedIdList) && contestedIdList.includes(id)) {
    return true;
  }
  return logHasContestSignalFromApi(log);
};

export const mergeContestedIds = (...lists) => {
  const out = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const id of list) {
      if (id != null && String(id).trim() !== "") out.add(String(id));
    }
  }
  return [...out];
};

export async function loadPersistedContestedTimeLogIds() {
  try {
    const raw = await SecureStore.getItemAsync(CONTESTED_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? mergeContestedIds(parsed) : [];
  } catch {
    return [];
  }
}

export async function persistContestedTimeLogIds(ids) {
  const merged = mergeContestedIds(ids);
  try {
    await SecureStore.setItemAsync(CONTESTED_IDS_KEY, JSON.stringify(merged));
  } catch {
    /* noop */
  }
  return merged;
}

export async function addPersistedContestedTimeLogId(timeLogId) {
  const id = timeLogId != null ? String(timeLogId) : "";
  if (!id) return await loadPersistedContestedTimeLogIds();
  const next = mergeContestedIds(await loadPersistedContestedTimeLogIds(), [id]);
  return persistContestedTimeLogIds(next);
}

export function tagTimeLogsWithContestedState(logs, contestedIdList) {
  if (!Array.isArray(logs)) return [];
  return logs.map((log) => {
    if (!isTimeLogContested(log, contestedIdList)) return log;
    return {
      ...log,
      isContested: true,
      contestStatus: log.contestStatus ?? "contested",
    };
  });
}
