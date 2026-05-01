import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  Brain,
  ChartCandlestick,
  ChartLine,
  Crosshair,
  Eye,
  Flame,
  Gauge,
  Mic,
  Radar,
  Rocket,
  Scan,
  Search,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  Waves,
  Wrench,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
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

type ToolCategory = "all" | "trade" | "scan" | "ai" | "social";

type Tool = {
  id: string;
  name: string;
  tagline: string;
  Icon: LucideIcon;
  accent: string;
  category: Exclude<ToolCategory, "all">;
  badge?: "NEW" | "PRO" | "BETA" | "HOT";
};

const TOOLS: Tool[] = [
  {
    id: "wallet-tracker",
    name: "Wallet Tracker",
    tagline: "Live PnL on any address",
    Icon: Wallet,
    accent: Colors.mint,
    category: "trade",
  },
  {
    id: "rug-scanner",
    name: "Rug Scanner",
    tagline: "AI risk score in seconds",
    Icon: Shield,
    accent: Colors.rose,
    category: "ai",
    badge: "PRO",
  },
  {
    id: "whale-radar",
    name: "Whale Radar",
    tagline: "Smart money in real-time",
    Icon: Radar,
    accent: Colors.cyan,
    category: "scan",
  },
  {
    id: "ai-analyst",
    name: "AI Analyst",
    tagline: "Gemini deep dive on any token",
    Icon: Brain,
    accent: Colors.cyan,
    category: "ai",
    badge: "NEW",
  },
  {
    id: "trending",
    name: "Trending Hub",
    tagline: "What's pumping right now",
    Icon: Flame,
    accent: Colors.orange,
    category: "scan",
  },
  {
    id: "alerts",
    name: "Smart Alerts",
    tagline: "Price + on-chain triggers",
    Icon: Bell,
    accent: Colors.mint,
    category: "trade",
  },
  {
    id: "voice-lobby",
    name: "Voice Lobbies",
    tagline: "Trade with your crew live",
    Icon: Mic,
    accent: Colors.rose,
    category: "social",
    badge: "BETA",
  },
  {
    id: "watchlist",
    name: "Watchlists",
    tagline: "Track your shortlist",
    Icon: Eye,
    accent: Colors.mint,
    category: "trade",
  },
  {
    id: "chart-share",
    name: "Chart Share",
    tagline: "Drop charts into chat",
    Icon: ChartLine,
    accent: Colors.cyan,
    category: "social",
  },
  {
    id: "copy-trade",
    name: "Copy Trade",
    tagline: "Mirror top wallets",
    Icon: Users,
    accent: Colors.orange,
    category: "trade",
    badge: "PRO",
  },
  {
    id: "honeypot",
    name: "Honeypot Check",
    tagline: "Buy/sell tax + lock detect",
    Icon: AlertTriangle,
    accent: Colors.rose,
    category: "ai",
  },
  {
    id: "holder-scan",
    name: "Holder X-Ray",
    tagline: "Cluster + insider mapping",
    Icon: Scan,
    accent: Colors.cyan,
    category: "scan",
  },
  {
    id: "alpha-bot",
    name: "Alpha Bot",
    tagline: "Telegram-style alpha feed",
    Icon: Bot,
    accent: Colors.mint,
    category: "ai",
  },
  {
    id: "candle-scanner",
    name: "Candle Scanner",
    tagline: "Pattern + breakout finder",
    Icon: ChartCandlestick,
    accent: Colors.orange,
    category: "scan",
  },
];

const FILTERS: { id: ToolCategory; label: string; Icon: LucideIcon }[] = [
  { id: "all", label: "All", Icon: Sparkles },
  { id: "trade", label: "Trade", Icon: Target },
  { id: "scan", label: "Scan", Icon: Radar },
  { id: "ai", label: "AI", Icon: Brain },
  { id: "social", label: "Social", Icon: Users },
];

