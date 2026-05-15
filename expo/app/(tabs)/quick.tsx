import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Bell,
  Bookmark,
  CalendarDays,
  Compass,
  Film,
  Flame,
  Headphones,
  Layers,
  LineChart,
  LogOut,
  MessageCircle,
  Newspaper,
  Radio,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  UserPlus,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { useAdmin } from "@/providers/admin-provider";
import { useAuth } from "@/providers/auth-provider";

interface QuickItem {
  key: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  color: string;
  path: string;
  category: string;
}

interface QuickSection {
  key: string;
  label: string;
  caption: string;
  Icon: LucideIcon;
  color: string;
  gradient: readonly [string, string];
  items: QuickItem[];
}

export default function QuickAccessScreen() {
  const router = useRouter();
  const { signOut, isSigningOut } = useAuth();
  const { isTeam, isAdmin, role, refetch } = useAdmin();
  const [query, setQuery] = useState<string>("");

  // Subtle ambient pulse for the hero badge
  const pulse = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    refetch?.().catch(() => {});
    return () => loop.stop();
  }, [pulse, refetch]);

  const navigate = useCallback(
    (path: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push(path as never);
    },
    [router],
  );

  const onLogout = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await signOut();
      setTimeout(() => router.replace("/"), 60);
    } catch (e) {
      console.log("[quick] logout failed", e);
    }
  }, [signOut, router]);

  const sections = useMemo<QuickSection[]>(() => {
    const base: QuickSection[] = [
      {
        key: "trading",
        label: "Trading & Markets",
        caption: "Tokens, wallets, alpha and on-chain tools",
        Icon: LineChart,
        color: Colors.goldBright,
        gradient: ["rgba(98,208,255,0.22)", "rgba(98,208,255,0.02)"] as const,
        items: [
          { key: "tools", category: "trading", label: "Tools hub", description: "OG scanner, lookup, AI, trading", Icon: Wrench, color: Colors.goldBright, path: "/(tabs)/tools" },
          { key: "portfolio", category: "trading", label: "Portfolio", description: "Wallet balances and P&L", Icon: Wallet, color: Colors.cyan, path: "/wallet" },
          { key: "kol", category: "trading", label: "KOL scan", description: "Smart money live activity", Icon: Radio, color: Colors.magenta, path: "/kol-scan" },
          { key: "alerts", category: "trading", label: "Price alerts", description: "Pings on level breaks", Icon: Bell, color: Colors.orange, path: "/notifications" },
          { key: "trends", category: "trading", label: "Trending", description: "Live trending pairs", Icon: Flame, color: Colors.violet, path: "/(tabs)/discover" },
        ],
      },
      {
        key: "social",
        label: "Social & Community",
        caption: "Feeds, reels, spaces and events",
        Icon: Users,
        color: Colors.rose,
        gradient: ["rgba(230,242,255,0.16)", "rgba(230,242,255,0.02)"] as const,
        items: [
          { key: "reels", category: "social", label: "Reels", description: "Short-form video", Icon: Film, color: Colors.magenta, path: "/(tabs)/reels" },
          { key: "spaces", category: "social", label: "Spaces", description: "Live audio rooms", Icon: Headphones, color: Colors.rose, path: "/spaces" },
          { key: "events", category: "social", label: "Events", description: "RSVP and meetups", Icon: CalendarDays, color: Colors.mint, path: "/events" },
          { key: "communities", category: "social", label: "Communities", description: "Discover groups", Icon: Compass, color: Colors.cyan, path: "/communities" },
          { key: "messages", category: "social", label: "Messages", description: "DMs and group chats", Icon: MessageCircle, color: Colors.violet, path: "/(tabs)/messages" },
        ],
      },
      {
        key: "discover",
        label: "Discover",
        caption: "News, search and saved content",
        Icon: Sparkles,
        color: Colors.mint,
        gradient: ["rgba(63,169,255,0.18)", "rgba(63,169,255,0.02)"] as const,
        items: [
          { key: "news", category: "discover", label: "Crypto news", description: "Headlines and mentions", Icon: Newspaper, color: Colors.mint, path: "/crypto-news" },
          { key: "bookmarks", category: "discover", label: "Bookmarks", description: "Saved posts", Icon: Bookmark, color: Colors.goldBright, path: "/bookmarks" },
          { key: "invites", category: "discover", label: "Invite friends", description: "Codes and leaderboard", Icon: UserPlus, color: Colors.cyan, path: "/invites" },
        ],
      },
      {
        key: "account",
        label: "Account",
        caption: "Settings, profile and preferences",
        Icon: Settings,
        color: Colors.text,
        gradient: ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.02)"] as const,
        items: [
          { key: "settings", category: "account", label: "Settings", description: "Privacy & notifications", Icon: Settings, color: Colors.text, path: "/(tabs)/settings" },
          { key: "profile", category: "account", label: "My profile", description: "Themes, badges, identity", Icon: Layers, color: Colors.violet, path: "/(tabs)/profile" },
        ],
      },
    ];

    const staffRole =
      role === "owner" || role === "superadmin" || role === "admin" || role === "moderator" || role === "team" || role === "support";
    if (isTeam || isAdmin || staffRole) {
      base.push({
        key: "staff",
        label: isAdmin ? "Admin & Team" : "Team tools",
        caption: isAdmin ? "Platform admin and moderation" : "Moderation and reports",
        Icon: Shield,
        color: Colors.rose,
        gradient: ["rgba(230,242,255,0.18)", "rgba(230,242,255,0.02)"] as const,
        items: [
          ...(isAdmin
            ? [{ key: "admin", category: "staff", label: "Admin dashboard", description: "Full platform controls", Icon: Wrench, color: Colors.goldBright, path: "/admin" } as QuickItem]
            : []),
          { key: "team", category: "staff", label: "Team dashboard", description: "Reports, analytics", Icon: Shield, color: Colors.rose, path: "/team" },
        ],
      });
    }
    return base;
  }, [isAdmin, isTeam, role]);

  const allItems = useMemo<QuickItem[]>(() => sections.flatMap((s) => s.items), [sections]);

  const trimmed = query.trim().toLowerCase();
  const isSearching = trimmed.length > 0;
  const searchResults = useMemo<QuickItem[]>(() => {
    if (!isSearching) return [];
    return allItems.filter(
      (i) => i.label.toLowerCase().includes(trimmed) || i.description.toLowerCase().includes(trimmed),
    );
  }, [allItems, isSearching, trimmed]);

  const pinned = useMemo<QuickItem[]>(
    () => [
      allItems.find((i) => i.key === "tools"),
      allItems.find((i) => i.key === "portfolio"),
      allItems.find((i) => i.key === "messages"),
      allItems.find((i) => i.key === "bookmarks"),
    ].filter((x): x is QuickItem => Boolean(x)),
    [allItems],
  );

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] });

  return (
    <View style={styles.root}>
      <AppBackground />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.eyebrow}>QUICK ACCESS</Text>
                <Text style={styles.title}>Everything, in one tap</Text>
                <Text style={styles.subtitle}>Search or jump to any tool, feed or setting.</Text>
              </View>
              <View style={styles.heroBadge}>
                <Animated.View
                  style={[
                    styles.heroBadgeGlow,
                    { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                  ]}
                />
                <Zap color={Colors.goldBright} size={22} strokeWidth={2.6} />
              </View>
            </View>

            <View style={styles.searchWrap}>
              {Platform.OS !== "web" ? (
                <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
              ) : null}
              <View style={styles.searchInner}>
                <Search color={Colors.muted} size={16} strokeWidth={2.6} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search tools, settings, communities…"
                  placeholderTextColor={Colors.muted2}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  testID="quick-search-input"
                />
                {isSearching ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={8} testID="quick-search-clear">
                    <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {isSearching ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
              </Text>
              {searchResults.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No matches. Try a different keyword.</Text>
                </View>
              ) : (
                <View style={styles.resultList}>
                  {searchResults.map((it) => (
                    <Pressable
                      key={`r-${it.key}`}
                      onPress={() => navigate(it.path)}
                      style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                      testID={`quick-result-${it.key}`}
                    >
                      <View style={[styles.resultIcon, { backgroundColor: `${it.color}1F`, borderColor: `${it.color}55` }]}>
                        <it.Icon color={it.color} size={16} strokeWidth={2.6} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultLabel}>{it.label}</Text>
                        <Text style={styles.resultDesc} numberOfLines={1}>{it.description}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <>
              {/* Pinned */}
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionLabel}>Pinned</Text>
                  <Text style={styles.sectionHint}>Fast lanes</Text>
                </View>
                <View style={styles.pinGrid}>
                  {pinned.map((it) => (
                    <Pressable
                      key={`p-${it.key}`}
                      onPress={() => navigate(it.path)}
                      style={({ pressed }) => [styles.pinTile, pressed && styles.pressed]}
                      testID={`quick-pin-${it.key}`}
                    >
                      <LinearGradient
                        colors={[`${it.color}26`, "rgba(0,0,0,0)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={[styles.pinIcon, { borderColor: `${it.color}66` }]}>
                        <it.Icon color={it.color} size={18} strokeWidth={2.6} />
                      </View>
                      <Text style={styles.pinLabel} numberOfLines={1}>{it.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Sections */}
              {sections.map((sec) => (
                <View key={sec.key} style={styles.section} testID={`quick-section-${sec.key}`}>
                  <View style={styles.sectionHead}>
                    <View style={styles.sectionHeadLeft}>
                      <View style={[styles.sectionIcon, { backgroundColor: `${sec.color}1F`, borderColor: `${sec.color}55` }]}>
                        <sec.Icon color={sec.color} size={14} strokeWidth={2.6} />
                      </View>
                      <Text style={styles.sectionLabel}>{sec.label}</Text>
                    </View>
                    <Text style={styles.sectionHint}>{sec.items.length}</Text>
                  </View>
                  <Text style={styles.sectionCaption}>{sec.caption}</Text>
                  <View style={styles.grid}>
                    {sec.items.map((it) => (
                      <Pressable
                        key={`${sec.key}-${it.key}`}
                        onPress={() => navigate(it.path)}
                        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                        testID={`quick-item-${it.key}`}
                      >
                        <LinearGradient
                          colors={sec.gradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={[styles.tileIcon, { backgroundColor: `${it.color}1A`, borderColor: `${it.color}55` }]}>
                          <it.Icon color={it.color} size={17} strokeWidth={2.6} />
                        </View>
                        <Text style={styles.tileLabel} numberOfLines={1}>{it.label}</Text>
                        <Text style={styles.tileDesc} numberOfLines={2}>{it.description}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}

              <Pressable
                onPress={onLogout}
                disabled={isSigningOut}
                style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed, isSigningOut && { opacity: 0.6 }]}
                testID="quick-logout"
              >
                <LogOut color={Colors.rose} size={15} strokeWidth={2.6} />
                <Text style={styles.logoutText}>{isSigningOut ? "Signing out…" : "Log out"}</Text>
              </Pressable>
            </>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 24 },
  pressed: { opacity: 0.82 },

  hero: { paddingTop: 8, paddingBottom: 4, gap: 14 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  eyebrow: { color: Colors.mint, fontSize: 10.5, fontWeight: "900", letterSpacing: 2 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8, marginTop: 4 },
  subtitle: { color: Colors.muted, fontSize: 13, fontWeight: "600", marginTop: 4, maxWidth: 260 },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(98,208,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.45)",
    overflow: "hidden",
  },
  heroBadgeGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(98,208,255,0.18)",
    borderRadius: 16,
  },

  searchWrap: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,14,22,0.7)",
  },
  searchInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14.5,
    fontWeight: "600",
    paddingVertical: 0,
  },
  clearText: { color: Colors.goldBright, fontSize: 12.5, fontWeight: "800" },

  section: { marginTop: 22, gap: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  sectionCaption: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: -2 },
  sectionHint: { color: Colors.muted2, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },

  pinGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pinTile: {
    width: "23.5%",
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: "rgba(16,20,30,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  pinIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.30)",
  },
  pinLabel: { color: Colors.text, fontSize: 11, fontWeight: "800", textAlign: "center" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "48.5%",
    minHeight: 112,
    borderRadius: 18,
    backgroundColor: "rgba(14,18,28,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 14,
    overflow: "hidden",
    gap: 8,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  tileDesc: { color: Colors.muted, fontSize: 11.5, fontWeight: "700", lineHeight: 15 },

  resultList: { gap: 6 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(14,18,28,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  resultLabel: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  resultDesc: { color: Colors.muted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },

  emptyCard: {
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(14,18,28,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  emptyText: { color: Colors.muted, fontSize: 13, fontWeight: "700" },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 22,
    borderRadius: 16,
    backgroundColor: "rgba(230,242,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(230,242,255,0.18)",
  },
  logoutText: { color: Colors.rose, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
});
