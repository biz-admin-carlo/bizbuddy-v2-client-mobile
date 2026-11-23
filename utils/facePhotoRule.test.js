import { facePhotoRequiredFor, pickFaceCaptureSettings, settingsOwner } from "./facePhotoRule";

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
