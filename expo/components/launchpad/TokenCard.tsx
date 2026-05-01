import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUpRight, Copy, Crown, Flame, TrendingDown, TrendingUp } from "lucide-react-native";
import React, { memo, useCallback } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { LaunchToken } from "@/types/launchpad";
import { fmtUsd, fmtPrice } from "@/utils/format";

interface Props {
  token: LaunchToken;
  onPress: () => void;
  onChart: () => void;
}

const formatUsd = fmtUsd;
const formatTokenPrice = fmtPrice;

function TokenCardImpl({ token, onPress, onChart }: Props) {
  const positive = (token.change24hPct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  const ringColor = token.hot ? Colors.orange : positive ? Colors.mint : "#B88CFF";

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(token.contract);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    console.log("[launchpad] copied contract", token.ticker);
  }, [token.contract, token.ticker]);

  const tickerText = `$${token.ticker.replace("$", "")}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: `${ringColor}55`, shadowColor: ringColor },
        pressed && styles.cardPressed,
      ]}
      testID={`token-card-${token.id}`}
    >
      {/* atmospheric glow layers */}
      <LinearGradient
        colors={[`${ringColor}22`, "rgba(0,0,0,0)", `${ringColor}11`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glowBlob, { backgroundColor: `${ringColor}26` }]} />

      {/* HEADER: logo with neon ring + change pill */}
      <View style={styles.headerRow}>
        <View style={[styles.logoRing, { borderColor: ringColor, shadowColor: ringColor }]}>
          {token.logoUrl ? (
            <Image source={{ uri: token.logoUrl }} style={styles.logo} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[ringColor, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoFallback}
            >
              <Text style={styles.logoFallbackText} numberOfLines={1}>
                {token.ticker.replace("$", "").slice(0, 2)}
              </Text>
            </LinearGradient>
          )}
        </View>

        {token.change24hPct != null ? (
          <View style={styles.changeCol}>
            <View style={[styles.changePill, { borderColor: `${accent}66`, backgroundColor: `${accent}1A`, shadowColor: accent }]}>
              {positive ? (
                <TrendingUp color={accent} size={11} strokeWidth={3} />
              ) : (
                <TrendingDown color={accent} size={11} strokeWidth={3} />
              )}
              <Text style={[styles.changeText, { color: accent }]}>
                {positive ? "+" : ""}
                {token.change24hPct.toFixed(1)}%
              </Text>
            </View>
            <Text style={styles.changeSub}>24h</Text>
          </View>
        ) : null}
      </View>

      {/* TICKER + HOT */}
      <View style={styles.tickerRow}>
        <Text
          style={[styles.tickerNeon, { color: ringColor, textShadowColor: `${ringColor}AA` }]}
          numberOfLines={1}
        >
          {tickerText}
        </Text>
        {token.hot ? (
          <View style={styles.hotPill}>
            <Flame color={Colors.orange} size={9} strokeWidth={3} />
            <Text style={styles.hotText}>HOT</Text>
          </View>
        ) : token.featured ? (
          <View style={styles.hotPill}>
            <Crown color={Colors.orange} size={9} strokeWidth={3} />
            <Text style={styles.hotText}>FEAT</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.nameLine} numberOfLines={1}>
        {token.name}
      </Text>

      {/* MARKET CAP + LIVE */}
      <View style={styles.mcRow}>
        <View style={styles.mcCol}>
          <Text style={styles.mcLabel}>MARKET CAP</Text>
          <Text style={styles.mcValue} numberOfLines={1}>
            {formatUsd(token.marketCapUsd)}
          </Text>
        </View>
        <View style={styles.venuePill}>
          {token.status === "live" ? <View style={styles.liveDot} /> : null}
          {token.status === "live" ? <Text style={styles.liveText}>LIVE</Text> : null}
          <Text style={styles.venueText} numberOfLines={1}>
            {token.venue}
          </Text>
        </View>
      </View>

      {/* STAT TILES */}
      <View style={styles.statsRow}>
        <Stat label="LIQ" value={formatUsd(token.liquidityUsd)} tint="rgba(56,215,255,0.16)" border="rgba(56,215,255,0.35)" color={Colors.cyan} />
        <Stat label="PRICE" value={formatTokenPrice(token.price)} tint="rgba(184,140,255,0.18)" border="rgba(184,140,255,0.4)" color="#C9A8FF" />
        <Stat label="VOL" value={formatUsd(token.volume24hUsd)} tint="rgba(85,245,178,0.16)" border="rgba(85,245,178,0.36)" color={Colors.mint} />
      </View>

      {/* FOOTER ACTIONS */}
      <View style={styles.footerRow}>
        <Pressable onPress={onCopy} style={styles.iconBtn} hitSlop={6} testID={`copy-${token.id}`}>
          <Copy color={Colors.muted} size={13} strokeWidth={2.4} />
        </Pressable>
        <Pressable onPress={onChart} style={styles.chartBtnWrap} hitSlop={6} testID={`chart-${token.id}`}>
          <LinearGradient
            colors={["#B88CFF", "#FF5D8F"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chartBtn}
          >
            <ArrowUpRight color={Colors.text} size={13} strokeWidth={3} />
            <Text style={styles.chartText}>Chart</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Stat({
  label,
  value,
  tint,
  border,
  color,
}: {
  label: string;
  value: string;
  tint: string;
  border: string;
  color: string;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: tint, borderColor: border }]}>
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
    borderRadius: 26,
    padding: 14,
    paddingTop: 14,
    backgroundColor: "rgba(11, 24, 26, 0.78)",
    borderWidth: 1.5,
    overflow: "hidden",
    minWidth: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },

  glowBlob: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -60,
    right: -60,
    opacity: 0.55,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  logoRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 6,
    backgroundColor: Colors.ink,
  },
  logo: { width: "100%", height: "100%" },
  logoFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },

  changeCol: { alignItems: "flex-end", flexShrink: 1 },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 3,
  },
  changeText: { fontSize: 12, fontWeight: "900", letterSpacing: -0.2 },
  changeSub: { color: Colors.muted, fontSize: 9, fontWeight: "800", marginTop: 3, letterSpacing: 0.6 },

  tickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  tickerNeon: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
    flexShrink: 1,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  hotPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,184,76,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.5)",
  },
  hotText: { color: Colors.orange, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  nameLine: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  mcRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 12,
  },
  mcCol: { flex: 1, minWidth: 0 },
  mcLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  mcValue: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 3, letterSpacing: -0.5 },

  venuePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.10)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.28)",
    maxWidth: "55%",
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.mint },
  liveText: { color: Colors.mint, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  venueText: { color: Colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },

  statsRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  stat: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 0,
  },
  statLabel: { color: Colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  statValue: { fontSize: 11, fontWeight: "900", marginTop: 3, letterSpacing: -0.2 },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chartBtnWrap: {
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#FF5D8F",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 4,
  },
  chartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chartText: { color: Colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
});

export default memo(TokenCardImpl);
