import React from "react";
import { StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import type { UserBadge } from "@/lib/badge-system";

interface Props {
  badge: UserBadge;
  compact?: boolean;
}

export default function GlowingBadge({ badge, compact }: Props) {
  return (
    <View
      style={[
        styles.badge,
        {
          borderColor: badge.color,
          backgroundColor:
            badge.background ?? "rgba(255,255,255,0.06)",
          shadowColor: badge.glow ? badge.color : "transparent",
        },
        compact && styles.compact,
      ]}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor: badge.color,
            shadowColor: badge.color,
          },
        ]}
      />

      <Text
        style={[
          styles.label,
          {
            color: badge.textColor ?? badge.color,
          },
        ]}
      >
        {badge.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 5,
  },
  compact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 0,
    },
  },
  label: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
    color: Colors.text,
  },
});
