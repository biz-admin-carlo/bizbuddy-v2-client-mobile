import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { OtpQr } from "../../components/system-admin/OtpQr";
import {
  systemAdminLogin,
  systemAdminMfaSetup,
  systemAdminMfaVerify,
} from "../../utils/systemAdminApi";

function groupSecret(secret) {
  return (String(secret || "").match(/.{1,4}/g) || []).join(" ");
}

export default function SystemAdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const goBackToEmployee = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(auth)/signin");
  };

  const resetToPassword = (message = "") => {
    setStep("password");
    setPassword("");
    setMfaToken("");
    setSecret("");
    setOtpauthUrl("");
    setCode("");
    setUseRecovery(false);
    setRecoveryCodes([]);
    setSavedCodes(false);
    setError(message);
  };

  const applyMfaError = (result) => {
    if (result?.expired) {
      resetToPassword(result.message);
      return;
    }
    if (result?.clearCode) setCode("");
    setError(result?.message || "An error occurred. Please try again.");
  };

  const enterDashboard = (remaining) => {
    router.replace("/system-admin");
    if (typeof remaining === "number" && remaining <= 3) {
      Alert.alert(
        "Recovery codes",
        `You have ${remaining} recovery ${remaining === 1 ? "code" : "codes"} left.`,
      );
    }
  };

  const handlePassword = async () => {
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await systemAdminLogin(username.trim(), password);
      if (!result.ok) {
        applyMfaError(result);
        return;
      }
      if (result.step === "setup") {
        setPassword("");
        setMfaToken(result.mfaToken);
        setSecret(result.secret);
        setOtpauthUrl(result.otpauthUrl);
        setCode("");
        setStep("setup");
        return;
      }
      if (result.step === "verify") {
        setPassword("");
        setMfaToken(result.mfaToken);
        setSecret("");
        setOtpauthUrl("");
        setCode("");
        setUseRecovery(false);
        setStep("verify");
        return;
      }
      enterDashboard();
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async () => {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await systemAdminMfaSetup(mfaToken, digits);
      if (!result.ok) {
        applyMfaError(result);
        return;
      }
      setSecret("");
      setOtpauthUrl("");
      setCode("");
      setRecoveryCodes(result.recoveryCodes);
      setSavedCodes(false);
      setStep("codes");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (useRecovery) {
      if (!code.trim()) {
        setError("Enter a recovery code.");
        return;
      }
    } else if (code.replace(/\D/g, "").length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await systemAdminMfaVerify(
        mfaToken,
        useRecovery
          ? { recoveryCode: code.trim() }
          : { code: code.replace(/\D/g, "") },
      );
      if (!result.ok) {
        applyMfaError(result);
        return;
      }
      enterDashboard(result.recoveryCodesRemaining);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const shareRecoveryCodes = async () => {
    const who = username.trim();
    const body = [
      `BizBuddy system admin recovery codes${who ? ` (${who})` : ""}`,
      "Each code works once.",
      "",
      recoveryCodes.join("\n"),
    ].join("\n");
    try {
      await Share.share({ message: body });
    } catch {
      setError("Could not open the share sheet.");
    }
  };

  const subtitle =
    step === "setup"
      ? "Scan the code, then enter the 6-digit code from your authenticator app."
      : step === "verify"
        ? useRecovery
          ? "Enter one of your saved recovery codes. Each code works once."
          : "Open your authenticator app and enter the 6-digit code for BizBuddy."
        : step === "codes"
          ? "If you lose your phone, each of these codes lets you sign in once. They won't be shown again."
          : "Restricted access · Authorized personnel only";

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {step === "codes" ? (
            <View className="h-6 mb-6" />
          ) : (
            <TouchableOpacity
              onPress={step === "password" ? goBackToEmployee : () => resetToPassword()}
              className="flex-row items-center mb-6"
              accessibilityLabel={step === "password" ? "Back to sign in" : "Back"}
            >
              <Ionicons name="arrow-back" size={18} color="#f97316" />
              <Text className="text-orange-500 ml-2 text-sm">
                {step === "password" ? "Employee sign in" : "Back"}
              </Text>
            </TouchableOpacity>
          )}

          <View className="items-center mb-8">
            <View className="w-20 h-20 rounded-full bg-orange-500 items-center justify-center mb-4">
              <Ionicons name="shield-checkmark" size={36} color="#fff" />
            </View>
            <Text className="text-3xl font-bold text-slate-900 text-center">
              {step === "codes" ? "Save your recovery codes" : "System Administrator"}
            </Text>
            <Text className="text-slate-500 text-center mt-2">{subtitle}</Text>
          </View>

          <View className="bg-white rounded-2xl border border-slate-200 p-6">
            {step === "password" ? (
              <>
                <Field label="Username">
                  <Ionicons name="person-outline" size={18} color="#94a3b8" />
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Username"
                    placeholderTextColor="#94a3b8"
                    className="flex-1 ml-2 text-slate-800"
                  />
                </Field>
                <Field label="Password">
                  <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Password"
                    placeholderTextColor="#94a3b8"
                    className="flex-1 ml-2 text-slate-800"
                  />
                  <TouchableOpacity onPress={() => setShowPassword((current) => !current)}>
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </Field>
              </>
            ) : null}

            {step === "setup" ? (
              <>
                <Text className="text-sm text-slate-600 mb-4">
                  Scan with Google Authenticator, Microsoft Authenticator, Authy, or 1Password.
                </Text>
                {otpauthUrl ? <OtpQr value={otpauthUrl} /> : null}
                {secret ? (
                  <View className="mb-5">
                    <Text className="text-xs text-slate-500 mb-2">
                      Can't scan? Enter this key manually.
                    </Text>
                    <Text selectable className="font-mono text-base text-slate-900">
                      {groupSecret(secret)}
                    </Text>
                  </View>
                ) : null}
                <CodeField
                  label="6-digit code"
                  value={code}
                  onChangeText={setCode}
                  numeric
                />
              </>
            ) : null}

            {step === "verify" ? (
              <>
                <CodeField
                  label={useRecovery ? "Recovery code" : "6-digit code"}
                  value={code}
                  onChangeText={setCode}
                  numeric={!useRecovery}
                />
                <TouchableOpacity
                  onPress={() => {
                    setUseRecovery((current) => !current);
                    setCode("");
                    setError("");
                  }}
                  className="mb-4"
                >
                  <Text className="text-sm text-orange-600 text-center">
                    {useRecovery
                      ? "Use your authenticator app instead"
                      : "Use a recovery code instead"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}

            {step === "codes" ? (
              <>
                {recoveryCodes.length === 0 ? (
                  <Text className="text-sm text-slate-600 mb-4">
                    No recovery codes were returned. You can continue to the dashboard.
                  </Text>
                ) : (
                  <View className="flex-row flex-wrap border border-slate-200 bg-slate-50 rounded-md p-3 mb-4">
                    {recoveryCodes.map((item) => (
                      <Text
                        key={item}
                        selectable
                        className="w-1/2 text-center font-mono text-sm text-slate-900 py-1"
                      >
                        {item}
                      </Text>
                    ))}
                  </View>
                )}
                {recoveryCodes.length > 0 ? (
                  <TouchableOpacity
                    onPress={shareRecoveryCodes}
                    className="border border-slate-300 rounded-lg py-3 mb-4 items-center"
                  >
                    <Text className="text-slate-800 font-medium">Share codes</Text>
                  </TouchableOpacity>
                ) : null}
                {recoveryCodes.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setSavedCodes((current) => !current)}
                    className="flex-row items-start mb-5"
                  >
                    <Ionicons
                      name={savedCodes ? "checkbox" : "square-outline"}
                      size={22}
                      color={savedCodes ? "#f97316" : "#64748b"}
                    />
                    <Text className="flex-1 ml-2 text-sm text-slate-700">
                      I've saved these codes. Each works once if I lose my phone.
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            {error ? (
              <View className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={
                step === "setup"
                  ? handleSetup
                  : step === "verify"
                    ? handleVerify
                    : step === "codes"
                      ? () => enterDashboard()
                      : handlePassword
              }
              disabled={loading || (step === "codes" && recoveryCodes.length > 0 && !savedCodes)}
              className={`py-4 rounded-lg items-center ${
                step === "codes" && recoveryCodes.length > 0 && !savedCodes
                  ? "bg-orange-300"
                  : "bg-orange-500"
              }`}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">
                  {step === "codes"
                    ? "Continue to dashboard"
                    : step === "setup"
                      ? "Confirm code"
                      : "Sign in"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }) {
  return (
    <View className="mb-5">
      <Text className="text-sm font-medium text-slate-700 mb-2">{label}</Text>
      <View className="flex-row items-center border border-slate-200 rounded-lg px-3 py-3">
        {children}
      </View>
    </View>
  );
}

function CodeField({ label, value, onChangeText, numeric }) {
  return (
    <Field label={label}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? "number-pad" : "default"}
        maxLength={numeric ? 6 : 64}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={numeric ? "one-time-code" : "off"}
        placeholder={numeric ? "000000" : "Recovery code"}
        placeholderTextColor="#94a3b8"
        className="flex-1 text-slate-800 font-mono tracking-widest"
      />
    </Field>
  );
}
