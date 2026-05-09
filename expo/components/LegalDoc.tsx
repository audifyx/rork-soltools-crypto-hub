import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";

export type LegalSection = {
  heading: string;
  body: string;
};

interface LegalDocProps {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
  contact?: string;
}

export default function LegalDoc({
  eyebrow,
  title,
  effectiveDate,
  intro,
  sections,
  contact,
}: LegalDocProps) {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient
        colors={["#020506", "#06120F", "#020708"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbA]} />
      <View style={[styles.orb, styles.orbB]} />

      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/profile")}
            style={styles.backBtn}
            hitSlop={8}
            testID="legal-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <Text style={styles.headerEyebrow}>{eyebrow}</Text>
          <View style={styles.backBtnSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{title}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>Effective {effectiveDate}</Text>
            </View>
          </View>
          <Text style={styles.intro}>{intro}</Text>

          {sections.map((s, i) => (
            <View key={`${s.heading}-${i}`} style={styles.section}>
              <Text style={styles.sectionIndex}>{String(i + 1).padStart(2, "0")}</Text>
              <Text style={styles.sectionHeading}>{s.heading}</Text>
              <Text style={styles.sectionBody}>{s.body}</Text>
            </View>
          ))}

          {contact ? (
            <View style={styles.contactCard}>
              <Text style={styles.contactTitle}>Contact</Text>
              <Text style={styles.contactBody}>{contact}</Text>
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  orb: { position: "absolute", width: 320, height: 320, borderRadius: 160 },
  orbA: { top: -110, right: -120, backgroundColor: "rgba(63,169,255,0.12)" },
  orbB: { bottom: -120, left: -120, backgroundColor: "rgba(98,208,255,0.10)" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  backBtnSpacer: { width: 42, height: 42 },
  headerEyebrow: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.4,
  },

  scroll: { paddingHorizontal: 22, paddingTop: 12 },

  title: {
    color: Colors.text,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 12,
  },
  metaRow: { flexDirection: "row", marginBottom: 18 },
  metaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(63,169,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.32)",
  },
  metaPillText: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  intro: {
    color: Colors.muted,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
    marginBottom: 26,
  },

  section: {
    marginBottom: 22,
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  sectionIndex: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  sectionHeading: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  sectionBody: {
    color: Colors.muted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
  },

  contactCard: {
    marginTop: 6,
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(63,169,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.28)",
  },
  contactTitle: {
    color: Colors.mint,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  contactBody: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
});
