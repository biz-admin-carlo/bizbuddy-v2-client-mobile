# Task report form before clock-out — implementation TODO

Work from [docs/requirements.md](requirements.md). Do the phases in order. Check a box only after that step runs.

The app is this repo (Expo, React Native, NativeWind). The API is the sibling `bizbuddy-server` repo. Leave timecard corrections, the form builder, PDF review, and drafts alone.

## How to stay deployable

After every phase the current Time Out path must still clock people out.

- Phases 1–5 add the form UI and a read-only server call. They do not replace the three `POST /api/timelogs/time-out` calls in [app/(tabs)/(shifts)/timekeeping-punch.jsx](../app/(tabs)/(shifts)/timekeeping-punch.jsx).
- Phase 6 teaches the server to store answers and the photo when a new app sends them. A request without those fields still clocks out as it does today, so installed builds keep working.
- Phase 7 is the first build that shows the form on the real Time Out path and sends the combined request.
- Phase 8 turns on server rejection when a form applies and the photo or answers are missing. Ship it in the same release as the Phase 7 app. Shipping it earlier blocks clock-out for every older build while the company is in forms mode.
- Phase 9 adds Add report on the time card for punches that closed with no questionnaire, including automatic clock-out. It does not change Time Out or `timeOut`.

## Visual rules

Match the punch-screen bottom sheet. Do not introduce a new palette.

- Sheet: white, top radius 10, grab handle 40×4, dimmed backdrop `rgba(0,0,0,0.5)`.
- Title: `text-2xl font-bold text-slate-900`. Body: `text-base text-slate-600`.
- Cards: `bg-slate-50 rounded-2xl p-5 border border-slate-200`.
- Primary button: `py-4 rounded-2xl bg-slate-900`, label `text-white font-bold text-base`.
- Secondary button: `py-3.5 rounded-2xl bg-slate-100 border border-slate-200`, label `text-slate-700 font-semibold text-base`.
- Icons: Ionicons, slate `#475569` or blue `#3b82f6`, same sizes as the clock-out confirm sheet.
- Errors: `text-sm text-red-600`. Required star: `text-red-500`.
- Warnings (camera or location denied): amber card, same classes as the “Past scheduled end” card (`bg-amber-50 border-amber-200`).

The questionnaire is long, so the sheet’s `maxHeight` is `height * 0.92`, same idea as the request-punch sheet. Keep `keyboardShouldPersistTaps="handled"`.

---

## Phase 1 — Form skeleton with mocked data

**Done when:** a developer-only control opens a sheet filled with a fake questionnaire and a fake face preview. Release builds do not show that control. Time Out is unchanged.

**Deployable because:** no production path calls the new component.

### 1.1 Add the mock form

- [ ] Create `components/task-report/mockTaskReportForm.js`.

```js
export const MOCK_TASK_REPORT = {
  required: true,
  timeLogId: "mock-open-punch",
  assignedVia: "department",
  shift: { id: "shift-1", name: "Day" },
  form: {
    id: "form-1",
    name: "End of shift",
    description: "Answer this before you clock out.",
    questions: [
      { id: "q1", type: "short_text", label: "What did you finish?", helpText: "One line.", required: true, options: [] },
      { id: "q2", type: "paragraph", label: "Notes", helpText: null, required: false, options: [] },
      { id: "q3", type: "single_choice", label: "Area", helpText: null, required: true, options: ["Floor", "Office"] },
      { id: "q4", type: "dropdown", label: "Site", helpText: null, required: true, options: ["North", "South"] },
      { id: "q5", type: "checkboxes", label: "Tools used", helpText: null, required: false, options: ["Radio", "Van"] },
      { id: "q6", type: "yes_no", label: "Any incident?", helpText: null, required: true, options: [] },
      { id: "q7", type: "number", label: "Stops", helpText: null, required: false, options: [] },
      { id: "q8", type: "date", label: "Follow-up date", helpText: null, required: false, options: [] },
      { id: "q9", type: "time", label: "Follow-up time", helpText: null, required: false, options: [] },
    ],
  },
};
```

- `MOCK_TASK_REPORT` is the only data Phase 1 reads.
- `required: true` means the sheet should render. Later, `required: false` means “no form, clock out normally.”
- `assignedVia` and `shift` match the resolver the server already uses. The sheet may show the shift name. It must not offer another form.
- `questions` covers every type in the PRD, in stored order, with the `{ id, type, label, helpText, required, options }` shape.

### 1.2 Render one question

- [ ] Create `components/task-report/QuestionField.jsx`.

```jsx
import { Text, TextInput, TouchableOpacity, View } from "react-native";

export default function QuestionField({ question, value, onChange }) {
  const label = (
    <Text className="text-base font-semibold text-slate-800 mb-1">
      {question.label}
      {question.required ? <Text className="text-red-500"> *</Text> : null}
    </Text>
  );

  if (question.type === "short_text" || question.type === "paragraph" || question.type === "number") {
    return (
      <View className="mb-4">
        {label}
        {question.helpText ? <Text className="text-sm text-slate-500 mb-2">{question.helpText}</Text> : null}
        <TextInput
          className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-base text-slate-900"
          value={value == null ? "" : String(value)}
          onChangeText={(text) => onChange(question.type === "number" ? text : text)}
          multiline={question.type === "paragraph"}
          keyboardType={question.type === "number" ? "decimal-pad" : "default"}
        />
      </View>
    );
  }

  return (
    <View className="mb-4">
      {label}
      <Text className="text-sm text-slate-400">Unsupported in this step: {question.type}</Text>
    </View>
  );
}
```

- The label row always shows the question text. The red star is only for `required`.
- Help text is optional. Skip the node when `helpText` is null.
- Text, paragraph, and number share one input. Paragraph sets `multiline`. Number uses the decimal keypad.
- `value == null ? "" : String(value)` keeps the input controlled before the employee types.
- This first slice only implements three types so the file stays small. The next step fills the rest. The fallback line makes a missed type obvious during the mock review.

- [ ] Add the choice, yes/no, date, and time branches in the same file, above the fallback `return`.

