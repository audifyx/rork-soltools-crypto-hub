import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import Colors from "@/constants/colors";

const LIQUID_AVAILABLE = (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: "dark" | "light";
  borderColor?: string;
  glowColor?: string;
  radius?: number;
  padding?: number;
  gradient?: [string, string];
  testID?: string;
}

/**
 * Frosted glass bubble used across the app for the redesigned UI.
 * Combines BlurView (where supported) + a translucent surface + a soft
 * gradient sheen and an optional glow ring for premium feel.
 */
export default function GlassCard({
  children,
  style,
  intensity = 28,
  tint = "dark",
  borderColor = "rgba(216,183,90,0.18)",
  glowColor,
  radius = 22,
  padding = 16,
  gradient,
  testID,
}: GlassCardProps) {
  const blurAvailable = Platform.OS !== "web";
  const grad: [string, string] = gradient ?? [
    "rgba(244,198,91,0.11)",
    "rgba(221,227,236,0.035)",
  ];

  return (
    <View
      style={[
        styles.wrap,
        {
          borderRadius: radius,
          borderColor,
          shadowColor: glowColor ?? "#000",
          shadowOpacity: glowColor ? 0.6 : 0.25,
          shadowRadius: glowColor ? 20 : 14,
        },
        style,
      ]}
      testID={testID}
    >
      <View style={[styles.surface, { borderRadius: radius }]}>
        {LIQUID_AVAILABLE && Platform.OS === "ios" ? (
          <GlassView
            glassEffectStyle="regular"
            style={StyleSheet.absoluteFill}
          />
        ) : blurAvailable ? (
          <BlurView
            intensity={intensity}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {!(LIQUID_AVAILABLE && Platform.OS === "ios") ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: tint === "dark" ? "rgba(12,10,5,0.55)" : "rgba(247,242,231,0.55)" },
            ]}
          />
        ) : null}
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {glowColor ? (
          <LinearGradient
            colors={[`${glowColor}26`, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : null}
        <View style={{ padding }}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    backgroundColor: Colors.ink,
  },
  surface: {
    overflow: "hidden",
  },
});
