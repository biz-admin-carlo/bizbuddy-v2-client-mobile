# Location logging during a shift — implementation TODO

Work from [docs/requirements.md](requirements.md). Do the phases in order. Check a box only after that step runs.

The app is this repo (Expo, React Native). The API is the sibling `bizbuddy-server` repo. The `LocationBreadcrumb` table and the `Company.breadcrumbsEnabled` / `Company.breadcrumbIntervalMinutes` columns already exist. Do not add a migration and do not run `prisma db push`.

Leave the Employee Map alone. `layers.breadcrumbs` stays `null`.

## How to stay deployable

`breadcrumbsEnabled` defaults to `false`. Leave it false in every company until Phase 9 passes on a build that employees actually run.

- Phases 1–3 add fields and a write endpoint. Installed apps ignore unknown settings fields and never call the new route. Punch in and punch out stay as they are.
- Phases 4–8 teach the new app to read the switch. With the switch off, Time In and Time Out stay on today’s path.
- An old app build also stays on today’s path if someone turns the switch on early. It never reads the new fields. Turn the switch on only after the Phase 9 build is the one in use.
- Web is unchanged. The new gate and the sampler run on iOS and Android only.

Phase 5 changes native location permission, so it needs a new dev-client or store binary. Phases 1–4 are server and JS only.

---

## Phase 1 — Return the company switch

**Done when:** `GET /api/company-settings` includes `breadcrumbsEnabled` and `breadcrumbIntervalMinutes`. A value below 1 comes back as 5. Punch routes are unchanged.

**Deployable because:** the handler only adds two read-only fields. Existing clients ignore them.

### 1.1 Select the two columns

- [x] In `bizbuddy-server/src/controllers/Account/companySettingsController.js`, add the two fields to the `select` inside `getSettings`, next to the task-report fields.

```js
taskReportFormWindowHours:    true,
breadcrumbsEnabled:           true,
breadcrumbIntervalMinutes:    true,
```

- `taskReportFormWindowHours` is the last selected field today. The two new lines sit in that same `select`.
- `breadcrumbsEnabled` is the company switch. The column already exists.
- `breadcrumbIntervalMinutes` is the company’s interval in minutes. The column already exists.

### 1.2 Normalize the interval in the response

- [x] In the same function, after `formatted` is built and before `return res.json`, set a safe interval.

```js
formatted.breadcrumbsEnabled = company.breadcrumbsEnabled === true;
const interval = company.breadcrumbIntervalMinutes;
formatted.breadcrumbIntervalMinutes =
  Number.isInteger(interval) && interval >= 1 ? interval : 5;
```

- `=== true` makes the switch a real boolean. Any other stored value is treated as off, so a bad row cannot start tracking.
- `Number.isInteger` rejects `null`, decimals, and strings.
- `interval >= 1` rejects 0 and negatives. Those would mean “sample constantly.”
- The fallback `5` matches the column default in the PRD.

### 1.3 Keep the switch out of updates

- [x] In `updateSettings`, confirm `breadcrumbsEnabled` and `breadcrumbIntervalMinutes` are absent from the destructured body and from the `prisma.company.update` data.

**Security:** this endpoint is how an admin changes company settings. Leaving the two fields out of that data means a crafted body cannot turn tracking on or set the interval to 1. The database row stays the source of truth.

### 1.4 Checkpoint

- [ ] Sign in as an employee and `GET /api/company-settings`.
- [ ] The JSON `data` object contains `breadcrumbsEnabled: false` and `breadcrumbIntervalMinutes: 5` on a company that has never changed those columns.
- [ ] `POST /api/timelogs/time-in` and `time-out` still succeed with the same bodies as today.
- [ ] `PUT` company settings with `{ "breadcrumbsEnabled": true }` does not flip the column. Read the row back and confirm it is still false.

---

## Phase 2 — Ingest rules as pure functions

**Done when:** a Node test file covers batch shape, coordinates, the time window, and the mocked-location flag. No new HTTP route exists yet.

**Deployable because:** nothing imports the module from a route. The running server behaves as it does today.

### 2.1 Add the rule module

- [x] Create `bizbuddy-server/src/services/Locations/locationBreadcrumbRules.js`.

```js
const MAX_SAMPLES = 50;
const FUTURE_SKEW_MS = 2 * 60 * 1000;

function checkBatchShape(body) {
  const samples = body && body.samples;
  if (!Array.isArray(samples) || samples.length < 1) {
    return { error: { status: 400, message: "samples must contain 1 to 50 items.", code: "INVALID_SAMPLES" } };
  }
  if (samples.length > MAX_SAMPLES) {
    return { error: { status: 400, message: "samples must contain 1 to 50 items.", code: "TOO_MANY_SAMPLES" } };
  }
  return { samples };
}

function coordinateError(sample) {
  const lat = Number(sample && sample.latitude);
  const lng = Number(sample && sample.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Coordinates must be numbers.";
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return "Coordinates are out of range.";
  if (lat === 0 && lng === 0) return "Coordinates are unusable.";
  return null;
}

function classifySample(sample, log, now) {
  if (!sample || typeof sample.timeLogId !== "string" || sample.timeLogId.length > 64) {
    return { status: "rejected", reason: "Punch not found." };
  }
  if (!log) return { status: "rejected", reason: "Punch not found." };
  const coords = coordinateError(sample);
  if (coords) return { status: "rejected", reason: coords };
  if (typeof sample.recordedAt !== "string") {
    return { status: "rejected", reason: "recordedAt must be an ISO timestamp." };
  }
  const recordedMs = Date.parse(sample.recordedAt);
  if (!Number.isFinite(recordedMs)) {
    return { status: "rejected", reason: "recordedAt must be an ISO timestamp." };
  }
  if (recordedMs > now.getTime() + FUTURE_SKEW_MS) {
    return { status: "rejected", reason: "recordedAt is in the future." };
  }
  if (recordedMs < new Date(log.timeIn).getTime()) {
    return { status: "rejected", reason: "recordedAt is before clock-in." };
  }
  if (log.timeOut && recordedMs > new Date(log.timeOut).getTime()) {
    return { status: "rejected", reason: "recordedAt is after clock-out." };
  }
  return { status: "ok", recordedAt: new Date(recordedMs) };
}

function cleanSource(value) {
  if (value === "foreground" || value === "background") return value;
  return null;
}

module.exports = {
  MAX_SAMPLES,
  checkBatchShape,
  coordinateError,
  classifySample,
  cleanSource,
};
```

- `MAX_SAMPLES` is the PRD cap. One request cannot carry an unbounded list.
- `FUTURE_SKEW_MS` is the 2-minute clock skew. A phone clock a little ahead still counts.
- `checkBatchShape` rejects a missing body, a missing `samples`, an empty array, and a non-array. The long-array case uses `TOO_MANY_SAMPLES`, which the PRD names.
- `coordinateError` forces numbers, bounds them to a real lat/lng, and rejects 0,0. That point is a failed fix, the same rule the Employee Map already uses.
- `classifySample` starts with `timeLogId`. A number, object, or very long string never becomes a query value.
- A missing log is `rejected` with “Punch not found.” The HTTP layer uses that when the punch belongs to someone else, so the response does not reveal that the id exists.
- `recordedAt` must be a string that parses. Objects and numbers are rejected.
- The future check uses the server clock plus 2 minutes.
- An open punch has `timeOut` null, so the clock-out comparison is skipped.
- A closed punch rejects a sample taken after `timeOut`.
- `status: "ok"` carries a `Date` the insert will store. The raw string is not written.
- `cleanSource` keeps two known values. Any other string becomes null, so the column cannot hold a blob from the client.

### 2.2 Test the rules

- [x] Create `bizbuddy-server/tests/locationBreadcrumbRules.test.js`.

