import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { Ionicons } from "@expo/vector-icons";

const { height } = Dimensions.get("window");

export default function RequestEscalateSheet({
  visible,
  onClose,
  open,
  setOpen,
  value,
  setValue,
  items,
  setItems,
  comments,
  setComments,
  loadingTargets,
  submitting,
  onSubmit,
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
          className="bg-white rounded-t-3xl px-5"
          style={{
            maxHeight: height * 0.85,
            paddingBottom: Platform.OS === "ios" ? 34 : 24,
          }}
        >
          <View className="items-center py-3">
            <View className="w-10 h-1 bg-slate-200 rounded-full" />
          </View>

          <View className="flex-row justify-between items-start pb-4 border-b border-slate-100">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-bold text-slate-800">
                Escalate for final approval
              </Text>
              <Text className="text-slate-500 text-sm mt-0.5">
                Pass this leave request to another supervisor or admin for final sign-off.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={{ zIndex: 2000 }} className="pt-4">
            <Text className="text-sm font-semibold text-slate-600 mb-2">
              Escalate to
            </Text>
            {loadingTargets ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#f97316" />
              </View>
            ) : (
              <DropDownPicker
                open={open}
                value={value}
                items={items}
                setOpen={setOpen}
                setValue={setValue}
                setItems={setItems}
                placeholder="Select an approver"
                textStyle={{ color: "#374151" }}
                style={{
                  borderColor: "#f8fafc",
                  backgroundColor: "#f8fafc",
                  minHeight: 50,
                }}
                dropDownContainerStyle={{
                  borderColor: "#f8fafc",
                  backgroundColor: "#F9FAFB",
                }}
                placeholderStyle={{ color: "#9CA3AF" }}
                zIndex={2000}
                zIndexInverse={2000}
                nestedScrollEnabled={true}
                listMode="SCROLLVIEW"
                scrollViewProps={{ nestedScrollEnabled: true }}
                autoScroll={false}
              />
            )}
          </View>

          <View className="pt-4 pb-2">
            <Text className="text-sm font-semibold text-slate-600 mb-2">
              Comments (optional)
            </Text>
            <View className="bg-slate-50 rounded-lg px-3 py-3">
              <TextInput
                multiline
                style={{ color: "#374151", minHeight: 70 }}
                value={comments}
                onChangeText={setComments}
                placeholder="Add a note for the next approver"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          <View className="pt-2 pb-2">
            <TouchableOpacity
              onPress={onSubmit}
              activeOpacity={0.85}
              disabled={submitting || !value}
              className="bg-blue-600 rounded-xl py-3.5 items-center mb-2"
              style={{ opacity: !value ? 0.6 : 1 }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white font-semibold text-base">Escalate</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.85}
              className="rounded-xl py-3.5 items-center border border-slate-200"
            >
              <Text className="text-slate-700 font-semibold text-base">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
