import { Directory, File, Paths } from "expo-file-system";

export const MAX_FACE_PHOTO_BYTES = 5 * 1024 * 1024;

export function photoSize(uri) {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

export function deletePunchPhoto(uri) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

function photoDir() {
  const dir = new Directory(Paths.document, "punch-photos");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Moves a stamped photo out of the cache so a queued offline punch keeps it. */
export function keepPunchPhoto(uri) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const target = new File(photoDir(), name);
  new File(uri).copy(target);
  deletePunchPhoto(uri);
  return target.uri;
}
