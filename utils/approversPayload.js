// utils/approversPayload.js
//
// Shared parser for GET /api/leaves/approvers responses, used by every request
// form that offers an approver dropdown (leave request, overtime request,
// punch log request, DTR contest).
//
// Current server shape (bizbuddy-server BB-072, release v2.10.37+):
//   { data: { supervisors: [{ id, name, jobTitle, role }], approvers: [{ id, name, email, role }] } }
// Legacy shape (pre-BB-072), kept for backward compatibility in case the
// server ever reverts or an older deployment is hit:
//   { data: [{ id, email, username, role, profile: { firstName, lastName } }] }

export const SUPERVISOR_GROUP_VALUE = "__group_supervisors";
export const APPROVER_GROUP_VALUE = "__group_approvers";

const legacyDisplayName = (approver) => {
  const firstName = approver?.profile?.firstName || "";
  const lastName = approver?.profile?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || approver?.username || approver?.name || `User ${approver?.id}`;
};

const toDropdownItem = (approver, parent) => ({
  label:
    approver?.name ||
    legacyDisplayName(approver) ||
    approver?.email ||
    `User ${approver?.id}`,
  value: String(approver?.id),
  parent,
});

const toGroupHeader = (label, value) => ({
  label,
  value,
  selectable: false,
});

/**
 * Parses the raw parsed-JSON body of GET /api/leaves/approvers into
 * dropdown-ready items grouped for react-native-dropdown-picker.
 *
 * Split payload: "Direct Supervisor" (or a custom label) pinned first,
 * then "Approvers". People who appear in both lists are kept in the
 * supervisor group only. Empty groups are omitted.
 *
 * Legacy flat arrays stay ungrouped.
 */
export function parseApproversPayload(payload, options = {}) {
  const supervisorGroupLabel =
    options.supervisorGroupLabel || "Direct Supervisor";
  const approverGroupLabel = options.approverGroupLabel || "Approvers";

  const raw = payload?.data;
  if (!raw) return [];

  // Current split shape: { supervisors: [...], approvers: [...] }
  if (!Array.isArray(raw) && (Array.isArray(raw.supervisors) || Array.isArray(raw.approvers))) {
    const supervisors = (raw.supervisors || []).filter((approver) => approver?.id != null);
    const supervisorIds = new Set(supervisors.map((approver) => approver.id));
    const approvers = (raw.approvers || []).filter(
      (approver) => approver?.id != null && !supervisorIds.has(approver.id),
    );

    const items = [];

    if (supervisors.length > 0) {
      items.push(toGroupHeader(supervisorGroupLabel, SUPERVISOR_GROUP_VALUE));
      supervisors.forEach((approver) => {
        items.push(toDropdownItem(approver, SUPERVISOR_GROUP_VALUE));
      });
    }

    if (approvers.length > 0) {
      items.push(toGroupHeader(approverGroupLabel, APPROVER_GROUP_VALUE));
      approvers.forEach((approver) => {
        items.push(toDropdownItem(approver, APPROVER_GROUP_VALUE));
      });
    }

    return items;
  }

  // Legacy flat-array shape
  if (Array.isArray(raw)) {
    return raw.filter((approver) => approver?.id != null).map((approver) =>
      toDropdownItem(approver),
    );
  }

  return [];
}
