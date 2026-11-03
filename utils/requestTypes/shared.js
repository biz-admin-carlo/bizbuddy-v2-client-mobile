import { Platform } from "react-native";

export const toStr = (value) => (value == null ? "" : String(value));

export const firstId = (...candidates) =>
  candidates.find((c) => c != null && c !== "" && typeof c !== "object") ?? null;

export const sameId = (a, b) => a != null && b != null && String(a) === String(b);

export const sameEmail = (a, b) =>
  !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

export const resolveRequestId = (item) =>
  item?.id ??
  item?._id ??
  item?.leaveId ??
  item?.leaveRequestId ??
  item?.requestId ??
  item?.overtimeId ??
  item?.leave?.id ??
  item?.leave?._id ??
  null;

export const resolveRequesterLabel = (item) => {
  const requester =
    item?.requester ?? item?.User ?? item?.user ?? item?.employee ?? null;
  const profile = requester?.profile ?? item?.profile ?? null;
  const fullName = [
    `${profile?.firstName ?? requester?.firstName ?? ""} ${profile?.lastName ?? requester?.lastName ?? ""}`.trim(),
    requester?.fullName,
    requester?.name,
    profile?.fullName,
    profile?.name,
    item?.requesterName,
    item?.employeeName,
    item?.userName,
    item?.userDisplayName,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  return (
    fullName ||
    requester?.username ||
    requester?.email ||
    item?.requesterEmail ||
    (requester?.id != null || item?.userId != null ? "Unknown requester" : null)
  );
};

export const resolveApproverLabel = (item, directory) => {
  const approver =
    item?.approver ?? item?.Approver ?? item?.approverUser ?? null;
  const profile = approver?.profile ?? null;
  const fullName = [
    `${profile?.firstName ?? approver?.firstName ?? ""} ${profile?.lastName ?? approver?.lastName ?? ""}`.trim(),
    approver?.fullName,
    approver?.name,
    profile?.fullName,
    profile?.name,
    item?.approverName,
    item?.approverDisplayName,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  const fromDirectory =
    directory?.[String(approver?.id ?? item?.approverId ?? "")] || null;

  return (
    fullName ||
    approver?.username ||
    approver?.email ||
    item?.approverEmail ||
    fromDirectory ||
    (approver?.id != null || item?.approverId != null
      ? "Assigned approver"
      : null)
  );
};

export const isRequesterMatch = (item, currentUserId, currentUserEmail) => {
  const currentId = toStr(currentUserId);
  const requester =
    item?.requester ?? item?.User ?? item?.user ?? item?.employee ?? null;

  if (currentId) {
    const requesterCandidates = [
      item?.requesterId,
      item?.userId,
      item?.employeeId,
      item?.createdById,
      item?.createdBy,
      requester?.id,
      requester?._id,
      requester?.userId,
    ]
      .map(toStr)
      .filter(Boolean);
    if (requesterCandidates.some((id) => id === currentId)) return true;
  }

  if (currentUserEmail) {
    const emails = [requester?.email, item?.requesterEmail, item?.userEmail];
    if (emails.some((email) => sameEmail(email, currentUserEmail))) return true;
  }

  return false;
};

export const isApproverMatch = (item, currentUserId, currentUserEmail) => {
  const currentId = toStr(currentUserId);
  const approver = item?.approver ?? item?.Approver ?? item?.approverUser ?? null;

  if (currentId) {
    const approverCandidates = [
      item?.approverId,
      item?.ApproverId,
      item?.approverUserId,
      item?.approvedById,
      item?.assignedApproverId,
      firstId(item?.approver),
      approver?.id,
      approver?.userId,
    ]
      .map(toStr)
      .filter(Boolean);
    if (approverCandidates.some((id) => id === currentId)) return true;

    const approverArray =
      item?.approverIds ??
      item?.ApproverIds ??
      item?.approvers?.map((a) => a?.id ?? a?.userId) ??
      [];
    if (
      Array.isArray(approverArray) &&
      approverArray.map(toStr).some((id) => id === currentId)
    ) {
      return true;
    }
  }

  if (currentUserEmail) {
    const emails = [approver?.email, item?.approverEmail];
    if (emails.some((email) => sameEmail(email, currentUserEmail))) return true;
  }

  return false;
};

export const matchesStatusFilter = (status, filter) => {
  if (!filter || filter === "all") return true;
  const value = String(status ?? "").toLowerCase();
  const target = String(filter).toLowerCase();
  if (target === "pending") return value.includes("pending");
  return value === target;
};

export const toLocalDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export const toLocalTimeString = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const DEFAULT_STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export const DEFAULT_SORT_OPTIONS = [
  { key: "newest", label: "Newest First", icon: "time-outline" },
  { key: "oldest", label: "Oldest First", icon: "calendar-outline" },
  { key: "status", label: "Status", icon: "flag-outline" },
];

export const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
});
