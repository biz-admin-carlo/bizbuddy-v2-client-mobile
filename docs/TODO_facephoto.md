# TODO: Face photo on clock-in and clock-out

Source spec: [requirements_facephoto.md](requirements_facephoto.md). Server contract: `bizbuddy-server/docs/mobile-update-BB-143-handover.md` sections 1 and 2.

How to read this file:

- Phases are in order. Finish one before starting the next.
- Every phase ends in a state you can ship. Companies without face capture see no change until Phase 4, and even then only when the switch is on.
- Code blocks are small on purpose. The bullets under each block explain it line by line.
- Run unit tests with `npx jest <file>`. The `npm test` script uses `--watchAll`, which never exits.

Where the punch flow funnels today (the hooks this plan uses):

| Path | Function in `app/(tabs)/(shifts)/timekeeping-punch.jsx` |
|---|---|
| Every online clock-in, including the early clock-in and no-schedule sheets | `submitOnlineTimeInRef.current` |
| Every online clock-out, including the deviation and confirm sheets | `beginClockOut(payload)` |
| Clock-out after the end-of-shift form | `submitTaskReportClockOut` |
| Pro offline punch | the `!wifiConnected` branch in `handlePunch` + the `NetInfo` flush |

---

## Phase 0. Baseline

- [ ] Pull the latest `main`, then run `npx jest utils` and confirm the existing tests pass.
- [ ] Run `npm run ios` (and Android once). Clock in and clock out on a dev company with face capture **off**. Write down what you see so you can compare later.
- [ ] Ask the web admin for a dev company where you can switch **Clock-Out Documentation → Custom forms → Face capture** and **also at clock-in** on and off. Every checkpoint below needs it.
- [ ] Confirm the camera works on **Android** before building anything on it. The checked-in manifest has no `CAMERA` line, even though `app.json` lists it.

```bash
rg "CAMERA" android/app/src/main/AndroidManifest.xml
npm run android
```

- The `rg` line shows whether the permission is declared directly. Today it prints nothing.
- On the device, open an end-of-shift form that has the existing face check, and tap **Allow camera**.
- If the system prompt appears and a photo can be taken, the permission is coming from the `expo-camera` library manifest. Nothing to change.
- If the prompt never appears, add this inside `<manifest>` in `android/app/src/main/AndroidManifest.xml`, then rebuild:

```xml
  <uses-permission android:name="android.permission.CAMERA"/>
```

- Only `CAMERA` is added. The app records no video, so `RECORD_AUDIO` isn't needed.

**Security:** don't touch session, token, or biometric code anywhere in this project. The handover says that area is under investigation.

---

## Phase 1. Send `deviceId` on every clock-in and clock-out

The smallest change, and it ships alone. The server accepts it today and never refuses a punch because of it.

### 1.1 Pure body helpers

- [ ] Create `utils/punchBody.js`.

```js
const PUNCH_KEYS = [
  "localTimestamp",
  "location",
  "deviceInfo",
  "punchType",
  "reason",
  "remarks",
];
```

- The only fields a punch body may carry. Anything else is dropped.
- Today's clock-out payload also holds `token` and `afterSuccess`. This list stops them from being sent in a request body.

```js
export function pickPunchBody(payload) {
  const out = {};
  for (const key of PUNCH_KEYS) {
    if (payload?.[key] !== undefined) out[key] = payload[key];
  }
  return out;
}
```

- Builds a new object, so the caller's payload is never changed.
- `payload?.[key]` tolerates a `null` payload.
- `undefined` fields are skipped. `null` is kept, because `location: { latitude: null }` is a real value today.

```js
export function withDeviceId(body, deviceId) {
  const next = { ...body };
  delete next.deviceId;
  if (next.deviceInfo && typeof next.deviceInfo === "object") {
    const { proof, ...rest } = next.deviceInfo;
    next.deviceInfo = rest;
  }
  if (deviceId) next.deviceId = deviceId;
  return next;
}
```

- `{ ...body }` copies, so the input is untouched.
- `delete next.deviceId` removes any stale value so only the argument decides.
- The `proof` key is stripped from `deviceInfo`. The server writes its own and the handover says never to send one.
- `if (deviceId)` leaves the field out when there is no id. Never send `"unknown"` or `""`.
- The id sits at the **top level**, not inside `deviceInfo`.

### 1.2 Read the install id

- [ ] Create `utils/punchRequest.js`.

```js
import { getInstallationId } from "./deviceId";

export async function readPunchDeviceId() {
  try {
    const id = String((await getInstallationId()) ?? "").trim();
    return id || null;
  } catch {
    return null;
  }
}
```

- `getInstallationId()` is the same helper sign-in uses, so the value matches `POST /api/account/login` exactly.
- `.trim()` and `|| null` turn an empty value into "no id".
- A SecureStore failure returns `null`. The punch goes ahead without the field rather than failing.

**Security:** don't add a `devLog` that prints this id next to the auth token. Log `hasDeviceId: Boolean(id)` if you need a trace.

### 1.3 Unit tests

- [ ] Create `utils/punchBody.test.js`.

```js
import { pickPunchBody, withDeviceId } from "./punchBody";

test("keeps punch fields and drops token and callbacks", () => {
  const body = pickPunchBody({
    localTimestamp: "t",
    location: { latitude: 1, longitude: 2 },
    token: "secret",
    afterSuccess: () => {},
  });
  expect(body).toEqual({ localTimestamp: "t", location: { latitude: 1, longitude: 2 } });
});
```

- Proves `token` never reaches a body. That's the security reason for the whitelist.

```js
test("adds deviceId at the top level and strips proof", () => {
  const input = { deviceInfo: { brand: "x", proof: { a: 1 } } };
  const out = withDeviceId(input, "abc");
  expect(out).toEqual({ deviceInfo: { brand: "x" }, deviceId: "abc" });
  expect(input.deviceInfo.proof).toEqual({ a: 1 });
});

test("omits deviceId when there is none", () => {
  expect(withDeviceId({ deviceId: "old" }, null)).toEqual({});
});
```

- The second `expect` proves the input was not mutated.
- The last test proves a missing id removes the field rather than leaving a stale one.

- [ ] Run `npx jest utils/punchBody.test.js`. All green.

### 1.4 Wire it into clock-in

- [ ] In `timekeeping-punch.jsx`, add imports.

```js
import { pickPunchBody, withDeviceId } from "../../../utils/punchBody";
import { readPunchDeviceId } from "../../../utils/punchRequest";
```

- [ ] In `submitOnlineTimeInRef.current`, replace the `axios.post` call.

```js
      const deviceId = await readPunchDeviceId();
      const res = await axios.post(
        `${API_BASE_URL}/api/timelogs/time-in`,
        withDeviceId(pickPunchBody(body), deviceId),
        { headers: { Authorization: `Bearer ${token}` } },
      );
```

- The id is read right before sending.
- `pickPunchBody(body)` keeps only the punch fields. `withDeviceId` adds the id.
- Every clock-in path (direct, early sheet, no-schedule sheet) runs through this function, so one edit covers all of them.

### 1.5 Wire it into clock-out

- [ ] In `utils/taskReportApi.js`, import the reader.

```js
import { readPunchDeviceId } from "./punchRequest";
```

- [ ] In `postClockOutJson`, before the `return`:

```js
  const deviceId = await readPunchDeviceId();
  if (deviceId) body.deviceId = deviceId;
```

- [ ] In `postClockOutWithReport`, after the `localTimestamp` append:

```js
  const deviceId = await readPunchDeviceId();
  if (deviceId) body.append("deviceId", deviceId);
```

