import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config/constant";

async function authHeaders() {
  const token = await SecureStore.getItemAsync("token");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchOpenTaskReport() {
  const res = await axios.get(`${API_BASE_URL}/api/task-report-forms/me/open`, {
    headers: await authHeaders(),
  });
  return res.data.data;
}

export async function fetchPendingTaskReports() {
  const res = await axios.get(
    `${API_BASE_URL}/api/task-report-forms/me/pending`,
    { headers: await authHeaders() },
  );
  return res.data.data;
}

export async function fetchTaskReportForPunch(timeLogId) {
  const res = await axios.get(
    `${API_BASE_URL}/api/task-report-forms/me/punch/${timeLogId}`,
    { headers: await authHeaders() },
  );
  return res.data.data;
}

export async function postClockOutJson(payload) {
  const headers = await authHeaders();
  const body = {
    deviceInfo: payload.deviceInfo,
    location: payload.location,
    localTimestamp: payload.localTimestamp,
  };
  if (payload.punchType) body.punchType = payload.punchType;
  return axios.post(`${API_BASE_URL}/api/timelogs/time-out`, body, { headers });
}

export async function postClockOutWithReport(payload, { answers, facePhoto }) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append("deviceInfo", JSON.stringify(payload.deviceInfo ?? null));
  body.append("location", JSON.stringify(payload.location ?? null));
  body.append("localTimestamp", payload.localTimestamp);
  if (payload.punchType) body.append("punchType", payload.punchType);
  body.append("answers", JSON.stringify(answers));
  body.append("facePhoto", {
    uri: facePhoto.uri,
    name: "face.jpg",
    type: "image/jpeg",
  });
  return axios.post(`${API_BASE_URL}/api/timelogs/time-out`, body, { headers });
}

export async function submitClosedTaskReport(timeLogId, { answers, facePhoto }) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append("answers", JSON.stringify(answers));
  body.append("submit", "true");
  body.append("facePhoto", {
    uri: facePhoto.uri,
    name: "face.jpg",
    type: "image/jpeg",
  });
  return axios.put(
    `${API_BASE_URL}/api/task-report-forms/me/punch/${timeLogId}`,
    body,
    { headers },
  );
}
