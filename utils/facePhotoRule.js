export function pickFaceCaptureSettings(raw) {
  return {
    taskReportEnabled: raw?.taskReportEnabled === true,
    taskReportMode: raw?.taskReportMode ?? null,
    taskReportFaceCapture: raw?.taskReportFaceCapture === true,
    taskReportFaceCaptureClockIn: raw?.taskReportFaceCaptureClockIn === true,
  };
}

export function faceCaptureApplies(settings) {
  return (
    settings?.taskReportEnabled === true &&
    settings?.taskReportMode === "forms" &&
    settings?.taskReportFaceCapture === true
  );
}

export function facePhotoRequiredFor(settings, endpoint) {
  if (!faceCaptureApplies(settings)) return false;
  if (endpoint === "/time-out") return true;
  if (endpoint === "/time-in") return settings.taskReportFaceCaptureClockIn === true;
  return false;
}

export function settingsOwner(userId, companyId) {
  if (!userId && !companyId) return null;
  return `${userId ?? ""}:${companyId ?? ""}`;
}