- In multipart, the id is its own form field, as the handover requires.
- Phase 4 replaces both functions. This keeps clock-out correct in the meantime.

### 1.6 Wire it into the Pro offline queue

- [ ] In the `!wifiConnected` branch of `handlePunch`, replace the `storePendingAction` call.

```js
        const deviceId = await readPunchDeviceId();
        await storePendingAction({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId: getTokenUserId(token),
          endpoint,
          deviceId,
          payload: pickPunchBody(offlinePayload),
        });
```

- `id` gives each queued punch a stable key. Phase 6 uses it to update one action safely.
- `userId` records who queued it. Phase 6 uses it so one account's punch is never sent with another account's token.
- `deviceId` is read **when queued**, so a later reinstall does not rewrite a waiting punch.
- `payload` stays the bare punch body. The id is kept beside it.

- [ ] In the `NetInfo` flush, change the body passed to `axios.post`.

```js
              const res = await axios.post(
                url,
                withDeviceId(pickPunchBody(action.payload), action.deviceId),
                {
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                },
              );
```

- Actions queued before this release have no `deviceId`. They are sent without it, which the server accepts.

### Checkpoint 1

- [ ] `npx jest utils/punchBody.test.js` passes.
- [ ] On a device, clock in and clock out. Ask the web admin to turn on **Record punch device** for the dev company. The web punch log shows "Registered phone" for both.
- [ ] Pro offline: go offline, clock in, come back online. The punch syncs and the web shows "Registered phone".
- [ ] Coffee and lunch still work and send no `deviceId`.

**Deployable:** yes. Nothing visible changes for employees.

---

## Phase 2. Read the face-capture rule

No UI change. The punch screen learns when a photo would be required.

### 2.1 Pure rule

- [ ] Create `utils/facePhotoRule.js`.

```js
export function pickFaceCaptureSettings(raw) {
  return {
    taskReportEnabled: raw?.taskReportEnabled === true,
    taskReportMode: raw?.taskReportMode ?? null,
    taskReportFaceCapture: raw?.taskReportFaceCapture === true,
    taskReportFaceCaptureClockIn: raw?.taskReportFaceCaptureClockIn === true,
  };
}
```

- Copies the four fields from `GET /api/company-settings`.
- `=== true` means a missing or malformed value counts as off. That matches how the server reads them.

```js
export function faceCaptureApplies(settings) {
  return (
    settings?.taskReportEnabled === true &&
    settings?.taskReportMode === "forms" &&
    settings?.taskReportFaceCapture === true
  );
}
```

- All three must hold. Free-form mode is excluded by the `"forms"` check.

```js
export function facePhotoRequiredFor(settings, endpoint) {
  if (!faceCaptureApplies(settings)) return false;
  if (endpoint === "/time-out") return true;
  if (endpoint === "/time-in") return settings.taskReportFaceCaptureClockIn === true;
  return false;
}
```

- Clock-out always needs the photo once face capture applies, form or no form.
- Clock-in needs the extra switch.
- Breaks and anything else return `false`.

```js
export function settingsOwner(userId, companyId) {
  if (!userId && !companyId) return null;
  return `${userId ?? ""}:${companyId ?? ""}`;
}
```

- A key for "whose settings these are", built from the token's user and company.
- `null` only when there is no token to read. A token missing one of the two still gets a key, so a backend with a thinner token isn't locked out of punching.

### 2.2 Unit tests

- [ ] Create `utils/facePhotoRule.test.js`.

```js
import { facePhotoRequiredFor, pickFaceCaptureSettings } from "./facePhotoRule";

const on = {
  taskReportEnabled: true,
  taskReportMode: "forms",
  taskReportFaceCapture: true,
  taskReportFaceCaptureClockIn: false,
};

test("clock-out needs a photo, clock-in does not", () => {
  expect(facePhotoRequiredFor(on, "/time-out")).toBe(true);
  expect(facePhotoRequiredFor(on, "/time-in")).toBe(false);
});

test("clock-in needs a photo when the clock-in switch is on", () => {
  const both = { ...on, taskReportFaceCaptureClockIn: true };
  expect(facePhotoRequiredFor(both, "/time-in")).toBe(true);
});
```

- These are the two main rows of the spec.

```js
test("free-form, documentation off, or capture off never need a photo", () => {
  for (const s of [
    { ...on, taskReportMode: "freeform" },
    { ...on, taskReportEnabled: false },
    { ...on, taskReportFaceCapture: false },
  ]) {
    expect(facePhotoRequiredFor(s, "/time-out")).toBe(false);
  }
});

test("missing settings count as off", () => {
  expect(facePhotoRequiredFor(pickFaceCaptureSettings(null), "/time-out")).toBe(false);
  expect(facePhotoRequiredFor(on, "/coffee-break/start")).toBe(false);
});

test("settings owner changes with the user or the company", () => {
  expect(settingsOwner("u1", "c1")).toBe("u1:c1");
  expect(settingsOwner("u1", "c2")).not.toBe(settingsOwner("u1", "c1"));
  expect(settingsOwner(null, null)).toBe(null);
});
```

- Add `settingsOwner` to the import at the top of the test file.
- The middle line is the account-switch case: same person, different company, different key.

- [ ] Run `npx jest utils/facePhotoRule.test.js`.

### 2.3 Store the settings on the punch screen

- [ ] Import the helpers in `timekeeping-punch.jsx`.

```js
import {
  facePhotoRequiredFor,
  pickFaceCaptureSettings,
  settingsOwner,
} from "../../../utils/facePhotoRule";
```

- [ ] Add `getTokenCompanyId` to the existing `jwtTokenUtils` import.

```js
import { getTokenCompanyId, getTokenUserId } from "../../../utils/jwtTokenUtils";
```

- [ ] Next to `companySettingsTaskReportFormsRef`, add two refs.

```js
  const faceCaptureSettingsRef = useRef(pickFaceCaptureSettings(null));
  const companySettingsOwnerRef = useRef(null);
```

- The first holds the four flags. It starts as "all off".
- The second records **whose** settings are loaded (`"userId:companyId"`), or `null` when none ever loaded. A plain "loaded" boolean would carry one company's rule into another account after a switch.

- [ ] In `fetchCompanySettingsForPunch`, change the first line of the `try` so `token` is visible in the `catch` too.

```js
    let token = null;
    try {
      token = await SecureStore.getItemAsync("token");
```

- Move `let token = null;` above `try`, and drop the `const` from the existing line.

- [ ] Right after `companySettingsTaskReportFormsRef.current = taskReportFormsEnabled(raw);`:

```js
      faceCaptureSettingsRef.current = pickFaceCaptureSettings(raw);
      companySettingsOwnerRef.current = settingsOwner(
        getTokenUserId(token),
        getTokenCompanyId(token),
      );
```

- The settings are stamped with the account they were loaded for.

- [ ] At the end of the `try`, after the "stored (refs)" `devLog`, add `return true;`. In the no-token early exit, change `return;` to `return false;`.

- [ ] Replace the start of the `catch` so a failed reload keeps the last good settings for **this** account only.

```js
    } catch (e) {
      devLog("company-settings fetch failed", e?.message ?? String(e));
      const owner = settingsOwner(getTokenUserId(token), getTokenCompanyId(token));
      if (owner && owner === companySettingsOwnerRef.current) return false;
      companySettingsOwnerRef.current = null;
      faceCaptureSettingsRef.current = pickFaceCaptureSettings(null);
```

- After that line, keep the existing resets and end the block with `return false;`.
- Same account: a failed reload keeps its settings. Before, it reset forms mode to off, so clock-out could skip a required form.
- Different account, or nothing ever loaded: the old settings are thrown away and the "all off" resets apply.

