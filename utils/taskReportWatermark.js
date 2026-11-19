export function buildInscription({ latitude, longitude, capturedAt, timeZone }) {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "America/Los_Angeles",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(capturedAt);
  const lat = Number(latitude).toFixed(5);
  const lng = Number(longitude).toFixed(5);
  return `${lat}, ${lng} · ${when}`;
}
