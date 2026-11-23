# Location logging during a shift

## 1. Summary

While an employee is clocked in, the phone records their location on the interval the company configured and sends those samples to the server. Sampling continues through breaks and while the app is in the background, and it stops at clock-out. Companies with this feature turned off are unchanged.

The phone already reads location at punch time. The server already has the company switch, the interval, and the `LocationBreadcrumb` table. Nothing writes that table, and `GET /api/company-settings` does not return the switch or the interval. This spec adds the mobile collector and the ingest endpoint.

## 2. Problem

A clock-in and a clock-out record where the employee was at the start and end of a punch. They do not show where the employee was during the shift. Companies that need that trail already have a switch and an interval on the company record, and a table ready to store the samples. The mobile app never reads those settings and never sends a sample.

## 3. Users

Employees who can clock in and clock out on the timekeeping punch screen, at a company where location logging is turned on.

Supervisors and admins who view the Employee Map are out of scope. This spec stores the samples. It does not draw them.

## 4. Goals

- Read `breadcrumbsEnabled` and `breadcrumbIntervalMinutes` from company settings.
- When the switch is on, refuse clock-in until location services are on and the employee has granted background location permission.
- After a successful clock-in, take one location sample every `breadcrumbIntervalMinutes` until clock-out.
- Keep sampling during coffee and lunch breaks, and while the app is backgrounded or the phone is locked.
- Send each sample to a new endpoint that inserts a `LocationBreadcrumb` for that punch.
- When the network is down, keep samples on the device and send them when the network returns, without creating duplicate rows.
- Pause sampling when the employee signs out or switches to another account, and resume it when that same employee is signed in again and the punch is still open.

## 5. Non-goals

- Drawing breadcrumbs on the Employee Map. `GET /api/employee-map` keeps `layers.breadcrumbs` as `null`.
- A settings screen to turn the switch on or edit the interval. The company columns are the source of truth.
- Clocking the employee out, or blocking clock-out, because a sample was missed.
- Rejecting a sample because the device reported a mocked location. The mocked flag is stored.
- Web. Collection runs on the iOS and Android app.
- Changing the existing assigned-location rule. An employee who must punch inside a work site still must be inside that site. Location logging is an additional rule when the company switch is on.

## 6. Current behavior

### 6.1 App

Clock-in and clock-out are sent from `app/(tabs)/(shifts)/timekeeping-punch.jsx`. `getPunchData` asks for foreground location permission and, when services are on, reads one fix with `expo-location`. A missing fix does not fail Time In. Employees restricted to assigned sites are blocked separately when they are outside those sites or location is off.

The app checks foreground permission only. It does not read `breadcrumbsEnabled` or `breadcrumbIntervalMinutes`. It does not sample on a timer, and it has no background-location task. `expo-task-manager` is not installed.

Offline clock-in and clock-out are queued in AsyncStorage for Pro plans, and location-restricted employees cannot punch offline. That queue is posted to `/api/timelogs` and then cleared, including actions whose request failed.

iOS already has an Always-location usage string. The When-In-Use string says location is used only at punch time. Android requests fine and coarse location. It does not request background location.

### 6.2 Server

`Company` has:

- `breadcrumbsEnabled` — boolean, default `false`
- `breadcrumbIntervalMinutes` — integer, default `5`

`GET /api/company-settings` (`getSettings`) does not select either field, so the punch screen cannot see them.

`LocationBreadcrumb` stores one sample per punch per `recordedAt`. Columns are `companyId`, `userId`, `timeLogId`, `recordedAt`, `receivedAt`, `latitude`, `longitude`, `accuracy`, `altitude`, `speed`, `heading`, `batteryLevel`, `isMocked`, and `source`. `id` has no default, so the writer supplies it. `receivedAt` defaults to the insert time. `(timeLogId, recordedAt)` is unique.

`POST /api/timelogs/time-in` and `time-out` save the punch fix on `TimeLog.location.start` and `TimeLog.location.end`. No route inserts `LocationBreadcrumb`. The Employee Map reads punch fixes only.

## 7. Product requirements

### 7.1 When logging is required

Logging runs only when `breadcrumbsEnabled` is true for the signed-in employee’s company.

The interval is `breadcrumbIntervalMinutes`. A missing value, or any integer below 1, is treated as 5. The app waits at least that many minutes between samples. The operating system may deliver a fix late. The app sends the fix it actually got, with that fix’s time. It does not invent samples for the gap.

A change to the switch or the interval applies the next time the punch screen loads company settings, and on the next launch. When the switch turns off, sampling stops.

### 7.2 Clock-in

When the switch is on, Time In stays disabled until both of these are true:

- Location services are on.
- Background location permission is granted. On iOS that is Always. On Android that is Allow all the time, which requires foreground permission first.

The punch screen explains, before the system prompt, that the company records location during the open shift at the company’s interval, including while the app is in the background, and that recording stops at clock-out. If the employee denies the permission or leaves services off, Time In does not proceed, and the screen tells them how to turn it on.

