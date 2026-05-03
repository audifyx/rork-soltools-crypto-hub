import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";

type BackgroundVariant = "feed" | "market" | "social" | "wallet" | "tool" | "neutral";

interface AppBackgroundProps {
  variant?: BackgroundVariant;
}

const variantAccents: Record<BackgroundVariant, [string, string, string]> = {
  feed: ["#FFFFFF", "#9CA3AF", "#3F3F46"],
  market: ["#F8FAFC", "#A1A1AA", "#52525B"],
  social: ["#FFFFFF", "#D4D4D8", "#3F3F46"],
  wallet: ["#FFFFFF", "#A7A7AE", "#27272A"],
  tool: ["#FFFFFF", "#C7CBD1", "#3A3A42"],
  neutral: ["#FFFFFF", "#A1A1AA", "#27272A"],
};

/** Atmospheric app-wide background: black/white SolTools slab gradient. */
export default function AppBackground({ variant = "neutral" }: AppBackgroundProps) {
  const accents = variantAccents[variant];
  const gridLines = useMemo<number[]>(() => Array.from({ length: 10 }, (_, i) => i), []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#000000", "#030304", "#111113", "#050506", "#000000"]}
        locations={[0, 0.22, 0.46, 0.72, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.carbonPanel} />
      <View style={styles.diagonalPanel} />
      <Text style={styles.watermark}>SOLTOOLS</Text>
      <Text style={styles.watermarkSmall}>SCAN · SOCIAL · ALPHA</Text>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: `${accents[0]}18` }]} />
      <View style={[styles.orb, styles.orbMid, { backgroundColor: `${accents[1]}12` }]} />
      <View style={[styles.orb, styles.orbLow, { backgroundColor: `${accents[2]}1A` }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0.035)", "rgba(255,255,255,0.00)"]}
        locations={[0, 0.36, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.topSheen}
      />
      <View style={styles.grid}>
        {gridLines.map((i) => (
          <View key={`v-${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 9.1}%` }]} />
        ))}
        {gridLines.slice(0, 8).map((i) => (
          <View key={`h-${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 10.5}%` }]} />
        ))}
      </View>
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.94)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carbonPanel: {
    position: "absolute",
    top: 76,
    left: 18,
    right: 18,
    height: 180,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.055)",
    backgroundColor: "rgba(255,255,255,0.018)",
    transform: [{ rotate: "-4deg" }],
  },
  diagonalPanel: {
    position: "absolute",
    top: 250,
    right: -90,
    width: 260,
    height: 520,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.014)",
    transform: [{ rotate: "22deg" }],
  },
  watermark: {
    position: "absolute",
    top: 112,
    left: -26,
    color: "rgba(255,255,255,0.046)",
    fontSize: 58,
    fontWeight: "900",
    letterSpacing: 9,
    transform: [{ rotate: "-8deg" }],
  },
  watermarkSmall: {
    position: "absolute",
    top: 184,
    left: 28,
    color: "rgba(255,255,255,0.055)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    transform: [{ rotate: "-8deg" }],
  },
  orb: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.85,
  },
  orbTop: {
    top: -170,
    right: -120,
  },
  orbMid: {
    top: 235,
    left: -200,
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  orbLow: {
    bottom: -170,
    right: -150,
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  topSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.13,
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
  },
});
