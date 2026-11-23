import { pickPunchBody, punchFormParts, withDeviceId, withShot } from "./punchBody";

test("keeps punch fields and drops token and callbacks", () => {
  const body = pickPunchBody({
    localTimestamp: "t",
    location: { latitude: 1, longitude: 2 },
    token: "secret",
    afterSuccess: () => {},
  });
  expect(body).toEqual({ localTimestamp: "t", location: { latitude: 1, longitude: 2 } });
});

test("adds deviceId at the top level and strips proof", () => {
  const input = { deviceInfo: { brand: "x", proof: { a: 1 } } };
  const out = withDeviceId(input, "abc");
  expect(out).toEqual({ deviceInfo: { brand: "x" }, deviceId: "abc" });
  expect(input.deviceInfo.proof).toEqual({ a: 1 });
});

test("omits deviceId when there is none", () => {
  expect(withDeviceId({ deviceId: "old" }, null)).toEqual({});
});

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
