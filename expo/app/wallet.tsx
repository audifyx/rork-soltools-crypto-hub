import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Bell,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react-native";
import React, { useCallback } from "react";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";

const COMING_SOON_MESSAGE =
  "Wallet connection, wallet creation/import/export, Phantom, and Jupiter trading are paused until the App Store launch. For now SolTools is social + crypto discovery only.";

export default function WalletScreen() {
  const router = useRouter();

  const onComingSoon = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert("Coming soon", COMING_SOON_MESSAGE);
  }, []);

  return (
    <View style={styles.root}>
      <AppBackground variant="wallet" />
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
              <ArrowLeft color={Colors.text} size={19} strokeWidth={2.8} />
            </Pressable>
            <View style={styles.headerMid}>
              <Text style={styles.eyebrow}>APP STORE LAUNCH GATE</Text>
              <Text style={styles.title}>Wallets coming soon</Text>
            </View>
            <View style={styles.iconBtn}>
              <ShieldCheck color={Colors.mint} size={19} strokeWidth={2.8} />
            </View>
          </View>

          <LinearGradient
            colors={["rgba(85,245,178,0.24)", "rgba(56,215,255,0.11)", "rgba(3,7,8,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroIcon}>
              <LockKeyhole color={Colors.mint} size={28} strokeWidth={2.8} />
            </View>
            <Text style={styles.heroTitle}>Trading is locked for now.</Text>
            <Text style={styles.heroText}>{COMING_SOON_MESSAGE}</Text>
            <View style={styles.statusPill}>
              <Sparkles color={Colors.ink} size={13} strokeWidth={3} />
              <Text style={styles.statusText}>Social + crypto discovery mode is live</Text>
            </View>
          </LinearGradient>

          <View style={styles.grid}>
            <GateCard
              Icon={Wallet}
              title="Wallet connect"
              body="Phantom connect and app wallet accounts will unlock after App Store release."
              tone={Colors.violet}
            />
            <GateCard
              Icon={LockKeyhole}
              title="Create / import / export"
              body="Private key handling is intentionally paused until production review is complete."
              tone={Colors.mint}
            />
            <GateCard
              Icon={ShieldCheck}
              title="Jupiter trading"
              body="Buy, sell, swap, route previews, and signing flows are gated for launch safety."
              tone={Colors.orange}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>What still works now</Text>
            <Text style={styles.bodyText}>
              Communities, social posting, crypto discovery, token charts, watchlists, alerts, AI alpha insights, and public wallet tracking can continue without enabling buying or selling.
            </Text>
            <Pressable onPress={onComingSoon} style={styles.primaryBtn}>
              <Bell color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={styles.primaryText}>Notify me when wallets open</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.secondaryBtn}>
              <Text style={styles.secondaryText}>Back to SolTools</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function GateCard({
  Icon,
  title,
  body,
  tone,
}: {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  title: string;
  body: string;
  tone: string;
}) {
  return (
    <View style={styles.gateCard}>
      <View style={[styles.gateIcon, { backgroundColor: `${tone}18`, borderColor: `${tone}3D` }]}>
        <Icon color={tone} size={18} strokeWidth={2.8} />
      </View>
      <Text style={styles.gateTitle}>{title}</Text>
      <Text style={styles.gateBody}>{body}</Text>
      <Text style={[styles.gateStatus, { color: tone }]}>COMING SOON</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 60 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  headerMid: { flex: 1 },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 29, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  hero: { marginTop: 16, padding: 18, borderRadius: 26, borderWidth: 1, borderColor: "rgba(85,245,178,0.24)", overflow: "hidden" },
  heroIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: "rgba(85,245,178,0.12)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: Colors.text, fontSize: 25, fontWeight: "900", marginTop: 15, letterSpacing: -0.5 },
  heroText: { color: Colors.muted, fontSize: 13, lineHeight: 20, fontWeight: "700", marginTop: 8 },
  statusPill: { marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: Colors.mint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  statusText: { color: Colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 0.2 },
  grid: { gap: 10, marginTop: 14 },
  gateCard: { padding: 15, borderRadius: 22, backgroundColor: "rgba(16,19,29,0.80)", borderWidth: 1, borderColor: "rgba(255,255,255,0.11)" },
  gateIcon: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  gateTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", marginTop: 12 },
  gateBody: { color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 5 },
  gateStatus: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 12 },
  card: { marginTop: 14, padding: 16, borderRadius: 22, backgroundColor: "rgba(16,19,29,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.2 },
  bodyText: { color: Colors.muted, fontSize: 13, lineHeight: 20, fontWeight: "700", marginTop: 8 },
  primaryBtn: { marginTop: 14, minHeight: 46, borderRadius: 14, backgroundColor: Colors.mint, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  primaryText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },
  secondaryBtn: { marginTop: 10, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  secondaryText: { color: Colors.text, fontSize: 13, fontWeight: "900" },
});
