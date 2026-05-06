import { Image as ExpoImage } from "expo-image";
import { TrendingDown, TrendingUp } from "lucide-react-native";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { fmtNum, fmtPct, fmtPrice, fmtUsd } from "@/utils/format";
import type { KOLHolding } from "@/lib/api/kol";

interface Props {
  holding: KOLHolding;
}

function KOLHoldingCardImpl({ holding }: Props) {
  const positive = holding.pnl_usd >= 0;
  const pnlColor = positive ? Colors.mint : Colors.rose;
  const PnlIcon = positive ? TrendingUp : TrendingDown;

  const showPnl = holding.avg_buy_price != null && holding.avg_buy_price > 0;

  return (
    <View style={styles.row} testID={`kol-holding-${holding.id}`}>
      <View style={styles.logo}>
        {holding.logo_url ? (
          <ExpoImage source={{ uri: holding.logo_url }} style={styles.logoImg} contentFit="cover" />
        ) : (
          <Text style={styles.initial}>{(holding.symbol?.[0] ?? "?").toUpperCase()}</Text>
        )}
      </View>

      <View style={styles.middle}>
        <Text style={styles.symbol} numberOfLines={1}>
          {holding.symbol}
        </Text>
        <Text style={styles.balance} numberOfLines={1}>
          {fmtNum(holding.balance)} {holding.symbol}
        </Text>
        <View style={styles.priceLine}>
          <Text style={styles.price} numberOfLines={1}>
            {holding.current_price != null ? fmtPrice(holding.current_price) : "—"}
          </Text>
          {showPnl ? (
            <Text style={styles.avgPrice} numberOfLines={1}>
              avg {fmtPrice(holding.avg_buy_price ?? 0)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.value}>{fmtUsd(holding.value_usd)}</Text>
        {showPnl ? (
          <View style={[styles.pnlChip, { backgroundColor: `${pnlColor}1A`, borderColor: `${pnlColor}55` }]}>
            <PnlIcon color={pnlColor} size={10} strokeWidth={3} />
            <Text style={[styles.pnlText, { color: pnlColor }]} numberOfLines={1}>
              {fmtUsd(holding.pnl_usd)} · {fmtPct(holding.pnl_pct, 1)}
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>—</Text>
        )}
      </View>
    </View>
  );
}

const KOLHoldingCard = memo(KOLHoldingCardImpl);
export default KOLHoldingCard;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  logoImg: { width: 40, height: 40, borderRadius: 20 },
  initial: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  middle: { flex: 1, gap: 2, minWidth: 0 },
  symbol: { color: Colors.text, fontSize: 14.5, fontWeight: "900", letterSpacing: -0.2 },
  balance: { color: Colors.muted2, fontSize: 11.5, fontWeight: "700" },
  priceLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  price: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  avgPrice: { color: Colors.muted2, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.2 },
  right: { alignItems: "flex-end", gap: 4, maxWidth: "42%" },
  value: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  pnlChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  pnlText: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.2 },
  muted: { color: Colors.muted2, fontSize: 11, fontWeight: "800" },
});
