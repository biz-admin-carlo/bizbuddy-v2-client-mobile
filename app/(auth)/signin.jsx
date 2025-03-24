import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Switch,
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
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import useAuthStore from "../../store/useAuthStore";
import { API_BASE_URL, VERSION } from "../../config/constant";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function SignIn() {
  const router = useRouter();
  const { login } = useAuthStore();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // For biometric authentication
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [savedToken, setSavedToken] = useState(null);

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
      const token = await SecureStore.getItemAsync("token");
      setSavedToken(token);
    };

    checkBiometric();
    getToken();

    // Keyboard listeners
    const keyboardDidShowListener = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
      // Only animate description out
      Animated.timing(descriptionOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
    const keyboardDidHideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
      // Animate description in
      Animated.timing(descriptionOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });

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

  const handleBiometricSignIn = async () => {
    if (!savedToken) {
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
      await login(savedToken, true);
      router.replace("(tabs)/profile");
    } else {
      setError("Biometric authentication failed. Please try again.");
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
      const res = await fetch(`${API_BASE_URL}/api/account/get-user-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Email not found.");
        setLoading(false);
        return;
      }

      setUsers(data.data);
      setStep(2);
    } catch (err) {
      console.error("Email submit error:", err);
      setError("Network error, please try again.");
    }
    setLoading(false);
  };

  const handleSignInWithPassword = async () => {
    if (!password || !selectedCompanyId) {
      setError("Please select a company and enter your password.");
      return;
    }

    animateButtonPress();

    setLoading(true);
    setError(null);
    try {
      const signInRes = await fetch(
        `${API_BASE_URL}/api/account/sign-in?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&companyId=${selectedCompanyId}`
      );
      const signInData = await signInRes.json();
      if (!signInRes.ok) {
        setError(signInData.message || "Invalid credentials.");
        setLoading(false);
        return;
      }
      const token = signInData.data.token;
      console.log("Received token:", token);

      await login(token, rememberMe);
      if (rememberMe) {
        setSavedToken(token);
      }
      router.replace("(tabs)/profile");
    } catch (err) {
      console.error("Sign-in error:", err);
      setError("Something went wrong.");
    }
    setLoading(false);
  };

  const goBackToEmail = () => {
    setStep(1);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              <View className="flex-1 justify-center items-center px-5 py-20">
                {/* Logo/Header - Always visible */}
                <View className="items-center mb-6">
                  <View className="flex-row justify-center items-center">
                    <Image source={require("../../assets/images/icon.png")} style={{ width: 50, height: 50 }} resizeMode="contain" className=" mb-4" />
                    <Text className="text-6xl text-orange-400 font-extrabold">BizBuddy</Text>
                  </View>

                  {/* Only the description and version fade out */}
                  <Animated.View style={{ opacity: descriptionOpacity, alignItems: "center" }}>
                    <Text className="text-xs mt-2 text-slate-600">{VERSION}</Text>
                    <Text className="text-slate-600 text-center text-sm mt-1">Your business companion</Text>
                  </Animated.View>
                </View>

                {/* Main Form Container */}
                <Animated.View
                  style={{
                    opacity: formAnim,
                    transform: [{ translateY: formSlideAnim }],
                    width: "100%",
                    maxWidth: 400,
                  }}
                  className="p-2"
                >
                  {/* Step 1: Email Input */}
                  {step === 1 && (
                    <View>
                      <View className="mb-7">
                        <Text className="mb-3 font-medium text-slate-600">Email</Text>
                        <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-4 mb-2">
                          <MaterialCommunityIcons name="email-outline" size={20} color="#f97316" style={{ marginRight: 10 }} />
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
                      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
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
                              <Text className="text-white text-center font-semibold text-base mr-2">Continue</Text>
                              <Ionicons name="arrow-forward" size={18} color="#fff" />
                            </View>
                          )}
                        </TouchableOpacity>
                      </Animated.View>

                      {/* Biometric button - Moved below Continue button */}
                      {biometricAvailable && savedToken && (
                        <Animated.View style={{ transform: [{ scale: buttonScale }], marginTop: 16 }}>
                          <TouchableOpacity
                            onPress={handleBiometricSignIn}
                            className="flex-row items-center justify-center py-4 px-5 rounded-lg border border-slate-200"
                            style={styles.buttonShadow}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="finger-print-outline" size={22} color="#f97316" style={{ marginRight: 8 }} />
                            <Text className="font-medium text-slate-700">Sign in with biometrics</Text>
                          </TouchableOpacity>
                        </Animated.View>
                      )}
                    </View>
                  )}

                  {/* Step 2: Company Selection and Password */}
                  {step === 2 && (
                    <View>
                      <View className="flex-row items-center mb-7">
                        <TouchableOpacity onPress={goBackToEmail} className="mr-4">
                          <View className="w-10 h-10 rounded-full  items-center justify-center">
                            <Ionicons name="arrow-back" size={18} color="#f97316" />
                          </View>
                        </TouchableOpacity>
                        <Text className="text-xl font-bold text-slate-700">Select your company</Text>
                      </View>

                      <View className="mb-7">
                        {users.map((user) => (
                          <TouchableOpacity
                            key={user.companyId}
                            onPress={() => setSelectedCompanyId(user.companyId)}
                            className={`p-4 mb-4 rounded-lg border ${
                              selectedCompanyId === user.companyId ? "border-orange-400" : "border-slate-200"
                            } bg-white`}
                            style={[styles.cardShadow, selectedCompanyId === user.companyId && styles.selectedCardShadow]}
                            activeOpacity={0.7}
                          >
                            <View className="flex-row items-center">
                              <View
                                className={`w-12 h-12 rounded-full ${
                                  selectedCompanyId === user.companyId ? "bg-orange-50" : "bg-slate-100"
                                } items-center justify-center mr-4`}
                              >
                                <FontAwesome5 name="building" size={18} color={selectedCompanyId === user.companyId ? "#f97316" : "#64748b"} />
                              </View>
                              <View className="flex-1">
                                <Text className="font-semibold text-base text-slate-700">{user.companyName}</Text>
                                <View className="flex-row items-center mt-2">
                                  <View className={`px-3 py-1 rounded-full ${selectedCompanyId === user.companyId ? "bg-orange-50" : "bg-slate-100"}`}>
                                    <Text className={`text-xs ${selectedCompanyId === user.companyId ? "text-orange-800" : "text-slate-600"} font-medium`}>
                                      {user.role}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                              {selectedCompanyId === user.companyId && (
                                <View className="w-8 h-8 rounded-full bg-orange-400 items-center justify-center">
                                  <Ionicons name="checkmark" size={16} color="#fff" />
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View className="mb-7">
                        <Text className="mb-3 font-medium text-slate-600">Password</Text>
                        <View className="flex-row items-center border border-slate-200 bg-white rounded-lg px-4 py-4">
                          <MaterialCommunityIcons name="lock-outline" size={20} color="#f97316" style={{ marginRight: 10 }} />
                          <TextInput
                            secureTextEntry={!showPassword}
                            placeholder="Enter password"
                            className="flex-1 text-slate-700"
                            value={password}
                            onChangeText={setPassword}
                            placeholderTextColor="#9ca3af"
                          />
                          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748b" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Remember Me switch */}
                      <View className="flex-row items-center mb-7">
                        <Switch
                          value={rememberMe}
                          onValueChange={setRememberMe}
                          trackColor={{ false: "#d1d5db", true: "#fdba74" }}
                          thumbColor={rememberMe ? "#f97316" : "#ffffff"}
                          ios_backgroundColor="#d1d5db"
                        />
                        <Text className="ml-3 text-slate-600">Remember Me</Text>
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
                      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
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
                              <Ionicons name="log-in-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                              <Text className="text-white text-center font-semibold text-base">Sign In</Text>
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
