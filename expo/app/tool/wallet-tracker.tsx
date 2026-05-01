import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ArrowUpRight,
  ClipboardPaste,
  Eye,
  RefreshCw,
  Search,
  Wallet,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import {
  fetchWalletPortfolio,
  isValidSolanaAddress,
  type WalletTokenHolding,
  type WalletTransaction,
} from "@/lib/api/wallet";

function shorten(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function WalletTrackerScreen() {
  const router = useRouter();
  const [address, setAddress] = useState<string>("");
  const [tracked, setTracked] = useState<string>("");

  const valid = useMemo<boolean>(() => isValidSolanaAddress(address), [address]);

  const portfolio = useQuery({
    queryKey: ["wallet", "portfolio", tracked] as const,
    queryFn: () => fetchWalletPortfolio(tracked),
    enabled: tracked.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const onTrack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (!valid) return;
    setTracked(address.trim());
  }, [address, valid]);

  const onClear = useCallback(() => {
    setAddress("");
    setTracked("");
  }, []);

  const onPaste = useCallback(async () => {
    try {
      const v = await Clipboard.getStringAsync();
      if (v) setAddress(v.trim());
    } catch (e) {
      console.log("[wallet-tracker] paste error", e);
    }
  }, []);

  const onRefresh = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    portfolio.refetch();
  }, [portfolio]);

  const onOpenSig = useCallback((sig: string) => {
    Linking.openURL(`https://solscan.io/tx/${sig}`).catch(() => {});
  }, []);

  const data = portfolio.data;
  const holdings: WalletTokenHolding[] = useMemo(() => {
    const tokens = data?.tokens ?? [];
    return tokens
      .slice()
      .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))
      .slice(0, 25);
  }, [data?.tokens]);
  const txs: WalletTransaction[] = data?.transactions ?? [];
  const sol = data?.balance?.sol ?? 0;
  const usd = data?.balance?.usd ?? 0;

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
              Holdings, balances and on-chain activity in real time.
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
              <Pressable hitSlop={10} onPress={onPaste}>
                <ClipboardPaste color={Colors.mint} size={18} strokeWidth={2.4} />
              </Pressable>
            )}
          </View>

          {address.length > 0 && !valid && (
            <Text style={styles.invalid}>Not a valid Solana address.</Text>
          )}

          <Pressable
            onPress={tracked ? onRefresh : onTrack}
            style={[styles.trackBtn, !valid && !tracked && styles.trackBtnDisabled]}
            disabled={!valid && !tracked}
            testID="track"
          >
            {portfolio.isFetching ? (
              <ActivityIndicator size="small" color={Colors.ink} />
            ) : tracked ? (
              <RefreshCw color={Colors.ink} size={16} strokeWidth={3} />
            ) : (
              <Zap color={Colors.ink} size={16} strokeWidth={3} />
            )}
            <Text style={styles.trackText}>
              {tracked ? "Refresh" : "Track Wallet"}
            </Text>
          </Pressable>

          {tracked.length > 0 && (
            <>
              <View style={styles.statsRow}>
                <StatCard label="Net Worth" value={formatUsd(usd)} tone="mint" />
                <StatCard
                  label="SOL"
                  value={sol.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  tone="mint"
                />
                <StatCard label="Tokens" value={`${holdings.length}`} tone="cyan" />
              </View>

              <View style={styles.addrRow}>
                <Text style={styles.addrLabel}>Tracking</Text>
                <Text style={styles.addrValue}>{shorten(tracked)}</Text>
              </View>

              <SectionHeader title="Holdings" right={`${holdings.length}`} />
              {portfolio.isLoading ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={Colors.mint} />
                  <Text style={styles.loadingText}>Fetching live holdings…</Text>
                </View>
              ) : holdings.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No tokens detected.</Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {holdings.map((h, i) => (
                    <View
                      key={h.mint}
                      style={[
                        styles.holdingRow,
                        i !== holdings.length - 1 && styles.divider,
                      ]}
                    >
                      <View style={styles.tokenIcon}>
                        <Text style={styles.tokenIconText}>
                          {(h.symbol ?? h.mint).slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.holdingSym}>
                          {h.symbol ?? shorten(h.mint)}
                        </Text>
                        <Text style={styles.holdingName}>
                          {formatAmount(h.uiAmount)}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.holdingValue}>
                          {h.usdValue && h.usdValue > 0 ? formatUsd(h.usdValue) : "—"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <SectionHeader title="Live Activity" right="Helius" />
              {portfolio.isLoading ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={Colors.mint} />
                  <Text style={styles.loadingText}>Loading recent signatures…</Text>
                </View>
              ) : txs.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No recent transactions.</Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {txs.slice(0, 20).map((t, i) => (
                    <Pressable
                      key={t.signature}
                      onPress={() => onOpenSig(t.signature)}
                      style={[
                        styles.activityRow,
                        i !== Math.min(txs.length, 20) - 1 && styles.divider,
                      ]}
                      testID={`tx-${i}`}
                    >
                      <View
                        style={[
                          styles.activityBadge,
                          {
                            backgroundColor:
                              t.status === "failed"
                                ? "rgba(255,93,143,0.16)"
                                : "rgba(85,245,178,0.16)",
                            borderColor:
                              t.status === "failed"
                                ? "rgba(255,93,143,0.4)"
                                : "rgba(85,245,178,0.4)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.activityBadgeText,
                            {
                              color:
                                t.status === "failed" ? Colors.rose : Colors.mint,
                            },
                          ]}
                        >
                          {t.status === "failed" ? "FAIL" : "TX"}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.activityToken}>
                          {shorten(t.signature)}
                        </Text>
                        <Text style={styles.activityTime}>
                          {timeAgo(t.blockTime)}
                        </Text>
                      </View>
                      <ArrowUpRight color={Colors.muted} size={14} strokeWidth={2.6} />
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {!tracked && (
            <View style={styles.placeholder}>
              <View style={styles.placeholderIcon}>
                <Eye color={Colors.mint} size={28} strokeWidth={2.4} />
              </View>
              <Text style={styles.placeholderTitle}>No wallet tracked yet</Text>
              <Text style={styles.placeholderBody}>
                Paste any Solana address above to see live holdings, balances and
                on-chain activity.
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
  topTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },

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
  heroLiveText: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8, marginTop: 12 },
  heroSub: { color: Colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 19, marginTop: 6 },

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
  input: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "700", padding: 0 },
  clearText: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  invalid: { color: Colors.rose, fontSize: 12, fontWeight: "700", marginTop: 8, marginLeft: 4 },

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
  trackBtnDisabled: { opacity: 0.4 },
  trackText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },

  statsRow: { flexDirection: "row", gap: 10, marginTop: 22 },
  statCard: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, backgroundColor: Colors.card },
  statValue: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  },

  addrRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  addrLabel: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  addrValue: { color: Colors.text, fontSize: 13, fontWeight: "800" },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  sectionRight: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },

  card: { borderRadius: 18, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card, overflow: "hidden" },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.line },
  holdingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
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
  tokenIconText: { color: Colors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  holdingSym: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  holdingName: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  holdingValue: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },

  activityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  activityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  activityBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  activityToken: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  activityTime: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  loading: { paddingVertical: 24, alignItems: "center", gap: 8 },
  loadingText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  empty: {
    paddingVertical: 24,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.line,
  },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

  placeholder: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 30, marginTop: 20 },
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
  placeholderTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", marginTop: 14 },
  placeholderBody: { color: Colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 19, textAlign: "center", marginTop: 6 },
});
