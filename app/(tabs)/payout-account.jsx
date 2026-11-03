// File: app/(tabs)/payout-account.jsx

"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../../config/constant";
import { getTokenUserId } from "../../utils/jwtTokenUtils";

const OWN_PAYOUT_ROLES = new Set(["employee", "admin", "superadmin"]);

// `/payout-accounts/me` accepts the employee role only. Admins and superadmins
// are paid too, and the server already lets them save an account by user id.
const payoutAccountPath = (role, userId) => {
  if (role === "employee") return "/api/disbursements/payout-accounts/me";
  if ((role === "admin" || role === "superadmin") && userId) {
    return `/api/disbursements/payout-accounts/employees/${encodeURIComponent(userId)}`;
  }
  return "";
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isAccountLinked = (account) =>
  Boolean(account?.bankLinked) ||
  String(account?.status || "").toLowerCase() === "verified";

const isAccountUnavailable = (account) =>
  account?.configured === false || !account?.provider;

const digitsOnly = (value, maxLength) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(0, maxLength);

function Field({ label, children }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-semibold text-slate-600">{label}</Text>
      {children}
    </View>
  );
}

function TextField({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  maxLength,
}) {
  return (
    <View className="flex-row items-center rounded-lg border border-slate-200 bg-white px-4 py-3">
      <TextInput
        className="flex-1 text-slate-700"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
      />
    </View>
  );
}

