import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Activity, ArrowUpRight, ScanLine, Sparkles, TrendingDown, TrendingUp } from "lucide-react-native";
import React, { memo, useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { useDexToken } from "@/lib/api/dexscreener";
import { SOLTOOLS_TOKEN_MINT } from "@/lib/badge-system";
import { fmtPrice, fmtUsd } from "@/utils/format";

const TOKEN_MINT = SOLTOOLS_TOKEN_MINT;
const TOKEN_TICKER = "$OGS";
const TOKEN_NAME = "OG Scan";

function OurTokenBadgeImpl() {
  const router = useRouter();
  const { data, isLoading } = useDexToken(TOKEN_MINT);

  const price = data?.priceUsd ?? null;
  const change = data?.priceChange24hPct ?? null;
  const mc = data?.marketCapUsd ?? null;
  const vol = data?.volume24hUsd ?? null;
  const liq = data?.liquidityUsd ?? null;
  const positive = (change ?? 0) >= 0;
  const accent = change == null ? Colors.cyan : positive ? Colors.mint : Colors.rose;

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const dotScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0.35] });

  const openChart = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/launch/[id]", params: { id: TOKEN_MINT } });
  }, [router]);

  const openDex = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const url = data?.pair?.url ?? `https://dexscreener.com/solana/${TOKEN_MINT}`;
    Linking.openURL(url).catch((e) => console.log("[ogs] open dex failed", e));
  }, [data?.pair?.url]);

  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && { transform: [{ scale: 0.985 }], opacity: 0.96 }]}
      onPress={openChart}
      testID="our-token-badge"
    >
      <LinearGradient
        colors={[`${accent}33`, "rgba(12,18,24,0.85)", "rgba(8,12,16,0.95)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1.1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glowA, { backgroundColor: `${accent}33` }]} pointerEvents="none" />
      <View style={[styles.glowB, { backgroundColor: `${Colors.cyan}22` }]} pointerEvents="none" />
      <View style={styles.hairline} pointerEvents="none" />

      <View style={styles.head}>
        <View style={styles.brandRow}>
          <View style={[styles.logoOuter, { borderColor: `${accent}66`, shadowColor: accent }]}>
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoInner}
            >
              <ScanLine color={Colors.ink} size={20} strokeWidth={3} />
            </LinearGradient>
          </View>
          <View style={styles.brandText}>
            <View style={styles.tickerRow}>
              <Text style={styles.ticker}>{TOKEN_TICKER}</Text>
              <View style={styles.livePill}>
                <Animated.View
                  style={[
                    styles.liveDot,
                    {
                      backgroundColor: accent,
                      shadowColor: accent,
                      transform: [{ scale: dotScale }],
                      opacity: dotOpacity,
                    },
                  ]}
                />
                <Text style={[styles.liveText, { color: accent }]}>LIVE</Text>
              </View>
            </View>
            <View style={styles.subRow}>
              <Sparkles color={Colors.muted} size={10} strokeWidth={2.6} />
              <Text style={styles.name}>{TOKEN_NAME} · our token</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.priceCard}>
        <View style={styles.priceRow}>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>Price</Text>
            <Text style={styles.price}>
              {price != null ? fmtPrice(price) : isLoading ? "…" : "—"}
            </Text>
          </View>
          <View style={[styles.changePill, { borderColor: `${accent}55`, backgroundColor: `${accent}22` }]}>
            {change == null ? (
              <Activity color={accent} size={12} strokeWidth={3} />
            ) : positive ? (
              <TrendingUp color={accent} size={12} strokeWidth={3} />
            ) : (
              <TrendingDown color={accent} size={12} strokeWidth={3} />
            )}
            <Text style={[styles.changeText, { color: accent }]}>
              {change == null ? "live" : `${positive ? "+" : ""}${change.toFixed(2)}%`}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBubble}>
          <Text style={styles.statLabel}>Market cap</Text>
          <Text style={styles.statValue}>{fmtUsd(mc)}</Text>
        </View>
        <View style={styles.statBubble}>
          <Text style={styles.statLabel}>24h vol</Text>
          <Text style={styles.statValue}>{fmtUsd(vol)}</Text>
        </View>
        <View style={styles.statBubble}>
          <Text style={styles.statLabel}>Liquidity</Text>
          <Text style={styles.statValue}>{fmtUsd(liq)}</Text>
        </View>
      </View>

      <View style={styles.ctaRow}>
        <Pressable
          onPress={openChart}
          style={({ pressed }) => [styles.ctaPrimary, pressed && { opacity: 0.88 }]}
          testID="our-token-chart"
        >
          <LinearGradient
            colors={[Colors.mint, Colors.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaPrimaryText}>Open chart</Text>
            <ArrowUpRight color={Colors.ink} size={15} strokeWidth={3} />
          </LinearGradient>
        </Pressable>
        <Pressable
          onPress={openDex}
          style={({ pressed }) => [styles.ctaSecondary, pressed && { opacity: 0.82 }]}
          testID="our-token-dex"
        >
          <Text style={styles.ctaSecondaryText}>DexScreener</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 6,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    gap: 14,
    backgroundColor: "rgba(8,12,16,0.6)",
  },
  glowA: {
    position: "absolute",
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.7,
  },
  glowB: {
    position: "absolute",
    bottom: -100,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.6,
  },
  hairline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  logoOuter: {
    padding: 3,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  logoInner: {
    width: 40,
    height: 40,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { flex: 1 },
  tickerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  ticker: { color: Colors.text, fontSize: 19, fontWeight: "900", letterSpacing: 0.3 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOpacity: 0.95,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  liveText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  name: { color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },

  priceCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceCol: { gap: 4 },
  priceLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  price: { color: Colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.9 },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },

  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statBubble: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "flex-start",
    gap: 4,
  },
  statLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: { color: Colors.text, fontSize: 13, fontWeight: "900" },

  ctaRow: { flexDirection: "row", gap: 8 },
  ctaPrimary: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
  ctaGradient: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  ctaPrimaryText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  ctaSecondary: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctaSecondaryText: { color: Colors.text, fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
});

const OurTokenBadge = memo(OurTokenBadgeImpl);
export default OurTokenBadge;