```jsx
if (question.type === "yes_no") {
  return (
    <View className="mb-4">
      {label}
      <View className="flex-row">
        {[
          ["Yes", true],
          ["No", false],
        ].map(([caption, next]) => {
          const selected = value === next;
          return (
            <TouchableOpacity
              key={caption}
              onPress={() => onChange(next)}
              className={`mr-2 px-4 py-3 rounded-2xl border ${selected ? "bg-slate-900 border-slate-900" : "bg-slate-50 border-slate-200"}`}
            >
              <Text className={selected ? "text-white font-semibold" : "text-slate-800 font-semibold"}>{caption}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
```

- Yes and No are booleans, not the strings `"yes"` and `"no"`. That matches the server’s `yes_no` rule.
- The selected chip uses the same slate-900 fill as the primary button. The idle chip uses the slate card border.
- `value === next` is strict, so `false` stays a real “No” and is not treated as empty.

```jsx
if (question.type === "single_choice" || question.type === "dropdown" || question.type === "checkboxes") {
  const selected = Array.isArray(value) ? value : [];
  return (
    <View className="mb-4">
      {label}
      {question.options.map((option) => {
        const on = question.type === "checkboxes" ? selected.includes(option) : value === option;
        return (
          <TouchableOpacity
            key={option}
            onPress={() => {
              if (question.type === "checkboxes") {
                onChange(on ? selected.filter((item) => item !== option) : [...selected, option]);
              } else {
                onChange(option);
              }
            }}
            className={`mb-2 px-4 py-3 rounded-2xl border ${on ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}
          >
            <Text className="text-base text-slate-800">{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
```

- Single choice and dropdown both store one option string. Checkboxes store an array.
- Tapping a selected checkbox removes it. Tapping a new one appends it. Order cleanup happens later in the validator, which follows form order.
- Selected rows use the same blue wash as the “until scheduled shift end” chip (`bg-blue-50`).

```jsx
if (question.type === "date" || question.type === "time") {
  return (
    <View className="mb-4">
      {label}
      <TextInput
        className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-base text-slate-900"
        placeholder={question.type === "date" ? "YYYY-MM-DD" : "HH:mm"}
        value={value == null ? "" : String(value)}
        onChangeText={onChange}
        autoCapitalize="none"
      />
    </View>
  );
}
```

- Phase 1 accepts typed dates and times. A native picker can replace the keyboard later. The stored value is still `YYYY-MM-DD` or `HH:mm`.

### 1.3 Face segment placeholder

- [ ] Create `components/task-report/FaceCaptureSegment.jsx`.

```jsx
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function FaceCaptureSegment() {
  return (
    <View className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-200">
      <View className="flex-row items-center mb-2">
        <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center mr-3">
          <Ionicons name="camera-outline" size={18} color="#3b82f6" />
        </View>
        <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Face check</Text>
      </View>
      <View className="h-40 rounded-2xl bg-slate-200 items-center justify-center mb-3">
        <Text className="text-sm text-slate-600">Camera preview comes in Phase 3</Text>
      </View>
      <Text className="text-sm text-slate-600">A face photo is required. Location, date, and time will be printed on it.</Text>
    </View>
  );
}
```

- This is the last block in the form. It is always present. It is not one of the admin question types.
- The icon circle matches the scheduled-shift card on the clock-out sheet.
- The gray box stands in for the photo until the camera phase. No gallery button.

### 1.4 Assemble the sheet

- [ ] Create `components/task-report/TaskReportFormSheet.jsx`.

```jsx
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import QuestionField from "./QuestionField";
import FaceCaptureSegment from "./FaceCaptureSegment";

export default function TaskReportFormSheet({ report, onCancel, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const form = report.form;

  return (
    <ScrollView className="px-6" keyboardShouldPersistTaps="handled">
      <Text className="text-2xl font-bold text-slate-900 mb-2 text-center">{form.name}</Text>
      {form.description ? (
        <Text className="text-base text-slate-600 text-center mb-4">{form.description}</Text>
      ) : null}
      {report.shift?.name ? (
        <Text className="text-sm text-slate-500 text-center mb-4">{report.shift.name}</Text>
      ) : null}
      {form.questions.map((question) => (
        <QuestionField
          key={question.id}
          question={question}
          value={answers[question.id]}
          onChange={(next) => setAnswers((prev) => ({ ...prev, [question.id]: next }))}
        />
      ))}
      <FaceCaptureSegment />
      <TouchableOpacity onPress={() => onSubmit(answers)} className="py-4 rounded-2xl items-center bg-slate-900 mb-3">
        <Text className="text-white font-bold text-base">Submit and clock out</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} className="py-3.5 rounded-2xl items-center bg-slate-100 border border-slate-200 mb-8">
        <Text className="text-slate-700 font-semibold text-base">Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
```

- `answers` is `{ questionId: value }`, the same object the server already stores.
- `setAnswers` copies the previous object and replaces one key, so other answers stay put.
- Questions render in array order. The face block is after that map, never inside it.
- Submit only reports the answers upward. Phase 1’s parent shows an alert and does not call the time-out API.
- Cancel calls `onCancel` and does not submit.

### 1.5 Open it from the punch screen without touching Time Out

- [ ] In `timekeeping-punch.jsx`, import the sheet and `MOCK_TASK_REPORT`.
- [ ] Add `const [taskReportPreview, setTaskReportPreview] = useState(false);`
- [ ] Render the existing bottom-sheet `Modal` pattern when `taskReportPreview` is true. Put `TaskReportFormSheet` in the white sheet. `onCancel` and `onSubmit` both call `setTaskReportPreview(false)`. `onSubmit` may `Alert.alert("Preview", "Clock-out was not sent.")`.
- [ ] Add the opener only in development:

```jsx
{__DEV__ ? (
  <TouchableOpacity onPress={() => setTaskReportPreview(true)} className="py-3 items-center">
    <Text className="text-sm text-slate-500">Preview end-of-shift form</Text>
  </TouchableOpacity>
) : null}
```

- `__DEV__` is false in a release binary, so store builds do not show the control.
- The handler only flips local state. It does not call `handlePunch` or `POST /api/timelogs/time-out`.

### 1.6 Checkpoint

- [ ] In a dev build, open the preview and confirm every mock question, the face placeholder, Submit, and Cancel.
- [ ] Confirm Cancel and Submit leave the employee clocked in.
- [ ] Clock out through the normal confirm path and both deviation choices. Each one still hits `/api/timelogs/time-out` with no form.

---

## Phase 2 — Answer validation on the device

**Done when:** Submit stays on the sheet until required answers are present and shaped correctly. The server is still not called.

**Deployable because:** the live Time Out buttons are still untouched.

### 2.1 Pure validator

- [ ] Create `utils/taskReportAnswers.js`. Keep it free of React so Jest can load it.

```js
const LIMITS = { short_text: 500, paragraph: 5000 };

const isBlank = (value) =>
  value == null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

export function validateAnswers(questions, answers) {
  const errors = {};
  const cleaned = {};
  for (const question of questions) {
    const raw = answers?.[question.id];
    if (isBlank(raw)) {
      if (question.required) errors[question.id] = "This question is required.";
      continue;
    }
    const result = cleanOne(question, raw);
    if (result.error) errors[question.id] = result.error;
    else cleaned[question.id] = result.value;
  }
  return { ok: Object.keys(errors).length === 0, errors, cleaned };
}

function cleanOne(question, raw) {
  if (question.type === "short_text" || question.type === "paragraph") {
    const text = String(raw).trim();
    if (text.length > LIMITS[question.type]) return { error: `At most ${LIMITS[question.type]} characters.` };
    return { value: text };
  }
  if (question.type === "number") {
    const num = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(num)) return { error: "Enter a number." };
    return { value: num };
  }
  if (question.type === "yes_no") {
    if (typeof raw !== "boolean") return { error: "Choose yes or no." };
    return { value: raw };
  }
  if (question.type === "single_choice" || question.type === "dropdown") {
    if (!question.options.includes(raw)) return { error: "Choose one of the options." };
    return { value: raw };
  }
  if (question.type === "checkboxes") {
    if (!Array.isArray(raw) || raw.some((item) => !question.options.includes(item))) {
      return { error: "Choose from the options." };
    }
    return { value: question.options.filter((option) => raw.includes(option)) };
  }
  if (question.type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return { error: "Use YYYY-MM-DD." };
    return { value: String(raw) };
  }
  if (question.type === "time") {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw))) return { error: "Use HH:mm." };
    return { value: String(raw) };
  }
  return { error: "Unsupported question." };
}
```

- `isBlank` treats null, empty text, and an empty checkbox list as unanswered. The boolean `false` is not blank.
- Required blanks become an error and are omitted from `cleaned`. Optional blanks are omitted with no error.
- Text is trimmed. The caps match the server (`500` and `5000`).
- Numbers accept a keypad string or a real number, and reject `NaN`.
- Checkbox output is filtered through `question.options`, so duplicates drop out and the order matches the form.
- Unknown question ids in `answers` are never copied, because the loop walks `questions` only.
- Date and time checks are format checks. Phase 2 does not need a date library.

### 2.2 Show the errors

- [ ] Pass `error` into `QuestionField` and render it under the control:

```jsx
{error ? <Text className="text-sm text-red-600 mt-1">{error}</Text> : null}
```

- [ ] In `TaskReportFormSheet`, validate before calling `onSubmit`:

```jsx
const result = validateAnswers(form.questions, answers);
if (!result.ok) {
  setErrors(result.errors);
  return;
}
setErrors({});
onSubmit(result.cleaned);
```

- `setErrors` keeps the employee on the sheet.
- `onSubmit` receives `cleaned`, not the raw keypad strings, so a later request does not send `"  "` or `"12abc"`.
- Clearing `errors` on success avoids showing stale red text if the parent reopens the sheet.

### 2.3 Testing checkpoint

- [ ] Add `utils/taskReportAnswers.test.js` and run `npm test -- utils/taskReportAnswers.test.js`.

```js
import { validateAnswers } from "./taskReportAnswers";

