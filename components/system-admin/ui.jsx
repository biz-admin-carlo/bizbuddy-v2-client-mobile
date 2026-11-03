import { Children, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SYSTEM_ADMIN_TIME_RANGES } from "../../utils/systemAdminFormat";

export function VerifyingAccess() {
  return (
    <View className="flex-1 bg-slate-50 items-center justify-center">
      <ActivityIndicator size="large" color="#ea580c" />
      <Text className="text-slate-500 text-sm mt-4">Verifying access...</Text>
    </View>
  );
}

export function AdminHeader({ title, subtitle, onRefresh, loading, extra }) {
  return (
    <View className="mb-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-2xl font-semibold text-slate-900">{title}</Text>
          {subtitle ? (
            <Text className="text-sm text-slate-500 mt-1">{subtitle}</Text>
          ) : null}
        </View>
        {onRefresh ? (
          <TouchableOpacity
            onPress={onRefresh}
            disabled={loading}
            className="p-2 rounded-md border border-slate-300 bg-white"
            accessibilityLabel="Refresh"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#334155" />
            ) : (
              <Ionicons name="refresh" size={16} color="#334155" />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
      {extra}
    </View>
  );
}

export function TimeRangeChips({ value, onChange, disabled }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-3"
      contentContainerStyle={{ paddingRight: 8 }}
    >
      {SYSTEM_ADMIN_TIME_RANGES.map((range) => {
        const selected = value === range;
        return (
          <TouchableOpacity
            key={range}
            disabled={disabled}
            onPress={() => onChange(range)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            className="mr-2 px-3 py-1.5 rounded-full border"
            style={{
              backgroundColor: selected ? "#f97316" : "#ffffff",
              borderColor: selected ? "#f97316" : "#cbd5e1",
            }}
          >
            <Text
              className="text-xs font-medium"
              style={{ color: selected ? "#ffffff" : "#475569" }}
            >
              {range}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function StatCard({ label, value, detail, icon, iconColor = "#94a3b8" }) {
  return (
    <View className="flex-1 border border-slate-300 rounded-md p-3 bg-white min-w-[46%]">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-[10px] font-medium text-slate-500 uppercase flex-1 pr-2">
          {label}
        </Text>
        <Ionicons name={icon} size={14} color={iconColor} />
      </View>
      <Text className="text-xl font-semibold text-slate-900">{value}</Text>
      {detail ? <Text className="text-xs text-slate-500 mt-1">{detail}</Text> : null}
    </View>
  );
}

export function MethodBadge({ method, tone = "blue" }) {
  const isRed = tone === "red";
  return (
    <View className={`px-1.5 py-0.5 rounded ${isRed ? "bg-red-100" : "bg-blue-100"}`}>
      <Text className={`text-[10px] font-medium ${isRed ? "text-red-700" : "text-blue-700"}`}>
        {method || "—"}
      </Text>
    </View>
  );
}

export function ListAccordion({ title, subtitle, extra, children }) {
  return (
    <View className="border border-slate-300 rounded-md bg-white mb-4">
      <View className="p-3">
        <Text className="text-sm font-semibold text-slate-900">{title}</Text>
        {subtitle ? <Text className="text-xs text-slate-500 mt-1">{subtitle}</Text> : null}
      </View>
      {extra}
      {children}
    </View>
  );
}

export function ShowMore({ children, limit = 5 }) {
  const [open, setOpen] = useState(false);
  const items = Children.toArray(children);
  if (items.length <= limit) return <>{items}</>;
  return (
    <>
      {open ? items : items.slice(0, limit)}
      <TouchableOpacity
        onPress={() => setOpen((value) => !value)}
        className="py-3 flex-row items-center justify-center border-t border-slate-100"
        accessibilityRole="button"
      >
        <Text className="text-sm font-medium text-slate-700 mr-1">
          {open ? "Show less" : "Show all"}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
      </TouchableOpacity>
    </>
  );
}

export function SectionCard({ title, subtitle, icon, children }) {
  return (
    <View className="border border-slate-300 rounded-md bg-white mb-4">
      <View className="p-4 border-b border-slate-200">
        <View className="flex-row items-center gap-2">
          {icon ? <Ionicons name={icon} size={16} color="#64748b" /> : null}
          <Text className="text-sm font-semibold text-slate-900">{title}</Text>
        </View>
        {subtitle ? <Text className="text-xs text-slate-500 mt-1">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function VerticalBars({ points, valueKey, color, height = 88 }) {
  const values = points.map((point) => Number(point[valueKey]) || 0);
  const max = Math.max(...values, 1);
  return (
    <View
      style={{
        height,
        flexDirection: "row",
        alignItems: "flex-end",
        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
      }}
    >
      {points.map((point, index) => {
        const amount = Number(point[valueKey]) || 0;
        const barHeight = amount === 0 ? 0 : Math.max(3, (amount / max) * (height - 4));
        return (
          <View
            key={`${point.hour || index}`}
            style={{ flex: 1, height, justifyContent: "flex-end", alignItems: "center" }}
          >
            <View
              style={{
                height: barHeight,
                width: 6,
                maxWidth: "70%",
                backgroundColor: color,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon, title, body }) {
  return (
    <View className="border border-slate-300 rounded-md bg-white p-10 items-center">
      <Ionicons name={icon} size={40} color="#cbd5e1" />
      <Text className="text-base font-semibold text-slate-900 mt-3 text-center">{title}</Text>
      <Text className="text-sm text-slate-500 mt-1 text-center">{body}</Text>
    </View>
  );
}

export function LoadingBlock() {
  return (
    <View className="h-64 items-center justify-center">
      <ActivityIndicator color="#94a3b8" />
    </View>
  );
}

export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <View className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
      <Text className="text-red-600 text-sm">{message}</Text>
    </View>
  );
}
