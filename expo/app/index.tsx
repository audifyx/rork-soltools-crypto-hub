import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ScanLine } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
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

const BUILD_TAG = "welcome-v6";

export default function WelcomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const [showSplash, setShowSplash] = useState<boolean>(true);

  const splashOpacity = useRef<Animated.Value>(new Animated.Value(1)).current;
  const splashScale = useRef<Animated.Value>(new Animated.Value(0.85)).current;
  const contentOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const contentRise = useRef<Animated.Value>(new Animated.Value(28)).current;
  const ctaScale = useRef<Animated.Value>(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      console.log("[welcome] authed → home");
      router.replace("/(tabs)/home");
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    console.log("welcome mounted", { build: BUILD_TAG });
    Animated.sequence([
      Animated.spring(splashScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.delay(700),
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentRise, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) setShowSplash(false);
    });
  }, [contentOpacity, contentRise, splashOpacity, splashScale]);

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
        <AnimatedGlobe size={460} />
      </View>

      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <Animated.View
          style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentRise }] }]}
          testID="welcome-content"
        >
          <View style={styles.topSpacer} />

          <View style={styles.brandWrap}>
            <View style={styles.logoBadge}>
              <LinearGradient
                colors={[Colors.mint, Colors.cyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoBadgeInner}
              >
                <ScanLine color={Colors.ink} size={28} strokeWidth={3} />
              </LinearGradient>
            </View>
          </View>

          <View style={styles.headlineWrap}>
            <Text style={styles.headline}>See what's moving on Solana.</Text>
            <Text style={styles.sub}>
              Real-time pairs, AI risk scoring, social trading and a launchpad — all in one app.
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

            <Pressable onPress={goSignIn} style={styles.secondaryBtn} testID="cta-signin">
              <Text style={styles.secondaryText}>Sign in</Text>
            </Pressable>

            <Text style={styles.terms}>
              By continuing you agree to our Terms and Privacy Policy.
            </Text>
          </View>
        </Animated.View>

        {showSplash ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.splash, { opacity: splashOpacity }]}
            testID="welcome-splash"
          >
            <Animated.View style={{ transform: [{ scale: splashScale }], alignItems: "center" }}>
              <View style={styles.splashLogo}>
                <LinearGradient
                  colors={[Colors.mint, Colors.cyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.splashLogoInner}
                >
                  <ScanLine color={Colors.ink} size={52} strokeWidth={3} />
                </LinearGradient>
              </View>
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
    top: -80,
    left: 0,
    right: 0,
    alignItems: "center",
    opacity: 0.85,
  },

  topSpacer: { flex: 1 },

  brandWrap: { alignItems: "flex-start", marginBottom: 24 },
  logoBadge: {
    padding: 2,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  logoBadgeInner: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  headlineWrap: { marginBottom: 32 },
  headline: {
    color: Colors.text,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  sub: {
    color: Colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 14,
  },

  ctaStack: { gap: 12, paddingBottom: 12 },

  primaryBtn: {
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: Colors.mint,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  primaryGradient: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  secondaryBtn: {
    minHeight: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
  },

  terms: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 14,
    lineHeight: 16,
  },

  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.ink,
  },
  splashLogo: {
    padding: 4,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  splashLogoInner: {
    width: 120,
    height: 120,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