When the switch is off, Time In uses today’s location rules.

The assigned-site check still runs for location-restricted employees. Both gates must pass when they both apply.

Permission and services are checked on the device. A missing GPS fix at the moment of the tap does not, by itself, block Time In. The next interval tries again.

### 7.3 During the shift

Sampling starts after clock-in succeeds and the app has the server time log id.

It continues:

- while the employee is on a coffee or lunch break
- while the app is in the background
- while the phone is locked

It stops when clock-out succeeds. On the next launch, if that employee still has an open punch, the switch is on, and permission still stands, sampling resumes.

Signing out and switching accounts pause sampling for the employee who is leaving. The phone stops location updates and the Android notification. That employee’s session and any unsent samples stay on the device, tagged with their user id. They are not uploaded with the next account’s token. When that same employee is the signed-in user again, the punch is still open, the switch is still on, and permission still stands, sampling resumes and the unsent samples are sent. Clock-out still ends the session. Pause does not. A cold start with a missing or expired token pauses the same way before that token is deleted. If no user id can be read, location updates still stop.

A Pro offline Time Out still queues the punch as it does today, and location updates stop at the moment it is queued. Samples already taken stay on the device and upload when the network returns. Sampling does not resume while that clock-out is still in the punch queue, even if the server punch is still open. After the server accepts the clock-out, the session is cleared the same way as an online clock-out.

`collectUntil` is the punch’s `LiveUser.closeAt`: scheduled end plus the company’s auto clock-out grace, or clock-in plus the default shift length plus that grace when there is no shift. Clock-in and the open log from `GET /api/timelogs/user` include it when the row exists. A failure to write `LiveUser` does not fail the punch, and then `collectUntil` is absent. The background task stops location updates when the clock passes `collectUntil`, including while the app is locked. A manual clock-out stops sooner. Early clock-in and overtime before `collectUntil` still produce samples. While the punch screen’s socket is connected, `timeLogUpdated` with `type: "autoClockOut"` stops tracking as well.

Android shows the ongoing notification the operating system requires for background location. The notification says the company is recording location for the open shift. If the employee denies notification permission, clock-in still proceeds. Background updates stay off, the punch screen says background recording needs notifications, and sampling continues while BizBuddy is open.

A failed fix is skipped. The punch stays open. The next interval tries again. If the employee revokes permission during the shift, sampling pauses and the punch stays open. Sampling resumes if they grant it again before clock-out. The following clock-in is blocked until they grant it.

A reboot leaves a gap until the employee next opens the app. There is no boot-time restart. `collectUntil` is what bounds a phone that stays off.

### 7.4 What is sent

Each sample includes:

- `timeLogId`
- `recordedAt` — the time of the fix, as an ISO timestamp
- `latitude` and `longitude`
- `accuracy`, `altitude`, `speed`, and `heading` when the operating system provides them
- `isMocked` when the operating system reports it
- `source` — `foreground` or `background`

`batteryLevel` stays empty. The app does not add a battery library for this.

The signed-in user and company come from the token. The client does not send `companyId` or `userId`.

### 7.5 Offline

Samples are stored on the device in their own queue, separate from the Pro punch queue. Each sample is tagged with the employee’s user id. Each user keeps at most 500 queued samples. A new sample past that cap drops the oldest for that user.

When the network returns, the app sends that user’s samples in chunks of up to 50 until theirs are gone or a request fails. It removes a sample from the queue only after the server accepts it, marks it as a duplicate, or rejects it as invalid. A network failure leaves that sample queued. Turning the company switch off deletes only the signed-in user’s unsent rows.

If clock-in itself is still queued, samples wait on the device until that clock-in sync returns a time log id. They are then sent with that id. After `collectUntil`, samples that still have no time log id are dropped.

## 8. Server

### 8.1 Company settings

`GET /api/company-settings` includes:

- `breadcrumbsEnabled` (boolean)
- `breadcrumbIntervalMinutes` (integer)

Employees who can already load the punch screen can read both. This spec does not add a way to edit them.

### 8.2 Ingest

`POST /api/timelogs/location-breadcrumbs`

Authentication matches the other time-log routes. The body is:

```json
{
  "samples": [
    {
      "timeLogId": "…",
      "recordedAt": "2026-11-20T00:15:00.000Z",
      "latitude": 14.55,
      "longitude": 121.02,
      "accuracy": 12,
      "altitude": 18,
      "speed": 0,
      "heading": 90,
      "isMocked": false,
      "source": "background"
    }
  ]
}
```

`samples` is required, must be an array, and must contain 1 to 50 items. Optional coordinate fields may be omitted.

For each sample the server:

- Loads the time log and checks that it belongs to the signed-in user and their company. Otherwise that sample is `rejected`.
- Checks that the company has `breadcrumbsEnabled`. When it is off, the whole request is `403` with code `BREADCRUMBS_DISABLED`.
- Checks `recordedAt` is a timestamp, not more than 2 minutes ahead of the server clock, on or after `timeIn`, and on or before `timeOut` when the punch is already closed. Otherwise that sample is `rejected`.
- Checks latitude and longitude are finite, latitude is between -90 and 90, longitude is between -180 and 180, and the point is not 0,0. Otherwise that sample is `rejected`.
- Inserts a `LocationBreadcrumb`. The server sets `id`, `companyId`, `userId`, and `receivedAt`. A row that already exists for the same `timeLogId` and `recordedAt` is `duplicate` and is not inserted again.

A batch with a mix of outcomes returns `200` and a result per sample, in order: `saved`, `duplicate`, or `rejected`, with a short reason on `rejected`. One invalid sample does not roll back the others.

`401` when the token is missing or invalid. `400` when `samples` is missing, empty, or longer than 50, with code `TOO_MANY_SAMPLES` in that last case.

The ingest route is for the employee who owns the punch. It does not use the Employee Map role check. Supervisors are not given a new read API here.

These checks decide whether a sample may be stored. They do not prove the employee was at that place. A modified app can still send timestamps spaced at the company interval. `isMocked` is stored with the row. The trail is what the phone reported.

`POST /api/timelogs/time-in` still succeeds when the `LiveUser` upsert throws. When that row exists, the response includes `collectUntil`, the ISO time of `LiveUser.closeAt`. `GET /api/timelogs/user` includes `collectUntil` on the open log.

## 9. Client notes

The app stays on Expo, React Native, `expo-router`, Axios, and `expo-location`. Background sampling needs `expo-task-manager` and the Expo location background task. Those are new client pieces. The punch screen does not have them today.

Work lands in the punch flow in `app/(tabs)/(shifts)/timekeeping-punch.jsx`, plus a small background task the operating system can run after the employee leaves that screen. The task reads the saved interval, the open time log id, and the queue. It does not depend on the punch screen staying mounted.

Permission copy changes with the behavior:

- The iOS When-In-Use and Always strings say location is recorded during an open shift at the company interval, including while the app is in the background, and stops at clock-out.
- Android declares background location permission.
- The in-app explanation in section 7.2 is shown before the system prompt.

The When-In-Use string that says location is used only at punch time is replaced. It would be false once sampling runs during the shift.

The breadcrumb queue uses its own AsyncStorage key. It is not appended to the Pro punch queue, and a punch-queue flush does not delete it.

## 10. Acceptance criteria

- With `breadcrumbsEnabled` off, Time In and Time Out behave as they do today, and the app sends no location samples.
- With the switch on, Time In does not proceed while location services are off, or while background location permission is missing. The screen explains why and how to allow it.
- With the switch on and permission granted, a successful clock-in starts sampling. A sample is taken about every `breadcrumbIntervalMinutes`, and not more often.
- A missing or sub-1 interval is treated as 5 minutes.
- Samples continue during coffee and lunch breaks.
- Samples continue after the employee leaves the punch screen and after the phone is locked, until clock-out.
- Clock-out stops sampling. Relaunching the app while the punch is still open resumes it.
- A Pro offline Time Out queues the punch and stops location updates immediately. Sampling stays off while that clock-out is still in the punch queue. Samples already taken upload when the network returns. After the server accepts the clock-out, the session is cleared.
- Sampling stops when the clock passes `collectUntil`, including while the phone is locked. Early clock-in and overtime before that time still produce samples. An `autoClockOut` socket event stops tracking while the punch screen is connected.
- Signing out, switching accounts, and a cold start with an expired token pause sampling. No further samples are taken for the employee who left, and their unsent samples are not sent under the other account. Signing back in as that employee, while the punch is still open, resumes sampling and sends what was waiting.
- Denied Android notification permission still allows clock-in. Background updates stay off, the punch screen says so, and sampling continues while the app is open.
- A reboot leaves a gap until the next time the app is opened.
- Each user keeps at most 500 queued samples. A longer offline stretch drops the oldest. Samples that still have no time log id after `collectUntil` are dropped.
- With the switch off at ingest time, the server refuses the batch, the app stops sampling, and only the signed-in user’s unsent samples are deleted.
- A failed fix leaves the punch open. The next interval tries again.
- Each accepted sample is one `LocationBreadcrumb` tied to that user, company, and time log, with the fix’s `recordedAt`.
- Sending the same sample again does not create a second row.
- With no network, samples stay on the device. When the network returns they are stored, and they remain queued if the request fails.
- A sample whose coordinates are unusable, or whose time falls outside the punch, is rejected and dropped from the queue. Other samples in the same batch are still saved.
- A stored sample can carry `isMocked: true`. The server still accepts it. The trail is device-reported.
- `GET /api/company-settings` returns `breadcrumbsEnabled` and `breadcrumbIntervalMinutes`.
- `GET /api/employee-map` still returns `layers.breadcrumbs: null`.
- An employee restricted to assigned sites must still be inside a site to punch, and must also grant background location when the switch is on.