- [ ] Add a check the punch code can call.

```js
  const settingsLoadedForCurrentAccount = async () => {
    const token = await SecureStore.getItemAsync("token");
    const owner = settingsOwner(getTokenUserId(token), getTokenCompanyId(token));
    return Boolean(owner) && owner === companySettingsOwnerRef.current;
  };
```

- Reads the token at punch time, so an account switch that left this screen mounted is caught.
- `true` only when the loaded settings belong to the account that's punching now.

### 2.4 Refresh before each punch

- [ ] In `handlePunch`, right after `setLoading(true);`:

```js
      if (wifiConnected) await fetchCompanySettingsForPunch();
      if (!(await settingsLoadedForCurrentAccount())) {
        setLoading(false);
        Alert.alert(
          "Couldn't load company settings",
          "Check your connection and try again.",
        );
        return;
      }
```

- Online, settings are reloaded so a switch flipped during the day applies.
- Offline, the last good settings for **this** account are used.
- When this account has no settings loaded (fresh launch, or just switched accounts while offline), the punch stops instead of guessing.
- Sign-in and app start are already covered: the screen loads settings on mount, and on pull-to-refresh.

### Checkpoint 2

- [ ] Both new test files pass.
- [ ] In `__DEV__`, temporarily log `facePhotoRequiredFor(faceCaptureSettingsRef.current, endpoint)` in `handlePunch`. Flip the dev company switches and confirm the value follows them on the next tap without restarting the app. Remove the log.
- [ ] With the network off on a fresh launch (never loaded), Time In shows "Couldn't load company settings".
- [ ] Sign in to company A (face capture on) and let the punch screen load. Switch to an account at company B, go offline before the screen reloads, and tap Time In. It shows "Couldn't load company settings" instead of using A's rule. Go online: B's settings load and the punch follows B.

**Deployable:** yes. Punch behavior is unchanged except the fresher settings.

---

## Phase 3. Camera step for punches (built, not called yet)

### 3.1 File helpers

- [ ] Create `utils/punchPhotoStore.js`.

```js
import { File } from "expo-file-system";

export const MAX_FACE_PHOTO_BYTES = 5 * 1024 * 1024;

export function photoSize(uri) {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}
```

- `expo-file-system` (SDK 54) exposes `File` with a `size` property.
- 5 MB is the server's multer limit. Checking first avoids a useless upload.
- An unreadable file returns `0`, and the stamp step treats that as a failure (next step).

```js
export function deletePunchPhoto(uri) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}
```

- Removes a face image file. It's safe to call twice or with `null`.
- Errors are swallowed. A cleanup failure must never fail a punch.
- Check the SDK 54 docs: `delete` is synchronous in the new `File` API. If your installed version is async, add `await` at each call.

**Security:** face images are personal data. Every file this flow creates is deleted by one of the steps below. Phase 7 checks that none are left.

### 3.2 Return capture time and location from the camera

- [ ] In `components/task-report/FaceCaptureSegment.jsx`, add the import.

```js
import { deletePunchPhoto, MAX_FACE_PHOTO_BYTES, photoSize } from "../../utils/punchPhotoStore";
```

- Also add `useEffect` to the `react` import.

- [ ] Accept an `action` prop.

```js
function FaceCaptureReady({ timeZone, onChange, action = "out" }) {
```

- `"in"` or `"out"`. It only changes the copy.

- [ ] In `takePhoto`, capture one instant and keep it.

```js
      const capturedAt = new Date();
      const inscription = buildInscription({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        capturedAt,
        timeZone,
      });
```

- The same `capturedAt` feeds the stamp and, below, `localTimestamp`. They can't drift apart.

```js
      setShot({
        uri: photo.uri,
        inscription,
        capturedAt: capturedAt.toISOString(),
        location: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        },
      });
```

- `location` uses the same shape the punch body already sends.

- [ ] Delete the raw camera file. It is full size and unstamped. Add a ref and a cleanup effect at the top of `FaceCaptureReady`.

```js
  const rawUriRef = useRef(null);

  useEffect(() => () => deletePunchPhoto(rawUriRef.current), []);
```

- `rawUriRef` remembers the current unstamped camera file.
- The effect's cleanup runs when the component unmounts: after the punch, on Cancel, and when the camera remounts for a retake.
- The file is deleted on unmount rather than right after stamping, so the on-screen preview never points at a missing file.

- [ ] In `takePhoto`, right after the `if (!photo?.uri)` check:

```js
      deletePunchPhoto(rawUriRef.current);
      rawUriRef.current = photo.uri;
```

- A second shot replaces the first, so the old raw file goes first.

- [ ] In `retake`, add as the first line:

```js
    deletePunchPhoto(rawUriRef.current);
    rawUriRef.current = null;
```

- [ ] In `usePhoto`, replace the `onChange` line.

```js
      const size = photoSize(uri);
      if (!size || size > MAX_FACE_PHOTO_BYTES) {
        setBlockReason("The photo is too large or unreadable. Retake it.");
        return;
      }
      onChange({
        uri,
        inscription: shot.inscription,
        capturedAt: shot.capturedAt,
        location: shot.location,
      });
```

- An empty or oversized file never leaves the component.
- The parent gets everything it needs to build the punch.

- [ ] Make the permission copy name the action.

```jsx
        <Text className="text-base text-amber-950 mb-3">
          Camera access is required to {action === "in" ? "clock in" : "clock out"}.
        </Text>
```

- [ ] When permission was denied for good, send the employee to Settings.

```jsx
        <TouchableOpacity
          onPress={permission?.canAskAgain === false ? Linking.openSettings : requestPermission}
          className="py-3.5 rounded-2xl items-center bg-slate-900"
        >
          <Text className="text-white font-semibold">
            {permission?.canAskAgain === false ? "Open Settings" : "Allow camera"}
          </Text>
        </TouchableOpacity>
```

- Add `Linking` to the `react-native` import.
- After a permanent denial, `requestPermission` does nothing, so the button would look broken.

- [ ] Update the camera permission text the operating system shows. Today it only mentions clock-out. In `app.json`, change both strings:

```json
        "NSCameraUsageDescription": "BizBuddy uses the camera so you can take a face photo when you clock in or clock out. The photo is stamped with the time and place of the capture."
```

```json
          "cameraPermission": "BizBuddy uses the camera so you can take a face photo when you clock in or clock out."
```

- The first is under `ios.infoPlist`. The second is the `expo-camera` plugin option.

- [ ] The `ios` folder is checked in, so `app.json` alone doesn't reach the build. Make the same change in `ios/BizBuddy/Info.plist`:

```xml
    <key>NSCameraUsageDescription</key>
    <string>BizBuddy uses the camera so you can take a face photo when you clock in or clock out. The photo is stamped with the time and place of the capture.</string>
```

- [ ] Stop Metro and rebuild natively (`npm run ios`, `npm run android`). A JavaScript reload does not pick up permission text.

- iOS shows this text once, the first time it asks. To see the new wording, delete the app from the simulator first.

**Security:**

- The camera stays `CameraView facing="front"`. Do not add `expo-image-picker` or any gallery fallback. The server can't tell a camera shot from a gallery file, so camera-only is the whole guarantee.
- Never `console.log` the `uri` or the inscription.

### 3.3 Punch camera sheet

- [ ] Create `components/punch/FacePunchSheet.jsx`.

```jsx
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import FaceCaptureSegment from "../task-report/FaceCaptureSegment";

export default function FacePunchSheet({ action, timeZone, busy, onConfirm, onCancel }) {
  const verb = action === "in" ? "clock in" : "clock out";
```

