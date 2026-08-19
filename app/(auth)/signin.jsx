import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  StyleSheet,
  SafeAreaView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import useAuthStore, {
  getTokenUserId,
  getTokenVersion,
  LAST_SIGN_IN_USER_ID_KEY,
  persistSignInContext,
} from "../../store/useAuthStore";
import {
  findAnyValidSessionToken,
  findVerifiedSessionToken,
  getDistinctVaultUserIds,
  removeStoredSessionToken,
  resolveSessionTokenForCompanyId,
  syncLegacyTokenIntoPerCompanyStore,
} from "../../utils/authTokenStorage";
import { API_BASE_URL, VERSION } from "../../config/constant";
import { getInstallationId } from "../../utils/deviceId";
import {
  AUTH_ERROR_CODES,
  getLoginErrorMessage,
  isDeviceAlreadyRegisteredError,
  isDeviceSwitchCooldownError,
  verifySessionToken,
} from "../../utils/authSession";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";

const BIOMETRIC_ENABLED_KEY = "biometricEnabled";
/** After device biometric: pick company when user has multiple companies. */
const STEP_BIOMETRIC_COMPANY = 3;

async function fetchAccountEmailForToken(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/account/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const email = data?.data?.user?.email ?? data?.user?.email;
    if (typeof email !== "string") return null;
    const normalized = email.trim().toLowerCase();
    return normalized.includes("@") ? normalized : null;
  } catch {
    return null;
  }
}

/** API may return companies as `data`, nested array, or a single user object. */
function normalizeCompaniesFromEmailResponse(json) {
  const raw = json?.data;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.data)) {
    return raw.data;
  }
  if (raw && typeof raw === "object" && Array.isArray(raw.companies)) {
    return raw.companies;
  }
  if (raw && typeof raw === "object" && raw.companyId != null) {
    return [raw];
  }
  return [];
}

