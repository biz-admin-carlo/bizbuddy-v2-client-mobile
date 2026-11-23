import axios from "axios";
import { API_BASE_URL } from "../config/constant";
import { getInstallationId } from "./deviceId";
import { pickPunchBody, punchFormParts, withDeviceId } from "./punchBody";

export const PUNCH_TIMEOUT_MS = 60000;

export async function readPunchDeviceId() {
  try {
    const id = String((await getInstallationId()) ?? "").trim();
    return id || null;
  } catch {
    return null;
  }
}

export async function postPunch(endpoint, { token, body, deviceId, answers, facePhoto }) {
  const url = `${API_BASE_URL}/api/timelogs${endpoint}`;
  const headers = { Authorization: `Bearer ${token}` };
  const options = { headers, timeout: PUNCH_TIMEOUT_MS };
  const fields = withDeviceId(pickPunchBody(body), deviceId);

  if (!facePhoto) {
    return axios.post(url, answers ? { ...fields, answers } : fields, options);
  }

  const form = new FormData();
  for (const [name, value] of punchFormParts(fields, { answers })) {
    form.append(name, value);
  }
  form.append("facePhoto", { uri: facePhoto.uri, name: "face.jpg", type: "image/jpeg" });
  // Android rejects a multipart body unless the request says multipart; the native layer adds the boundary.
  return axios.post(url, form, {
    ...options,
    headers: { ...headers, "Content-Type": "multipart/form-data" },
  });
}