- `busy` is true while the punch request runs.
- `onConfirm(shot)` fires once the stamped photo is ready.

```jsx
  return (
    <View className="px-6">
      <Text className="text-2xl font-bold text-slate-900 mb-2 text-center">
        Face check
      </Text>
      <Text className="text-base text-slate-600 text-center mb-4">
        Your company needs a face photo to {verb}.
      </Text>
      <FaceCaptureSegment
        action={action}
        timeZone={timeZone}
        onChange={(shot) => {
          if (shot?.uri && !busy) onConfirm(shot);
        }}
      />
```

- "Use photo" is the confirm. There's no second button, so the photo is the last step before the request.
- `!busy` stops a double tap from sending twice.
- `onChange(null)` (Retake) is ignored here.

```jsx
      {busy ? (
        <View className="py-4 items-center mb-8">
          <ActivityIndicator color="#0f172a" />
        </View>
      ) : (
        <TouchableOpacity
          onPress={onCancel}
          className="py-3.5 rounded-2xl items-center bg-slate-100 border border-slate-200 mb-8"
        >
          <Text className="text-slate-700 font-semibold text-base">Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

- Cancel is hidden while sending, so the employee can't back out mid-request and lose track of the result.

### 3.4 Promise bridge on the punch screen

The camera lives in the existing bottom sheet. A promise lets the punch code `await` the photo in a straight line.

- [ ] Import the sheet.

```js
import FacePunchSheet from "../../../components/punch/FacePunchSheet";
```

- [ ] Add state and refs near the other modal state.

```js
  const [facePhotoAction, setFacePhotoAction] = useState(null);
  const [facePhotoAttempt, setFacePhotoAttempt] = useState(0);
  const [facePhotoBusy, setFacePhotoBusy] = useState(false);
  const facePhotoResolveRef = useRef(null);
  const heldShotRef = useRef(null);
  const sheetShownRef = useRef(false);
```

- `facePhotoAction` is `"in"`, `"out"`, or `null` (camera hidden).
- `facePhotoAttempt` remounts the camera for a retake.
- `facePhotoResolveRef` holds the waiting promise's `resolve`.
- `heldShotRef` keeps a stamped photo across a retry in the same flow.
- `sheetShownRef` tracks whether the sheet is on screen. A ref is used because the clock-out confirm path runs inside an animation callback with stale state.

```js
  const requestFacePhoto = (action) =>
    new Promise((resolve) => {
      facePhotoResolveRef.current?.(null);
      facePhotoResolveRef.current = resolve;
      setFacePhotoAttempt((n) => n + 1);
      setFacePhotoAction(action);
      if (!sheetShownRef.current) openModal("facePhoto");
    });
```

- An older waiting request, if any, gets `null` so it can't hang.
- When another sheet (form, early clock-in) is already up, the camera replaces its content without a second slide-in.

```js
  const settleFacePhoto = (shot) => {
    const resolve = facePhotoResolveRef.current;
    facePhotoResolveRef.current = null;
    resolve?.(shot);
  };
```

- Resolves once and clears the ref, so a second "Use photo" tap does nothing.
- The camera stays visible (with `busy`) until the caller closes the sheet.

- [ ] In `openModal`, add as the first line:

```js
    sheetShownRef.current = true;
```

- [ ] In `closeModal`, add before `Animated.parallel`:

```js
    sheetShownRef.current = false;
    deletePunchPhoto(heldShotRef.current?.uri);
    heldShotRef.current = null;
    settleFacePhoto(null);
```

- Any close (Cancel, backdrop tap, drag down, success) answers a waiting camera with `null`.
- The held stamped photo is deleted from disk and dropped. It's only reused inside one flow.
- Import `deletePunchPhoto` from `../../../utils/punchPhotoStore` at the top of the screen.

- [ ] In the `closeModal` animation callback, next to `setTaskReportVisible(false);`:

```js
      setFacePhotoAction(null);
      setFacePhotoBusy(false);
```

### 3.5 Render it

- [ ] At the top of `renderModalContent`, before the `taskReportVisible` branch:

```jsx
    if (facePhotoAction && !taskReportVisible) {
      return (
        <FacePunchSheet
          key={facePhotoAttempt}
          action={facePhotoAction}
          timeZone={companySettingsTimeZoneRef.current}
          busy={facePhotoBusy}
          onConfirm={settleFacePhoto}
          onCancel={closeModal}
        />
      );
    }
```

- `key` remounts the camera for each request, so a retake starts clean.
- The stamp uses the company zone, the same as the form sheet.
- The form case is handled in Phase 4 so the form's answers survive.

- [ ] Add `facePhotoAction !== null ||` to the bottom-sheet `Modal` visibility condition, and to `clockSheetFitsContent`.

### Checkpoint 3

- [ ] In a `__DEV__`-only button (remove after), call `requestFacePhoto("in").then((s) => devLog("shot", Boolean(s?.uri), s?.capturedAt))`. Check that:
  - the front camera opens
  - Retake works
  - Use photo logs `true` and an ISO time
  - Cancel, a backdrop tap, and a drag-down each log `false`
- [ ] Deny camera permission, then confirm the "Open Settings" button appears.
- [ ] After deleting and reinstalling the app, the iOS camera prompt says "clock in or clock out". Check Android too.
- [ ] Take a photo, Retake, take another, then Cancel. In the simulator's app container (`xcrun simctl get_app_container booted com.bizsolutions.bizbuddy data`, then look under `Library/Caches`), no camera `.jpg` from this session remains.
- [ ] Turn location services off and tap Take photo. The block message says location is required, and no photo is returned. This is the new rule for employees with location off.
- [ ] Remove the dev button.

**Deployable:** yes. Nothing calls the camera yet.

---

## Phase 4. Clock-out with the photo

From here, companies with face capture on get the camera on clock-out.

### 4.1 Multipart builder

- [ ] Add to `utils/punchBody.js`:

```js
export function withShot(body, shot) {
  return { ...body, localTimestamp: shot.capturedAt, location: shot.location };
}
```

- The punch time and place become the photo's. This is how the stamp, `location`, and `localTimestamp` describe one moment.

```js
const TEXT_FIELDS = ["localTimestamp", "punchType", "reason", "deviceId"];
const JSON_FIELDS = ["location", "deviceInfo", "remarks"];

export function punchFormParts(body, { answers } = {}) {
  const parts = [];
  for (const key of TEXT_FIELDS) {
    const v = body?.[key];
    if (v !== undefined && v !== null && v !== "") parts.push([key, String(v)]);
  }
  for (const key of JSON_FIELDS) {
    if (body?.[key] !== undefined) parts.push([key, JSON.stringify(body[key])]);
  }
  if (answers) parts.push(["answers", JSON.stringify(answers)]);
  return parts;
}
```

- Returns `[name, value]` pairs instead of a `FormData`, so it can be unit tested.
- Text fields go as-is. `location`, `deviceInfo`, and `remarks` go as JSON strings, as the handover requires.
- `answers` is a JSON string only when there are answers.

- [ ] Add tests to `utils/punchBody.test.js`.

```js
import { punchFormParts, withShot } from "./punchBody";

test("multipart parts stringify location and answers", () => {
  const parts = Object.fromEntries(
    punchFormParts(
      { localTimestamp: "t", location: { latitude: 1 }, deviceId: "d" },
      { answers: { q1: "yes" } },
    ),
  );
  expect(parts).toEqual({
    localTimestamp: "t",
    deviceId: "d",
    location: '{"latitude":1}',
    answers: '{"q1":"yes"}',
  });
});

