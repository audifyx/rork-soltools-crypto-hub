import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ScanLine } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AnimatedGlobe from "@/components/AnimatedGlobe";
import Colors from "@/constants/colors";
import { useAuth } from "@/providers/auth-provider";

const BUILD_TAG = "welcome-x-v1";
const { width: SCREEN_W } = Dimensions.get("window");

const ROTATING_LINES: string[] = [
  "See what's moving on Solana.",
  "Snipe new pairs the moment they go live.",
  "Track every wallet. Outrun every whale.",
  "Trade. Launch. Earn. All in one app.",
];

export default function WelcomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [lineIndex, setLineIndex] = useState<number>(0);

  const splashOpacity = useRef<Animated.Value>(new Animated.Value(1)).current;
  const splashScale = useRef<Animated.Value>(new Animated.Value(0.85)).current;
  const splashRingSpin = useRef<Animated.Value>(new Animated.Value(0)).current;
  const contentOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const contentRise = useRef<Animated.Value>(new Animated.Value(28)).current;
  const ctaScale = useRef<Animated.Value>(new Animated.Value(1)).current;
  const lineOpacity = useRef<Animated.Value>(new Animated.Value(1)).current;
  const lineShift = useRef<Animated.Value>(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      console.log("[welcome] authed → home");
      router.replace("/(tabs)/home");
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    console.log("welcome mounted", { build: BUILD_TAG });
    Animated.loop(
      Animated.timing(splashRingSpin, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.sequence([
      Animated.spring(splashScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.delay(900),
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentRise, {
          toValue: 0,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) setShowSplash(false);
    });
  }, [contentOpacity, contentRise, splashOpacity, splashScale, splashRingSpin]);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(lineOpacity, {
          toValue: 0,
          duration: 320,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(lineShift, {
          toValue: -16,
          duration: 320,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setLineIndex((i) => (i + 1) % ROTATING_LINES.length);
        lineShift.setValue(16);
        Animated.parallel([
          Animated.timing(lineOpacity, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(lineShift, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, 3400);
    return () => clearInterval(interval);
  }, [lineOpacity, lineShift]);

  const goSignUp = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push("/auth?mode=signup");
  }, []);

  const goSignIn = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push("/auth?mode=signin");
  }, []);

  const onPressIn = useCallback(() => {
    Animated.spring(ctaScale, { toValue: 0.96, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [ctaScale]);
  const onPressOut = useCallback(() => {
    Animated.spring(ctaScale, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }).start();
  }, [ctaScale]);

  const splashRingRotate = splashRingSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.root} testID="welcome-root">
      <StatusBar style="light" />
      <LinearGradient
        colors={["#020506", "#06120F", "#020708"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.globeWrap} pointerEvents="none">
        <AnimatedGlobe size={SCREEN_W * 1.25} />
      </View>

      <LinearGradient
        colors={["transparent", "rgba(2,5,6,0.6)", "rgba(2,5,6,0.95)"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <Animated.View
          style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentRise }] }]}
          testID="welcome-content"
        >
          <View style={styles.topRow}>
            <View style={styles.logoBadge}>
              <LinearGradient
                colors={[Colors.mint, Colors.cyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoBadgeInner}
              >
                <ScanLine color={Colors.ink} size={22} strokeWidth={3} />
              </LinearGradient>
            </View>
          </View>

          <View style={styles.spacer} />

          <View style={styles.headlineWrap}>
            <Text style={styles.eyebrow}>SOL TOOLS</Text>
            <Animated.Text
              style={[
                styles.headline,
                { opacity: lineOpacity, transform: [{ translateY: lineShift }] },
              ]}
              testID="rotating-headline"
            >
              {ROTATING_LINES[lineIndex]}
            </Animated.Text>
            <Text style={styles.sub}>
              Real-time pairs, AI risk scoring, social trading and a launchpad — built for Solana.
            </Text>
          </View>

          <View style={styles.ctaStack}>
            <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
              <Pressable
                onPress={goSignUp}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                style={styles.primaryBtn}
                testID="cta-create"
              >
                <LinearGradient
                  colors={[Colors.mint, Colors.cyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryText}>Create account</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>

            <View style={styles.signinRow}>
              <Text style={styles.signinPrompt}>Have an account? </Text>
              <Pressable onPress={goSignIn} hitSlop={10} testID="cta-signin">
                <Text style={styles.signinLink}>Sign in</Text>
              </Pressable>
            </View>

            <Text style={styles.terms}>
              By continuing you agree to our{" "}
              <Text
                style={styles.termsLink}
                onPress={() => router.push("/legal/terms")}
                testID="welcome-terms-link"
              >
                Terms
              </Text>
              {" "}and{" "}
              <Text
                style={styles.termsLink}
                onPress={() => router.push("/legal/privacy")}
                testID="welcome-privacy-link"
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        </Animated.View>

        {showSplash ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.splash, { opacity: splashOpacity }]}
            testID="welcome-splash"
          >
            <Animated.View
              style={[styles.splashRing, { transform: [{ rotate: splashRingRotate }] }]}
            />
            <Animated.View style={{ transform: [{ scale: splashScale }], alignItems: "center" }}>
              <View style={styles.splashLogo}>
                <LinearGradient
                  colors={[Colors.mint, Colors.cyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.splashLogoInner}
                >
                  <ScanLine color={Colors.ink} size={56} strokeWidth={3} />
                </LinearGradient>
              </View>
              <Text style={styles.splashName}>SOL TOOLS</Text>
              <Text style={styles.splashTag}>PRO TRADING SUITE</Text>
            </Animated.View>
          </Animated.View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 28 },

  globeWrap: {
    position: "absolute",
    top: -SCREEN_W * 0.3,
    left: -SCREEN_W * 0.12,
    right: 0,
    alignItems: "center",
    opacity: 0.9,
  },

  topRow: { paddingTop: 8, alignItems: "flex-start" },
  logoBadge: {
    padding: 2,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  logoBadgeInner: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  spacer: { flex: 1 },

  headlineWrap: { marginBottom: 28 },
  eyebrow: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3.2,
    marginBottom: 14,
  },
  headline: {
    color: Colors.text,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: "900",
    letterSpacing: -1.6,
    minHeight: 96,
  },
  sub: {
    color: Colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 16,
  },

  ctaStack: { gap: 14, paddingBottom: 12 },

  primaryBtn: {
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: Colors.mint,
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  primaryGradient: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: Colors.ink,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  signinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  signinPrompt: { color: Colors.muted, fontSize: 14, fontWeight: "600" },
  signinLink: { color: Colors.mint, fontSize: 14, fontWeight: "900" },

  terms: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
    opacity: 0.8,
  },
  termsLink: {
    color: Colors.mint,
    fontWeight: "800",
  },

  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.ink,
  },
  splashRing: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1.5,
    borderColor: "rgba(85,245,178,0.35)",
    borderTopColor: "rgba(85,245,178,0.95)",
    borderRightColor: "rgba(56,215,255,0.7)",
  },
  splashLogo: {
    padding: 4,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  splashLogoInner: {
    width: 124,
    height: 124,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  splashName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 4,
    marginTop: 22,
  },
  splashTag: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.6,
    marginTop: 6,
  },
});
