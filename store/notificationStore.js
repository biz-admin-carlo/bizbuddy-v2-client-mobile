import { create } from "zustand";

const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: true,
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setLoading: (loading) => set({ loading }),
}));

export default useNotificationStore;

