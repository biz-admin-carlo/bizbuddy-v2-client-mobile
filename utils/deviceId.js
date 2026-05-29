import * as SecureStore from "expo-secure-store";

const INSTALLATION_ID_KEY = "bb_installation_id";

function generateInstallationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Stable id for this app install (persists in SecureStore until app data is cleared).
 */
export async function getInstallationId() {
  let id = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (!id) {
    id = generateInstallationId();
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, id);
  }
  return id;
}