export default function PayoutAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requestIdRef = useRef(0);
  const accountPathRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [account, setAccount] = useState(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [holderName, setHolderName] = useState("");
  const [bankAccountType, setBankAccountType] = useState("checking");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const applyProfilePrefill = useCallback((profile) => {
    const nextFirst = profile?.profile?.firstName || "";
    const nextLast = profile?.profile?.lastName || "";
    const nextEmail = profile?.user?.email || "";
    setFirstName((current) => current || nextFirst);
    setLastName((current) => current || nextLast);
    setEmail((current) => current || nextEmail);
  }, []);

  const resolveAccountPath = useCallback(
    async (token) => {
      const response = await fetch(`${API_BASE_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.data?.user) {
        return { error: payload?.message || "Could not load your profile." };
      }
      applyProfilePrefill(payload.data);
      const role = String(payload.data.user.role || "").toLowerCase();
      const userId = payload.data.user.id || getTokenUserId(token);
      if (!OWN_PAYOUT_ROLES.has(role)) {
        return { forbidden: true };
      }
      const path = payoutAccountPath(role, userId);
      if (!path) {
        return { error: "Could not find your user id for the payout account." };
      }
      accountPathRef.current = path;
      return { path };
    },
    [applyProfilePrefill]
  );

  const loadAccount = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      if (requestId !== requestIdRef.current) return;
      if (!token) {
        setLoadError("Please sign in again.");
        setAccount(null);
        return;
      }
      const resolved = await resolveAccountPath(token);
      if (requestId !== requestIdRef.current) return;
      if (resolved.forbidden) {
        setForbidden(true);
        setAccount(null);
        setLoadError("");
        return;
      }
      if (!resolved.path) {
        setLoadError(resolved.error || "Could not load your payout account.");
        setAccount(null);
        return;
      }
      const response = await fetch(`${API_BASE_URL}${resolved.path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== requestIdRef.current) return;
      if (!response.ok) {
        const serverMessage =
          typeof payload?.message === "string" ? payload.message.trim() : "";
        console.log("[PayoutAccount] Check failed", response.status, serverMessage);
        setLoadError(
          serverMessage ||
            (response.status === 404
              ? "Payout accounts are not available on this server yet."
              : "Could not load your payout account.")
        );
        setAccount(null);
        return;
      }
      const data = payload?.data || {};
      setForbidden(false);
      setLoadError("");
      setAccount(data);
      if (isAccountLinked(data)) {
        setRoutingNumber("");
        setAccountNumber("");
        setSaveError("");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("[PayoutAccount] Account fetch error:", error);
      setLoadError("Could not load your payout account.");
      setAccount(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [resolveAccountPath]);

  useFocusEffect(
    useCallback(() => {
      loadAccount();
    }, [loadAccount])
  );

  const validate = () => {
    if (!firstName.trim() || !lastName.trim()) {
      return "Enter your first and last name.";
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      return "Enter a valid email address.";
    }
    if (!holderName.trim()) {
      return "Enter the account holder name.";
    }
    if (bankAccountType !== "checking" && bankAccountType !== "savings") {
      return "Choose checking or savings.";
    }
    if (!/^\d{9}$/.test(routingNumber)) {
      return "Enter a 9-digit routing number.";
    }
    if (!/^\d{4,17}$/.test(accountNumber)) {
      return "Enter an account number of 4 to 17 digits.";
    }
    return "";
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSubmitting(true);
    setSaveError("");
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) {
        setSaveError("Please sign in again.");
        return;
      }
      const path = accountPathRef.current;
      if (!path) {
        setSaveError("Could not find your payout account.");
        return;
      }
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          bank: {
            holderName: holderName.trim(),
            holderType: "individual",
            bankAccountType,
            routingNumber,
            accountNumber,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(payload?.message || "Could not save your payout account.");
        return;
      }
      const data = payload?.data || {};
      setRoutingNumber("");
      setAccountNumber("");
      setAccount(data);
      if (!isAccountLinked(data)) {
        setSaveError(
          "Your bank details were sent, but the payout account is not linked yet."
        );
      }
    } catch (error) {
      console.error("[PayoutAccount] Save error:", error);
      setSaveError("Could not save your payout account.");
    } finally {
      setSubmitting(false);
    }
  };

  const linked = isAccountLinked(account);
  const unavailable = !linked && isAccountUnavailable(account);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView
        className="flex-1 bg-white"
        style={{ paddingTop: insets.top + 60 }}
      >
        <View className="flex-row items-center border-b border-slate-200 px-4 py-3">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="chevron-back" size={24} color="#404040" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-700">Payout account</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#cbd5e1" />
            <Text className="mt-4 text-slate-500">Checking payout account...</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-4 pb-10"
            keyboardShouldPersistTaps="handled"
          >
            {forbidden ? (
              <StatusCard
                icon="lock-closed-outline"
                title="Payout account unavailable"
                body="Employees, admins, and superadmins can add the bank account used for their pay."
              />
            ) : loadError ? (
              <View>
                <StatusCard
                  icon="alert-circle-outline"
                  title="Could not check your payout account"
                  body={loadError}
                />
                <TouchableOpacity
                  className="mt-4 items-center rounded-lg bg-orange-400 py-3"
                  onPress={loadAccount}
                  activeOpacity={0.9}
                >
                  <Text className="font-semibold text-white">Try again</Text>
                </TouchableOpacity>
              </View>
            ) : linked ? (
              <StatusCard
                icon="checkmark-circle-outline"
                title="Payout account already set up"
                body="Your pay will be sent to the bank account on file. This app does not show the bank name or account number."
              />
            ) : unavailable ? (
              <StatusCard
                icon="business-outline"
                title="Payouts are not available yet"
                body="Your company has not set up payouts yet. Ask an administrator to link a funding account."
              />
            ) : (
              <View>
                {account?.companyReady === false ? (
                  <View className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <Text className="text-sm text-amber-800">
                      Your company is still finishing funding setup. You can add
                      your bank account now, but pay cannot be sent until that
                      setup is complete.
                    </Text>
                  </View>
                ) : null}

                {saveError ? (
                  <View className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                    <Text className="text-sm text-red-600">{saveError}</Text>
                  </View>
                ) : null}

                <Field label="First name">
                  <TextField
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    autoCapitalize="words"
                  />
                </Field>
                <Field label="Last name">
                  <TextField
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    autoCapitalize="words"
                  />
                </Field>
                <Field label="Email">
                  <TextField
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </Field>
                <Field label="Account holder name">
                  <TextField
                    value={holderName}
                    onChangeText={setHolderName}
                    placeholder="Name on the account"
                    autoCapitalize="words"
                  />
                </Field>

                <Field label="Account type">
                  <View className="flex-row">
                    {[
                      { value: "checking", label: "Checking" },
                      { value: "savings", label: "Savings" },
                    ].map((type) => {
                      const selected = bankAccountType === type.value;
                      return (
                        <TouchableOpacity
                          key={type.value}
                          className={`mr-2 rounded-lg border px-4 py-3 ${
                            selected
                              ? "border-orange-400 bg-orange-50"
                              : "border-slate-200 bg-white"
                          }`}
                          onPress={() => setBankAccountType(type.value)}
                          activeOpacity={0.85}
                        >
                          <Text
                            className={`text-sm font-semibold ${
                              selected ? "text-orange-500" : "text-slate-600"
                            }`}
                          >
                            {type.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Field>

                <Field label="Routing number">
                  <TextField
                    value={routingNumber}
                    onChangeText={(value) => setRoutingNumber(digitsOnly(value, 9))}
                    placeholder="9 digits"
                    keyboardType="number-pad"
                    maxLength={9}
                  />
                </Field>
                <Field label="Account number">
                  <TextField
                    value={accountNumber}
                    onChangeText={(value) =>
                      setAccountNumber(digitsOnly(value, 17))
                    }
                    placeholder="Account number"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={17}
                  />
                </Field>

                <TouchableOpacity
                  className={`mt-2 items-center rounded-lg py-3 ${
                    submitting ? "bg-orange-200" : "bg-orange-400"
                  }`}
                  onPress={handleSave}
                  disabled={submitting}
                  activeOpacity={0.9}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="font-semibold text-white">
                      Save payout account
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function StatusCard({ icon, title, body }) {
  return (
    <View className="items-center rounded-xl bg-slate-50 px-5 py-8">
      <Ionicons name={icon} size={40} color="#fb923c" />
      <Text className="mt-3 text-center text-lg font-semibold text-slate-700">
        {title}
      </Text>
      <Text className="mt-2 text-center text-sm text-slate-500">{body}</Text>
    </View>
  );
}
