import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop, Path } from "react-native-svg";

import BrandLogo from "@/components/BrandLogo";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Props = {
  onDone?: () => void;
  caption?: string;
};

/**
 * Cinematic SolTools intro (~4.4s).
 *  1. Black canvas, distant stars drift in.
 *  2. Aurora ribbons sweep across the screen.
 *  3. Particles converge into the SolTools prism with a shockwave.
 *  4. "Welcome to SolTools" types in word by word.
 *  5. Tagline + progress bar fill, fade to app.
 */
export default function BootSequence({ onDone, caption = "SOL TOOLS" }: Props) {
  void caption;

  const fadeOut = useRef<Animated.Value>(new Animated.Value(1)).current;
  const logoScale = useRef<Animated.Value>(new Animated.Value(0.3)).current;
  const logoOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const logoRotate = useRef<Animated.Value>(new Animated.Value(0)).current;
  const converge = useRef<Animated.Value>(new Animated.Value(0)).current;
  const progress = useRef<Animated.Value>(new Animated.Value(0)).current;
  const ringPulse = useRef<Animated.Value>(new Animated.Value(0)).current;
  const shockwave = useRef<Animated.Value>(new Animated.Value(0)).current;
  const auroraShift = useRef<Animated.Value>(new Animated.Value(0)).current;
  const starsOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;

  const welcomeWords = useMemo(
    () => ["Welcome", "to", "SolTools"],
    []
  );
  const wordAnims = useRef(
    welcomeWords.map(() => ({
      opacity: new Animated.Value(0),
      shift: new Animated.Value(18),
    }))
  ).current;
  const taglineOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const taglineShift = useRef<Animated.Value>(new Animated.Value(12)).current;

  const particles = useMemo(() => makeParticles(54), []);
  const stars = useMemo(() => makeStars(40), []);

  useEffect(() => {
    // Background: aurora drift loop
    Animated.loop(
      Animated.timing(auroraShift, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Ring pulse loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();

    Animated.sequence([
      // 1. Stars drift in
      Animated.timing(starsOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      // 2. Particles converge while logo materializes
      Animated.parallel([
        Animated.timing(converge, {
          toValue: 1,
          duration: 1100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(700),
          Animated.parallel([
            Animated.timing(logoOpacity, {
              toValue: 1,
              duration: 320,
              useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
              toValue: 1,
              friction: 5,
              tension: 80,
              useNativeDriver: true,
            }),
            Animated.timing(logoRotate, {
              toValue: 1,
              duration: 900,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            // Shockwave on impact
            Animated.timing(shockwave, {
              toValue: 1,
              duration: 900,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
      // 3. Welcome words type in
      Animated.stagger(
        160,
        wordAnims.map((w) =>
          Animated.parallel([
            Animated.timing(w.opacity, {
              toValue: 1,
              duration: 380,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(w.shift, {
              toValue: 0,
              friction: 7,
              tension: 90,
              useNativeDriver: true,
            }),
          ])
        )
      ),
      // 4. Tagline + progress
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(taglineShift, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
      Animated.delay(260),
      // 5. Fade out
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 480,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && onDone) onDone();
    });
  }, [
    auroraShift,
    converge,
    fadeOut,
    logoOpacity,
    logoRotate,
    logoScale,
    progress,
    ringPulse,
    shockwave,
    starsOpacity,
    taglineOpacity,
    taglineShift,
    wordAnims,
    onDone,
  ]);

  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.6] });
  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] });

  const shockwaveScale = shockwave.interpolate({ inputRange: [0, 1], outputRange: [0.4, 3.2] });
  const shockwaveOpacity = shockwave.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.7, 0] });

  const auroraTx1 = auroraShift.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_W * 0.4, SCREEN_W * 0.4] });
  const auroraTx2 = auroraShift.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_W * 0.4, -SCREEN_W * 0.4] });

  const logoSpin = logoRotate.interpolate({ inputRange: [0, 1], outputRange: ["-30deg", "0deg"] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fadeOut }]}
      testID="boot-sequence"
    >
      <LinearGradient
        colors={["#000000", "#020713", "#04081A", "#000000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Aurora ribbons drift */}
      <Animated.View
        pointerEvents="none"
        style={[styles.aurora, { transform: [{ translateX: auroraTx1 }, { rotate: "-18deg" }] }]}
      >
        <LinearGradient
          colors={[
            "rgba(98,208,255,0)",
            "rgba(98,208,255,0.22)",
            "rgba(155,86,255,0.18)",
            "rgba(98,208,255,0)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.auroraBand}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.aurora2, { transform: [{ translateX: auroraTx2 }, { rotate: "14deg" }] }]}
      >
        <LinearGradient
          colors={[
            "rgba(155,86,255,0)",
            "rgba(155,86,255,0.18)",
            "rgba(20,241,149,0.15)",
            "rgba(155,86,255,0)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.auroraBand}
        />
      </Animated.View>

      {/* radial glow */}
      <View style={styles.bgGlow} />

      {/* twinkling stars */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: starsOpacity }]}>
        <Svg width={SCREEN_W} height={SCREEN_H}>
          {stars.map((s, i) => (
            <Circle key={`s-${i}`} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />
          ))}
        </Svg>
      </Animated.View>

      {/* particle constellation that converges */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width={SCREEN_W} height={SCREEN_H}>
          <Defs>
            <SvgGradient id="dot" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#62D0FF" stopOpacity="1" />
              <Stop offset="0.6" stopColor="#9B56FF" stopOpacity="0.7" />
              <Stop offset="1" stopColor="#14F195" stopOpacity="0.5" />
            </SvgGradient>
            <SvgGradient id="trail" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#62D0FF" stopOpacity="0" />
              <Stop offset="1" stopColor="#62D0FF" stopOpacity="0.85" />
            </SvgGradient>
          </Defs>
          {particles.map((p, i) => (
            <AnimatedParticle key={`p-${i}`} p={p} converge={converge} />
          ))}
        </Svg>
      </View>

      {/* Shockwave on logo impact */}
      <Animated.View
        style={[
          styles.shockwave,
          { transform: [{ scale: shockwaveScale }], opacity: shockwaveOpacity },
        ]}
      />

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
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }, { rotate: logoSpin }],
          },
        ]}
      >
        <BrandLogo size={120} />
      </Animated.View>

      {/* Welcome headline */}
      <View style={styles.welcomeWrap} pointerEvents="none">
        <View style={styles.welcomeRow}>
          {welcomeWords.map((word, i) => (
            <Animated.Text
              key={`w-${i}`}
              style={[
                styles.welcomeWord,
                i === welcomeWords.length - 1 && styles.welcomeBrand,
                {
                  opacity: wordAnims[i].opacity,
                  transform: [{ translateY: wordAnims[i].shift }],
                },
              ]}
            >
              {word}
            </Animated.Text>
          ))}
        </View>

        <Animated.Text
          style={[
            styles.tagline,
            {
              opacity: taglineOpacity,
              transform: [{ translateY: taglineShift }],
            },
          ]}
        >
          The first platform dedicated to the best tools for the crypto space.
        </Animated.Text>

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
      </View>
    </Animated.View>
  );
}

