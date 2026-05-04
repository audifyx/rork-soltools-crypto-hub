import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Plus, TrendingDown, TrendingUp, Wallet as WalletIcon } from "lucide-react-native";
import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";
import type { PortfolioStats, UserWalletWithBalance } from "@/lib/api/crypto-news";

interface WalletTrackerProps {
  stats?: PortfolioStats;
  loading?: boolean;
  onAddWallet?: () => void;
  onSelectWallet?: (wallet: UserWalletWithBalance) => void;
}

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function WalletTrackerImpl({ stats, loading, onAddWallet, onSelectWallet }: WalletTrackerProps) {
  const total = stats?.totalUsd ?? 0;
  const pnl = stats?.unrealizedPnlUsd ?? 0;
  const pnlPct = stats?.unrealizedPnlPct ?? 0;
  const positive = pnl >= 0;
  const accent = positive ? Colors.mint : Colors.rose;

  const handleAdd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onAddWallet?.();
  }, [onAddWallet]);

  return (
    <View style={styles.wrap} testID="wallet-tracker">
      <LinearGradient
        colors={["rgba(244,198,91,0.20)", "rgba(221,227,236,0.075)", "rgba(0,0,0,0.30)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.summary}
      >
        <View style={styles.summaryHeader}>
          <Text style={styles.eyebrow}>TOTAL PORTFOLIO</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.totalValue}>{loading && total === 0 ? "—" : fmtUsd(total)}</Text>
        <View style={styles.pnlRow}>
          <View style={[styles.pnlPill, { borderColor: `${accent}66`, backgroundColor: `${accent}1A` }]}>
            {positive ? (
              <TrendingUp color={accent} size={12} strokeWidth={3} />
            ) : (
              <TrendingDown color={accent} size={12} strokeWidth={3} />
            )}
            <Text style={[styles.pnlText, { color: accent }]}>
              {pnl === 0 ? "$0.00" : fmtUsd(pnl)} ({fmtPct(pnlPct)})
            </Text>
          </View>
          <Text style={styles.pnlLabel}>unrealized P&amp;L</Text>
        </View>
        <View style={styles.statsRow}>
          <Stat label="Wallets" value={fmtNum(stats?.walletCount ?? 0)} />
          <View style={styles.statDivider} />
          <Stat label="Tokens" value={fmtNum(stats?.tokenCount ?? 0)} />
          <View style={styles.statDivider} />
          <Stat
            label="Top"
            value={
              stats?.topHolding?.symbol
                ? `$${stats.topHolding.symbol.toUpperCase().replace("$", "")}`
                : "—"
            }
          />
        </View>
      </LinearGradient>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Wallets</Text>
        <Pressable onPress={handleAdd} style={styles.addBtn} testID="wallet-tracker-add">
          <Plus color={Colors.ink} size={14} strokeWidth={3} />
          <Text style={styles.addBtnText}>Add wallet</Text>
        </Pressable>
      </View>

      {(stats?.wallets ?? []).length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <WalletIcon color={Colors.mint} size={20} strokeWidth={2.6} />
          </View>
          <Text style={styles.emptyTitle}>No wallets yet</Text>
          <Text style={styles.emptyBody}>
            Track any Solana wallet to monitor balances, top holdings, and P&amp;L in real time.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {stats?.wallets.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => onSelectWallet?.(w)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              testID={`wallet-row-${w.id}`}
            >
              <View style={styles.rowIcon}>
                <WalletIcon color={Colors.mint} size={16} strokeWidth={2.6} />
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {w.label || shortAddress(w.address)}
                </Text>
                <Text style={styles.rowAddr} numberOfLines={1}>
                  {w.blockchain.toUpperCase()} · {shortAddress(w.address)} · {w.tokenCount} tokens
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>{fmtUsd(w.balanceUsd)}</Text>
                <ChevronRight color={Colors.muted} size={16} strokeWidth={2.6} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const WalletTracker = memo(WalletTrackerImpl);
export default WalletTracker;

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  summary: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.26)",
    overflow: "hidden",
  },
  summaryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.45)",
    backgroundColor: "rgba(216,183,90,0.12)",
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.mint },
  liveText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  totalValue: { color: Colors.text, fontSize: 38, fontWeight: "900", letterSpacing: -1.6, marginTop: 8 },
  pnlRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  pnlPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  pnlText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  pnlLabel: { color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  statDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.06)" },
  statBox: { flex: 1, alignItems: "center" },
  statValue: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.4 },
  statLabel: { color: Colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 3 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  listTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  addBtnText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  empty: {
    padding: 22,
    borderRadius: 22,
    backgroundColor: "rgba(16,16,14,0.84)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.16)",
    alignItems: "center",
    gap: 8,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(216,183,90,0.14)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(16,16,14,0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  pressed: { opacity: 0.9 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(216,183,90,0.14)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1 },
  rowLabel: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  rowAddr: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowValue: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
});