test("withShot uses the photo moment", () => {
  const shot = { capturedAt: "c", location: { latitude: 9, longitude: 8 } };
  expect(withShot({ localTimestamp: "tap" }, shot)).toEqual({
    localTimestamp: "c",
    location: { latitude: 9, longitude: 8 },
  });
});
```

### 4.2 One function that sends any punch

- [ ] Add to `utils/punchRequest.js`:

```js
import axios from "axios";
import { API_BASE_URL } from "../config/constant";
import { pickPunchBody, punchFormParts, withDeviceId } from "./punchBody";
```

```js
export const PUNCH_TIMEOUT_MS = 60000;

export async function postPunch(endpoint, { token, body, deviceId, answers, facePhoto }) {
  const url = `${API_BASE_URL}/api/timelogs${endpoint}`;
  const headers = { Authorization: `Bearer ${token}` };
  const options = { headers, timeout: PUNCH_TIMEOUT_MS };
  const fields = withDeviceId(pickPunchBody(body), deviceId);
```

- One entry point for time-in and time-out, online and replayed.
- `timeout` ends a stuck request after 60 seconds. Without it, a weak connection leaves the camera sheet on a spinner with Cancel hidden and no way out.
- A timed-out request has no `response`, so every caller already treats it like a dropped network:
  - Clock-in runs `adoptActiveTimelog`, which catches the case where the server saved the punch anyway.
  - A Pro clock-out is queued (Phase 6).
  - Anything else shows an error.
- `pickPunchBody` again keeps the token out of the body.

```js
  if (!facePhoto) {
    return axios.post(url, answers ? { ...fields, answers } : fields, options);
  }
```

- No photo means JSON, exactly like today. A required form with face capture off still sends `answers` here.

```js
  const form = new FormData();
  for (const [name, value] of punchFormParts(fields, { answers })) {
    form.append(name, value);
  }
  form.append("facePhoto", { uri: facePhoto.uri, name: "face.jpg", type: "image/jpeg" });
  return axios.post(url, form, options);
}
```

- With a photo, every field becomes a form part, plus the file.
- Don't set `Content-Type` yourself. Axios and React Native add the multipart boundary.
- The field name must be exactly `facePhoto`. The server ignores any other file field.

**Security:** don't `devLog` the `FormData` or the file `uri`. Log `{ endpoint, hasPhoto: Boolean(facePhoto) }` at most.

### 4.3 Shared photo-and-retry loop

- [ ] In `timekeeping-punch.jsx`, add after `settleFacePhoto`:

```js
  const askRetry = (message) =>
    new Promise((resolve) => {
      Alert.alert("Photo not saved", message || "Please try again.", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Retry", onPress: () => resolve(true) },
      ]);
    });
```

- Turns a two-button alert into `true` (retry) or `false` (give up).

```js
  const runFacePunch = async (action, send) => {
    let shot = heldShotRef.current ?? (await requestFacePhoto(action));
    while (shot) {
      heldShotRef.current = shot;
      setFacePhotoBusy(true);
      try {
        const res = await send(shot);
        deletePunchPhoto(shot.uri);
        heldShotRef.current = null;
        return { res };
```

- Reuses a held photo first (after the form was re-shown). Otherwise opens the camera.
- `while (shot)` ends when the employee cancels (`null`).
- On success the server has the photo, so the local stamped file is deleted and the response is returned.

```js
      } catch (err) {
        const code = err?.response?.data?.code;
        const message = err?.response?.data?.message;
        if (code === "FACE_PHOTO_REQUIRED") {
          deletePunchPhoto(shot.uri);
          heldShotRef.current = null;
          Alert.alert("Take the photo again", message || "The photo couldn't be read.");
          shot = await requestFacePhoto(action);
          continue;
        }
```

- The server rejected the image itself, so the file is deleted and the camera opens fresh.

```js
        if (code === "FACE_PHOTO_UPLOAD_FAILED" || code === "FACE_PHOTO_UNAVAILABLE") {
          if (await askRetry(message)) continue;
          closeModal();
          return { cancelled: true };
        }
        return { err };
      } finally {
        setFacePhotoBusy(false);
      }
    }
    return { cancelled: true };
  };
```

- For 502 and 503, the punch was not saved. Retry sends the **same** photo. Cancel closes everything, and `closeModal` deletes the held file.
- Any other error goes back to the caller, with the photo still held.
- `finally` always clears the spinner.

### 4.4 Rebuild the clock-out send

- [ ] Replace `postClockOutJson` / `postClockOutWithReport` imports with:

```js
import { pickPunchBody, withDeviceId, withShot } from "../../../utils/punchBody";
import { postPunch, readPunchDeviceId } from "../../../utils/punchRequest";
```

- [ ] Add above `beginClockOut`:

```js
  async function sendClockOut(payload, { answers = null } = {}) {
    const token = payload.token ?? (await SecureStore.getItemAsync("token"));
    const deviceId = await readPunchDeviceId();
    if (!facePhotoRequiredFor(faceCaptureSettingsRef.current, "/time-out")) {
      const res = await postPunch("/time-out", { token, body: payload, deviceId, answers });
      await finishClockOutSuccess(payload, res);
      return;
    }
```

- Without face capture, this is today's JSON clock-out, with `answers` when a form was filled.

```js
    const out = await runFacePunch("out", (shot) =>
      postPunch("/time-out", {
        token,
        body: withShot(payload, shot),
        deviceId,
        answers,
        facePhoto: shot,
      }),
    );
    if (out.cancelled) return;
    if (out.err) throw out.err;
    await finishClockOutSuccess(payload, out.res);
  }
```

- With face capture, the camera opens, then one multipart request carries the photo and any answers.
- Cancel leaves the employee clocked in.
- Other errors go to the shared handler below.

- [ ] Add the clock-out error handler.

```js
  async function handleClockOutError(err, payload) {
    const code = err?.response?.data?.code;
    const message = err?.response?.data?.message;
    if (code === "TASK_REPORT_FORMS_REQUIRED") {
      companySettingsTaskReportFormsRef.current = true;
      setFacePhotoAction(null);
      try {
        if (await showRequiredTaskReport(payload)) return;
      } catch (lookupErr) {
        devLog("open form after rejection failed", lookupErr?.message);
      }
      Alert.alert("End-of-shift form", message || "Finish the end-of-shift form before clocking out.");
      return;
    }
```

- The server says a form is required. The camera is hidden and the form is shown.
- The held photo stays in `heldShotRef`, so after the form the same photo is sent.

```js
    if (code === "INVALID_ANSWER" || code === "REQUIRED_ANSWER") {
      setFacePhotoAction(null);
      Alert.alert("End-of-shift form", message || "Check your answers.");
      return;
    }
    if (sheetShownRef.current) closeModal();
    Alert.alert("Error", message || "Punch failed. Please try again.");
  }
```

- A bad answer reveals the form again with the answers intact (next step). The photo is kept.
- Anything else closes the sheet and shows the server message. The employee is still clocked in.

- [ ] Replace the body of `beginClockOut`.

```js
  async function beginClockOut(payload) {
    setLoading(true);
    try {
      if (companySettingsTaskReportFormsRef.current) {
        try {
          if (await showRequiredTaskReport(payload)) return;
        } catch (lookupErr) {
          Alert.alert(
            "End-of-shift form",
            lookupErr?.response?.data?.message ||
              "You must be online to complete the end-of-shift form before clocking out.",
          );
          return;
        }
      }
      await sendClockOut(payload);
    } catch (err) {
      await handleClockOutError(err, payload);
    } finally {
      setLoading(false);
    }
  }