type Particle = { sx: number; sy: number; tx: number; ty: number; r: number };
type Star = { x: number; y: number; r: number; o: number };

function makeParticles(n: number): Particle[] {
  const out: Particle[] = [];
  const cx = SCREEN_W / 2;
  const cy = SCREEN_H / 2;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const startR = 260 + Math.random() * Math.max(SCREEN_W, SCREEN_H) * 0.6;
    const endR = 64 + Math.random() * 16;
    out.push({
      sx: cx + Math.cos(angle) * startR,
      sy: cy + Math.sin(angle) * startR,
      tx: cx + Math.cos(angle) * endR,
      ty: cy + Math.sin(angle) * endR,
      r: 1.1 + Math.random() * 1.9,
    });
  }
  return out;
}

function makeStars(n: number): Star[] {
  const out: Star[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: Math.random() * SCREEN_W,
      y: Math.random() * SCREEN_H,
      r: 0.6 + Math.random() * 1.2,
      o: 0.25 + Math.random() * 0.6,
    });
  }
  return out;
}

function AnimatedParticle({ p, converge }: { p: Particle; converge: Animated.Value }) {
  const AnimatedCircle = Animated.createAnimatedComponent(Circle);
  const cx = converge.interpolate({ inputRange: [0, 1], outputRange: [p.sx, p.tx] });
  const cy = converge.interpolate({ inputRange: [0, 1], outputRange: [p.sy, p.ty] });
  const opacity = converge.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0.6] });
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
    width: SCREEN_W * 1.6,
    height: SCREEN_W * 1.6,
    borderRadius: SCREEN_W,
    backgroundColor: "rgba(98,208,255,0.10)",
    top: SCREEN_H / 2 - SCREEN_W * 0.8,
  },
  aurora: {
    position: "absolute",
    top: SCREEN_H * 0.18,
    left: -SCREEN_W * 0.4,
    width: SCREEN_W * 1.8,
    height: 260,
  },
  aurora2: {
    position: "absolute",
    top: SCREEN_H * 0.55,
    left: -SCREEN_W * 0.4,
    width: SCREEN_W * 1.8,
    height: 220,
  },
  auroraBand: {
    flex: 1,
    borderRadius: 200,
  },
  shockwave: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
    borderColor: "rgba(98,208,255,0.85)",
  },
  ring: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.55)",
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: SCREEN_H * 0.28,
  },
  welcomeWrap: {
    position: "absolute",
    bottom: SCREEN_H * 0.16,
    alignItems: "center",
    width: SCREEN_W,
    paddingHorizontal: 24,
  },
  welcomeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  welcomeWord: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  welcomeBrand: {
    color: "#62D0FF",
    textShadowColor: "rgba(98,208,255,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  tagline: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 14,
    paddingHorizontal: 12,
  },
  barTrack: {
    marginTop: 22,
    width: 180,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  barFill: {
    height: 3,
    backgroundColor: "#62D0FF",
    borderRadius: 2,
    shadowColor: "#62D0FF",
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
