import { BlurView } from "expo-blur";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  MessageCircle,
  Send,
  Twitter,
  UserCircle2,
  Users,
  Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import React, { useCallback } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import BrandLogo from "@/components/BrandLogo";

interface LinkItem {
  key: string;
  label: string;
  handle: string;
  url: string;
  Icon: LucideIcon;
  color: string;
}

interface LinkGroup {
  key: string;
  title: string;
  caption: string;
  items: LinkItem[];
}

const GROUPS: LinkGroup[] = [
  {
    key: "telegram",
    title: "Telegram",
    caption: "Updates, announcements & scanner channel",
    items: [
      {
        key: "tg-updates",
        label: "OG Updates",
        handle: "t.me/ogupdates",
        url: "https://t.me/ogupdates",
        Icon: Send,
        color: Colors.cyan,
      },
      {
        key: "tg-scanner",
        label: "OG Scanner",
        handle: "t.me/ogscanner",
        url: "https://t.me/ogscanner",
        Icon: Send,
        color: Colors.cyan,
      },
    ],
  },
  {
    key: "x",
    title: "X / Twitter",
    caption: "Official handles & community",
    items: [
      {
        key: "x-main",
        label: "OG Scan",
        handle: "@ogscanfun",
        url: "https://x.com/ogscanfun",
        Icon: Twitter,
        color: Colors.text,
      },
      {
        key: "x-backup",
        label: "OG Scan Backup",
        handle: "@ogscanbackup",
        url: "https://x.com/ogscanbackup",
        Icon: Twitter,
        color: Colors.text,
      },
      {
        key: "x-community",
        label: "X Community",
        handle: "Join the community",
        url: "https://twitter.com/i/communities/2007536315483685053",
        Icon: Users,
        color: Colors.violet,
      },
    ],
  },
  {
    key: "discord",
    title: "Discord",
    caption: "Live chat, voice & support",
    items: [
      {
        key: "discord",
        label: "OG Scan Discord",
        handle: "discord.gg/23Vmr2ANva",
        url: "https://discord.gg/23Vmr2ANva",
        Icon: MessageCircle,
        color: Colors.violet,
      },
    ],
  },
  {
    key: "web",
    title: "Website",
    caption: "Official site",
    items: [
      {
        key: "site",
        label: "ogscan.fun",
        handle: "http://ogscan.fun",
        url: "https://ogscan.fun",
        Icon: Globe,
        color: Colors.goldBright,
      },
    ],
  },
  {
    key: "team",
    title: "Team",
    caption: "Lead developer",
    items: [
      {
        key: "dev",
        label: "Audifyx",
        handle: "@audifyx",
        url: "https://x.com/audifyx",
        Icon: UserCircle2,
        color: Colors.mint,
      },
    ],
  },
];

export default function AboutScreen() {
  const router = useRouter();

  const open = useCallback((url: string) => {
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(url).catch((e) => {
      console.log("[about] open url failed", e instanceof Error ? e.message : e);
    });
  }, []);

  const onBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/profile");
  }, [router]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={["#0a0a08", "#100d06", "#070705"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn} testID="about-back">
            <ChevronLeft color={Colors.text} size={20} strokeWidth={2.6} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>ABOUT</Text>
            <Text style={styles.title}>OG Scan</Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <BlurView intensity={Platform.OS === "ios" ? 40 : 20} tint="dark" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={["rgba(244,198,91,0.18)", "rgba(244,198,91,0.02)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroInner}>
              <BrandLogo size={56} />
              <Text style={styles.heroTitle}>The OG Scan platform</Text>
              <Text style={styles.heroDesc}>
                On-chain alpha, social and tools — built for Solana traders.
                Connect with the community across Telegram, X and Discord.
              </Text>
              <View style={styles.heroPills}>
                <View style={styles.pill}>
                  <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.6} />
                  <Text style={styles.pillText}>v1.0</Text>
                </View>
                <View style={styles.pill}>
                  <Globe color={Colors.cyan} size={12} strokeWidth={2.6} />
                  <Text style={styles.pillText}>ogscan.fun</Text>
                </View>
              </View>
            </View>
          </View>

          {GROUPS.map((group) => (
            <View key={group.key} style={styles.group} testID={`about-group-${group.key}`}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupCaption}>{group.caption}</Text>
              </View>
              <View style={styles.groupCard}>
                {group.items.map((it, idx) => (
                  <Pressable
                    key={it.key}
                    onPress={() => open(it.url)}
                    style={({ pressed }) => [
                      styles.row,
                      idx > 0 && styles.rowDivider,
                      pressed && styles.pressed,
                    ]}
                    testID={`about-link-${it.key}`}
                  >
                    <View style={[styles.icon, { backgroundColor: `${it.color}1F`, borderColor: `${it.color}55` }]}>
                      <it.Icon color={it.color} size={16} strokeWidth={2.6} />
                    </View>
                    <View style={styles.rowMid}>
                      <Text style={styles.rowLabel}>{it.label}</Text>
                      <Text style={styles.rowHandle} numberOfLines={1}>{it.handle}</Text>
                    </View>
                    <ChevronRight color={Colors.muted} size={16} strokeWidth={2.6} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          <Text style={styles.footer}>Made with care by the OG Scan team.</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#070705" },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.6, marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 48, gap: 18 },

  heroCard: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.28)",
    marginBottom: 18,
  },
  heroInner: { padding: 20, gap: 12, alignItems: "flex-start" },
  heroTitle: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  heroDesc: { color: Colors.muted, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  heroPills: { flexDirection: "row", gap: 8, marginTop: 4 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillText: { color: Colors.text, fontSize: 11, fontWeight: "800" },

  group: { gap: 8, marginBottom: 16 },
  groupHead: { paddingHorizontal: 4 },
  groupTitle: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.4, textTransform: "uppercase" },
  groupCaption: { color: Colors.muted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  groupCard: {
    borderRadius: 18,
    backgroundColor: "rgba(16,16,14,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1 },
  rowLabel: { color: Colors.text, fontSize: 14, fontWeight: "800", letterSpacing: -0.1 },
  rowHandle: { color: Colors.muted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  pressed: { opacity: 0.7 },

  footer: {
    color: Colors.muted,
    fontSize: 11.5,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
});
