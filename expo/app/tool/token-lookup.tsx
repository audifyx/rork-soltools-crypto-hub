import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  ClipboardPaste,
  Copy,
  Coins,
  Droplets,
  ExternalLink,
  Hash,
  Loader2,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
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
import DexChart from "@/components/DexChart";
import { getTokenOverview, type TokenOverview } from "@/lib/api/birdeye";
import { fmtUsd, fmtNum } from "@/utils/format";

const INTERVALS: { key: string; label: string }[] = [
  { key: "5", label: "5m" },
  { key: "15", label: "15m" },
  { key: "60", label: "1h" },
  { key: "240", label: "4h" },
  { key: "1D", label: "1D" },
];

export default function TokenLookupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ address?: string }>();
  const initial = typeof params.address === "string" ? params.address : "";

  const [input, setInput] = useState<string>(initial);
  const [contract, setContract] = useState<string>(initial);
  const [interval, setInterval] = useState<string>("60");

  useEffect(() => {
    if (initial && !contract) setContract(initial);
  }, [initial, contract]);

  const enabled = contract.trim().length >= 32;

  const overviewQ = useQuery<TokenOverview | null>({
    queryKey: ["tokenLookup", "overview", contract],
    enabled,
    queryFn: async () => {
      try {
        return await getTokenOverview(contract.trim());
      } catch (e) {
        console.log("[token-lookup] overview failed", e);
        throw e;
      }
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const onPaste = useCallback(async () => {
    try {
      const txt = await Clipboard.getStringAsync();
      if (txt) {
        setInput(txt.trim());
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[token-lookup] paste failed", e);
    }
  }, []);

  const onLookup = useCallback(() => {
    const c = input.trim();
    if (c.length < 32) {
      Alert.alert("Invalid address", "Paste a full Solana token contract address.");
      return;
    }
    setContract(c);
    Haptics.selectionAsync().catch(() => {});
  }, [input]);

  const onCopy = useCallback(async () => {
    if (!contract) return;
    await Clipboard.setStringAsync(contract);
    Haptics.selectionAsync().catch(() => {});
    Alert.alert("Copied", "Contract address copied.");
  }, [contract]);

  const openExplorer = useCallback(() => {
    if (!contract) return;
    Linking.openURL(`https://solscan.io/token/${contract}`).catch(() => {});
  }, [contract]);

  const overview = overviewQ.data ?? null;
  const loading = overviewQ.isFetching && !overview;
  const errored = !!overviewQ.error && !overview;
  const change = overview?.priceChange24h;
  const isUp = (change ?? 0) >= 0;
  const accent = isUp ? Colors.mint : Colors.rose;

  const stats = useMemo(() => {
    return [
      { label: "Liquidity", value: fmtUsd(overview?.liquidity), Icon: Droplets },
      { label: "Holders", value: fmtNum(overview?.holder), Icon: Users },
      { label: "Price", value: fmtUsd(overview?.price), Icon: Coins },
      { label: "24h Change", value: change != null ? `${isUp ? "+" : ""}${change.toFixed(2)}%` : "—", Icon: isUp ? TrendingUp : TrendingDown },
    ];
  }, [overview, change, isUp]);

  return (
    <View style={styles.root} testID="token-lookup-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerBar}>
            <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8} testID="lookup-back">
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
            <Text style={styles.headerEyebrow}>SOL TOOLS · LOOKUP</Text>
            <View style={styles.iconBtn} />
          </View>

          <View style={styles.heroCard}>
            <LinearGradient
              colors={[`${Colors.cyan}33`, `${Colors.cyan}05`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGrad}
            >
              <View style={[styles.heroIcon, { borderColor: `${Colors.cyan}55` }]}>
                <Search color={Colors.cyan} size={26} strokeWidth={2.4} />
              </View>
              <Text style={styles.heroTitle}>Token Lookup</Text>
              <Text style={[styles.heroTag, { color: Colors.cyan }]}>Paste any Solana contract</Text>
              <Text style={styles.heroDesc}>
                Get a full live snapshot — price, market cap, liquidity, holders — plus a real-time DEX chart for any token.
              </Text>
            </LinearGradient>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Contract address</Text>
            <View style={styles.inputWithAction}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={onLookup}
                placeholder="Paste Solana token contract..."
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.inputFlex]}
                testID="lookup-input"
                returnKeyType="search"
              />
              <Pressable onPress={onPaste} style={styles.iconAction} hitSlop={6}>
                <ClipboardPaste color={Colors.cyan} size={15} strokeWidth={2.6} />
              </Pressable>
            </View>
            <Pressable
              onPress={onLookup}
              style={[styles.primaryBtn, { backgroundColor: Colors.cyan }, loading && { opacity: 0.6 }]}
              disabled={loading}
              testID="lookup-run"
            >
              {loading ? (
                <Loader2 color={Colors.ink} size={15} strokeWidth={3} />
              ) : (
                <Search color={Colors.ink} size={15} strokeWidth={3} />
              )}
              <Text style={styles.primaryBtnText}>{loading ? "Loading…" : "Lookup token"}</Text>
            </Pressable>
          </View>

          {!enabled && !contract ? (
            <View style={styles.placeholder}>
              <Sparkles color={Colors.muted} size={18} strokeWidth={2.4} />
              <Text style={styles.placeholderText}>
                Paste a contract above to see the full token display and live chart.
              </Text>
            </View>
          ) : null}

          {errored ? (
            <View style={[styles.placeholder, { borderColor: `${Colors.rose}33` }]}>
              <Text style={[styles.placeholderText, { color: Colors.rose }]}>
                Couldn&apos;t load this token. Double-check the contract address.
              </Text>
            </View>
          ) : null}

          {enabled && (overview || loading) ? (
            <>
              <View style={[styles.tokenCard, { borderColor: `${accent}33` }]}>
                <LinearGradient
                  colors={[`${accent}1F`, "rgba(3,7,8,0)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.tokenHead}>
                  <View style={[styles.tokenLogo, { borderColor: `${accent}55` }]}>
                    {overview?.logoURI ? (
                      <Image source={{ uri: overview.logoURI }} style={styles.tokenLogoImg} />
                    ) : (
                      <Text style={[styles.tokenLogoFallback, { color: accent }]}>
                        {(overview?.symbol ?? "?").slice(0, 2).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tokenName} numberOfLines={1}>
                      {overview?.name ?? (loading ? "Loading…" : "Unknown token")}
                    </Text>
                    <Text style={styles.tokenSymbol} numberOfLines={1}>
                      ${overview?.symbol ?? "—"}
                    </Text>
                  </View>
                  <View style={[styles.livePill, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}>
                    <View style={[styles.liveDot, { backgroundColor: accent }]} />
                    <Text style={[styles.liveText, { color: accent }]}>LIVE</Text>
                  </View>
                </View>

                <View style={styles.priceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.priceLabel}>MARKET CAP</Text>
                    <Text style={styles.price}>{fmtUsd(overview?.marketCap)}</Text>
                    <Text style={styles.priceSub}>Price {fmtUsd(overview?.price)}</Text>
                  </View>
                  {change != null ? (
                    <View style={[styles.changePill, { backgroundColor: `${accent}1F`, borderColor: `${accent}55` }]}>
                      {isUp ? (
                        <ArrowUp color={accent} size={11} strokeWidth={3} />
                      ) : (
                        <ArrowDown color={accent} size={11} strokeWidth={3} />
                      )}
                      <Text style={[styles.changeText, { color: accent }]}>
                        {isUp ? "+" : ""}
                        {change.toFixed(2)}%
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.contractRow}>
                  <Hash color={Colors.muted} size={12} strokeWidth={2.6} />
                  <Text style={styles.contractText} numberOfLines={1}>
                    {contract.slice(0, 10)}…{contract.slice(-8)}
                  </Text>
                  <Pressable onPress={onCopy} style={styles.contractAction} hitSlop={6}>
                    <Copy color={Colors.muted} size={12} strokeWidth={2.6} />
                  </Pressable>
                  <Pressable onPress={openExplorer} style={styles.contractAction} hitSlop={6}>
                    <ExternalLink color={Colors.muted} size={12} strokeWidth={2.6} />
                  </Pressable>
                </View>

                <View style={styles.statsGrid}>
                  {stats.map((s) => (
                    <View key={s.label} style={styles.statTile}>
                      <View style={[styles.statTileIcon, { backgroundColor: `${accent}1A` }]}>
                        <s.Icon color={accent} size={12} strokeWidth={2.6} />
                      </View>
                      <Text style={styles.statTileLabel}>{s.label}</Text>
                      <Text style={styles.statTileValue}>{s.value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.sectionHead}>
                <View style={[styles.sectionDot, { backgroundColor: accent }]} />
                <Text style={styles.sectionTitle}>Live chart</Text>
                <View style={styles.intervalRow}>
                  {INTERVALS.map((iv) => {
                    const active = iv.key === interval;
                    return (
                      <Pressable
                        key={iv.key}
                        onPress={() => {
                          setInterval(iv.key);
                          Haptics.selectionAsync().catch(() => {});
                        }}
                        style={[
                          styles.intervalChip,
                          active && { backgroundColor: accent, borderColor: accent },
                        ]}
                      >
                        <Text style={[styles.intervalText, active && { color: Colors.ink }]}>
                          {iv.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <DexChart contract={contract} interval={interval} height={380} />

              <Pressable
                onPress={() => Linking.openURL(`https://dexscreener.com/solana/${contract}`).catch(() => {})}
                style={styles.openExternal}
                testID="open-dexscreener"
              >
                <Text style={[styles.openExternalText, { color: accent }]}>Open on DEXScreener</Text>
                <ArrowUpRight color={accent} size={13} strokeWidth={3} />
              </Pressable>

              <View style={styles.metaRow}>
                <View style={[styles.metaPill]}>
                  <Activity color={Colors.muted} size={11} strokeWidth={2.6} />
                  <Text style={styles.metaText}>Auto-refresh · 20s</Text>
                </View>
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },

  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },

  heroCard: {
    marginTop: 12,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${Colors.cyan}33`,
    backgroundColor: Colors.card,
  },
  heroGrad: { padding: 18 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(3,7,8,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 12,
  },
  heroTag: { fontSize: 13, fontWeight: "800", marginTop: 2 },
  heroDesc: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 8,
  },

  formCard: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    padding: 14,
    gap: 8,
  },
  label: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  inputWithAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.cardSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  inputFlex: { flex: 1 },
  iconAction: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  placeholder: {
    marginTop: 16,
    paddingVertical: 24,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  placeholderText: {
    flex: 1,
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },

  tokenCard: {
    marginTop: 18,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: Colors.card,
    padding: 16,
    overflow: "hidden",
  },
  tokenHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tokenLogo: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: Colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tokenLogoImg: { width: "100%", height: "100%" },
  tokenLogoFallback: { fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
  tokenName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  tokenSymbol: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: 0.6,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },

  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  priceLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  price: {
    color: Colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  priceSub: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    letterSpacing: 0.2,
  },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },

  contractRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contractText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  contractAction: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  statsGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statTile: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.cardSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  statTileIcon: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statTileLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 2,
  },
  statTileValue: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionDot: { width: 7, height: 7, borderRadius: 4 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
    flex: 1,
  },
  intervalRow: {
    flexDirection: "row",
    gap: 4,
  },
  intervalChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.cardSoft,
  },
  intervalText: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  openExternal: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  openExternalText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },

  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "center",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  metaText: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
