import { create } from "zustand";

const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: true,
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setLoading: (loading) => set({ loading }),
  /** Clear cached notifications (e.g. right after switching accounts) so the next fetch starts clean. */
  reset: () => set({ notifications: [], unreadCount: 0, loading: true }),
}));

export default useNotificationStore;

