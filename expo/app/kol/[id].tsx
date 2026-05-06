import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Coins,
  Copy,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import KOLHoldingCard from "@/components/KOLHoldingCard";
import KOLTransactionCard from "@/components/KOLTransactionCard";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";
import {
  explorerUrlForTx,
  getKOLHoldings,
  getKOLPortfolio,
  getKOLRecentTransactions,
  toggleFollowKOL,
  truncateAddress,
  type KOLHolding,
  type KOLPortfolio,
  type KOLTransaction,
} from "@/lib/api/kol";

const PAGE_SIZE = 25;

export default function KOLProfileScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const kolId = typeof id === "string" ? id : "";

  const portfolioQuery = useQuery({
    queryKey: ["kol", "portfolio", kolId],
    enabled: kolId.length > 0,
    queryFn: () => getKOLPortfolio(kolId),
    staleTime: 20_000,
  });

  const holdingsQuery = useQuery({
    queryKey: ["kol", "holdings", kolId],
    enabled: kolId.length > 0,
    queryFn: () => getKOLHoldings(kolId),
    staleTime: 20_000,
  });

  const txQuery = useInfiniteQuery({
    queryKey: ["kol", "tx", kolId, "ALL"],
    enabled: kolId.length > 0,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getKOLRecentTransactions({
        kolId,
        txType: null,
        limit: PAGE_SIZE,
        before: pageParam,
      }),
    getNextPageParam: (last) =>
      last && last.length >= PAGE_SIZE ? last[last.length - 1]?.occurred_at ?? undefined : undefined,
    staleTime: 15_000,
  });

  const txs: KOLTransaction[] = useMemo(
    () => (txQuery.data?.pages ?? []).flat(),
    [txQuery.data],
  );

  const portfolio: KOLPortfolio | null = portfolioQuery.data ?? null;
  const holdings: KOLHolding[] = useMemo(
    () => [...(holdingsQuery.data ?? [])].sort((a, b) => b.value_usd - a.value_usd),
    [holdingsQuery.data],
  );

  const followMutation = useMutation({
    mutationFn: () => toggleFollowKOL(kolId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["kol", "portfolio", kolId] });
      qc.setQueryData<KOLPortfolio | null>(["kol", "portfolio", kolId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          is_followed: !prev.is_followed,
          follower_count: Math.max(0, prev.follower_count + (prev.is_followed ? -1 : 1)),
        };
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["kol", "portfolio", kolId] });
      qc.invalidateQueries({ queryKey: ["kol", "list"] });
    },
  });

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    portfolioQuery.refetch();
    holdingsQuery.refetch();
    txQuery.refetch();
  }, [portfolioQuery, holdingsQuery, txQuery]);

  const onCopyAddress = useCallback(async () => {
    if (!portfolio?.wallet_address) return;
    try {
      await Clipboard.setStringAsync(portfolio.wallet_address);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.log("[kol] copy failed", e);
    }
  }, [portfolio?.wallet_address]);

  const onOpenWallet = useCallback(() => {
    if (!portfolio?.wallet_address) return;
    const url =
      portfolio.blockchain === "solana"
        ? `https://solscan.io/account/${portfolio.wallet_address}`
        : explorerUrlForTx(portfolio.blockchain, portfolio.wallet_address);
    Linking.openURL(url).catch((e) => console.log("[kol] open url failed", e));
  }, [portfolio]);

  const onEndReached = useCallback(() => {
    if (txQuery.hasNextPage && !txQuery.isFetchingNextPage) txQuery.fetchNextPage();
  }, [txQuery]);

  const loading = portfolioQuery.isLoading && !portfolio;

  return (
    <View style={styles.root} testID="kol-profile-screen">
      <AppBackground variant="market" />
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateBack(router, "/kol-scan")}
            style={styles.iconBtn}
            hitSlop={8}
            testID="kol-profile-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.8} />
          </Pressable>
          <View style={styles.headerMid}>
            <Text style={styles.eyebrow}>KOL PROFILE</Text>
            <Text style={styles.title} numberOfLines={1}>
              {portfolio?.name ?? "Loading…"}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={Colors.mint} />
            <Text style={styles.loaderText}>Loading wallet…</Text>
          </View>
        ) : (
          <FlatList
            data={txs}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => <KOLTransactionCard tx={item} />}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={portfolioQuery.isRefetching || txQuery.isRefetching}
                onRefresh={onRefresh}
                tintColor={Colors.mint}
                colors={[Colors.mint]}
              />
            }
            ListHeaderComponent={
              <View style={{ gap: 14 }}>
                {portfolio ? (
                  <ProfileHeader
                    portfolio={portfolio}
                    onCopy={onCopyAddress}
                    onOpenWallet={onOpenWallet}
                    onToggleFollow={() => followMutation.mutate()}
                    busy={followMutation.isPending}
                  />
                ) : null}
                {portfolio ? <PortfolioSummary portfolio={portfolio} /> : null}
                <HoldingsSection holdings={holdings} loading={holdingsQuery.isLoading} />
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent activity</Text>
                  <Text style={styles.sectionSub}>{txs.length} txs</Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              txQuery.isLoading ? (
                <View style={styles.empty}>
                  <ActivityIndicator color={Colors.mint} />
                </View>
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No transactions yet</Text>
                  <Text style={styles.emptyBody}>
                    When this wallet trades on-chain, every buy, sell and swap will land here.
                  </Text>
                </View>
              )
            }
            ListFooterComponent={
              txQuery.isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={Colors.mint} />
                </View>
              ) : null
            }
            onEndReachedThreshold={0.5}
            onEndReached={onEndReached}
            testID="kol-profile-tx-list"
          />
        )}
      </SafeAreaView>
    </View>
  );
}