```

- The form is first, as the spec orders. `handlePunch` already reloaded the settings, so the old "fetch again if false" line is gone.
- No form means straight to `sendClockOut`, which opens the camera when needed.

- [ ] Replace `submitTaskReportClockOut`.

```js
  async function submitTaskReportClockOut({ answers }) {
    const payload = pendingClockOutPayload;
    if (!payload) return;
    setTaskReportSubmitting(true);
    try {
      await sendClockOut(payload, { answers });
    } catch (err) {
      await handleClockOutError(err, payload);
    } finally {
      setTaskReportSubmitting(false);
    }
  }
```

- The form now hands over answers only. The camera, when required, opens next.

### 4.5 Keep the form mounted under the camera

- [ ] In `renderModalContent`, replace the `taskReportVisible` branch's `TaskReportFormSheet` block.

```jsx
    if (taskReportVisible) {
      return (
        <View>
          {facePhotoAction ? (
            <FacePunchSheet
              key={facePhotoAttempt}
              action={facePhotoAction}
              timeZone={companySettingsTimeZoneRef.current}
              busy={facePhotoBusy}
              onConfirm={settleFacePhoto}
              onCancel={closeModal}
            />
          ) : null}
          <View style={facePhotoAction ? { display: "none" } : undefined}>
            {taskReport ? (
              <TaskReportFormSheet
                report={taskReport}
                timeZone={companySettingsTimeZoneRef.current}
                maxHeight={sheetContentMaxHeight}
                submitting={taskReportSubmitting}
                onCancel={() => {
                  pendingClockOutAfterConfirmRef.current = null;
                  closeModal();
                }}
                onSubmit={submitTaskReportClockOut}
              />
            ) : (
              <View className="px-6 py-8 items-center">
                <ActivityIndicator color="#0f172a" />
              </View>
            )}
          </View>
        </View>
      );
    }
```

- The form stays mounted but hidden while the camera shows, so its answers aren't lost.
- When an answer error hides the camera, the same form reappears with what the employee typed.

### 4.6 Take the photo out of the questionnaire

- [ ] In `components/task-report/TaskReportFormSheet.jsx`:
  - Remove the `FaceCaptureSegment` import.
  - Remove the `facePhoto` and `faceError` state.
  - Remove the `<FaceCaptureSegment …/>` element and the `faceError` text.

- [ ] Replace `submit`.

```js
  function submit() {
    const result = validateAnswers(form?.questions || [], answers);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit({ answers: result.cleaned });
  }
```

- The form validates answers only. The photo belongs to the punch now.

- [ ] Update the late notice, since there's no photo any more.

```js
const LATE_NOTICE = "This shift was already closed. Your answers are saved to that punch.";
```

- [ ] In `utils/taskReportApi.js`, replace `submitClosedTaskReport`.

```js
export async function submitClosedTaskReport(timeLogId, { answers }) {
  const headers = await authHeaders();
  return axios.put(
    `${API_BASE_URL}/api/task-report-forms/me/punch/${timeLogId}`,
    { answers, submit: true },
    { headers },
  );
}
```

- Plain JSON, the format from the forms hand-off (section 5). The server ignores a photo here anyway.

- [ ] Delete `postClockOutJson` and `postClockOutWithReport` from `utils/taskReportApi.js`. Then confirm nothing else uses them.

```bash
rg "postClockOutJson|postClockOutWithReport" app components utils
```

- [ ] In `app/(tabs)/(shifts)/timekeeping-timeCard.jsx`, update `submitAddReport`.

```js
  async function submitAddReport({ answers }) {
    if (!addReport?.timeLogId) return;
    setAddReportSubmitting(true);
    try {
      await submitClosedTaskReport(addReport.timeLogId, { answers });
```

- The rest of the function stays.

### 4.7 Stop offline clock-out in forms mode

Until Phase 6, a queued clock-out would reach the server without its form or photo and be refused silently.

- [ ] At the top of the `!wifiConnected` branch in `handlePunch`:

```js
        if (endpoint === "/time-out" && companySettingsTaskReportFormsRef.current) {
          setLoading(false);
          Alert.alert(
            "End-of-shift form",
            "You must be online to complete the end-of-shift form before clocking out.",
          );
          return;
        }
```

- Face capture only applies in forms mode, so this also covers offline clock-out with a photo.
- The spec says the form lookup needs the network. This rule stays after Phase 6.

### Checkpoint 4

- [ ] `npx jest utils` passes.
- [ ] Face capture **off**: clock-out is JSON with no camera. With a form assigned, the form shows and its answers are saved.
- [ ] Face capture **on**, no form assigned: Time Out → confirm sheet → camera → Use photo → clocked out. The web cutoff page shows the "Out" camera icon.
- [ ] Face capture **on**, form assigned: form → Submit → camera → Use photo → one request. The web shows the answers and the photo.
- [ ] Cancel on the camera: still clocked in, nothing sent.
- [ ] Deny camera: Time Out is not sent, and the sheet explains how to allow it.
- [ ] Leave a required question empty but bypass the client check (temporarily skip `validateAnswers` in a dev build): the server's `REQUIRED_ANSWER` reveals the form with the answers kept. Submitting again does **not** reopen the camera. Restore the check.
- [ ] Turn off S3 on the dev server, or ask the server dev to: `503` shows Retry. Retry with S3 back on clocks out without a new photo.
- [ ] Time card "Answer questionnaire" on a closed punch saves with no camera.
- [ ] Use the Network Link Conditioner (iOS) or the emulator's network throttling set to "100% loss" after tapping Use photo. Within about 60 seconds the spinner ends with an error and the employee is still clocked in. Restore the network.
- [ ] After a successful clock-out with a photo, no stamped `.jpg` from this punch stays in `Library/Caches` (same check as Checkpoint 3).
- [ ] Offline in forms mode: Time Out shows the "must be online" alert.

**Deployable:** yes. Clock-out matches the server contract. Clock-in is unchanged, and the server doesn't need a clock-in photo unless that switch is on.

---

## Phase 5. Clock-in with the photo

### 5.1 Send clock-in through the photo loop

- [ ] In `submitOnlineTimeInRef.current`, replace the Phase 1 `axios.post` block.

```js
      const deviceId = await readPunchDeviceId();
      let res;
      if (facePhotoRequiredFor(faceCaptureSettingsRef.current, "/time-in")) {
        const out = await runFacePunch("in", (shot) =>
          postPunch("/time-in", { token, body: withShot(body, shot), deviceId, facePhoto: shot }),
        );
        if (out.cancelled) return;
        if (out.err) throw out.err;
        res = out.res;
      } else {
        res = await postPunch("/time-in", { token, body, deviceId });
      }
```

- The camera only opens when both switches are on.
- Every clock-in gate already ran before this function (assigned site, breadcrumbs, early clock-in, punch type), so the camera is the last step.
- `return` on cancel still runs `finally`, so the punch lock is released.

- [ ] Replace both `if (clockInSheetOpen) closeModal();` lines with:

```js
      if (sheetShownRef.current) closeModal();
```

- The camera may have opened the sheet. The old flag only knew about the early and no-schedule sheets.
- Delete the now-unused `clockInSheetOpen` constant.

- [ ] In the same function's `catch`, before the `Alert.alert("Couldn't time in", …)`:

```js
      if (sheetShownRef.current) closeModal();
```

- A failed clock-in no longer leaves the camera on screen.

### 5.2 Block offline clock-in with a photo until Phase 6

- [ ] In the `!wifiConnected` branch, after the Phase 4 forms check:

```js
        if (facePhotoRequiredFor(faceCaptureSettingsRef.current, endpoint)) {
          setLoading(false);
          Alert.alert("You're offline", "Connect to the internet to clock in with a face photo.");
          return;
        }
```

- This is temporary. Phase 6 replaces it with a queued photo.

### Checkpoint 5

- [ ] Face capture on, clock-in switch **off**: Time In has no camera. Time Out has the camera.
- [ ] Both switches **on**: Time In opens the camera after the punch-type sheet (no-schedule case) and after the early clock-in choice. The web shows the "In" icon.
- [ ] Coffee and lunch never open the camera.
- [ ] Turn the clock-in switch on while the app is open. The next Time In asks for a photo without a restart.
- [ ] `502` on clock-in: Retry with the same photo succeeds.
- [ ] Clock-in with the network cut after Use photo: the spinner ends within about 60 seconds. If the server did save the punch, the screen shows clocked in (from `adoptActiveTimelog`). Otherwise it shows "Couldn't time in".

**Deployable:** yes. Both online punches match the server contract.

---

## Phase 6. Offline Pro punches with the photo

### 6.1 Keep the file somewhere permanent

- [ ] Add to `utils/punchPhotoStore.js`:

```js
import { Directory, File, Paths } from "expo-file-system";

function photoDir() {
  const dir = new Directory(Paths.document, "punch-photos");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}
```

- Merge `Directory` and `Paths` into the existing `File` import.
- `react-native-view-shot` writes to the cache, which the OS may clear. Documents is private to the app and is not cleared.

```js
export function keepPunchPhoto(uri) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const target = new File(photoDir(), name);
  new File(uri).copy(target);
  deletePunchPhoto(uri);
  return target.uri;
}
```

- Copies the stamped file into documents and returns the new path to store in the queue.
- The cache copy is deleted right after, so only one face file exists per queued punch.
- `deletePunchPhoto` (Phase 3) removes the kept file once the server has it, or when the action is dropped.
- Check the SDK 54 docs: `copy` is synchronous in the new `File` API. If your installed version is async, add `await`.

**Security:** photos stay inside the app sandbox, never in the camera roll, and are deleted as soon as they're sent or dropped.

### 6.2 Pure queue rules

- [ ] Create `utils/punchQueue.js`.

```js
export function settlePunchAction(status, code) {
  if (status >= 200 && status < 300) return "done";
  if (!status || status >= 500) return "keep";
  if (code === "FACE_PHOTO_REQUIRED") return "needsPhoto";
  return "drop";
}
```

- `done`: the server accepted it.
- `keep`: no response (network) or a server error, including `502` and `503`. Try again later.
- `needsPhoto`: the image was rejected. A new one is needed.
- `drop`: any other client error (for example already clocked in). This matches today's behavior, which dropped everything.

- [ ] Create `utils/punchQueue.test.js`.

```js
import { settlePunchAction } from "./punchQueue";

test("keeps network and server failures", () => {
  expect(settlePunchAction(undefined)).toBe("keep");
  expect(settlePunchAction(502, "FACE_PHOTO_UPLOAD_FAILED")).toBe("keep");
  expect(settlePunchAction(503, "FACE_PHOTO_UNAVAILABLE")).toBe("keep");
});

test("asks for a new photo, drops other 4xx, finishes 2xx", () => {
  expect(settlePunchAction(400, "FACE_PHOTO_REQUIRED")).toBe("needsPhoto");
  expect(settlePunchAction(409, "ALREADY_TIMED_IN")).toBe("drop");
  expect(settlePunchAction(201)).toBe("done");
});
```

- [ ] Run `npx jest utils/punchQueue.test.js`.

### 6.3 Queue the photo with an offline punch

- [ ] In `timekeeping-punch.jsx`, add `keepPunchPhoto` to the existing `punchPhotoStore` import, and import the queue rule:

```js
import { deletePunchPhoto, keepPunchPhoto } from "../../../utils/punchPhotoStore";
import { settlePunchAction } from "../../../utils/punchQueue";
```

- [ ] Add a writer next to `storePendingAction`:

```js
const savePendingActions = async (actions) => {
  try {
    await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(actions));
  } catch {}
};
```

- [ ] Delete the Phase 5.2 offline block. In its place, before `storePendingAction`:

```js
        let queuedPayload = pickPunchBody(offlinePayload);
        let facePhotoUri = null;
        if (facePhotoRequiredFor(faceCaptureSettingsRef.current, endpoint)) {
          const shot = await requestFacePhoto(endpoint === "/time-in" ? "in" : "out");
          if (!shot) {
            setLoading(false);
            return;
          }
          facePhotoUri = keepPunchPhoto(shot.uri);
          queuedPayload = withShot(queuedPayload, shot);
          closeModal();
        }
