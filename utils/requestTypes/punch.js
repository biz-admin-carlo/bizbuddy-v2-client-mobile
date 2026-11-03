import {
  API_BASE_URL,
  DEFAULT_SHIFT_DISPLAY_TIMEZONE,
  REQUEST_PUNCH_LOG_MY_REQUESTS_PATH,
  requestPunchLogDeletePath,
} from "../../config/constant";
import {
  extractCompanySettingsRaw,
  formatRequestedPunchLogDateOnlyDisplay,
  formatRequestedPunchLogDisplay,
  parseCompanyTimeZone,
} from "../companyTimeZoneUtils";
import { calendarDateKey, fetchAllPaged, mergeRowsById } from "../requestListFilters";
import {
  DEFAULT_SORT_OPTIONS,
  DEFAULT_STATUS_FILTERS,
  matchesStatusFilter,
  resolveApproverLabel,
  resolveRequestId,
} from "./shared";

const punchStatus = (row) =>
  row?.status ??
  row?.requestStatus ??
  row?.state ??
  row?.approvalStatus ??
  "—";

const punchCalendarKey = (row) => {
  const raw =
    row?.requestedDate ??
    row?.requestedClockIn ??
    row?.clockIn ??
    row?.timeIn;
  return calendarDateKey(raw);
};

export const punchRequestType = {
  key: "punch",
  label: "Punch",
  icon: "time-outline",
  emptyIcon: "document-text-outline",
  emptyTitle: "No punch log requests",
  periodLabel: "Requested times",
  datePlaceholder: "Search by requested date",
  submitRoute: "/(tabs)/(shifts)/timekeeping-punch",
  submitLabel: "New punch request",
  lockedOnFreePlan: false,
  hasScope: false,
  statusFilters: DEFAULT_STATUS_FILTERS,
  sortOptions: DEFAULT_SORT_OPTIONS,

  async fetchContext({ token }) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/company-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      const parsed = parseCompanyTimeZone(extractCompanySettingsRaw({ data: body }));
      return {
        companyTimeZone: parsed ?? DEFAULT_SHIFT_DISPLAY_TIMEZONE,
      };
    } catch (error) {
      console.error("Error fetching punch request timezone:", error);
      return { companyTimeZone: DEFAULT_SHIFT_DISPLAY_TIMEZONE };
    }
  },

  async fetchRows({ token }) {
    const url = `${API_BASE_URL}${REQUEST_PUNCH_LOG_MY_REQUESTS_PATH}`;
    const rows = await fetchAllPaged({ url, token });
    let pending = [];
    try {
      pending = await fetchAllPaged({
        url,
        token,
        extraParams: { status: "PENDING" },
      });
    } catch (pendingErr) {
      console.error("Error fetching pending punch requests:", pendingErr);
    }
    return mergeRowsById(rows, pending);
  },

  isOwn() {
    return true;
  },

  matchesStatus(item, filter) {
    return matchesStatusFilter(punchStatus(item), filter);
  },

  matchesDate(item, dateKey) {
    if (!dateKey) return true;
    return punchCalendarKey(item) === dateKey;
  },

  sortValue(item, sortKey) {
    if (sortKey === "status") return String(punchStatus(item));
    return new Date(
      item?.submittedAt ?? item?.createdAt ?? item?.updatedAt ?? 0,
    ).getTime();
  },

  present(item, { companyTimeZone } = {}) {
    const tz = companyTimeZone ?? DEFAULT_SHIFT_DISPLAY_TIMEZONE;
    const clockIn = formatRequestedPunchLogDisplay(
      item?.requestedClockIn ?? item?.clockIn ?? item?.timeIn,
      tz,
    );
    const clockOut = formatRequestedPunchLogDisplay(
      item?.requestedClockOut ?? item?.clockOut ?? item?.timeOut,
      tz,
    );
    const submittedAt = formatRequestedPunchLogDisplay(
      item?.submittedAt ?? item?.createdAt ?? item?.updatedAt,
      tz,
    );
    return {
      id: resolveRequestId(item),
      raw: item,
      type: "punch",
      status: punchStatus(item),
      title:
        formatRequestedPunchLogDateOnlyDisplay(
          item?.requestedDate ?? item?.submittedAt ?? item?.createdAt,
          tz,
        ) ?? "Punch log request",
      subtitle: submittedAt && submittedAt !== "—" ? `Submitted ${submittedAt}` : null,
      icon: "time-outline",
      periodLabel: "Requested times",
      periodValue: `${clockIn}  →  ${clockOut}`,
      submittedLabel:
        submittedAt && submittedAt !== "—" ? `Submitted ${submittedAt}` : null,
      reason: String(item?.reason ?? item?.requesterReason ?? "").trim(),
      requesterName: null,
      approverName: resolveApproverLabel(item),
      secondaryApproverName: null,
      startLabel: clockIn,
      endLabel: clockOut,
      submittedAt,
      extraDetailRows: [
        item?.description
          ? {
              icon: "document-text-outline",
              label: "Description",
              value: String(item.description),
            }
          : null,
        item?.approverComments || item?.approverComment || item?.rejectionReason
          ? {
              icon: "chatbubble-outline",
              label: "Approver comments",
              value: String(
                item.approverComments ||
                  item.approverComment ||
                  item.rejectionReason,
              ),
            }
          : null,
      ].filter(Boolean),
    };
  },

  canApprove() {
    return false;
  },
  canReject() {
    return false;
  },
  canEscalate() {
    return false;
  },
  canCancel(item) {
    return String(punchStatus(item)).toLowerCase().includes("pending");
  },
  canDelete() {
    return false;
  },

  isStillPending(item) {
    return String(punchStatus(item)).toLowerCase().includes("pending");
  },

  cancelPath(id) {
    return `${API_BASE_URL}${requestPunchLogDeletePath(id)}`;
  },
  cancelMethod: "DELETE",
};
