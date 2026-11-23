# Face photo on clock-in and clock-out

## 1. Summary

When a company turns on face capture, the employee takes a face photo before the punch is logged. Clock-out always needs that photo. Clock-in needs it only when the company also turns on face capture at clock-in. The photo is stamped with location, date, and time, then sent on the punch request the app already makes. Companies that leave face capture off are unchanged.

The server already stores the photo in S3 with the punch. The app does not upload to S3 itself, and this spec adds no endpoint. The photo belongs to the punch. The end-of-shift questionnaire no longer takes one.

Every clock-in and clock-out also sends `deviceId`, the same install id already sent at sign-in. That field is sent whether or not a photo is required. A missing id does not block the punch.

## 2. Problem

Companies that enable face capture need proof that the employee was present at the punch. The server requires that photo on `POST /api/timelogs/time-in` and `POST /api/timelogs/time-out` when the company settings say so. A missing photo is `400 FACE_PHOTO_REQUIRED`, and the punch is not saved.

The app still sends those punches as JSON, with no photo, except when an end-of-shift form is submitted. That form path attaches a photo to the questionnaire. The server now ignores a photo on the questionnaire and requires it on the punch instead, including a clock-out that has no form.

The same punch calls omit `deviceId`. Sign-in already sends the install id from `getInstallationId()`. Without that id on the punch, a company that records the punch device shows the phone as not identified. The server accepts the punch either way.

## 3. Users

Employees who clock in and clock out on the timekeeping punch screen, at a company where face capture applies.

Supervisors and admins who review the photo on the web cutoff page are out of scope. This spec captures the photo and sends it with the punch. It does not show it in the app.

## 4. Goals

- Read `taskReportEnabled`, `taskReportMode`, `taskReportFaceCapture`, and `taskReportFaceCaptureClockIn` from company settings.
- Require a stamped face photo before clock-out when face capture applies, including when the open punch has no form.
- Require a stamped face photo before clock-in only when face capture at clock-in is also on.
- Send the photo on the existing time-in and time-out calls. When a form was answered, send those answers on the same clock-out request.
- Leave the employee clocked as they were when the camera is denied, the stamp fails, or the photo cannot be stored.
- Keep a Pro offline punch’s photo on the device and send it with that punch when the network returns.
- Stop asking for a photo on the questionnaire, including punches answered after clock-out.
- Send `deviceId` on every clock-in and clock-out, JSON or multipart, including a Pro punch replayed later. Use the same value as sign-in.

## 5. Non-goals

- A new upload endpoint, AWS keys, or a signed S3 link. The app never talks to S3.
- A screen where the employee views, downloads, or deletes the stored photo.
- A settings screen to turn face capture on. The company record is the source of truth.
- Coffee and lunch breaks. Those punches do not take a face photo.
- Changing the questions on an end-of-shift form, or who the form is assigned to.
- Showing device match in the app. The server records it. The punch screen does not add a badge.
- A `proof` key inside `deviceInfo`. The server writes its own.
- Session, token, or biometric sign-in. The install id source stays `getInstallationId()`.
- Web punching. While face capture applies, the server refuses browser punches with `403 WEB_PUNCH_DISABLED`. The app does not handle that code as a punch outcome.

## 6. Current behavior

### 6.1 App

Clock-in and clock-out start in `app/(tabs)/(shifts)/timekeeping-punch.jsx`. `handlePunch` reads foreground location and device info, then posts JSON to `/api/timelogs/time-in` or `/api/timelogs/time-out`. The body has no `deviceId`. `localTimestamp` is taken when the employee taps Time In or Time Out, before the early clock-in, punch-type, and deviation steps.

Sign-in, account switch, and profile registration already send `deviceId` from `getInstallationId()` in `utils/deviceId.js`. That helper reads `bb_installation_id` from SecureStore and creates a UUID on first use. It lasts until app data is cleared. The punch screen does not call it.

The punch screen loads `GET /api/company-settings` and keeps timezone, shift-assignment window, and the driver/aide threshold. It already knows forms mode (`taskReportEnabled === true` and `taskReportMode === "forms"`). It does not read `taskReportFaceCapture` or `taskReportFaceCaptureClockIn`.