interface ProfileHeaderProps {
  portfolio: KOLPortfolio;
  onCopy: () => void;
  onOpenWallet: () => void;
  onToggleFollow: () => void;
  busy: boolean;
}

function ProfileHeader({ portfolio, onCopy, onOpenWallet, onToggleFollow, busy }: ProfileHeaderProps) {
  const handle = portfolio.x_handle
    ? `@${portfolio.x_handle.replace(/^@/, "")}`
    : `@${portfolio.name.toLowerCase().replace(/\s+/g, "")}`;
  return (
    <View style={styles.profileCard}>
      <View style={styles.profileTop}>
        {portfolio.avatar_url ? (
          <ExpoImage source={{ uri: portfolio.avatar_url }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{(portfolio.name?.[0] ?? "K").toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.profileIdentity}>
          <View style={styles.nameRow}>
            <Text style={styles.profileName} numberOfLines={1}>
              {portfolio.name}
            </Text>
            {portfolio.verified ? (
              <BadgeCheck color={Colors.mint} size={16} strokeWidth={2.6} fill="rgba(216,183,90,0.2)" />
            ) : null}
          </View>
          <Text style={styles.profileHandle} numberOfLines={1}>
            {handle}
          </Text>
          <View style={styles.followerRow}>
            <Users color={Colors.muted} size={11} strokeWidth={3} />
            <Text style={styles.followerText}>{fmtNum(portfolio.follower_count)} followers</Text>
          </View>
        </View>
        <Pressable
          onPress={onToggleFollow}
          disabled={busy}
          style={[
            styles.followBtn,
            portfolio.is_followed ? styles.followBtnActive : null,
            busy && { opacity: 0.6 },
          ]}
          testID="kol-profile-follow"
        >
          {portfolio.is_followed ? (
            <UserMinus color={Colors.ink} size={13} strokeWidth={3} />
          ) : (
            <UserPlus color={Colors.ink} size={13} strokeWidth={3} />
          )}
          <Text style={styles.followText}>{portfolio.is_followed ? "Following" : "Follow"}</Text>
        </Pressable>
      </View>

      {portfolio.bio ? <Text style={styles.bio}>{portfolio.bio}</Text> : null}

      <View style={styles.walletRow}>
        <Wallet color={Colors.mint} size={13} strokeWidth={2.8} />
        <Text style={styles.walletAddr} numberOfLines={1}>
          {truncateAddress(portfolio.wallet_address, 6, 6)}
        </Text>
        <Pressable onPress={onCopy} hitSlop={8} style={styles.walletAction} testID="kol-profile-copy">
          <Copy color={Colors.muted} size={13} strokeWidth={2.6} />
        </Pressable>
        <Pressable onPress={onOpenWallet} hitSlop={8} style={styles.walletAction} testID="kol-profile-open">
          <ExternalLink color={Colors.muted} size={13} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  );
}

function PortfolioSummary({ portfolio }: { portfolio: KOLPortfolio }) {
  const positive = portfolio.total_pnl_usd >= 0;
  const PnlIcon = positive ? TrendingUp : TrendingDown;
  const pnlColor = positive ? Colors.mint : Colors.rose;

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>Portfolio value</Text>
      <Text style={styles.summaryValue}>{fmtUsd(portfolio.total_value_usd)}</Text>
      <View style={styles.pnlRow}>
        <View style={[styles.pnlChip, { backgroundColor: `${pnlColor}1F`, borderColor: `${pnlColor}55` }]}>
          <PnlIcon color={pnlColor} size={12} strokeWidth={3} />
          <Text style={[styles.pnlText, { color: pnlColor }]}>
            {fmtUsd(portfolio.total_pnl_usd)} ({fmtPct(portfolio.total_pnl_pct, 2)})
          </Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryItem Icon={Coins} color={Colors.cyan} label="Tokens" value={fmtNum(portfolio.token_count)} />
        <SummaryItem
          Icon={Trophy}
          color={Colors.orange}
          label="Win rate"
          value={fmtPct(portfolio.win_rate, 1)}
        />
        <SummaryItem
          Icon={TrendingUp}
          color={Colors.mint}
          label="Top"
          value={portfolio.top_holding_symbol ?? "—"}
        />
        <SummaryItem Icon={Wallet} color={Colors.cyan} label="Trades" value={fmtNum(portfolio.tx_count)} />
      </View>
    </View>
  );
}

interface SummaryItemProps {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  color: string;
  label: string;
  value: string;
}

function SummaryItem({ Icon, color, label, value }: SummaryItemProps) {
  return (
    <View style={styles.summaryItem}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}1A`, borderColor: `${color}55` }]}>
        <Icon color={color} size={12} strokeWidth={3} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function HoldingsSection({ holdings, loading }: { holdings: KOLHolding[]; loading: boolean }) {
  return (
    <View style={styles.holdingsCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Holdings</Text>
        <Text style={styles.sectionSub}>{holdings.length} tokens</Text>
      </View>
      {loading && holdings.length === 0 ? (
        <View style={styles.holdingsLoading}>
          <ActivityIndicator color={Colors.mint} />
        </View>
      ) : holdings.length === 0 ? (
        <Text style={styles.emptyBody}>No tokens detected in this wallet.</Text>
      ) : (
        <>
          <PnlBreakdown holdings={holdings} />
          <View style={styles.holdingsDivider} />
          <View style={{ gap: 4 }}>
            {holdings.map((h) => (
              <KOLHoldingCard key={h.id} holding={h} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function PnlBreakdown({ holdings }: { holdings: KOLHolding[] }) {
  const { winners, losers, winnerValue, loserValue } = useMemo(() => {
    let w = 0;
    let l = 0;
    let wv = 0;
    let lv = 0;
    for (const h of holdings) {
      if (h.pnl_usd >= 0) {
        w += 1;
        wv += Math.max(0, h.value_usd);
      } else {
        l += 1;
        lv += Math.max(0, h.value_usd);
      }
    }
    return { winners: w, losers: l, winnerValue: wv, loserValue: lv };
  }, [holdings]);

  const total = Math.max(1, winnerValue + loserValue);
  const winPct = (winnerValue / total) * 100;
  const losePct = 100 - winPct;

  return (
    <View style={styles.breakdownWrap}>
      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownLabel}>P&L breakdown</Text>
        <Text style={styles.breakdownSub}>
          {winners} up · {losers} down
        </Text>
      </View>
      <View style={styles.breakdownBar}>
        {winPct > 0 ? (
          <View style={[styles.barSegmentWin, { flex: winPct }]} />
        ) : null}
        {losePct > 0 ? (
          <View style={[styles.barSegmentLose, { flex: losePct }]} />
        ) : null}
      </View>
      <View style={styles.breakdownLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.mint }]} />
          <Text style={styles.legendText}>{fmtUsd(winnerValue)} winners</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.rose }]} />
          <Text style={styles.legendText}>{fmtUsd(loserValue)} losers</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerMid: { flex: 1 },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6, marginTop: 2 },
  list: { padding: 16, paddingTop: 8, paddingBottom: 60, gap: 10 },
  loaderWrap: { padding: 40, alignItems: "center", gap: 10 },
  loaderText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

  profileCard: {
    borderRadius: 22,
    backgroundColor: "rgba(12,12,10,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 12,
  },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 54, height: 54, borderRadius: 27 },
  avatarInitial: { color: Colors.ink, fontSize: 20, fontWeight: "900" },
  profileIdentity: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  profileName: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.4, maxWidth: 180 },
  profileHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  followerRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  followerText: { color: Colors.muted2, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  followBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  followBtnActive: { backgroundColor: Colors.cyan },
  followText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  bio: { color: Colors.muted, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.18)",
  },
  walletAddr: { flex: 1, color: Colors.text, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.2 },
  walletAction: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  summaryCard: {
    borderRadius: 22,
    backgroundColor: "rgba(12,12,10,0.94)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.18)",
    padding: 16,
    gap: 8,
  },
  summaryLabel: { color: Colors.muted2, fontSize: 10.5, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  summaryValue: { color: Colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  pnlRow: { flexDirection: "row", marginTop: 2, marginBottom: 6 },
  pnlChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  pnlText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexBasis: "47%",
    flexGrow: 1,
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    color: Colors.muted2,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  itemValue: { color: Colors.text, fontSize: 13.5, fontWeight: "900", marginTop: 1 },

  holdingsCard: {
    borderRadius: 22,
    backgroundColor: "rgba(12,12,10,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 12,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  sectionSub: { color: Colors.muted2, fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },

  holdingsLoading: { padding: 20, alignItems: "center" },
  holdingsDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: 4,
  },
  breakdownWrap: { gap: 8 },
  breakdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  breakdownLabel: {
    color: Colors.muted2,
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  breakdownSub: { color: Colors.muted, fontSize: 11.5, fontWeight: "800" },
  breakdownBar: {
    height: 8,
    flexDirection: "row",
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  barSegmentWin: { backgroundColor: Colors.mint },
  barSegmentLose: { backgroundColor: Colors.rose },
  breakdownLegend: { flexDirection: "row", justifyContent: "space-between" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.muted, fontSize: 11.5, fontWeight: "800" },

  empty: {
    marginTop: 14,
    padding: 22,
    borderRadius: 22,
    backgroundColor: "rgba(16,16,14,0.84)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.16)",
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  footerLoader: { paddingVertical: 18, alignItems: "center" },
});
