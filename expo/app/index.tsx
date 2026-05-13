import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
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
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
} from "react-native-svg";

import BootSequence from "@/components/BootSequence";
import BrandLogo from "@/components/BrandLogo";
import Colors from "@/constants/colors";
import { useAuth } from "@/providers/auth-provider";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const BUILD_TAG = "welcome-x-v2-boot";

const ROTATING_LINES: string[] = [
  "See what's moving on Solana.",
  "Snipe new pairs the moment they go live.",
  "Track every wallet. Outrun every whale.",
  "Trade. Launch. Earn. All in one app.",
];

export default function WelcomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const [showBoot, setShowBoot] = useState<boolean>(true);
  const [lineIndex, setLineIndex] = useState<number>(0);

  const contentOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const contentRise = useRef<Animated.Value>(new Animated.Value(28)).current;
  const ctaScale = useRef<Animated.Value>(new Animated.Value(1)).current;
  const lineOpacity = useRef<Animated.Value>(new Animated.Value(1)).current;
  const lineShift = useRef<Animated.Value>(new Animated.Value(0)).current;
  const stripeShift = useRef<Animated.Value>(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      console.log("[welcome] authed → home");
      router.replace("/(tabs)/home");
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    console.log("welcome mounted", { build: BUILD_TAG });
    Animated.loop(
      Animated.timing(stripeShift, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [stripeShift]);

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

  const onBootDone = useCallback(() => {
    setShowBoot(false);
    Animated.parallel([
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
    ]).start();
  }, [contentOpacity, contentRise]);

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

  const stripeTx = stripeShift.interpolate({ inputRange: [0, 1], outputRange: [0, SCREEN_W] });

  return (
    <View style={styles.root} testID="welcome-root">
      <StatusBar style="light" />
      <LinearGradient
        colors={["#000000", "#020A14", "#000814"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Drifting Solana stripes background */}
      <Animated.View
        pointerEvents="none"
        style={[styles.stripeBg, { transform: [{ translateX: stripeTx }, { rotate: "-22deg" }] }]}
      >
        <Svg width={SCREEN_W * 2.4} height={SCREEN_H}>
          <Defs>
            <SvgGradient id="bgStripe" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#3FA9FF" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#3FA9FF" stopOpacity="0.18" />
              <Stop offset="1" stopColor="#3FA9FF" stopOpacity="0" />
            </SvgGradient>
            <SvgGradient id="bgStripe2" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#62D0FF" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#62D0FF" stopOpacity="0.12" />
              <Stop offset="1" stopColor="#62D0FF" stopOpacity="0" />
            </SvgGradient>
          </Defs>
          <Path d={`M0 ${SCREEN_H * 0.28} H${SCREEN_W * 2.4} V${SCREEN_H * 0.28 + 90} H0 Z`} fill="url(#bgStripe)" />
          <Path d={`M0 ${SCREEN_H * 0.52} H${SCREEN_W * 2.4} V${SCREEN_H * 0.52 + 60} H0 Z`} fill="url(#bgStripe2)" />
          <Path d={`M0 ${SCREEN_H * 0.74} H${SCREEN_W * 2.4} V${SCREEN_H * 0.74 + 110} H0 Z`} fill="url(#bgStripe)" />
        </Svg>
      </Animated.View>

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.96)"]}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <Animated.View
          style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentRise }] }]}
          testID="welcome-content"
        >
          <View style={styles.topRow}>
            <BrandLogo size={56} glow={false} />
            <View style={styles.brandLabelWrap}>
              <Text style={styles.brandLabel}>SOL TOOLS</Text>
              <Text style={styles.brandLabelSub}>SOLANA TRADING SUITE</Text>
            </View>
          </View>

          <View style={styles.heroWrap}>
            <BrandLogo size={Math.min(SCREEN_W * 0.42, 180)} />
          </View>

          <View style={styles.headlineWrap}>
            <Text style={styles.eyebrow}>BUILT ON SOLANA · ON-CHAIN ALPHA</Text>
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
                  colors={["#62D0FF", "#3FA9FF", "#1E88FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryText}>Create account</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>

            <Pressable onPress={goSignIn} style={styles.secondaryBtn} testID="cta-signin">
              <Text style={styles.secondaryText}>I already have an account</Text>
            </Pressable>

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

        {showBoot ? <BootSequence onDone={onBootDone} /> : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 4 },

  stripeBg: {
    position: "absolute",
    top: -SCREEN_H * 0.1,
    left: -SCREEN_W * 1.2,
  },

  topRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 },
  brandLabelWrap: { gap: 2 },
  brandLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 3,
  },
  brandLabelSub: {
    color: "#62D0FF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },

  heroWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: SCREEN_H * 0.04,
    marginBottom: SCREEN_H * 0.02,
  },

  headlineWrap: { marginTop: 8 },
  eyebrow: {
    color: "#62D0FF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.6,
    marginBottom: 12,
  },
  headline: {
    color: Colors.text,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "900",
    letterSpacing: -1.4,
    minHeight: 88,
  },
  sub: {
    color: Colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 14,
  },

  ctaStack: { gap: 12, paddingBottom: 12, marginTop: "auto" },

  primaryBtn: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#3FA9FF",
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  primaryGradient: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#001022",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  secondaryBtn: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  secondaryText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

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
    color: "#62D0FF",
    fontWeight: "800",
  },
});