```js
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { checkBatchShape, classifySample, cleanSource } = require("../src/services/Locations/locationBreadcrumbRules");

const now = new Date("2026-11-20T12:00:00.000Z");
const openLog = { id: "log-1", timeIn: "2026-11-20T08:00:00.000Z", timeOut: null };

function sample(overrides) {
  return {
    timeLogId: "log-1",
    recordedAt: "2026-11-20T11:00:00.000Z",
    latitude: 14.55,
    longitude: 121.02,
    ...overrides,
  };
}

describe("locationBreadcrumbRules", () => {
  it("rejects an empty batch and a batch over 50", () => {
    assert.equal(checkBatchShape({ samples: [] }).error.code, "INVALID_SAMPLES");
    assert.equal(checkBatchShape({ samples: new Array(51).fill({}) }).error.code, "TOO_MANY_SAMPLES");
    assert.equal(checkBatchShape({ samples: [sample()] }).samples.length, 1);
  });

  it("rejects a bad point, a future time, a time before clock-in, and a foreign id shape", () => {
    assert.equal(classifySample(sample({ latitude: 0, longitude: 0 }), openLog, now).status, "rejected");
    assert.equal(classifySample(sample({ recordedAt: "2026-11-20T12:03:00.000Z" }), openLog, now).reason, "recordedAt is in the future.");
    assert.equal(classifySample(sample({ recordedAt: "2026-11-20T07:00:00.000Z" }), openLog, now).reason, "recordedAt is before clock-in.");
    assert.equal(classifySample(sample({ timeLogId: 12 }), openLog, now).reason, "Punch not found.");
  });

  it("accepts a sample during an open punch and stores a mocked flag decision separately", () => {
    const result = classifySample(sample(), openLog, now);
    assert.equal(result.status, "ok");
    assert.equal(result.recordedAt.toISOString(), "2026-11-20T11:00:00.000Z");
    assert.equal(cleanSource("background"), "background");
    assert.equal(cleanSource("spoofed"), null);
  });

  it("rejects a sample after clock-out", () => {
    const closed = { ...openLog, timeOut: "2026-11-20T10:00:00.000Z" };
    assert.equal(classifySample(sample(), closed, now).reason, "recordedAt is after clock-out.");
  });
});
```

- The test file uses `node:test`, same as `tests/punchTypeUtils.test.js`.
- `sample()` is one valid row. Each case overrides a single field.
- The empty batch and the 51-item batch lock the two error codes.
- 0,0, a stamp 3 minutes ahead, a stamp before `timeIn`, and a numeric id are the abuse cases.
- A clean sample returns `ok` and a real `Date`.
- `cleanSource` drops anything other than `foreground` or `background`.
- The closed-punch case uses a `timeOut` before the sample.

- [x] Register the file in the `test` script in `bizbuddy-server/package.json`, in the same space-separated list as the other test files.

```json
"test": "node --test tests/mobileDeviceLogin.test.js tests/clockInReminderWorker.test.js tests/punchTypeUtils.test.js tests/disbursementService.test.js tests/facePhoto.test.js tests/locationBreadcrumbRules.test.js"
```

- [x] Run `npm test` in `bizbuddy-server`. The new file passes. Existing tests still pass.

---

## Phase 3 — Authenticated ingest

**Done when:** `POST /api/timelogs/location-breadcrumbs` saves a row for the signed-in user’s own punch, skips an exact duplicate, and rejects everyone else’s punch. With the switch off, the route returns 403 and writes nothing.

**Deployable because:** no app calls this route yet. The switch defaults to off, so a stray call writes nothing. Time In and Time Out are untouched.

### 3.1 Save one classified batch

- [x] Create `bizbuddy-server/src/services/Locations/locationBreadcrumbService.js`.

```js
const crypto = require("crypto");
const { prisma } = require("@config/connection");
const { checkBatchShape, classifySample, cleanSource } = require("./locationBreadcrumbRules");

function optionalNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function saveBreadcrumbs(user, body) {
  const shaped = checkBatchShape(body);
  if (shaped.error) return shaped;

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { breadcrumbsEnabled: true },
  });
  if (!company || company.breadcrumbsEnabled !== true) {
    return { error: { status: 403, message: "Location logging is off for this company.", code: "BREADCRUMBS_DISABLED" } };
  }

  const ids = [...new Set(shaped.samples.map((s) => (s && typeof s.timeLogId === "string" ? s.timeLogId : null)).filter(Boolean))];
  const logs = ids.length
    ? await prisma.timeLog.findMany({
        where: { id: { in: ids }, userId: user.id },
        select: { id: true, timeIn: true, timeOut: true },
      })
    : [];
  const byId = new Map(logs.map((log) => [log.id, log]));
  const now = new Date();
  const results = [];

  for (const sample of shaped.samples) {
    const decision = classifySample(sample, byId.get(sample && sample.timeLogId), now);
    if (decision.status !== "ok") {
      results.push({ status: "rejected", reason: decision.reason });
      continue;
    }
    try {
      await prisma.locationBreadcrumb.create({
        data: {
          id: crypto.randomUUID(),
          companyId: user.companyId,
          userId: user.id,
          timeLogId: sample.timeLogId,
          recordedAt: decision.recordedAt,
          latitude: Number(sample.latitude),
          longitude: Number(sample.longitude),
          accuracy: optionalNumber(sample.accuracy),
          altitude: optionalNumber(sample.altitude),
          speed: optionalNumber(sample.speed),
          heading: optionalNumber(sample.heading),
          isMocked: sample.isMocked === true,
          source: cleanSource(sample.source),
        },
      });
      results.push({ status: "saved" });
    } catch (err) {
      if (err && err.code === "P2002") {
        results.push({ status: "duplicate" });
        continue;
      }
      throw err;
    }
  }

  return { results };
}

module.exports = { saveBreadcrumbs };
```

- `checkBatchShape` runs before any database read. A 51-item body never hits Prisma.
- The company read uses `user.companyId` from the token. The body has no say in which company is checked.
- `breadcrumbsEnabled !== true` fails closed, including a missing company row.
- The time-log query filters `userId: user.id`. Another employee’s punch id is not in `byId`, so `classifySample` returns “Punch not found.”
- `companyId` and `userId` on the new row come from `user`, which `authenticate` set. A `companyId` in the sample is ignored because it is never read.
- `crypto.randomUUID()` fills `LocationBreadcrumb.id`, which has no database default.
- `recordedAt` is the `Date` from Phase 2. `receivedAt` is left unset so Prisma applies `@default(now())`.
- `isMocked === true` stores true only for a real boolean. The string `"false"` stays false. A mocked fix is still saved. The PRD stores the flag and does not reject it. A modified client can still space forged timestamps at the company interval. The trail is what the phone reported.
- `batteryLevel` is omitted, so the column stays null.
- `P2002` is Prisma’s unique-constraint error. `(timeLogId, recordedAt)` already exists, so the result is `duplicate` and the loop continues.
- Any other database error is rethrown. The controller turns that into a 500 without the Prisma message.
- There is no transaction around the loop. A rejected sample does not roll back a sample already saved in the same batch.

### 3.2 Add the controller

- [x] Create `bizbuddy-server/src/controllers/Features/locationBreadcrumbController.js`.

```js
const { saveBreadcrumbs } = require("@services/Locations/locationBreadcrumbService");

const postLocationBreadcrumbs = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const outcome = await saveBreadcrumbs(req.user, req.body);
    if (outcome.error) {
      return res.status(outcome.error.status).json({
        message: outcome.error.message,
        code: outcome.error.code,
      });
    }
    return res.status(200).json({ data: { results: outcome.results } });
  } catch (err) {
    console.error("postLocationBreadcrumbs error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = { postLocationBreadcrumbs };
```

- `req.user` is set by `authenticate`. The extra `if` matches `timeIn` and returns 401 when it is missing.
- `outcome.error` covers 400 and 403 from the service. The client reads `code`.
- Success is 200 with `data.results` in the same order as `samples`.
- The 500 body is a fixed sentence. The Prisma or SQL text stays in the server log.

