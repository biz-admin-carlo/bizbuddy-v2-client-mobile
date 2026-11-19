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
  const result = validateAnswers(questions, {
    a: "Done",
    b: true,
    c: ["Van", "Van", "Radio"],
  });
  expect(result.cleaned.c).toEqual(["Radio", "Van"]);
});
