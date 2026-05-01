import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Bell,
  Bookmark,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  Flame,
  Globe2,
  MessageCircle,
  Send,
  Share2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import DexChart from "@/components/DexChart";
import { useTokenOverview } from "@/lib/api/market";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { fmtUsd } from "@/utils/format";

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

const formatUsd = fmtUsd;

export default function LaunchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getById, upvoted, toggleUpvote, remove } = useLaunchpad();
  const [copied, setCopied] = useState<boolean>(false);
  const [watching, setWatching] = useState<boolean>(false);

  const token = id ? getById(id) : null;
  const { data: overview } = useTokenOverview(token?.contract ?? null);
  const livePrice = overview?.price ?? token?.price ?? null;
  const liveChange = overview?.priceChange24h ?? token?.change24hPct ?? null;
  const liveLiq = overview?.liquidity ?? token?.liquidityUsd ?? null;
  const liveMc = overview?.marketCap ?? token?.marketCapUsd ?? null;
  const liveHolders = overview?.holder ?? token?.holders ?? null;

  const onCopy = useCallback(async () => {
    if (!token) return;
    await Clipboard.setStringAsync(token.contract);
    setCopied(true);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setTimeout(() => setCopied(false), 1500);
  }, [token]);

  const openLink = useCallback(async (url?: string) => {
    if (!url) return;
    const cleaned = url.startsWith("http") ? url : `https://${url}`;
    try {
      await WebBrowser.openBrowserAsync(cleaned);
    } catch {
      Linking.openURL(cleaned).catch(() => {});
    }
  }, []);

  const onDelete = useCallback(() => {
    if (!token) return;
    Alert.alert("Remove listing?", "This will remove the token from your listings.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          remove(token.id);
          router.back();
        },
      },
    ]);
  }, [token, remove, router]);

  const onUpvote = useCallback(() => {
    if (!token) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    toggleUpvote(token.id);
  }, [token, toggleUpvote]);

  const positive = useMemo(() => (liveChange ?? 0) >= 0, [liveChange]);
  const accent = positive ? Colors.mint : Colors.rose;

  if (!token) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <View style={styles.notFoundWrap}>
            <Text style={styles.notFoundTitle}>Token not found</Text>
            <Text style={styles.notFoundBody}>This listing may have been removed.</Text>
            <Pressable onPress={() => router.back()} style={styles.backBtnSolo} testID="back-not-found">
              <Text style={styles.backBtnText}>Go back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const isMine = token.submittedBy === "user";
  const isUpvoted = !!upvoted[token.id];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.bannerWrap}>
            {token.bannerUrl ? (
              <Image source={{ uri: token.bannerUrl }} style={styles.banner} contentFit="cover" />
            ) : token.logoUrl ? (
              <>
                <Image
                  source={{ uri: token.logoUrl }}
                  style={styles.banner}
                  contentFit="cover"
                  blurRadius={Platform.OS === "web" ? 30 : 24}
                />
                <LinearGradient
                  colors={["rgba(3,7,8,0.55)", "rgba(3,7,8,0.25)"]}
                  style={styles.banner}
                />
              </>
            ) : (
              <LinearGradient
                colors={["rgba(85,245,178,0.32)", "rgba(56,215,255,0.05)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.banner}
              />
            )}
            <LinearGradient
              colors={["rgba(3,7,8,0)", "rgba(3,7,8,0.7)", Colors.ink]}
              style={styles.bannerFade}
            />
            <View style={styles.headerBar}>
              <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8} testID="back-btn">
                <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
              </Pressable>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => setWatching((v) => !v)}
                  style={styles.iconBtn}
                  hitSlop={8}
                  testID="watch-btn"
                >
                  <Bookmark
                    color={watching ? Colors.mint : Colors.text}
                    size={16}
                    strokeWidth={2.6}
                    fill={watching ? Colors.mint : "transparent"}
                  />
                </Pressable>
                <Pressable style={styles.iconBtn} hitSlop={8} testID="share-btn">
                  <Share2 color={Colors.text} size={16} strokeWidth={2.6} />
                </Pressable>
                {isMine ? (
                  <Pressable onPress={onDelete} style={styles.iconBtn} hitSlop={8} testID="delete-btn">
                    <Trash2 color={Colors.rose} size={16} strokeWidth={2.6} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.headWrap}>
            <View style={styles.logoBlock}>
              {token.logoUrl ? (
                <Image source={{ uri: token.logoUrl }} style={styles.logo} contentFit="cover" />
              ) : (
                <LinearGradient
                  colors={[Colors.mint, Colors.cyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.logo, styles.logoFallback]}
                >
                  <Text style={styles.logoText}>{token.ticker.slice(0, 2)}</Text>
                </LinearGradient>
              )}
            </View>

            <View style={styles.headInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {token.name}
                </Text>
                {token.featured ? <Crown color={Colors.orange} size={14} strokeWidth={2.6} /> : null}
                {token.hot ? <Flame color={Colors.orange} size={14} strokeWidth={2.6} /> : null}
              </View>
              <View style={styles.metaRow}>
                <View style={styles.tickerPill}>
                  <Text style={styles.tickerText}>${token.ticker}</Text>
                </View>
                <View style={styles.venuePill}>
                  <Text style={styles.venueText}>{token.venue}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor:
                        token.status === "live" ? "rgba(85,245,178,0.14)" : "rgba(255,255,255,0.05)",
                    },
                  ]}
                >
                  {token.status === "live" ? <View style={styles.liveDot} /> : null}
                  <Text
                    style={[
                      styles.statusText,
                      { color: token.status === "live" ? Colors.mint : Colors.muted },
                    ]}
                  >
                    {token.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>Market cap</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceValue}>
                {liveMc != null && liveMc > 0 ? formatUsd(liveMc) : "—"}
              </Text>
              {liveChange != null ? (
                <View style={[styles.changeBadge, { backgroundColor: `${accent}1A`, borderColor: `${accent}55` }]}>
                  {positive ? (
                    <TrendingUp color={accent} size={12} strokeWidth={3} />
                  ) : (
                    <TrendingDown color={accent} size={12} strokeWidth={3} />
                  )}
                  <Text style={[styles.changeText, { color: accent }]}>
                    {positive ? "+" : ""}
                    {liveChange.toFixed(2)}%
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.priceSubLine}>
              Price {livePrice != null && livePrice > 0 ? formatUsd(livePrice) : "—"}
              {liveLiq != null && liveLiq > 0 ? `  ·  Liq ${formatUsd(liveLiq)}` : ""}
            </Text>
            <View style={styles.chartEmbed} testID="chart-embed">
              <DexChart contract={token.contract} height={320} />
            </View>
            <View style={styles.chartCtaRow}>
              <Pressable
                onPress={() => openLink(`https://dexscreener.com/solana/${token.contract}`)}
                style={styles.chartCta}
                testID="open-dexscreener"
              >
                <Text style={styles.chartCtaText}>DexScreener →</Text>
              </Pressable>
              <Pressable
                onPress={() => openLink(`https://birdeye.so/token/${token.contract}?chain=solana`)}
                style={styles.chartCta}
                testID="open-birdeye"
              >
                <Text style={styles.chartCtaText}>Birdeye →</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <Metric label="Liquidity" value={formatUsd(liveLiq)} />
            <Metric label="Market cap" value={formatUsd(liveMc)} />
            <Metric label="24h volume" value={formatUsd(token.volume24hUsd)} />
            <Metric label="Holders" value={liveHolders ? liveHolders.toLocaleString() : "—"} />
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={onUpvote}
              style={[styles.actionBtn, isUpvoted && styles.actionBtnOn]}
              testID="upvote-btn"
            >
              <Flame
                color={isUpvoted ? Colors.orange : Colors.text}
                size={15}
                strokeWidth={2.6}
                fill={isUpvoted ? Colors.orange : "transparent"}
              />
              <Text style={[styles.actionText, isUpvoted && { color: Colors.orange }]}>
                Boost · {token.upvotes}
              </Text>
            </Pressable>
            <Pressable style={styles.actionBtn} testID="alerts-btn">
              <Bell color={Colors.text} size={15} strokeWidth={2.6} />
              <Text style={styles.actionText}>Alerts</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} testID="watchers-btn">
              <Users color={Colors.text} size={15} strokeWidth={2.6} />
              <Text style={styles.actionText}>{token.watchers}</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Contract</Text>
            <Pressable onPress={onCopy} style={styles.contractRow} testID="contract-copy">
              <Text style={styles.contractText}>{shortAddress(token.contract)}</Text>
              <View style={styles.copyBadge}>
                {copied ? (
                  <Check color={Colors.mint} size={12} strokeWidth={3} />
                ) : (
                  <Copy color={Colors.muted} size={12} strokeWidth={2.6} />
                )}
                <Text style={[styles.copyText, copied && { color: Colors.mint }]}>
                  {copied ? "Copied" : "Copy"}
                </Text>
              </View>
            </Pressable>
          </View>

          {token.description.trim().length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>About</Text>
              <Text style={styles.descText}>{token.description}</Text>
            </View>
          ) : null}

          {token.tags.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Tags</Text>
              <View style={styles.tagRow}>
                {token.tags.map((t) => (
                  <View key={t} style={styles.tagPill}>
                    <Text style={styles.tagText}>#{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Links</Text>
            <View style={styles.linksCol}>
              <LinkRow Icon={Globe2} label="Website" value={token.website} onPress={() => openLink(token.website)} />
              <LinkRow Icon={AtSign} label="Twitter" value={token.twitter} onPress={() => openLink(token.twitter)} />
              <LinkRow
                Icon={Send}
                label="Telegram"
                value={token.telegram}
                onPress={() => openLink(token.telegram)}
              />
              <LinkRow
                Icon={MessageCircle}
                label="Discord"
                value={token.discord}
                onPress={() => openLink(token.discord)}
              />
            </View>
          </View>

          <Pressable
            onPress={() => openLink(`https://dexscreener.com/solana/${token.contract}`)}
            style={styles.tradeBtn}
            testID="trade-btn"
          >
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tradeGradient}
            >
              <ArrowUpRight color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={styles.tradeText}>Open on DEXScreener</Text>
              <ExternalLink color={Colors.ink} size={14} strokeWidth={3} />
            </LinearGradient>
          </Pressable>

          <View style={styles.viewsRow}>
            <Eye color={Colors.muted} size={12} strokeWidth={2.4} />
            <Text style={styles.viewsText}>
              Listed {new Date(token.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function LinkRow({
  Icon,
  label,
  value,
  onPress,
}: {
  Icon: typeof Globe2;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  const has = !!value && value.trim().length > 0;
  return (
    <Pressable
      onPress={has ? onPress : undefined}
      disabled={!has}
      style={[styles.linkRow, !has && styles.linkRowDisabled]}
      testID={`link-${label.toLowerCase()}`}
    >
      <View style={styles.linkLeft}>
        <View style={styles.linkIconBox}>
          <Icon color={has ? Colors.mint : Colors.muted} size={13} strokeWidth={2.6} />
        </View>
        <View>
          <Text style={styles.linkLabel}>{label}</Text>
          <Text style={styles.linkValue} numberOfLines={1}>
            {has ? value : "Not provided"}
          </Text>
        </View>
      </View>
      {has ? <ExternalLink color={Colors.muted} size={14} strokeWidth={2.4} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingBottom: 64 },

  bannerWrap: { height: 200, position: "relative" },
  banner: { ...StyleSheet.absoluteFillObject },
  bannerFade: { ...StyleSheet.absoluteFillObject },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  headWrap: {
    marginTop: -32,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 14,
  },
  logoBlock: { borderRadius: 22, padding: 4, backgroundColor: Colors.ink },
  logo: { width: 76, height: 76, borderRadius: 18 },
  logoFallback: { alignItems: "center", justifyContent: "center" },
  logoText: { color: Colors.ink, fontSize: 18, fontWeight: "900" },
  headInfo: { flex: 1, paddingBottom: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5, flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  tickerPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
  },
  tickerText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },
  venuePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)" },
  venueText: { color: Colors.muted, fontSize: 10, fontWeight: "800" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.mint },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },

  priceCard: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  priceLabel: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  priceValue: { color: Colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  priceSubLine: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 6, letterSpacing: 0.2 },
  changeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  changeText: { fontSize: 12, fontWeight: "900" },
  chartEmbed: {
    marginTop: 14,
    borderRadius: 14,
    overflow: "hidden",
  },
  chartImg: { ...StyleSheet.absoluteFillObject },
  chartFade: { ...StyleSheet.absoluteFillObject },
  chartCtaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  chartCta: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  chartCtaText: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8, marginTop: 12 },
  metric: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  metricLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  metricValue: { color: Colors.text, fontSize: 16, fontWeight: "900", marginTop: 4 },

  actionRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  actionBtnOn: { backgroundColor: "rgba(255,184,76,0.1)", borderColor: "rgba(255,184,76,0.4)" },
  actionText: { color: Colors.text, fontSize: 12, fontWeight: "900" },

  section: { marginTop: 22, paddingHorizontal: 16 },
  sectionLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  contractRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  contractText: { color: Colors.text, fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  copyBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  copyText: { color: Colors.muted, fontSize: 11, fontWeight: "900" },

  descText: { color: Colors.text, fontSize: 14, fontWeight: "500", lineHeight: 22 },

  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.1)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
  },
  tagText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },

  linksCol: { gap: 8 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  linkRowDisabled: { opacity: 0.6 },
  linkLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  linkIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  linkLabel: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  linkValue: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2, maxWidth: 220 },

  tradeBtn: { marginHorizontal: 16, marginTop: 22, borderRadius: 14, overflow: "hidden" },
  tradeGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  tradeText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

  viewsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
  },
  viewsText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

  notFoundWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  notFoundTitle: { color: Colors.text, fontSize: 20, fontWeight: "900" },
  notFoundBody: { color: Colors.muted, fontSize: 13, fontWeight: "600", marginTop: 6, textAlign: "center" },
  backBtnSolo: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: Colors.mint,
  },
  backBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
