export function settlePunchAction(status, code) {
  if (status >= 200 && status < 300) return "done";
  if (!status || status >= 500) return "keep";
  if (code === "FACE_PHOTO_REQUIRED") return "needsPhoto";
  return "drop";
}
