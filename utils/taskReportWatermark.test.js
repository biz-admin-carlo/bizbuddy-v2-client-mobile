import { buildInscription } from "./taskReportWatermark";

test("uses the company zone and the shutter instant", () => {
  const line = buildInscription({
    latitude: 14.5995,
    longitude: 120.9842,
    capturedAt: new Date("2026-11-19T05:41:00.000Z"),
    timeZone: "Asia/Manila",
  });
  expect(line).toContain("14.59950, 120.98420");
  expect(line).toContain("1:41");
  expect(line).toContain("PM");
});
