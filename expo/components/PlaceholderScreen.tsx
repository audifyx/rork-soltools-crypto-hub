import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type Props = {
  eyebrow: string;
  title: string;
  body: string;
  Icon: LucideIcon;
  accent: string;
  secondary: string;
  features: { label: string; Icon: LucideIcon }[];
  testID?: string;
};

export default function PlaceholderScreen({
  eyebrow,
  title,
  body,
  Icon,
  accent,
  secondary,
  features,
  testID,
}: Props) {
  return (
    <View style={styles.root} testID={testID}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.content}>
          <View style={[styles.heroOuter, { borderColor: `${accent}33` }]}>
            <LinearGradient
              colors={[`${accent}22`, `${secondary}11`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroInner}
            >
              <Icon color={accent} size={42} strokeWidth={2.4} />
            </LinearGradient>
          </View>

          <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <View style={styles.featureGrid}>
            {features.map((f) => (
              <View key={f.label} style={[styles.featureCard, { borderColor: `${accent}22` }]}>
                <f.Icon color={accent} size={18} strokeWidth={2.4} />
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.cta, { borderColor: `${accent}55` }]}>
            <View style={[styles.ctaDot, { backgroundColor: accent }]} />
            <Text style={styles.ctaText}>Coming soon · stay tuned</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: "center",
  },
  heroOuter: {
    width: 108,
    height: 108,
    borderRadius: 32,
    borderWidth: 1,
    overflow: "hidden",
    padding: 4,
    marginTop: 16,
    marginBottom: 28,
  },
  heroInner: {
    flex: 1,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
    textAlign: "center",
  },
  body: {
    color: Colors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 8,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: 28,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  featureLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 32,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  ctaDot: { width: 7, height: 7, borderRadius: 4 },
  ctaText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