const questions = [
  { id: "a", type: "short_text", required: true, options: [] },
  { id: "b", type: "yes_no", required: true, options: [] },
  { id: "c", type: "checkboxes", required: false, options: ["Radio", "Van"] },
];

test("required blank blocks submit", () => {
  const result = validateAnswers(questions, {});
  expect(result.ok).toBe(false);
  expect(result.errors.a).toBeTruthy();
});

test("no is a real answer", () => {
  const result = validateAnswers(questions, { a: "Done", b: false });
  expect(result.ok).toBe(true);
  expect(result.cleaned.b).toBe(false);
});

test("checkboxes come back in form order", () => {
  const result = validateAnswers(questions, { a: "Done", b: true, c: ["Van", "Van", "Radio"] });
  expect(result.cleaned.c).toEqual(["Radio", "Van"]);
});
```

- The first test is the “stay clocked in” rule on the client.
- The second locks the boolean rule so a later refactor does not turn “No” into missing.
- The third locks de-duplication and form order.

- [ ] On the preview sheet, leave a required mock question empty and confirm Submit does not close the sheet.
- [ ] Fill the required mock questions and confirm Submit still only shows the preview alert.

---

## Phase 3 — Face capture and the inscription

**Done when:** the face segment takes a front-camera photo, draws location and company-local date and time onto the pixels, and shows that exact image. Gallery import is impossible. The live Time Out path still does not upload it.

**Deployable because:** the camera is mounted only while the preview sheet is open, and release builds still hide that sheet.

### 3.1 Dependencies and permission copy

- [ ] From the app repo, install the camera and a view capture library:

```bash
npx expo install expo-camera react-native-view-shot
```

- `expo-camera` takes the picture. `react-native-view-shot` flattens the photo plus the text overlay into one JPEG, which is what “drawn on the pixels” means. EXIF alone does not count.

- [ ] In `app.json`, add the usage strings next to the existing location strings.

```json
"NSCameraUsageDescription": "BizBuddy uses the camera so you can take a face photo when you clock out. The photo is stamped with the time and place of the capture."
```

- [ ] Add `"android.permission.CAMERA"` to the Android `permissions` array.
- [ ] Add the `expo-camera` config plugin beside the other plugins:

```json
[
  "expo-camera",
  { "cameraPermission": "BizBuddy uses the camera so you can take a face photo when you clock out." }
]
```

- Rebuild the dev client after this step. A Metro reload does not apply new native permissions.

**Security:** the permission text says the photo is for clock-out certification. Do not request the photo library. Do not set `cameraType` to the back camera.

### 3.2 Inscription text

- [ ] Create `utils/taskReportWatermark.js`.

```js
export function buildInscription({ latitude, longitude, capturedAt, timeZone }) {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "America/Los_Angeles",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(capturedAt);
  const lat = Number(latitude).toFixed(5);
  const lng = Number(longitude).toFixed(5);
  return `${lat}, ${lng} · ${when}`;
}
```

- `capturedAt` is the `Date` from the moment the shutter fires, not the moment of upload.
- `timeZone` is the company zone already stored in `companySettingsTimeZoneRef`. The fallback matches the server default `America/Los_Angeles`.
- Five decimal places is about one meter. Enough to certify a place without pretending the GPS is more precise than it is.
- The function returns one line so the overlay and the tests share it.

### 3.3 Capture component

- [ ] Replace the placeholder body of `FaceCaptureSegment.jsx` with a component that takes `timeZone`, `onChange`, and reports `{ uri, inscription }` or `null`.

```jsx
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import ViewShot from "react-native-view-shot";
import { buildInscription } from "../../utils/taskReportWatermark";

