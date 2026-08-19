import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons, Feather, FontAwesome5 } from "@expo/vector-icons";
import { useAccountSwitcher } from "../hooks/useAccountSwitcher";

/**
 * Facebook-style account switcher: lists every account (email + company combo)
 * saved on this device, lets the user tap to switch instantly, add a new
 * account, or remove a saved (inactive) one from the device.
 */
export default function AccountSwitcherSheet({ visible, onClose }) {
  const {
    accounts,
    loading,
    switchingKey,
    refresh,
    switchToAccount,
    removeAccount,
    addAccount,
  } = useAccountSwitcher();
  const [removingKey, setRemovingKey] = useState(null);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const handleRowPress = async (account) => {
    if (account.isActive || switchingKey) return;
    const result = await switchToAccount(account);
    if (result.ok) {
      onClose();
    } else if (result.reason === "needs_password") {
      onClose();
    }
  };

  const confirmRemove = (account) => {
    Alert.alert(
      "Remove account from this device?",
      `You'll need to sign in again to use ${account.email || account.name} on this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setRemovingKey(account.key);
            try {
              await removeAccount(account);
            } finally {
              setRemovingKey(null);
            }
          },
        },
      ],
    );
  };

  const handleAddAccount = () => {
    onClose();
    addAccount();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          className="bg-white rounded-t-3xl"
          style={{
            paddingBottom: Platform.OS === "ios" ? 24 : 20,
            maxHeight: "80%",
          }}
        >
          <View className="items-center py-3">
            <View className="w-10 h-1 bg-slate-200 rounded-full" />
          </View>

          <View className="px-5 pb-3 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-slate-700">
              Switch Account
            </Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {loading && accounts.length === 0 ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#f97316" />
            </View>
          ) : (
            <ScrollView
              className="px-5"
              style={{ maxHeight: 380 }}
              showsVerticalScrollIndicator={false}
            >
              {accounts.map((account) => {
                const isSwitching = switchingKey === account.key;
                const isRemoving = removingKey === account.key;
                return (
                  <TouchableOpacity
                    key={account.key}
                    onPress={() => handleRowPress(account)}
                    disabled={isSwitching || isRemoving}
                    activeOpacity={0.7}
                    className={`flex-row items-center p-3 mb-3 rounded-xl border ${
                      account.isActive
                        ? "border-orange-400 bg-orange-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <View className="w-12 h-12 rounded-full bg-orange-400 items-center justify-center mr-3">
                      <Text className="text-white text-base font-bold">
                        {account.initials}
                      </Text>
                    </View>

                    <View className="flex-1">
                      <Text className="font-semibold text-base text-slate-700">
                        {account.name}
                      </Text>
                      {!!account.email && (
                        <Text className="text-slate-500 text-xs" numberOfLines={1}>
                          {account.email}
                        </Text>
                      )}
                      <View className="flex-row items-center mt-1">
                        <FontAwesome5 name="building" size={10} color="#94a3b8" />
                        <Text className="text-slate-500 text-xs ml-1" numberOfLines={1}>
                          {account.companyName || "Company"}
                          {account.role ? ` • ${account.role}` : ""}
                        </Text>
                      </View>
                    </View>

                    {isSwitching || isRemoving ? (
                      <ActivityIndicator color="#f97316" size="small" />
                    ) : account.isActive ? (
                      <View className="w-7 h-7 rounded-full bg-orange-400 items-center justify-center">
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </View>
                    ) : account.needsPassword ? (
                      <View className="w-7 h-7 rounded-full bg-slate-100 items-center justify-center">
                        <Ionicons name="lock-closed" size={13} color="#94a3b8" />
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => confirmRemove(account)}
                        className="p-2"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="x" size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View className="px-5 pt-2">
            <TouchableOpacity
              onPress={handleAddAccount}
              className="flex-row items-center justify-center py-3.5 rounded-lg border border-slate-200"
              activeOpacity={0.8}
            >
              <Ionicons
                name="add-circle-outline"
                size={20}
                color="#f97316"
                style={{ marginRight: 8 }}
              />
              <Text className="font-semibold text-slate-700">
                Add another account
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
