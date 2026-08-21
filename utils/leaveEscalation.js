// utils/leaveEscalation.js
//
// Support for the leave two-step escalation feature ("escalate to another
// supervisor"), backed by bizbuddy-server's existing (previously unwired)
// PUT /api/leaves/:id/approve { escalateTo, approverComments } contract.
//
// There's no dedicated "escalation targets" endpoint on the server — valid
// targets are any active admin/supervisor/superadmin in the company, company
// -wide (no department restriction), matching the server's own validation in
// leaveController.js's approveLeave escalate branch. We reuse the already
// admin/supervisor/superadmin-authorized GET /api/employee endpoint (the same
// one manage-departments.jsx uses to build its supervisor picker) and filter
// client-side to mirror that validation.

import { API_BASE_URL } from "../config/constant";

const ESCALATION_ROLES = ["admin", "supervisor", "superadmin"];

const ROLE_LABELS = {
  admin: "Admin",
  supervisor: "Supervisor",
  superadmin: "Super Admin",
};

const displayName = (user) => {
  const firstName = user?.profile?.firstName || "";
  const lastName = user?.profile?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || user?.username || user?.email || `User ${user?.id}`;
};

/**
 * Reads GET /api/company-settings and returns whether two-step leave
 * approval is enabled for the caller's company. Defaults to false on any
 * error so the Escalate action simply stays hidden rather than throwing.
 */
export async function fetchMultiApprovalEnabled(token) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/company-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return !!(res.ok && data?.data?.multiApprovalEnabled);
  } catch (error) {
    console.error("fetchMultiApprovalEnabled:", error);
    return false;
  }
}

/**
 * Builds a { [userId]: displayName } lookup for every user in the caller's
 * company. Used entirely client-side to show a human-readable name for a
 * leave's secondaryApproverId/escalatedByUserId — the server only returns
 * those as raw ids on this endpoint, with no joined name.
 */
export async function fetchEmployeeDirectory(token) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/employee`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.data)) return {};

    return Object.fromEntries(
      data.data
        .filter((user) => user?.id != null)
        .map((user) => [String(user.id), displayName(user)]),
    );
  } catch (error) {
    console.error("fetchEmployeeDirectory:", error);
    return {};
  }
}

/**
 * Builds the escalation-target dropdown list: active admins, supervisors,
 * and superadmins in the caller's company, excluding the given user ids
 * (typically the acting approver and the leave requester).
 */
export async function fetchEscalationTargets(token, { excludeUserIds = [] } = {}) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/employee`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.data)) return [];

    const excluded = new Set(
      excludeUserIds.filter((id) => id != null).map((id) => String(id)),
    );

    return data.data
      .filter((user) => {
        const role = String(user?.role ?? "").toLowerCase();
        const status = String(user?.status ?? "active").toLowerCase();
        return (
          ESCALATION_ROLES.includes(role) &&
          status === "active" &&
          !excluded.has(String(user?.id))
        );
      })
      .map((user) => {
        const role = String(user.role).toLowerCase();
        return {
          label: `${displayName(user)} (${ROLE_LABELS[role] || user.role})`,
          value: String(user.id),
        };
      });
  } catch (error) {
    console.error("fetchEscalationTargets:", error);
    return [];
  }
}