export default function FaceCaptureSegment({ timeZone, onChange }) {
  const shotRef = useRef(null);
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [shot, setShot] = useState(null);
  const [blockReason, setBlockReason] = useState(null);

  async function takePhoto() {
    setBlockReason(null);
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    const inscription = buildInscription({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      capturedAt: new Date(),
      timeZone,
    });
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
    setShot({ uri: photo.uri, inscription });
  }

  async function stamp() {
    const uri = await shotRef.current.capture();
    onChange({ uri, inscription: shot.inscription });
  }

  if (!permission?.granted) {
    return (
      <View className="bg-amber-50 rounded-2xl p-5 mb-6 border border-amber-200">
        <Text className="text-base text-amber-950 mb-3">Camera access is required to clock out.</Text>
        <Text onPress={requestPermission} className="text-base font-semibold text-slate-900">Allow camera</Text>
      </View>
    );
  }

  return (
    <View className="mb-6">
      {shot ? (
        <ViewShot ref={shotRef} options={{ format: "jpg", quality: 0.8 }} onLayout={stamp}>
          <View>
            <Image source={{ uri: shot.uri }} style={{ width: "100%", height: 280 }} />
            <Text className="absolute bottom-2 left-2 right-2 text-white text-xs">{shot.inscription}</Text>
          </View>
        </ViewShot>
      ) : (
        <CameraView ref={cameraRef} facing="front" style={{ height: 280 }} />
      )}
      {blockReason ? <Text className="text-sm text-red-600 mt-2">{blockReason}</Text> : null}
    </View>
  );
}
```

- `facing="front"` is fixed. There is no control that switches cameras and no `ImagePicker`.
- Location is read immediately before `takePictureAsync`. If `getCurrentPositionAsync` throws, set `blockReason` to “Location is required to stamp the photo.” and do not call `onChange`.
- `buildInscription` runs at shutter time. Upload time must not rebuild it.
- `ViewShot` captures the image and the white text together. `onChange` receives that JPEG uri. The parent keeps it so a failed upload can retry without a retake.
- Add a “Retake” text button that sets `shot` to null and calls `onChange(null)`.
- Add `import { Image } from "react-native"` next to the other React Native imports. The snippet above uses it for the stamped preview.
- Call `stamp` from the Retake’s opposite button (“Use photo”) instead of `onLayout` if the layout capture races. The button is easier to reason about: it runs only after the overlay has painted.

**Security:** a denied camera or a failed location fix never calls `onChange` with a uri. The sheet’s Submit stays disabled while `facePhoto` is null. Do not log the uri with the auth token.

### 3.4 Hold the photo on the sheet

- [ ] In `TaskReportFormSheet`, add `const [facePhoto, setFacePhoto] = useState(null);`
- [ ] Pass `onChange={setFacePhoto}` and `timeZone`.
- [ ] Extend the submit handler:

```jsx
if (!facePhoto?.uri) {
  setFaceError("Take a face photo to clock out.");
  return;
}
onSubmit({ answers: result.cleaned, facePhoto });
```

- The parent in Phase 3 still does not post. It can `Alert.alert` the inscription so you can read the stamp.
- Submit remains disabled in spirit: the handler returns before `onSubmit` when the photo is missing.

### 3.5 Testing checkpoint

- [ ] Add `utils/taskReportWatermark.test.js`.

```js
import { buildInscription } from "./taskReportWatermark";