export default function ToolsScreen() {
  const router = useRouter();
  const [active, setActive] = useState<ToolCategory>("all");
  const [query, setQuery] = useState<string>("");

  const onOpenTool = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (id === "new-pairs" || id === "lp-sniper") {
      router.push("/(tabs)/discover");
      return;
    }
    router.push({ pathname: "/tool/[id]", params: { id } });
  }, [router]);

  const filtered = useMemo<Tool[]>(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((t) => {
      const inCat = active === "all" || t.category === active;
      const inQuery =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q);
      return inCat && inQuery;
    });
  }, [active, query]);

  return (
    <View style={styles.root} testID="tools-screen">
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.headerBadge}>
                <Wrench color={Colors.mint} size={14} strokeWidth={2.6} />
                <Text style={styles.headerBadgeText}>TOOL DECK</Text>
              </View>
              <Text style={styles.headerTitle}>Tools</Text>
              <Text style={styles.headerSub}>
                Every edge, one tap away.
              </Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countPillNum}>{TOOLS.length}</Text>
              <Text style={styles.countPillLabel}>tools</Text>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Search color={Colors.muted} size={18} strokeWidth={2.4} />
            <TextInput
              testID="tools-search"
              placeholder="Search tools…"
              placeholderTextColor={Colors.muted}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            {FILTERS.map((f) => {
              const isActive = f.id === active;
              return (
                <Pressable
                  key={f.id}
                  testID={`filter-${f.id}`}
                  onPress={() => setActive(f.id)}
                  style={[
                    styles.filterChip,
                    isActive && styles.filterChipActive,
                  ]}
                >
                  <f.Icon
                    color={isActive ? Colors.ink : Colors.text}
                    size={14}
                    strokeWidth={2.6}
                  />
                  <Text
                    style={[
                      styles.filterText,
                      isActive && styles.filterTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <FeaturedCard onPress={() => onOpenTool("rug-scanner")} />

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>
              {active === "all" ? "All tools" : `${labelFor(active)} tools`}
            </Text>
            <Text style={styles.sectionCount}>{filtered.length}</Text>
          </View>

          <View style={styles.grid}>
            {filtered.map((t) => (
              <ToolCard key={t.id} tool={t} onPress={() => onOpenTool(t.id)} />
            ))}
            {filtered.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No tools match</Text>
                <Text style={styles.emptyBody}>
                  Try a different filter or keyword.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footerNote}>
            <Zap color={Colors.mint} size={14} strokeWidth={2.6} />
            <Text style={styles.footerText}>
              More tools shipping weekly. Vote in the Discord.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function labelFor(id: ToolCategory): string {
  const f = FILTERS.find((x) => x.id === id);
  return f?.label ?? "All";
}

function FeaturedCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable testID="featured-tool" onPress={onPress} style={styles.featured}>
      <LinearGradient
        colors={["rgba(85,245,178,0.18)", "rgba(56,215,255,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.featuredGrad}
      >
        <View style={styles.featuredTop}>
          <View style={styles.featuredBadge}>
            <Sparkles color={Colors.mint} size={12} strokeWidth={2.6} />
            <Text style={styles.featuredBadgeText}>FEATURED</Text>
          </View>
          <View style={styles.featuredLive}>
            <View style={styles.featuredDot} />
            <Text style={styles.featuredLiveText}>LIVE</Text>
          </View>
        </View>

        <Text style={styles.featuredTitle}>AI Rug Scanner</Text>
        <Text style={styles.featuredBody}>
          Paste a contract. Get holder clusters, LP locks, tax behavior, and a
          risk score in under 3 seconds.
        </Text>

        <View style={styles.featuredStatsRow}>
          <FeaturedStat Icon={Gauge} label="Risk" value="Live" />
          <FeaturedStat Icon={Activity} label="Speed" value="<3s" />
          <FeaturedStat Icon={Waves} label="On-chain" value="Deep" />
        </View>

        <View style={styles.featuredCta}>
          <Text style={styles.featuredCtaText}>Open Scanner</Text>
          <ArrowRight color={Colors.ink} size={16} strokeWidth={3} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function FeaturedStat({
  Icon,
  label,
  value,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.featStat}>
      <Icon color={Colors.mint} size={14} strokeWidth={2.6} />
      <View style={styles.featStatText}>
        <Text style={styles.featStatVal}>{value}</Text>
        <Text style={styles.featStatLabel}>{label}</Text>
      </View>
    </View>
  );
}

function ToolCard({ tool, onPress }: { tool: Tool; onPress: () => void }) {
  return (
    <Pressable
      testID={`tool-${tool.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolCard,
        { borderColor: `${tool.accent}33` },
        pressed && styles.toolCardPressed,
      ]}
    >
      <View
        style={[
          styles.toolIconWrap,
          {
            backgroundColor: `${tool.accent}1A`,
            borderColor: `${tool.accent}33`,
          },
        ]}
      >
        <tool.Icon color={tool.accent} size={20} strokeWidth={2.4} />
      </View>

      {tool.badge && (
        <View
          style={[
            styles.toolBadge,
            { backgroundColor: badgeBg(tool.badge), borderColor: `${tool.accent}55` },
          ]}
        >
          <Text style={[styles.toolBadgeText, { color: badgeColor(tool.badge) }]}>
            {tool.badge}
          </Text>
        </View>
      )}

      <Text style={styles.toolName} numberOfLines={1}>
        {tool.name}
      </Text>
      <Text style={styles.toolTag} numberOfLines={2}>
        {tool.tagline}
      </Text>

      <View style={styles.toolFooter}>
        <View style={[styles.toolDot, { backgroundColor: tool.accent }]} />
        <Text style={[styles.toolOpen, { color: tool.accent }]}>Open</Text>
        <ArrowRight color={tool.accent} size={12} strokeWidth={3} />
      </View>
    </Pressable>
  );
}

function badgeBg(badge: NonNullable<Tool["badge"]>): string {
  switch (badge) {
    case "NEW":
      return "rgba(85,245,178,0.16)";
    case "PRO":
      return "rgba(56,215,255,0.16)";
    case "HOT":
      return "rgba(255,184,76,0.18)";
    case "BETA":
      return "rgba(255,93,143,0.16)";
  }
}

function badgeColor(badge: NonNullable<Tool["badge"]>): string {
  switch (badge) {
    case "NEW":
      return Colors.mint;
    case "PRO":
      return Colors.cyan;
    case "HOT":
      return Colors.orange;
    case "BETA":
      return Colors.rose;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 8,
  },
  headerLeft: { flex: 1 },
  headerBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
    backgroundColor: "rgba(85,245,178,0.08)",
  },
  headerBadgeText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginTop: 10,
  },
  headerSub: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  countPill: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  countPillNum: {
    color: Colors.mint,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  countPillLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: -2,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    marginTop: 18,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    padding: 0,
  },

  filtersRow: { gap: 8, paddingVertical: 14, paddingRight: 12 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  filterChipActive: {
    backgroundColor: Colors.mint,
    borderColor: Colors.mint,
  },
  filterText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  filterTextActive: { color: Colors.ink },

  featured: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
    marginTop: 4,
  },
  featuredGrad: { padding: 18 },
  featuredTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.6)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.35)",
  },
  featuredBadgeText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  featuredLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.45)",
  },
  featuredDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.rose,
  },
  featuredLiveText: {
    color: Colors.rose,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  featuredTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 14,
  },
  featuredBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 6,
  },
  featuredStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  featStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.2)",
    backgroundColor: "rgba(3,7,8,0.45)",
  },
  featStatText: {},
  featStatVal: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  featStatLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  featuredCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.mint,
  },
  featuredCtaText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  sectionCount: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  toolCard: {
    width: "48%",
    minHeight: 148,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: Colors.card,
    justifyContent: "space-between",
  },
  toolCardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  toolIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toolBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  toolBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  toolName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 14,
  },
  toolTag: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    marginTop: 4,
  },
  toolFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  toolDot: { width: 5, height: 5, borderRadius: 3 },
  toolOpen: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  empty: {
    width: "100%",
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },

  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    alignSelf: "center",
  },
  footerText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
});

const _trend = TrendingUp;
void _trend;
