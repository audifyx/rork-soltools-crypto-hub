import { LinearGradient } from "expo-linear-gradient";
import { TrendingDown, TrendingUp, Zap } from "lucide-react-native";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { useJupiterPrices, BONK_MINT, JUP_MINT, SOL_MINT } from "@/lib/api/market";
import { fmtPrice } from "@/utils/format";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WIF_MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const PYTH_MINT = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";

interface TickerItem {
  symbol: string;
  price: number | undefined;
  change: number | undefined;
  digits: number;
}

/**
 * Always-on scrolling price marquee. Subtle, premium, hardware-accelerated.
 * Falls back to brand-colored skeleton labels when prices haven't loaded.
 */
export default function LiveTicker() {
  const { data } = useJupiterPrices([SOL_MINT, BONK_MINT, JUP_MINT, USDC_MINT, WIF_MINT, PYTH_MINT]);

  const items = useMemo<TickerItem[]>(() => {
    const list: { symbol: string; mint: string; digits: number }[] = [
      { symbol: "SOL", mint: SOL_MINT, digits: 2 },
      { symbol: "BONK", mint: BONK_MINT, digits: 8 },
      { symbol: "JUP", mint: JUP_MINT, digits: 4 },
      { symbol: "WIF", mint: WIF_MINT, digits: 4 },
      { symbol: "PYTH", mint: PYTH_MINT, digits: 4 },
      { symbol: "USDC", mint: USDC_MINT, digits: 4 },
    ];
    return list.map((l) => {
      const row = data?.[l.mint];
      return {
        symbol: l.symbol,
        price: row?.price,
        change: undefined,
        digits: l.digits,
      };
    });
  }, [data]);

  const offset = useRef(new Animated.Value(0)).current;
  const trackWidth = useRef<number>(0);

  useEffect(() => {
    let stopped = false;
    const start = () => {
      if (stopped) return;
      const w = trackWidth.current || 480;
      offset.setValue(0);
      Animated.timing(offset, {
        toValue: -w,
        duration: Math.max(8000, w * 18),
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) start();
      });
    };
    start();
    return () => {
      stopped = true;
    };
  }, [offset, items.length]);

  const renderItems = (key: string) => (
    <View
      style={styles.track}
      key={key}
      onLayout={(e) => {
        if (key === "a") trackWidth.current = e.nativeEvent.layout.width;
      }}
    >
      {items.map((it, i) => {
        const positive = (it.change ?? 0) >= 0;
        const accent = positive ? Colors.mint : Colors.rose;
        const display = it.price && it.price > 0 ? fmtPrice(it.price) : "—";
        return (
          <View key={`${key}-${i}`} style={styles.item}>
            <View style={styles.dot} />
            <Text style={styles.symbol}>{it.symbol}</Text>
            <Text style={styles.value}>{display}</Text>
            <View style={[styles.changePill, { borderColor: `${accent}55` }]}>
              {positive ? (
                <TrendingUp color={accent} size={9} strokeWidth={3} />
              ) : (
                <TrendingDown color={accent} size={9} strokeWidth={3} />
              )}
              <Text style={[styles.changeText, { color: accent }]}>live</Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap} testID="live-ticker">
      <View style={styles.badge}>
        <Zap color={Colors.orange} size={11} strokeWidth={3} />
        <Text style={styles.badgeText}>LIVE</Text>
      </View>
      <View style={styles.scrollWrap}>
        <LinearGradient
          colors={["rgba(6,5,2,0.96)", "rgba(6,5,2,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { zIndex: 2, width: 24 }]}
          pointerEvents="none"
        />
        <Animated.View style={[styles.row, { transform: [{ translateX: offset }] }]}>
          {renderItems("a")}
          {renderItems("b")}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(244,198,91,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.32)",
  },
  badgeText: {
    color: Colors.orange,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  scrollWrap: {
    flex: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingRight: 18,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.goldBright,
  },
  symbol: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  value: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
