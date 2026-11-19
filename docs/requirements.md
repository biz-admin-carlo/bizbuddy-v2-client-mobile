# Task report form before clock-out

## 1. Summary

An employee who is clocked in must finish the questionnaire assigned to that punch, including a certified face photo, before the app sends a clock-out. The photo has the capture location, date, and time drawn onto the image. If the company has no form for that punch, clock-out continues as it does today.

This is a client and server change. The questionnaire endpoints already deployed for BB-129 open only after a punch is closed, and they accept JSON answers only. They cannot gate clock-out or store a face photo.

## 2. Problem

Employees can end a shift without recording what they did. The company already builds end-of-shift questionnaires and assigns them by shift, employee, department, or the whole company. Those answers are collected after clock-out, inside a later answer window, and nothing in the form certifies that the employee was present.

Clock-out needs to wait until two things are done:

- The employee answers the questionnaire that applies to the open punch.
- The employee takes a live photo of their face with location, date, and time inscribed on the image.

## 3. Users

Anyone who can clock in and clock out on the timekeeping punch screen. That is the same audience as a normal time punch.

The system agent (B. Buddy) stays excluded. The deployed questionnaire routes already block that actor, and this flow keeps that rule.

Supervisors and admins who only review answers, and admins who build or assign forms, are out of scope here.

## 4. Goals

- Resolve the questionnaire for the employee’s still-open punch before clock-out is sent.
- Render every question type the form builder already stores, and block continue while a required answer is missing or invalid.
- Add a required face-capture segment after the questions.
- Draw latitude, longitude, date, and time onto the photo pixels at the moment the shutter fires.
- Send the answers and the watermarked photo together with the clock-out, and save both only if the whole request succeeds.
- Leave clock-out unchanged when task-report forms are off or when no form matches the punch.

## 5. Non-goals

- Timecard corrections and requested punch edits.
- The admin form builder, assignment screens, supervisor review, and PDF export.
- Drafts on the live clock-out path. The employee either submits a complete form with the clock-out, or the punch stays open.
- Replacing the post-clock-out answer window. Punches that close without a questionnaire, including an automatic clock-out, stay answerable from the time card until that window ends. New clock-outs from the punch screen still use the gate and do not create drafts.
- Choosing a storage vendor for the image file. The server must persist the watermarked file the employee previewed and point the submitted response at it.

## 6. Current behavior

### 6.1 App

Clock-out is sent from `app/(tabs)/(shifts)/timekeeping-punch.jsx` to `POST /api/timelogs/time-out` in three places:

- The normal clock-out confirm path.
- The deviation modal’s Regular choice.
- The deviation modal’s Driver/Aide choice.

Before that request, the punch screen already checks active breaks, assigned-location rules, and whether an offline punch is allowed. Location for a punch comes from `expo-location`. The app has no camera library. A Pro plan can queue a clock-out locally when the device is offline.

### 6.2 Server

BB-129 already stores forms and assignments.

- A form applies only when `Company.taskReportEnabled` is on and `Company.taskReportMode` is `forms`. In `freeform` mode, questionnaires cannot be answered.
- The form for a punch is the most specific active assignment: shift, then employee, then department, then company-wide (`all`). A department form is used only when no shift form and no employee form match. Archived forms are ignored.
- Question shape is `{ id, type, label, helpText, required, options }`. Types are `short_text`, `paragraph`, `single_choice`, `checkboxes`, `dropdown`, `yes_no`, `number`, `date`, and `time`.
- `GET` and `PUT /api/task-report-forms/me/punch/:timeLogId` refuse to open until the punch has a clock-out (`STILL_CLOCKED_IN`: “Clock out first. The questionnaire opens after clock-out.”).
- Answers are a JSON object `{ questionId: value }`. There is no photo field.
- `POST /api/timelogs/time-out` closes the punch first, then may add a `taskReportForm` prompt (`timeLogId`, form id and name, shift name, `closesAt`) so an older app can ask afterward. The answer window is `Company.taskReportFormWindowHours` after clock-out (default 336 hours). The first save freezes a snapshot of the form.

That order is the opposite of this requirement. A submitted questionnaire cannot be attached to a punch that is still open, and a clock-out cannot be held back by answers the server will not accept yet.

## 7. Product requirements

### 7.1 When the form appears

The employee taps Time Out and passes the checks that already exist (end an active break, satisfy location restriction, and so on).

The existing clock-out confirm stays. When the company requires a punch-type choice, the deviation modal stays too, and the employee picks Regular or Driver/Aide before the questionnaire.

After that commitment, the app asks the server which form applies to the open punch:

- Task reports are off, the mode is not `forms`, or nothing matches: the app sends clock-out exactly as it does today, with no questionnaire and no photo.
- A form matches: the app shows that form. Clock-out is not sent until the employee submits it and the server accepts the combined request.

Canceling the form, leaving the screen, or failing validation does not clock the employee out.

All three current time-out call sites go through this gate. A deviation choice selects `punchType` only. It does not skip the form.

