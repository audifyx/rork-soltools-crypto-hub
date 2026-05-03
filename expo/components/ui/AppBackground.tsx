import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";

type BackgroundVariant = "feed" | "market" | "social" | "wallet" | "tool" | "neutral";

interface AppBackgroundProps {
  variant?: BackgroundVariant;
}

const variantAccents: Record<BackgroundVariant, [string, string, string]> = {
  feed: [Colors.text, Colors.cyan, Colors.violet],
  market: [Colors.text, Colors.cyan, Colors.orange],
  social: [Colors.text, Colors.rose, Colors.violet],
  wallet: [Colors.text, Colors.violet, Colors.cyan],
  tool: [Colors.text, Colors.cyan, Colors.violet],
  neutral: [Colors.text, Colors.cyan, Colors.violet],
};

/** Atmospheric app-wide background: black/white SolTools terminal gradient. */
export default function AppBackground({ variant = "neutral" }: AppBackgroundProps) {
  const accents = variantAccents[variant];
  const gridLines = useMemo<number[]>(() => Array.from({ length: 9 }, (_, i) => i), []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#000000", "#101010", "#050505", "#1A1A1A", "#000000"]}
        locations={[0, 0.24, 0.5, 0.76, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.watermark}>SOLTOOLS</Text>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: `${accents[0]}1F` }]} />
      <View style={[styles.orb, styles.orbMid, { backgroundColor: `${accents[1]}14` }]} />
      <View style={[styles.orb, styles.orbLow, { backgroundColor: `${accents[2]}10` }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.00)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.topSheen}
      />
      <View style={styles.grid}>
        {gridLines.map((i) => (
          <View key={`v-${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 10}%` }]} />
        ))}
        {gridLines.slice(0, 7).map((i) => (
          <View key={`h-${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 12}%` }]} />
        ))}
      </View>
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.88)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  watermark: {
    position: "absolute",
    top: 116,
    left: -20,
    color: "rgba(255,255,255,0.035)",
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: 8,
    transform: [{ rotate: "-9deg" }],
  },
  orb: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.9,
  },
  orbTop: {
    top: -150,
    right: -120,
  },
  orbMid: {
    top: 210,
    left: -180,
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  orbLow: {
    bottom: -160,
    right: -150,
    width: 360,
    height: 360,
    borderRadius: 180,
  },
  topSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.075)",
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
  },
});
