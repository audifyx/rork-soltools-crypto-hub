import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Brain,
  ChartLine,
  CheckCircle2,
  ClipboardPaste,
  Gauge,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Waves,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";

type LucideIcon = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

export default function AIAnalysisScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [analyzed, setAnalyzed] = useState<boolean>(false);

  const onAnalyze = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (token.trim().length > 0) setAnalyzed(true);
  }, [token]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <View style={styles.iconBadge}>
              <Brain color={Colors.cyan} size={14} strokeWidth={2.6} />
            </View>
            <Text style={styles.topTitle}>AI Analysis</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["rgba(56,215,255,0.18)", "rgba(3,7,8,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroLive}>
              <Sparkles color={Colors.cyan} size={11} strokeWidth={3} />
              <Text style={styles.heroLiveText}>AI ENGINE • RPC</Text>
            </View>
            <Text style={styles.heroTitle}>Deep token analysis</Text>
            <Text style={styles.heroSub}>
              Holder clusters, LP locks, smart-money flow, tax behavior and a unified
              risk score — generated on demand.
            </Text>
          </LinearGradient>

          <View style={styles.inputCard}>
            <Search color={Colors.muted} size={18} strokeWidth={2.4} />
            <TextInput
              testID="token-input"
              placeholder="Paste token address or symbol…"
              placeholderTextColor={Colors.muted}
              style={styles.input}
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ClipboardPaste color={Colors.cyan} size={18} strokeWidth={2.4} />
          </View>

          <Pressable onPress={onAnalyze} style={styles.analyzeBtn}>
            <Zap color={Colors.ink} size={16} strokeWidth={3} />
            <Text style={styles.analyzeText}>
              {analyzed ? "Re-run Analysis" : "Run AI Analysis"}
            </Text>
          </Pressable>

          {analyzed ? (
            <>
              <View style={styles.scoreCard}>
                <View style={styles.scoreLeft}>
                  <Text style={styles.scoreLabel}>RISK SCORE</Text>
                  <Text style={styles.scoreValue}>74</Text>
                  <Text style={styles.scoreOutOf}>/ 100</Text>
                </View>
                <View style={styles.scoreRight}>
                  <View style={styles.scoreBarTrack}>
                    <View style={[styles.scoreBarFill, { width: "74%" }]} />
                  </View>
                  <View style={styles.scoreVerdict}>
                    <CheckCircle2 color={Colors.mint} size={14} strokeWidth={2.6} />
                    <Text style={styles.scoreVerdictText}>Healthy signals</Text>
                  </View>
                </View>
              </View>

              <View style={styles.metricsGrid}>
                <Metric
                  Icon={Users}
                  label="Holders"
                  value="12,481"
                  delta="+421 / 24h"
                  tone="mint"
                />
                <Metric
                  Icon={Shield}
                  label="LP Locked"
                  value="98.2%"
                  delta="6 mo lock"
                  tone="cyan"
                />
                <Metric
                  Icon={Waves}
                  label="Smart Money"
                  value="34 buys"
                  delta="last 24h"
                  tone="orange"
                />
                <Metric
                  Icon={Gauge}
                  label="Tax"
                  value="0% / 0%"
                  delta="buy / sell"
                  tone="mint"
                />
              </View>

              <SectionHeader title="AI Verdict" />
              <View style={styles.verdictCard}>
                <Text style={styles.verdictTitle}>Looks structurally healthy.</Text>
                <Text style={styles.verdictBody}>
                  Holder distribution is wide, top 10 wallets control under 14% of
                  supply, LP is locked for 6 months, and smart-money wallets have been
                  net accumulators for 3 consecutive days. No honeypot or tax flags
                  detected on simulated trades.
                </Text>
                <View style={styles.flagRow}>
                  <Flag Icon={CheckCircle2} text="No mint authority" tone="mint" />
                  <Flag Icon={CheckCircle2} text="No freeze authority" tone="mint" />
                  <Flag Icon={ShieldAlert} text="Watch insider cluster" tone="orange" />
                </View>
              </View>

              <SectionHeader title="On-chain Trend" />
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <ChartLine color={Colors.cyan} size={14} strokeWidth={2.6} />
                  <Text style={styles.chartTitle}>Net Flow • 24h</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.chartDelta}>+$284K</Text>
                </View>
                <View style={styles.chartBars}>
                  {[28, 42, 36, 58, 72, 64, 88, 76, 92, 84, 96, 100].map(
                    (h, i) => (
                      <View
                        key={i}
                        style={[
                          styles.chartBar,
                          {
                            height: h,
                            backgroundColor:
                              i % 2 === 0
                                ? "rgba(56,215,255,0.7)"
                                : "rgba(85,245,178,0.7)",
                          },
                        ]}
                      />
                    )
                  )}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.placeholder}>
              <View style={styles.placeholderIcon}>
                <Brain color={Colors.cyan} size={28} strokeWidth={2.4} />
              </View>
              <Text style={styles.placeholderTitle}>Ready to analyze</Text>
              <Text style={styles.placeholderBody}>
                Paste any token to get a full AI breakdown — risk, holders, LP, smart
                money and chart trends.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Metric({
  Icon,
  label,
  value,
  delta,
  tone,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
  tone: "mint" | "cyan" | "orange";
}) {
  const color =
    tone === "mint" ? Colors.mint : tone === "cyan" ? Colors.cyan : Colors.orange;
  return (
    <View style={[styles.metricCard, { borderColor: `${color}33` }]}>
      <View
        style={[
          styles.metricIcon,
          { backgroundColor: `${color}1A`, borderColor: `${color}40` },
        ]}
      >
        <Icon color={color} size={14} strokeWidth={2.6} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={[styles.metricDelta, { color }]}>{delta}</Text>
    </View>
  );
}

function Flag({
  Icon,
  text,
  tone,
}: {
  Icon: LucideIcon;
  text: string;
  tone: "mint" | "orange";
}) {
  const color = tone === "mint" ? Colors.mint : Colors.orange;
  return (
    <View style={[styles.flagChip, { borderColor: `${color}40` }]}>
      <Icon color={color} size={12} strokeWidth={2.6} />
      <Text style={[styles.flagText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 80 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  topTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(56,215,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  hero: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.25)",
    marginTop: 4,
  },
  heroLive: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.6)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.4)",
  },
  heroLiveText: {
    color: Colors.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 12,
  },
  heroSub: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 6,
  },

  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    marginTop: 16,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    padding: 0,
  },

  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Colors.cyan,
    marginTop: 12,
  },
  analyzeText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  scoreCard: {
    flexDirection: "row",
    gap: 16,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
    backgroundColor: Colors.card,
    marginTop: 22,
  },
  scoreLeft: { alignItems: "flex-start" },
  scoreLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  scoreValue: {
    color: Colors.mint,
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 60,
  },
  scoreOutOf: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: -4,
  },
  scoreRight: { flex: 1, justifyContent: "center", gap: 12 },
  scoreBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(85,245,178,0.12)",
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    backgroundColor: Colors.mint,
    borderRadius: 4,
  },
  scoreVerdict: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreVerdictText: {
    color: Colors.mint,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  metricCard: {
    width: "48%",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: Colors.card,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 10,
  },
  metricValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  metricDelta: { fontSize: 11, fontWeight: "800", marginTop: 2 },

  sectionRow: {
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  verdictCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  verdictTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  verdictBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 6,
  },
  flagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  flagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(3,7,8,0.5)",
  },
  flagText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },

  chartCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  chartHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  chartTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  chartDelta: {
    color: Colors.mint,
    fontSize: 13,
    fontWeight: "900",
  },
  chartBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    height: 110,
    marginTop: 14,
  },
  chartBar: {
    flex: 1,
    borderRadius: 4,
  },

  placeholder: {
    alignItems: "center",
    paddingVertical: 50,
    paddingHorizontal: 30,
    marginTop: 20,
  },
  placeholderIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "rgba(56,215,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 14,
  },
  placeholderBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
});

const _u = TrendingUp;
void _u;
