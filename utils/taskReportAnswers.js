const LIMITS = { short_text: 500, paragraph: 5000 };

const isBlank = (value) =>
  value == null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

export function validateAnswers(questions, answers) {
  const errors = {};
  const cleaned = {};
  for (const question of questions || []) {
    const raw = answers?.[question.id];
    if (isBlank(raw)) {
      if (question.required) errors[question.id] = "This question is required.";
      continue;
    }
    const result = cleanOne(question, raw);
    if (result.error) errors[question.id] = result.error;
    else cleaned[question.id] = result.value;
  }
  return { ok: Object.keys(errors).length === 0, errors, cleaned };
}

function cleanOne(question, raw) {
  const options = Array.isArray(question.options) ? question.options : [];
  if (question.type === "short_text" || question.type === "paragraph") {
    const text = String(raw).trim();
    if (text.length > LIMITS[question.type]) {
      return { error: `At most ${LIMITS[question.type]} characters.` };
    }
    return { value: text };
  }
  if (question.type === "number") {
    const num = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(num)) return { error: "Enter a number." };
    return { value: num };
  }
  if (question.type === "yes_no") {
    if (typeof raw !== "boolean") return { error: "Choose yes or no." };
    return { value: raw };
  }
  if (question.type === "single_choice" || question.type === "dropdown") {
    if (!options.includes(raw)) return { error: "Choose one of the options." };
    return { value: raw };
  }
  if (question.type === "checkboxes") {
    if (!Array.isArray(raw) || raw.some((item) => !options.includes(item))) {
      return { error: "Choose from the options." };
    }
    return { value: options.filter((option) => raw.includes(option)) };
  }
  if (question.type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
      return { error: "Use YYYY-MM-DD." };
    }
    return { value: String(raw) };
  }
  if (question.type === "time") {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw))) {
      return { error: "Use HH:mm." };
    }
    return { value: String(raw) };
  }
  return { error: "Unsupported question." };
}