### 3.3 Mount the route

- [x] In `bizbuddy-server/src/routes/Features/timeLogRoutes.js`, import the controller and register the route directly under the `/time-in` line.

```js
const { postLocationBreadcrumbs } = require("@controllers/Features/locationBreadcrumbController");

router.post("/time-in", authenticate, blockSystemAgent, timeIn);
router.post("/location-breadcrumbs", authenticate, blockSystemAgent, postLocationBreadcrumbs);
```

- `authenticate` is the same middleware as every other punch route. A missing token is 401. A bad or expired token is rejected before the handler runs.
- `blockSystemAgent` keeps the system agent (B. Buddy) off this route, same as `/time-in`.
- The path is a fixed string, registered as `POST`, so it does not collide with `DELETE /:id`.

**Security:** do not add `authorizeRoles` that limits this to admins. The employee who owns the punch is the caller. Do not add a `GET` for supervisors. The Employee Map is out of scope.

### 3.4 Return collectUntil

`closeAt` is already computed in `bizbuddy-server/src/services/liveUserService.js` and stored on `LiveUser`. Clock-in today fires `createLiveUser` and does not wait for it.

- [x] In `timeIn`, await `createLiveUser`. If it throws, log the error and still return the punch. A `LiveUser` failure must not turn a successful clock-in into an error.
- [x] When the `LiveUser` row exists, add `collectUntil` to the time-in JSON. It is `closeAt` as an ISO string.

```js
let collectUntil = null;
try {
  await createLiveUser(userId, newTimeLog.id, actualTimeIn);
  const live = await prisma.liveUser.findUnique({
    where: { userId },
    select: { closeAt: true },
  });
  collectUntil = live && live.closeAt ? live.closeAt.toISOString() : null;
} catch (err) {
  console.error("createLiveUser failed:", err);
}
return res.status(201).json({
  message: "Time in recorded successfully.",
  data: { ...newTimeLog, collectUntil },
});
```

- `createLiveUser` stays the only writer of `closeAt`. This handler reads it back for the phone.
- `collectUntil` is null when the upsert did not leave a row. The phone then has no hard stop until a later active-log read finds one.
- Remove the old `createLiveUser(...).catch(() => {})` call so it is not started twice.

- [x] On `GET /api/timelogs/user`, for the open log (`status === true`), attach the same `collectUntil` from `LiveUser.closeAt` for `req.user.id`. A missing row leaves the field null.

### 3.5 Checkpoint

Use a real employee token and a punch that belongs to that employee. Set `breadcrumbsEnabled` true only on a dev company, then set it back to false before you leave this phase.

- [ ] No `Authorization` header returns 401.
- [ ] Switch off returns 403 and `code: "BREADCRUMBS_DISABLED"`. The `LocationBreadcrumb` table gains no row.
- [ ] Switch on, one valid sample, returns `{ data: { results: [{ status: "saved" }] } }`. The row’s `userId` and `companyId` match the token, not the body.
- [ ] The same body again returns `duplicate`. The table still has one row.
- [ ] A batch of one good sample and one 0,0 sample returns `saved` then `rejected`. The good row remains.
- [ ] Another user’s `timeLogId` returns `rejected` and writes nothing.
- [ ] 51 samples returns 400 and `TOO_MANY_SAMPLES`.
- [ ] `GET /api/employee-map` still has `layers.breadcrumbs: null`.
- [ ] A successful time-in JSON includes `collectUntil` when `LiveUser.closeAt` exists. Forcing `createLiveUser` to throw still returns the punch, with `collectUntil: null`.
- [ ] Set the dev company switch back to false.

---

## Phase 4 — The app reads the switch

**Done when:** the punch screen stores the switch and the interval. Time In still uses today’s location rules. No sample is sent.

**Deployable because:** the new values are only stored. No branch reads them yet.

### 4.1 Parse the fields

- [x] In `app/(tabs)/(shifts)/timekeeping-punch.jsx`, extend `parseCompanySettingsPunchFields` so it also returns the breadcrumb fields. Add this helper above that function.

```js
const resolveBreadcrumbInterval = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 5;
  return n;
};
```

- `Number.isInteger` after `Number(...)` rejects `"5"` only if you forget that `Number("5")` is the integer 5. `Number.isInteger(5)` is true, so a numeric JSON field passes.
- A missing field, `0`, or a decimal becomes 5, matching the server.

- [x] Add two refs beside `companySettingsTaskReportFormsRef`.

```js
const breadcrumbsEnabledRef = useRef(false);
const breadcrumbIntervalMinutesRef = useRef(5);
```

- `useRef` keeps the latest values for the punch handler without waiting on a re-render.
- The initial values match the fail-closed defaults.

- [x] Inside `fetchCompanySettingsForPunch`, after the task-report ref is set:

```js
breadcrumbsEnabledRef.current = raw.breadcrumbsEnabled === true;
breadcrumbIntervalMinutesRef.current = resolveBreadcrumbInterval(
  raw.breadcrumbIntervalMinutes,
);
```

- `=== true` means a missing field, from an older server, stays off.
- The interval ref always holds an integer of at least 1.

- [x] In the `catch` of that same function, reset both refs.

```js
breadcrumbsEnabledRef.current = false;
breadcrumbIntervalMinutesRef.current = 5;
```

**Security:** a failed settings request must not leave a previous company’s `true` in the ref. The catch runs on logout-sized failures and on a network error. Tracking stays off until a successful response says otherwise.

### 4.2 Checkpoint

- [ ] Open the punch screen against a server from Phase 1. Reload. Time In still works with the switch false.
- [ ] With the dev switch true, the refs update after refresh, and Time In still follows today’s rules. No request hits `/location-breadcrumbs`.
- [ ] Set the dev switch back to false.

---

## Phase 5 — Block clock-in until background location is allowed

**Done when:** on iOS and Android, with the switch on, Time In does not run until location services are on and background permission is granted. The explanation is on screen before the system prompt. With the switch off, Time In is unchanged. Web is unchanged.

**Deployable because:** production companies stay at `breadcrumbsEnabled: false`, so this gate does not run for them. This phase needs a new native binary before a device can show the new permission.

### 5.1 Replace the permission strings

- [x] In `app.json`, replace the iOS location strings. Add the Always-and-When-In-Use key. Add background location to the Android permission list.

```json
"NSLocationWhenInUseUsageDescription": "BizBuddy records your location during an open shift, at the interval your company set, including while you are using the app. Recording stops when you clock out.",
"NSLocationAlwaysAndWhenInUseUsageDescription": "BizBuddy records your location during an open shift, at the interval your company set, including while the app is in the background. Recording stops when you clock out.",
"NSLocationAlwaysUsageDescription": "BizBuddy records your location during an open shift, at the interval your company set, including while the app is in the background. Recording stops when you clock out."
```

```json
"permissions": [
  "ACCESS_FINE_LOCATION",
  "ACCESS_COARSE_LOCATION",
  "ACCESS_BACKGROUND_LOCATION",
  "RECEIVE_BOOT_COMPLETED",
  "VIBRATE",
  "WAKE_LOCK",
  "POST_NOTIFICATIONS",
  "CAMERA"
]
```

- The When-In-Use sentence no longer says location is read only at punch time. That sentence becomes false once sampling exists.
- `NSLocationAlwaysAndWhenInUseUsageDescription` is the string current iOS shows for Always.
- The older Always key stays so older iOS still has a true sentence.
- `ACCESS_BACKGROUND_LOCATION` is the Android permission behind “Allow all the time.”

- [x] Add the Expo location plugin to the `plugins` array in `app.json`.

