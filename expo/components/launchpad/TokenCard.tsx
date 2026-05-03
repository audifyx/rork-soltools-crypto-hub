import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUpRight, Flame, TrendingDown, TrendingUp } from "lucide-react-native";
import React, { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { LaunchToken } from "@/types/launchpad";
import { fmtUsd, fmtPrice } from "@/utils/format";
import { getTokenLogo } from "@/utils/token-art";

interface Props {
  token: LaunchToken;
  onPress: () => void;
  onChart: () => void;
}

const formatUsd = fmtUsd;
const formatTokenPrice = fmtPrice;

/** Deterministic pseudo-random for star placement so cards stay stable across re-renders. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  top: number;
  left: number;
  size: number;
  opacity: number;
}

function TokenCardImpl({ token, onPress, onChart }: Props) {
  const positive = (token.change24hPct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  const tickerText = `$${token.ticker.replace("$", "").toUpperCase()}`;

  const logoSrc = useMemo(
    () => getTokenLogo(token.logoUrl, token.id || token.ticker),
    [token.logoUrl, token.id, token.ticker],
  );

  const stars = useMemo<Star[]>(() => {
    const rand = seeded(token.id);
    return Array.from({ length: 22 }, () => ({
      top: rand() * 100,
      left: rand() * 100,
      size: rand() < 0.85 ? 1.2 : 2.2,
      opacity: 0.25 + rand() * 0.6,
    }));
  }, [token.id]);

  const handleChart = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onChart();
  }, [onChart]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardOuter, pressed && styles.cardPressed]}
      testID={`token-card-${token.id}`}
    >
      <View style={styles.card}>
        {/* deep space base */}
        <LinearGradient
          colors={["#000000", "#120F06", "#020202"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* nebula glow */}
        <View
          style={[
            styles.nebula,
            { backgroundColor: positive ? "rgba(244,198,91,0.18)" : "rgba(221,227,236,0.16)" },
          ]}
          pointerEvents="none"
        />
        <View style={styles.nebulaViolet} pointerEvents="none" />

        {/* starfield */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {stars.map((s, i) => (
            <View
              key={`${token.id}-star-${i}`}
              style={[
                styles.star,
                {
                  top: `${s.top}%`,
                  left: `${s.left}%`,
                  width: s.size,
                  height: s.size,
                  borderRadius: s.size,
                  opacity: s.opacity,
                },
              ]}
            />
          ))}
        </View>

        {/* HEADER: logo + diagonal arrow */}
        <View style={styles.headerRow}>
          <View style={styles.logoRing}>
            <View style={styles.logoInner}>
              <Image source={{ uri: logoSrc }} style={styles.logo} contentFit="cover" />
            </View>
          </View>

          {token.change24hPct != null ? (
            <View style={styles.changeCol} pointerEvents="none">
              <View style={[styles.arrowGlow, { backgroundColor: `${accent}33` }]} />
              {positive ? (
                <TrendingUp
                  color={accent}
                  size={48}
                  strokeWidth={3.6}
                  style={styles.arrowIcon}
                />
              ) : (
                <TrendingDown
                  color={accent}
                  size={48}
                  strokeWidth={3.6}
                  style={styles.arrowIcon}
                />
              )}
              <Text style={[styles.changePct, { color: accent, textShadowColor: `${accent}AA` }]}>
                {positive ? "+" : ""}
                {token.change24hPct.toFixed(1)}%
              </Text>
              <Text style={styles.change24h}>24h</Text>
            </View>
          ) : null}
        </View>

        {/* TICKER + HOT */}
        <View style={styles.tickerRow}>
          <Text
            style={[styles.tickerNeon, { textShadowColor: `${Colors.neon}DD` }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {tickerText}
          </Text>
          {token.hot ? (
            <View style={styles.hotPillWrap}>
              <LinearGradient
                colors={[Colors.gold, Colors.goldBright, Colors.platinum, Colors.silver]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.hotInner}>
                <Flame color={Colors.orange} size={12} strokeWidth={3} />
                <Text style={styles.hotText}>HOT</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* MC + LIVE */}
        <View style={styles.mcRow}>
          <View style={styles.mcCol}>
            <Text style={styles.mcLabel}>MARKET CAP</Text>
            <Text style={[styles.mcValue, { textShadowColor: `${Colors.cyan}88` }]} numberOfLines={1}>
              {formatUsd(token.marketCapUsd)}
            </Text>
          </View>
          <View style={styles.venuePill}>
            {token.status === "live" ? <View style={styles.liveDot} /> : null}
            <Text style={styles.venueText} numberOfLines={1}>
              {token.status === "live" ? "LIVE " : ""}
              {token.venue}
            </Text>
          </View>
        </View>

        {/* STAT TILES */}
        <View style={styles.statsRow}>
          <Stat label="LIQUIDITY" value={`~${formatUsd(token.liquidityUsd)}`} color={Colors.cyan} />
          <Stat label="PRICE" value={formatTokenPrice(token.price)} color={Colors.neon} />
          <Stat label="VOLUME" value={`~${formatUsd(token.volume24hUsd)}`} color={Colors.mint} />
        </View>

        {/* CHART CTA */}
        <Pressable
          onPress={handleChart}
          style={({ pressed }) => [styles.chartBtnWrap, pressed && styles.chartPressed]}
          hitSlop={6}
          testID={`chart-${token.id}`}
        >
          <LinearGradient
            colors={[Colors.graphite, Colors.goldBright, Colors.cardSoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chartBtn}
          >
            <ArrowUpRight color={Colors.text} size={15} strokeWidth={3.2} />
            <Text style={styles.chartText}>Chart</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.stat, { shadowColor: color }]}>
      <LinearGradient
        colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.02)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.statTopline, { backgroundColor: `${color}66` }]} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[styles.statValue, { color, textShadowColor: `${color}AA` }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    flex: 1,
    borderRadius: 26,
    minWidth: 0,
    shadowColor: Colors.goldBright,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 10,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.985 }] },
  card: {
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: "#050402",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.18)",
  },
  nebula: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -60,
    right: -80,
    opacity: 0.7,
  },
  nebulaViolet: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    bottom: -60,
    left: -70,
    backgroundColor: "rgba(221,227,236,0.10)",
    opacity: 0.7,
  },
  star: {
    position: "absolute",
    backgroundColor: "#E8F4FF",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: 78,
  },
  logoRing: {
    width: 70,
    height: 70,
    borderRadius: 18,
    padding: 2,
    backgroundColor: Colors.cyan,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 10,
  },
  logoInner: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F2F4FA",
  },
  logo: { width: "100%", height: "100%" },
  logoFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: Colors.ink, fontSize: 22, fontWeight: "900" },

  changeCol: {
    alignItems: "flex-end",
    flexShrink: 0,
    paddingTop: 2,
    minWidth: 86,
  },
  arrowGlow: {
    position: "absolute",
    right: -8,
    top: -8,
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.6,
  },
  arrowIcon: { marginBottom: 2, marginRight: -2 },
  changePct: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  change24h: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 1,
    letterSpacing: 0.4,
  },

  tickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 16,
  },
  tickerNeon: {
    color: Colors.neon,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
    flexShrink: 1,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  hotPillWrap: {
    borderRadius: 999,
    overflow: "hidden",
    padding: 1.5,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 6,
  },
  hotInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#090704",
  },
  hotText: {
    color: Colors.orange,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  mcRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 14,
  },
  mcCol: { flex: 1, minWidth: 0 },
  mcLabel: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    opacity: 0.85,
  },
  mcValue: {
    color: Colors.cyan,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 3,
    letterSpacing: -0.6,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },

  venuePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(216,183,90,0.10)",
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.32)",
    shadowColor: Colors.mint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 3,
    maxWidth: "58%",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.mint,
    shadowColor: Colors.mint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 3,
  },
  venueText: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  statsRow: { flexDirection: "row", gap: 7, marginTop: 14 },
  stat: {
    flex: 1,
    paddingTop: 11,
    paddingBottom: 11,
    paddingHorizontal: 8,
    borderRadius: 16,
    minWidth: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.14)",
    backgroundColor: "rgba(216,183,90,0.055)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 4,
  },
  statTopline: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: 1,
  },
  statLabel: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    opacity: 0.75,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
    letterSpacing: -0.2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  chartBtnWrap: {
    marginTop: 14,
    alignSelf: "center",
    minWidth: "70%",
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: Colors.goldBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    elevation: 8,
  },
  chartPressed: { opacity: 0.92, transform: [{ scale: 0.97 }] },
  chartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  chartText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
});

export default memo(TokenCardImpl);
