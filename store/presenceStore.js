// store/presenceStore.js

import { create } from "zustand";

const usePresenceStore = create((set) => ({
  presenceStatus: "available",
  lastActiveAt: null,
  setPresence: (status, lastActiveAt) => set({ presenceStatus: status, lastActiveAt }),
}));

export default usePresenceStore;