In forms mode, clock-out asks `GET /api/task-report-forms/me/open` first. When `required` is true, `TaskReportFormSheet` collects answers and blocks submit until `FaceCaptureSegment` returns a photo. Submit calls `postClockOutWithReport`, which posts `multipart/form-data` to `/api/timelogs/time-out` with `answers` and `facePhoto`. When no form is required, clock-out is `postClockOutJson` with no photo.

`FaceCaptureSegment` opens the front camera, refuses the gallery, and asks for camera permission. Taking a photo also requires a foreground location fix. The preview burns in latitude, longitude, and the time in the company zone through `buildInscription` in `utils/taskReportWatermark.js`. The employee can retake. Use photo writes a JPEG. The permission copy says the camera is required to clock out.

The time card answers a closed punch with `submitClosedTaskReport`, which puts `answers` and `facePhoto` on `PUT /api/task-report-forms/me/punch/:timeLogId`. The server ignores `facePhoto` on that route.

Pro plans queue a punch in AsyncStorage when the device is offline. The queued body is the JSON payload from the tap. It has no photo file and no `deviceId`. Location-restricted employees cannot punch offline. Other plans cannot punch offline. Coffee and lunch are online only.

### 6.2 Server

Face capture applies only when all three are true:

- `taskReportEnabled === true`
- `taskReportMode === "forms"`
- `taskReportFaceCapture === true`

Clock-out then requires a photo even when no form is assigned. Clock-in requires a photo only when `taskReportFaceCaptureClockIn === true` as well. Free-form mode never requires a photo. The server decides from these settings. The client does not send a separate “photo required” flag.

`GET /api/company-settings` returns the four fields. `POST /api/timelogs/time-in` and `POST /api/timelogs/time-out` accept `multipart/form-data` with a `facePhoto` file. The server resizes it to a JPEG at most 480 px, strips metadata, stores it in a private bucket, and writes a `PunchFacePhoto` row with the punch. The punch and the photo succeed or fail together. Responses add `data.facePhotoId`, or `null` when no photo was stored.

A punch that still has a form is `400 TASK_REPORT_FORMS_REQUIRED` until `answers` arrive on `POST /api/timelogs/time-out`. The questionnaire save no longer stores a photo.

`POST /api/timelogs/time-in` and `POST /api/timelogs/time-out` also accept `deviceId` at the top level of the body (BB-134). The server compares it with the id registered at `POST /api/account/login` when the company records the punch device. A missing or different id does not reject the punch. Responses do not change because of it. Coffee and lunch are not part of that contract.

## 7. Product requirements

### 7.1 When a photo is required

The punch screen reads the four fields in section 6.2. Face capture applies only when the first three match. Clock-out requires a photo whenever face capture applies. Clock-in requires a photo only when `taskReportFaceCaptureClockIn === true` as well.

Any other combination, including free-form mode and face capture left off, keeps a JSON punch and does not open the camera. Those punches still include `deviceId` (section 7.8).

The app refreshes the four fields at sign-in, on app start, and before each punch. Settings can change during the day. Before a punch moves on to the form, the camera, or the request, the punch screen reloads `GET /api/company-settings` when the device is online.

A failed reload uses the last successful settings for this signed-in company. When no settings have loaded yet, the punch does not proceed. The screen tells the employee to try again. An offline Pro punch uses the last successful settings, because it cannot reload them.

Loaded settings belong to one user and one company, read from the token. After sign-out or an account switch, settings loaded for another user or company are not used. Until settings load for the new account, the punch does not proceed, online or offline.

### 7.2 Camera step

The camera is a step on the punch. It is the last step before the request. It uses `FaceCaptureSegment`: front camera only, no gallery or file picker, a preview, Retake, and Use photo.

The stamp is the existing inscription: latitude, longitude, and the date and time in the company time zone. The location fix used for the stamp is the punch location. `localTimestamp` is the time the employee confirms the photo, not the earlier tap on Time In or Time Out. The stamp, the location, and `localTimestamp` describe that moment.

A missing camera permission, a missing location fix, a failed shot, or a failed stamp does not send the punch and does not queue it. The employee stays clocked in or clocked out as they were. The screen says what is missing and how to allow it. The permission copy names the action in progress, clock in or clock out.

