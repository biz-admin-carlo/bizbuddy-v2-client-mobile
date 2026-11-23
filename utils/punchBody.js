const PUNCH_KEYS = [
  "localTimestamp",
  "location",
  "deviceInfo",
  "punchType",
  "reason",
  "remarks",
];

export function pickPunchBody(payload) {
  const out = {};
  for (const key of PUNCH_KEYS) {
    if (payload?.[key] !== undefined) out[key] = payload[key];
  }
  return out;
}

export function withDeviceId(body, deviceId) {
  const next = { ...body };
  delete next.deviceId;
  if (next.deviceInfo && typeof next.deviceInfo === "object") {
    const { proof, ...rest } = next.deviceInfo;
    next.deviceInfo = rest;
  }
  if (deviceId) next.deviceId = deviceId;
  return next;
}

export function withShot(body, shot) {
  return { ...body, localTimestamp: shot.capturedAt, location: shot.location };
}

const TEXT_FIELDS = ["localTimestamp", "punchType", "reason", "deviceId"];
const JSON_FIELDS = ["location", "deviceInfo", "remarks"];

export function punchFormParts(body, { answers } = {}) {
  const parts = [];
  for (const key of TEXT_FIELDS) {
    const v = body?.[key];
    if (v !== undefined && v !== null && v !== "") parts.push([key, String(v)]);
  }
  for (const key of JSON_FIELDS) {
    if (body?.[key] !== undefined) parts.push([key, JSON.stringify(body[key])]);
  }
  if (answers) parts.push(["answers", JSON.stringify(answers)]);
  return parts;
}
