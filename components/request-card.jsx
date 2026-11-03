import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import RequestStatusBadge from "./request-status-badge";

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
});

export default function RequestCard({
  title,
  subtitle,
  status,
  periodLabel = "Period",
  periodValue,
  submittedLabel,
  reason,
  approverName,
  secondaryApproverName,
  icon = "document-text-outline",
  onPress,
  actions = [],
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="mb-3 p-4 bg-white rounded-xl border border-slate-100"
      style={cardShadow}
    >
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-row items-center flex-1 pr-2 min-w-0">
          <View className="w-10 h-10 rounded-full bg-orange-50 items-center justify-center mr-3">
            <Ionicons name={icon} size={20} color="#f97316" />
          </View>
          <View className="flex-1 min-w-0">
            <Text
              className="font-semibold text-slate-800 text-base"
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <RequestStatusBadge status={status} />
      </View>

      {periodValue ? (
        <View className="bg-slate-50 rounded-lg px-3 py-2.5 mb-3 border border-slate-100">
          <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
            {periodLabel}
          </Text>
          <View className="flex-row items-center">
            <Ionicons name="calendar-outline" size={15} color="#94a3b8" />
            <Text className="text-sm font-medium text-slate-800 ml-2 flex-1 leading-5">
              {periodValue}
            </Text>
          </View>
        </View>
      ) : null}

      <View className="flex-row items-end justify-between">
        <View className="flex-1 pr-2">
          {submittedLabel ? (
            <Text className="text-xs text-slate-500">{submittedLabel}</Text>
          ) : null}
          {reason ? (
            <Text className="text-xs text-slate-600 mt-1" numberOfLines={2}>
              {reason}
            </Text>
          ) : (
            <Text className="text-xs text-slate-400 mt-1 italic">
              No reason provided
            </Text>
          )}
          {approverName ? (
            <Text className="text-xs text-slate-500 mt-1" numberOfLines={1}>
              Approver: {approverName}
            </Text>
          ) : null}
          {secondaryApproverName ? (
            <Text
              className="text-xs text-blue-600 mt-1 font-medium"
              numberOfLines={1}
            >
              Escalated to: {secondaryApproverName}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
      </View>

      {actions.length > 0 ? (
        <View className="mt-3">
          {groupPrimaryActions(actions).map((row, rowIndex) => (
            <View
              key={rowIndex}
              className={`flex-row gap-2 ${rowIndex > 0 ? "mt-2" : ""}`}
            >
              {row.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  onPress={action.onPress}
                  activeOpacity={0.85}
                  disabled={action.disabled}
                  className={`flex-1 py-2.5 rounded-lg items-center justify-center flex-row ${
                    action.className
                  }`}
                >
                  {action.loading ? (
                    <ActivityIndicator size="small" color={action.spinnerColor ?? "#FFFFFF"} />
                  ) : (
                    <>
                      {action.icon ? (
                        <Ionicons
                          name={action.icon}
                          size={16}
                          color={action.iconColor ?? "#1d4ed8"}
                        />
                      ) : null}
                      <Text className={`${action.textClassName} ${action.icon ? "ml-1.5" : ""}`}>
                        {action.label}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const groupPrimaryActions = (actions) => {
  const rows = [];
  let pair = [];
  for (const action of actions) {
    if (action.fullWidth) {
      if (pair.length) {
        rows.push(pair);
        pair = [];
      }
      rows.push([action]);
    } else {
      pair.push(action);
      if (pair.length === 2) {
        rows.push(pair);
        pair = [];
      }
    }
  }
  if (pair.length) rows.push(pair);
  return rows;
};