```json
[
  "expo-location",
  {
    "locationWhenInUsePermission": "BizBuddy records your location during an open shift, at the interval your company set, including while you are using the app. Recording stops when you clock out.",
    "locationAlwaysAndWhenInUsePermission": "BizBuddy records your location during an open shift, at the interval your company set, including while the app is in the background. Recording stops when you clock out.",
    "locationAlwaysPermission": "BizBuddy records your location during an open shift, at the interval your company set, including while the app is in the background. Recording stops when you clock out.",
    "isIosBackgroundLocationEnabled": true,
    "isAndroidBackgroundLocationEnabled": true,
    "isAndroidForegroundServiceEnabled": true
  }
]
```

- The plugin writes the iOS background mode and the Android foreground-service location type into the native projects.
- `isAndroidForegroundServiceEnabled` is what lets Android keep a location task alive after the screen locks. The notification text is added in Phase 8.

- [x] Rebuild the dev client (`npx expo run:ios` or `npx expo run:android`). A Metro reload does not apply `app.json` permission changes.

### 5.2 Ask for background permission

- [x] Create `utils/breadcrumbPermission.js`.

```js
import { Platform } from "react-native";
import * as Location from "expo-location";

export async function readBreadcrumbPermission() {
  if (Platform.OS === "web") {
    return { ok: true, reason: null };
  }
  const services = await Location.hasServicesEnabledAsync();
  if (!services) {
    return { ok: false, reason: "services" };
  }
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  if (foreground.status !== "granted" || background.status !== "granted") {
    return { ok: false, reason: "permission" };
  }
  return { ok: true, reason: null };
}

export async function requestBreadcrumbPermission() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return readBreadcrumbPermission();
  }
  await Location.requestBackgroundPermissionsAsync();
  return readBreadcrumbPermission();
}
```

- Web returns `ok: true` immediately. The PRD leaves web clock-in unchanged, and a browser cannot grant Always.
- Services are checked first. Permission without a location radio still cannot produce a fix.
- Both foreground and background must be `granted`. “While using the app” is not enough for a shift that continues after the phone locks.
- `requestBreadcrumbPermission` asks for foreground first. Android shows the background prompt only after foreground is granted.
- The function returns the same `{ ok, reason }` shape the screen can render.

### 5.3 Explain, then prompt, then block Time In

- [x] On the punch screen, when `breadcrumbsEnabledRef.current` is true and `Platform.OS !== "web"`, show an amber card above the Time In button. Use the same amber classes as the “Past scheduled end” card (`bg-amber-50 border border-amber-200`). Copy:

> Your company records your location during an open shift, about every {interval} minutes, including while BizBuddy is in the background. Recording stops when you clock out. Allow location all the time to clock in.

- The card is the disclosure. It is on screen before any new system prompt.
- `{interval}` is `breadcrumbIntervalMinutesRef.current`.

- [x] At the start of `handlePunch`, after the existing location-restriction checks and only when the action is Time In (`isTimeIn` is false), the switch is on, and the platform is not web:

```js
if (!isTimeIn && breadcrumbsEnabledRef.current && Platform.OS !== "web") {
  let gate = await readBreadcrumbPermission();
  if (!gate.ok) {
    gate = await requestBreadcrumbPermission();
  }
  if (!gate.ok) {
    setLoading(false);
    Alert.alert(
      "Location required",
      gate.reason === "services"
        ? "Turn on location services to clock in."
        : "Allow location all the time. On iPhone, choose Always. On Android, choose Allow all the time.",
    );
    return;
  }
}
```

- The check runs only for Time In. Clock-out is not blocked when a sample was missed.
- The switch is read from the ref filled in Phase 4. False skips this whole block, so today’s Time In path runs.
- Web skips the block.
- `read` then `request` avoids a second prompt when Always is already granted.
- A denied result returns before `getPunchData` and before `POST /api/timelogs/time-in`.
- `setLoading(false)` matches the other early returns in `handlePunch`. If `setLoading(true)` has not run yet, move this block to just after `setLoading(true)` so the spinner cannot stick. Follow the surrounding early returns.

- [x] Apply the same Time In gate in the other clock-in submits: the early-clock-in Regular button, the Driver/Aide button, and the no-scheduled-shift confirm. Each of those posts to `/api/timelogs/time-in` around the success checks at `res.status === 200 || res.status === 201`.

**Security:** the assigned-site check stays where it is. This gate is additional. A location-restricted employee still has to be inside a site, and, when the switch is on, still has to grant background location.

### 5.4 Checkpoint

- [ ] Switch off: Time In works with no new alert, on a device and on web.
- [ ] Switch on, iOS or Android, location services off: Time In shows the services alert and sends no `/time-in`.
- [ ] Switch on, permission “while using” only: Time In shows the Always / Allow all the time alert and sends no `/time-in`.
- [ ] Switch on, Always granted: Time In reaches the server as it does today.
- [ ] Switch on, web: Time In is unchanged and shows no background-permission card.
- [ ] A location-restricted employee outside their site is still blocked when the switch is on.
- [ ] Set the dev switch back to false before shipping this binary to a company that has not agreed to tracking.

### 5.5 Store release note

This binary turns on background location. There is no boot receiver. A reboot resumes sampling the next time the employee opens the app.

- [ ] In App Store Connect, declare the background-location purpose with the same meaning as the in-app explanation in section 5.3: location is recorded during an open shift at the company interval, including in the background, and stops at clock-out.
- [ ] In Play Console, complete the background-location declaration and point it at that same in-app explanation, which is shown before the system prompt.

---

## Phase 6 — A separate on-device queue

**Done when:** samples can be stored, chunked, and removed based on server results. The queue is a different AsyncStorage key from the Pro punch queue. No sampler writes to it yet.

**Deployable because:** nothing enqueues a sample. Punch offline sync still uses `PENDING_ACTIONS_KEY`.

### 6.1 Queue helpers

- [x] Create `utils/locationBreadcrumbQueue.js`.

```js
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BREADCRUMB_QUEUE_KEY = "location-breadcrumb-queue";
export const BREADCRUMB_CHUNK = 50;

export async function readBreadcrumbQueue() {
  try {
    const raw = await AsyncStorage.getItem(BREADCRUMB_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeBreadcrumbQueue(queue) {
  await AsyncStorage.setItem(BREADCRUMB_QUEUE_KEY, JSON.stringify(queue));
}

export const BREADCRUMB_QUEUE_CAP = 500;

export async function enqueueBreadcrumb(sample) {
  const queue = await readBreadcrumbQueue();
  queue.push(sample);
  const mine = queue.filter((item) => item.userId === sample.userId);
  const others = queue.filter((item) => item.userId !== sample.userId);
  const capped = mine.length > BREADCRUMB_QUEUE_CAP
    ? mine.slice(mine.length - BREADCRUMB_QUEUE_CAP)
    : mine;
  await writeBreadcrumbQueue(others.concat(capped));
}

export function settleBreadcrumbChunk(queue, results) {
  const sent = queue.slice(0, results.length);
  const rest = queue.slice(results.length);
  const keep = [];
  sent.forEach((sample, index) => {
    const status = results[index] && results[index].status;
    if (status === "saved" || status === "duplicate" || status === "rejected") return;
    keep.push(sample);
  });
  return keep.concat(rest);
}
```

- `BREADCRUMB_QUEUE_KEY` is not `PENDING_ACTIONS_KEY`. A punch flush cannot delete these samples, and a breadcrumb flush cannot post them to `/time-in`.
- `read` returns `[]` for a missing key, bad JSON, or a non-array. A corrupt value cannot throw the punch screen open.
- `settleBreadcrumbChunk` assumes `results` describes the front of the queue, which is the chunk that was posted.
- `saved`, `duplicate`, and `rejected` leave the queue. Those three are final. A duplicate is already stored. A rejection will not become valid on retry.
- Any other status, including a missing result, stays in `keep` so a short response cannot drop samples the server did not answer.
- `rest` is the tail that was not in this request. It stays queued.
- A network failure must not call `settle`. The caller keeps the previous queue.

### 6.2 Test the settle rule