export default function SignIn() {
  const router = useRouter();
  const { login, forceLogout } = useAuthStore();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // For biometric authentication
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [savedToken, setSavedToken] = useState(null);
  const [bioCompanyLoading, setBioCompanyLoading] = useState(false);
  /** When user reached password (step 2) from post-biometric company pick (step 3). */
  const [passwordSourceStep, setPasswordSourceStep] = useState(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const descriptionOpacity = useRef(new Animated.Value(1)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const formSlideAnim = useRef(new Animated.Value(30)).current;

  // Button animation
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Error animation
  const errorAnim = useRef(new Animated.Value(0)).current;
  const errorShake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Initial animations
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(formAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(formSlideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const checkBiometric = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (hasHardware && isEnrolled) {
          setBiometricAvailable(true);
        }
      } catch (error) {
        console.error("Error checking biometrics:", error);
      }
    };

    const getToken = async () => {
      await syncLegacyTokenIntoPerCompanyStore();
      const enabledFlag = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      setBiometricEnabled(enabledFlag === "true");
      const hit = await findAnyValidSessionToken();
      setSavedToken(hit?.token ?? null);
    };

    checkBiometric();
    getToken();

    // Keyboard listeners
    const keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      () => {
        setKeyboardVisible(true);
        // Only animate description out
        Animated.timing(descriptionOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        setKeyboardVisible(false);
        // Animate description in
        Animated.timing(descriptionOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    );

    // Clean up listeners
    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, [fadeAnim, descriptionOpacity, formAnim, formSlideAnim]);

  // Error animation
  useEffect(() => {
    if (error) {
      // Shake animation for error
      Animated.sequence([
        Animated.timing(errorAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(errorShake, {
            toValue: 10,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(errorShake, {
            toValue: -10,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(errorShake, {
            toValue: 10,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(errorShake, {
            toValue: 0,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      // Hide error
      Animated.timing(errorAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [error, errorAnim, errorShake]);

  const animateButtonPress = () => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const ensureSavedSessionStillValid = async (sessionToken) => {
    const check = await verifySessionToken(sessionToken, { strict: true });
    if (check.valid) return true;
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[Auth/JWT] biometric saved session invalid", {
        reason: check.reason,
        jwtTokenVersion: getTokenVersion(sessionToken),
        apiCode: check.data?.code,
        apiMessage: check.data?.message,
      });
    }
    await removeStoredSessionToken(sessionToken);
    const remaining = await findAnyValidSessionToken();
    if (!remaining?.token) {
      await forceLogout();
    }
    if (check.reason === AUTH_ERROR_CODES.TOKEN_VERSION_MISMATCH) {
      setError(
        "Your saved sign-in is out of date. Sign in with your password to refresh it."
      );
    } else {
      setError(
        "This account is signed in on another device. Sign in with your password on this device only if your administrator has cleared the other session."
      );
    }
    setSavedToken(remaining?.token ?? null);
    return false;
  };

  const handleBiometricSignIn = async () => {
    const vaultUserIds = await getDistinctVaultUserIds();
    const lastUserId = await SecureStore.getItemAsync(LAST_SIGN_IN_USER_ID_KEY);

    if (vaultUserIds.length > 1 && !lastUserId) {
      setError(
        "Multiple accounts are saved on this device. Sign in with your email first."
      );
      return;
    }

    const session = await findAnyValidSessionToken({ userId: lastUserId });
    if (!session?.token) {
      setError("No saved credentials. Please sign in using email first.");
      return;
    }

    animateButtonPress();

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Sign in to BizBuddy",
      fallbackLabel: "Enter Passcode",
      disableDeviceFallback: false,
    });

    if (result.success) {
      const active = await findVerifiedSessionToken(
        (token) => verifySessionToken(token, { strict: true }),
        { userId: lastUserId || getTokenUserId(session.token) },
      );
      if (!active?.token) {
        await forceLogout();
        setError(
          "Your saved sign-in is out of date. Sign in with your password to refresh it."
        );
        setSavedToken(null);
        return;
      }

      const activeUserId = getTokenUserId(active.token);

      setError(null);
      setBioCompanyLoading(true);
      try {
        const emailForLookup = await fetchAccountEmailForToken(active.token);

        if (!emailForLookup) {
          await persistSignInContext(active.token, null, active.companyId);
          await login(active.token, true, active.companyId);
          router.replace("(tabs)/profile");
          return;
        }

        const res = await fetch(
          `${API_BASE_URL}/api/account/get-user-email?email=${encodeURIComponent(
            emailForLookup
          )}`
        );
        const data = await res.json();
        const companies = normalizeCompaniesFromEmailResponse(data);
        if (!res.ok || companies.length === 0) {
          await persistSignInContext(active.token, emailForLookup, active.companyId);
          await login(active.token, true, active.companyId);
          router.replace("(tabs)/profile");
          return;
        }

        if (companies.length === 1) {
          const onlyCompanyId = String(companies[0].companyId);
          const companyToken = await resolveSessionTokenForCompanyId(
            onlyCompanyId,
            { userId: activeUserId },
          );
          const tokenToUse = companyToken || active.token;
          if (!(await ensureSavedSessionStillValid(tokenToUse))) {
            return;
          }
          await persistSignInContext(tokenToUse, emailForLookup, onlyCompanyId);
          await login(tokenToUse, true, onlyCompanyId);
          router.replace("(tabs)/profile");
          return;
        }

        setUsers(companies);
        setEmail(emailForLookup);
        setSelectedCompanyId(null);
        setStep(STEP_BIOMETRIC_COMPANY);
        setSavedToken(active.token);
      } catch (e) {
        console.error("Biometric company lookup error:", e);
        const fallback = await findVerifiedSessionToken(
          (token) => verifySessionToken(token, { strict: true }),
          { userId: activeUserId },
        );
        if (fallback?.token) {
          await login(fallback.token, true, fallback.companyId);
          router.replace("(tabs)/profile");
        } else {
          setError(
            "Could not restore your session. Sign in with your password."
          );
        }
      } finally {
        setBioCompanyLoading(false);
      }
    } else {
      setError("Biometric authentication failed. Please try again.");
    }
  };

  const handleBiometricCompanyContinue = async () => {
    if (!selectedCompanyId) {
      setError("Please select a company.");
      return;
    }

    animateButtonPress();
    setError(null);
    setLoading(true);
    try {
      const picked = String(selectedCompanyId);
      const preferredUserId =
        getTokenUserId(savedToken) ||
        (await SecureStore.getItemAsync(LAST_SIGN_IN_USER_ID_KEY));
      const sessionToken = await resolveSessionTokenForCompanyId(picked, {
        userId: preferredUserId,
      });

      if (sessionToken) {
        if (!(await ensureSavedSessionStillValid(sessionToken))) {
          return;
        }
        await login(sessionToken, true, picked);
        setPasswordSourceStep(null);
        router.replace("(tabs)/profile");
        return;
      }

      setPassword("");
      setPasswordSourceStep(STEP_BIOMETRIC_COMPANY);
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  /** When a saved session exists for this company, sign in immediately (no Continue tap). */
  const handleBiometricCompanyRowPress = async (companyId) => {
    setSelectedCompanyId(companyId);
    setError(null);
    const picked = String(companyId);
    const preferredUserId =
      getTokenUserId(savedToken) ||
      (await SecureStore.getItemAsync(LAST_SIGN_IN_USER_ID_KEY));
    const sessionToken = await resolveSessionTokenForCompanyId(picked, {
      userId: preferredUserId,
    });
    if (!sessionToken) {
      return;
    }
    setLoading(true);
    try {
      if (!(await ensureSavedSessionStillValid(sessionToken))) {
        return;
      }
      await login(sessionToken, true, picked);
      setPasswordSourceStep(null);
      router.replace("(tabs)/profile");
    } catch (e) {
      console.error("Biometric company instant login:", e);
      setError("Could not complete sign-in. Tap Continue to use your password.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async () => {
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    animateButtonPress();

    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/account/get-user-email?email=${encodeURIComponent(
          email.trim().toLowerCase()
        )}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Email not found.");
        setLoading(false);
        return;
      }

      const list = normalizeCompaniesFromEmailResponse(data);
      if (list.length === 0) {
        setError("No companies found for this email.");
        setLoading(false);
        return;
      }
      setUsers(list);
      if (list.length === 1) {
        setSelectedCompanyId(list[0].companyId);
      } else {
        setSelectedCompanyId(null);
      }
      setStep(2);
    } catch (err) {
      console.error("Email submit error:", err);
      setError("Network error, please try again.");
    }
    setLoading(false);
  };

  const completePasswordSignIn = async (token) => {
    if (!token) {
      setError("Sign-in succeeded but no session token was returned. Please try again.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    await persistSignInContext(token, normalizedEmail, selectedCompanyId);

    await login(token, true, String(selectedCompanyId));
    setPasswordSourceStep(null);
    setSavedToken(token);
    router.replace("(tabs)/profile");
  };

  const logSignInFailure = (label, { signInRes, signInData, replaceDevice = false, deviceId }) => {
    console.error(`[SignIn] ${label}`, {
      replaceDevice,
      status: signInRes?.status,
      ok: signInRes?.ok,
      code: signInData?.code,
      message: signInData?.message,
      switchAllowedAt: signInData?.switchAllowedAt ?? null,
      deviceId,
      serverRegisteredDeviceId: signInData?.registeredDeviceId ?? null,
      requestDeviceId: signInData?.requestDeviceId ?? deviceId,
      companyId: selectedCompanyId,
      email: email.trim().toLowerCase(),
      response: signInData,
    });
  };

  const attemptPasswordSignIn = async ({ replaceDevice = false } = {}) => {
    const deviceId = await getInstallationId();
    const loginUrl = replaceDevice
      ? `${API_BASE_URL}/api/account/login?replaceDevice=true`
      : `${API_BASE_URL}/api/account/login`;
    const signInRes = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        companyId: selectedCompanyId,
        deviceId,
        ...(replaceDevice ? { replaceDevice: true } : {}),
      }),
    });
    let signInData = null;
    try {
      signInData = await signInRes.json();
    } catch (parseErr) {
      console.error("[SignIn] Failed to parse login response JSON", {
        replaceDevice,
        status: signInRes.status,
        url: loginUrl,
        deviceId,
        error: parseErr,
      });
      signInData = null;
    }
    if (!signInRes.ok) {
      logSignInFailure(replaceDevice ? "Replace device login failed" : "Password login failed", {
        signInRes,
        signInData,
        replaceDevice,
        deviceId,
      });
    }
    return { signInRes, signInData, deviceId };
  };

  const promptReplaceRegisteredDevice = () => {
    Alert.alert(
      "Signed in on another device",
      "This account is registered on a different phone or tablet. Use this device instead? The other device will be signed out and will need to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Use this device",
          onPress: async () => {
            setLoading(true);
            setError(null);
            try {
              const { signInRes, signInData } = await attemptPasswordSignIn({
                replaceDevice: true,
              });
              if (!signInRes.ok) {
                setError(getLoginErrorMessage(signInData));
                return;
              }
              const token = signInData?.data?.token ?? signInData?.token;
              await completePasswordSignIn(token);
            } catch (err) {
              console.error("Replace device sign-in error:", err);
              setError("Something went wrong.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSignInWithPassword = async () => {
    if (!selectedCompanyId) {
      setError("Please select a company.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    animateButtonPress();

    setLoading(true);
    setError(null);
    try {
      const { signInRes, signInData } = await attemptPasswordSignIn();
      if (!signInRes.ok) {
        if (isDeviceAlreadyRegisteredError(signInData)) {
          setLoading(false);
          promptReplaceRegisteredDevice();
          return;
        }
        if (isDeviceSwitchCooldownError(signInData)) {
          setError(getLoginErrorMessage(signInData));
          setLoading(false);
          return;
        }
        setError(getLoginErrorMessage(signInData));
        setLoading(false);
        return;
      }
      await completePasswordSignIn(signInData?.data?.token ?? signInData?.token);
    } catch (err) {
      console.error("Sign-in error:", err);
      setError("Something went wrong.");
    }
    setLoading(false);
  };

  const goBackToEmail = () => {
    setPasswordSourceStep(null);
    setStep(1);
    setSelectedCompanyId(null);
    setUsers([]);
    setPassword("");
  };

  const goBackFromBiometricCompany = () => {
    setPasswordSourceStep(null);
    setStep(1);
    setSelectedCompanyId(null);
    setUsers([]);
  };

  const goBackFromPasswordStep = () => {
    if (passwordSourceStep === STEP_BIOMETRIC_COMPANY) {
      setPasswordSourceStep(null);
      setPassword("");
      setError(null);
      setStep(STEP_BIOMETRIC_COMPANY);
      return;
    }
    goBackToEmail();
  };

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.screenContent} className="justify-center px-5 py-20">
                {/* Logo/Header - Always visible */}
                <View style={styles.header} className="items-center mb-6">
                  <View style={styles.brandRow} className="flex-row justify-center items-center">
                    <Image
                      source={require("../../assets/images/icon.png")}
                      style={styles.brandIcon}
                      resizeMode="contain"
                    />
                    <Text
                      className="text-4xl text-orange-400 font-extrabold"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={styles.brandTitle}
                    >
                      BizBuddy
                    </Text>
                  </View>

                  {/* Only the description and version fade out */}
                  <Animated.View
                    style={{
                      opacity: descriptionOpacity,
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <Text className="text-xs mt-2 text-slate-600">
                      {VERSION}
                    </Text>
                    <Text className="text-slate-600 text-center text-sm mt-1">
                      Your business companion
                    </Text>
                  </Animated.View>
                </View>

                {/* Main Form Container */}
                <Animated.View
                  style={[
                    styles.formContainer,
                    {
                      opacity: formAnim,
                      transform: [{ translateY: formSlideAnim }],
                    },
                  ]}
                  className="p-2"
                >
                  {/* Step 1: Email Input */}
                  {step === 1 && (
                    <View>
                      <View className="mb-7">
                        <Text className="mb-3 font-medium text-slate-600">
                          Email
                        </Text>
                        <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-4 mb-2">
                          <MaterialCommunityIcons
                            name="email-outline"
                            size={20}
                            color="#f97316"
                            style={{ marginRight: 10 }}
                          />
                          <TextInput
                            placeholder="Enter your email"
                            className="flex-1 text-slate-700"
                            onChangeText={setEmail}
                            value={email}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                      </View>

                      {/* Error Message for Step 1 */}
                      <Animated.View
                        style={{
                          opacity: errorAnim,
                          transform: [{ translateX: errorShake }],
                          marginBottom: error ? 20 : 0,
                        }}
                      >
                        {error && (
                          <View className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <Text className="text-red-600">{error}</Text>
                          </View>
                        )}
                      </Animated.View>

                      {/* Continue Button */}
                      <Animated.View
                        style={{ transform: [{ scale: buttonScale }] }}
                      >
                        <TouchableOpacity
                          onPress={handleEmailSubmit}
                          disabled={loading}
                          className="bg-orange-400 py-4 rounded-lg mt-2"
                          style={styles.buttonShadow}
                          activeOpacity={0.8}
                        >
                          {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <View className="flex-row items-center justify-center">
                              <Text className="text-white text-center font-semibold text-base mr-2">
                                Continue
                              </Text>
                              <Ionicons
                                name="arrow-forward"
                                size={18}
                                color="#fff"
                              />
                            </View>
                          )}
                        </TouchableOpacity>
                      </Animated.View>

                      {/* Biometric button */}
                      {biometricAvailable && biometricEnabled && (
                        <Animated.View
                          style={{
                            transform: [{ scale: buttonScale }],
                            marginTop: 16,
                          }}
                        >
                          <TouchableOpacity
                            onPress={handleBiometricSignIn}
                            disabled={!savedToken || bioCompanyLoading}
                            className="flex-row items-center justify-center py-4 px-5 rounded-lg border border-slate-200"
                            style={[
                              styles.buttonShadow,
                              (!savedToken || bioCompanyLoading) && { opacity: 0.6 },
                            ]}
                            activeOpacity={0.8}
                          >
                            {bioCompanyLoading ? (
                              <ActivityIndicator color="#f97316" size="small" />
                            ) : (
                              <>
                                <Ionicons
                                  name="finger-print-outline"
                                  size={22}
                                  color="#f97316"
                                  style={{ marginRight: 8 }}
                                />
                                <Text className="font-medium text-slate-700">
                                  Sign in with biometrics
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                          {!savedToken && (
                            <Text className="text-xs text-slate-500 mt-2 text-center">
                              Sign in with your password once to save credentials for biometric sign-in.
                            </Text>
                          )}
                        </Animated.View>
                      )}
                    </View>
                  )}

                  {/* Step 3: After device biometric — pick company (multi-company only) */}
                  {step === STEP_BIOMETRIC_COMPANY && (
                    <View>
                      <View className="flex-row items-center mb-4">
                        <TouchableOpacity
                          onPress={goBackFromBiometricCompany}
                          className="mr-4"
                        >
                          <View className="w-10 h-10 rounded-full items-center justify-center">
                            <Ionicons
                              name="arrow-back"
                              size={18}
                              color="#f97316"
                            />
                          </View>
                        </TouchableOpacity>
                        <Text className="text-xl font-bold text-slate-700 flex-1">
                          Select your company
                        </Text>
                      </View>
                      <Text className="text-sm text-slate-600 mb-6">
                        Tap a company to sign in if you have saved that session, or select
                        one and tap Continue (password required if there is no saved session).
                      </Text>

                      <View className="mb-7">
                        {users.map((user) => {
                          const isSelected =
                            String(selectedCompanyId) === String(user.companyId);
                          return (
                          <TouchableOpacity
                            key={user.companyId}
                            disabled={loading}
                            onPress={() => handleBiometricCompanyRowPress(user.companyId)}
                            className={`p-4 mb-4 rounded-lg border ${
                              isSelected
                                ? "border-orange-400"
                                : "border-slate-200"
                            } bg-white`}
                            style={[
                              styles.cardShadow,
                              isSelected && styles.selectedCardShadow,
                            ]}
                            activeOpacity={0.7}
                          >
                            <View className="flex-row items-center">
                              <View
                                className={`w-12 h-12 rounded-full ${
                                  isSelected
                                    ? "bg-orange-50"
                                    : "bg-slate-100"
                                } items-center justify-center mr-4`}
                              >
                                <FontAwesome5
                                  name="building"
                                  size={18}
                                  color={
                                    isSelected
                                      ? "#f97316"
                                      : "#64748b"
                                  }
                                />
                              </View>
                              <View className="flex-1">
                                <Text className="font-semibold text-base text-slate-700">
                                  {user.companyName}
                                </Text>
                                <View className="flex-row items-center mt-2">
                                  <View
                                    className={`px-3 py-1 rounded-full ${
                                      isSelected
                                        ? "bg-orange-50"
                                        : "bg-slate-100"
                                    }`}
                                  >
                                    <Text
                                      className={`text-xs ${
                                        isSelected
                                          ? "text-orange-800"
                                          : "text-slate-600"
                                      } font-medium`}
                                    >
                                      {user.role}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                              {isSelected && (
                                <View className="w-8 h-8 rounded-full bg-orange-400 items-center justify-center">
                                  <Ionicons
                                    name="checkmark"
                                    size={16}
                                    color="#fff"
                                  />
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                          );
                        })}
                      </View>

                      <Animated.View
                        style={{
                          opacity: errorAnim,
                          transform: [{ translateX: errorShake }],
                          marginBottom: error ? 20 : 0,
                        }}
                      >
                        {error && (
                          <View className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <Text className="text-red-600">{error}</Text>
                          </View>
                        )}
                      </Animated.View>

                      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                        <TouchableOpacity
                          onPress={handleBiometricCompanyContinue}
                          disabled={loading || !selectedCompanyId}
                          className="bg-orange-400 py-4 rounded-lg mt-2"
                          style={styles.buttonShadow}
                          activeOpacity={0.8}
                        >
                          {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <View className="flex-row items-center justify-center">
                              <Text className="text-white text-center font-semibold text-base">
                                Continue
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </Animated.View>
                    </View>
                  )}

                  {/* Step 2: Company Selection (multi-company) and Password */}
                  {step === 2 && (
                    <View>
                      <View className="flex-row items-center mb-7">
                        <TouchableOpacity
                          onPress={goBackFromPasswordStep}
                          className="mr-4"
                        >
                          <View className="w-10 h-10 rounded-full  items-center justify-center">
                            <Ionicons
                              name="arrow-back"
                              size={18}
                              color="#f97316"
                            />
                          </View>
                        </TouchableOpacity>
                        <Text className="text-xl font-bold text-slate-700">
                          {users.length === 1 ? "Sign in" : "Select your company"}
                        </Text>
                      </View>

                      {passwordSourceStep === STEP_BIOMETRIC_COMPANY && (
                        <Text className="text-sm text-slate-600 mb-4 -mt-4">
                          Enter your password for the company you selected. Your saved
                          session is for a different company.
                        </Text>
                      )}

                      {users.length > 1 && (
                      <View className="mb-7">
                        {users.map((user) => (
                          <TouchableOpacity
                            key={user.companyId}
                            onPress={() => setSelectedCompanyId(user.companyId)}
                            className={`p-4 mb-4 rounded-lg border ${
                              selectedCompanyId === user.companyId
                                ? "border-orange-400"
                                : "border-slate-200"
                            } bg-white`}
                            style={[
                              styles.cardShadow,
                              selectedCompanyId === user.companyId &&
                                styles.selectedCardShadow,
                            ]}
                            activeOpacity={0.7}
                          >
                            <View className="flex-row items-center">
                              <View
                                className={`w-12 h-12 rounded-full ${
                                  selectedCompanyId === user.companyId
                                    ? "bg-orange-50"
                                    : "bg-slate-100"
                                } items-center justify-center mr-4`}
                              >
                                <FontAwesome5
                                  name="building"
                                  size={18}
                                  color={
                                    selectedCompanyId === user.companyId
                                      ? "#f97316"
                                      : "#64748b"
                                  }
                                />
                              </View>
                              <View className="flex-1">
                                <Text className="font-semibold text-base text-slate-700">
                                  {user.companyName}
                                </Text>
                                <View className="flex-row items-center mt-2">
                                  <View
                                    className={`px-3 py-1 rounded-full ${
                                      selectedCompanyId === user.companyId
                                        ? "bg-orange-50"
                                        : "bg-slate-100"
                                    }`}
                                  >
                                    <Text
                                      className={`text-xs ${
                                        selectedCompanyId === user.companyId
                                          ? "text-orange-800"
                                          : "text-slate-600"
                                      } font-medium`}
                                    >
                                      {user.role}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                              {selectedCompanyId === user.companyId && (
                                <View className="w-8 h-8 rounded-full bg-orange-400 items-center justify-center">
                                  <Ionicons
                                    name="checkmark"
                                    size={16}
                                    color="#fff"
                                  />
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                      )}

                      <View className="mb-7">
                        <Text className="mb-3 font-medium text-slate-600">
                          Password
                        </Text>
                        <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-4">
                          <MaterialCommunityIcons
                            name="lock-outline"
                            size={20}
                            color="#f97316"
                            style={{ marginRight: 10 }}
                          />
                          <TextInput
                            secureTextEntry={!showPassword}
                            placeholder="Enter password"
                            className="flex-1 text-slate-700"
                            value={password}
                            onChangeText={setPassword}
                            placeholderTextColor="#9ca3af"
                          />
                          <TouchableOpacity
                            onPress={() => setShowPassword(!showPassword)}
                          >
                            <Ionicons
                              name={
                                showPassword ? "eye-off-outline" : "eye-outline"
                              }
                              size={20}
                              color="#64748b"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Error Message for Step 2 */}
                      <Animated.View
                        style={{
                          opacity: errorAnim,
                          transform: [{ translateX: errorShake }],
                          marginBottom: error ? 20 : 0,
                        }}
                      >
                        {error && (
                          <View className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <Text className="text-red-600">{error}</Text>
                          </View>
                        )}
                      </Animated.View>

                      {/* Sign In Button */}
                      <Animated.View
                        style={{ transform: [{ scale: buttonScale }] }}
                      >
                        <TouchableOpacity
                          onPress={handleSignInWithPassword}
                          disabled={loading}
                          className="bg-orange-400 py-4 rounded-lg mt-2"
                          style={styles.buttonShadow}
                          activeOpacity={0.8}
                        >
                          {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <View className="flex-row items-center justify-center">
                              <Ionicons
                                name="log-in-outline"
                                size={20}
                                color="#fff"
                                style={{ marginRight: 8 }}
                              />
                              <Text className="text-white text-center font-semibold text-base">
                                Sign In
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </Animated.View>
                    </View>
                  )}
                </Animated.View>
              </View>
            </ScrollView>
          </Animated.View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    width: "100%",
  },
  screenContent: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    alignItems: "stretch",
  },
  header: {
    width: "100%",
    maxWidth: "100%",
  },
  brandRow: {
    width: "100%",
    maxWidth: "100%",
    flexShrink: 1,
  },
  brandIcon: {
    width: 44,
    height: 44,
    marginRight: 8,
    flexShrink: 0,
  },
  brandTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
  formContainer: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  buttonShadow: {
    shadowColor: "#f97316",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2.22,
    elevation: 3,
  },
  selectedCardShadow: {
    shadowColor: "#f97316",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3.84,
    elevation: 5,
  },
});
