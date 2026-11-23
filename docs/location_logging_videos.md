# Location logging: store review videos

Google Play requires a video for background location and for the location foreground service. Apple doesn't require one, but App Review sometimes asks. One Android recording covers both Google declarations. Record the iPhone version only if Apple asks.

## 1. Before recording

- Use a test company, not a client company. Set it up through `PUT /api/company-settings`:
  - `breadcrumbsEnabled: true`
  - `breadcrumbIntervalMinutes: 1`, so a sample is taken during the video
  - face photos off (`taskReportFaceCapture: false`), so nothing distracts from the location flow
- Use a test employee in that company, with no open shift.
- Install the 1.0.33 build. To show the permission screens, the app must not have location permission yet: uninstall and reinstall, or reset it in system settings.
- Turn location services on. Turn on Do Not Disturb so no other notifications appear.
- Use a real Android phone if you can. On the emulator, start a route under Extended controls, Location, so the position moves.

## 2. Android video (Google Play), about 30 to 45 seconds

| # | On screen | What to do |
|---|---|---|
| 1 | Clock-in screen, signed in as the test employee | Hold 2 seconds. |
| 2 | Tap Clock in. The "Location during your shift" message appears. | Hold 3 to 4 seconds so a reviewer can read it, then tap Continue. |
| 3 | Android location prompt | Choose "While using the app". |
| 4 | Android settings opens for background location | Choose "Allow all the time", then go back to the app. |
| 5 | Finish clocking in | Show the clocked-in state. |
| 6 | Pull down the notification shade | Show "BizBuddy — Recording your location for this shift." Hold 2 seconds. |
| 7 | Press Home, or lock the screen | Hold a few seconds. Optional caption: "Recording continues in the background during the shift." |
| 8 | Open the app and clock out | Pull down the shade again to show the notification is gone. Optional caption: "Recording stops at clock-out." |

Step 2 is the most important. Google checks that the app explains the background location use before the system prompt appears. The video must show the message, then the prompt.

Record a phone over USB, or the emulator:

```bash
adb devices                                         # the phone or emulator must be listed
adb shell screenrecord --time-limit 180 /sdcard/location-logging.mp4
# do the steps above, then press Ctrl+C
adb pull /sdcard/location-logging.mp4 ~/Desktop/
adb shell rm /sdcard/location-logging.mp4
```

Upload the file to YouTube as Unlisted, or to Google Drive shared as "Anyone with the link". Play Console only accepts a link.

## 3. iPhone video (only if Apple asks)

Same steps. At step 3, choose "Allow While Using App". iOS asks about "Always" later. At step 6, instead of the notification shade, show the blue location indicator in the status bar after pressing Home.

On the Simulator, set a moving location under Features, Location, Freeway Drive, then record:

```bash
xcrun simctl io booted recordVideo ~/Desktop/location-logging-ios.mov
# do the steps, then press Ctrl+C
```

On a real iPhone, use Control Center's Screen Recording.

## 4. Play Console text

Go to App content, then Sensitive app permissions, then Location permissions. Then go to Foreground service permissions and pick the Location type. Use the same video link for both.

**Feature description:**

> BizBuddy is a timekeeping app used by employers. When an employer turns on location logging, BizBuddy records the employee's location at the interval the employer sets (1 to 60 minutes), from the moment the employee clocks in until they clock out. It keeps recording while the app is in the background or the screen is locked, so the employer has a record of where work was done during the shift. Before asking for permission, the app explains this to the employee. A notification is shown the whole time recording is on. No location is collected outside a shift.

**Why it needs background access:** employees put the phone away or lock it while they work. Recording only while the app is open would miss most of the shift.

**Why it needs the foreground service:** Android stops background work that has no visible notification. The foreground service keeps sampling running for the shift and shows the notification.

## 5. Apple review notes (paste into App Review Information)

> Location logging is turned on per company by the employer. Demo account: <email / password of the test employee>. Clock in on the clock-in screen. The app explains background location, then asks for permission. Location is recorded at the company's interval until clock-out.
