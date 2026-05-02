import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import Colors from "@/constants/colors";

type BackgroundVariant = "feed" | "market" | "social" | "wallet" | "tool" | "neutral";

interface AppBackgroundProps {
  variant?: BackgroundVariant;
}

const variantAccents: Record<BackgroundVariant, [string, string, string]> = {
  feed: [Colors.mint, Colors.cyan, Colors.rose],
  market: [Colors.cyan, Colors.mint, Colors.orange],
  social: [Colors.rose, Colors.violet, Colors.cyan],
  wallet: [Colors.violet, Colors.mint, Colors.orange],
  tool: [Colors.mint, Colors.violet, Colors.cyan],
  neutral: [Colors.cyan, Colors.violet, Colors.mint],
};

/** Atmospheric app-wide background: dark social feed + DEX terminal + Phantom glow. */
export default function AppBackground({ variant = "neutral" }: AppBackgroundProps) {
  const accents = variantAccents[variant];
  const gridLines = useMemo<number[]>(() => Array.from({ length: 9 }, (_, i) => i), []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#05050A", "#081018", "#060811", "#05050A"]}
        locations={[0, 0.35, 0.72, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbTop, { backgroundColor: `${accents[0]}22` }]} />
      <View style={[styles.orb, styles.orbMid, { backgroundColor: `${accents[1]}18` }]} />
      <View style={[styles.orb, styles.orbLow, { backgroundColor: `${accents[2]}16` }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.00)"]}
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
        colors={["rgba(5,5,10,0)", "rgba(5,5,10,0.82)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
  },
});
