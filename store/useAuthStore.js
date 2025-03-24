// store/useAuthStore.js

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

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
      set({ token, remember: true });
    }
  },
}));

export default useAuthStore;