- [x] Create `utils/locationBreadcrumbQueue.test.js`.

```js
import { settleBreadcrumbChunk, BREADCRUMB_CHUNK } from "./locationBreadcrumbQueue";

test("drops saved, duplicate, and rejected samples and keeps the unsent tail", () => {
  const queue = [
    { recordedAt: "a" },
    { recordedAt: "b" },
    { recordedAt: "c" },
    { recordedAt: "d" },
  ];
  const results = [
    { status: "saved" },
    { status: "duplicate" },
    { status: "rejected" },
  ];
  const next = settleBreadcrumbChunk(queue, results);
  expect(next.map((item) => item.recordedAt)).toEqual(["d"]);
  expect(BREADCRUMB_CHUNK).toBe(50);
});

test("keeps a sample the server did not classify", () => {
  const queue = [{ recordedAt: "a" }, { recordedAt: "b" }];
  const next = settleBreadcrumbChunk(queue, [{ status: "saved" }]);
  expect(next.map((item) => item.recordedAt)).toEqual(["b"]);
});
```

- The first test is the mixed batch from the PRD: one bad sample does not block the others, and the fourth item was not in the request.
- The second test covers a short `results` array. The unanswered sample stays.
- [x] Run `npx jest utils/locationBreadcrumbQueue.test.js --watchAll=false`.

### 6.3 Upload every chunk for the signed-in user

- [x] Add `dropSamplesForUser` to `utils/locationBreadcrumbQueue.js`.

```js
export async function dropSamplesForUser(userId) {
  if (!userId) return;
  const queue = await readBreadcrumbQueue();
  await writeBreadcrumbQueue(queue.filter((sample) => sample.userId !== userId));
}
```

- Only that user’s rows are removed. Another account’s paused samples stay in the same array.

- [x] Add `utils/locationBreadcrumbUpload.js`.

```js
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config/constant";
import { getTokenUserId } from "./jwtTokenUtils";
import {
  BREADCRUMB_CHUNK,
  dropSamplesForUser,
  readBreadcrumbQueue,
  settleBreadcrumbChunk,
  writeBreadcrumbQueue,
} from "./locationBreadcrumbQueue";

export async function flushBreadcrumbQueue() {
  const token = await SecureStore.getItemAsync("token");
  const userId = getTokenUserId(token);
  if (!token || !userId) return { stopped: false };

  while (true) {
    const queue = await readBreadcrumbQueue();
    const ready = queue.filter(
      (sample) => sample.userId === userId && typeof sample.timeLogId === "string" && sample.timeLogId,
    );
    const rest = queue.filter((sample) => !(sample.userId === userId && sample.timeLogId));
    if (ready.length === 0) return { stopped: false };
    const chunk = ready.slice(0, BREADCRUMB_CHUNK);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/timelogs/location-breadcrumbs`,
        { samples: chunk },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const results = res.data && res.data.data && res.data.data.results;
      if (!Array.isArray(results)) return { stopped: false };
      const remainingReady = settleBreadcrumbChunk(ready, results);
      if (remainingReady.length >= ready.length) return { stopped: false };
      await writeBreadcrumbQueue(remainingReady.concat(rest));
    } catch (err) {
      const code = err && err.response && err.response.data && err.response.data.code;
      if (code === "BREADCRUMBS_DISABLED") {
        await dropSamplesForUser(userId);
        return { stopped: true };
      }
      return { stopped: false };
    }
  }
}
```

- The loop posts chunks of 50 until that user’s ready samples are gone or a request fails. A reconnect can drain a backlog after clock-out.
- Phase 9 calls `dropUnassignedAfter(userId, session.collectUntil)` at the top of this function, before the loop, so samples that never received a time log id are removed once `collectUntil` has passed.
- `ready` requires both a `timeLogId` and a `userId` equal to the token’s user. Another account’s rows stay in `rest`.
- Samples still waiting for a time log id stay in `rest` too.
- The token is sent only as the Bearer header. `companyId` and `userId` are not fields in the body. `userId` on the stored sample is for the queue, and `JSON.stringify` will include it. Strip it before posting:

```js
const samples = chunk.map(({ userId: _userId, ...sample }) => sample);
```

Use `samples` as the POST body. The server never reads a client `userId`.
- A missing `results` array leaves the queue untouched and ends the loop.
- `BREADCRUMBS_DISABLED` deletes only this user’s rows and tells the caller to stop.
- Any other error, including offline, returns `stopped: false` and does not write the queue.

- [x] In the punch screen’s existing `NetInfo` listener, after the punch-queue sync, call `flushBreadcrumbQueue()`. A failed punch sync must not skip that call.

**Security:** do not `console.log` the chunk. It is a trail of where the employee was.

### 6.4 Checkpoint

- [ ] Jest for `settleBreadcrumbChunk` passes.
- [ ] Call `flushBreadcrumbQueue` with an empty queue. It returns `{ stopped: false }` and does not throw.
- [ ] A queue of 51 ready samples for the signed-in user is sent as two requests. The second request carries the last sample.
- [ ] A `BREADCRUMBS_DISABLED` response removes that user’s rows and leaves a different `userId` in the queue.
- [ ] Confirm `PENDING_ACTIONS_KEY` is not read or written by the new files.

---

## Phase 7 — Sample while the punch screen is open

**Done when:** after a successful online clock-in, with the switch on and permission granted, the open punch screen records one fix per interval and flushes it. Clock-out stops the timer. A failed fix does not clock the employee out. Breaks do not stop the timer.

**Deployable because:** the timer starts only when the switch is on. Production stays off, so this code does not run there. The JS timer pauses when the app backgrounds. Phase 8 replaces it with the OS task. Leave the company switch off until Phase 9.

### 7.1 Remember the open punch

- [x] Create `utils/locationBreadcrumbSession.js`.

```js
import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "location-breadcrumb-session";

export async function saveBreadcrumbSession(session) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function readBreadcrumbSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearBreadcrumbSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}
```

- The session is `{ userId, timeLogId, intervalMinutes, lastRecordedAt, paused, collectUntil, clockOutQueued }`. `userId` comes from `getTokenUserId` in `utils/jwtTokenUtils.js` at clock-in. `timeLogId` may be null while an offline clock-in is still queued. Phase 9 fills it. `paused` is false while this employee is the signed-in user. Phase 9 sets it when they sign out or switch accounts. `collectUntil` is the ISO string from the time-in response, or null. `clockOutQueued` stays false until a Pro offline Time Out is stored.
- `lastRecordedAt` is how the sampler enforces “not more often than the interval,” even if a timer fires twice.
- `clear` runs on clock-out and when the server says logging is off. It does not delete the sample queue. The upload step still drains samples already taken.

### 7.2 Build a sample from a fix

- [x] Add this function to `utils/locationBreadcrumbQueue.js`.

```js
export function sampleFromFix(location, timeLogId, source) {
  const coords = location && location.coords;
  if (!coords) return null;
  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  return {
    timeLogId: timeLogId || null,
    recordedAt: new Date(location.timestamp || Date.now()).toISOString(),
    latitude,
    longitude,
    accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : undefined,
    altitude: Number.isFinite(Number(coords.altitude)) ? Number(coords.altitude) : undefined,
    speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : undefined,
    heading: Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : undefined,
    isMocked: location.mocked === true,
    source,
  };
}
```

- `coords` missing means the fix failed. The caller skips it. The punch stays open.
- 0,0 is dropped on the phone so it never becomes a rejected round trip.
- `location.timestamp` is the OS time of the fix. That becomes `recordedAt`. The app does not invent times for gaps.
- Optional fields are omitted with `undefined`, which `JSON.stringify` drops.
- `mocked === true` matches the server rule.
- `source` is `foreground` in this phase.

### 7.3 Take one sample and flush

- [x] Add `utils/locationBreadcrumbSampler.js`.

```js
import * as Location from "expo-location";
import { sampleFromFix, enqueueBreadcrumb } from "./locationBreadcrumbQueue";
import { readBreadcrumbSession, saveBreadcrumbSession, clearBreadcrumbSession } from "./locationBreadcrumbSession";
import { flushBreadcrumbQueue } from "./locationBreadcrumbUpload";