This is new for employees with location off. Without face capture, a missing fix does not block a punch. With face capture, the stamp needs the fix, so an employee with location services off cannot finish a punch that needs a photo until they turn them on.

The operating system’s camera permission text covers both clock-in and clock-out. It is set in `app.json` (`ios.infoPlist.NSCameraUsageDescription` and the `expo-camera` `cameraPermission`) and in the checked-in `ios/BizBuddy/Info.plist`. Changing it needs a native rebuild.

Cancel on the camera sends nothing and leaves the previous clock state. The stamped file is a JPEG named `face.jpg` with type `image/jpeg`. A file over 5 MB is not sent. The camera opens again.

The employee does not see the photo after a successful punch.

Face images do not linger on the phone:

- The raw camera file has no stamp. It is deleted once the stamped copy is made, and on Retake.
- The stamped file is deleted after the server accepts the punch, after the employee cancels, and when the server rejects the image.
- A Pro offline punch keeps one stamped copy in the app’s private documents folder until it is sent or dropped.
- No face image is saved to the photo library.

### 7.3 Clock-in

Clock-in still runs the gates that already exist: company settings loaded, assigned-site check, breadcrumb permission when that switch is on, the early clock-in step, and punch type. When the clock-in photo rule in section 7.1 is true, the camera opens after those gates. Confirming the photo sends `POST /api/timelogs/time-in`. When the rule is false, clock-in stays JSON and does not open the camera.

### 7.4 Clock-out

Clock-out still runs the break check, deviation check, and punch type as it does today.

When forms mode is on, clock-out still asks `GET /api/task-report-forms/me/open` before the camera.

- `required: true`: the form is shown first. Submit collects answers and does not send the punch yet. Stay clocked in, or Cancel, aborts. No photo is taken and no clock-out is sent.
- `required: false`: there is no form.

When face capture applies, the camera opens after that form step, including when no form was required. Confirming the photo sends one `POST /api/timelogs/time-out`. When a form was answered, that same body includes `answers`. When face capture does not apply, a required form is still answered and sent with clock-out, and the body stays JSON.

The form sheet no longer contains `FaceCaptureSegment` and no longer blocks on a photo.

### 7.5 Questionnaire after clock-out

`PUT /api/task-report-forms/me/punch/:timeLogId` sends answers only. The time card path that answers a closed punch (`submitClosedTaskReport`) does not attach `facePhoto`. Auto clock-out and punches added later still use the pending questionnaire list. Those saves do not ask for a face photo. The punch those forms belong to already happened.

### 7.6 Offline

Non-Pro offline punching stays blocked. Location-restricted employees still cannot punch offline.

When a Pro employee is offline and section 7.1 requires a photo, the camera still runs. The queue stores the stamped file with that punch action. When the network returns, the app sends the same multipart body, including the `deviceId` stored with the action (section 7.8). `localTimestamp` stays the time the photo was confirmed. The server records its own receive time. The queued action and the file are removed only after the server accepts the punch. A network failure, `502 FACE_PHOTO_UPLOAD_FAILED`, or `503 FACE_PHOTO_UNAVAILABLE` leaves both queued. `400 FACE_PHOTO_REQUIRED` drops that file and asks for a new photo before the punch can be sent again.

When the open punch also needs a form, the form is still loaded and answered before the photo. That lookup needs the network, so the clock-out is not queued until the answers exist. If the network drops after the answers exist, the queue keeps the answers and the stamped file together.

### 7.7 Errors

The punch is never saved without a required photo. After any failure below, the employee is still clocked in or still clocked out.

| Status | `code` | App behavior |
|---|---|---|
| 400 | `FACE_PHOTO_REQUIRED` | Missing, wrong type, over 5 MB, or unreadable. Open the camera again. |
| 400 | `TASK_REPORT_FORMS_REQUIRED` | The punch has a form and `answers` is missing. Show the form. The photo, if already taken, is kept and sent with the answers. |
| 400 | `INVALID_ANSWER` or `REQUIRED_ANSWER` | Show the server `message`. The punch stays open. Keep the photo so the employee can correct the form and send again. |
| 502 | `FACE_PHOTO_UPLOAD_FAILED` | Keep the stamped photo. The employee retries the same photo. |
| 503 | `FACE_PHOTO_UNAVAILABLE` | Keep the stamped photo. The employee retries later. |

