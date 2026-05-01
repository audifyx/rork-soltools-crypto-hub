import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUpRight, Copy, Crown, Flame, TrendingDown, TrendingUp } from "lucide-react-native";
import React, { memo, useCallback } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { LaunchToken } from "@/types/launchpad";

interface Props {
  token: LaunchToken;
  onPress: () => void;
  onChart: () => void;
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || n === 0) return "N/A";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatTokenPrice(n: number | null | undefined): string {
  if (n == null) return "N/A";
  if (n === 0) return "$0";
  if (n < 0.000001) return `${n.toExponential(2)}`;
  if (n < 0.01) return `${n.toFixed(6)}`;
  if (n < 1) return `${n.toFixed(4)}`;
  return `${n.toFixed(2)}`;
}

function formatCompactUsd(n: number | null | undefined): string {
  if (n == null || n === 0) return "N/A";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `${n.toFixed(2)}`;
  return `${n.toFixed(4)}`;
}

function TokenCardImpl({ token, onPress, onChart }: Props) {
  const positive = (token.change24hPct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(token.contract);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    console.log("[launchpad] copied contract", token.ticker);
  }, [token.contract, token.ticker]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      testID={`token-card-${token.id}`}
    >
      {token.hot ? (
        <LinearGradient
          colors={["rgba(255,184,76,0.5)", "rgba(255,93,143,0.0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <View style={styles.header}>
        <View style={styles.logoWrap}>
          {token.logoUrl ? (
            <Image source={{ uri: token.logoUrl }} style={styles.logo} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoFallback}
            >
              <Text style={styles.logoFallbackText}>{token.ticker.replace("$", "").slice(0, 2)}</Text>
            </LinearGradient>
          )}
        </View>
        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {token.name}
            </Text>
            {token.featured ? <Crown color={Colors.orange} size={12} strokeWidth={2.6} /> : null}
          </View>
          <View style={styles.tickerRow}>
            <Text style={styles.ticker}>${token.ticker.replace("$", "")}</Text>
            {token.hot ? (
              <View style={styles.hotPill}>
                <Flame color={Colors.orange} size={9} strokeWidth={3} />
                <Text style={styles.hotText}>HOT</Text>
              </View>
            ) : null}
          </View>
        </View>
        {token.change24hPct != null ? (
          <View style={[styles.changePill, { backgroundColor: `${accent}1A`, borderColor: `${accent}55` }]}>
            {positive ? (
              <TrendingUp color={accent} size={10} strokeWidth={3} />
            ) : (
              <TrendingDown color={accent} size={10} strokeWidth={3} />
            )}
            <Text style={[styles.changeText, { color: accent }]}>
              {positive ? "+" : ""}
              {token.change24hPct.toFixed(1)}%
            </Text>
            <Text style={styles.changeSub}>24h</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.priceBlock}>
        <View style={styles.priceLabelRow}>
          <Text style={styles.priceLabel}>MARKET CAP</Text>
          <View style={styles.venuePill}>
            {token.status === "live" ? <View style={styles.liveDot} /> : null}
            {token.status === "live" ? <Text style={styles.liveText}>LIVE</Text> : null}
            <Text style={styles.venueText}>{token.venue}</Text>
          </View>
        </View>
        <Text style={[styles.price, token.marketCapUsd == null && styles.priceMuted]}>{formatCompactUsd(token.marketCapUsd)}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="LIQUIDITY" value={formatUsd(token.liquidityUsd)} tint="rgba(56,215,255,0.14)" color={Colors.cyan} />
        <Stat label="PRICE" value={formatTokenPrice(token.price)} tint="rgba(184,140,255,0.14)" color="#B88CFF" />
        <Stat label="VOLUME" value={formatUsd(token.volume24hUsd)} tint="rgba(85,245,178,0.14)" color={Colors.mint} />
      </View>

      <View style={styles.footerRow}>
        <Pressable onPress={onCopy} style={styles.iconBtn} hitSlop={6} testID={`copy-${token.id}`}>
          <Copy color={Colors.muted} size={14} strokeWidth={2.4} />
        </Pressable>
        <Pressable onPress={onChart} style={styles.chartBtn} hitSlop={6} testID={`chart-${token.id}`}>
          <ArrowUpRight color={Colors.text} size={13} strokeWidth={2.6} />
          <Text style={styles.chartText}>Chart</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Stat({ label, value, tint, color }: { label: string; value: string; tint: string; color: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: tint }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    minWidth: 0,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoWrap: { width: 38, height: 38, borderRadius: 12, overflow: "hidden" },
  logo: { width: 38, height: 38 },
  logoFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  headerInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, flexShrink: 1 },
  tickerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  ticker: { color: Colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  hotPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,184,76,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.45)",
  },
  hotText: { color: Colors.orange, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  changeText: { fontSize: 11, fontWeight: "900" },
  changeSub: { color: Colors.muted, fontSize: 8, fontWeight: "800", marginLeft: 2 },
  priceBlock: { marginTop: 14 },
  priceLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  priceLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  venuePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.mint },
  liveText: { color: Colors.mint, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  venueText: { color: Colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  price: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 4, letterSpacing: -0.4 },
  priceMuted: { color: Colors.muted },
  statsRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  stat: { flex: 1, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10 },
  statLabel: { color: Colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  statValue: { fontSize: 11, fontWeight: "900", marginTop: 2 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  chartText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
});

export default memo(TokenCardImpl);