export async function captureBreadcrumb(source) {
  const session = await readBreadcrumbSession();
  if (!session || session.clockOutQueued) return;
  if (session.collectUntil && Date.now() > Date.parse(session.collectUntil)) {
    await clearBreadcrumbSession();
    return;
  }
  const intervalMs = session.intervalMinutes * 60 * 1000;
  if (session.lastRecordedAt && Date.now() - Date.parse(session.lastRecordedAt) < intervalMs) {
    return;
  }
  let fix = null;
  try {
    fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    fix = null;
  }
  if (!fix) return;
  const sample = sampleFromFix(fix, session.timeLogId, source);
  if (!sample) return;
  await enqueueBreadcrumb(sample);
  await saveBreadcrumbSession({ ...session, lastRecordedAt: sample.recordedAt });
  const flushed = await flushBreadcrumbQueue();
  if (flushed.stopped) await clearBreadcrumbSession();
}
```

- No session means the employee is not in a tracked punch. The function returns.
- The interval check is the throttle. A second call inside the window does not read the GPS.
- `Balanced` is one fix, not a continuous high-accuracy stream.
- A thrown GPS error becomes `fix = null`. The function returns. It does not call clock-out.
- The sample is queued before the upload, so a failed network still keeps it.
- `lastRecordedAt` updates only after a real sample is queued.
- `stopped` means the server returned `BREADCRUMBS_DISABLED`. The session is cleared so the timer’s next tick finds nothing to do. Phase 8 also stops the OS task here.
- `collectUntil` in the past clears the session and skips the fix. The punch on the server is already due to close.
- `clockOutQueued` skips the fix. Phase 9 sets that flag when a Pro offline Time Out is stored.
- `enqueueBreadcrumb` keeps at most 500 samples for that `userId` and drops the oldest. Other users’ rows stay.

### 7.4 Start and stop around clock-in and clock-out

- [x] After every successful online Time In (`res.status` 200 or 201, and `res.data.data.id`), call:

```js
await saveBreadcrumbSession({
  timeLogId: res.data.data.id,
  intervalMinutes: breadcrumbIntervalMinutesRef.current,
  lastRecordedAt: null,
  collectUntil: res.data.data.collectUntil || null,
  clockOutQueued: false,
  paused: false,
});
```

Do this in `handlePunch` and in each clock-in modal that posts `/time-in` (early Regular, early Driver/Aide, no scheduled shift).

- `res.data.data` is the time log `timeIn` returns. `id` is the server punch id the samples must carry.
- The session is written only after the server accepts the punch.

- [x] While `isTimeIn` is true and `breadcrumbsEnabledRef.current` is true and the platform is not web, run one interval timer on the punch screen.

```js
useEffect(() => {
  if (!isTimeIn || !breadcrumbsEnabledRef.current || Platform.OS === "web") return undefined;
  const minutes = breadcrumbIntervalMinutesRef.current;
  const timer = setInterval(() => {
    captureBreadcrumb("foreground");
  }, minutes * 60 * 1000);
  return () => clearInterval(timer);
}, [isTimeIn]);
```

- The effect follows the open punch. Clock-out sets `isTimeIn` false through `resetAllStates`, which clears the timer.
- Coffee and lunch do not change `isTimeIn`, so the timer keeps running through breaks.
- The cleanup clears the timer when the screen unmounts. Phase 8 moves the work to a task that survives that.

- [x] On every successful clock-out, call `clearBreadcrumbSession()` and `flushBreadcrumbQueue()`.

**Security:** start the session only with an id from the time-in response. Do not take a `timeLogId` from user input.

### 7.5 Checkpoint

Use a dev company with the switch on and a short interval (the column can be `1` for this test). Set it back to false and to `5` afterward.

- [ ] Clock in. Wait one interval. One `LocationBreadcrumb` exists for that `timeLogId`.
- [ ] Start a coffee break and wait another interval. A second row appears. The punch is still open.
- [ ] Airplane mode for one interval, then restore the network. The queued sample is stored, and a second flush does not add a duplicate.
- [ ] Clock out. The timer stops. No further rows appear for that punch.
- [ ] Kill GPS for one interval. The punch stays open. The next successful interval writes a row.
- [ ] Switch off: clock in and confirm no rows and no timer.

---

## Phase 8 — Keep sampling in the background

**Done when:** samples continue after the employee leaves the punch screen and after the phone locks, until clock-out or `collectUntil`. Relaunching the app while the punch is open resumes sampling. Android shows the ongoing notification when notification permission is granted. If that permission is denied, only the foreground timer runs. The always-on Phase 7 timer is gone when the OS task is running.

**Deployable because:** the OS task starts only when a session exists, and a session is written only when the switch is on. Leave the switch off in production until Phase 9.

### 8.1 Define the task at startup

- [x] Install `expo-task-manager` with `npx expo install expo-task-manager`.
- [x] Create `utils/locationBreadcrumbTask.js`. The task definition must sit at the top level of this module.

```js
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { sampleFromFix, enqueueBreadcrumb } from "./locationBreadcrumbQueue";
import { readBreadcrumbSession, saveBreadcrumbSession, clearBreadcrumbSession } from "./locationBreadcrumbSession";
import { flushBreadcrumbQueue } from "./locationBreadcrumbUpload";

export const BREADCRUMB_TASK = "bizbuddy-location-breadcrumbs";

async function stopTaskUpdates() {
  const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
  if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
}

TaskManager.defineTask(BREADCRUMB_TASK, async ({ data, error }) => {
  if (error) return;
  const session = await readBreadcrumbSession();
  if (!session || session.paused || session.clockOutQueued) return;
  if (session.collectUntil && Date.now() > Date.parse(session.collectUntil)) {
    await clearBreadcrumbSession();
    await stopTaskUpdates();
    return;
  }
  const locations = (data && data.locations) || [];
  const fix = locations[locations.length - 1];
  if (!fix) return;
  const intervalMs = session.intervalMinutes * 60 * 1000;
  if (session.lastRecordedAt && Date.now() - Date.parse(session.lastRecordedAt) < intervalMs) {
    return;
  }
  const sample = sampleFromFix(fix, session.timeLogId, "background");
  if (!sample) return;
  await enqueueBreadcrumb(sample);
  await saveBreadcrumbSession({ ...session, lastRecordedAt: sample.recordedAt });
  const flushed = await flushBreadcrumbQueue();
  if (flushed.stopped) {
    await clearBreadcrumbSession();
    const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
    if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
  }
});
```

- `defineTask` is not inside a React component. The OS calls this file later, possibly with no screen mounted.
- `error` from the OS ends the callback. The next delivery can try again. The punch is untouched.
- The newest fix in `data.locations` is the one that gets stored. Earlier fixes in the same batch are inside the same interval and are skipped.
- The same interval throttle as Phase 7 stops a fast OS callback from writing extra rows.
- `source` is `background`.
- `BREADCRUMBS_DISABLED` clears the session and stops the OS updates so the phone does not keep reading location after the company turns the switch off.

- [x] Import the module for its side effect at the top of `app/_layout.jsx`, next to the other startup imports.

```js
import "../utils/locationBreadcrumbTask";
```

- The root layout loads on every cold start, so the task is defined before a resume call can start it.

### 8.2 Start and stop the OS updates

- [x] Add `utils/locationBreadcrumbTracking.js`.

```js
import * as Location from "expo-location";
import { BREADCRUMB_TASK } from "./locationBreadcrumbTask";
import { readBreadcrumbSession, clearBreadcrumbSession } from "./locationBreadcrumbSession";
import { readBreadcrumbPermission } from "./breadcrumbPermission";

