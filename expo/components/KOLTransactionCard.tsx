import * as Haptics from "expo-haptics";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Repeat } from "lucide-react-native";
import React, { memo, useCallback } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { fmtNum, fmtUsd } from "@/utils/format";
import { explorerUrlForTx, truncateAddress, type KOLTransaction } from "@/lib/api/kol";

interface Props {
  tx: KOLTransaction;
  onPressKOL?: (kolId: string) => void;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtAmount(n: number | null | undefined, sym: string | null | undefined): string {
  if (n == null) return sym ? sym : "—";
  const v = Math.abs(n);
  let s: string;
  if (v >= 1000) s = fmtNum(n);
  else if (v >= 1) s = n.toFixed(2);
  else if (v >= 0.0001) s = n.toFixed(4);
  else s = n.toPrecision(3);
  return sym ? `${s} ${sym}` : s;
}

function KOLTransactionCardImpl({ tx, onPressKOL }: Props) {
  const isBuy = tx.tx_type === "BUY";
  const isSell = tx.tx_type === "SELL";
  const accent = isBuy ? Colors.mint : isSell ? Colors.rose : Colors.cyan;
  const Icon = isBuy ? ArrowDownLeft : isSell ? ArrowUpRight : Repeat;

  const handle = tx.kol_handle ? `@${tx.kol_handle.replace(/^@/, "")}` : "";

  const onOpenTx = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(explorerUrlForTx(tx.blockchain, tx.tx_hash)).catch((e) =>
      console.log("[kol-tx] open url failed", e),
    );
  }, [tx.blockchain, tx.tx_hash]);

  const onPressName = useCallback(() => {
    if (onPressKOL) onPressKOL(tx.kol_id);
  }, [onPressKOL, tx.kol_id]);

  return (
    <View style={[styles.card, { borderColor: `${accent}33` }]} testID={`kol-tx-${tx.id}`}>
      <View style={styles.head}>
        <View style={[styles.typePill, { backgroundColor: `${accent}1F`, borderColor: `${accent}66` }]}>
          <Icon color={accent} size={12} strokeWidth={3} />
          <Text style={[styles.typeText, { color: accent }]}>{tx.tx_type}</Text>
        </View>

        <Pressable onPress={onPressName} hitSlop={6} style={styles.kolWrap}>
          <Text style={styles.kolName} numberOfLines={1}>
            {tx.kol_name}
          </Text>
          {handle ? <Text style={styles.kolHandle} numberOfLines={1}>{handle}</Text> : null}
        </Pressable>

        <Text style={styles.time}>{relTime(tx.occurred_at)}</Text>
      </View>

      <View style={styles.swapRow}>
        <View style={styles.tokenBlock}>
          <Text style={styles.tokenLabel}>{isBuy ? "Spent" : "Sold"}</Text>
          <Text style={styles.tokenAmount} numberOfLines={1}>
            {fmtAmount(tx.amount_in, tx.symbol_in)}
          </Text>
        </View>

        <View style={[styles.arrowChip, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}>
          <Repeat color={accent} size={13} strokeWidth={3} />
        </View>

        <View style={[styles.tokenBlock, styles.tokenBlockRight]}>
          <Text style={[styles.tokenLabel, { textAlign: "right" }]}>{isSell ? "Received" : "Got"}</Text>
          <Text style={[styles.tokenAmount, { textAlign: "right", color: accent }]} numberOfLines={1}>
            {fmtAmount(tx.amount_out, tx.symbol_out)}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>USD value</Text>
          <Text style={styles.metaValue}>{fmtUsd(tx.usd_value ?? 0)}</Text>
        </View>
        {tx.slippage_pct != null ? (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Slippage</Text>
            <Text style={styles.metaValue}>{tx.slippage_pct.toFixed(2)}%</Text>
          </View>
        ) : null}
        <View style={[styles.metaItem, { alignItems: "flex-end" }]}>
          <Text style={styles.metaLabel}>{tx.blockchain.toUpperCase()}</Text>
          <Pressable onPress={onOpenTx} hitSlop={6} style={styles.txLink} testID={`kol-tx-link-${tx.id}`}>
            <Text style={styles.txHash}>{truncateAddress(tx.tx_hash, 5, 4)}</Text>
            <ExternalLink color={Colors.muted} size={11} strokeWidth={2.6} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const KOLTransactionCard = memo(KOLTransactionCardImpl);
export default KOLTransactionCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    backgroundColor: "rgba(12,12,10,0.94)",
    borderWidth: 1,
    padding: 13,
    gap: 11,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  typeText: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.7 },
  kolWrap: { flex: 1 },
  kolName: { color: Colors.text, fontSize: 13.5, fontWeight: "900", letterSpacing: -0.2 },
  kolHandle: { color: Colors.muted2, fontSize: 11, fontWeight: "700" },
  time: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  tokenBlock: { flex: 1, gap: 2 },
  tokenBlockRight: { alignItems: "flex-end" },
  tokenLabel: { color: Colors.muted2, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  tokenAmount: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.3 },
  arrowChip: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: { flexDirection: "row", gap: 12 },
  metaItem: { flex: 1, gap: 2 },
  metaLabel: { color: Colors.muted2, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  metaValue: { color: Colors.text, fontSize: 12.5, fontWeight: "900" },
  txLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  txHash: { color: Colors.muted, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.2 },
});
