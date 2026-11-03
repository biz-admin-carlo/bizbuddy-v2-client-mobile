import { API_BASE_URL } from "../../config/constant";
import {
  formatLeaveBoundaryLabel,
  formatLeaveDateTimeLabel,
  normalizeLeaveRecord,
} from "../dateOnlyUtils";
import {
  fetchEmployeeDirectory,
  fetchMultiApprovalEnabled,
} from "../leaveEscalation";
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
  toStr,
} from "./shared";

const resolveLeaveTypeLabel = (item) =>
  item?.leaveType ?? item?.type ?? item?.leavePolicy?.name ?? "Leave";

const resolvePaidLabel = (item) => {
  if (item?.isPaid === true) return "Paid leave";
  if (item?.isPaid === false) return "Unpaid leave";
  return null;
};

const resolveSecondaryApproverLabel = (item, directory) => {
  const secondaryApprover = item?.secondaryApprover ?? null;
  const profile = secondaryApprover?.profile ?? null;
  const fullName = [
    `${profile?.firstName ?? secondaryApprover?.firstName ?? ""} ${profile?.lastName ?? secondaryApprover?.lastName ?? ""}`.trim(),
    secondaryApprover?.name,
    profile?.name,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  const fromDirectory =
    directory?.[String(secondaryApprover?.id ?? item?.secondaryApproverId ?? "")] ||
    null;

  return (
    fullName ||
    secondaryApprover?.username ||
    secondaryApprover?.email ||
    fromDirectory ||
    (item?.secondaryApproverId != null ? "Another approver" : null)
  );
};

const leaveTypeIcon = (type) => {
  switch (String(type ?? "").toLowerCase()) {
    case "sick leave":
      return "medkit";
    case "vacation leave":
      return "airplane";
    case "emergency leave":
      return "alert-circle";
    case "maternity/paternity leave":
      return "people";
    case "casual leave":
      return "cafe";
    default:
      return "leaf-outline";
  }
};

const canActOnLeave = (item, { isCompanyView, userRole, currentUserId }) => {
  if (!isCompanyView) return false;
  const status = String(item?.status ?? "").toLowerCase();
  if (!status.includes("pending")) return false;

  const currentId = toStr(currentUserId);
  if (currentId && isRequesterMatch(item, currentUserId)) return false;

  if (status === "pending_secondary") {
    const escalatedByUserId = toStr(
      item?.escalatedByUserId ?? item?.escalatedBy?.id,
    );
    const originalApproverId = toStr(item?.approverId ?? item?.approver?.id);
    if (
      currentId &&
      (currentId === escalatedByUserId || currentId === originalApproverId)
    ) {
      return false;
    }
  }

  if (typeof item?.canAct === "boolean") return item.canAct;

  if (status === "pending_secondary") {
    const secondaryApproverId = toStr(
      item?.secondaryApproverId ?? item?.secondaryApprover?.id,
    );
    if (userRole === "admin" || userRole === "superadmin") return true;
    return !!secondaryApproverId && currentId === secondaryApproverId;
  }

  if (userRole === "admin" || userRole === "superadmin") return true;
  if (userRole === "supervisor") {
    return isApproverMatch(item, currentUserId);
  }
  return false;
};

export const leaveRequestType = {
  key: "leave",
  label: "Leave",
  icon: "leaf-outline",
  emptyIcon: "leaf-outline",
  emptyTitle: "No leave requests",
  periodLabel: "Leave period",
  datePlaceholder: "Search by leave date",
  submitRoute: "/(tabs)/(leaves)/leaves-request",
  submitLabel: "New leave",
  lockedOnFreePlan: true,
  hasScope: true,
  statusFilters: DEFAULT_STATUS_FILTERS,
  sortOptions: [
    ...DEFAULT_SORT_OPTIONS.slice(0, 2),
    { key: "type", label: "Leave Type", icon: "list-outline" },
    DEFAULT_SORT_OPTIONS[2],
  ],

  async fetchContext({ token, isCompanyView }) {
    if (!isCompanyView) {
      return { multiApprovalEnabled: false, employeeDirectory: {} };
    }
    const [multiApprovalEnabled, employeeDirectory] = await Promise.all([
      fetchMultiApprovalEnabled(token),
      fetchEmployeeDirectory(token),
    ]);
    return { multiApprovalEnabled, employeeDirectory };
  },

  async fetchRows({ token, isCompanyView }) {
    if (!isCompanyView) {
      const rows = await fetchAllPaged({
        url: `${API_BASE_URL}/api/leaves/my`,
        token,
      });
      return rows.map(normalizeLeaveRecord);
    }

    const url = `${API_BASE_URL}/api/leaves/`;
    const rows = await fetchAllPaged({ url, token });
    let extra = [];
    try {
      const pending = await fetchAllPaged({
        url,
        token,
        extraParams: { status: "pending" },
      });
      const pendingSecondary = await fetchAllPaged({
        url,
        token,
        extraParams: { status: "pending_secondary" },
      });
      extra = [...pending, ...pendingSecondary];
    } catch (pendingErr) {
      console.error("Error fetching pending leave requests:", pendingErr);
    }
    let mine = [];
    try {
      mine = await fetchAllPaged({
        url: `${API_BASE_URL}/api/leaves/my`,
        token,
      });
    } catch (mineErr) {
      console.error("Error fetching own leave requests:", mineErr);
    }
    return mergeRowsById(rows, extra, mine).map(normalizeLeaveRecord);
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
      item.startDate ?? item.start ?? item.fromDate,
      item.endDate ?? item.end ?? item.toDate,
    );
  },

  sortValue(item, sortKey) {
    if (sortKey === "type") return resolveLeaveTypeLabel(item);
    if (sortKey === "status") return String(item.status ?? "");
    return new Date(item.createdAt ?? 0).getTime();
  },

  present(item, { employeeDirectory = {}, showRequester } = {}) {
    const title = resolveLeaveTypeLabel(item);
    const paidLabel = resolvePaidLabel(item);
    const requesterName = resolveRequesterLabel(item);
    return {
      id: resolveRequestId(item),
      raw: item,
      type: "leave",
      status: item?.status,
      title,
      subtitle: showRequester && requesterName ? requesterName : paidLabel,
      icon: leaveTypeIcon(title),
      periodLabel: "Leave period",
      periodValue: `${formatLeaveBoundaryLabel(item, "start")}  →  ${formatLeaveBoundaryLabel(item, "end")}`,
      submittedLabel: `Submitted ${formatLeaveDateTimeLabel(item.createdAt)}`,
      reason: item?.leaveReason?.trim() || "",
      requesterName,
      approverName: resolveApproverLabel(item, employeeDirectory),
      secondaryApproverName: resolveSecondaryApproverLabel(
        item,
        employeeDirectory,
      ),
      paidLabel,
      startLabel: formatLeaveBoundaryLabel(item, "start"),
      endLabel: formatLeaveBoundaryLabel(item, "end"),
      submittedAt: formatLeaveDateTimeLabel(item.createdAt),
    };
  },

  canApprove(item, ctx) {
    return canActOnLeave(item, ctx);
  },
  canReject(item, ctx) {
    return canActOnLeave(item, ctx);
  },
  canEscalate(item, ctx) {
    if (!ctx.multiApprovalEnabled) return false;
    if (!canActOnLeave(item, ctx)) return false;
    return String(item?.status ?? "").toLowerCase() === "pending";
  },
  canCancel(item, { isCompanyView, currentUserId }) {
    const status = String(item?.status ?? "").toLowerCase();
    if (!status.includes("pending")) return false;
    if (!isCompanyView) return true;
    return isRequesterMatch(item, currentUserId);
  },
  canDelete(item, { isCompanyView, currentUserId }) {
    if (!isCompanyView) return false;
    return isApproverMatch(item, currentUserId);
  },

  isStillPending(item) {
    return String(item?.status ?? "").toLowerCase().includes("pending");
  },

  approvePath(id) {
    return `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(id))}/approve`;
  },
  rejectPath(id) {
    return `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(id))}/reject`;
  },
  cancelPath(id) {
    return `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(id))}/cancel`;
  },
  deletePath(id) {
    return `${API_BASE_URL}/api/leaves/${encodeURIComponent(String(id))}`;
  },
};
