// config.js/constant.js
const DEV_SERVER_FRANCO = "http://192.168.100.8:5000";
const PROD_SERVER_CARLO = "https://biz-maya-namagembe.onrender.com";
const DEV_SERVER_NGROK = "https://acc5b2049424.ngrok-free.app";
export const WEBSITE_URL = "https://mybizbuddy.co";

/** In-app feedback form sends mail to this address via the device mail app. */
export const FEEDBACK_EMAIL = "bizmobiledevelopment@gmail.com";

export const API_BASE_URL = PROD_SERVER_CARLO;
// export const API_BASE_URL = DEV_SERVER_NGROK;

/** GET — list current user’s requested punch logs. */
export const REQUEST_PUNCH_LOG_MY_REQUESTS_PATH = "/api/request-punch-log/my-requests";

/** POST — submit a requested punch log (requestedDate YYYY-MM-DD; clock fields naive local YYYY-MM-DDTHH:mm). */
export const REQUEST_PUNCH_LOG_SUBMIT_PATH = "/api/request-punch-log/submit";

/** POST — contest an existing time log (corrected clock-in/out as UTC ISO with Z). */
export const CONTEST_POLICY_SUBMIT_PATH = "/api/contest-policy/submit";

/** GET — list current user's time log contests (if enabled on API). */
export const CONTEST_POLICY_MY_REQUESTS_PATH = "/api/contest-policy/my-requests";

export const VERSION = "1.0.26";

// ---- Timekeeping: deviation thresholds ----
// Clock-out: minutes after shift end AND before next start (companies in CLOCK_OUT_DEVIATION_COMPANY_IDS).
// Clock-in early modal: fallback only when GET /api/company-settings cannot supply driverAideThresholdMinutes.
export const CLOCK_OUT_DEVIATION_THRESHOLD_MINUTES = 45;
// Company IDs that use the clock-out deviation and driver/aide clock-in modal logic.
export const CLOCK_OUT_DEVIATION_COMPANY_IDS = [
  "cmb1rn4ks0001wqdx2nqth9ra",
  "cmnegwuxm0004rf7fzo6wjrw2",
];
// Set to true to always show the "no scheduled shift" clock-in modal (timekeeping punch, online flow).
export const DEMO_FORCE_NO_SCHEDULED_SHIFT_CLOCK_IN_MODAL = false;
// Clock-in: treat user as having a schedule only if in an active shift or next shift starts within this many minutes (e.g. weekend gap before Mon–Fri).
export const NO_SCHEDULE_SHIFT_LOOKAHEAD_MINUTES = 12 * 60;

/** Punch types offered when clocking in without a scheduled shift (no-schedule modal). */
export const TIME_IN_PUNCH_TYPE_OPTIONS = [
  { value: "REGULAR", label: "Regular" },
  { value: "DRIVER_AIDE", label: "Driver / Aide" },
  { value: "DRIVER_AIDE_AM", label: "Driver / Aide (AM)" },
  { value: "DRIVER_AIDE_PM", label: "Driver / Aide (PM)" },
  { value: "TRAINING", label: "Training" },
];

/**
 * Reason options for Request punch log (matches web PunchLogs request dialog).
 * Values are snake_case strings stored in RequestedTimeLog.reason (no server enum).
 */
export const REQUEST_PUNCH_LOG_REASON_OPTIONS = [
  { value: "forgot_to_clock", label: "Forgot To Clock" },
  { value: "system_malfunction", label: "System Malfunction" },
  { value: "network_issues", label: "Network Issues" },
  { value: "emergency", label: "Emergency" },
  { value: "remote_work", label: "Remote Work" },
  { value: "power_outage", label: "Power Outage" },
  { value: "meeting_offsite", label: "Meeting Offsite" },
  { value: "other", label: "Other" },
];

/**
 * Shift type options for Request punch log UI (DayCare companies only).
 * Maps to server PunchType enum values; current request API ignores this field.
 */
export const REQUEST_PUNCH_LOG_SHIFT_TYPE_OPTIONS = [
  { value: "REGULAR", label: "Regular" },
  { value: "DRIVER_AIDE", label: "Full Day (AM + Regular + PM)" },
  { value: "DRIVER_AIDE_AM", label: "AM only" },
  { value: "DRIVER_AIDE_PM", label: "PM only" },
];

// Job titles that always clock out with punchType DRIVER_AIDE (no deviation modal).
export const DRIVER_AIDE_JOB_TITLES = [
  "Driver",
  "Aide",
  "Driver Supervisor",
  "Training Aide Supervisor",
  "Training Aide",
];

// Timekeeping schedule: timezone used to display shift start/end when the API does not provide shift.timeZone (e.g. "Asia/Manila").
export const DEFAULT_SHIFT_DISPLAY_TIMEZONE = "America/Los_Angeles";