```

- The camera still runs offline. GPS works without a network, so the stamp works too.
- Cancel queues nothing.
- `keepPunchPhoto` moves the stamped file out of the cache, so `closeModal` has nothing left to delete.
- `withShot` makes the queued `localTimestamp` the photo moment. It is never replaced with the sync time.
- In practice this is clock-in only, because offline clock-out in forms mode is blocked by 4.7.

- [ ] Change the Phase 1 `storePendingAction` call to use these:

```js
          payload: queuedPayload,
          facePhotoUri,
```

### 6.4 Rewrite the flush

The old flush cleared the whole queue even when a request failed. That is unsafe once a photo is attached.

- [ ] Move the breadcrumb lines from the old flush loop into a helper.

```js
  const afterQueuedPunch = async (action, res, token) => {
    if (action.endpoint === "/time-in" && res.data?.data?.id) {
      const userId = getTokenUserId(token);
      await assignBreadcrumbTimeLogId(res.data.data.id, userId);
      const session = userId ? await readBreadcrumbSession(userId) : null;
      if (session && !session.timeLogId) {
        await saveBreadcrumbSession({
          ...session,
          timeLogId: res.data.data.id,
          collectUntil: res.data.data.collectUntil || session.collectUntil,
        });
      }
    }
    if (action.endpoint === "/time-out") await stopBreadcrumbTracking();
  };
```

- Same logic as today, only moved so the new loop stays short.

- [ ] Add the guarded flush.

```js
  const flushingPunchesRef = useRef(false);

  const flushPendingPunches = useCallback(async () => {
    if (flushingPunchesRef.current) return;
    flushingPunchesRef.current = true;
    try {
      const token = await SecureStore.getItemAsync("token");
      const userId = getTokenUserId(token);
      if (!token || !userId) return;
      const queue = await getPendingActions();
      const remaining = [];
      let blocked = false;
```

- The ref stops two NetInfo events from sending the same punch twice.
- No token or user means nothing is sent.
- `blocked` keeps order: once a punch can't go, later punches wait behind it.

```js
      for (const action of queue) {
        const mine = !action.userId || action.userId === userId;
        if (!mine || blocked || action.needsPhoto) {
          if (mine && action.needsPhoto) blocked = true;
          remaining.push(action);
          continue;
        }
```

- **Security:** another account's punch is never sent with this token. It stays queued for that employee.
- Actions queued before this release have no `userId` and are sent as today.
- A punch waiting for a new photo blocks the rest of that user's queue.

```js
        let outcome = "done";
        try {
          const res = await postPunch(action.endpoint, {
            token,
            body: action.payload,
            deviceId: action.deviceId,
            facePhoto: action.facePhotoUri ? { uri: action.facePhotoUri } : null,
          });
          await afterQueuedPunch(action, res, token);
        } catch (err) {
          outcome = settlePunchAction(err?.response?.status, err?.response?.data?.code);
        }
```

- Sends the same body that was queued: JSON, or multipart with the kept photo.
- `deviceId` is the value captured at queue time.

```js
        if (outcome === "keep") {
          blocked = true;
          remaining.push(action);
        } else if (outcome === "needsPhoto") {
          blocked = true;
          deletePunchPhoto(action.facePhotoUri);
          remaining.push({ ...action, facePhotoUri: null, needsPhoto: true });
        } else {
          deletePunchPhoto(action.facePhotoUri);
        }
      }
      await savePendingActions(remaining);
      setPendingOfflinePunches(remaining);
    } finally {
      flushingPunchesRef.current = false;
    }
  }, []);
