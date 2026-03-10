// config.js/constant.js
const DEV_SERVER_FRANCO = "http://192.168.100.8:5000";
const PROD_SERVER_CARLO = "https://biz-maya-namagembe.onrender.com";
const DEV_SERVER_NGROK = "https://acc5b2049424.ngrok-free.app";
export const WEBSITE_URL = "https://mybizbuddy.co";

export const API_BASE_URL = PROD_SERVER_CARLO;
// export const API_BASE_URL = DEV_SERVER_NGROK;

export const VERSION = "1.0.6";

// ---- Timekeeping: Clock-out deviation modal ----
// Minutes threshold for showing the modal (>= this many minutes after shift end AND
// >= this many minutes before the next shift start). Shown only to companies in the list below when met.
export const CLOCK_OUT_DEVIATION_THRESHOLD_MINUTES = 45;
// Company IDs that see the clock-out deviation modal (others never see it).
export const CLOCK_OUT_DEVIATION_COMPANY_IDS = ["cmb1rn4ks0001wqdx2nqth9ra"];
// Job titles that always clock out with punchType DRIVER_AIDE (no deviation modal).
export const DRIVER_AIDE_JOB_TITLES = [
  "Driver",
  "Aide",
  "Driver Supervisor",
  "Training Aide Supervisor",
  "Training Aide",
];

// Timekeeping schedule: timezone used to display shift start/end when the API does not provide shift.timeZone (e.g. "Asia/Manila").
export const DEFAULT_SHIFT_DISPLAY_TIMEZONE = "Asia/Manila";
