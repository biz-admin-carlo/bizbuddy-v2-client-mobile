import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config/constant";
import { getTokenUserId } from "./jwtTokenUtils";
import { readBreadcrumbSession } from "./locationBreadcrumbSession";
import {
  BREADCRUMB_CHUNK,
  dropSamplesForUser,
  dropUnassignedAfter,
  readBreadcrumbQueue,
  settleBreadcrumbChunk,
  writeBreadcrumbQueue,
} from "./locationBreadcrumbQueue";

function withoutUserId(sample) {
  const { userId, ...rest } = sample;
  return rest;
}

export async function flushBreadcrumbQueue() {
  const token = await SecureStore.getItemAsync("token");
  const userId = getTokenUserId(token);
  if (!token || !userId) return { stopped: false };

  const session = await readBreadcrumbSession(userId);
  await dropUnassignedAfter(userId, session && session.collectUntil);

  while (true) {
    const queue = await readBreadcrumbQueue();
    const ready = queue.filter(
      (sample) =>
        sample.userId === userId &&
        typeof sample.timeLogId === "string" &&
        sample.timeLogId,
    );
    const rest = queue.filter(
      (sample) => !(sample.userId === userId && sample.timeLogId),
    );
    if (ready.length === 0) {
      const waiting = queue.filter(
        (sample) => sample.userId === userId && !sample.timeLogId,
      );
      if (waiting.length > 0) {
        console.log("[BizBuddy Location] samples waiting for a time log id", {
          count: waiting.length,
        });
      }
      return { stopped: false };
    }
    const chunk = ready.slice(0, BREADCRUMB_CHUNK);
    const samples = chunk.map(withoutUserId);
    console.log("[BizBuddy Location] adding location log", {
      count: samples.length,
      samples: samples.map((sample) => ({
        timeLogId: sample.timeLogId,
        recordedAt: sample.recordedAt,
        latitude: sample.latitude,
        longitude: sample.longitude,
        source: sample.source,
      })),
    });
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/timelogs/location-breadcrumbs`,
        { samples },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const results = res.data && res.data.data && res.data.data.results;
      console.log("[BizBuddy Location] location log response", {
        status: res.status,
        results: Array.isArray(results)
          ? results.map((result) => (result && result.status) || "unknown")
          : null,
      });
      if (!Array.isArray(results)) return { stopped: false };
      const remainingReady = settleBreadcrumbChunk(ready, results);
      if (remainingReady.length >= ready.length) return { stopped: false };
      await writeBreadcrumbQueue(remainingReady.concat(rest));
    } catch (err) {
      const code = err && err.response && err.response.data && err.response.data.code;
      console.log("[BizBuddy Location] location log failed", {
        status: err && err.response && err.response.status,
        code: code || null,
        message:
          (err && err.response && err.response.data && err.response.data.message) ||
          (err && err.message) ||
          "request failed",
      });
      if (code === "BREADCRUMBS_DISABLED") {
        await dropSamplesForUser(userId);
        return { stopped: true };
      }
      return { stopped: false };
    }
  }
}