```

- `keep`: the action and its photo stay.
- `needsPhoto`: the bad file is deleted and the action is marked for a retake.
- `done` or `drop`: the file is deleted and the action leaves the queue.
- Only what remains is saved. Nothing is cleared blindly.

- [ ] In the `NetInfo` listener, replace the whole `if (pending.length > 0) { … }` block with:

```js
        await flushPendingPunches();
```

### 6.5 Retake a rejected queued photo

- [ ] Add the handler.

```js
  const retakeQueuedPhoto = async (actionId) => {
    const queue = await getPendingActions();
    const action = queue.find((a) => a.id === actionId);
    if (!action) return;
    const shot = await requestFacePhoto(action.endpoint === "/time-in" ? "in" : "out");
    if (!shot) return;
    closeModal();
    const facePhotoUri = keepPunchPhoto(shot.uri);
    const fresh = await getPendingActions();
    await savePendingActions(
      fresh.map((a) => (a.id === actionId ? { ...a, facePhotoUri, needsPhoto: false } : a)),
    );
    await refreshPendingOfflinePunches();
    if (wifiConnected) await flushPendingPunches();
  };
```

- Finds the action by `id`, not position, so a flush in between can't make it edit the wrong one.
- The queue is re-read after the camera, because it may have changed while the camera was open.
- The punch keeps its original `localTimestamp`. Only the photo is new.

- [ ] In the pending offline punches card, inside `pendingOfflinePunches.map`, after the details `Text`:

```jsx
                    {action?.needsPhoto ? (
                      <TouchableOpacity
                        onPress={() => retakeQueuedPhoto(action.id)}
                        className="mt-2 py-2 rounded-lg items-center bg-amber-500"
                      >
                        <Text className="text-white font-semibold text-sm">
                          Photo needed: retake
                        </Text>
                      </TouchableOpacity>
                    ) : null}
```

### 6.6 Network drops after the form is answered

- [ ] Add a helper that queues a clock-out from the online path.

```js
  const queueClockOutFromOnline = async (payload, answers) => {
    const token = payload.token ?? (await SecureStore.getItemAsync("token"));
    const shot = heldShotRef.current;
    const facePhotoUri = shot ? keepPunchPhoto(shot.uri) : null;
    await storePendingAction({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: getTokenUserId(token),
      endpoint: "/time-out",
      deviceId: await readPunchDeviceId(),
      payload: shot ? withShot(pickPunchBody(payload), shot) : pickPunchBody(payload),
      answers,
      facePhotoUri,
    });
```

- Answers and the stamped photo are stored together, as the spec requires.
- The photo moment stays the punch time.

```js
    await refreshPendingOfflinePunches();
    await queueBreadcrumbClockOut();
    closeModal();
    resetAllStates();
    Alert.alert("Offline Mode", "Your clock-out is saved and will send when you're back online.");
  };
```

- The rest mirrors today's offline clock-out: local UI shows clocked out and breadcrumbs stop.

- [ ] Pass `answers` through the flush: add `answers: action.answers,` to the `postPunch` call in 6.4.

- [ ] In `sendClockOut`, change `if (out.err) throw out.err;` to:

```js
    if (out.err) {
      const canQueue =
        !out.err.response &&
        (subscriptionPlan || "").toLowerCase() === "pro" &&
        !isLocationRestricted;
      if (canQueue) {
        await queueClockOutFromOnline(payload, answers);
        return;
      }
      throw out.err;
    }
```

- Only a dropped network (no `response`) is queued, for Pro, unrestricted employees. The same rules as today's offline punch.
- A server answer is still handled by `handleClockOutError`.

### Checkpoint 6

- [ ] `npx jest utils` passes.
- [ ] Pro, both switches on, offline: Time In opens the camera, the punch is queued, and the pending card shows it. While queued, exactly one `.jpg` is in `Documents/punch-photos/` and none from this punch is in `Library/Caches`. Online again: it syncs, the web shows the "In" photo with the **offline** time, and `punch-photos/` is empty.
- [ ] Clock out online with a form filled, then cut the network so the 60-second timeout fires. The clock-out is queued with answers and photo, the same as a dropped network.
- [ ] Offline with the server's S3 off: the punch stays queued and the photo stays on disk. Turn S3 on and reconnect: it sends.
- [ ] Force a `FACE_PHOTO_REQUIRED` (temporarily queue an empty file in a dev build): the card shows "Photo needed: retake". Retaking sends the punch. Remove the dev hack.
- [ ] Queue a punch as user A, sign in as user B, and go online. A's punch is **not** sent. Sign back in as A: it sends.
- [ ] Fill a form online, turn on airplane mode, then Use photo: the clock-out is queued with answers and photo, and syncs later.
- [ ] A non-Pro plan offline is still blocked.

**Deployable:** yes. This is the full spec.

---

## Phase 7. Final pass

- [ ] Search for leftovers.

```bash
rg "facePhoto" components/task-report utils/taskReportApi.js app/\(tabs\)/\(shifts\)/timekeeping-timeCard.jsx
rg "console.log|devLog" components/task-report/FaceCaptureSegment.jsx utils/punchRequest.js
```

- The first should find nothing in the questionnaire path.
- The second must show no log of a `uri`, `FormData`, token, or inscription.

- [ ] Leftover face files. After a full run of the checkpoints (punches, cancels, retakes, a rejected photo, an offline sync), list the app's files on the simulator.

```bash
APP_DATA=$(xcrun simctl get_app_container booted com.bizsolutions.bizbuddy data)
find "$APP_DATA/Library/Caches" "$APP_DATA/Documents/punch-photos" -name "*.jpg" -mmin -60
```

- `get_app_container … data` prints the app's private folder on the simulator. `com.bizsolutions.bizbuddy` is the iOS bundle id from `app.json`. Android uses `com.bizsolutions.mybizbuddy`.
- `-mmin -60` limits the list to files from the last hour, your test run.
- Expected: nothing, unless a Pro offline punch is still queued. In that case, exactly one file per queued punch in `punch-photos/`.

- [ ] Camera permission text: both `app.json` strings and `ios/BizBuddy/Info.plist` say "clock in or clock out".
- [ ] Android: the camera prompt and capture work on a real device (Phase 0 check, repeated on the release build).
- [ ] Tell the client and the web admin: with face capture on, an employee with location services off can't finish a punch that needs a photo, because the stamp needs a location fix. Without face capture, nothing changes for them.

- [ ] Walk the acceptance criteria in section 10 of the spec on iOS and Android, with these switch combinations:

| Documentation | Mode | Face capture | Also at clock-in | Expect |
|---|---|---|---|---|
| off | any | any | any | No camera anywhere. `deviceId` sent. |
| on | free-form | on | on | No camera. |
| on | forms | off | any | Form on clock-out if assigned, JSON, no camera. |
| on | forms | on | off | Camera on clock-out only. |
| on | forms | on | on | Camera on both. |

- [ ] Confirm the web cutoff page shows In and Out photos for a test punch, and that the employee app never shows them.
- [ ] Add a line to `WHATS_NEW.txt` for the release: face photo on clock-in and clock-out when the company requires it.
- [ ] Tell the server team the build is ready to test in dev (handover: "Tell us when the build is ready"). Include your answers to their question F2: offline punches are sent later with the same `deviceId` and the photo.