export async function startBreadcrumbTracking() {
  const session = await readBreadcrumbSession();
  if (!session || session.paused || session.clockOutQueued) return;
  const gate = await readBreadcrumbPermission();
  if (!gate.ok) return;
  const minutes = session.intervalMinutes;
  const already = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
  if (already) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
  await Location.startLocationUpdatesAsync(BREADCRUMB_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: minutes * 60 * 1000,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "BizBuddy",
      notificationBody: "Recording your location for this shift.",
      notificationColor: "#0f172a",
    },
  });
}

export async function stopBreadcrumbTracking() {
  await clearBreadcrumbSession();
  const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
  if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
}

export async function pauseBreadcrumbTracking() {
  const session = await readBreadcrumbSession();
  if (session) await saveBreadcrumbSession({ ...session, paused: true });
  const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
  if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
}
```

- `start` returns immediately when there is no session, the session is paused, a clock-out is queued, or location permission is gone. A revoked location permission pauses sampling and leaves the punch open.

- [x] Before `startLocationUpdatesAsync`, request notification permission with `expo-notifications` (`getPermissionsAsync`, then `requestPermissionsAsync`). `POST_NOTIFICATIONS` is already in `app.json`. If the status is not `granted` on Android, do not call `startLocationUpdatesAsync`. Keep the Phase 7 `setInterval` only in that case, while the punch screen is open, and show an amber card: “Background recording needs notifications. BizBuddy can record location while the app is open.” Clock-in is not blocked. When notification permission is granted, remove that timer and use the OS task only.
- `distanceInterval: 0` asks for a sample even when the employee has not moved.
- `pausesUpdatesAutomatically: false` keeps iOS from sleeping the stream while the employee is stationary.
- `timeInterval` is the company interval in milliseconds.
- Stopping and starting applies a new interval when company settings changed since the last start.
- The Android `foregroundService` text is the ongoing notification the OS requires.
- `showsBackgroundLocationIndicator` leaves the iOS location indicator visible during the shift.
- `stop` clears the session first, so a late task callback finds nothing to save, then stops the OS updates. Clock-out uses `stop`.
- `pause` keeps the session and the queue. It marks `paused` and stops location updates, which also removes the Android notification. Sign-out and account switch use `pause`.
- `startBreadcrumbTracking` returns without starting when `session.paused` is true, and when `session.userId` is not the signed-in user from `getTokenUserId`. The task callback does the same check before it writes a sample.

- [x] Replace the Phase 7 `setInterval` effect with a start/stop effect.

```js
useEffect(() => {
  if (!isTimeIn || !breadcrumbsEnabledRef.current || Platform.OS === "web") return undefined;
  startBreadcrumbTracking();
  return undefined;
}, [isTimeIn]);
```

- The screen no longer runs its own timer when the OS task starts. The timer remains only for the Android notification-denied case above.
- In the existing `timeLogUpdated` listener, treat `data.type === "autoClockOut"` the same as `timeOut`: call `resetAllStates()` and `stopBreadcrumbTracking()`. The server already emits that type from `autoClockOutJob.js`. The socket is connected only while the punch screen is running, so `collectUntil` is what stops a locked phone.
- Removing the effect on clock-out is not enough. Call `stopBreadcrumbTracking()` in the same clock-out success paths that called `clearBreadcrumbSession()` in Phase 7. `stopBreadcrumbTracking` clears the session itself.

- [x] On punch-screen focus and when `AppState` becomes `active`, if `isTimeIn` is true, the switch is on, and permission is granted, call `startBreadcrumbTracking()`. If the active log fetch finds no open punch, call `stopBreadcrumbTracking()`.

- That resume path covers a relaunch. `fetchAndSyncActiveTimelog` already runs on focus and on `active`. After it finds `activeLog`, save the session when one is missing:

```js
await saveBreadcrumbSession({
  timeLogId: activeLog.id,
  intervalMinutes: breadcrumbIntervalMinutesRef.current,
  lastRecordedAt: null,
  collectUntil: activeLog.collectUntil || null,
  clockOutQueued: false,
  paused: false,
});
await startBreadcrumbTracking();
```

- Use the existing session’s `lastRecordedAt` when a session for that same `timeLogId` is already stored, so a resume does not immediately take an extra sample.
- If that session has `clockOutQueued: true`, leave it and do not call `startBreadcrumbTracking`. The server punch can still look open until the queued clock-out syncs.
- `activeLog.id` comes from `GET /api/timelogs/user`, which returns the signed-in user’s logs.

### 8.3 Checkpoint

- [ ] Clock in, leave the punch screen, lock the phone, wait one interval. A new row is stored with `source: "background"`.
- [ ] Android shows the notification “Recording your location for this shift.”
- [ ] Clock out. The notification goes away. A further interval writes no row.
- [ ] Force-quit the app while clocked in, reopen it, wait one interval. Sampling resumes for the same `timeLogId`.
- [ ] Revoke Always permission during the shift. The punch stays open. Restoring Always and opening the app resumes sampling.
- [ ] The next clock-in with permission still revoked is blocked by Phase 5.
- [ ] With notification permission granted, the Phase 7 `setInterval` is gone. Two collectors must not both be writing. With notifications denied, only that timer runs, clock-in still succeeds, and the amber warning is visible.

---

## Phase 9 — Offline clock-in, and the acceptance pass

**Done when:** samples taken before an offline clock-in receives a server id are sent with that id once the punch syncs. A queued offline clock-out stops sampling immediately. A disabled switch stops tracking and deletes only that user’s samples. An expired token pauses tracking. Every acceptance point in the PRD has been tried. The dev company switch is false again unless you are turning it on for a company whose employees run this build.

**Deployable because:** this phase finishes the behavior the switch gates. Shipping it with the switch still false changes nothing for current companies. Turn a company on only after the checks below pass on that build.

### 9.1 Attach the id when a queued clock-in syncs

- [x] Add this to `utils/locationBreadcrumbQueue.js`. This is the only version of the function. It stamps the new id only onto samples that have no `timeLogId` and whose `userId` equals the signed-in user.

```js
export async function assignBreadcrumbTimeLogId(timeLogId, userId) {
  if (typeof timeLogId !== "string" || !timeLogId || !userId) return;
  const queue = await readBreadcrumbQueue();
  const next = queue.map((sample) =>
    !sample.timeLogId && sample.userId === userId
      ? { ...sample, timeLogId }
      : sample,
  );
  await writeBreadcrumbQueue(next);
}
```

- Samples that already have an id are left alone. Samples waiting from this user’s offline punch receive the id just created.
- Another account’s waiting samples keep their empty `timeLogId`.
- A non-string id is ignored.

- [x] In the offline punch sync inside `timekeeping-punch.jsx` (the `NetInfo` listener that posts `pending` actions to `/api/timelogs`), keep the response:

```js
const res = await axios.post(url, action.payload, {
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
});
if (action.endpoint === "/time-in" && res.data && res.data.data && res.data.data.id) {
  await assignBreadcrumbTimeLogId(res.data.data.id, getTokenUserId(token));
  const session = await readBreadcrumbSession();
  if (session && !session.timeLogId) {
    await saveBreadcrumbSession({ ...session, timeLogId: res.data.data.id });
  }
  await flushBreadcrumbQueue();
}
```

- This runs only after axios resolves, which means the clock-in was accepted.
- The existing loop still clears the punch queue on its own terms. Do not point that queue at the breadcrumb key.
- `flushBreadcrumbQueue` then sends the samples that were waiting.

- [x] When Time In is stored offline because the plan is Pro, still call `saveBreadcrumbSession` with `timeLogId: null` and start tracking if the switch is on and permission is granted. `captureBreadcrumb` / the task already queue those samples with a null id. They wait until this sync fills the id.

- [x] Where a Pro Time Out is stored in the offline punch queue, set `clockOutQueued: true` on that user’s session and stop location updates. Do not clear the sample queue and do not call `clearBreadcrumbSession`.

```js
const session = await readBreadcrumbSession(userId);
if (session) await saveBreadcrumbSession({ ...session, clockOutQueued: true });
const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
```

- Sampling stops at the moment the clock-out is queued. Samples already taken stay for the flush.
- The resume path in Phase 8 sees `clockOutQueued` and leaves tracking off while that punch action is still pending.
- When the queued `/time-out` sync succeeds, call `stopBreadcrumbTracking()` for that user so the session is removed.

- [x] After `collectUntil`, drop samples that still have no `timeLogId`. Run this at the start of `flushBreadcrumbQueue` and when the task hits `collectUntil`.

```js
export async function dropUnassignedAfter(userId, collectUntil) {
  if (!userId || !collectUntil || Date.now() <= Date.parse(collectUntil)) return;
  const queue = await readBreadcrumbQueue();
  await writeBreadcrumbQueue(
    queue.filter((sample) => sample.userId !== userId || sample.timeLogId),
  );
}
```

### 9.2 Stop when settings say off

- [x] After a successful `fetchCompanySettingsForPunch`, if `breadcrumbsEnabledRef.current` is false, call `stopBreadcrumbTracking()` and `dropSamplesForUser(userId)` for the signed-in user. Do not call `writeBreadcrumbQueue([])`.

- The next settings load is the moment an in-shift change reaches the phone.
- Only that user’s unsent samples are deleted. Another account’s rows stay.
- The server remains the authority. A phone that misses this refresh still gets `BREADCRUMBS_DISABLED` from Phase 6, which uses the same per-user delete, and stops inside the task.

### 9.3 Pause on sign-out and account switch

- [x] Store `userId` from `getTokenUserId(token)` on the session at every `saveBreadcrumbSession` call, and on each queued sample inside `sampleFromFix`. Read the token from SecureStore at that moment.

```js
import { getTokenUserId } from "./jwtTokenUtils";

