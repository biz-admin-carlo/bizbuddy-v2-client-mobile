import { useState } from "react";
import {
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { systemAdminLogout } from "../../../utils/systemAdminApi";

export default function SystemAdminPanelLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  const androidBottomInset = Platform.OS === "android" ? Math.max(insets.bottom, 16) : 0;
  const tabBarHeight = Platform.OS === "ios" ? 84 : 64 + androidBottomInset;

  const closeAnd = (action) => {
    setMoreOpen(false);
    action();
  };

  const handleLogout = async () => {
    setMoreOpen(false);
    await systemAdminLogout();
    router.replace("/system-admin/login");
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#fb923c",
          tabBarInactiveTintColor: "#94a3b8",
          tabBarLabelStyle: { fontSize: 10, fontWeight: "500", marginTop: 2 },
          tabBarStyle: {
            backgroundColor: "#ffffff",
            borderTopColor: "#e2e8f0",
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingTop: 8,
            paddingBottom: Platform.OS === "ios" ? 24 : androidBottomInset,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Overview",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="users"
          options={{
            title: "Users",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="performance"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="errors"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="security"
          options={{
            title: "Security",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="shield-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              setMoreOpen(true);
            },
          }}
          options={{
            title: "More",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="ellipsis-horizontal" size={size} color={color} />
            ),
            tabBarButton: (props) => (
              <TouchableOpacity
                onPress={() => setMoreOpen(true)}
                style={props.style}
                accessibilityRole="button"
                accessibilityLabel="More"
              >
                {props.children}
              </TouchableOpacity>
            ),
          }}
        />
      </Tabs>

      <Modal
        visible={moreOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMoreOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMoreOpen(false)}>
          <View className="flex-1 bg-black/40 justify-end">
            <View
              className="bg-white rounded-t-3xl px-5 pt-5"
              style={{ paddingBottom: Math.max(insets.bottom, 24) }}
              onStartShouldSetResponder={() => true}
            >
                <View className="w-10 h-1 rounded-full bg-slate-300 self-center mb-5" />
                <Text className="text-lg font-semibold text-slate-900 mb-1">System Admin</Text>
                <Text className="text-xs text-slate-500 mb-4">BizBuddy Analytics</Text>

                <MoreRow
                  icon="trending-up-outline"
                  label="Performance"
                  detail="Endpoint response times"
                  onPress={() => closeAnd(() => router.push("/system-admin/performance"))}
                />
                <MoreRow
                  icon="warning-outline"
                  label="Errors"
                  detail="Error tracking"
                  onPress={() => closeAnd(() => router.push("/system-admin/errors"))}
                />
                <MoreRow
                  icon="log-out-outline"
                  label="Log out"
                  detail="End this system-admin session"
                  danger
                  onPress={handleLogout}
                />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

function MoreRow({ icon, label, detail, onPress, danger = false }) {
  const color = danger ? "#dc2626" : "#334155";
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center py-3 border-t border-slate-100"
    >
      <View
        className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${
          danger ? "bg-red-50" : "bg-slate-100"
        }`}
      >
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View className="flex-1">
        <Text className={`text-base font-medium ${danger ? "text-red-600" : "text-slate-800"}`}>
          {label}
        </Text>
        <Text className="text-xs text-slate-500">{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
    </TouchableOpacity>
  );
}
