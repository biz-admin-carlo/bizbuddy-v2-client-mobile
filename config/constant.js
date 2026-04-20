// config.js/constant.js
const DEV_SERVER_FRANCO = "http://192.168.100.8:5000";
const PROD_SERVER_CARLO = "https://biz-maya-namagembe.onrender.com";
const DEV_SERVER_NGROK = "https://acc5b2049424.ngrok-free.app";
export const WEBSITE_URL = "https://mybizbuddy.co";

/** In-app feedback form sends mail to this address via the device mail app. */
export const FEEDBACK_EMAIL = "bizmobiledevelopment@gmail.com";

export const API_BASE_URL = PROD_SERVER_CARLO;
// export const API_BASE_URL = DEV_SERVER_NGROK;

export const VERSION = "1.0.14";

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
