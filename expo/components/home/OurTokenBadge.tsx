import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Activity, ExternalLink, ScanLine, TrendingDown, TrendingUp } from "lucide-react-native";
import React, { memo, useCallback } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

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
  const positive = (change ?? 0) >= 0;
  const accent = change == null ? Colors.cyan : positive ? Colors.mint : Colors.rose;

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
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.92 }]}
      onPress={openChart}
      testID="our-token-badge"
    >
      <LinearGradient
        colors={[`${accent}26`, "rgba(255,255,255,0.04)", "rgba(0,0,0,0.35)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, { backgroundColor: `${accent}1F` }]} pointerEvents="none" />

      <View style={styles.head}>
        <View style={styles.brandRow}>
          <View style={[styles.logo, { borderColor: `${accent}55` }]}>
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoInner}
            >
              <ScanLine color={Colors.ink} size={16} strokeWidth={3} />
            </LinearGradient>
          </View>
          <View style={styles.brandText}>
            <View style={styles.tickerRow}>
              <Text style={styles.ticker}>{TOKEN_TICKER}</Text>
              <View style={[styles.liveDot, { backgroundColor: accent, shadowColor: accent }]} />
            </View>
            <Text style={styles.name}>{TOKEN_NAME} · our token</Text>
          </View>
        </View>
        <Pressable onPress={openDex} hitSlop={10} style={styles.dexBtn} testID="our-token-dex-link">
          <ExternalLink color={Colors.text} size={13} strokeWidth={2.6} />
        </Pressable>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>
          {price != null ? fmtPrice(price) : isLoading ? "Loading…" : "—"}
        </Text>
        <View style={[styles.changePill, { borderColor: `${accent}66`, backgroundColor: `${accent}1F` }]}>
          {change == null ? (
            <Activity color={accent} size={11} strokeWidth={3} />
          ) : positive ? (
            <TrendingUp color={accent} size={11} strokeWidth={3} />
          ) : (
            <TrendingDown color={accent} size={11} strokeWidth={3} />
          )}
          <Text style={[styles.changeText, { color: accent }]}>
            {change == null ? "live" : `${positive ? "+" : ""}${change.toFixed(2)}%`}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Market cap</Text>
          <Text style={styles.statValue}>{fmtUsd(mc)}</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>24h volume</Text>
          <Text style={styles.statValue}>{fmtUsd(vol)}</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Liquidity</Text>
          <Text style={styles.statValue}>{fmtUsd(data?.liquidityUsd ?? null)}</Text>
        </View>
      </View>

      <View style={styles.ctaRow}>
        <Pressable
          onPress={openChart}
          style={({ pressed }) => [styles.ctaPrimary, pressed && { opacity: 0.85 }]}
          testID="our-token-chart"
        >
          <LinearGradient
            colors={[Colors.mint, Colors.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaPrimaryText}>Open chart</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          onPress={openDex}
          style={({ pressed }) => [styles.ctaSecondary, pressed && { opacity: 0.8 }]}
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
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.28)",
    padding: 14,
    gap: 12,
    backgroundColor: "rgba(6,18,15,0.5)",
  },
  glow: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.55,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    padding: 2,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  logoInner: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {},
  tickerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ticker: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  name: { color: Colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  dexBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  price: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statBox: { flex: 1, alignItems: "center" },
  statSep: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.08)" },
  statLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 3 },
  ctaRow: { flexDirection: "row", gap: 8 },
  ctaPrimary: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  ctaGradient: {
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPrimaryText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },
  ctaSecondary: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctaSecondaryText: { color: Colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
});

const OurTokenBadge = memo(OurTokenBadgeImpl);
export default OurTokenBadge;
