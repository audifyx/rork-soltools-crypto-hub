import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";

import Colors from "@/constants/colors";

type Props = {
  size?: number;
};

/**
 * A pure-SVG, animated wireframe globe that fakes a 3D look by:
 *  - rotating an outer ring
 *  - counter-rotating an inner mesh
 *  - pulsing a glow
 *  - drifting a soft particle layer
 *
 * No three.js / native deps required (Expo Go safe).
 */
export default function AnimatedGlobe({ size = 360 }: Props) {
  const spinOuter = useRef<Animated.Value>(new Animated.Value(0)).current;
  const spinInner = useRef<Animated.Value>(new Animated.Value(0)).current;
  const pulse = useRef<Animated.Value>(new Animated.Value(0)).current;
  const drift = useRef<Animated.Value>(new Animated.Value(0)).current;

  useEffect(() => {
    const outer = Animated.loop(
      Animated.timing(spinOuter, {
        toValue: 1,
        duration: 28000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const inner = Animated.loop(
      Animated.timing(spinInner, {
        toValue: 1,
        duration: 18000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulser = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const drifter = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    outer.start();
    inner.start();
    pulser.start();
    drifter.start();
    return () => {
      outer.stop();
      inner.stop();
      pulser.stop();
      drifter.stop();
    };
  }, [drift, pulse, spinInner, spinOuter]);

  const outerRotate = spinOuter.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const innerRotate = spinInner.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.08] });
  const driftY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  const r = size / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="none" testID="animated-globe">
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 1.15,
            height: size * 1.15,
            borderRadius: size,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      <Animated.View style={[styles.layer, { transform: [{ rotateZ: outerRotate }, { rotateX: "62deg" }] }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            <SvgGradient id="ring" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={Colors.mint} stopOpacity="0.9" />
              <Stop offset="1" stopColor={Colors.cyan} stopOpacity="0.4" />
            </SvgGradient>
          </Defs>
          <Circle cx={r} cy={r} r={r - 6} stroke="url(#ring)" strokeWidth={1.4} fill="none" />
          <Ellipse cx={r} cy={r} rx={r - 6} ry={(r - 6) * 0.45} stroke={`${Colors.mint}55`} strokeWidth={1} fill="none" />
          <Ellipse cx={r} cy={r} rx={(r - 6) * 0.7} ry={(r - 6) * 0.32} stroke={`${Colors.cyan}44`} strokeWidth={1} fill="none" />
          <Ellipse cx={r} cy={r} rx={(r - 6) * 0.4} ry={(r - 6) * 0.18} stroke={`${Colors.mint}33`} strokeWidth={1} fill="none" />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.layer, { transform: [{ rotateZ: innerRotate }, { rotateY: "55deg" }] }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            <SvgGradient id="ringB" x1="1" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={Colors.cyan} stopOpacity="0.85" />
              <Stop offset="1" stopColor={Colors.mint} stopOpacity="0.25" />
            </SvgGradient>
          </Defs>
          <Circle cx={r} cy={r} r={r - 16} stroke="url(#ringB)" strokeWidth={1.2} fill="none" />
          <Ellipse cx={r} cy={r} rx={(r - 16) * 0.9} ry={(r - 16) * 0.55} stroke={`${Colors.cyan}55`} strokeWidth={1} fill="none" />
          <Ellipse cx={r} cy={r} rx={(r - 16) * 0.55} ry={(r - 16) * 0.85} stroke={`${Colors.mint}44`} strokeWidth={1} fill="none" />
          <Path
            d={`M ${r - (r - 16)} ${r} Q ${r} ${r - (r - 16)} ${r + (r - 16)} ${r}`}
            stroke={`${Colors.mint}66`}
            strokeWidth={1}
            fill="none"
          />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.particles, { transform: [{ translateY: driftY }] }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {PARTICLES.map((p, i) => (
            <Circle
              key={`p-${i}`}
              cx={r + p.x * (r - 20)}
              cy={r + p.y * (r - 20)}
              r={p.r}
              fill={p.c}
              opacity={p.o}
            />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

const PARTICLES: { x: number; y: number; r: number; c: string; o: number }[] = [
  { x: -0.7, y: -0.3, r: 1.4, c: Colors.mint, o: 0.9 },
  { x: 0.6, y: -0.55, r: 1.8, c: Colors.cyan, o: 0.8 },
  { x: 0.8, y: 0.2, r: 1.2, c: Colors.mint, o: 0.7 },
  { x: -0.55, y: 0.5, r: 2.0, c: Colors.cyan, o: 0.85 },
  { x: 0.2, y: 0.75, r: 1.4, c: Colors.mint, o: 0.6 },
  { x: -0.2, y: -0.8, r: 1.6, c: Colors.cyan, o: 0.55 },
  { x: 0.42, y: 0.42, r: 1.0, c: Colors.mint, o: 0.5 },
  { x: -0.42, y: 0.0, r: 1.2, c: Colors.cyan, o: 0.65 },
];

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  particles: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(85, 245, 178, 0.18)",
  },
});