Other punch errors keep today’s alert with the server `message` when it exists. The photo is kept so a retry does not force a new shot unless the code is `FACE_PHOTO_REQUIRED`.

Time-in and time-out requests time out after 60 seconds. A timeout counts as no response, the same as a dropped network:

- Clock-in checks whether the punch landed anyway, as it does today.
- A Pro, unrestricted clock-out is queued.
- Anything else shows an error.

The sheet never stays on a spinner with no way out.

A punch is never refused because `deviceId` is missing or does not match the registered phone. There is no device-id error to handle.

### 7.8 Punch device id

Every `POST /api/timelogs/time-in` and `POST /api/timelogs/time-out` includes `deviceId`, with or without a photo, a form, or a network connection.

- The value is exactly what `getInstallationId()` returns, the same string sent to `POST /api/account/login`. No prefix and no reformatting.
- It is a top-level field. In JSON it sits next to `localTimestamp`. In multipart it is a form field, not a nested key inside `deviceInfo`.
- `deviceInfo` does not gain a `proof` key.
- When `getInstallationId()` returns nothing, the field is omitted. The app does not send `"unknown"` or an empty string.
- The queued Pro punch stores that same string and sends it on replay. The id is read when the punch is queued, so a later reinstall does not rewrite a punch already waiting.
- Coffee and lunch requests are unchanged. The questionnaire save does not send `deviceId`.
- The app does not read or show `deviceMatch`.

## 8. Server

No new route. Authentication matches the other time-log routes.

### 8.1 Company settings

`GET /api/company-settings` already returns:

- `taskReportEnabled` (boolean)
- `taskReportMode` (`"forms"` or free-form)
- `taskReportFaceCapture` (boolean)
- `taskReportFaceCaptureClockIn` (boolean)

Employees who can already load the punch screen can read them. This spec does not add a way to edit them.

### 8.2 Clock-in

When section 7.1 requires a clock-in photo, `POST /api/timelogs/time-in` is `multipart/form-data`.

| Field | Value |
|---|---|
| `facePhoto` | Stamped JPEG, file name `face.jpg`, type `image/jpeg`, at most 5 MB |
| `localTimestamp` | ISO time the photo was confirmed |
| `location` | JSON string of the punch location |
| `deviceInfo` | JSON string, as today |
| `deviceId` | The install id from section 7.8, when the app has one |
| `punchType` | Sent when the punch already sends it |

When no photo is required, the body stays JSON and still includes `deviceId` at the top level.

Response `201`: the current time-in body, plus `data.facePhotoId` (string, or `null` when no photo was stored).

### 8.3 Clock-out

When section 7.1 requires a clock-out photo, `POST /api/timelogs/time-out` is `multipart/form-data` with the same fields as clock-in. When the employee answered a form, the same body includes `answers` as a JSON string of `{ [questionId]: value }`.

When a form is required and face capture is off, `POST /api/timelogs/time-out` stays JSON and includes `answers`. When neither a photo nor a form applies, the body stays the JSON clock-out sent today.

Response `200`: the current time-out body, plus `data.facePhotoId`.

`remarks` and `reason` are included only when that punch already sends them. They are not added for face capture. `remarks`, when present, is a JSON string. `deviceId` is included on every time-out, JSON or multipart, using the same rules as clock-in.

### 8.4 Questionnaire

`PUT /api/task-report-forms/me/punch/:timeLogId` no longer sends `facePhoto`. A leftover file on that route is ignored and is not proof of the punch.

## 9. Client notes

The app stays on Expo, React Native, `expo-router`, and Axios. The camera pieces already used by `FaceCaptureSegment` stay: `expo-camera`, `expo-location`, and `react-native-view-shot`. No gallery picker is added.

Android: `app.json` lists the `CAMERA` permission, but the checked-in `android/app/src/main/AndroidManifest.xml` does not declare it. It may still be merged from the `expo-camera` library. Confirm on an Android device that the camera permission prompt appears and a photo can be taken before building on this flow. If it does not, add the permission to the manifest or run prebuild again.

