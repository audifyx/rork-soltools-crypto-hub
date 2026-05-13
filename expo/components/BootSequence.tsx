import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";

import BrandLogo from "@/components/BrandLogo";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Props = {
  onDone?: () => void;
  /** Brand line shown under the logo */
  caption?: string;
};

/**
 * iOS-style boot sequence with a Solana twist.
 * Sequence (≈2.6s):
 *  1. Black canvas, a constellation of dots scatters in.
 *  2. Dots converge toward the center and snap into the SolTools prism.
 *  3. Logo pulses, three diagonal stripes "energize", linear progress fills.
 *  4. Fade out, fires `onDone`.
 */
export default function BootSequence({ onDone, caption = "SOL TOOLS" }: Props) {
  const fadeOut = useRef<Animated.Value>(new Animated.Value(1)).current;
  const logoScale = useRef<Animated.Value>(new Animated.Value(0.4)).current;
  const logoOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const converge = useRef<Animated.Value>(new Animated.Value(0)).current;
  const progress = useRef<Animated.Value>(new Animated.Value(0)).current;
  const captionOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const ringPulse = useRef<Animated.Value>(new Animated.Value(0)).current;

  const particles = useMemo(() => makeParticles(36), []);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(converge, {
          toValue: 1,
          duration: 1000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(650),
          Animated.parallel([
            Animated.timing(logoOpacity, {
              toValue: 1,
              duration: 360,
              useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
              toValue: 1,
              friction: 6,
              tension: 90,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
      Animated.parallel([
        Animated.timing(captionOpacity, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(ringPulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(ringPulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ])
        ),
      ]),
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 420,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && onDone) onDone();
    });
  }, [captionOpacity, converge, fadeOut, logoOpacity, logoScale, progress, ringPulse, onDone]);

  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.18] });
  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fadeOut }]}
      testID="boot-sequence"
    >
      <LinearGradient
        colors={["#000000", "#02060C", "#000000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* radial glow */}
      <View style={styles.bgGlow} />

      {/* particle constellation that converges */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width={SCREEN_W} height={SCREEN_H}>
          <Defs>
            <SvgGradient id="dot" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#62D0FF" stopOpacity="0.95" />
              <Stop offset="1" stopColor="#3FA9FF" stopOpacity="0.5" />
            </SvgGradient>
          </Defs>
          {particles.map((p, i) => (
            <AnimatedParticle key={`p-${i}`} p={p} converge={converge} />
          ))}
        </Svg>
      </View>

      {/* pulsing ring behind the logo */}
      <Animated.View
        style={[
          styles.ring,
          { transform: [{ scale: ringScale }], opacity: ringOpacity },
        ]}
      />

      {/* the logo */}
      <Animated.View
        style={[
          styles.logoWrap,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <BrandLogo size={140} />
      </Animated.View>

      {/* caption + progress */}
      <Animated.View style={[styles.captionWrap, { opacity: captionOpacity }]}>
        <Text style={styles.brandName}>{caption}</Text>
        <Text style={styles.brandTag}>SOLANA TRADING SUITE</Text>
        <View style={styles.barTrack}>
          <Animated.View
            style={[
              styles.barFill,
              {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

type Particle = { sx: number; sy: number; tx: number; ty: number; r: number };

function makeParticles(n: number): Particle[] {
  const out: Particle[] = [];
  const cx = SCREEN_W / 2;
  const cy = SCREEN_H / 2;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const startR = 220 + Math.random() * Math.max(SCREEN_W, SCREEN_H) * 0.5;
    const endR = 70 + Math.random() * 14;
    out.push({
      sx: cx + Math.cos(angle) * startR,
      sy: cy + Math.sin(angle) * startR,
      tx: cx + Math.cos(angle) * endR,
      ty: cy + Math.sin(angle) * endR,
      r: 1.2 + Math.random() * 1.6,
    });
  }
  return out;
}

function AnimatedParticle({ p, converge }: { p: Particle; converge: Animated.Value }) {
  const AnimatedCircle = Animated.createAnimatedComponent(Circle);
  const cx = converge.interpolate({ inputRange: [0, 1], outputRange: [p.sx, p.tx] });
  const cy = converge.interpolate({ inputRange: [0, 1], outputRange: [p.sy, p.ty] });
  const opacity = converge.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 0.85] });
  return (
    <AnimatedCircle
      cx={cx as unknown as number}
      cy={cy as unknown as number}
      r={p.r}
      fill="url(#dot)"
      opacity={opacity as unknown as number}
    />
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  bgGlow: {
    position: "absolute",
    width: SCREEN_W * 1.4,
    height: SCREEN_W * 1.4,
    borderRadius: SCREEN_W,
    backgroundColor: "rgba(63,169,255,0.10)",
    top: SCREEN_H / 2 - SCREEN_W * 0.7,
  },
  ring: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.55)",
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  captionWrap: {
    position: "absolute",
    bottom: SCREEN_H * 0.18,
    alignItems: "center",
    width: SCREEN_W,
  },
  brandName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 6,
  },
  brandTag: {
    color: "#62D0FF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    marginTop: 8,
  },
  barTrack: {
    marginTop: 22,
    width: 160,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  barFill: {
    height: 3,
    backgroundColor: "#62D0FF",
    borderRadius: 2,
  },
});
