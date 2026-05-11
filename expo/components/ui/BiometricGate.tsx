import * as LocalAuthentication from "expo-local-authentication";
import { Fingerprint, Lock } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { useApp } from "@/providers/app-provider";

interface Props {
  children: React.ReactNode;
}

export default function BiometricGate({ children }: Props) {
  const { prefs } = useApp();
  const enabled = !!prefs.biometric;
  const [unlocked, setUnlocked] = useState<boolean>(!enabled);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const lastUnlockRef = useRef<number>(0);

  const authenticate = useCallback(async (): Promise<void> => {
    if (Platform.OS === "web") {
      setUnlocked(true);
      return;
    }
    if (authenticating) return;
    setAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        setUnlocked(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock to continue",
        fallbackLabel: "Use passcode",
        disableDeviceFallback: false,
      });
      if (result.success) {
        lastUnlockRef.current = Date.now();
        setUnlocked(true);
      }
    } catch (e) {
      console.log("[biometric-gate] auth error", e);
    } finally {
      setAuthenticating(false);
    }
  }, [authenticating]);

  useEffect(() => {
    if (!enabled) {
      setUnlocked(true);
      return;
    }
    setUnlocked(false);
    authenticate().catch(() => {});
  }, [enabled, authenticate]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastUnlockRef.current > 60_000) {
        setUnlocked(false);
        authenticate().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [enabled, authenticate]);

  if (!enabled || unlocked) return <>{children}</>;

  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Lock color={Colors.goldBright} size={36} strokeWidth={2.6} />
      </View>
      <Text style={styles.title}>App locked</Text>
      <Text style={styles.body}>Use Face ID, Touch ID, or fingerprint to unlock.</Text>
      <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={() => authenticate()}>
        <Fingerprint color={Colors.ink} size={18} strokeWidth={2.8} />
        <Text style={styles.btnText}>{authenticating ? "Authenticating…" : "Unlock"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconWrap: { width: 88, height: 88, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(63,169,255,0.12)", borderWidth: 1, borderColor: "rgba(98,208,255,0.25)", marginBottom: 22 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
  body: { color: Colors.muted, fontSize: 14, fontWeight: "700", textAlign: "center", marginTop: 10, lineHeight: 20 },
  btn: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 28, height: 52, paddingHorizontal: 22, borderRadius: 26, backgroundColor: Colors.goldBright },
  btnPressed: { opacity: 0.85 },
  btnText: { color: Colors.ink, fontSize: 15, fontWeight: "900" },
});
