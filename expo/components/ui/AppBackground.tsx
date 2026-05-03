import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";


type BackgroundVariant = "feed" | "market" | "social" | "wallet" | "tool" | "neutral";

type GlowStyleKey = "feedGlow" | "marketGlow" | "socialGlow" | "walletGlow" | "toolGlow" | "neutralGlow";

interface AppBackgroundProps {
  variant?: BackgroundVariant;
}

const glowStyleByVariant: Record<BackgroundVariant, GlowStyleKey> = {
  feed: "feedGlow",
  market: "marketGlow",
  social: "socialGlow",
  wallet: "walletGlow",
  tool: "toolGlow",
  neutral: "neutralGlow",
};

/** App-wide background: clean black depth with no decorative text. */
export default function AppBackground({ variant = "neutral" }: AppBackgroundProps) {
  const accentStyle = styles[glowStyleByVariant[variant]];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#000000", "#030303", "#070707", "#020202", "#000000"]}
        locations={[0, 0.22, 0.48, 0.76, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, styles.topGlow, accentStyle]} />
      <View style={styles.centerShade} />
      <View style={styles.vignetteTop} />
      <View style={styles.vignetteSide} />
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)", "rgba(0,0,0,0.96)"]}
        locations={[0, 0.62, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    opacity: 0.55,
  },
  topGlow: {
    top: -250,
    right: -190,
  },
  neutralGlow: {
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  feedGlow: {
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  marketGlow: {
    backgroundColor: "rgba(244,198,91,0.050)",
  },
  socialGlow: {
    backgroundColor: "rgba(221,227,236,0.050)",
  },
  walletGlow: {
    backgroundColor: "rgba(216,183,90,0.045)",
  },
  toolGlow: {
    backgroundColor: "rgba(255,255,255,0.050)",
  },
  centerShade: {
    position: "absolute",
    top: 120,
    left: -80,
    right: -80,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(255,255,255,0.018)",
    opacity: 0.65,
  },
  vignetteTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: "rgba(255,255,255,0.018)",
  },
  vignetteSide: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 22,
    backgroundColor: "rgba(255,255,255,0.012)",
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 320,
  },
});
