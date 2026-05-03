import { LinearGradient } from "expo-linear-gradient";
import {
  Activity,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQueries } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { fetchWalletPortfolio, type WalletTokenHolding } from "@/lib/api/wallet";
import { useApp } from "@/providers/app-provider";

const PALETTE = [Colors.mint, Colors.cyan, Colors.orange, Colors.violet, Colors.rose];

interface Allocation {
  label: string;
  color: string;
  pct: number;
  usd: number;
}

export default function PortfolioCard() {
  const { wallets, profile } = useApp();
  const [hidden, setHidden] = useState<boolean>(false);

  const addresses = useMemo<string[]>(() => {
    const set = new Set<string>();
    if (profile.walletAddress) set.add(profile.walletAddress);
    wallets.forEach((w) => {
      if (w.address) set.add(w.address);
    });
    return Array.from(set);
  }, [profile.walletAddress, wallets]);

  const portfolios = useQueries({
    queries: addresses.map((address) => ({
      queryKey: ["profile", "portfolio", address] as const,
      queryFn: () => fetchWalletPortfolio(address),
      staleTime: 60_000,
      refetchInterval: 90_000,
    })),
  });

  const isLoading = portfolios.some((q) => q.isLoading);
  const isFetching = portfolios.some((q) => q.isFetching);

  const refetchAll = useCallback(() => {
    portfolios.forEach((q) => q.refetch());
  }, [portfolios]);

  const aggregate = useMemo(() => {
    let solTotal = 0;
    let usdTotal = 0;
    const tokenMap = new Map<string, WalletTokenHolding>();
    portfolios.forEach((q) => {
      const data = q.data;
      if (!data) return;
      solTotal += Number(data.balance?.sol ?? 0);
      usdTotal += Number(data.balance?.usd ?? 0);
      (data.tokens ?? []).forEach((t) => {
        const key = t.mint;
        const existing = tokenMap.get(key);
        if (existing) {
          existing.uiAmount = (existing.uiAmount ?? 0) + (t.uiAmount ?? 0);
          existing.usdValue = (existing.usdValue ?? 0) + (t.usdValue ?? 0);
        } else {
          tokenMap.set(key, { ...t });
        }
      });
    });
    const tokens = Array.from(tokenMap.values()).sort(
      (a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0),
    );
    return { solTotal, usdTotal, tokens };
  }, [portfolios]);

  const allocations = useMemo<Allocation[]>(() => {
    const total = aggregate.usdTotal;
    if (total <= 0) return [];
    const top = aggregate.tokens.slice(0, 4);
    const topSum = top.reduce((s, t) => s + (t.usdValue ?? 0), 0);
    const out: Allocation[] = top.map((t, i) => ({
      label: (t.symbol ?? t.mint.slice(0, 4)).toUpperCase(),
      color: PALETTE[i % PALETTE.length],
      pct: Math.round(((t.usdValue ?? 0) / total) * 100),
      usd: t.usdValue ?? 0,
    }));
    const rest = total - topSum;
    if (rest > total * 0.01) {
      out.push({
        label: "OTHER",
        color: PALETTE[4],
        pct: Math.max(0, 100 - out.reduce((s, a) => s + a.pct, 0)),
        usd: rest,
      });
    }
    return out;
  }, [aggregate]);

  const positive = profile.pnlPct >= 0;
  const accent = positive ? Colors.mint : Colors.rose;

  const balanceText = hidden
    ? "•••••••"
    : `$${aggregate.usdTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const solText = hidden
    ? "•••"
    : `${aggregate.solTotal.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;

  const hasWallets = addresses.length > 0;

  return (
    <View style={styles.wrap} testID="portfolio-card">
      <LinearGradient
        colors={[`${accent}1A`, "rgba(0,0,0,0)", `${accent}10`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGrad}
      />

      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.iconBox, { backgroundColor: `${accent}1F` }]}>
            <Wallet color={accent} size={14} strokeWidth={2.6} />
          </View>
          <View>
            <Text style={styles.eyebrow}>PORTFOLIO · LIVE</Text>
            <Text style={styles.balance}>{balanceText}</Text>
            <Text style={styles.subBalance}>{solText} · {addresses.length} wallet{addresses.length === 1 ? "" : "s"}</Text>
          </View>
        </View>
        <View style={styles.headRight}>
          <Pressable onPress={refetchAll} hitSlop={8} style={styles.eyeBtn} disabled={isFetching} testID="pf-refresh">
            {isFetching ? (
              <ActivityIndicator size="small" color={Colors.muted} />
            ) : (
              <RefreshCw color={Colors.muted} size={14} strokeWidth={2.6} />
            )}
          </Pressable>
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8} style={styles.eyeBtn} testID="pf-hide">
            {hidden ? (
              <EyeOff color={Colors.muted} size={14} strokeWidth={2.6} />
            ) : (
              <Eye color={Colors.muted} size={14} strokeWidth={2.6} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.changeRow}>
        <View style={[styles.changePill, { borderColor: `${accent}66`, backgroundColor: `${accent}1A` }]}>
          {positive ? (
            <TrendingUp color={accent} size={12} strokeWidth={3} />
          ) : (
            <TrendingDown color={accent} size={12} strokeWidth={3} />
          )}
          <Text style={[styles.changeText, { color: accent }]}>
            {positive ? "+" : ""}
            {profile.pnlPct.toFixed(2)}%
          </Text>
        </View>
        <Text style={styles.changeSub}>30D realized PnL</Text>
      </View>

      {!hasWallets ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No wallets connected</Text>
          <Text style={styles.emptyBody}>
            Add your Solana address in Edit profile or track wallets to see live holdings.
          </Text>
        </View>
      ) : isLoading && aggregate.usdTotal === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={Colors.mint} />
          <Text style={styles.emptyBody}>Fetching live on-chain balances…</Text>
        </View>
      ) : allocations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyBody}>No tokens detected for connected wallets.</Text>
        </View>
      ) : (
        <View style={styles.allocWrap}>
          <View style={styles.allocBar}>
            {allocations.map((a, i) => (
              <View
                key={a.label}
                style={{
                  width: `${Math.max(2, a.pct)}%`,
                  backgroundColor: a.color,
                  height: "100%",
                  borderTopLeftRadius: i === 0 ? 6 : 0,
                  borderBottomLeftRadius: i === 0 ? 6 : 0,
                  borderTopRightRadius: i === allocations.length - 1 ? 6 : 0,
                  borderBottomRightRadius: i === allocations.length - 1 ? 6 : 0,
                }}
              />
            ))}
          </View>
          <View style={styles.allocLegend}>
            {allocations.map((a) => (
              <View key={a.label} style={styles.allocItem}>
                <View style={[styles.allocDot, { backgroundColor: a.color }]} />
                <Text style={styles.allocLabel}>{a.label}</Text>
                <Text style={styles.allocPct}>{a.pct}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatCell
          label="WIN RATE"
          value={`${profile.winRate.toFixed(0)}%`}
          Icon={Target}
          color={Colors.cyan}
        />
        <StatCell
          label="TRADES"
          value={`${profile.trades}`}
          Icon={Activity}
          color={Colors.mint}
        />
        <StatCell
          label="HOLDINGS"
          value={`${aggregate.tokens.length}`}
          Icon={Wallet}
          color={Colors.orange}
        />
        <StatCell
          label="XP"
          value={`${profile.xp}`}
          Icon={Sparkles}
          color={Colors.violet}
        />
      </View>
    </View>
  );
}

function StatCell({
  label,
  value,
  Icon,
  color,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  color: string;
}) {
  return (
    <View style={[styles.statCell, { borderColor: `${color}33` }]}>
      <Icon color={color} size={11} strokeWidth={3} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "rgba(8,8,9,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
    shadowColor: Colors.mint,
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  bgGrad: { ...StyleSheet.absoluteFillObject },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  balance: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.7, marginTop: 2 },
  subBalance: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  eyeBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeText: { fontSize: 12, fontWeight: "900" },
  changeSub: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  empty: {
    marginTop: 14,
    paddingVertical: 18,
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  emptyTitle: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  emptyBody: { color: Colors.muted, fontSize: 11, fontWeight: "600", textAlign: "center", paddingHorizontal: 16 },
  allocWrap: { marginTop: 14, gap: 8 },
  allocBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  allocLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  allocItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  allocDot: { width: 8, height: 8, borderRadius: 4 },
  allocLabel: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  allocPct: { color: Colors.muted, fontSize: 10, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 6, marginTop: 14 },
  statCell: {
    flex: 1,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  statValue: { fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  statLabel: { color: Colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
});
