import { router } from "expo-router";
import {
  Bot,
  ChartNoAxesCombined,
  Coins,
  Crosshair,
  Flame,
  Radar,
  ShieldAlert,
  WalletCards,
} from "lucide-react-native";
import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { OG_SCANNER_TOOLS, type OGScannerTool, type OGScannerToolId } from "@/lib/og-scanner/tools";

const iconMap: Record<OGScannerToolId, React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>> = {
  "direct-og-scan": Crosshair,
  "trending-scanner": Flame,
  "new-pairs-scanner": Radar,
  "snipe-feed": ChartNoAxesCombined,
  "official-ogscan-coin": Coins,
  "dev-wallet-intel": WalletCards,
  "launch-analyzer": ShieldAlert,
  "telegram-ai-bot": Bot,
};

const statusText: Record<OGScannerTool["status"], string> = {
  live: "LIVE",
  beta: "BETA",
  "backend-needed": "BACKEND",
};

export default function OGScannerToolsSection() {
  const tools = useMemo(() => OG_SCANNER_TOOLS, []);

  return (
    <View style={styles.wrap} testID="og-scanner-tools-section">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>OG SCANNER</Text>
          <Text style={styles.title}>Scanner Tools</Text>
        </View>
        <Pressable
          onPress={() => router.push("/tools/og-scanner")}
          style={styles.openAllBtn}
          testID="open-og-scanner-hub"
        >
          <Text style={styles.openAllText}>Open hub</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {tools.map((tool) => (
          <OGScannerToolCard key={tool.id} tool={tool} />
        ))}
      </View>
    </View>
  );
}

export const OGScannerToolCard = memo(({ tool }: { tool: OGScannerTool }) => {
  const Icon = iconMap[tool.id];
  const isLive = tool.status === "live";

  return (
    <Pressable
      onPress={() => router.push(`/tools/og-scanner?tool=${tool.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      testID={`og-tool-${tool.id}`}
    >
      <View style={styles.cardTop}>
        <View style={styles.iconBox}>
          <Icon color={Colors.mint} size={20} strokeWidth={2.7} />
        </View>
        <View style={[styles.statusPill, isLive ? styles.statusLive : styles.statusBeta]}>
          <Text style={[styles.statusText, isLive ? styles.statusTextLive : styles.statusTextBeta]}>
            {statusText[tool.status]}
          </Text>
        </View>
      </View>

      <Text style={styles.cardTitle}>{tool.title}</Text>
      <Text style={styles.cardSub}>{tool.subtitle}</Text>
      <Text style={styles.cardDesc} numberOfLines={3}>{tool.description}</Text>

      <View style={styles.tagsRow}>
        {tool.tags.slice(0, 3).map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
});

OGScannerToolCard.displayName = "OGScannerToolCard";

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
    marginTop: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.2,
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 2,
  },
  openAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(98,208,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.3)",
  },
  openAllText: {
    color: Colors.mint,
    fontSize: 12,
    fontWeight: "900",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "48%",
    minWidth: 160,
    flexGrow: 1,
    borderRadius: 20,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.86,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(98,208,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.20)",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusLive: {
    backgroundColor: "rgba(98,208,255,0.10)",
    borderColor: "rgba(98,208,255,0.32)",
  },
  statusBeta: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  statusTextLive: { color: Colors.mint },
  statusTextBeta: { color: Colors.muted },
  cardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  cardSub: {
    color: Colors.mint,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  cardDesc: {
    color: Colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tagText: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
});
