import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import React from "react";
import { Platform, StyleProp, StyleSheet, ViewStyle } from "react-native";

const LIQUID_AVAILABLE = (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

interface GlassBgProps {
  intensity?: number;
  tint?: "dark" | "light";
  glassStyle?: "regular" | "clear";
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Drop-in absolute-fill background that uses iOS 26 Liquid Glass when
 * available and gracefully falls back to a BlurView. Designed to replace
 * `<BlurView intensity={x} tint="dark" style={StyleSheet.absoluteFill} />`
 * everywhere we want a consistent glass surface.
 */
export default function GlassBg({
  intensity = 30,
  tint = "dark",
  glassStyle = "regular",
  tintColor,
  style,
}: GlassBgProps) {
  if (LIQUID_AVAILABLE && Platform.OS === "ios") {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        tintColor={tintColor}
        style={[StyleSheet.absoluteFill, style]}
      />
    );
  }
  if (Platform.OS === "web") {
    return null;
  }
  return (
    <BlurView intensity={intensity} tint={tint} style={[StyleSheet.absoluteFill, style]} />
  );
}

export { LIQUID_AVAILABLE };
