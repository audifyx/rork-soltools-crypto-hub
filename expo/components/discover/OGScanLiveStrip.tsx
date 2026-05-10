import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Activity, Flame, TrendingDown, TrendingUp } from "lucide-react-native";
import React, { memo, useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { getNewSolanaPairs, type DexPair } from "@/lib/api/dexscreener";
import { fmtPrice, fmtUsd } from "@/utils/format";

type LiveTrendingItem = {
  address: string;
  symbol: string;
  imageUrl: string | null;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  marketCapUsd: number | null;
};

function pairToItem(pair: DexPair): LiveTrendingItem {
  return {
    address: pair.baseToken?.address ?? pair.pairAddress,
    symbol: pair.baseToken?.symbol ?? "—",
    imageUrl: pair.info?.imageUrl ?? null,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
    change24h: typeof pair.priceChange?.h24 === "number" ? pair.priceChange.h24 : null,
    volume24h: pair.volume?.h24 ?? null,
    marketCapUsd: pair.marketCap ?? pair.fdv ?? null,
  };
}


function OGScanLiveStripImpl() {
  const router = useRouter();
  const q = useQuery<DexPair[]>({
    queryKey: ["ogscan", "live-trending"],
    queryFn: async () => {
      try {
        return await getNewSolanaPairs(18);
      } catch (e) {
        console.log("[ogscan] live trending failed", e);
        return [];
      }
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const items = useMemo<LiveTrendingItem[]>(
    () => (q.data ?? []).map(pairToItem).filter((it) => it.address && it.symbol),
    [q.data],
  );

  return (
    <View style={styles.wrap} testID="ogscan-live-strip">
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={styles.dotWrap}>
            <View style={styles.dot} />
          </View>
          <Text style={styles.eyebrow}>LIVE · TRENDING ON SOLANA</Text>
        </View>
        {q.isLoading && items.length === 0 ? (
          <ActivityIndicator size="small" color={Colors.mint} />
        ) : (
          <View style={styles.flameChip}>
            <Flame color={Colors.orange} size={11} strokeWidth={3} />
            <Text style={styles.flameText}>{items.length}</Text>
          </View>
        )}
      </View>

      {items.length === 0 && !q.isLoading ? (
        <View style={styles.empty}>
          <Activity color={Colors.muted} size={14} strokeWidth={2.4} />
          <Text style={styles.emptyText}>Waiting for live signal…</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {items.map((it) => {
            const up = (it.change24h ?? 0) >= 0;
            const accent = up ? Colors.mint : Colors.rose;
            return (
              <Pressable
                key={it.address}
                onPress={() => router.push(`/tool/token-lookup?ca=${it.address}` as never)}
                style={({ pressed }) => [
                  styles.card,
                  { borderColor: `${accent}33` },
                  pressed && { opacity: 0.75 },
                ]}
                testID={`ogscan-trend-${it.address}`}
              >
                <LinearGradient
                  colors={[`${accent}1A`, "rgba(0,0,0,0)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.cardTop}>
                  {it.imageUrl ? (
                    <Image source={{ uri: it.imageUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>
                        {it.symbol.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardTopText}>
                    <Text style={styles.symbol} numberOfLines={1}>
                      {it.symbol}
                    </Text>
                    <Text style={styles.price} numberOfLines={1}>
                      {fmtPrice(it.priceUsd)}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <View style={[styles.changePill, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
                    {up ? (
                      <TrendingUp color={accent} size={10} strokeWidth={3} />
                    ) : (
                      <TrendingDown color={accent} size={10} strokeWidth={3} />
                    )}
                    <Text style={[styles.changeText, { color: accent }]}>
                      {it.change24h == null ? "—" : `${up ? "+" : ""}${it.change24h.toFixed(1)}%`}
                    </Text>
                  </View>
                  <Text style={styles.vol}>MC {fmtUsd(it.marketCapUsd)} · V {fmtUsd(it.volume24h)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    marginBottom: 6,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  dotWrap: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.mint,
    shadowColor: Colors.mint,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  flameChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,150,80,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,150,80,0.35)",
  },
  flameText: {
    color: Colors.orange,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  row: { paddingHorizontal: 14, gap: 8 },
  card: {
    width: 158,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
    gap: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.06)" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  cardTopText: { flex: 1 },
  symbol: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },
  price: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  vol: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
});

const OGScanLiveStrip = memo(OGScanLiveStripImpl);
export default OGScanLiveStrip;
