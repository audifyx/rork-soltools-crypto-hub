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
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Waves,
  Zap,
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
import AppBackground from "@/components/ui/AppBackground";
import { getTokenOverview, type TokenOverview } from "@/lib/api/birdeye";
import { navigateBack } from "@/lib/navigation";
import { isSolanaAddress, scanCommunityToken, type CommunityTokenCard } from "@/lib/community-token";
import { cleanTokenSearchQuery, extractSolanaAddress } from "@/lib/token-search";
import { fmtNum, fmtPct, fmtPrice, fmtUsd } from "@/utils/format";

const INTERVALS: { key: string; label: string }[] = [
  { key: "5", label: "5m" },
  { key: "15", label: "15m" },
  { key: "60", label: "1h" },
  { key: "240", label: "4h" },
  { key: "1D", label: "1D" },
];

type LookupStat = {
  label: string;
  value: string;
  sub: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  tone: string;
};

function clampPct(value: number): number {
  return Math.max(6, Math.min(100, value));
}

function shortContract(contract: string): string {
  if (contract.length < 18) return contract;
  return `${contract.slice(0, 10)}…${contract.slice(-8)}`;
}

export default function TokenLookupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ address?: string; ca?: string; mint?: string }>();
  const rawInitial =
    typeof params.address === "string"
      ? params.address
      : typeof params.ca === "string"
        ? params.ca
        : typeof params.mint === "string"
          ? params.mint
          : "";
  const initial = extractSolanaAddress(rawInitial) ?? cleanTokenSearchQuery(rawInitial);

  const [input, setInput] = useState<string>(initial);
  const [contract, setContract] = useState<string>(initial);
  const [interval, setInterval] = useState<string>("60");
  const [seenData, setSeenData] = useState<boolean>(false);

  useEffect(() => {
    if (initial && !contract) setContract(initial);
  }, [initial, contract]);

  useEffect(() => {
    setSeenData(false);
  }, [contract]);

  const normalizedContract = contract.trim();
  const enabled = isSolanaAddress(normalizedContract);

  const overviewQ = useQuery<TokenOverview | null>({
    queryKey: ["tokenLookup", "overview", normalizedContract],
    enabled,
    queryFn: async () => {
      try {
        const res = await getTokenOverview(normalizedContract);
        if (res && res.address) return res;
        return null;
      } catch (e) {
        console.log("[token-lookup] overview failed", e);
        return null;
      }
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const scanQ = useQuery<CommunityTokenCard | null>({
    queryKey: ["tokenLookup", "community-scan", normalizedContract],
    enabled,
    queryFn: async () => {
      try {
        return await scanCommunityToken(normalizedContract);
      } catch (e) {
        console.log("[token-lookup] scan failed", e);
        return null;
      }
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if ((overviewQ.data && overviewQ.data.address) || (scanQ.data && scanQ.data.address)) setSeenData(true);
  }, [overviewQ.data, scanQ.data]);

  const onPaste = useCallback(async () => {
    try {
      const txt = await Clipboard.getStringAsync();
      if (txt) {
        setInput(extractSolanaAddress(txt) ?? cleanTokenSearchQuery(txt));
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[token-lookup] paste failed", e);
    }
  }, []);

  const onLookup = useCallback(() => {
    const c = extractSolanaAddress(input) ?? cleanTokenSearchQuery(input);
    if (!isSolanaAddress(c)) {
      Alert.alert("Invalid address", "Paste a full Solana token contract address, including Pump.fun mints ending in pump.");
      return;
    }
    setInput(c);
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

  const openDex = useCallback(() => {
    if (!contract) return;
    Linking.openURL(`https://dexscreener.com/solana/${contract}`).catch(() => {});
  }, [contract]);

  const showTradingComingSoon = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      "Coming soon",
      "Wallet connection, Phantom, Jupiter swaps, buying, and selling are paused until the App Store launch. Token research and charts still work here.",
    );
  }, []);

  const openFullPage = useCallback(() => {
    if (!contract) return;
    router.push({ pathname: "/launch/[id]", params: { id: contract } });
  }, [contract, router]);

  const scan = scanQ.data ?? null;
  const overview = useMemo<TokenOverview | null>(() => {
    const base = overviewQ.data ?? null;
    if (!scan) return base;
    return {
      address: scan.address,
      symbol: scan.symbol || base?.symbol || "TOKEN",
      name: scan.name || base?.name || "Unknown Solana token",
      decimals: scan.decimals ?? base?.decimals ?? 0,
      price: scan.priceUsd ?? base?.price ?? 0,
      priceChange1h: base?.priceChange1h,
      priceChange24h: scan.change24h ?? base?.priceChange24h,
      priceChange7d: base?.priceChange7d,
      liquidity: scan.liquidityUsd ?? base?.liquidity,
      marketCap: scan.marketCapUsd ?? base?.marketCap,
      volume24hUSD: scan.volume24hUsd ?? base?.volume24hUSD,
      holder: scan.holderCount ?? base?.holder,
      rank: base?.rank,
      logoURI: scan.logoUrl ?? base?.logoURI,
    };
  }, [overviewQ.data, scan]);
  const loading = (overviewQ.isFetching || scanQ.isFetching) && !overview && !seenData;
  const errored = !overview && !seenData && !overviewQ.isFetching && !scanQ.isFetching && enabled && overviewQ.isFetched && scanQ.isFetched;
  const change = overview?.priceChange24h;
  const isUp = (change ?? 0) >= 0;
  const accent = isUp ? Colors.mint : Colors.rose;
  const tokenInitials = (overview?.symbol ?? overview?.name ?? "??").slice(0, 2).toUpperCase();
  const liquidityScore = clampPct(((overview?.liquidity ?? 0) / 1_000_000) * 100);
  const holderScore = clampPct(((overview?.holder ?? 0) / 10_000) * 100);
  const momentumScore = clampPct(Math.abs(change ?? 0) * 2.4);
  const confidenceScore = Math.round((liquidityScore + holderScore + Math.min(100, 100 - momentumScore / 2)) / 3);

  const stats = useMemo<LookupStat[]>(() => {
    return [
      {
        label: "Liquidity",
        value: fmtUsd(overview?.liquidity),
        sub: liquidityScore > 60 ? "Deep pool" : liquidityScore > 22 ? "Building" : "Thin pool",
        Icon: Droplets,
        tone: Colors.cyan,
      },
      {
        label: "Holders",
        value: fmtNum(overview?.holder),
        sub: holderScore > 60 ? "Wide base" : holderScore > 20 ? "Growing" : "Early",
        Icon: Users,
        tone: Colors.violet,
      },
      {
        label: "Price",
        value: fmtPrice(overview?.price),
        sub: "Live quote",
        Icon: Coins,
        tone: Colors.orange,
      },
      {
        label: "24h Move",
        value: fmtPct(change, 2),
        sub: isUp ? "Momentum up" : "Cooling off",
        Icon: isUp ? TrendingUp : TrendingDown,
        tone: accent,
      },
    ];
  }, [overview, change, isUp, accent, liquidityScore, holderScore]);

  return (
    <View style={styles.root} testID="token-lookup-screen">
      <AppBackground variant="market" />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.bgOrbA} pointerEvents="none" />
      <View style={styles.bgOrbB} pointerEvents="none" />
      <View style={styles.bgGrid} pointerEvents="none" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerBar}>
            <Pressable onPress={() => navigateBack(router, "/(tabs)/tools")} style={styles.iconBtn} hitSlop={8} testID="lookup-back">
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.headerEyebrow}>SOL TOOLS</Text>
              <Text style={styles.headerTitle}>Token Terminal</Text>
            </View>
            <View style={styles.syncPill}>
              <View style={styles.syncDot} />
              <Text style={styles.syncText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.heroCard}>
            <LinearGradient
              colors={["rgba(255,255,255,0.20)", "rgba(160,160,160,0.10)", "rgba(0,0,0,0.12)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroBeam} pointerEvents="none" />
            <View style={styles.heroTopRow}>
              <View style={styles.heroIconStack}>
                <View style={styles.heroRingOuter} />
                <View style={styles.heroIcon}>
                  <Search color={Colors.cyan} size={25} strokeWidth={2.6} />
                </View>
              </View>
              <View style={styles.heroBadge}>
                <Sparkles color={Colors.orange} size={12} strokeWidth={2.8} />
                <Text style={styles.heroBadgeText}>Market scanner</Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>Paste a mint. Get the whole battlefield.</Text>
            <Text style={styles.heroDesc}>
              Live price action, liquidity depth, holder signal, contract links, and an embedded DEX chart in one premium view.
            </Text>
            <View style={styles.heroSignalRow}>
              <SignalPill Icon={Zap} label="30s refresh" color={Colors.mint} />
              <SignalPill Icon={ShieldCheck} label="Safety cues" color={Colors.cyan} />
              <SignalPill Icon={Waves} label="Chart-ready" color={Colors.neon} />
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.formHeadRow}>
              <Text style={styles.label}>Contract address</Text>
              <Text style={styles.formHint}>{enabled ? "Ready to scan" : "Paste mint"}</Text>
            </View>
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
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed, loading && { opacity: 0.6 }]}
              disabled={loading}
              testID="lookup-run"
            >
              <LinearGradient
                colors={[Colors.cyan, Colors.mint]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {loading ? (
                <Loader2 color={Colors.ink} size={15} strokeWidth={3} />
              ) : (
                <Target color={Colors.ink} size={15} strokeWidth={3} />
              )}
              <Text style={styles.primaryBtnText}>{loading ? "Locking signal…" : "Analyze token"}</Text>
            </Pressable>
          </View>

          {!enabled && !contract ? (
            <View style={styles.placeholder}>
              <View style={styles.placeholderIcon}>
                <Sparkles color={Colors.cyan} size={18} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.placeholderTitle}>Ready for a contract</Text>
                <Text style={styles.placeholderText}>
                  Paste a mint above to unlock the token command center.
                </Text>
              </View>
            </View>
          ) : null}

          {errored ? (
            <View style={[styles.placeholder, { borderColor: `${Colors.rose}44` }]}> 
              <View style={[styles.placeholderIcon, { backgroundColor: `${Colors.rose}14` }]}> 
                <Hash color={Colors.rose} size={17} strokeWidth={2.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.placeholderTitle, { color: Colors.rose }]}>No token data found</Text>
                <Text style={styles.placeholderText}>Double-check the contract or open it directly on Solscan.</Text>
              </View>
            </View>
          ) : null}

          {enabled && (overview || loading) ? (
            <>
              <View style={[styles.tokenCard, { borderColor: `${accent}44` }]}> 
                <LinearGradient
                  colors={[`${accent}28`, "rgba(255,255,255,0.08)", "rgba(0,0,0,0)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.tokenGlow, { backgroundColor: `${accent}1F` }]} pointerEvents="none" />
                <View style={styles.tokenHead}>
                  <View style={[styles.tokenLogoFrame, { borderColor: `${accent}66` }]}> 
                    <View style={[styles.logoHalo, { backgroundColor: `${accent}18` }]} />
                    <View style={styles.tokenLogo}>
                      {overview?.logoURI ? (
                        <Image source={{ uri: overview.logoURI }} style={styles.tokenLogoImg} />
                      ) : (
                        <Text style={[styles.tokenLogoFallback, { color: accent }]}>{tokenInitials}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.tokenIdentity}>
                    <View style={styles.tokenNameRow}>
                      <Text style={styles.tokenName} numberOfLines={1}>
                        {overview?.name ?? (loading ? "Loading token…" : "Unknown token")}
                      </Text>
                      <ShieldCheck color={accent} size={15} strokeWidth={2.8} />
                    </View>
                    <Text style={styles.tokenSymbol} numberOfLines={1}>
                      ${overview?.symbol ?? "—"} · {shortContract(contract)}
                    </Text>
                  </View>
                </View>

                <View style={styles.marketHero}>
                  <View style={styles.marketMain}>
                    <Text style={styles.priceLabel}>Market cap</Text>
                    <Text style={styles.price}>{fmtUsd(overview?.marketCap)}</Text>
                    <Text style={styles.priceSub}>Price {fmtPrice(overview?.price)} · Auto-refreshing</Text>
                  </View>
                  <View style={[styles.changePill, { backgroundColor: `${accent}1F`, borderColor: `${accent}66` }]}> 
                    {isUp ? (
                      <ArrowUp color={accent} size={12} strokeWidth={3.2} />
                    ) : (
                      <ArrowDown color={accent} size={12} strokeWidth={3.2} />
                    )}
                    <Text style={[styles.changeText, { color: accent }]}>{fmtPct(change, 2)}</Text>
                    <Text style={styles.changeLabel}>24H</Text>
                  </View>
                </View>

                <View style={styles.scorePanel}>
                  <View style={styles.scoreTopRow}>
                    <View>
                      <Text style={styles.scoreLabel}>Signal confidence</Text>
                      <Text style={styles.scoreSub}>Liquidity + holders + volatility blend</Text>
                    </View>
                    <Text style={[styles.scoreValue, { color: accent }]}>{confidenceScore}</Text>
                  </View>
                  <View style={styles.scoreTrack}>
                    <View style={[styles.scoreFill, { width: `${confidenceScore}%`, backgroundColor: accent }]} />
                  </View>
                  <View style={styles.microBars}>
                    <MicroBar label="Liq" value={liquidityScore} color={Colors.cyan} />
                    <MicroBar label="Hold" value={holderScore} color={Colors.violet} />
                    <MicroBar label="Move" value={momentumScore} color={accent} />
                  </View>
                </View>

                <View style={styles.contractRow}>
                  <Hash color={Colors.muted} size={12} strokeWidth={2.6} />
                  <Text style={styles.contractText} numberOfLines={1}>{contract}</Text>
                  <Pressable onPress={onCopy} style={styles.contractAction} hitSlop={6}>
                    <Copy color={Colors.text} size={12} strokeWidth={2.6} />
                  </Pressable>
                  <Pressable onPress={openExplorer} style={styles.contractAction} hitSlop={6}>
                    <ExternalLink color={Colors.text} size={12} strokeWidth={2.6} />
                  </Pressable>
                </View>

                <View style={styles.statsGrid}>
                  {stats.map((s) => (
                    <View key={s.label} style={[styles.statTile, { borderColor: `${s.tone}26` }]}> 
                      <View style={[styles.statTileIcon, { backgroundColor: `${s.tone}16` }]}> 
                        <s.Icon color={s.tone} size={13} strokeWidth={2.8} />
                      </View>
                      <Text style={styles.statTileLabel}>{s.label}</Text>
                      <Text style={styles.statTileValue} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
                      <Text style={styles.statTileSub}>{s.sub}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.actionDeck}>
                <QuickAction Icon={Activity} label="Full room" sub="Open premium detail" color={Colors.mint} onPress={openFullPage} />
                <QuickAction Icon={Wallet} label="Jupiter" sub="Coming soon" color={Colors.cyan} onPress={showTradingComingSoon} />
                <QuickAction Icon={ExternalLink} label="DEX" sub="External chart" color={Colors.neon} onPress={openDex} />
              </View>

              <View style={styles.sectionHead}>
                <View style={[styles.sectionDot, { backgroundColor: accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Live chart</Text>
                  <Text style={styles.sectionSub}>DEXScreener embedded terminal</Text>
                </View>
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
                        style={[styles.intervalChip, active && { backgroundColor: accent, borderColor: accent }]}
                      >
                        <Text style={[styles.intervalText, active && { color: Colors.ink }]}>{iv.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.chartShell}>
                <LinearGradient
                  colors={[`${accent}18`, "rgba(255,255,255,0.02)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <DexChart contract={normalizedContract} pairAddress={scan?.pairAddress ?? undefined} interval={interval} height={388} />
              </View>

              <Pressable onPress={openDex} style={({ pressed }) => [styles.openExternal, pressed && styles.primaryPressed]} testID="open-dexscreener">
                <Text style={[styles.openExternalText, { color: accent }]}>Open on DEXScreener</Text>
                <ArrowUpRight color={accent} size={13} strokeWidth={3} />
              </Pressable>

              <View style={styles.metaRowBottom}>
                <View style={styles.metaPill}>
                  <Activity color={Colors.muted} size={11} strokeWidth={2.6} />
                  <Text style={styles.metaText}>Auto-refresh · 30s</Text>
                </View>
                <View style={styles.metaPill}>
                  <ShieldCheck color={Colors.muted} size={11} strokeWidth={2.6} />
                  <Text style={styles.metaText}>On-chain profile</Text>
                </View>
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SignalPill({ Icon, label, color }: { Icon: LookupStat["Icon"]; label: string; color: string }) {
  return (
    <View style={[styles.signalPill, { borderColor: `${color}33` }]}> 
      <Icon color={color} size={11} strokeWidth={2.8} />
      <Text style={styles.signalText}>{label}</Text>
    </View>
  );
}

function MicroBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.microBarItem}>
      <View style={styles.microBarHead}>
        <Text style={styles.microLabel}>{label}</Text>
        <Text style={[styles.microValue, { color }]}>{Math.round(value)}</Text>
      </View>
      <View style={styles.microTrack}>
        <View style={[styles.microFill, { width: `${clampPct(value)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function QuickAction({
  Icon,
  label,
  sub,
  color,
  onPress,
}: {
  Icon: LookupStat["Icon"];
  label: string;
  sub: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.primaryPressed]}> 
      <View style={[styles.quickIcon, { backgroundColor: `${color}16`, borderColor: `${color}33` }]}> 
        <Icon color={color} size={15} strokeWidth={2.8} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 112 },
  bgOrbA: {
    position: "absolute",
    top: -110,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  bgOrbB: {
    position: "absolute",
    top: 170,
    left: -130,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  bgGrid: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 420,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
    backgroundColor: "rgba(255,255,255,0.015)",
  },

  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(10,10,10,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { alignItems: "center" },
  headerEyebrow: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  headerTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, marginTop: 1 },
  syncPill: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.mint },
  syncText: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1 },

  heroCard: {
    marginTop: 14,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: Colors.card,
    padding: 18,
    minHeight: 226,
  },
  heroBeam: {
    position: "absolute",
    width: 260,
    height: 42,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    transform: [{ rotate: "-26deg" }],
    top: 38,
    right: -86,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroIconStack: { width: 68, height: 68, alignItems: "center", justifyContent: "center" },
  heroRingOuter: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    backgroundColor: "rgba(3,7,8,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroBadgeText: { color: Colors.orange, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
  heroTitle: { color: Colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -1.2, lineHeight: 34, marginTop: 16 },
  heroDesc: { color: Colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 20, marginTop: 10 },
  heroSignalRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 16 },
  signalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  signalText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.2 },

  formCard: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(8,8,8,0.88)",
    padding: 14,
    gap: 9,
  },
  formHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  formHint: { color: Colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  inputWithAction: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 13,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  inputFlex: { flex: 1 },
  iconAction: {
    width: 45,
    height: 45,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    overflow: "hidden",
  },
  primaryPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  primaryBtnText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },

  placeholder: {
    marginTop: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(8,8,8,0.84)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  placeholderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  placeholderTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  placeholderText: { color: Colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 2 },

  tokenCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: "rgba(8,8,8,0.90)",
    padding: 16,
    overflow: "hidden",
  },
  tokenGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, top: -72, right: -58 },
  tokenHead: { flexDirection: "row", alignItems: "center", gap: 13 },
  tokenLogoFrame: {
    width: 70,
    height: 70,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoHalo: { position: "absolute", width: 58, height: 58, borderRadius: 21 },
  tokenLogo: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: Colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tokenLogoImg: { width: "100%", height: "100%" },
  tokenLogoFallback: { fontSize: 17, fontWeight: "900", letterSpacing: 0.4 },
  tokenIdentity: { flex: 1 },
  tokenNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tokenName: { color: Colors.text, fontSize: 21, fontWeight: "900", letterSpacing: -0.6, flex: 1 },
  tokenSymbol: { color: Colors.muted, fontSize: 12, fontWeight: "800", marginTop: 4, letterSpacing: 0.4 },

  marketHero: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 18 },
  marketMain: { flex: 1 },
  priceLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginBottom: 2, textTransform: "uppercase" },
  price: { color: Colors.text, fontSize: 38, fontWeight: "900", letterSpacing: -1.4 },
  priceSub: { color: Colors.muted, fontSize: 12, fontWeight: "800", marginTop: 4, letterSpacing: 0.2 },
  changePill: {
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 76,
  },
  changeText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  changeLabel: { color: Colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },

  scorePanel: {
    marginTop: 16,
    padding: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  scoreTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  scoreLabel: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.1 },
  scoreSub: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  scoreValue: { fontSize: 28, fontWeight: "900", letterSpacing: -0.8 },
  scoreTrack: { height: 9, borderRadius: 6, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)", marginTop: 12 },
  scoreFill: { height: "100%", borderRadius: 6 },
  microBars: { flexDirection: "row", gap: 8, marginTop: 12 },
  microBarItem: { flex: 1 },
  microBarHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  microLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  microValue: { fontSize: 10, fontWeight: "900" },
  microTrack: { height: 5, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 5 },
  microFill: { height: "100%", borderRadius: 4 },

  contractRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  contractText: { color: Colors.muted, fontSize: 12, fontWeight: "700", flex: 1 },
  contractAction: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.055)",
    alignItems: "center",
    justifyContent: "center",
  },

  statsGrid: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: 17,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  statTileIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  statTileLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.9, textTransform: "uppercase", marginTop: 8 },
  statTileValue: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.4, marginTop: 2 },
  statTileSub: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },

  actionDeck: { flexDirection: "row", gap: 8, marginTop: 12 },
  quickAction: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(8,8,8,0.84)",
    padding: 11,
    minHeight: 94,
  },
  quickIcon: { width: 31, height: 31, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  quickLabel: { color: Colors.text, fontSize: 12, fontWeight: "900", marginTop: 9, letterSpacing: -0.1 },
  quickSub: { color: Colors.muted, fontSize: 9, fontWeight: "800", marginTop: 2 },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22, marginBottom: 10 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  sectionSub: { color: Colors.muted, fontSize: 10, fontWeight: "800", marginTop: 2 },
  intervalRow: { flexDirection: "row", gap: 4 },
  intervalChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  intervalText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  chartShell: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(10,10,10,0.82)",
    padding: 6,
  },

  openExternal: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(8,8,8,0.84)",
  },
  openExternalText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  metaRowBottom: { marginTop: 10, flexDirection: "row", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(10,10,10,0.82)",
  },
  metaText: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
});
