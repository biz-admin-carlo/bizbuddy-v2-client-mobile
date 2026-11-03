import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import RequestDetailRow from "./request-detail-row";
import RequestStatusBadge from "./request-status-badge";

const { height } = Dimensions.get("window");

export default function RequestDetailSheet({
  visible,
  onClose,
  title,
  subtitle = "Request details",
  icon = "document-text-outline",
  status,
  paidLabel,
  rows = [],
  actions = [],
  processing = false,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          className="bg-white rounded-t-3xl"
          style={{
            maxHeight: height * 0.88,
            paddingBottom: Platform.OS === "ios" ? 34 : 24,
          }}
        >
          <View className="items-center py-3">
            <View className="w-10 h-1 bg-slate-200 rounded-full" />
          </View>

          <View className="flex-row justify-between items-start px-5 pb-4 border-b border-slate-100">
            <View className="flex-row items-center flex-1 pr-3">
              <View className="w-12 h-12 rounded-full bg-orange-100 items-center justify-center mr-3">
                <Ionicons name={icon} size={24} color="#f97316" />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-slate-800">{title}</Text>
                <Text className="text-slate-500 text-sm mt-0.5">{subtitle}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View className="px-5 py-3 border-b border-slate-100 flex-row items-center justify-between">
            <RequestStatusBadge status={status} />
            {paidLabel ? (
              <Text className="text-sm text-slate-500">{paidLabel}</Text>
            ) : null}
          </View>

          <ScrollView
            className="px-5 pt-4"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {rows.map((row) => (
              <RequestDetailRow
                key={row.label}
                icon={row.icon}
                label={row.label}
                value={row.value}
              />
            ))}
          </ScrollView>

          <View className="px-5 pt-2">
            {groupActions(actions).map((row, rowIndex) => (
              <View
                key={rowIndex}
                className={`flex-row gap-2 mb-2 ${row.length === 1 ? "" : ""}`}
              >
                {row.map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    onPress={action.onPress}
                    activeOpacity={0.85}
                    disabled={processing || action.disabled}
                    className={`flex-1 py-3.5 rounded-xl items-center justify-center flex-row ${action.className}`}
                  >
                    {action.loading ? (
                      <ActivityIndicator
                        size="small"
                        color={action.spinnerColor ?? "#FFFFFF"}
                      />
                    ) : (
                      <>
                        {action.icon ? (
                          <Ionicons
                            name={action.icon}
                            size={18}
                            color={action.iconColor ?? "#1d4ed8"}
                          />
                        ) : null}
                        <Text
                          className={`${action.textClassName} ${action.icon ? "ml-1.5" : ""}`}
                        >
                          {action.label}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.85}
              className="bg-orange-500 rounded-xl py-3.5 items-center"
            >
              <Text className="text-white font-semibold text-base">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const groupActions = (actions) => {
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
