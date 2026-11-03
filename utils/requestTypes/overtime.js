import { API_BASE_URL } from "../../config/constant";
import {
  dateKeyInInclusiveRange,
  fetchAllPaged,
  mergeRowsById,
} from "../requestListFilters";
import {
  DEFAULT_SORT_OPTIONS,
  DEFAULT_STATUS_FILTERS,
  isApproverMatch,
  isRequesterMatch,
  matchesStatusFilter,
  resolveApproverLabel,
  resolveRequestId,
  resolveRequesterLabel,
  toLocalDateTime,
  toLocalTimeString,
} from "./shared";

const overtimeTimeLogStart = (item) => {
  const tl = item?.timeLog || {};
  return (
    tl.actualStart ||
    tl.start ||
    tl.clockIn ||
    tl.punchIn ||
    tl.in ||
    tl.inTime ||
    item?.fromDate ||
    item?.createdAt
  );
};

const overtimeTimeLogEnd = (item) => {
  const tl = item?.timeLog || {};
  return (
    tl.actualEnd ||
    tl.end ||
    tl.clockOut ||
    tl.punchOut ||
    tl.out ||
    tl.outTime ||
    item?.toDate ||
    overtimeTimeLogStart(item)
  );
};

export const overtimeRequestType = {
  key: "overtime",
  label: "Overtime",
  icon: "stopwatch-outline",
  emptyIcon: "time-outline",
  emptyTitle: "No overtime requests",
  periodLabel: "Overtime period",
  datePlaceholder: "Search by overtime date",
  submitRoute: "/(tabs)/(overtime)",
  submitLabel: "New overtime",
  lockedOnFreePlan: true,
  hasScope: true,
  statusFilters: DEFAULT_STATUS_FILTERS,
  sortOptions: DEFAULT_SORT_OPTIONS,

  async fetchContext() {
    return {};
  },

  async fetchRows({ token, isCompanyView, currentUserId, currentUserEmail }) {
    if (!isCompanyView) {
      return fetchAllPaged({
        url: `${API_BASE_URL}/api/overtime/my`,
        token,
      });
    }

    const rows = await fetchAllPaged({
      url: `${API_BASE_URL}/api/overtime/`,
      token,
    });
    let mine = [];
    try {
      mine = await fetchAllPaged({
        url: `${API_BASE_URL}/api/overtime/my`,
        token,
      });
    } catch (mineErr) {
      console.error("Error fetching own overtime requests:", mineErr);
    }
    const merged = mergeRowsById(rows, mine);
    if (!currentUserId && !currentUserEmail) return merged;
    return merged.filter(
      (req) =>
        isRequesterMatch(req, currentUserId, currentUserEmail) ||
        isApproverMatch(req, currentUserId, currentUserEmail),
    );
  },

  isOwn(item, currentUserId, currentUserEmail) {
    return isRequesterMatch(item, currentUserId, currentUserEmail);
  },

  matchesStatus(item, filter) {
    return matchesStatusFilter(item?.status, filter);
  },

  matchesDate(item, dateKey) {
    return dateKeyInInclusiveRange(
      dateKey,
      overtimeTimeLogStart(item),
      overtimeTimeLogEnd(item),
    );
  },

  sortValue(item, sortKey) {
    if (sortKey === "status") return String(item.status ?? "");
    return new Date(item.createdAt || item.fromDate || 0).getTime();
  },

  present(item, { showRequester } = {}) {
    const start = overtimeTimeLogStart(item);
    const end = overtimeTimeLogEnd(item);
    const hours = item?.requestedHours;
    return {
      id: resolveRequestId(item),
      raw: item,
      type: "overtime",
      status: item?.status,
      title: hours ? `${hours}h overtime` : "Overtime request",
      subtitle: showRequester ? resolveRequesterLabel(item) : null,
      icon: "stopwatch-outline",
      periodLabel: "Overtime period",
      periodValue: `${toLocalDateTime(start)}  →  ${toLocalDateTime(end)}`,
      submittedLabel: `Submitted ${toLocalDateTime(item.createdAt)}`,
      reason: String(item?.overtimeReason ?? item?.requesterReason ?? "").trim(),
      requesterName: resolveRequesterLabel(item),
      approverName: resolveApproverLabel(item),
      secondaryApproverName: null,
      startLabel: toLocalDateTime(start),
      endLabel: toLocalDateTime(end),
      submittedAt: toLocalDateTime(item.createdAt),
      extraDetailRows: [
        item?.requestedHours
          ? {
              icon: "hourglass-outline",
              label: "Requested hours",
              value: String(item.requestedHours),
            }
          : null,
        toLocalTimeString(start) || toLocalTimeString(end)
          ? {
              icon: "clipboard-outline",
              label: "Time log",
              value: `${toLocalTimeString(start) || "?"} – ${toLocalTimeString(end) || "?"}`,
            }
          : null,
      ].filter(Boolean),
    };
  },

  canApprove(item, { isCompanyView, currentUserId, currentUserEmail }) {
    if (!isCompanyView) return false;
    if (!String(item?.status ?? "").toLowerCase().includes("pending")) {
      return false;
    }
    if (isRequesterMatch(item, currentUserId, currentUserEmail)) return false;
    return isApproverMatch(item, currentUserId, currentUserEmail);
  },
  canReject(item, ctx) {
    return overtimeRequestType.canApprove(item, ctx);
  },
  canEscalate() {
    return false;
  },
  canCancel() {
    return false;
  },
  canDelete() {
    return false;
  },

  isStillPending(item) {
    return String(item?.status ?? "").toLowerCase().includes("pending");
  },

  approvePath(id) {
    return `${API_BASE_URL}/api/overtime/${encodeURIComponent(String(id))}/approve`;
  },
  rejectPath(id) {
    return `${API_BASE_URL}/api/overtime/${encodeURIComponent(String(id))}/reject`;
  },
};