Work lands in:

- `app.json` and `ios/BizBuddy/Info.plist` — camera permission text covers clock-in and clock-out.
- `app/(tabs)/(shifts)/timekeeping-punch.jsx` — read the two face-capture flags, tie loaded settings to the token’s user and company, refresh settings before the punch, run the camera after the existing clock-in gates and after the clock-out form step, take `localTimestamp` when the photo is confirmed, and set `deviceId` from `getInstallationId()` on every time-in and time-out.
- `components/task-report/FaceCaptureSegment.jsx` — reused for clock-in and clock-out. Permission copy names the action. The sheet no longer owns it. Deletes the raw camera file after stamping and on Retake.
- The punch request helper — 60-second timeout on time-in and time-out.
- `components/task-report/TaskReportFormSheet.jsx` — answers only. Submit does not require a photo.
- `utils/taskReportApi.js` — multipart time-in and time-out when a photo is required, with `deviceId` as its own field; JSON time-out with `answers` and `deviceId` when a form is required and face capture is off; `submitClosedTaskReport` sends answers only.
- The Pro offline queue — store the stamped file URI and `deviceId` with the pending action and replay them. The file is not embedded in the JSON queue as a base64 string.

The punch screen does not log the photo URI with the auth token.

## 10. Acceptance criteria

- With face capture off, or in free-form mode, Time In and Time Out stay JSON with no camera, and the questionnaire does not ask for a photo. Both punches still send `deviceId`.
- With face capture on and `taskReportFaceCaptureClockIn` off, clock-out requires a stamped photo and clock-in does not.
- With both switches on, clock-in and clock-out each require a stamped photo before the punch is logged.
- A clock-out with face capture on and no assigned form still opens the camera and sends the photo.
- The camera is the front camera. The gallery is not offered. The preview can be retaken. The used photo shows latitude, longitude, and the company-zone time.
- Denied camera permission, a missing location fix, or a failed stamp does not log the punch and does not queue it.
- Cancel on the camera does not log the punch. The employee stays clocked as they were.
- `localTimestamp` and the punch location match the moment the photo was confirmed.
- A required form is answered before the camera. Stay clocked in sends no photo and no clock-out.
- Form plus photo is one `POST /api/timelogs/time-out`. The body contains `facePhoto` and `answers`.
- A required form with face capture off is still answered and sent as JSON `answers` on time-out, with no photo.
- `PUT /api/task-report-forms/me/punch/:timeLogId` and the time card questionnaire send no photo.
- Coffee and lunch breaks do not open the camera.
- `400 FACE_PHOTO_REQUIRED` leaves the punch unsaved and opens the camera again.
- `400 TASK_REPORT_FORMS_REQUIRED` leaves the punch unsaved and shows the form.
- `502 FACE_PHOTO_UPLOAD_FAILED` and `503 FACE_PHOTO_UNAVAILABLE` leave the punch unsaved, keep the stamped photo, and let the employee retry that photo.
- A Pro offline punch that requires a photo stores the stamped file and sends it later as multipart, with the original `localTimestamp` and the `deviceId` captured when it was queued. A failed sync keeps the file. Non-Pro offline punching stays blocked.
- Every online clock-in and clock-out sends `deviceId` from `getInstallationId()`, identical to sign-in, at the top level of the body. A punch with no install id omits the field and still succeeds. Coffee, lunch, and the questionnaire save do not send it. The app does not show device match.
- A successful punch response may include `data.facePhotoId`. The app does not show the photo.
- Company settings are read again at sign-in, on app start, and before each online punch.
- After an account switch, an offline punch does not use the previous account’s face-capture settings. With no settings loaded for the new account, the punch does not proceed.
- The iOS and Android camera prompts mention clock-in and clock-out. On Android, the camera prompt appears and a photo can be taken.
- A punch request with no answer after 60 seconds ends the spinner. Clock-in checks for an existing open punch. A Pro, unrestricted clock-out is queued. Otherwise an error is shown.
- After a successful punch, a cancel, or a rejected image, no raw or stamped face file stays in the app cache. A queued offline photo is deleted after it is sent or dropped.
- With face capture on and location services off, the camera step says location is required and the punch is not sent.