const token = await SecureStore.getItemAsync("token");
const userId = getTokenUserId(token);
```

- `userId` is the id inside the login JWT. The sample does not send it to the server. The queue uses it to decide which account may upload the row.
- A sample with no `userId` stays in the queue and is not posted.

- Phase 6 already posts only samples whose `userId` matches the token. Phase 9.1 is the only `assignBreadcrumbTimeLogId`.

- [x] Call `await pauseBreadcrumbTracking()` at the start of `logout` and `forceLogout` in `store/useAuthStore.js`, before `SecureStore.deleteItemAsync("token")`. The user id has to be read while the token is still stored.

- [x] In `loadToken` in `store/useAuthStore.js`, when the stored token is missing or `isTokenExpired(token)` is true, call `await pauseBreadcrumbTracking()` before `SecureStore.deleteItemAsync("token")`. `getTokenUserId` can still read an expired token. If that returns null, stop location updates anyway:

```js
const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
```

- [x] Call `await pauseBreadcrumbTracking()` at the start of `switchToAccount` in `hooks/useAccountSwitcher.js`, before `login(account.token, ...)`.

- Pause stops the location task and sets `paused: true`. It does not call `clearBreadcrumbSession` and it does not empty the queue.
- The next account’s punch screen must not call `startBreadcrumbTracking` for a session whose `userId` is someone else. When that next account has their own open punch, write a session for their `userId`. Keep the paused session. One AsyncStorage object keyed by user id holds both:

```js
{ [userId]: { userId, timeLogId, intervalMinutes, lastRecordedAt, paused, collectUntil, clockOutQueued } }
```

- `readBreadcrumbSession` takes the signed-in user id and returns that user’s entry. `saveBreadcrumbSession` merges into the map. `clearBreadcrumbSession` deletes only that user’s entry. Replace the Phase 8 `pauseBreadcrumbTracking` with this version:

```js
export async function pauseBreadcrumbTracking() {
  const token = await SecureStore.getItemAsync("token");
  const userId = getTokenUserId(token);
  const session = userId ? await readBreadcrumbSession(userId) : null;
  if (session) await saveBreadcrumbSession({ ...session, paused: true });
  const started = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK);
  if (started) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK);
}
```

- `paused: true` is stored on that user’s entry. The queue is left as it is.
- Location updates stop, so the Android notification goes away with them.

- [x] When the punch screen loads for a signed-in user whose stored session has `paused: true`, the same `timeLogId` is still the open punch, `clockOutQueued` is false, the switch is on, and permission stands, set `paused` back to false and call `startBreadcrumbTracking()`, then `flushBreadcrumbQueue()`. Leave a `clockOutQueued` session paused.

- Signing back in is what resumes the trail. Opening the app while signed out does not.
- Clock-out still uses `stopBreadcrumbTracking`, which removes that user’s session.

### 9.4 Acceptance pass

Run these on a dev company. Use interval `1` only during the pass, then restore `5`.

- [ ] Switch off. Time In and Time Out match today’s behavior. No sample request is sent. Web matches today’s behavior.
- [ ] Switch on, services off, or background permission missing. Time In does not proceed. The disclosure card is visible, and the alert tells the employee how to allow Always / Allow all the time.
- [ ] Switch on, permission granted. Clock in. Samples arrive about every interval, and not more often. `breadcrumbIntervalMinutes` of `0` on the row is treated as 5 by the settings response.
- [ ] A coffee break and a lunch break each still produce samples.
- [ ] Leaving the screen and locking the phone still produces samples until clock-out.
- [ ] Clock-out stops the task and clears that user’s session. Relaunch while still clocked in resumes it.
- [ ] Sign out while clocked in. The notification goes away and another interval writes no row. Sign back in as the same employee while the punch is still open. Sampling resumes, and samples taken before sign-out are sent under that employee.
- [ ] Switch to another account while clocked in. Sampling pauses. The other account’s clock-in does not receive the first employee’s unsent samples, and a flush uses only the signed-in user’s rows. Switch back. Sampling resumes for the original punch.
- [ ] A failed fix leaves the employee clocked in. The next interval can succeed.
- [ ] Each saved row is one `LocationBreadcrumb` for that user, company, and time log, with the fix’s `recordedAt`. Posting it again returns `duplicate` and does not add a row.
- [ ] Airplane mode keeps samples on the device. Restoring the network stores them. A failed request leaves them queued.
- [ ] One unusable coordinate in a batch is `rejected` and leaves the queue. The valid sample in that batch is `saved`.
- [ ] Turning the switch off returns 403 on the next flush. The app stops the task and deletes only the signed-in user’s unsent samples. The other account’s rows remain.
- [ ] A Pro offline Time Out stops location updates immediately. Sampling stays off while that clock-out is still in the punch queue. Samples already taken upload when the network returns.
- [ ] With the phone locked, sampling stops once the clock passes `collectUntil`. An `autoClockOut` socket event stops it sooner while the punch screen is connected.
- [ ] More than 50 queued samples drain in successive chunks after the network returns, including after clock-out.
- [ ] An expired token on cold start pauses sampling before the token is deleted.
- [ ] Denying Android notifications still allows clock-in, shows the background-recording warning, and samples only while the app is open.
- [ ] The 501st sample for one user drops that user’s oldest queued sample. Samples with no time log id are dropped after `collectUntil`.
- [ ] `GET /api/company-settings` includes both fields. `GET /api/employee-map` still returns `layers.breadcrumbs: null`.
- [ ] A location-restricted employee outside an assigned site still cannot punch, and with the switch on they also need background permission.
- [ ] An offline Pro clock-in followed by samples, then a network return, stores those samples under the new time log id.
- [ ] A request with a different user’s `timeLogId`, a `companyId` in the body, and 51 samples does not write a row for the other user, does not take the body’s company id, and returns `TOO_MANY_SAMPLES` for the long batch.
- [ ] Set `breadcrumbsEnabled` back to false on the dev company, and set the interval back to 5, unless this build is ready for a company that should actually track.