### 7.2 Resolving the form

Resolution uses the open time log (the punch that has a clock-in and no clock-out) and the assignment order already implemented: shift, employee, department, company-wide.

The shift match uses the punch’s clock-in instant and the company timezone (`Company.timeZone`, falling back to `America/Los_Angeles`), the same way the server matches a shift today.

The response tells the app whether it must show a form. When it must, the payload includes the form snapshot the employee will answer: id, name, description, and questions. The server also returns which assignment won (`assignedVia`) and the shift name when a shift matched. The app shows the form name and description. It does not let the employee pick a different form.

The snapshot is the form that will be stored with the clock-out. Later edits or re-assignments do not change this submission.

### 7.3 Answering questions

The app renders questions in stored order. Each question shows its label, and its help text when one is set. Required questions are marked.

Answer shapes match the server rules already used on submit:

| Type | What the employee enters | Valid value |
| --- | --- | --- |
| `short_text` | One line of text | Trimmed string, at most 500 characters |
| `paragraph` | Multi-line text | Trimmed string, at most 5000 characters |
| `single_choice` | One of the listed options | The option string |
| `dropdown` | One of the listed options | The option string |
| `checkboxes` | Any of the listed options | Array of option strings, de-duplicated, in form order |
| `yes_no` | Yes or no | Boolean |
| `number` | A number | Finite number |
| `date` | A calendar date | `YYYY-MM-DD` |
| `time` | A time of day | `HH:mm`, 24-hour |

Optional questions may be left blank. On submit, a required question that is empty or invalid blocks the request. The employee stays on the form and sees which question failed. Unknown question ids are ignored, matching the current answer cleaner.

### 7.4 Face capture

The face segment is last, after the questions. It is always required for this flow. It is not an admin-configured question type, and it is not satisfied by a gallery photo.

- The capture uses the front camera only.
- The employee may retake the photo before submitting.
- At shutter time the app reads the device location and the current instant.
- The app draws onto the image pixels, before upload: latitude, longitude, the calendar date, and the clock time. Date and time use the company timezone. The preview shows that inscription, and the uploaded file is that same watermarked image.
- Metadata alone (EXIF or a side field) does not meet this requirement. The text must be visible on the picture.
- If camera permission is missing, or a location fix cannot be read, the employee cannot submit. The app explains what to enable. The punch stays open.

The segment does not accept an existing picture from the photo library.

### 7.5 Submission and clock-out

Submit sends one request that carries:

- The clock-out payload the punch screen already sends (device info, location, local timestamp, and `punchType` when the deviation flow set one).
- The questionnaire answers.
- The watermarked face photo.

The server treats that request as a single transaction:

- When a form applies, missing answers, invalid answers, or a missing or unreadable photo reject the whole request. The time log stays open. No questionnaire response is created.
- When the request is valid, the server closes the punch and creates the questionnaire response as `submitted`, with `submittedAt` set, the form snapshot frozen, and a reference to the stored watermarked image.
- When no form applies, the request is a normal clock-out and does not require answers or a photo.

A failed upload, a validation error, or a network error after the employee taps submit leaves them clocked in. The app shows the server message when one is returned, and keeps the answers and the preview so they can try again without retaking the photo unless they choose to.

Success is the same clock-out success the punch screen already shows. The employee is clocked out, and the questionnaire is submitted and locked.

### 7.6 Offline

When the company is in forms mode, clock-out requires a network connection. The app cannot resolve the assignment or upload the photo offline, so it must not queue that clock-out.

When forms mode is off, the existing offline rules stay: a Pro plan may store the punch locally; a location-restricted employee still cannot punch offline; other plans still need a connection.

If company settings have not loaded yet, the punch screen keeps its current behavior and does not send a clock-out.

### 7.7 Permissions and failures

| Situation | Result |
| --- | --- |
| Active break | Clock-out does not start. Existing message. |
| Outside an assigned punch location, when restricted | Clock-out does not start. Existing message. |
| Forms mode and the device is offline | Clock-out does not start. The employee is told they must be online to complete the end-of-shift form. |
| No form for this punch | Clock-out proceeds with no form and no photo. |
| Required answer missing or invalid | Stay on the form. Stay clocked in. |
| Camera or location unavailable for the photo | Stay on the form. Stay clocked in. |
| Server rejects the combined request | Stay clocked in. No response row. Show the error. |
| Employee cancels the form | Stay clocked in. Nothing is saved. |
| Employee cancels Add report on a closed punch | The punch stays closed. No response is saved. `timeOut` is unchanged. |

### 7.8 Report after the punch is already closed

An automatic clock-out never opens this form. The server sets `timeOut` on its own, marks the punch `autoClockOut`, and does not ask for a questionnaire. The same gap exists when the phone dies or the device is offline in forms mode: manual clock-out is blocked, the shift stays open, and the cron closes it later with no report.

The time card offers **Add report** on a closed punch that is still inside `taskReportFormWindowHours` and has no submitted questionnaire. The server already lists those punches from `GET /api/task-report-forms/me/pending`. Automatic clock-outs are in that list. The button is not limited to the `autoClockOut` flag.

