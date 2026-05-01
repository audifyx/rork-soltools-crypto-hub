import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import Colors from "@/constants/colors";

type Props = {
  uri?: string | null;
  ticker?: string;
  size: number;
  radius?: number;
  gradient?: [string, string];
  style?: ViewStyle;
  textSize?: number;
};

export default function TokenAvatar({
  uri,
  ticker,
  size,
  radius,
  gradient,
  style,
  textSize,
}: Props) {
  const [errored, setErrored] = useState<boolean>(false);
  const r = radius ?? Math.round(size * 0.28);
  const colors = gradient ?? ([Colors.mint, Colors.cyan] as [string, string]);
  const showImage = !!uri && uri.trim().length > 0 && !errored;
  const initials = (ticker ?? "")
    .replace("$", "")
    .slice(0, 2)
    .toUpperCase();
  const tFont = textSize ?? Math.max(10, Math.round(size * 0.34));

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: r, overflow: "hidden" },
        styles.wrap,
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={120}
          onError={() => setErrored(true)}
          cachePolicy="memory-disk"
          recyclingKey={uri ?? undefined}
        />
      ) : (
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fallback, { width: size, height: size }]}
        >
          <Text style={[styles.text, { fontSize: tFont }]}>{initials}</Text>
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.card },
  fallback: { alignItems: "center", justifyContent: "center" },
  text: { color: Colors.ink, fontWeight: "900", letterSpacing: 0.4 },
});
