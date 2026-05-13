import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
  Rect,
  G,
  Filter,
  FeGaussianBlur,
} from "react-native-svg";

type Props = {
  size?: number;
  glow?: boolean;
};

/**
 * SolTools brand mark — a hex-cut prism containing three diagonal Solana
 * stripes that lean forward into a forward-arrow/lightning. Drawn on a 100x100
 * viewBox so it scales cleanly to any size.
 */
export default function BrandLogo({ size = 96, glow = true }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]} testID="brand-logo">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <SvgGradient id="prism" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#62D0FF" stopOpacity="1" />
            <Stop offset="0.55" stopColor="#3FA9FF" stopOpacity="1" />
            <Stop offset="1" stopColor="#1E5BAA" stopOpacity="1" />
          </SvgGradient>
          <SvgGradient id="stripeTop" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#E6F2FF" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.9" />
          </SvgGradient>
          <SvgGradient id="stripeMid" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#9CD7FF" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#E6F2FF" stopOpacity="0.9" />
          </SvgGradient>
          <SvgGradient id="stripeBot" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#62D0FF" stopOpacity="1" />
            <Stop offset="1" stopColor="#9CD7FF" stopOpacity="0.85" />
          </SvgGradient>
          <SvgGradient id="bevel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgGradient>
          <Filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <FeGaussianBlur stdDeviation="1.2" />
          </Filter>
        </Defs>

        {/* Hex prism */}
        <Path
          d="M50 4 L88 24 L88 76 L50 96 L12 76 L12 24 Z"
          fill="url(#prism)"
        />
        {/* Top bevel highlight */}
        <Path
          d="M50 4 L88 24 L50 44 L12 24 Z"
          fill="url(#bevel)"
        />

        {/* Three Solana stripes leaning into a forward arrow */}
        <G>
          <Path
            d="M22 38 L70 38 L78 30 L30 30 Z"
            fill="url(#stripeTop)"
          />
          <Path
            d="M22 56 L70 56 L78 48 L30 48 Z"
            fill="url(#stripeMid)"
          />
          <Path
            d="M22 74 L70 74 L78 66 L30 66 Z"
            fill="url(#stripeBot)"
          />
        </G>

        {/* Lightning slash accent */}
        <Path
          d="M58 22 L42 52 L52 52 L40 80 L66 46 L56 46 Z"
          fill="#FFFFFF"
          opacity={0.18}
        />

        {/* Edge stroke */}
        <Path
          d="M50 4 L88 24 L88 76 L50 96 L12 76 L12 24 Z"
          stroke="#FFFFFF"
          strokeOpacity={0.18}
          strokeWidth={0.8}
          fill="none"
        />
      </Svg>
      {glow ? <View pointerEvents="none" style={[styles.glow, { width: size * 1.6, height: size * 1.6, borderRadius: size }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(63,169,255,0.18)",
    zIndex: -1,
  },
});

/** Stand-alone Solana stripes mark (no hex) for inline use. */
export function BrandStripes({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id="sTop" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#62D0FF" />
          <Stop offset="1" stopColor="#9CD7FF" />
        </SvgGradient>
        <SvgGradient id="sMid" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#3FA9FF" />
          <Stop offset="1" stopColor="#62D0FF" />
        </SvgGradient>
        <SvgGradient id="sBot" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#1E88FF" />
          <Stop offset="1" stopColor="#3FA9FF" />
        </SvgGradient>
      </Defs>
      <Path d="M10 22 L72 22 L90 8 L28 8 Z" fill="url(#sTop)" />
      <Path d="M10 58 L72 58 L90 44 L28 44 Z" fill="url(#sMid)" />
      <Path d="M10 92 L72 92 L90 78 L28 78 Z" fill="url(#sBot)" />
    </Svg>
  );
}