Add report opens the same questionnaire and requires the same face photo. The inscription is the time and place of that later photo, not the stored `timeOut`. The card says the shift was already closed. Submit stores the response on that punch and does not change `timeOut`. Cancel leaves the punch without a report. When the window has passed, or a response is already submitted, the button is hidden.

## 8. Server contract

The live punch-screen path needs three behaviors the deployed API does not have.

### 8.1 Resolve the open punch

Provide a way for the signed-in employee to resolve the questionnaire for their current open time log, before clock-out.

- Authentication matches the other employee questionnaire routes. The system agent remains blocked.
- The punch must belong to that employee and must still be open. This path must not return `STILL_CLOCKED_IN`.
- If forms are off, or no active assignment matches, the response says no form is required.
- If a form matches, the response includes the snapshot (`id`, `name`, `description`, `questions`), `assignedVia`, the shift id and name when a shift matched, and the open `timeLogId`.
- Resolution order stays shift, then employee, then department, then company-wide. Only active forms are eligible.

`GET /api/task-report-forms/me/punch/:timeLogId` can remain the reader for a punch that is already closed. It is not the call the punch screen uses to decide whether to block clock-out.

### 8.2 Accept answers and the photo on clock-out

`POST /api/timelogs/time-out` accepts the existing clock-out body plus, when a form applies:

- `answers`: `{ questionId: value }`, validated with the rules in section 7.3. Required questions are enforced because this submit locks the response.
- The watermarked face image as a file upload on that same request.

When a form applies and either part is missing or invalid, the handler rejects the clock-out. Suggested codes, in the same `{ message, code }` shape the questionnaire services already use:

- `TASK_REPORT_FORMS_REQUIRED` when a form applies and the answers or the photo were not sent.
- `REQUIRED_ANSWER` and `INVALID_ANSWER` for question failures, as today.
- `FACE_PHOTO_REQUIRED` when the image is missing, empty, or not an image file.

When no form applies, extra answer or photo fields are ignored and clock-out behaves as it does now.

### 8.3 Store both together

On success when a form applies, one transaction:

- Updates the open time log with the clock-out, including the existing derived-field work that clock-out already runs.
- Stores the watermarked image bytes the client uploaded.
- Creates one `TaskReportFormResponse` for that time log with status `submitted`, the frozen form snapshot, the cleaned answers, `assignedVia`, shift id and name, `submittedAt`, and a reference to the stored image.

The response on the time log stays unique (one answer set per punch). A second clock-out attempt cannot create a second response.

The clock-out JSON may still include a `taskReportForm` field for older apps. For a clock-out that already submitted the questionnaire, that prompt is null, so the employee is not asked to answer again.

The post-clock-out draft and answer-window endpoints stay in place for punches that closed before this gate existed and still have no response. They are not used by this live flow, and this flow does not create drafts.

## 9. Client notes

The app stays on the current stack: Expo, React Native, `expo-router`, Axios, and `expo-location`. Face capture needs a camera and a way to draw the inscription onto the bitmap before upload. Those are new client dependencies; the punch screen does not have them today.

The form is part of the clock-out path in `app/(tabs)/(shifts)/timekeeping-punch.jsx`, after confirm and after any deviation choice, and before every `POST /api/timelogs/time-out`.

The client also enforces required questions and the photo before it calls the server, so a preventable error does not depend on a round trip. The server remains the authority. A client-side pass never clocks the employee out by itself.

## 10. Acceptance criteria

- With forms mode on and a department assignment, an employee in that department who has no shift or employee assignment must complete that form and a watermarked face photo before clock-out is sent.
- A shift assignment wins over an employee assignment, which wins over a department assignment, which wins over a company-wide assignment.
- With forms mode off, or with no matching form, Time Out does not show a questionnaire or ask for a photo, and clock-out succeeds as it does today.
- Regular and Driver/Aide deviation choices both reach the form when one applies, and the chosen `punchType` is still sent with the clock-out.
- Leaving a required question blank, or leaving the face segment empty, does not send clock-out. The employee remains clocked in.
- The submitted image shows latitude, longitude, date, and company-local time on the picture itself. The preview and the stored file match.
- A rejected upload or a failed clock-out leaves no closed punch and no questionnaire response.
- A successful submit closes the punch and stores one submitted response linked to that time log and to the watermarked image.
- In forms mode, an offline device cannot queue a clock-out. With forms mode off, a Pro offline clock-out still queues as it does today.
- Canceling the form does not clock the employee out.
- The system agent cannot complete this flow.
- A punch that already closed under the old “answer later” rules can still be answered through the existing post-clock-out endpoints. A punch closed through this gate is not prompted again.
- After an automatic clock-out, or any other close that left no questionnaire, the time card shows Add report while the answer window is open. Submitting it stores the form and a face photo stamped at that later moment, and does not change `timeOut`. The button is hidden once the window has passed or the response is submitted.
