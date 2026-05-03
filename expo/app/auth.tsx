import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const { signIn, signUp, isSigningIn, isSigningUp, resetPassword } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: Mode = params?.mode === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const isBusy = isSigningIn || isSigningUp;

  const submit = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing info", "Please enter your email and password.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (mode === "signin") {
        await signIn({ email, password });
      } else {
        if (!username.trim()) {
          Alert.alert("Missing username", "Pick a username for your trader profile.");
          return;
        }
        await signUp({ email, password, username });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/(tabs)/home");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      console.log("[auth] submit error", msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(mode === "signin" ? "Sign in failed" : "Sign up failed", msg);
    }
  }, [email, password, username, mode, signIn, signUp]);

  const onForgot = useCallback(async () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Type your email above to reset password.");
      return;
    }
    try {
      await resetPassword(email);
      Alert.alert("Check your inbox", "If that email exists, a reset link is on its way.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send reset email";
      Alert.alert("Reset failed", msg);
    }
  }, [email, resetPassword]);

  return (
    <View style={styles.root} testID="auth-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient colors={["#020506", "#06120F", "#020708"]} style={StyleSheet.absoluteFill} />
      <View style={[styles.orb, styles.orbA]} />
      <View style={[styles.orb, styles.orbB]} />

      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <Pressable onPress={() => navigateBack(router, "/(tabs)/home")} style={styles.backBtn} hitSlop={8} testID="auth-back">
          <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
        </Pressable>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.brandWrap}>
              <View style={styles.brandIcon}>
                <LinearGradient
                  colors={[Colors.mint, Colors.cyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.brandIconInner}
                >
                  <ScanLine color={Colors.ink} size={26} strokeWidth={3} />
                </LinearGradient>
              </View>
              <Text style={styles.brandName}>SOL TOOLS</Text>
              <Text style={styles.brandSub}>PRO TRADING SUITE · V5</Text>
            </View>

            <View style={styles.modeSwitch}>
              <Pressable
                onPress={() => setMode("signin")}
                style={[styles.modeBtn, mode === "signin" && styles.modeBtnActive]}
                testID="mode-signin"
              >
                <Text style={[styles.modeText, mode === "signin" && styles.modeTextActive]}>
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("signup")}
                style={[styles.modeBtn, mode === "signup" && styles.modeBtnActive]}
                testID="mode-signup"
              >
                <Text style={[styles.modeText, mode === "signup" && styles.modeTextActive]}>
                  Create Account
                </Text>
              </Pressable>
            </View>

            <Text style={styles.headline}>
              {mode === "signin" ? "Welcome back, trader" : "Join the SolTools edge"}
            </Text>
            <Text style={styles.sub}>
              {mode === "signin"
                ? "Sign in to sync your watchlist, alerts and listings across devices."
                : "Create your trader profile to publish launches and track Solana alpha."}
            </Text>

            {mode === "signup" ? (
              <View style={styles.field}>
                <UserRound color={Colors.muted} size={18} />
                <TextInput
                  testID="username-input"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Username"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <Mail color={Colors.muted} size={18} />
              <TextInput
                testID="email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Lock color={Colors.muted} size={18} />
              <TextInput
                testID="password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPassword}
                style={styles.input}
              />
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={10}>
                {showPassword ? (
                  <EyeOff color={Colors.muted} size={18} />
                ) : (
                  <Eye color={Colors.muted} size={18} />
                )}
              </Pressable>
            </View>

            {mode === "signin" ? (
              <Pressable onPress={onForgot} hitSlop={8} style={styles.forgot} testID="forgot">
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={submit}
              style={styles.cta}
              disabled={isBusy}
              testID="submit-button"
            >
              <LinearGradient
                colors={[Colors.mint, Colors.cyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaInner}
              >
                {isBusy ? (
                  <ActivityIndicator color={Colors.ink} />
                ) : (
                  <>
                    <Text style={styles.ctaText}>
                      {mode === "signin" ? "Sign In" : "Create Account"}
                    </Text>
                    <ArrowRight color={Colors.ink} size={20} strokeWidth={3} />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.perks}>
              <Perk Icon={ShieldCheck} text="End-to-end encrypted Supabase auth" />
              <Perk Icon={Sparkles} text="Sync watchlists, alerts and listings" />
              <Perk Icon={AtSign} text="Public trader profile + launchpad" />
            </View>

            <Pressable
              onPress={() => router.replace("/(tabs)/home")}
              hitSlop={8}
              style={styles.skip}
              testID="continue-guest"
            >
              <Text style={styles.skipText}>Continue as guest →</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Perk({
  Icon,
  text,
}: {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  text: string;
}) {
  return (
    <View style={styles.perk}>
      <Icon color={Colors.mint} size={16} strokeWidth={2.4} />
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  flex: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 24, paddingTop: 6, paddingBottom: 60 },
  backBtn: {
    marginLeft: 16,
    marginTop: 4,
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  orb: { position: "absolute", width: 320, height: 320, borderRadius: 160 },
  orbA: { top: -110, right: -120, backgroundColor: "rgba(85,245,178,0.12)" },
  orbB: { bottom: -120, left: -120, backgroundColor: "rgba(56,215,255,0.10)" },

  brandWrap: { alignItems: "center", marginTop: 8, marginBottom: 28 },
  brandIcon: { padding: 2, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)" },
  brandIconInner: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 3,
    marginTop: 14,
  },
  brandSub: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 4,
  },

  modeSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 24,
  },
  modeBtn: { flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 11 },
  modeBtnActive: { backgroundColor: "rgba(85,245,178,0.16)" },
  modeText: { color: Colors.muted, fontWeight: "800", fontSize: 13, letterSpacing: 0.4 },
  modeTextActive: { color: Colors.mint },

  headline: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  sub: { color: Colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 22 },

  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  input: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: "600" },

  forgot: { alignSelf: "flex-end", marginTop: 4, marginBottom: 14 },
  forgotText: { color: Colors.mint, fontSize: 12, fontWeight: "800" },

  cta: { borderRadius: 16, overflow: "hidden", marginTop: 8 },
  ctaInner: {
    minHeight: 54,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: Colors.ink, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },

  perks: { marginTop: 28, gap: 10 },
  perk: { flexDirection: "row", alignItems: "center", gap: 10 },
  perkText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

  skip: { alignSelf: "center", marginTop: 26, padding: 10 },
  skipText: { color: Colors.muted, fontSize: 13, fontWeight: "800" },
});
