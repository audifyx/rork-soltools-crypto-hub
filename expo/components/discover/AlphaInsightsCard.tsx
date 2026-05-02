import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ArrowUpRight,
  Bot,
  Brain,
  Flame,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React, { useMemo, useRef, useEffect } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { getDailyAlphaRunners } from "@/lib/alpha-runners";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { fmtUsd } from "@/utils/format";

interface InsightItem {
  id: string;
  emoji: string;
  title: string;
  body: string;
  tag: string;
  tagColor: string;
  href?: { pathname: "/launch/[id]"; params: { id: string } };
}

export default function AlphaInsightsCard() {
  const router = useRouter();
  const { listings } = useLaunchpad();

  const insights = useMemo<InsightItem[]>(() => {
    const runners = getDailyAlphaRunners(listings, 3);
    const out: InsightItem[] = runners.map((token, index) => {
      const ticker = token.ticker.replace("$", "");
      const changeText = token.change24hPct != null ? ` · ${token.change24hPct >= 0 ? "+" : ""}${token.change24hPct.toFixed(1)}%` : "";
      return {
        id: `runner-${token.id}`,
        emoji: index === 0 ? "🔥" : index === 1 ? "⚡" : "📈",
        title: `${ticker} leading small-cap volume`,
        body: `24h vol ${fmtUsd(token.volume24hUsd)} · MC ${fmtUsd(token.marketCapUsd)} · LIQ ${fmtUsd(token.liquidityUsd)}${changeText}`,
        tag: "1M+ VOL",
        tagColor: index === 0 ? Colors.orange : Colors.cyan,
        href: { pathname: "/launch/[id]", params: { id: token.id } },
      };
    });

    if (out.length === 0) {
      out.push({
        id: "warming",
        emoji: "🧠",
        title: "Scanning for today's small-cap runners",
        body: "AI Alpha only shows small caps with $1M+ 24h volume, positive momentum, and major-cap names filtered out.",
        tag: "NO RUNNERS YET",
        tagColor: Colors.violet,
      });
    }
    return out;
  }, [listings]);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={styles.wrap} testID="alpha-insights-card">
      <LinearGradient
        colors={["rgba(56,215,255,0.18)", "rgba(184,140,255,0.10)", "rgba(56,215,255,0.04)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={styles.iconBox}>
            <Brain color={Colors.cyan} size={14} strokeWidth={2.6} />
          </View>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.title}>AI Alpha Insights</Text>
              <View style={styles.beta}>
                <Sparkles color={Colors.violet} size={9} strokeWidth={3} />
                <Text style={styles.betaText}>BETA</Text>
              </View>
            </View>
            <View style={styles.subRow}>
              <Animated.View style={[styles.statusDot, { opacity: dotOpacity }]} />
              <Text style={styles.sub}>Live · $1M+ small-cap volume scanner</Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
          }}
          style={styles.refresh}
          hitSlop={6}
        >
          <Bot color={Colors.cyan} size={14} strokeWidth={2.6} />
        </Pressable>
      </View>

      <View style={styles.list}>
        {insights.map((it) => (
          <Pressable
            key={it.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              if (it.href) router.push(it.href);
            }}
            style={styles.item}
            testID={`insight-${it.id}`}
          >
            <View style={styles.emojiBox}>
              <Text style={styles.emoji}>{it.emoji}</Text>
            </View>
            <View style={styles.itemBody}>
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {it.title}
                </Text>
                {it.href ? <ArrowUpRight color={Colors.cyan} size={12} strokeWidth={2.6} /> : null}
              </View>
              <Text style={styles.itemBodyText} numberOfLines={2}>
                {it.body}
              </Text>
              <View style={[styles.tag, { borderColor: `${it.tagColor}55`, backgroundColor: `${it.tagColor}1A` }]}>
                {it.tag === "MOMENTUM" || it.tag === "1M+ VOL" ? (
                  <TrendingUp color={it.tagColor} size={9} strokeWidth={3} />
                ) : it.tag === "NEW LISTING" ? (
                  <Zap color={it.tagColor} size={9} strokeWidth={3} />
                ) : it.tag === "WHALES" ? (
                  <Flame color={it.tagColor} size={9} strokeWidth={3} />
                ) : (
                  <Bot color={it.tagColor} size={9} strokeWidth={3} />
                )}
                <Text style={[styles.tagText, { color: it.tagColor }]}>{it.tag}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 14,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.28)",
    backgroundColor: "rgba(8,12,16,0.7)",
    shadowColor: Colors.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "rgba(56,215,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  beta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(184,140,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(184,140,255,0.45)",
  },
  betaText: { color: Colors.violet, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.cyan,
    shadowColor: Colors.cyan,
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  sub: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  refresh: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "rgba(56,215,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.3)",
  },
  list: { gap: 8 },
  item: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  emojiBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 18 },
  itemBody: { flex: 1, gap: 4 },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.2,
    flex: 1,
  },
  itemBodyText: {
    color: Colors.muted,
    fontSize: 11.5,
    fontWeight: "600",
    lineHeight: 16,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
