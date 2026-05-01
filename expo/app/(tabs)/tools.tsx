import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  ArrowRight,
  Brain,
  ChevronRight,
  MessageCircle,
  Search,
  Sparkles,
  Wallet,
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

type Tool = {
  id: string;
  route: string;
  name: string;
  tagline: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
  glow: string;
  tags: string[];
  status: "LIVE" | "BETA";
};

const TOOLS: Tool[] = [
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
    accent: Colors.cyan,
    glow: "rgba(56,215,255,0.22)",
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
    tags: ["GPT", "RPC", "Context"],
    status: "BETA",
  },
];

export default function ToolsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState<string>("");

  const onOpen = useCallback(
    (route: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push(route as never);
    },
    [router]
  );

  const filtered = useMemo<Tool[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [query]);

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

          <View style={styles.list}>
            {filtered.map((t) => (
              <ToolRow key={t.id} tool={t} onPress={() => onOpen(t.route)} />
            ))}
            {filtered.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No tools match</Text>
                <Text style={styles.emptyBody}>Try a different keyword.</Text>
              </View>
            )}
          </View>

          <View style={styles.footerNote}>
            <Zap color={Colors.mint} size={14} strokeWidth={2.6} />
            <Text style={styles.footerText}>
              More tools shipping soon. Powered by Helius + RPC.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
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

      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: `${tool.accent}1A`,
            borderColor: `${tool.accent}55`,
          },
        ]}
      >
        <tool.Icon color={tool.accent} size={26} strokeWidth={2.4} />
      </View>

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
                styles.statusText,
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
              style={[
                styles.tagChip,
                { borderColor: `${tool.accent}33` },
              ]}
            >
              <Text style={[styles.tagText, { color: tool.accent }]}>
                {tag}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.openRow}>
          <Text style={[styles.openText, { color: tool.accent }]}>
            Open tool
          </Text>
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
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 8,
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

  list: { marginTop: 20, gap: 14 },
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
  rowPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  rowMid: { flex: 1, gap: 4 },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
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
  statusText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  rowTag: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    opacity: 0.9,
  },
  rowDesc: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 2,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(3,7,8,0.5)",
  },
  tagText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  openText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  empty: {
    width: "100%",
    paddingVertical: 40,
    alignItems: "center",
  },
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
  footerText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
});