test("uses the company zone and the shutter instant", () => {
  const line = buildInscription({
    latitude: 14.5995,
    longitude: 120.9842,
    capturedAt: new Date("2026-11-19T05:41:00.000Z"),
    timeZone: "Asia/Manila",
  });
  expect(line).toContain("14.59950, 120.98420");
  expect(line).toContain("1:41 PM");
});
```

- `2026-11-19T05:41:00Z` is 1:41 PM in Manila. The test fails if the stamp uses the device zone or UTC by mistake.

- [ ] On a device, allow the camera, take a photo, and confirm the preview shows coordinates plus the company-local time.
- [ ] Deny the camera, then deny location, and confirm each block is the amber or red message and Submit does not proceed.
- [ ] Confirm there is no photo-library button.
- [ ] Clock out for real once. It must still ignore the preview sheet.

---

## Phase 4 — Server: resolve the open punch

**Done when:** `GET /api/task-report-forms/me/open` tells the signed-in employee whether the still-open punch has a form. The old “clock out first” route is unchanged. Time-out behavior is unchanged.

**Deployable because:** this is a new read. Installed apps never call it.

Work in `bizbuddy-server`.

### 4.1 Load the open punch

- [ ] In `src/services/Features/taskReportFormResponseService.js`, add a loader that does not use `loadOwnPunch`.

```js
async function loadOpenPunch(actor) {
  const punch = await prisma.timeLog.findFirst({
    where: { userId: actor.id, timeOut: null },
    orderBy: { timeIn: "desc" },
  });
  if (!punch) throw err(404, "You are not clocked in.", "NO_OPEN_PUNCH");
  return punch;
}
```

- `userId: actor.id` is the ownership check. A time-log id from another employee never matches.
- `timeOut: null` is what makes this the open punch. Do not call `loadOwnPunch`, which throws `STILL_CLOCKED_IN`.
- `orderBy: { timeIn: "desc" }` picks the latest open row if bad data ever left two.

### 4.2 Resolve it

- [ ] Add `openForActivePunch(actor)` next to `openForPunch`.

```js
async function openForActivePunch(actor) {
  const company = await loadCompany(actor.companyId);
  const punch = await loadOpenPunch(actor);
  if (!formsOn(company)) {
    return { required: false, timeLogId: punch.id };
  }
  const user = await loadUser(actor.id);
  const tz = zoneOf(company);
  const hit = (await assignments.resolveForPunches(user, [punch], tz)).get(punch.id);
  if (!hit) return { required: false, timeLogId: punch.id };
  return {
    required: true,
    timeLogId: punch.id,
    assignedVia: hit.assignedVia,
    shift: hit.shift ? { id: hit.shift.id, name: hit.shift.name } : null,
    form: snapshotOf(hit.form),
  };
}
```

- `formsOn` is the existing check: task reports enabled and mode `forms`. Anything else returns `required: false` and no questions.
- `resolveForPunches` already applies shift, then employee, then department, then company-wide, and it ignores archived forms. Do not reimplement that order here.
- `snapshotOf` copies id, name, description, and questions. The app renders that copy. The submit phase resolves again and does not trust this payload as the write source.
- The response has no answers, no other employee, and no image.

- [ ] Export `openForActivePunch` from `module.exports`.

### 4.3 Route

- [ ] In `src/controllers/Features/taskReportFormController.js`, add a handler that `res.json({ data: await responseSvc.openForActivePunch(req.user) })`.
- [ ] In `src/routes/Features/taskReportFormRoutes.js`, register it with the existing `self` middleware (`authenticate` plus `blockSystemAgent`), above `/:id`:

```js
router.get("/me/open", ...self, c.myOpenActive);
```

**Security:**

- Missing or bad bearer token fails in `authenticate`, same as the other `/me` routes.
- `blockSystemAgent` keeps B. Buddy off this route.
- The action uses `req.user.id` only. It does not take a `timeLogId` from the query string, so a caller cannot ask about someone else’s open punch.
- Errors stay `{ message, code }` through the existing `handle` wrapper. Do not add a stack trace to the JSON.

### 4.4 Testing checkpoint

- [ ] Add `tests/taskReportOpenPunch.test.js` using `node:test` for any pure piece you extract (for example a function that maps a resolver hit to `{ required: true | false }`). Run it with the same command the other tests in `tests/` use.
- [ ] With a token for a clocked-in employee whose company is in forms mode, `GET /api/task-report-forms/me/open` returns `required: true` and the department form when no shift or employee form exists.
- [ ] Repeat with a shift assignment and confirm `assignedVia` is `shift` even if a department form also exists.
- [ ] With forms mode off, the same call returns `required: false`.
- [ ] Call it as the system agent and confirm the existing block response.
- [ ] Call `GET /api/task-report-forms/me/punch/:timeLogId` on that still-open punch and confirm it still returns `STILL_CLOCKED_IN`.
- [ ] Clock out with the current app and confirm the body is unchanged.

---

## Phase 5 — The sheet reads the real form

**Done when:** the dev preview loads `GET /me/open` instead of the mock. `required: false` shows an explanation and does not pretend there are questions. Time Out still uses the old posts.

**Deployable because:** only the `__DEV__` preview calls the new route.

### 5.1 Client fetch

- [ ] Create `utils/taskReportApi.js`.

```js
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config/constant";

