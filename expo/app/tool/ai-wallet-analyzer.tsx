import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Bot,
  Brain,
  ClipboardPaste,
  Send,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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

const ACCENT = Colors.violet;

function shorten(a: string) {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export default function AiWalletAnalyzerScreen() {
  const router = useRouter();
  const [input, setInput] = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const [analysis, setAnalysis] = useState<string>("");
  const [thinking, setThinking] = useState<boolean>(false);

  const valid = useMemo(() => isValidSolanaAddress(input.trim()), [input]);

  const onPaste = useCallback(async () => {
    try {
      const t = (await Clipboard.getStringAsync()).trim();
      if (t) {
        setInput(t);
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[ai-wallet] clip", e);
    }
  }, []);

  const portfolioQ = useQuery({
    queryKey: ["ai-wallet-portfolio", target],
    queryFn: () => fetchWalletPortfolio(target),
    enabled: !!target,
    staleTime: 60_000,
  });
  const data = portfolioQ.data;

  const onAnalyze = useCallback(async () => {
    if (!valid) return;
    const addr = input.trim();
    setTarget(addr);
    setAnalysis("");
    setThinking(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const port = await fetchWalletPortfolio(addr);
      const totalUsd =
        port.balance.usd + port.tokens.reduce((acc, t) => acc + (t.usdValue ?? 0), 0);
      const tops = port.tokens
        .slice(0, 6)
        .map((t) => `${t.symbol ?? t.mint.slice(0, 4)} ${fmtUsd(t.usdValue ?? 0)}`)
        .join(", ");
      setAnalysis(
        `Wallet ${shorten(addr)}\n\n` +
          `Net worth: ${fmtUsd(totalUsd)}\n` +
          `SOL: ${port.balance.sol.toFixed(3)}\n` +
          `Token count: ${port.tokens.length}\n` +
          `Top holdings: ${tops || "none"}\n` +
          `Total txns: ${port.stats.totalTxs}\n` +
          `Active days: ${port.stats.activeDays}\n` +
          `Success rate: ${port.stats.successRate.toFixed(0)}%\n` +
          `Total fees: ${fmtUsd(port.stats.totalFeesUsd)}\n\n` +
          `AI analysis is disabled in this build, but live wallet data loaded successfully.`
      );
    } catch (e) {
      console.log("[ai-wallet] failed", e);
      setAnalysis(e instanceof Error ? `Error: ${e.message}` : "Analysis failed.");
    } finally {
      setThinking(false);
    }
  }, [input, valid]);

  return (
    <View style={s.root} testID="tool-ai-wallet-analyzer">
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
            <View style={s.heroTop}>
              <View style={[s.heroIcon, { borderColor: `${ACCENT}55` }]}>
                <Brain color={ACCENT} size={26} strokeWidth={2.4} />
              </View>
              <View style={s.priceChip}>
                <Zap color={Colors.mint} size={11} strokeWidth={3} />
                <Text style={s.priceChipText}>10/scan</Text>
              </View>
            </View>
            <Text style={s.heroTitle}>AI Wallet Analyzer</Text>
            <Text style={[s.heroTag, { color: ACCENT }]}>Deep analysis of any wallet</Text>
            <View style={s.subRow}>
              <Bot color={Colors.muted} size={11} strokeWidth={2.6} />
              <Text style={s.subText}>AI Trading Assistant · On-Chain Analysis</Text>
            </View>
          </View>

          <View style={s.section}>
            <View style={s.input}>
              <Wallet color={Colors.muted} size={16} />
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Enter wallet address to analyze…"
                placeholderTextColor={Colors.muted}
                style={s.textInput}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={onAnalyze}
                returnKeyType="search"
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
            <Pressable
              onPress={onAnalyze}
              disabled={!valid || thinking}
              style={[s.cta, (!valid || thinking) && s.ctaDisabled]}
            >
              {thinking ? (
                <ActivityIndicator color={Colors.ink} />
              ) : (
                <Sparkles color={Colors.ink} size={16} strokeWidth={3} />
              )}
              <Text style={s.ctaText}>{thinking ? "Analyzing…" : "Analyze wallet"}</Text>
            </Pressable>
          </View>

          {target && data ? (
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>WALLET SNAPSHOT · {shorten(target)}</Text>
              <View style={s.summaryRow}>
                <SummaryStat label="Net" value={fmtUsd(data.balance.usd + data.tokens.reduce((a, t) => a + (t.usdValue ?? 0), 0))} />
                <SummaryStat label="Tokens" value={`${data.tokens.length}`} />
                <SummaryStat label="Txns" value={`${data.stats.totalTxs}`} />
                <SummaryStat label="Days" value={`${data.stats.activeDays}`} />
              </View>
            </View>
          ) : null}

          {thinking && !analysis ? (
            <View style={s.loadingCard}>
              <ActivityIndicator color={ACCENT} />
              <Text style={s.loadingText}>AI is reading on-chain data…</Text>
            </View>
          ) : null}

          {analysis ? (
            <View style={s.aiCard}>
              <View style={s.aiHead}>
                <View style={[s.aiAvatar, { backgroundColor: `${ACCENT}1A`, borderColor: `${ACCENT}55` }]}>
                  <Brain color={ACCENT} size={14} strokeWidth={2.6} />
                </View>
                <Text style={s.aiName}>AI Trading Assistant</Text>
              </View>
              <Text style={s.aiBody}>{analysis}</Text>
            </View>
          ) : null}

          {!target ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>What it analyzes</Text>
              {[
                "Behavior pattern (sniper, holder, swing, farmer)",
                "Risk traits and concentration",
                "Strengths and biggest holdings",
                "Suggested next actions",
              ].map((t) => (
                <View key={t} style={s.bulletRow}>
                  <View style={[s.bulletDot, { backgroundColor: ACCENT }]} />
                  <Text style={s.bulletText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryStat}>
      <Text style={s.summaryStatLabel}>{label}</Text>
      <Text style={s.summaryStatValue}>{value}</Text>
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
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(3,7,8,0.5)", borderWidth: 1 },
  priceChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(85,245,178,0.35)", backgroundColor: "rgba(85,245,178,0.1)" },
  priceChipText: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  heroTitle: { marginTop: 12, color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  heroTag: { marginTop: 4, fontSize: 12, fontWeight: "800" },
  subRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  subText: { color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  section: { marginTop: 18 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, marginBottom: 10 },
  input: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, marginBottom: 10,
  },
  textInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", padding: 0 },
  pasteBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  pasteText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: ACCENT },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  summaryCard: { marginTop: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  summaryLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 10 },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryStat: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "rgba(3,7,8,0.55)", borderWidth: 1, borderColor: Colors.line },
  summaryStatLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  summaryStatValue: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 4 },
  loadingCard: { marginTop: 14, padding: 28, alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  loadingText: { marginTop: 10, color: Colors.muted, fontSize: 12, fontWeight: "700" },
  aiCard: { marginTop: 14, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: `${ACCENT}33`, backgroundColor: Colors.card },
  aiHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  aiAvatar: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  aiName: { color: Colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  aiBody: { color: Colors.text, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, marginBottom: 8 },
  bulletDot: { width: 8, height: 8, borderRadius: 4 },
  bulletText: { color: Colors.text, fontSize: 12, fontWeight: "700" },
});
