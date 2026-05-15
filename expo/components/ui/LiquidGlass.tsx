import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

interface LiquidGlassProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** BlurView intensity used on the fallback path. */
  intensity?: number;
  tint?: "dark" | "light";
  /** Liquid glass style — clear is more transparent, regular is the default frosted look. */
  glassStyle?: "regular" | "clear";
  /** Optional tint applied to the glass (iOS 26+ only). */
  tintColor?: string;
  /** Adds a subtle highlight gradient on the surface. */
  sheen?: boolean;
  radius?: number;
  borderColor?: string;
  testID?: string;
}

const liquidAvailable = (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

/**
 * Cross-platform liquid glass surface.
 * - iOS 26+: native UIVisualEffectView via `expo-glass-effect`.
 * - Older iOS / Android: frosted BlurView + translucent overlay fallback.
 * - Web: translucent surface only.
 *
 * Always pass an absolute-fill `style` (or width/height) — this component does
 * not size itself.
 */
export default function LiquidGlass({
  children,
  style,
  intensity = 40,
  tint = "dark",
  glassStyle = "regular",
  tintColor,
  sheen = true,
  radius,
  borderColor,
  testID,
}: LiquidGlassProps) {
  const baseStyle: StyleProp<ViewStyle> = [
    style,
    radius != null ? { borderRadius: radius, overflow: "hidden" } : null,
    borderColor ? { borderWidth: StyleSheet.hairlineWidth, borderColor } : null,
  ];

  if (liquidAvailable && Platform.OS === "ios") {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        tintColor={tintColor}
        style={baseStyle}
        testID={testID}
      >
        {sheen ? (
          <LinearGradient
            colors={[
              tint === "dark" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.45)",
              "transparent",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : null}
        {children}
      </GlassView>
    );
  }

  const fallbackBg =
    tint === "dark" ? "rgba(10,12,20,0.55)" : "rgba(245,247,252,0.55)";

  return (
    <View style={baseStyle} testID={testID}>
      {Platform.OS !== "web" ? (
        <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg }]} />
      {sheen ? (
        <LinearGradient
          colors={[
            tint === "dark" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.40)",
            "transparent",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}

export { liquidAvailable };
