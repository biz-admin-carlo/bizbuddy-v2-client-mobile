jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { settleBreadcrumbChunk, BREADCRUMB_CHUNK, BREADCRUMB_QUEUE_CAP } from "./locationBreadcrumbQueue";

test("drops saved, duplicate, and rejected samples and keeps the unsent tail", () => {
  const queue = [
    { recordedAt: "a" },
    { recordedAt: "b" },
    { recordedAt: "c" },
    { recordedAt: "d" },
  ];
  const results = [
    { status: "saved" },
    { status: "duplicate" },
    { status: "rejected" },
  ];
  const next = settleBreadcrumbChunk(queue, results);
  expect(next.map((item) => item.recordedAt)).toEqual(["d"]);
  expect(BREADCRUMB_CHUNK).toBe(50);
});

test("keeps a sample the server did not classify", () => {
  const queue = [{ recordedAt: "a" }, { recordedAt: "b" }];
  const next = settleBreadcrumbChunk(queue, [{ status: "saved" }]);
  expect(next.map((item) => item.recordedAt)).toEqual(["b"]);
});

test("caps a user queue at 500 by keeping the newest", () => {
  expect(BREADCRUMB_QUEUE_CAP).toBe(500);
});
