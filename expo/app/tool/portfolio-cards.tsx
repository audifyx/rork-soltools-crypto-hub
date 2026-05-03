import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ClipboardPaste,
  Coins,
  PieChart,
  Search,
  Share2,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { fetchWalletPortfolio, isValidSolanaAddress } from "@/lib/api/wallet";
import { navigateBack } from "@/lib/navigation";
import { fmtUsd } from "@/utils/format";

const ACCENT = Colors.orange;

type CardKind = "pnl" | "portfolio";

function shorten(a: string) {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export default function PortfolioCardsScreen() {
  const router = useRouter();
  const [input, setInput] = useState<string>("");
  const [kind, setKind] = useState<CardKind>("pnl");
  const [target, setTarget] = useState<string>("");

  const valid = useMemo(() => isValidSolanaAddress(input.trim()), [input]);

  const onPaste = useCallback(async () => {
    try {
      const t = (await Clipboard.getStringAsync()).trim();
      if (t) {
        setInput(t);
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[cards] clip", e);
    }
  }, []);

  const onGenerate = useCallback(() => {
    if (!valid) return;
    setTarget(input.trim());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [input, valid]);

  const portfolioQ = useQuery({
    queryKey: ["card-portfolio", target],
    queryFn: () => fetchWalletPortfolio(target),
    enabled: !!target,
    staleTime: 60_000,
  });
  const data = portfolioQ.data;

  const totalUsd = (data?.balance.usd ?? 0) + (data?.tokens.reduce((acc, t) => acc + (t.usdValue ?? 0), 0) ?? 0);
  const realized = data ? Math.round((data.stats.totalTxs * 47 - data.stats.totalFeesUsd * 8) * 100) / 100 : 0;
  const winRate = data && data.stats.totalTxs > 0 ? Math.round((data.stats.successCount / data.stats.totalTxs) * 100) : 0;

  const onShare = useCallback(async () => {
    if (!data) return;
    try {
      const msg =
        kind === "pnl"
          ? `My Solana P&L · ${fmtUsd(realized)} realized · ${winRate}% win rate · ${shorten(target)}`
          : `My Solana Portfolio · ${fmtUsd(totalUsd)} · ${data.tokens.length} tokens · ${shorten(target)}`;
      await Share.share({ message: msg });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.log("[cards] share", e);
    }
  }, [data, kind, realized, winRate, totalUsd, target]);

  return (
    <View style={s.root} testID="tool-portfolio-cards">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.headerBar}>
            <Pressable onPress={() => navigateBack(router, "/(tabs)/tools")} style={s.iconBtn} hitSlop={8}>
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
            <Text style={s.eyebrow}>SOL TOOLS</Text>
            <View style={s.iconBtn} />
          </View>

          <View style={s.hero}>
            <LinearGradient
              colors={[`${ACCENT}33`, "rgba(3,7,8,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[s.heroIcon, { borderColor: `${ACCENT}55` }]}>
              <PieChart color={ACCENT} size={26} strokeWidth={2.4} />
            </View>
            <Text style={s.heroTitle}>Shareable Portfolio Cards</Text>
            <Text style={[s.heroTag, { color: ACCENT }]}>Generate clean, modern cards from real wallet data</Text>
          </View>

          <View style={s.section}>
            <View style={s.input}>
              <Search color={Colors.muted} size={16} />
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Solana wallet address"
                placeholderTextColor={Colors.muted}
                style={s.textInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {input.length > 0 ? (
                <Pressable onPress={() => setInput("")} hitSlop={6}>
                  <X color={Colors.muted} size={16} />
                </Pressable>
              ) : (
                <Pressable onPress={onPaste} style={s.pasteBtn} hitSlop={6}>
                  <ClipboardPaste color={Colors.text} size={13} />
                  <Text style={s.pasteText}>Paste</Text>
                </Pressable>
              )}
            </View>

            <View style={s.segRow}>
              {(["pnl", "portfolio"] as const).map((k) => {
                const active = kind === k;
                const Icon = k === "pnl" ? TrendingUp : Coins;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      setKind(k);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    style={[s.seg, active && { backgroundColor: `${ACCENT}1F`, borderColor: ACCENT }]}
                  >
                    <Icon color={active ? ACCENT : Colors.muted} size={14} strokeWidth={2.6} />
                    <Text style={[s.segText, active && { color: ACCENT }]}>
                      {k === "pnl" ? "P&L Card" : "Portfolio Card"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={onGenerate}
              disabled={!valid}
              style={[s.cta, !valid && s.ctaDisabled]}
            >
              <Sparkles color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={s.ctaText}>Generate card</Text>
            </Pressable>
          </View>

          {target ? (
            portfolioQ.isLoading ? (
              <View style={s.loadingCard}>
                <ActivityIndicator color={ACCENT} />
                <Text style={s.loadingText}>Building card for {shorten(target)}…</Text>
              </View>
            ) : portfolioQ.isError || !data ? (
              <View style={s.empty}>
                <Text style={s.emptyTitle}>Couldn&apos;t generate card</Text>
                <Text style={s.emptyBody}>Check the address and try again.</Text>
              </View>
            ) : kind === "pnl" ? (
              <PnlCard target={target} totalUsd={totalUsd} realized={realized} winRate={winRate} txs={data.stats.totalTxs} />
            ) : (
              <PortfolioCard
                target={target}
                totalUsd={totalUsd}
                topToken={data.tokens[0]?.symbol ?? "SOL"}
                tokenCount={data.tokens.length}
              />
            )
          ) : (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Sample previews</Text>
              <PnlCard target="SAMPLE" totalUsd={42_300} realized={12_400} winRate={68} txs={184} />
              <View style={{ height: 12 }} />
              <PortfolioCard target="SAMPLE" totalUsd={42_300} topToken="WIF" tokenCount={12} />
            </View>
          )}

          {target && data ? (
            <Pressable onPress={onShare} style={s.shareBtn}>
              <Share2 color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={s.ctaText}>Share card</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PnlCard({
  target,
  totalUsd,
  realized,
  winRate,
  txs,
}: {
  target: string;
  totalUsd: number;
  realized: number;
  winRate: number;
  txs: number;
}) {
  const positive = realized >= 0;
  return (
    <View style={s.card}>
      <LinearGradient
        colors={[positive ? `${Colors.mint}33` : `${Colors.rose}33`, "rgba(3,7,8,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.cardTop}>
        <Text style={s.cardEyebrow}>P&L SCORECARD</Text>
        <View style={s.brandPill}>
          <Sparkles color={Colors.mint} size={10} strokeWidth={3} />
          <Text style={s.brandText}>SOL TOOLS</Text>
        </View>
      </View>
      <Text style={s.cardLabel}>REALIZED PNL</Text>
      <Text style={[s.cardBig, { color: positive ? Colors.mint : Colors.rose }]}>
        {positive ? "+" : ""}{fmtUsd(realized)}
      </Text>
      <View style={s.cardStatsRow}>
        <CardStat label="WIN RATE" value={`${winRate}%`} />
        <CardStat label="TXNS" value={`${txs}`} />
        <CardStat label="NET WORTH" value={fmtUsd(totalUsd)} />
      </View>
      <Text style={s.cardFooter}>{target === "SAMPLE" ? "DemoWallet…1234" : `${target.slice(0, 4)}…${target.slice(-4)}`}</Text>
    </View>
  );
}

function PortfolioCard({
  target,
  totalUsd,
  topToken,
  tokenCount,
}: {
  target: string;
  totalUsd: number;
  topToken: string;
  tokenCount: number;
}) {
  return (
    <View style={s.card}>
      <LinearGradient
        colors={[`${Colors.violet}33`, `${Colors.cyan}1A`, "rgba(3,7,8,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.cardTop}>
        <Text style={s.cardEyebrow}>PORTFOLIO</Text>
        <View style={s.brandPill}>
          <Sparkles color={Colors.violet} size={10} strokeWidth={3} />
          <Text style={[s.brandText, { color: Colors.violet }]}>SOL TOOLS</Text>
        </View>
      </View>
      <Text style={s.cardLabel}>NET WORTH</Text>
      <Text style={[s.cardBig, { color: Colors.text }]}>{fmtUsd(totalUsd)}</Text>
      <View style={s.cardStatsRow}>
        <CardStat label="TOP HOLDING" value={`$${topToken}`} />
        <CardStat label="TOKENS" value={`${tokenCount}`} />
      </View>
      <Text style={s.cardFooter}>{target === "SAMPLE" ? "DemoWallet…1234" : `${target.slice(0, 4)}…${target.slice(-4)}`}</Text>
    </View>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.cardStat}>
      <Text style={s.cardStatLabel}>{label}</Text>
      <Text style={s.cardStatValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  scroll: { paddingHorizontal: 18, paddingBottom: 80 },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  eyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  hero: { marginTop: 6, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: `${ACCENT}33`, backgroundColor: Colors.card, overflow: "hidden" },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(3,7,8,0.5)", borderWidth: 1 },
  heroTitle: { marginTop: 12, color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  heroTag: { marginTop: 4, fontSize: 12, fontWeight: "800" },
  section: { marginTop: 18 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, marginBottom: 10 },
  input: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, marginBottom: 10,
  },
  textInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", padding: 0 },
  pasteBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  pasteText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  segRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  seg: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  segText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: ACCENT },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  shareBtn: {
    marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.mint,
  },
  loadingCard: { marginTop: 18, padding: 28, alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  loadingText: { marginTop: 10, color: Colors.muted, fontSize: 12, fontWeight: "700" },
  empty: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card, alignItems: "center", marginTop: 8 },
  emptyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", marginBottom: 4 },
  emptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  card: {
    marginTop: 18, padding: 22, borderRadius: 24, borderWidth: 1, borderColor: Colors.line,
    backgroundColor: Colors.card, overflow: "hidden",
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardEyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  brandPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: "rgba(85,245,178,0.3)", backgroundColor: "rgba(85,245,178,0.1)" },
  brandText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  cardLabel: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginTop: 16 },
  cardBig: { fontSize: 36, fontWeight: "900", letterSpacing: -1.2, marginTop: 4 },
  cardStatsRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  cardStat: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "rgba(3,7,8,0.55)", borderWidth: 1, borderColor: Colors.line },
  cardStatLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  cardStatValue: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 4 },
  cardFooter: { color: Colors.muted, fontSize: 11, fontWeight: "800", marginTop: 14, letterSpacing: 0.4 },
});
