import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react-native";
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

export default function ResetPasswordScreen() {
  const { updatePassword, isUpdatingPassword, isAuthenticated } = useAuth();
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const submit = useCallback(async () => {
    if (!password.trim() || password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords do not match", "Re-enter the same password in both fields.");
      return;
    }
    if (!isAuthenticated) {
      Alert.alert(
        "Open from email",
        "Tap the reset link in your email to update your password.",
      );
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await updatePassword(password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Password updated", "Your password has been changed.", [
        { text: "OK", onPress: () => router.replace("/(tabs)/home") },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not update password";
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Reset failed", msg);
    }
  }, [password, confirm, isAuthenticated, updatePassword]);

  return (
    <View style={styles.root} testID="reset-password-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient colors={["#020506", "#06120F", "#020708"]} style={StyleSheet.absoluteFill} />
      <View style={[styles.orb, styles.orbA]} />
      <View style={[styles.orb, styles.orbB]} />

      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <Pressable
          onPress={() => navigateBack(router, "/auth")}
          style={styles.backBtn}
          hitSlop={8}
          testID="reset-back"
        >
          <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.iconWrap}>
              <LinearGradient
                colors={[Colors.mint, Colors.cyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconInner}
              >
                <ShieldCheck color={Colors.ink} size={26} strokeWidth={3} />
              </LinearGradient>
            </View>

            <Text style={styles.headline}>Set a new password</Text>
            <Text style={styles.sub}>
              Choose a strong password you do not use anywhere else. You will stay signed in on this
              device.
            </Text>

            <View style={styles.field}>
              <Lock color={Colors.muted} size={18} />
              <TextInput
                testID="new-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
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

            <View style={styles.field}>
              <Lock color={Colors.muted} size={18} />
              <TextInput
                testID="confirm-password-input"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm new password"
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPassword}
                style={styles.input}
              />
            </View>

            <Pressable
              onPress={submit}
              style={styles.cta}
              disabled={isUpdatingPassword}
              testID="reset-submit"
            >
              <LinearGradient
                colors={[Colors.mint, Colors.cyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaInner}
              >
                {isUpdatingPassword ? (
                  <ActivityIndicator color={Colors.ink} />
                ) : (
                  <>
                    <Text style={styles.ctaText}>Update password</Text>
                    <ArrowRight color={Colors.ink} size={20} strokeWidth={3} />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Text style={styles.hint}>
              Did not request this? You can ignore the email \u2014 your password will not change.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  orbA: { top: -110, right: -120, backgroundColor: "rgba(63,169,255,0.12)" },
  orbB: { bottom: -120, left: -120, backgroundColor: "rgba(98,208,255,0.10)" },

  iconWrap: { alignSelf: "center", marginTop: 24, marginBottom: 22 },
  iconInner: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  headline: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 32,
    textAlign: "center",
  },
  sub: {
    color: Colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 24,
    textAlign: "center",
  },

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

  cta: { borderRadius: 16, overflow: "hidden", marginTop: 12 },
  ctaInner: {
    minHeight: 54,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: Colors.ink, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },

  hint: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 22,
    lineHeight: 18,
    opacity: 0.85,
  },
});
