import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  ClipboardPaste,
  Copy,
  Eye,
  Search,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";

type Holding = {
  symbol: string;
  name: string;
  amount: string;
  value: string;
  change: number;
};

type Activity = {
  type: "BUY" | "SELL" | "SWAP";
  token: string;
  amount: string;
  time: string;
};

const MOCK_HOLDINGS: Holding[] = [
  { symbol: "SOL", name: "Solana", amount: "142.81", value: "$24,318", change: 4.21 },
  { symbol: "JUP", name: "Jupiter", amount: "12,400", value: "$8,432", change: -1.84 },
  { symbol: "BONK", name: "Bonk", amount: "84.2M", value: "$2,118", change: 12.4 },
  { symbol: "WIF", name: "dogwifhat", amount: "1,820", value: "$3,940", change: -3.2 },
];

const MOCK_ACTIVITY: Activity[] = [
  { type: "BUY", token: "JUP", amount: "+1,200", time: "2m ago" },
  { type: "SWAP", token: "SOL → USDC", amount: "12.4 SOL", time: "8m ago" },
  { type: "SELL", token: "BONK", amount: "-12M", time: "21m ago" },
  { type: "BUY", token: "WIF", amount: "+420", time: "1h ago" },
];

export default function WalletTrackerScreen() {
  const router = useRouter();
  const [address, setAddress] = useState<string>("");
  const [tracking, setTracking] = useState<boolean>(false);

  const onTrack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (address.trim().length > 0) setTracking(true);
  }, [address]);

  const onClear = useCallback(() => {
    setAddress("");
    setTracking(false);
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back">
            <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <View style={styles.iconBadge}>
              <Wallet color={Colors.mint} size={14} strokeWidth={2.6} />
            </View>
            <Text style={styles.topTitle}>Wallet Tracker</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["rgba(85,245,178,0.18)", "rgba(3,7,8,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroLive}>
              <View style={styles.dot} />
              <Text style={styles.heroLiveText}>LIVE • HELIUS RPC</Text>
            </View>
            <Text style={styles.heroTitle}>Track any Solana wallet</Text>
            <Text style={styles.heroSub}>
              Holdings, PnL, swaps and live on-chain activity in real time.
            </Text>
          </LinearGradient>

          <View style={styles.inputCard}>
            <Search color={Colors.muted} size={18} strokeWidth={2.4} />
            <TextInput
              testID="wallet-input"
              placeholder="Paste Solana address…"
              placeholderTextColor={Colors.muted}
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {address.length > 0 ? (
              <Pressable onPress={onClear} hitSlop={10}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            ) : (
              <Pressable hitSlop={10}>
                <ClipboardPaste color={Colors.mint} size={18} strokeWidth={2.4} />
              </Pressable>
            )}
          </View>

          <Pressable onPress={onTrack} style={styles.trackBtn} testID="track">
            <Zap color={Colors.ink} size={16} strokeWidth={3} />
            <Text style={styles.trackText}>
              {tracking ? "Refresh" : "Track Wallet"}
            </Text>
          </Pressable>

          {tracking && (
            <>
              <View style={styles.statsRow}>
                <StatCard label="Net Worth" value="$38,808" tone="mint" />
                <StatCard label="24h PnL" value="+$1,284" tone="mint" />
                <StatCard label="Trades" value="142" tone="cyan" />
              </View>

              <SectionHeader title="Holdings" right={`${MOCK_HOLDINGS.length}`} />
              <View style={styles.card}>
                {MOCK_HOLDINGS.map((h, i) => (
                  <View
                    key={h.symbol}
                    style={[
                      styles.holdingRow,
                      i !== MOCK_HOLDINGS.length - 1 && styles.divider,
                    ]}
                  >
                    <View style={styles.tokenIcon}>
                      <Text style={styles.tokenIconText}>
                        {h.symbol.slice(0, 2)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.holdingSym}>{h.symbol}</Text>
                      <Text style={styles.holdingName}>{h.name}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.holdingValue}>{h.value}</Text>
                      <View style={styles.changeRow}>
                        {h.change >= 0 ? (
                          <ArrowUp color={Colors.mint} size={11} strokeWidth={3} />
                        ) : (
                          <ArrowDown color={Colors.rose} size={11} strokeWidth={3} />
                        )}
                        <Text
                          style={[
                            styles.changeText,
                            { color: h.change >= 0 ? Colors.mint : Colors.rose },
                          ]}
                        >
                          {Math.abs(h.change).toFixed(2)}%
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <SectionHeader title="Live Activity" right="Helius" />
              <View style={styles.card}>
                {MOCK_ACTIVITY.map((a, i) => (
                  <View
                    key={`${a.type}-${i}`}
                    style={[
                      styles.activityRow,
                      i !== MOCK_ACTIVITY.length - 1 && styles.divider,
                    ]}
                  >
                    <View
                      style={[
                        styles.activityBadge,
                        {
                          backgroundColor:
                            a.type === "BUY"
                              ? "rgba(85,245,178,0.16)"
                              : a.type === "SELL"
                              ? "rgba(255,93,143,0.16)"
                              : "rgba(56,215,255,0.16)",
                          borderColor:
                            a.type === "BUY"
                              ? "rgba(85,245,178,0.4)"
                              : a.type === "SELL"
                              ? "rgba(255,93,143,0.4)"
                              : "rgba(56,215,255,0.4)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.activityBadgeText,
                          {
                            color:
                              a.type === "BUY"
                                ? Colors.mint
                                : a.type === "SELL"
                                ? Colors.rose
                                : Colors.cyan,
                          },
                        ]}
                      >
                        {a.type}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityToken}>{a.token}</Text>
                      <Text style={styles.activityTime}>{a.time}</Text>
                    </View>
                    <Text style={styles.activityAmount}>{a.amount}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {!tracking && (
            <View style={styles.placeholder}>
              <View style={styles.placeholderIcon}>
                <Eye color={Colors.mint} size={28} strokeWidth={2.4} />
              </View>
              <Text style={styles.placeholderTitle}>No wallet tracked yet</Text>
              <Text style={styles.placeholderBody}>
                Paste any Solana address above to see live holdings, PnL and on-chain
                activity.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right && <Text style={styles.sectionRight}>{right}</Text>}
    </View>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "mint" | "cyan";
}) {
  const color = tone === "mint" ? Colors.mint : Colors.cyan;
  return (
    <View style={[styles.statCard, { borderColor: `${color}33` }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 80 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  topTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(85,245,178,0.14)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  hero: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
    marginTop: 4,
  },
  heroLive: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.6)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.mint },
  heroLiveText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 12,
  },
  heroSub: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 6,
  },

  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    marginTop: 16,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    padding: 0,
  },
  clearText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },

  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Colors.mint,
    marginTop: 12,
  },
  trackText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  statsRow: { flexDirection: "row", gap: 10, marginTop: 22 },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: Colors.card,
  },
  statValue: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  sectionRight: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.line },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tokenIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  tokenIconText: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  holdingSym: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  holdingName: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  holdingValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  changeText: { fontSize: 11, fontWeight: "900" },

  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  activityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  activityBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  activityToken: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  activityTime: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  activityAmount: { color: Colors.text, fontSize: 13, fontWeight: "900" },

  placeholder: {
    alignItems: "center",
    paddingVertical: 50,
    paddingHorizontal: 30,
    marginTop: 20,
  },
  placeholderIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "rgba(85,245,178,0.1)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 14,
  },
  placeholderBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
});

const _unused = [Activity, ArrowUpRight, Copy, TrendingUp];
void _unused;
