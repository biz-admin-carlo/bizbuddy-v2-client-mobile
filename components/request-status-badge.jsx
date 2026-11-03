import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const STATUS_STYLES = {
  approved: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    icon: "checkmark-circle",
    iconColor: "#15803d",
  },
  rejected: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: "close-circle",
    iconColor: "#b91c1c",
  },
  pending: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: "time",
    iconColor: "#b45309",
  },
  cancelled: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: "ban",
    iconColor: "#64748b",
  },
  default: {
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: "help-circle",
    iconColor: "#64748b",
  },
};

const resolveStatusStyle = (status) => {
  const key = String(status ?? "").toLowerCase();
  if (key.includes("approved")) return STATUS_STYLES.approved;
  if (key.includes("reject")) return STATUS_STYLES.rejected;
  if (key.includes("cancel")) return STATUS_STYLES.cancelled;
  if (key.includes("pending")) return STATUS_STYLES.pending;
  return STATUS_STYLES.default;
};

const defaultFormatLabel = (status) => {
  const raw = String(status ?? "").trim();
  if (!raw) return "—";
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "pending_secondary") return "Pending final";
  return raw.replace(/_/g, " ");
};

/**
 * Status chip for request cards and detail sheets.
 */
export default function RequestStatusBadge({ status, formatLabel }) {
  const style = resolveStatusStyle(status);
  const label = (formatLabel ?? defaultFormatLabel)(status);
  const isCustomLabel =
    String(status ?? "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_") === "pending_secondary";

  return (
    <View
      className={`flex-row items-center rounded-lg px-2.5 py-1 border ${style.bg} ${style.border}`}
    >
      <Ionicons
        name={style.icon}
        size={13}
        color={style.iconColor}
        style={{ marginRight: 4 }}
      />
      <Text
        className={`text-xs font-semibold ${isCustomLabel ? "" : "capitalize"} ${style.text}`}
      >
        {label}
      </Text>
    </View>
  );
}
