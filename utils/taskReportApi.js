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

export async function submitClosedTaskReport(timeLogId, { answers }) {
  const headers = await authHeaders();
  return axios.put(
    `${API_BASE_URL}/api/task-report-forms/me/punch/${timeLogId}`,
    { answers, submit: true },
    { headers },
  );
}
