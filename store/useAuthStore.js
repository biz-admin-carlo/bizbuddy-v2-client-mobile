// store/useAuthStore.js

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

// Helper function to check if JWT token is expired
const isTokenExpired = (token) => {
  try {
    if (!token) return true;

    const parts = token.split(".");
    if (parts.length !== 3) return true;

    const payload = JSON.parse(atob(parts[1]));
    const currentTime = Math.floor(Date.now() / 1000);

    return payload.exp < currentTime;
  } catch (error) {
    return true; // Assume expired if we can't parse
  }
};

const useAuthStore = create((set, get) => ({
  token: null,
  remember: false,
  login: async (token, remember = false) => {
    set({ token, remember });
    await SecureStore.setItemAsync("token", token);
  },
  logout: async () => {
    set({ token: null });
    if (!get().remember) {
      await SecureStore.deleteItemAsync("token");
    }
  },
  loadToken: async () => {
    const token = await SecureStore.getItemAsync("token");
    if (token) {
      // Check if token is expired
      if (isTokenExpired(token)) {
        console.log("🔄 Token is expired, removing from storage");
        await SecureStore.deleteItemAsync("token");
        set({ token: null, remember: false });
        return false;
      }

      set({ token, remember: true });
      return true;
    }
    return false;
  },
}));

export default useAuthStore;
