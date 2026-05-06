import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, ViewStyle } from "react-native";

import Colors from "@/constants/colors";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/** Animated shimmer placeholder used while data is loading. */
export function Skeleton({ width = "100%", height = 14, radius = 8, style }: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.85],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.04)",
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: "rgba(255,255,255,0.08)",
            opacity,
          },
        ]}
      />
    </View>
  );
}

interface SkeletonRowProps {
  avatar?: boolean;
  lines?: number;
  style?: ViewStyle;
}

export function SkeletonRow({ avatar = true, lines = 2, style }: SkeletonRowProps) {
  return (
    <View style={[skelStyles.row, style]}>
      {avatar ? <Skeleton width={42} height={42} radius={14} /> : null}
      <View style={skelStyles.lines}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={`skel-line-${i}`}
            width={i === 0 ? "60%" : "85%"}
            height={i === 0 ? 12 : 10}
            radius={6}
            style={{ marginBottom: 6 }}
          />
        ))}
      </View>
    </View>
  );
}

export function SkeletonCard() {
  return (
    <View style={skelStyles.card}>
      <SkeletonRow />
      <Skeleton width="92%" height={12} radius={6} style={{ marginTop: 6 }} />
      <Skeleton width="78%" height={12} radius={6} style={{ marginTop: 6 }} />
    </View>
  );
}

const skelStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lines: { flex: 1 },
  card: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 4,
  },
});

export default Skeleton;
