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

const legacyDisplayName = (approver) => {
  const firstName = approver?.profile?.firstName || "";
  const lastName = approver?.profile?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || approver?.username || approver?.name || `User ${approver?.id}`;
};

const toDropdownItem = (approver) => ({
  label:
    approver?.name ||
    legacyDisplayName(approver) ||
    approver?.email ||
    `User ${approver?.id}`,
  value: String(approver?.id),
});

/**
 * Parses the raw parsed-JSON body of GET /api/leaves/approvers into
 * dropdown-ready { label, value } items, deduped by id.
 */
export function parseApproversPayload(payload) {
  const raw = payload?.data;
  if (!raw) return [];

  // Current split shape: { supervisors: [...], approvers: [...] }
  if (!Array.isArray(raw) && (Array.isArray(raw.supervisors) || Array.isArray(raw.approvers))) {
    const combined = [...(raw.supervisors || []), ...(raw.approvers || [])];
    const seen = new Set();
    return combined
      .filter((approver) => {
        if (!approver?.id || seen.has(approver.id)) return false;
        seen.add(approver.id);
        return true;
      })
      .map(toDropdownItem);
  }

  // Legacy flat-array shape
  if (Array.isArray(raw)) {
    return raw.filter((approver) => approver?.id != null).map(toDropdownItem);
  }

  return [];
}
