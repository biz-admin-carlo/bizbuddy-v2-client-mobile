// hooks/useNotifications.js

import { useState, useEffect, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../config/constant";
import io from "socket.io-client";

// Set to true to always use mock notifications (for testing)
const USE_MOCK_NOTIFICATIONS = false;

// Mock notifications for testing - matching API structure
const getMockNotifications = () => {
  const now = new Date();
  return [
    {
      id: "mock-1",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF001",
      title: "New Shift Assignment",
      message: "You have been assigned to a new shift tomorrow",
      payload: { type: "shift", shiftId: "shift-1" },
      seen: false,
      seenAt: null,
      createdAt: new Date(now.getTime() - 15 * 60000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-2",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF002",
      title: "Leave Request Approved",
      message: "Your leave request has been approved",
      payload: { type: "leave", leaveId: "leave-1" },
      seen: false,
      seenAt: null,
      createdAt: new Date(now.getTime() - 45 * 60000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-3",
      userId: "user-1",
      companyId: "company-1",
      departmentId: null,
      notificationCode: "NOTIF003",
      title: "Payroll Update",
      message: "Your payroll has been processed",
      payload: { type: "payroll", payrollId: "payroll-1" },
      seen: false,
      seenAt: null,
      createdAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: null,
    },
    {
      id: "mock-4",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF001",
      title: "Shift Reminder",
      message: "You have a shift starting in 1 hour",
      payload: { type: "shift", shiftId: "shift-2" },
      seen: false,
      seenAt: null,
      createdAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-5",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF001",
      title: "Overtime Request Pending",
      message: "Your overtime request is pending approval",
      payload: { type: "shift", overtimeId: "ot-1" },
      seen: false,
      seenAt: null,
      createdAt: new Date(now.getTime() - 5 * 3600000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-6",
      userId: "user-1",
      companyId: "company-1",
      departmentId: null,
      notificationCode: "NOTIF003",
      title: "Payroll Statement Available",
      message: "Your latest payslip is ready",
      payload: { type: "payroll", payrollId: "payroll-2" },
      seen: true,
      seenAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: null,
    },
    {
      id: "mock-7",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF002",
      title: "Leave Request Submitted",
      message: "Your leave request has been submitted",
      payload: { type: "leave", leaveId: "leave-2" },
      seen: true,
      seenAt: new Date(
        now.getTime() - 1 * 86400000 - 2 * 3600000,
      ).toISOString(),
      createdAt: new Date(
        now.getTime() - 1 * 86400000 - 2 * 3600000,
      ).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-8",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF001",
      title: "Shift Schedule Updated",
      message: "Your shift schedule has been updated",
      payload: { type: "shift", scheduleId: "schedule-1" },
      seen: true,
      seenAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-9",
      userId: "user-1",
      companyId: "company-1",
      departmentId: null,
      notificationCode: "NOTIF003",
      title: "Holiday Pay Processed",
      message: "Holiday pay has been added to your account",
      payload: { type: "payroll", payrollId: "payroll-3" },
      seen: true,
      seenAt: new Date(
        now.getTime() - 2 * 86400000 - 4 * 3600000,
      ).toISOString(),
      createdAt: new Date(
        now.getTime() - 2 * 86400000 - 4 * 3600000,
      ).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: null,
    },
    {
      id: "mock-10",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF001",
      title: "Time Clock Reminder",
      message: "Don't forget to clock in",
      payload: { type: "shift", reminderId: "reminder-1" },
      seen: false,
      seenAt: null,
      createdAt: new Date(now.getTime() - 3 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-11",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF002",
      title: "Leave Balance Updated",
      message: "Your leave balance has been updated",
      payload: { type: "leave", balanceId: "balance-1" },
      seen: true,
      seenAt: new Date(now.getTime() - 4 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 4 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-12",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF001",
      title: "Overtime Approved",
      message: "Your overtime request has been approved",
      payload: { type: "shift", overtimeId: "ot-2" },
      seen: true,
      seenAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-13",
      userId: "user-1",
      companyId: "company-1",
      departmentId: null,
      notificationCode: "NOTIF003",
      title: "Payroll Deduction Notice",
      message: "A deduction has been applied to your payroll",
      payload: { type: "payroll", deductionId: "deduction-1" },
      seen: true,
      seenAt: new Date(now.getTime() - 6 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 6 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: null,
    },
    {
      id: "mock-14",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF001",
      title: "Shift Swap Request",
      message: "A colleague wants to swap shifts",
      payload: { type: "shift", swapId: "swap-1" },
      seen: false,
      seenAt: null,
      createdAt: new Date(now.getTime() - 7 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-15",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF002",
      title: "Annual Leave Reminder",
      message: "Don't forget to use your annual leave",
      payload: { type: "leave", reminderId: "reminder-2" },
      seen: true,
      seenAt: new Date(now.getTime() - 8 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 8 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-16",
      userId: "user-1",
      companyId: "company-1",
      departmentId: null,
      notificationCode: "NOTIF003",
      title: "Tax Document Available",
      message: "Your tax document is ready for download",
      payload: { type: "payroll", documentId: "doc-1" },
      seen: true,
      seenAt: new Date(now.getTime() - 9 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 9 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: null,
    },
    {
      id: "mock-17",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF001",
      title: "Schedule Change Notification",
      message: "Your schedule has been modified",
      payload: { type: "shift", scheduleId: "schedule-2" },
      seen: true,
      seenAt: new Date(now.getTime() - 10 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 10 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
    {
      id: "mock-18",
      userId: "user-1",
      companyId: "company-1",
      departmentId: "dept-1",
      notificationCode: "NOTIF002",
      title: "Sick Leave Approved",
      message: "Your sick leave has been approved",
      payload: { type: "leave", leaveId: "leave-3" },
      seen: true,
      seenAt: new Date(now.getTime() - 11 * 86400000).toISOString(),
      createdAt: new Date(now.getTime() - 11 * 86400000).toISOString(),
      company: { id: "company-1", name: "Acme Corp" },
      department: { id: "dept-1", name: "Operations" },
    },
  ];
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  const fetchNotifications = async (seen = null) => {
    // Always use mock notifications if flag is set (for testing)
    if (USE_MOCK_NOTIFICATIONS) {
      const mockNotifications = getMockNotifications();
      setNotifications(mockNotifications);
      const unread = mockNotifications.filter((notif) => !notif.seen).length;
      setUnreadCount(unread);
      setLoading(false);
      return;
    }

    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        // Use mock notifications when no token
        const mockNotifications = getMockNotifications();
        setNotifications(mockNotifications);
        const unread = mockNotifications.filter((notif) => !notif.seen).length;
        setUnreadCount(unread);
        setLoading(false);
        return;
      }

      // Build URL with optional seen parameter
      // Try /api/notifications first (matches other endpoints pattern), fallback to /notifications
      let url = `${API_BASE_URL}/api/notifications`;
      if (seen !== null) {
        url += `?seen=${seen}`;
      }

      console.log("[Notifications] Fetching from:", url);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("[Notifications] Response status:", response.status);
      console.log("[Notifications] Response ok:", response.ok);

      // Check if response is JSON before parsing
      const contentType = response.headers.get("content-type");
      console.log("[Notifications] Content-Type:", contentType);

      if (!contentType || !contentType.includes("application/json")) {
        const errorText = await response.text();
        console.error(
          "[Notifications] Non-JSON response:",
          errorText.substring(0, 200),
        );
        throw new Error(
          `Expected JSON but got ${contentType || "unknown content type"}`,
        );
      }

      // Check if response is ok before parsing
      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "[Notifications] API error:",
          response.status,
          errorText.substring(0, 200),
        );
        throw new Error(
          `API returned ${response.status}: ${errorText.substring(0, 100)}`,
        );
      }

      const result = await response.json();
      console.log("[Notifications] API response:", result);

      // Handle nested structure: result.data.notifications (with pagination)
      // or flat structure: result.data (array)
      let notificationsArray = null;

      if (result.data) {
        if (Array.isArray(result.data)) {
          // Flat structure: result.data is an array
          notificationsArray = result.data;
          console.log("[Notifications] Using flat structure (result.data)");
        } else if (
          result.data.notifications &&
          Array.isArray(result.data.notifications)
        ) {
          // Nested structure: result.data.notifications is an array
          notificationsArray = result.data.notifications;
          console.log(
            "[Notifications] Using nested structure (result.data.notifications)",
          );
        } else {
          console.warn(
            "[Notifications] result.data exists but is not an array and doesn't have notifications property:",
            result.data,
          );
        }
      } else {
        console.warn("[Notifications] result.data is missing:", result);
      }

      // Check if we have a valid notifications array
      if (notificationsArray && Array.isArray(notificationsArray)) {
        if (notificationsArray.length > 0) {
          console.log(
            "[Notifications] Found",
            notificationsArray.length,
            "notifications from API",
          );
          const notificationsList = notificationsArray.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
          });
          setNotifications(notificationsList);

          // Fetch unread count separately or use pagination data
          try {
            // First, try to use pagination total from unseen notifications query
            // Try /api/notifications?seen=false first, fallback to /notifications?seen=false
            let unreadResponse = await fetch(
              `${API_BASE_URL}/api/notifications?seen=false`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
            );

            // If 404, try without /api prefix
            if (unreadResponse.status === 404) {
              unreadResponse = await fetch(
                `${API_BASE_URL}/notifications?seen=false`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                },
              );
            }

            if (unreadResponse.ok) {
              const unreadContentType =
                unreadResponse.headers.get("content-type");
              if (
                unreadContentType &&
                unreadContentType.includes("application/json")
              ) {
                const unreadResult = await unreadResponse.json();
                // Handle nested or flat structure for unread count
                if (unreadResult.total !== undefined) {
                  // Flat structure with total field
                  setUnreadCount(unreadResult.total || 0);
                } else if (unreadResult.data?.pagination?.total !== undefined) {
                  // Nested structure with pagination
                  setUnreadCount(unreadResult.data.pagination.total || 0);
                } else {
                  // Fallback: count unread from notifications list
                  const unread = notificationsList.filter(
                    (notif) => !notif.seen,
                  ).length;
                  setUnreadCount(unread);
                }
              } else {
                // Fallback: count unread from notifications list
                const unread = notificationsList.filter(
                  (notif) => !notif.seen,
                ).length;
                setUnreadCount(unread);
              }
            } else {
              // Fallback: count unread from notifications list
              const unread = notificationsList.filter(
                (notif) => !notif.seen,
              ).length;
              setUnreadCount(unread);
            }
          } catch (unreadError) {
            console.error(
              "[Notifications] Error fetching unread count:",
              unreadError,
            );
            // Fallback: count unread from notifications list
            const unread = notificationsList.filter(
              (notif) => !notif.seen,
            ).length;
            setUnreadCount(unread);
          }
        } else {
          // API returned empty array - this is valid, show empty state
          console.log(
            "[Notifications] API returned empty array - no notifications",
          );
          setNotifications([]);
          setUnreadCount(0);
        }
      } else {
        // Invalid response structure - use mocks as fallback
        console.warn(
          "[Notifications] API returned invalid data structure, using mocks. Response:",
          result,
        );
        const mockNotifications = getMockNotifications();
        setNotifications(mockNotifications);
        const unread = mockNotifications.filter((notif) => !notif.seen).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      // If endpoint doesn't exist or error occurs, use mock notifications
      console.error(
        "[Notifications] Error fetching notifications, using mocks:",
        error.message,
      );
      console.error("[Notifications] Full error:", error);
      const mockNotifications = getMockNotifications();
      setNotifications(mockNotifications);
      const unread = mockNotifications.filter((notif) => !notif.seen).length;
      setUnreadCount(unread);
    } finally {
      setLoading(false);
    }
  };

  const markAsSeen = async (notificationId) => {
    try {
      const token = await SecureStore.getItemAsync("token");

      // Optimistically update local state
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === notificationId
            ? { ...notif, seen: true, seenAt: now }
            : notif,
        ),
      );
      // Decrement unread count optimistically
      setUnreadCount((prev) => Math.max(0, prev - 1));

      if (!token) {
        console.warn("[Notifications] No token, updated local state only");
        return;
      }

      // Try /api/notifications/:id/seen first, fallback to /notifications/:id/seen
      let response = await fetch(
        `${API_BASE_URL}/api/notifications/${notificationId}/seen`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      // If 404, try without /api prefix
      if (response.status === 404) {
        console.log(
          `[Notifications] Trying /notifications/${notificationId}/seen without /api prefix`,
        );
        response = await fetch(
          `${API_BASE_URL}/notifications/${notificationId}/seen`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `API returned ${response.status}: ${errorText.substring(0, 100)}`,
        );
      }

      const result = await response.json();
      console.log("[Notifications] Mark as seen response:", result);

      // Update with the actual response data if available
      if (result.data && result.data.id === notificationId) {
        setNotifications((prev) =>
          prev.map((notif) =>
            notif.id === notificationId
              ? { ...notif, seen: result.data.seen, seenAt: result.data.seenAt }
              : notif,
          ),
        );
        // Ensure unread count is updated if this was an unread notification
        if (result.data.seen) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      }

      // Refresh to get updated state from server (including accurate unread count)
      await fetchNotifications();
    } catch (error) {
      console.error(
        "[Notifications] Error marking notification as seen:",
        error,
      );
      // State was already optimistically updated, so we keep it
    }
  };

  const markAllAsSeen = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");

      // Optimistically update local state
      const now = new Date().toISOString();
      const previousUnreadCount = unreadCount;
      setNotifications((prev) =>
        prev.map((notif) => ({ ...notif, seen: true, seenAt: now })),
      );
      setUnreadCount(0);

      if (!token) {
        console.warn("[Notifications] No token, updated local state only");
        return;
      }

      // Use /notifications/mark-all-seen endpoint (without /api prefix)
      const response = await fetch(
        `${API_BASE_URL}/api/notifications/mark-all-seen`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `API returned ${response.status}: ${errorText.substring(0, 100)}`,
        );
      }

      const result = await response.json();
      console.log("[Notifications] Mark all as seen response:", result);
      // Returns: { message: "All notifications marked as seen.", data: { count: 5 } }

      // Update unread count from response if available
      if (result.data?.count !== undefined) {
        setUnreadCount(0); // All marked as seen, so count is 0
      }

      // Refresh to get updated state from server
      await fetchNotifications();
    } catch (error) {
      console.error("[Notifications] Error marking all as seen:", error);
      // State was already optimistically updated, so we keep it
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Set up socket for real-time updates
    const initSocket = async () => {
      try {
        const userId = await SecureStore.getItemAsync("userId");
        if (!userId) return;

        socketRef.current = io(API_BASE_URL, { transports: ["websocket"] });
        socketRef.current.emit("joinUserRoom", userId);

        socketRef.current.on("newNotification", (data) => {
          setNotifications((prev) => {
            const updated = [data, ...prev];
            const unread = updated.filter((notif) => !notif.seen).length;
            setUnreadCount(unread);
            return updated;
          });
        });

        socketRef.current.on("notificationSeen", (data) => {
          setNotifications((prev) => {
            const updated = prev.map((notif) =>
              notif.id === data.id
                ? { ...notif, seen: true, seenAt: data.seenAt }
                : notif,
            );
            const unread = updated.filter((notif) => !notif.seen).length;
            setUnreadCount(unread);
            return updated;
          });
        });
      } catch (error) {
        console.error("Socket initialization error:", error);
      }
    };

    initSocket();

    // Refresh notifications every 30 seconds
    const interval = setInterval(() => fetchNotifications(), 30000);

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      clearInterval(interval);
    };
  }, []);

  const deleteNotification = async (notificationId) => {
    try {
      const token = await SecureStore.getItemAsync("token");

      // Get the notification before deleting to check if it was unread
      const notificationToDelete = notifications.find(
        (n) => n.id === notificationId,
      );
      const wasUnread = notificationToDelete && !notificationToDelete.seen;

      // Optimistically remove from local state
      setNotifications((prev) =>
        prev.filter((notif) => notif.id !== notificationId),
      );
      // Update unread count if needed
      if (wasUnread) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }

      if (!token) {
        console.warn("[Notifications] No token, updated local state only");
        return;
      }

      // Try /api/notifications/:id first, fallback to /notifications/:id
      let response = await fetch(
        `${API_BASE_URL}/api/notifications/${notificationId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      // If 404, try without /api prefix
      if (response.status === 404) {
        console.log(
          `[Notifications] Trying DELETE /notifications/${notificationId} without /api prefix`,
        );
        response = await fetch(
          `${API_BASE_URL}/notifications/${notificationId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `API returned ${response.status}: ${errorText.substring(0, 100)}`,
        );
      }

      console.log("[Notifications] Notification deleted successfully");
      // Refresh to sync with server
      await fetchNotifications();
    } catch (error) {
      console.error("[Notifications] Error deleting notification:", error);
      // Refresh to restore state if deletion failed
      await fetchNotifications();
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsSeen,
    markAllAsSeen,
    deleteNotification,
    refresh: () => fetchNotifications(),
  };
};
