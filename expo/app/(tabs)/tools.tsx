import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  ArrowRight,
  Brain,
  ChevronRight,
  Clipboard as ClipboardIcon,
  Clock,
  Flame,
  MessageCircle,
  Search,
  ScanLine,
  Sparkles,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import Colors from "@/constants/colors";

type LucideIcon = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
  fill?: string;
}>;

type Tool = {
  id: string;
  route: string;
  name: string;
  tagline: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
  glow: string;
  gradient: [string, string];
  tags: string[];
  status: "LIVE" | "BETA";
};

const TOOLS: Tool[] = [
  {
    id: "token-lookup",
    route: "/tool/token-lookup",
    name: "Token Lookup",
    tagline: "Paste a contract, see everything",
    description:
      "Drop any Solana contract to view a full token snapshot — price, market cap, liquidity, holders — and a live DEX chart.",
    Icon: ScanLine,
    accent: Colors.cyan,
    glow: "rgba(56,215,255,0.22)",
    gradient: [Colors.cyan, "#7B5BFF"],
    tags: ["Live", "Chart", "On-chain"],
    status: "LIVE",
  },
  {
    id: "wallet-tracker",
    route: "/tool/wallet-tracker",
    name: "Wallet Tracker",
    tagline: "Live PnL on any Solana address",
    description:
      "Paste any wallet to see holdings, realized PnL, top trades, and live on-chain activity streamed via Helius RPC.",
    Icon: Wallet,
    accent: Colors.mint,
    glow: "rgba(85,245,178,0.22)",
    gradient: [Colors.mint, Colors.cyan],
    tags: ["Helius", "PnL", "Live"],
    status: "LIVE",
  },
  {
    id: "ai-analysis",
    route: "/tool/ai-analysis",
    name: "AI Analysis",
    tagline: "Deep-dive any token in seconds",
    description:
      "Holder clusters, LP locks, tax behavior, smart-money flow and a risk score — generated on demand by our AI engine.",
    Icon: Brain,
    accent: Colors.violet,
    glow: "rgba(184,140,255,0.22)",
    gradient: [Colors.violet, Colors.cyan],
    tags: ["AI", "Risk", "On-chain"],
    status: "LIVE",
  },
  {
    id: "ai-chat",
    route: "/tool/ai-chat",
    name: "Chat with AI",
    tagline: "Ask anything about a token or wallet",
    description:
      "Conversational AI with live Helius + RPC blockchain context. Ask about flows, history, narratives, and risk in plain English.",
    Icon: MessageCircle,
    accent: Colors.orange,
    glow: "rgba(255,184,76,0.22)",
    gradient: [Colors.orange, Colors.rose],
    tags: ["GPT", "RPC", "Context"],
    status: "BETA",
  },
];

const RECENT_KEY = "tools.recent.v1";
const MAX_RECENT = 5;

type RecentItem = { id: string; ts: number };

