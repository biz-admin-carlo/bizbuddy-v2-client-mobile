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
