// store/tutorialStore.js

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TUTORIAL_SEEN_KEY = "bizbuddy.tutorialSeen.v1";

const DEFAULT_STEPS = [
  {
    title: "Welcome to BizBuddy",
    body: "This quick tour will show you where to find timekeeping, leave requests, payroll, and settings. You can skip it anytime.",
  },
  {
    title: "Profile",
    body: "View your profile info and quick access items from the Profile tab.",
    route: "/(tabs)/profile",
    routeLabel: "Open Profile",
    highlight: { kind: "tab", tab: "profile" },
    details: [
      {
        title: "Common actions",
        items: [
          { label: "Refresh", description: "Reload your profile info from the server." },
          { label: "Edit Profile", description: "Update your personal details (name, email, phone, etc.)." },
          { label: "Change Password", description: "Update your account password." },
          { label: "Sign Out", description: "Log out of the app safely." },
        ],
      },
    ],
  },
  {
    title: "Leaves",
    body: "Request time off, review requests, and track leave status in the Leaves tab.",
    route: "/(tabs)/(leaves)/leaves-request",
    routeLabel: "Open Leaves",
    highlight: { kind: "tab", tab: "leaves" },
    details: [
      {
        title: "Request Leave screen",
        items: [
          { label: "Leave Type", description: "Pick the type of leave (Vacation, Sick, etc.)." },
          { label: "Approver", description: "Select who will approve your leave request." },
          { label: "Reason (optional)", description: "Add extra context for the approver." },
          { label: "Leave Start / Leave End", description: "Choose your dates and times." },
          { label: "Confirm", description: "Confirm the date/time (iOS picker modal)." },
          { label: "Submit Leave Request", description: "Send your request." },
        ],
      },
    ],
  },
  {
    title: "Payroll",
    body: "Check payroll details, totals, and related records from the Payroll tab.",
    route: "/(tabs)/payroll",
    routeLabel: "Open Payroll",
    highlight: { kind: "tab", tab: "payroll" },
    details: [
      {
        title: "Payslips",
        items: [
          { label: "View Details", description: "Open the payslip row/card for more info." },
          { label: "View Payslip", description: "Preview your payslip PDF in-app." },
          { label: "Download Payslip", description: "Download/share the payslip PDF." },
        ],
      },
    ],
  },
  {
    title: "Timekeeping",
    body: "Punch in/out and review schedules & time cards from the Timekeeping tab.",
    route: "/(tabs)/(shifts)/timekeeping-punch",
    routeLabel: "Open Timekeeping",
    highlight: { kind: "tab", tab: "timekeeping" },
    details: [
      {
        title: "Punch & breaks",
        items: [
          { label: "Time In / Time Out", description: "Start or end your work session." },
          { label: "Coffee Break", description: "Start/stop a coffee break during a session." },
          { label: "Lunch Break", description: "Start/stop a lunch break during a session." },
          { label: "Refresh", description: "Reload timekeeping status and timers." },
        ],
      },
      {
        title: "System prompts",
        items: [
          { label: "Enable Location", description: "Requested when location is required for punching." },
          { label: "Network / Subscription prompts", description: "Shown when connectivity or plan restrictions apply." },
        ],
      },
    ],
  },
  {
    title: "Settings",
    body: "Manage your account and (for admins) team settings. You can replay this tutorial anytime from Settings.",
    route: "/(tabs)/(settings)",
    routeLabel: "Open Settings",
    highlight: { kind: "tab", tab: "settings" },
    details: [
      {
        title: "App",
        items: [
          { label: "App Tutorial", description: "Replay this guided tour anytime." },
          { label: "Refresh", description: "Reload your profile/subscription data." },
          { label: "Visit Website", description: "Open the BizBuddy website." },
        ],
      },
      {
        title: "Admin tools (role-based)",
        items: [
          { label: "Departments", description: "Manage departments (admin/superadmin)." },
          { label: "Employees", description: "Manage employee roster (supervisor/admin/superadmin)." },
          { label: "Shift / Schedules", description: "Configure timekeeping and schedules (admin/superadmin)." },
          { label: "Overtime Requests", description: "Submit/manage overtime (varies by role)." },
        ],
      },
    ],
  },
  {
    title: "You’re all set",
    body: "That’s it. If you ever get lost, open Settings → App Tutorial to see this again.",
    details: [
      {
        title: "Tip",
        items: [
          { label: "Settings → App Tutorial", description: "Replay the tour whenever you want." },
        ],
      },
    ],
  },
];

const parseSeenValue = (value) => value === "true";

const useTutorialStore = create((set, get) => ({
  steps: DEFAULT_STEPS,
  stepIndex: 0,
  visible: false,
  seen: null, // null = unknown/unhydrated, boolean after hydration
  hydrating: false,

  hydrate: async () => {
    if (get().hydrating) return;
    set({ hydrating: true });
    try {
      const stored = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
      set({ seen: parseSeenValue(stored), hydrating: false });
    } catch (e) {
      set({ seen: false, hydrating: false });
    }
  },

  maybeAutoStart: async () => {
    if (get().seen === null) {
      await get().hydrate();
    }
    if (get().seen) return;
    // Small delay so the UI is ready (tabs mounted, first paint done)
    setTimeout(() => {
      // Re-check in case user already completed/skipped in the meantime
      if (!get().seen) get().start();
    }, 500);
  },

  start: () => set({ visible: true, stepIndex: 0 }),

  replay: () => set({ visible: true, stepIndex: 0 }),

  back: () =>
    set((state) => ({
      stepIndex: Math.max(0, state.stepIndex - 1),
    })),

  next: async () => {
    const { stepIndex, steps } = get();
    if (stepIndex >= steps.length - 1) {
      await get().complete();
      return;
    }
    set({ stepIndex: stepIndex + 1 });
  },

  skip: async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_SEEN_KEY, "true");
    } finally {
      set({ visible: false, seen: true, stepIndex: 0 });
    }
  },

  complete: async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_SEEN_KEY, "true");
    } finally {
      set({ visible: false, seen: true, stepIndex: 0 });
    }
  },
}));

export default useTutorialStore;