export default function ToolsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState<string>("");
  const [scan, setScan] = useState<string>("");
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as RecentItem[];
          if (Array.isArray(parsed)) setRecent(parsed.slice(0, MAX_RECENT));
        } catch (e) {
          console.log("[tools] parse recent error", e);
        }
      })
      .catch((e) => console.log("[tools] read recent error", e));
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const persistRecent = useCallback(async (next: RecentItem[]) => {
    try {
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (e) {
      console.log("[tools] persist recent error", e);
    }
  }, []);

  const pushRecent = useCallback(
    (id: string) => {
      setRecent((prev) => {
        const filtered = prev.filter((r) => r.id !== id);
        const next = [{ id, ts: Date.now() }, ...filtered].slice(0, MAX_RECENT);
        persistRecent(next).catch(() => {});
        return next;
      });
    },
    [persistRecent],
  );

  const onOpen = useCallback(
    (route: string, id?: string) => {
      Haptics.selectionAsync().catch(() => {});
      if (id) pushRecent(id);
      router.push(route as never);
    },
    [router, pushRecent],
  );

  const filtered = useMemo<Tool[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [query]);

  const recentTools = useMemo<Tool[]>(() => {
    return recent
      .map((r) => TOOLS.find((t) => t.id === r.id))
      .filter((t): t is Tool => Boolean(t));
  }, [recent]);

  const featured = TOOLS[0];

  const handleScanSubmit = useCallback(() => {
    const v = scan.trim();
    if (!v) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    pushRecent("token-lookup");
    router.push({ pathname: "/tool/token-lookup", params: { ca: v } } as never);
    setScan("");
  }, [scan, pushRecent, router]);

  const onPasteScan = useCallback(async () => {
    try {
      const t = await Clipboard.getStringAsync();
      if (t) {
        setScan(t.trim());
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[tools] clipboard error", e);
    }
  }, []);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={styles.root} testID="tools-screen">
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.headerBadge}>
                <Wrench color={Colors.mint} size={14} strokeWidth={2.6} />
                <Text style={styles.headerBadgeText}>TOOL DECK</Text>
              </View>
              <Text style={styles.headerTitle}>Tools</Text>
              <Text style={styles.headerSub}>
                Live on-chain intelligence, one tap away.
              </Text>
            </View>
            <View style={styles.statusBlock}>
              <View style={styles.statusDotWrap}>
                <Animated.View
                  style={[
                    styles.statusPulse,
                    { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                  ]}
                />
                <View style={styles.statusDot} />
              </View>
              <Text style={styles.statusText}>RPC LIVE</Text>
            </View>
          </View>

          <Pressable
            onPress={() => onOpen(featured.route, featured.id)}
            style={styles.hero}
            testID="tools-hero"
          >
            <LinearGradient
              colors={[`${featured.accent}38`, `${featured.gradient[1]}1A`, "rgba(3,7,8,0.0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroTopRow}>
              <View style={styles.heroBadge}>
                <Sparkles color={Colors.mint} size={11} strokeWidth={3} />
                <Text style={styles.heroBadgeText}>FEATURED</Text>
              </View>
              <View style={styles.heroLive}>
                <View style={styles.heroLiveDot} />
                <Text style={styles.heroLiveText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.heroBody}>
              <LinearGradient
                colors={featured.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIcon}
              >
                <featured.Icon color={Colors.ink} size={28} strokeWidth={2.6} />
              </LinearGradient>
              <View style={styles.heroText}>
                <Text style={styles.heroName}>{featured.name}</Text>
                <Text style={styles.heroTag}>{featured.tagline}</Text>
              </View>
            </View>

            <View style={styles.scanRow}>
              <ScanLine color={Colors.muted} size={16} strokeWidth={2.6} />
              <TextInput
                value={scan}
                onChangeText={setScan}
                placeholder="Paste any Solana contract to scan…"
                placeholderTextColor={Colors.muted}
                style={styles.scanInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleScanSubmit}
                testID="tools-scan-input"
              />
              {scan.length > 0 ? (
                <Pressable
                  onPress={handleScanSubmit}
                  style={styles.scanSubmit}
                  testID="tools-scan-submit"
                >
                  <ArrowRight color={Colors.ink} size={14} strokeWidth={3} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={onPasteScan}
                  style={styles.scanPaste}
                  testID="tools-scan-paste"
                >
                  <ClipboardIcon color={Colors.text} size={13} strokeWidth={2.6} />
                  <Text style={styles.scanPasteText}>Paste</Text>
                </Pressable>
              )}
            </View>
          </Pressable>

          <View style={styles.statsRow}>
            <StatTile
              label="TOOLS"
              value={TOOLS.length.toString()}
              accent={Colors.mint}
              Icon={Wrench}
            />
            <StatTile
              label="LIVE"
              value={TOOLS.filter((t) => t.status === "LIVE").length.toString()}
              accent={Colors.cyan}
              Icon={Activity}
            />
            <StatTile
              label="BETA"
              value={TOOLS.filter((t) => t.status === "BETA").length.toString()}
              accent={Colors.orange}
              Icon={Sparkles}
            />
            <StatTile
              label="USED"
              value={recent.length.toString()}
              accent={Colors.violet}
              Icon={Clock}
            />
          </View>

          {recentTools.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={styles.sectionHeadLeft}>
                  <Clock color={Colors.violet} size={14} strokeWidth={2.8} />
                  <Text style={styles.sectionTitle}>Recently used</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setRecent([]);
                    persistRecent([]).catch(() => {});
                  }}
                  hitSlop={8}
                  testID="tools-clear-recent"
                >
                  <Text style={styles.sectionAction}>Clear</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentRow}
              >
                {recentTools.map((t) => (
                  <Pressable
                    key={t.id}
                    style={styles.recentCard}
                    onPress={() => onOpen(t.route, t.id)}
                    testID={`recent-${t.id}`}
                  >
                    <LinearGradient
                      colors={[`${t.accent}1F`, "rgba(3,7,8,0.0)"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View
                      style={[
                        styles.recentIcon,
                        { backgroundColor: `${t.accent}1A`, borderColor: `${t.accent}55` },
                      ]}
                    >
                      <t.Icon color={t.accent} size={18} strokeWidth={2.6} />
                    </View>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={styles.recentTag} numberOfLines={1}>
                      {t.tagline}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={styles.sectionHeadLeft}>
                <Flame color={Colors.orange} size={14} strokeWidth={2.8} />
                <Text style={styles.sectionTitle}>All tools</Text>
                <View style={styles.countChip}>
                  <Text style={styles.countChipText}>{filtered.length}</Text>
                </View>
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Search color={Colors.muted} size={16} strokeWidth={2.4} />
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

            <View style={styles.list}>
              {filtered.map((t) => (
                <ToolRow key={t.id} tool={t} onPress={() => onOpen(t.route, t.id)} />
              ))}
              {filtered.length === 0 && (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No tools match</Text>
                  <Text style={styles.emptyBody}>Try a different keyword.</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.footerNote}>
            <Zap color={Colors.mint} size={14} strokeWidth={2.6} />
            <Text style={styles.footerText}>
              More tools shipping soon · Powered by Helius + RPC
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatTile({
  label,
  value,
  accent,
  Icon,
}: {
  label: string;
  value: string;
  accent: string;
  Icon: LucideIcon;
}) {
  return (
    <View style={[styles.statTile, { borderColor: `${accent}33` }]}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}1A` }]}>
        <Icon color={accent} size={12} strokeWidth={2.8} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ToolRow({ tool, onPress }: { tool: Tool; onPress: () => void }) {
  return (
    <Pressable
      testID={`tool-${tool.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: `${tool.accent}33` },
        pressed && styles.rowPressed,
      ]}
    >
      <LinearGradient
        colors={[tool.glow, "rgba(3,7,8,0.0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={tool.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconWrap}
      >
        <tool.Icon color={Colors.ink} size={26} strokeWidth={2.6} />
      </LinearGradient>

      <View style={styles.rowMid}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowName} numberOfLines={1}>
            {tool.name}
          </Text>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor:
                  tool.status === "LIVE"
                    ? "rgba(85,245,178,0.14)"
                    : "rgba(255,184,76,0.16)",
                borderColor:
                  tool.status === "LIVE"
                    ? "rgba(85,245,178,0.4)"
                    : "rgba(255,184,76,0.4)",
              },
            ]}
          >
            {tool.status === "LIVE" ? (
              <Activity color={Colors.mint} size={10} strokeWidth={3} />
            ) : (
              <Sparkles color={Colors.orange} size={10} strokeWidth={3} />
            )}
            <Text
              style={[
                styles.statusPillText,
                {
                  color: tool.status === "LIVE" ? Colors.mint : Colors.orange,
                },
              ]}
            >
              {tool.status}
            </Text>
          </View>
        </View>

        <Text style={styles.rowTag} numberOfLines={1}>
          {tool.tagline}
        </Text>
        <Text style={styles.rowDesc} numberOfLines={2}>
          {tool.description}
        </Text>

        <View style={styles.tagsRow}>
          {tool.tags.map((tag) => (
            <View
              key={tag}
              style={[styles.tagChip, { borderColor: `${tool.accent}33` }]}
            >
              <Text style={[styles.tagText, { color: tool.accent }]}>{tag}</Text>
            </View>
          ))}
        </View>

        <View style={styles.openRow}>
          <Text style={[styles.openText, { color: tool.accent }]}>Open tool</Text>
          <ArrowRight color={tool.accent} size={14} strokeWidth={3} />
        </View>
      </View>

      <ChevronRight color={Colors.muted} size={20} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 140 },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 12,
  },
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
  statusBlock: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
    backgroundColor: "rgba(85,245,178,0.06)",
  },
  statusDotWrap: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.mint,
  },
  statusPulse: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.mint,
  },
  statusText: {
    color: Colors.mint,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  hero: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
    backgroundColor: Colors.card,
    padding: 18,
    overflow: "hidden",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.14)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
  },
  heroBadgeText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  heroLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,93,143,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.35)",
  },
  heroLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.rose },
  heroLiveText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  heroBody: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1 },
  heroName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  heroTag: { color: Colors.muted, fontSize: 13, fontWeight: "700", marginTop: 2 },

  scanRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 14,
    backgroundColor: "rgba(3,7,8,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  scanInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", padding: 0 },
  scanPaste: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  scanPasteText: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  scanSubmit: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.mint,
  },

  statsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  statTile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
  },
  statIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: -0.4,
  },
  statLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 2,
  },

  section: { marginTop: 22 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  sectionAction: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  countChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  countChipText: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  recentRow: { gap: 10, paddingRight: 4 },
  recentCard: {
    width: 160,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  recentName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 10,
  },
  recentTag: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    padding: 0,
  },

  list: { marginTop: 14, gap: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  rowPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1, gap: 4 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  rowTag: { color: Colors.text, fontSize: 13, fontWeight: "700", opacity: 0.9 },
  rowDesc: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 2,
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(3,7,8,0.5)",
  },
  tagText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  openText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },

  empty: { width: "100%", paddingVertical: 40, alignItems: "center" },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
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
  footerText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
});
