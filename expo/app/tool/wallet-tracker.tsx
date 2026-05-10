import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  Coins,
  Copy,
  Eye,
  Flame,
  History,
  PieChart,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
  X,
  XCircle,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import {
  fetchWalletPortfolio,
  isValidSolanaAddress,
  type WalletTokenHolding,
  type WalletTransaction,
} from "@/lib/api/wallet";
import { fmtPrice, fmtUsd } from "@/utils/format";

type TabKey = "overview" | "intel" | "holdings" | "activity" | "stats";

type WalletIntel = {
  rank: string;
  trustScore: number;
  riskScore: number;
  convictionScore: number;
  smartMoneyTags: string[];
  behavior: string;
  concentration: string;
  recurringSignal: string;
};

interface SavedWallet {
  address: string;
  label?: string;
  ts: number;
}

const WATCHLIST_KEY = "wallet-tracker.watchlist.v1";
const RECENT_KEY = "wallet-tracker.recent.v1";
const MAX_WATCH = 10;
const MAX_RECENT = 6;

function shorten(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function WalletTrackerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ address?: string }>();
  const initial = typeof params.address === "string" ? params.address : "";

  const [address, setAddress] = useState<string>(initial);
  const [tracked, setTracked] = useState<string>(initial);
  const [tab, setTab] = useState<TabKey>("overview");
  const [watchlist, setWatchlist] = useState<SavedWallet[]>([]);
  const [recent, setRecent] = useState<SavedWallet[]>([]);

  const valid = useMemo<boolean>(
    () => isValidSolanaAddress(address),
    [address],
  );

  const portfolio = useQuery({
    queryKey: ["wallet", "portfolio", tracked] as const,
    queryFn: () => fetchWalletPortfolio(tracked),
    enabled: tracked.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Hydrate watchlist + recent from storage
  useEffect(() => {
    (async () => {
      try {
        const [w, r] = await Promise.all([
          AsyncStorage.getItem(WATCHLIST_KEY),
          AsyncStorage.getItem(RECENT_KEY),
        ]);
        if (w) {
          const parsed = JSON.parse(w) as SavedWallet[];
          if (Array.isArray(parsed)) setWatchlist(parsed);
        }
        if (r) {
          const parsed = JSON.parse(r) as SavedWallet[];
          if (Array.isArray(parsed)) setRecent(parsed);
        }
      } catch (e) {
        console.log("[wallet-tracker] hydrate error", e);
      }
    })();
  }, []);

  const persistWatchlist = useCallback(async (next: SavedWallet[]) => {
    try {
      await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    } catch (e) {
      console.log("[wallet-tracker] persist watchlist", e);
    }
  }, []);

  const persistRecent = useCallback(async (next: SavedWallet[]) => {
    try {
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (e) {
      console.log("[wallet-tracker] persist recent", e);
    }
  }, []);

  const pushRecent = useCallback(
    (addr: string) => {
      setRecent((prev) => {
        const filtered = prev.filter((r) => r.address !== addr);
        const next: SavedWallet[] = [
          { address: addr, ts: Date.now() },
          ...filtered,
        ].slice(0, MAX_RECENT);
        persistRecent(next).catch(() => {});
        return next;
      });
    },
    [persistRecent],
  );

  const onTrack = useCallback(
    (addr?: string) => {
      Haptics.selectionAsync().catch(() => {});
      const target = (addr ?? address).trim();
      if (!isValidSolanaAddress(target)) return;
      setAddress(target);
      setTracked(target);
      setTab("overview");
      pushRecent(target);
    },
    [address, pushRecent],
  );

  const onClear = useCallback(() => {
    setAddress("");
    setTracked("");
  }, []);

  const onPaste = useCallback(async () => {
    try {
      const v = await Clipboard.getStringAsync();
      if (v) {
        setAddress(v.trim());
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[wallet-tracker] paste error", e);
    }
  }, []);

  const onRefresh = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    portfolio.refetch();
  }, [portfolio]);

  const onCopy = useCallback(async () => {
    if (!tracked) return;
    try {
      await Clipboard.setStringAsync(tracked);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (e) {
      console.log("[wallet-tracker] copy error", e);
    }
  }, [tracked]);

  const onShare = useCallback(async () => {
    if (!tracked) return;
    try {
      await Share.share({
        message: `Tracking Solana wallet ${tracked} — https://solscan.io/account/${tracked}`,
      });
    } catch (e) {
      console.log("[wallet-tracker] share error", e);
    }
  }, [tracked]);

  const onOpenSolscan = useCallback(() => {
    if (!tracked) return;
    Linking.openURL(`https://solscan.io/account/${tracked}`).catch(() => {});
  }, [tracked]);

  const onOpenSig = useCallback((sig: string) => {
    Linking.openURL(`https://solscan.io/tx/${sig}`).catch(() => {});
  }, []);

  const isInWatchlist = useMemo<boolean>(
    () => watchlist.some((w) => w.address === tracked),
    [watchlist, tracked],
  );

  const onToggleWatch = useCallback(() => {
    if (!tracked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setWatchlist((prev) => {
      const exists = prev.some((w) => w.address === tracked);
      const next = exists
        ? prev.filter((w) => w.address !== tracked)
        : [{ address: tracked, ts: Date.now() }, ...prev].slice(0, MAX_WATCH);
      persistWatchlist(next).catch(() => {});
      return next;
    });
  }, [tracked, persistWatchlist]);

  const onRemoveWatch = useCallback(
    (addr: string) => {
      Haptics.selectionAsync().catch(() => {});
      setWatchlist((prev) => {
        const next = prev.filter((w) => w.address !== addr);
        persistWatchlist(next).catch(() => {});
        return next;
      });
    },
    [persistWatchlist],
  );

  const onOpenToken = useCallback(
    (mint: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push({ pathname: "/tool/token-lookup", params: { address: mint } });
    },
    [router],
  );

  const data = portfolio.data;
  const holdings: WalletTokenHolding[] = useMemo(() => {
    const tokens = data?.tokens ?? [];
    return tokens.slice().sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  }, [data?.tokens]);
  const txs: WalletTransaction[] = data?.transactions ?? [];
  const sol = data?.balance?.sol ?? 0;
  const usd = data?.balance?.usd ?? 0;
  const stats = data?.stats;
  const solPrice = data?.solPrice ?? 0;

  const allocations = useMemo(() => {
    if (usd <= 0) return [] as { mint: string; symbol: string; pct: number }[];
    return holdings.slice(0, 5).map((h) => ({
      mint: h.mint,
      symbol: h.symbol ?? shorten(h.mint),
      pct: ((h.usdValue ?? 0) / usd) * 100,
    }));
  }, [holdings, usd]);

  const walletIntel = useMemo<WalletIntel>(() => {
    const txCount = stats?.totalTxs ?? 0;
    const successRate = stats?.successRate ?? 0;
    const activeDays = stats?.activeDays ?? 0;
    const topPct = allocations[0]?.pct ?? 0;
    const tokenCount = holdings.length;
    const netWorthScore = Math.min(28, Math.log10(Math.max(usd, 1)) * 7);
    const activityScore = Math.min(24, txCount / 2);
    const diversificationScore = Math.min(18, tokenCount * 2.4);
    const reliabilityScore = Math.min(20, successRate / 5);
    const ageScore = Math.min(10, activeDays / 3);
    const trustScore = Math.round(netWorthScore + activityScore + diversificationScore + reliabilityScore + ageScore);
    const concentrationPenalty = topPct > 75 ? 34 : topPct > 55 ? 22 : topPct > 35 ? 10 : 4;
    const failurePenalty = Math.max(0, 100 - successRate) / 3;
    const riskScore = Math.round(Math.min(98, concentrationPenalty + failurePenalty + (tokenCount <= 1 && usd > 100 ? 18 : 0)));
    const convictionScore = Math.round(Math.max(5, Math.min(99, 100 - riskScore + Math.min(20, activeDays / 2))));
    const tags = [
      usd >= 100_000 ? "WHALE" : usd >= 10_000 ? "SMART WALLET" : "SCOUT",
      tokenCount >= 8 ? "DIVERSIFIED" : tokenCount <= 2 && usd > 0 ? "HIGH CONVICTION" : "FOCUSED",
      txCount >= 40 ? "ACTIVE TRADER" : activeDays >= 14 ? "PATIENT HOLDER" : "FRESH WALLET",
      successRate >= 92 && txCount > 10 ? "CLEAN EXECUTION" : riskScore >= 45 ? "RISK WATCH" : "NORMAL RISK",
    ];
    return {
      rank: trustScore >= 82 ? "S-TIER" : trustScore >= 64 ? "A-TIER" : trustScore >= 42 ? "B-TIER" : "UNRANKED",
      trustScore,
      riskScore,
      convictionScore,
      smartMoneyTags: Array.from(new Set(tags)),
      behavior: txCount >= 40 ? "High-frequency scanner with frequent on-chain touches." : activeDays >= 14 ? "Slower moving wallet with more holder-style behavior." : "Early profile — keep watching for repeatable patterns.",
      concentration: topPct > 55 ? "Top-heavy allocation; one position dominates portfolio risk." : topPct > 30 ? "Moderate concentration with visible lead positions." : "Balanced distribution across tracked holdings.",
      recurringSignal: activeDays >= 7 && txCount >= 15 ? "Recurring wallet detected across multiple active days." : "Not enough history yet for recurring-wallet confirmation.",
    };
  }, [allocations, holdings.length, stats, usd]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/tools")}
            style={styles.backBtn}
            testID="back"
          >
            <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <View style={styles.iconBadge}>
              <Wallet color={Colors.mint} size={14} strokeWidth={2.6} />
            </View>
            <Text style={styles.topTitle}>Wallet Tracker</Text>
          </View>
          <View style={{ width: 40 }}>
            {tracked.length > 0 && (
              <Pressable
                onPress={onToggleWatch}
                style={styles.backBtn}
                testID="watch-toggle"
              >
                <Star
                  color={isInWatchlist ? Colors.orange : Colors.muted}
                  fill={isInWatchlist ? Colors.orange : "transparent"}
                  size={18}
                  strokeWidth={2.6}
                />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["rgba(85,245,178,0.22)", "rgba(56,215,255,0.06)", "rgba(3,7,8,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroLive}>
              <View style={styles.dot} />
              <Text style={styles.heroLiveText}>LIVE • SOLANA RPC</Text>
            </View>
            <Text style={styles.heroTitle}>Track any Solana wallet</Text>
            <Text style={styles.heroSub}>
              Holdings, PnL, fees, on-chain history — streamed in real time.
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
              returnKeyType="search"
              onSubmitEditing={() => onTrack()}
            />
            {address.length > 0 ? (
              <Pressable onPress={onClear} hitSlop={10} testID="clear">
                <X color={Colors.muted} size={16} strokeWidth={2.6} />
              </Pressable>
            ) : (
              <Pressable hitSlop={10} onPress={onPaste} testID="paste">
                <ClipboardPaste color={Colors.mint} size={18} strokeWidth={2.4} />
              </Pressable>
            )}
          </View>

          {address.length > 0 && !valid && (
            <Text style={styles.invalid}>Not a valid Solana address.</Text>
          )}

          <Pressable
            onPress={() => (tracked ? onRefresh() : onTrack())}
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
              {tracked ? "Refresh" : "Scan Wallet"}
            </Text>
          </Pressable>

          {!tracked && (watchlist.length > 0 || recent.length > 0) && (
            <View style={{ marginTop: 22, gap: 18 }}>
              {watchlist.length > 0 && (
                <View>
                  <View style={styles.sectionRow}>
                    <View style={styles.sectionRowLeft}>
                      <Star color={Colors.orange} size={14} strokeWidth={2.8} />
                      <Text style={styles.sectionTitle}>Watchlist</Text>
                    </View>
                    <Text style={styles.sectionRight}>
                      {watchlist.length}
                    </Text>
                  </View>
                  <View style={styles.card}>
                    {watchlist.map((w, i) => (
                      <View
                        key={w.address}
                        style={[
                          styles.watchRow,
                          i !== watchlist.length - 1 && styles.divider,
                        ]}
                      >
                        <Pressable
                          style={styles.watchPress}
                          onPress={() => onTrack(w.address)}
                          testID={`watch-${i}`}
                        >
                          <View style={styles.watchIcon}>
                            <Wallet
                              color={Colors.mint}
                              size={14}
                              strokeWidth={2.8}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.watchAddr}>
                              {shorten(w.address)}
                            </Text>
                            <Text style={styles.watchTime}>
                              Saved {timeAgo(Math.floor(w.ts / 1000))} ago
                            </Text>
                          </View>
                          <ChevronRight
                            color={Colors.muted}
                            size={16}
                            strokeWidth={2.4}
                          />
                        </Pressable>
                        <Pressable
                          hitSlop={10}
                          onPress={() => onRemoveWatch(w.address)}
                          style={styles.watchRemove}
                        >
                          <Trash2
                            color={Colors.rose}
                            size={14}
                            strokeWidth={2.6}
                          />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {recent.length > 0 && (
                <View>
                  <View style={styles.sectionRow}>
                    <View style={styles.sectionRowLeft}>
                      <History color={Colors.cyan} size={14} strokeWidth={2.8} />
                      <Text style={styles.sectionTitle}>Recent scans</Text>
                    </View>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingRight: 8 }}
                  >
                    {recent.map((r) => (
                      <Pressable
                        key={r.address}
                        style={styles.recentChip}
                        onPress={() => onTrack(r.address)}
                      >
                        <Text style={styles.recentChipText}>
                          {shorten(r.address)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {tracked.length > 0 && (
            <>
              {/* Net worth hero */}
              <LinearGradient
                colors={["rgba(85,245,178,0.16)", "rgba(56,215,255,0.06)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.networth}
              >
                <View style={styles.networthHead}>
                  <View style={styles.networthBadge}>
                    <View style={styles.dotSm} />
                    <Text style={styles.networthBadgeText}>NET WORTH</Text>
                  </View>
                  <Pressable
                    onPress={onCopy}
                    style={styles.miniBtn}
                    hitSlop={6}
                    testID="copy-addr"
                  >
                    <Copy color={Colors.muted} size={12} strokeWidth={2.6} />
                    <Text style={styles.miniBtnText}>{shorten(tracked)}</Text>
                  </Pressable>
                </View>
                <Text style={styles.networthValue}>{fmtUsd(usd)}</Text>
                <View style={styles.networthMeta}>
                  <Text style={styles.networthMetaText}>
                    {sol.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    SOL · {fmtUsd(sol * solPrice)}
                  </Text>
                </View>

                {allocations.length > 0 && (
                  <View style={styles.allocBar}>
                    {allocations.map((a, i) => {
                      const palette = [
                        Colors.mint,
                        Colors.cyan,
                        Colors.violet,
                        Colors.orange,
                        Colors.rose,
                      ];
                      return (
                        <View
                          key={a.mint}
                          style={[
                            styles.allocSeg,
                            {
                              flexGrow: a.pct,
                              backgroundColor: palette[i % palette.length],
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                )}

                <View style={styles.networthActions}>
                  <ActionBtn
                    icon={<Share2 color={Colors.text} size={13} strokeWidth={2.6} />}
                    label="Share"
                    onPress={onShare}
                  />
                  <ActionBtn
                    icon={
                      <ArrowUpRight
                        color={Colors.text}
                        size={13}
                        strokeWidth={2.6}
                      />
                    }
                    label="Solscan"
                    onPress={onOpenSolscan}
                  />
                  <ActionBtn
                    icon={
                      <Star
                        color={isInWatchlist ? Colors.orange : Colors.text}
                        fill={isInWatchlist ? Colors.orange : "transparent"}
                        size={13}
                        strokeWidth={2.6}
                      />
                    }
                    label={isInWatchlist ? "Saved" : "Save"}
                    onPress={onToggleWatch}
                  />
                </View>
              </LinearGradient>

              {/* Tabs */}
              <View style={styles.tabsRow}>
                <TabBtn
                  active={tab === "overview"}
                  onPress={() => setTab("overview")}
                  icon={<Eye size={13} strokeWidth={2.8} />}
                  label="Overview"
                />
                <TabBtn
                  active={tab === "intel"}
                  onPress={() => setTab("intel")}
                  icon={<ShieldAlert size={13} strokeWidth={2.8} />}
                  label="Intel"
                />
                <TabBtn
                  active={tab === "holdings"}
                  onPress={() => setTab("holdings")}
                  icon={<Coins size={13} strokeWidth={2.8} />}
                  label="Holdings"
                  badge={holdings.length.toString()}
                />
                <TabBtn
                  active={tab === "activity"}
                  onPress={() => setTab("activity")}
                  icon={<Activity size={13} strokeWidth={2.8} />}
                  label="Activity"
                />
                <TabBtn
                  active={tab === "stats"}
                  onPress={() => setTab("stats")}
                  icon={<BarChart3 size={13} strokeWidth={2.8} />}
                  label="Stats"
                />
              </View>

              {portfolio.isLoading ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={Colors.mint} />
                  <Text style={styles.loadingText}>
                    Scanning blockchain…
                  </Text>
                </View>
              ) : (
                <>
                  {tab === "overview" && (
                    <OverviewTab
                      holdings={holdings}
                      txs={txs}
                      stats={stats}
                      sol={sol}
                      solPrice={solPrice}
                      onOpenToken={onOpenToken}
                      onOpenSig={onOpenSig}
                    />
                  )}
                  {tab === "intel" && (
                    <WalletIntelTab intel={walletIntel} topHolding={holdings[0]} totalUsd={usd} />
                  )}
                  {tab === "holdings" && (
                    <HoldingsTab
                      holdings={holdings}
                      totalUsd={usd}
                      onOpenToken={onOpenToken}
                    />
                  )}
                  {tab === "activity" && (
                    <ActivityTab txs={txs} onOpenSig={onOpenSig} />
                  )}
                  {tab === "stats" && (
                    <StatsTab stats={stats} solPrice={solPrice} />
                  )}
                </>
              )}
            </>
          )}

          {!tracked && watchlist.length === 0 && recent.length === 0 && (
            <View style={styles.placeholder}>
              <View style={styles.placeholderIcon}>
                <Eye color={Colors.mint} size={28} strokeWidth={2.4} />
              </View>
              <Text style={styles.placeholderTitle}>
                No wallet tracked yet
              </Text>
              <Text style={styles.placeholderBody}>
                Paste any Solana address to instantly see holdings, balances,
                fees paid, success rate and full on-chain history.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtn}>
      {icon}
      <Text style={styles.actionBtnText}>{label}</Text>
    </Pressable>
  );
}

function TabBtn({
  active,
  onPress,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onPress: () => void;
  icon: React.ReactElement<{ color?: string }>;
  label: string;
  badge?: string;
}) {
  const color = active ? Colors.ink : Colors.muted;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
    >
      {React.cloneElement(icon, { color })}
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
        {label}
      </Text>
      {badge && (
        <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
          <Text
            style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}
          >
            {badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function OverviewTab({
  holdings,
  txs,
  stats,
  sol,
  solPrice,
  onOpenToken,
  onOpenSig,
}: {
  holdings: WalletTokenHolding[];
  txs: WalletTransaction[];
  stats?: ReturnType<() => unknown> & {
    successRate: number;
    totalFeesSol: number;
    totalFeesUsd: number;
    totalTxs: number;
    activeDays: number;
  };
  sol: number;
  solPrice: number;
  onOpenToken: (mint: string) => void;
  onOpenSig: (sig: string) => void;
}) {
  const top = holdings.slice(0, 4);
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.statsRow}>
        <StatCard
          label="Tokens"
          value={`${holdings.length}`}
          tone="mint"
          icon={<Coins size={11} strokeWidth={2.8} color={Colors.mint} />}
        />
        <StatCard
          label="Activity"
          value={`${stats?.totalTxs ?? 0}`}
          tone="cyan"
          icon={<Activity size={11} strokeWidth={2.8} color={Colors.cyan} />}
        />
        <StatCard
          label="Success"
          value={`${(stats?.successRate ?? 0).toFixed(0)}%`}
          tone="violet"
          icon={
            <CheckCircle2 size={11} strokeWidth={2.8} color={Colors.violet} />
          }
        />
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Fees Paid"
          value={`${(stats?.totalFeesSol ?? 0).toFixed(5)} SOL`}
          sub={fmtUsd(stats?.totalFeesUsd ?? 0)}
          tone="orange"
          icon={<Flame size={11} strokeWidth={2.8} color={Colors.orange} />}
        />
        <StatCard
          label="Active Days"
          value={`${stats?.activeDays ?? 0}d`}
          tone="cyan"
          icon={<History size={11} strokeWidth={2.8} color={Colors.cyan} />}
        />
      </View>

      {top.length > 0 && (
        <View>
          <View style={styles.sectionRow}>
            <View style={styles.sectionRowLeft}>
              <PieChart color={Colors.mint} size={14} strokeWidth={2.8} />
              <Text style={styles.sectionTitle}>Top holdings</Text>
            </View>
          </View>
          <View style={styles.card}>
            {top.map((h, i) => (
              <HoldingRow
                key={h.mint}
                holding={h}
                divider={i !== top.length - 1}
                onPress={() => onOpenToken(h.mint)}
              />
            ))}
          </View>
        </View>
      )}

      {txs.length > 0 && (
        <View>
          <View style={styles.sectionRow}>
            <View style={styles.sectionRowLeft}>
              <Activity color={Colors.cyan} size={14} strokeWidth={2.8} />
              <Text style={styles.sectionTitle}>Recent activity</Text>
            </View>
            <Text style={styles.sectionRight}>Live</Text>
          </View>
          <View style={styles.card}>
            {txs.slice(0, 5).map((t, i) => (
              <ActivityRow
                key={t.signature}
                tx={t}
                divider={i !== Math.min(txs.length, 5) - 1}
                onPress={() => onOpenSig(t.signature)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function WalletIntelTab({
  intel,
  topHolding,
  totalUsd,
}: {
  intel: WalletIntel;
  topHolding?: WalletTokenHolding;
  totalUsd: number;
}) {
  return (
    <View style={{ gap: 14 }}>
      <LinearGradient
        colors={["rgba(85,245,178,0.15)", "rgba(255,196,87,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.intelHero}
      >
        <View style={styles.intelHeroTop}>
          <View>
            <Text style={styles.intelEyebrow}>SMART MONEY RANK</Text>
            <Text style={styles.intelRank}>{intel.rank}</Text>
          </View>
          <View style={styles.intelScoreRing}>
            <Text style={styles.intelScore}>{intel.trustScore}</Text>
          </View>
        </View>
        <Text style={styles.intelBody}>{intel.behavior}</Text>
        <View style={styles.tagWrap}>
          {intel.smartMoneyTags.map((tag) => (
            <View key={tag} style={styles.intelTag}>
              <Text style={styles.intelTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.statsRow}>
        <StatCard label="Trust" value={`${intel.trustScore}/100`} tone="mint" icon={<ShieldAlert size={11} strokeWidth={2.8} color={Colors.mint} />} />
        <StatCard label="Risk" value={`${intel.riskScore}/100`} tone={intel.riskScore > 50 ? "rose" : "orange"} icon={<AlertTriangle size={11} strokeWidth={2.8} color={intel.riskScore > 50 ? Colors.rose : Colors.orange} />} />
        <StatCard label="Conviction" value={`${intel.convictionScore}%`} tone="cyan" icon={<Target size={11} strokeWidth={2.8} color={Colors.cyan} />} />
      </View>

      <View style={styles.cardPad}>
        <IntelLine label="Portfolio" value={fmtUsd(totalUsd)} detail={topHolding ? `Top holding: ${topHolding.symbol ?? shorten(topHolding.mint)}` : "No SPL holdings detected yet."} />
        <IntelLine label="Concentration" value={intel.concentration} />
        <IntelLine label="Recurring detection" value={intel.recurringSignal} />
      </View>
    </View>
  );
}

function IntelLine({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.intelLine}>
      <Text style={styles.intelLineLabel}>{label}</Text>
      <Text style={styles.intelLineValue}>{value}</Text>
      {detail ? <Text style={styles.intelLineDetail}>{detail}</Text> : null}
    </View>
  );
}

function HoldingsTab({
  holdings,
  totalUsd,
  onOpenToken,
}: {
  holdings: WalletTokenHolding[];
  totalUsd: number;
  onOpenToken: (mint: string) => void;
}) {
  if (holdings.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No tokens detected.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      {holdings.map((h, i) => {
        const pct =
          totalUsd > 0 && h.usdValue ? (h.usdValue / totalUsd) * 100 : 0;
        return (
          <HoldingRow
            key={h.mint}
            holding={h}
            divider={i !== holdings.length - 1}
            allocPct={pct}
            onPress={() => onOpenToken(h.mint)}
          />
        );
      })}
    </View>
  );
}

function ActivityTab({
  txs,
  onOpenSig,
}: {
  txs: WalletTransaction[];
  onOpenSig: (sig: string) => void;
}) {
  if (txs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No recent transactions.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      {txs.map((t, i) => (
        <ActivityRow
          key={t.signature}
          tx={t}
          divider={i !== txs.length - 1}
          onPress={() => onOpenSig(t.signature)}
        />
      ))}
    </View>
  );
}

function StatsTab({
  stats,
  solPrice,
}: {
  stats?: {
    totalTxs: number;
    successCount: number;
    failedCount: number;
    successRate: number;
    totalFeesSol: number;
    totalFeesUsd: number;
    firstSeen: number;
    lastSeen: number;
    activeDays: number;
    avgTxPerDay: number;
  };
  solPrice: number;
}) {
  if (!stats) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No stats yet.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.bigStat}>
        <View style={styles.bigStatHead}>
          <View
            style={[
              styles.bigStatIcon,
              { backgroundColor: "rgba(85,245,178,0.14)" },
            ]}
          >
            <CheckCircle2 size={16} color={Colors.mint} strokeWidth={2.6} />
          </View>
          <Text style={styles.bigStatLabel}>Success rate</Text>
        </View>
        <Text style={[styles.bigStatValue, { color: Colors.mint }]}>
          {stats.successRate.toFixed(1)}%
        </Text>
        <View style={styles.successBar}>
          <View
            style={[
              styles.successFill,
              { flexGrow: Math.max(0.001, stats.successRate) },
            ]}
          />
          <View
            style={[
              styles.successRest,
              {
                flexGrow: Math.max(0.001, 100 - stats.successRate),
              },
            ]}
          />
        </View>
        <View style={styles.successLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.mint }]} />
            <Text style={styles.legendText}>
              {stats.successCount} wins
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.rose }]} />
            <Text style={styles.legendText}>
              {stats.failedCount} failed
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Total TX"
          value={stats.totalTxs.toString()}
          tone="cyan"
          icon={<Activity size={11} strokeWidth={2.8} color={Colors.cyan} />}
        />
        <StatCard
          label="Wins"
          value={stats.successCount.toString()}
          tone="mint"
          icon={
            <CheckCircle2 size={11} strokeWidth={2.8} color={Colors.mint} />
          }
        />
        <StatCard
          label="Losses"
          value={stats.failedCount.toString()}
          tone="rose"
          icon={<XCircle size={11} strokeWidth={2.8} color={Colors.rose} />}
        />
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Fees Paid"
          value={`${stats.totalFeesSol.toFixed(5)} SOL`}
          sub={fmtUsd(stats.totalFeesUsd)}
          tone="orange"
          icon={<Flame size={11} strokeWidth={2.8} color={Colors.orange} />}
        />
        <StatCard
          label="Avg TX/day"
          value={stats.avgTxPerDay.toFixed(1)}
          tone="violet"
          icon={
            <TrendingUp size={11} strokeWidth={2.8} color={Colors.violet} />
          }
        />
      </View>

      <View style={styles.timeline}>
        <View style={styles.timelineRow}>
          <Text style={styles.timelineLabel}>FIRST SEEN</Text>
          <Text style={styles.timelineValue}>{formatDate(stats.firstSeen)}</Text>
        </View>
        <View style={styles.timelineRow}>
          <Text style={styles.timelineLabel}>LAST SEEN</Text>
          <Text style={styles.timelineValue}>{formatDate(stats.lastSeen)}</Text>
        </View>
        <View style={styles.timelineRow}>
          <Text style={styles.timelineLabel}>ACTIVE FOR</Text>
          <Text style={styles.timelineValue}>{stats.activeDays} days</Text>
        </View>
        <View style={styles.timelineRow}>
          <Text style={styles.timelineLabel}>SOL PRICE</Text>
          <Text style={styles.timelineValue}>{fmtPrice(solPrice)}</Text>
        </View>
      </View>
    </View>
  );
}

function HoldingRow({
  holding,
  divider,
  allocPct,
  onPress,
}: {
  holding: WalletTokenHolding;
  divider: boolean;
  allocPct?: number;
  onPress: () => void;
}) {
  const sym = holding.symbol ?? shorten(holding.mint);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.holdingRow, divider && styles.divider]}
      testID={`holding-${holding.mint}`}
    >
      {holding.logo ? (
        <Image source={{ uri: holding.logo }} style={styles.tokenLogo} />
      ) : (
        <View style={styles.tokenIcon}>
          <Text style={styles.tokenIconText}>
            {sym.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.holdingTopLine}>
          <Text style={styles.holdingSym} numberOfLines={1}>
            {sym}
          </Text>
          {allocPct !== undefined && allocPct > 0 && (
            <View style={styles.allocChip}>
              <Text style={styles.allocChipText}>{allocPct.toFixed(1)}%</Text>
            </View>
          )}
        </View>
        <Text style={styles.holdingName} numberOfLines={1}>
          {formatAmount(holding.uiAmount)} {sym}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.holdingValue}>
          {holding.usdValue && holding.usdValue > 0
            ? fmtUsd(holding.usdValue)
            : "—"}
        </Text>
        <View style={styles.openHint}>
          <Text style={styles.openHintText}>Chart</Text>
          <ChevronRight color={Colors.mint} size={11} strokeWidth={3} />
        </View>
      </View>
    </Pressable>
  );
}

function ActivityRow({
  tx,
  divider,
  onPress,
}: {
  tx: WalletTransaction;
  divider: boolean;
  onPress: () => void;
}) {
  const failed = tx.status === "failed";
  return (
    <Pressable
      onPress={onPress}
      style={[styles.activityRow, divider && styles.divider]}
      testID={`tx-${tx.signature}`}
    >
      <View
        style={[
          styles.activityBadge,
          {
            backgroundColor: failed
              ? "rgba(255,93,143,0.16)"
              : "rgba(85,245,178,0.16)",
            borderColor: failed
              ? "rgba(255,93,143,0.4)"
              : "rgba(85,245,178,0.4)",
          },
        ]}
      >
        <Text
          style={[
            styles.activityBadgeText,
            { color: failed ? Colors.rose : Colors.mint },
          ]}
        >
          {failed ? "FAIL" : "TX"}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityToken}>{shorten(tx.signature)}</Text>
        <Text style={styles.activityTime}>
          {timeAgo(tx.blockTime)} ago
          {tx.fee && tx.fee > 0
            ? ` · ${tx.fee.toFixed(6)} SOL fee`
            : ""}
        </Text>
      </View>
      <ArrowUpRight color={Colors.muted} size={14} strokeWidth={2.6} />
    </Pressable>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "mint" | "cyan" | "violet" | "orange" | "rose";
  icon?: React.ReactNode;
}) {
  const palette: Record<typeof tone, string> = {
    mint: Colors.mint,
    cyan: Colors.cyan,
    violet: Colors.violet,
    orange: Colors.orange,
    rose: Colors.rose,
  };
  const color = palette[tone];
  return (
    <View style={[styles.statCard, { borderColor: `${color}33` }]}>
      <View style={styles.statCardHead}>
        {icon}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },

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
    overflow: "hidden",
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
  dotSm: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.mint },
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
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
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
  invalid: {
    color: Colors.rose,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    marginLeft: 4,
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
  trackBtnDisabled: { opacity: 0.4 },
  trackText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  // Net worth card
  networth: {
    marginTop: 22,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
    overflow: "hidden",
  },
  networthHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  networthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.5)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.35)",
  },
  networthBadgeText: {
    color: Colors.mint,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.45)",
    borderWidth: 1,
    borderColor: Colors.line,
  },
  miniBtnText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  networthValue: {
    color: Colors.text,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.5,
    marginTop: 14,
  },
  networthMeta: { marginTop: 4 },
  networthMetaText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  allocBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  allocSeg: { height: 6 },
  networthActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(3,7,8,0.45)",
    borderWidth: 1,
    borderColor: Colors.line,
  },
  actionBtnText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  // Tabs
  tabsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 18,
    padding: 4,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: Colors.mint },
  tabBtnText: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  tabBtnTextActive: { color: Colors.ink },
  tabBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    minWidth: 18,
    alignItems: "center",
  },
  tabBadgeActive: { backgroundColor: "rgba(3,7,8,0.25)" },
  tabBadgeText: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
  },
  tabBadgeTextActive: { color: Colors.ink },

  // Section
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 10,
  },
  sectionRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
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

  // Stats grid
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: Colors.card,
  },
  statCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  statValue: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statSub: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  cardPad: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    overflow: "hidden",
    paddingHorizontal: 16,
  },
  intelHero: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
  },
  intelHeroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  intelEyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  intelRank: { color: Colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -1, marginTop: 4 },
  intelScoreRing: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,7,8,0.55)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.42)",
  },
  intelScore: { color: Colors.mint, fontSize: 20, fontWeight: "900" },
  intelBody: { color: Colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 19, marginTop: 12 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  intelTag: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.28)",
  },
  intelTagText: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  intelLine: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.line },
  intelLineLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  intelLineValue: { color: Colors.text, fontSize: 13, fontWeight: "800", lineHeight: 18, marginTop: 5 },
  intelLineDetail: { color: Colors.mint, fontSize: 11, fontWeight: "800", marginTop: 4 },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.line },

  // Holding row
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  tokenLogo: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.line,
  },
  tokenIconText: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  holdingTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  holdingSym: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 1,
  },
  holdingName: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  holdingValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  allocChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
  },
  allocChipText: {
    color: Colors.mint,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  openHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 3,
  },
  openHintText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  // Activity
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
  activityTime: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  // Watch + recent
  watchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  watchPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  watchIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
  },
  watchAddr: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  watchTime: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  watchRemove: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  recentChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  recentChipText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  // Big stat (success rate)
  bigStat: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  bigStatHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  bigStatIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  bigStatLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  bigStatValue: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.4,
    marginTop: 8,
  },
  successBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  successFill: { backgroundColor: Colors.mint, height: 8 },
  successRest: { backgroundColor: Colors.rose, height: 8, opacity: 0.6 },
  successLegend: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.text, fontSize: 12, fontWeight: "800" },

  timeline: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    gap: 12,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timelineLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  timelineValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
  },

  loading: {
    paddingVertical: 50,
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  loadingText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  empty: {
    paddingVertical: 32,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.line,
    marginTop: 14,
  },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

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