export async function fetchOpenTaskReport() {
  const token = await SecureStore.getItemAsync("token");
  const res = await axios.get(`${API_BASE_URL}/api/task-report-forms/me/open`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.data;
}
```

- The token stays in the header. Do not write it into `devLog`.
- `res.data.data` is the `{ required, timeLogId, form, ... }` object from Phase 4.
- If the request throws, the preview shows the amber card “You need to be online to load the end-of-shift form.” and does not invent a form.

Confirm the `API_BASE_URL` import path against `timekeeping-punch.jsx`. Use that same module.

### 5.2 Swap the mock

- [ ] When the preview opens, set a loading flag, call `fetchOpenTaskReport`, and store the result.
- [ ] If `required` is false, render a short slate card: “No end-of-shift form applies. Clock-out will not ask for one.” Do not render questions or the camera.
- [ ] If `required` is true, pass that payload into `TaskReportFormSheet` instead of `MOCK_TASK_REPORT`.
- [ ] Keep `MOCK_TASK_REPORT` in the repo for the Jest fixtures if you want, but the preview must not import it anymore.

### 5.3 Testing checkpoint

- [ ] Clock in as an employee with a department form. Open the preview and confirm the labels match the admin form, not the mock.
- [ ] Clock in as an employee with no matching assignment. The preview says no form applies.
- [ ] Turn the device offline and open the preview. The sheet shows the online message and does not crash.
- [ ] Use the real Time Out button. It must still skip the sheet.

---

## Phase 6 — Server stores the photo with the clock-out

**Done when:** a multipart `POST /api/timelogs/time-out` that includes valid answers and a face image closes the punch and inserts one submitted response in the same transaction. A normal JSON clock-out, the kind the current app sends, still succeeds with no photo.

**Deployable because:** missing answers and a missing file do not fail the request yet. Phase 8 turns that rejection on.

### 6.1 Columns for the image

- [ ] On `TaskReportFormResponse` in `src/prisma/schema.prisma`, add nullable fields and migrate:

```prisma
facePhotoFileName String?
facePhotoMimeType String?
facePhotoBytes    Bytes?
```

- Nulls keep every existing response valid.
- Bytes live on the response row, the same way disbursement stores a payment-proof file. The clock-out JSON must not echo `facePhotoBytes`.
- One response per time log is already enforced by `timeLogId @unique`.

### 6.2 Accept a file only on the multipart path

- [ ] Where the time-out route is registered, branch on the content type:

```js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function maybeFacePhoto(req, res, next) {
  if (req.is("multipart/form-data")) return upload.single("facePhoto")(req, res, next);
  next();
}
```

- JSON clients skip multer and keep today’s parser.
- 5 MB matches the disbursement proof limit. Oversize files fail before any punch is written.
- The field name is `facePhoto`. Any other file field is ignored.

- [ ] Add a helper that checks the buffer, not the client’s file name:

```js
function assertFacePhoto(file) {
  if (!file?.buffer?.length) {
    const error = new Error("A face photo is required.");
    error.status = 400;
    error.code = "FACE_PHOTO_REQUIRED";
    throw error;
  }
  const jpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
  const png = file.buffer[0] === 0x89 && file.buffer[1] === 0x50;
  if (!jpeg && !png) {
    const error = new Error("The face photo must be a JPEG or PNG.");
    error.status = 400;
    error.code = "FACE_PHOTO_REQUIRED";
    throw error;
  }
}
```

**Security:** the MIME string from the phone is not trusted. Magic bytes are. Do not log `file.buffer`.

### 6.3 Parse answers without trusting the form id

- [ ] Inside the time-out handler, after the open punch is loaded and before it is updated:

```js
let taskReportWrite = null;
if (req.is("multipart/form-data") && req.body.answers) {
  const answers = JSON.parse(req.body.answers);
  const company = await loadCompany(req.user.companyId);
  if (formsOn(company)) {
    const user = await loadUser(req.user.id);
    const hit = (await assignments.resolveForPunches(user, [activeLog], zoneOf(company))).get(activeLog.id);
    if (hit) {
      assertFacePhoto(req.file);
      const form = snapshotOf(hit.form);
      const cleaned = cleanAnswers(form.questions, answers, { submit: true });
      taskReportWrite = { form, cleaned, hit, file: req.file };
    }
  }
}
```

- The server resolves the form again from the open punch. A `formId` sent by the client is ignored.
- `cleanAnswers` is the existing submit cleaner. Required questions throw `REQUIRED_ANSWER`. Bad shapes throw `INVALID_ANSWER`.
- `JSON.parse` of a non-object should be caught and returned as `400 INVALID_ANSWER`. Reject arrays. That is the same rule `cleanAnswers` already has.
- If forms are off or nothing matches, leave `taskReportWrite` null and ignore a stray file. The punch still closes.
- Wrap `JSON.parse` so a huge or broken string becomes a 400, not a 500.

### 6.4 One transaction

- [ ] Move the `prisma.timeLog.update` that sets `timeOut` into `prisma.$transaction` when `taskReportWrite` is set, and create the response in that same callback.

```js
const [updatedTimeLog] = await prisma.$transaction([
  prisma.timeLog.update({ where: { id: activeLog.id }, data: updateData }),
  prisma.taskReportFormResponse.create({
    data: {
      companyId: req.user.companyId,
      userId: req.user.id,
      timeLogId: activeLog.id,
      punchDate: dbDate(ymdInZone(activeLog.timeIn, tz)),
      formId: taskReportWrite.form.id,
      form: taskReportWrite.form,
      assignedVia: taskReportWrite.hit.assignedVia,
      shiftId: taskReportWrite.hit.shift?.id ?? null,
      shiftName: taskReportWrite.hit.shift?.name ?? null,
      answers: taskReportWrite.cleaned,
      status: "submitted",
      submittedAt: new Date(),
      closesAt: new Date(),
      facePhotoFileName: "face.jpg",
      facePhotoMimeType: taskReportWrite.file.mimetype,
      facePhotoBytes: taskReportWrite.file.buffer,
    },
  }),
]);
```

- Both writes use the transaction array form, so a failed insert rolls the time-log update back. The employee stays clocked in and no response row remains.
- `status: "submitted"` and `submittedAt` lock it. This path does not write drafts.
- `closesAt` is required by the current model. Set it to the submit instant. This flow does not use the 14-day answer window.
- `punchDate` uses the same company-zone helper the post-clock-out saver uses.
- Run `applyAutoBreaks` and `computeTimeLogSummary` only after the transaction commits, and keep them non-fatal, as they are today.
- On the unique-constraint error `P2002`, return `409` and do not leave a second response. The punch update rolls back with it.
- When `taskReportWrite` is null, keep the existing single `timeLog.update`. Do not open a transaction you do not need.

**Security:** `userId` and `companyId` come from `req.user` and the loaded punch, not from the multipart body. Discard body fields named `userId`, `companyId`, or `form`.

### 6.5 Testing checkpoint

- [ ] Multipart clock-out with valid answers and a tiny JPEG closes the punch and creates one submitted response whose `facePhotoBytes` start with `FF D8`.
- [ ] The same call with a required answer missing returns `REQUIRED_ANSWER`, the punch is still open, and no response exists.
- [ ] A PNG header is accepted. A text file renamed to `.jpg` returns `FACE_PHOTO_REQUIRED`, and the punch stays open.
- [ ] A JSON clock-out with no file, sent the way the app sends it today, still returns 200 and does not create a response.
- [ ] Two parallel multipart submits for one punch produce one response, not two.
- [ ] `GET /api/task-report-forms/me/punch/:id` for an older closed punch that has no response still opens the post-clock-out questionnaire.

---

## Phase 7 — Gate the real clock-out

**Done when:** after confirm, and after a deviation choice when that sheet appears, the app either sends the old JSON clock-out (no form) or sends answers plus the stamped photo and waits for success. Cancel and failure leave the employee clocked in. All three current time-out call sites use this.

**Deployable because:** companies with forms mode off, and punches with no matching form, still post JSON. Older installed builds still post JSON, and Phase 6 accepts that.

### 7.1 Remember that forms mode is on

- [ ] Where `fetchCompanySettingsForPunch` stores the timezone ref, also store:

```js
companySettingsTaskReportFormsRef.current =
  raw.taskReportEnabled === true && raw.taskReportMode === "forms";
```

- Read the flags from the same `raw` object the punch screen already normalizes. If the payload nests them, use the same fallback chain as `timeZone`.
- Reset the ref to `false` in the `catch` only if you also treat “settings failed to load” as “do not punch,” which the screen already does via `companySettingsFetched`.
- Do not log the whole settings response if it starts including anything sensitive. The existing `devLog` of `responseData` is enough to trim in this step if the payload grows.

### 7.2 Block offline clock-out in forms mode

- [ ] In `handlePunch`, next to the existing offline checks, before a clock-out is queued:

```js
if (isTimeIn && companySettingsTaskReportFormsRef.current && !wifiConnected) {
  setLoading(false);
  Alert.alert(
    "Online required",
    "You must be online to complete the end-of-shift form before clocking out.",
  );
  return;
}
```

- `isTimeIn` means the next punch is a clock-out in this screen’s naming.
- This runs only in forms mode. Pro offline queue, location restriction, and non-pro online rules stay as they are when the flag is false.
- Do not store a pending offline time-out in this branch.

### 7.3 Insert the gate before each post

The three posts are the normal confirm path and the Regular and Driver/Aide deviation buttons. Build one function and call it from all three.

- [ ] Add `beginClockOut(payload)`:

```js
async function beginClockOut(payload) {
  const report = await fetchOpenTaskReport();
  if (!report.required) {
    await postClockOutJson(payload);
    return;
  }
  setPendingClockOutPayload(payload);
  setTaskReport(report);
  openModal("taskReport");
}
```

- `payload` is the object those call sites already build: token, device info, location, `localTimestamp`, and `punchType` when the deviation path set one.
- `fetchOpenTaskReport` failure shows the server message or “You must be online to complete the end-of-shift form.” and returns without posting.
- `postClockOutJson` is the existing `axios.post` of the JSON body. Move that block into the helper so the three sites do not drift.
- Opening `taskReport` uses the same bottom-sheet modal as clock-out confirm. Add `taskReport` to `openModal` / `closeModal`.

- [ ] After the employee confirms clock-out, and after they pick Regular or Driver/Aide, call `beginClockOut` instead of `axios.post`.

### 7.4 Submit the combined request

- [ ] On sheet submit:

```js
async function submitTaskReportClockOut({ answers, facePhoto }) {
  const token = await SecureStore.getItemAsync("token");
  const payload = pendingClockOutPayload;
  const body = new FormData();
  body.append("deviceInfo", JSON.stringify(payload.deviceInfo));
  body.append("location", JSON.stringify(payload.location));
  body.append("localTimestamp", payload.localTimestamp);
  if (payload.punchType) body.append("punchType", payload.punchType);
  body.append("answers", JSON.stringify(answers));
  body.append("facePhoto", {
    uri: facePhoto.uri,
    name: "face.jpg",
    type: "image/jpeg",
  });
  const res = await axios.post(`${API_BASE_URL}/api/timelogs/time-out`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res;
}
```

- Do not set `Content-Type` yourself. Axios must add the multipart boundary. A hand-set `multipart/form-data` header drops the boundary and the server cannot read the file.
- `punchType` is appended only when the deviation path set it, so a normal clock-out does not send an empty type.
- `answers` is the cleaned object from Phase 2.
- `facePhoto.uri` is the stamped JPEG from Phase 3, not the raw camera file.

- [ ] On status 200 or 201, run the same success path the JSON clock-out uses (`Alert` with the server message, then `resetAllStates`).
- [ ] On failure, leave `isTimeIn` true, keep `answers` and `facePhoto` in state, and `Alert.alert` `error.response.data.message` when it exists.
- [ ] Cancel closes the sheet and clears nothing on the server. Do not call `postClockOutJson` from Cancel.

**Security:** a client-side pass is not clock-out. Only the 200/201 response resets the punch UI. Ignore a `taskReportForm` prompt in that response when this request included the photo, so the employee is not asked to answer again.

### 7.5 Testing checkpoint

- [ ] Forms mode off: Time Out never shows the sheet and the JSON body matches a clock-out from before this phase.
- [ ] Forms mode on, no assignment: same as above.
- [ ] Department form, no shift or employee form: the sheet appears after confirm. Cancel leaves the shift open. Submit with a blank required answer stays on the sheet.
- [ ] Submit with answers and a stamped photo clocks out, and the stored image shows the same line as the preview.
- [ ] Repeat from both deviation choices. The request includes `DRIVER_AIDE` or `REGULAR` as chosen.
- [ ] Airplane mode in forms mode: the alert from 7.2 appears and nothing is queued.
- [ ] Airplane mode with forms mode off and a Pro plan: the offline queue still saves a clock-out.
- [ ] Kill the network after the sheet is valid and confirm the employee is still clocked in, the answers are still on screen, and the photo is still previewed.

---

## Phase 8 — Server rejection, then the acceptance pass

**Done when:** if a form applies, a clock-out without valid answers and a real image is rejected, the punch stays open, and no response is written. A clock-out that used this gate returns `taskReportForm: null`. The acceptance list in the PRD passes.

**Deployable because:** you ship this server change with the Phase 7 app as the minimum supported build. Older binaries would be unable to clock out for companies in forms mode.

### 8.1 Reject the incomplete request

- [ ] In the time-out handler, when `formsOn(company)` and the resolver returns a hit, require the multipart payload:

```js
if (hit && !taskReportWrite) {
  return res.status(400).json({
    message: "Finish the end-of-shift form, including the face photo, before clocking out.",
    code: "TASK_REPORT_FORMS_REQUIRED",
  });
}
```

- Place this after resolution and before `timeLog.update`.
- `taskReportWrite` is null when the client sent JSON, sent no `answers`, failed `assertFacePhoto`, or failed `cleanAnswers`. Photo and answer failures should still use `FACE_PHOTO_REQUIRED`, `REQUIRED_ANSWER`, and `INVALID_ANSWER` from Phase 6. Use `TASK_REPORT_FORMS_REQUIRED` for “the client did not try.”
- Do not run this branch when `formsOn` is false or `hit` is null.

### 8.2 Do not prompt again

- [ ] When `taskReportWrite` was saved, set `taskReportForm` to `null` in the clock-out JSON.
- [ ] When it was not saved because no form applied, keep the existing `clockOutPrompt` call so an older closed punch can still be answered later. New gate submissions must not create a draft and must not return a prompt.

### 8.3 System agent

- [ ] Confirm the time-out route used by employees still cannot be completed by the system agent for this payload. If that route currently allows the agent to punch, reject a multipart body from the agent with the same block the `/me` routes use, and do not update the time log.

### 8.4 Final checkpoint

Walk the acceptance list from the PRD:

- [ ] Department assignment only: form and stamped photo are required before clock-out.
- [ ] Shift beats employee, employee beats department, department beats company-wide.
- [ ] Forms off, or no match: no sheet, no photo, clock-out succeeds.
- [ ] Both deviation choices reach the form and send the chosen `punchType`.
- [ ] Missing required answer or missing photo: still clocked in.
- [ ] Stored bytes show the coordinates, date, and company-local time. They match the preview.
- [ ] A rejected upload leaves no closed punch and no response row.
- [ ] A success leaves one submitted response linked to that time log and to the image.
- [ ] Forms mode offline: no queued clock-out. Forms mode off, Pro plan: offline queue still works.
- [ ] Cancel does not clock out.
- [ ] System agent cannot complete the flow.
- [ ] A punch that closed before this gate can still be answered on `GET` and `PUT /api/task-report-forms/me/punch/:timeLogId`. A punch closed through the gate does not show that prompt.

---

## Phase 9 — Add report on the time card

**Done when:** a closed punch that still needs a questionnaire shows Add report on the time card. That includes an automatic clock-out, a phone that died, and an offline shift the cron closed later. Submit stores the answers and a face photo on that punch. `timeOut` does not change.

**Deployable because:** the button appears only for punches `GET /api/task-report-forms/me/pending` already returns. Time Out is unchanged. A closed punch with no pending form looks the same as today.

The face photo certifies the moment they take it, not the stored clock-out time. The sheet says the shift was already closed.

### 9.1 Accept the photo on an already closed punch

`PUT /api/task-report-forms/me/punch/:timeLogId` already requires `timeOut` and saves answers. It has no file field. Extend that save, and do not reuse the time-out transaction from Phase 6.

- [ ] Accept `multipart/form-data` on that PUT with the same `maybeFacePhoto` helper and the same magic-byte check.
- [ ] On `submit: true`, require the face photo. A missing or fake file returns `FACE_PHOTO_REQUIRED` and does not write the response.
- [ ] Keep using `loadOwnPunch`, `cleanAnswers`, and the existing window check. A punch past `closesAt` still returns `RESPONSE_CLOSED`.
- [ ] Create or update the `TaskReportFormResponse` as `submitted`, with the stamped image bytes. Do not update `TimeLog.timeOut`, `autoClockOut`, or `autoClockOutAt`.

```js
await prisma.taskReportFormResponse.create({
  data: {
    companyId: actor.companyId,
    userId: actor.id,
    timeLogId: punch.id,
    punchDate: dbDate(ymdInZone(punch.timeIn, tz)),
    formId: form.id,
    form,
    assignedVia: hit.assignedVia,
    shiftId: hit.shift?.id ?? null,
    shiftName: hit.shift?.name ?? null,
    answers,
    status: "submitted",
    submittedAt: now,
    closesAt,
    facePhotoFileName: "face.jpg",
    facePhotoMimeType: file.mimetype,
    facePhotoBytes: file.buffer,
  },
});
```

- `punch` here is already closed. Nothing in this write touches it.
- `closesAt` stays the existing window end (`timeOut` plus `taskReportFormWindowHours`), not “now”.
- The same unique `timeLogId` rule applies. A second submit returns the existing `RESPONSE_LOCKED` or `RESPONSE_CONFLICT` path.
- JSON saves without a file keep working until this phase’s app is the one users have. Then require the photo on submit, the same release rule as Phase 8.

**Security:** the punch must belong to `actor.id`. Ignore a `timeOut` or `userId` field in the body. Do not log the image buffer.

### 9.2 Load the pending list on the time card

- [ ] In `utils/taskReportApi.js`, add:

```js
export async function fetchPendingTaskReports() {
  const token = await SecureStore.getItemAsync("token");
  const res = await axios.get(`${API_BASE_URL}/api/task-report-forms/me/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.data;
}
```

- Call it when the time card loads, next to the existing timelog fetch in `app/(tabs)/(shifts)/timekeeping-timeCard.jsx`.
- Keep a `Map` of `timeLogId` to the pending item. If the call fails, leave the map empty and still show the punches. A failed pending fetch must not hide the time card.
- `data.enabled === false` means forms mode is off. Show no Add report buttons.

### 9.3 Show the button and reuse the sheet

- [ ] On a closed punch row whose id is in that map, add a slate-900 button labeled Add report. Hide it when the punch is still open, when the pending item is missing, or when the response is already submitted.
- [ ] The label under the button uses the card’s slate body text: “This shift was already closed. The photo is stamped with the time you take it.”
- [ ] Tapping it opens `TaskReportFormSheet` with the form from `GET /api/task-report-forms/me/punch/:timeLogId`, not a new mock. The face segment is the Phase 3 camera.
- [ ] Submit sends the cleaned answers and the stamped JPEG to the PUT above. Do not call `POST /api/timelogs/time-out`.

```js
body.append("answers", JSON.stringify(answers));
body.append("submit", "true");
body.append("facePhoto", { uri: facePhoto.uri, name: "face.jpg", type: "image/jpeg" });
```

- Let Axios set the multipart boundary, same as Phase 7.
- Success removes that id from the pending map so the button disappears without a full reload.
- Failure leaves the sheet open, keeps the answers and the preview, and shows `error.response.data.message`.
- Cancel closes the sheet and does not write a response.

### 9.4 Testing checkpoint

- [ ] Let the auto clock-out job close a punch that has a department form. The time card shows Add report. The punch screen does not.
- [ ] Submit the form and a new face photo. `timeOut` and `autoClockOut` are unchanged. The stored image’s inscription is the later capture, and the button is gone.
- [ ] Cancel Add report. The punch stays unanswered and the button remains.
- [ ] A punch closed through the Phase 7 gate does not show Add report.
- [ ] A pending punch whose window has passed does not show the button, and the PUT returns `RESPONSE_CLOSED`.
- [ ] Forms mode off: no Add report buttons, and the time card still lists punches.
