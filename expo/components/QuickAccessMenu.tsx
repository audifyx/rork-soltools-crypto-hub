import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import GlassBg from "@/components/ui/GlassBg";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
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
  Settings,
  Shield,
  Sparkles,
  Users,
  UserPlus,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAuth } from "@/providers/auth-provider";
import { useAdmin } from "@/providers/admin-provider";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface QuickAccessMenuProps {
  visible: boolean;
  onClose: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  color: string;
  path: string;
}

interface MenuCategory {
  key: string;
  label: string;
  caption: string;
  Icon: LucideIcon;
  color: string;
  items: MenuItem[];
}

export default function QuickAccessMenu({ visible, onClose }: QuickAccessMenuProps) {
  const router = useRouter();
  const { signOut, isSigningOut } = useAuth();
  const { isTeam, isAdmin, role, refetch } = useAdmin();
  const sheetTranslate = useRef(new Animated.Value(40)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState<string | null>("trading");

  useEffect(() => {
    if (visible) {
      sheetTranslate.setValue(40);
      sheetOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(sheetOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(sheetTranslate, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }),
      ]).start();
      // Refresh admin role on open so newly-promoted team members see the
      // Team dashboard entry without restarting the app.
      refetch?.().catch((e: unknown) => {
        console.log("[quick-menu] admin refetch failed", e instanceof Error ? e.message : e);
      });
    }
  }, [visible, sheetOpacity, sheetTranslate, refetch]);

  const navigate = useCallback(
    (path: string) => {
      Haptics.selectionAsync().catch(() => {});
      onClose();
      setTimeout(() => {
        router.push(path as never);
      }, 80);
    },
    [router, onClose],
  );

  const onLogout = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onClose();
    try {
      await signOut();
      setTimeout(() => router.replace("/"), 60);
    } catch (e) {
      console.log("[quick-menu] logout failed", e);
    }
  }, [onClose, signOut, router]);

  const toggleCategory = useCallback((key: string) => {
    Haptics.selectionAsync().catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.create(220, "easeInEaseOut", "opacity"));
    setExpanded((prev) => (prev === key ? null : key));
  }, []);

  const categories = useMemo<MenuCategory[]>(() => {
    const base: MenuCategory[] = [
      {
        key: "trading",
        label: "Trading & Markets",
        caption: "Tokens, wallets, alpha and on-chain tools",
        Icon: LineChart,
        color: Colors.goldBright,
        items: [
          { key: "tools", label: "Tools hub", description: "OG scanner, lookup, AI, trading", Icon: Wrench, color: Colors.goldBright, path: "/(tabs)/tools" },
          { key: "portfolio", label: "Portfolio tracker", description: "Multi-wallet balances and P&L", Icon: Wallet, color: Colors.cyan, path: "/wallet" },
          { key: "kol", label: "KOL scan", description: "Smart money live activity", Icon: Radio, color: Colors.magenta, path: "/kol-scan" },
          { key: "trends", label: "Market trends", description: "Live trending pairs and gainers", Icon: Flame, color: Colors.violet, path: "/(tabs)/discover" },
        ],
      },
      {
        key: "social",
        label: "Social & Community",
        caption: "Feeds, reels, spaces and events",
        Icon: Users,
        color: Colors.rose,
        items: [
          { key: "fyp", label: "For You", description: "Personalized feed", Icon: Sparkles, color: Colors.rose, path: "/(tabs)/fyp" },
          { key: "reels", label: "Reels", description: "Short-form video", Icon: Film, color: Colors.magenta, path: "/(tabs)/reels" },
          { key: "spaces", label: "Spaces", description: "Live audio rooms and AMAs", Icon: Headphones, color: Colors.rose, path: "/spaces" },
          { key: "events", label: "Events", description: "Community events and RSVPs", Icon: CalendarDays, color: Colors.mint, path: "/events" },
          { key: "communities", label: "Communities", description: "Discover and join groups", Icon: Compass, color: Colors.cyan, path: "/communities" },
          { key: "messages", label: "Messages", description: "DMs, group chats, notes-to-self", Icon: MessageCircle, color: Colors.violet, path: "/(tabs)/messages" },
        ],
      },
      {
        key: "discover",
        label: "Discover",
        caption: "News and invites",
        Icon: Compass,
        color: Colors.mint,
        items: [
          { key: "news", label: "Crypto news", description: "Headlines and viral mentions", Icon: Newspaper, color: Colors.mint, path: "/crypto-news" },
          { key: "invites", label: "Invite friends", description: "Codes, referrals, leaderboard", Icon: UserPlus, color: Colors.cyan, path: "/invites" },
        ],
      },
      {
        key: "account",
        label: "Account",
        caption: "Settings, profile and preferences",
        Icon: Settings,
        color: Colors.text,
        items: [
          { key: "settings", label: "Settings", description: "Privacy, notifications, account", Icon: Settings, color: Colors.text, path: "/(tabs)/settings" },
          { key: "profile", label: "My profile", description: "Themes, badges, identity", Icon: Layers, color: Colors.violet, path: "/(tabs)/profile" },
        ],
      },
    ];

    const staffRole = role === "owner" || role === "superadmin" || role === "admin" || role === "moderator" || role === "team" || role === "support";
    if (isTeam || isAdmin || staffRole) {
      base.push({
        key: "staff",
        label: isAdmin ? "Admin & Team" : "Team tools",
        caption: isAdmin ? "Platform admin and moderation" : "Moderation and reports",
        Icon: Shield,
        color: Colors.rose,
        items: [
          ...(isAdmin
            ? [{ key: "admin", label: "Admin dashboard", description: "Full platform controls", Icon: Wrench, color: Colors.goldBright, path: "/admin" } as MenuItem]
            : []),
          { key: "team", label: "Team dashboard", description: "Reports, online, analytics", Icon: Shield, color: Colors.rose, path: "/team" },
        ],
      });
    }

    return base;
  }, [isAdmin, isTeam, role]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} testID="quick-menu-backdrop">
        <GlassBg intensity={28} tint="dark" />
        <View style={styles.dim} pointerEvents="none" />
      </Pressable>

      <SafeAreaView edges={["bottom"]} style={styles.safe} pointerEvents="box-none">
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: sheetTranslate }], opacity: sheetOpacity }]}
          testID="quick-menu-sheet"
        >
          <LinearGradient
            colors={["rgba(244,198,91,0.10)", "rgba(0,0,0,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>QUICK ACCESS</Text>
              <Text style={styles.title}>Jump anywhere</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} testID="quick-menu-close">
              <X color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces
          >
            {categories.map((cat) => {
              const isOpen = expanded === cat.key;
              return (
                <View key={cat.key} style={styles.categoryWrap} testID={`quick-menu-cat-${cat.key}`}>
                  <Pressable
                    onPress={() => toggleCategory(cat.key)}
                    style={({ pressed }) => [styles.catHeader, pressed && styles.pressed, isOpen && styles.catHeaderOpen]}
                  >
                    <View style={[styles.catIcon, { backgroundColor: `${cat.color}1F`, borderColor: `${cat.color}55` }]}>
                      <cat.Icon color={cat.color} size={18} strokeWidth={2.6} />
                    </View>
                    <View style={styles.catMid}>
                      <Text style={styles.catLabel}>{cat.label}</Text>
                      <Text style={styles.catCaption} numberOfLines={1}>{cat.caption}</Text>
                    </View>
                    <View style={styles.catBadge}>
                      <Text style={styles.catBadgeText}>{cat.items.length}</Text>
                    </View>
                    <Animated.View style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}>
                      <ChevronDown color={Colors.muted} size={18} strokeWidth={2.6} />
                    </Animated.View>
                  </Pressable>

                  {isOpen ? (
                    <View style={styles.subList}>
                      {cat.items.map((it) => (
                        <Pressable
                          key={it.key}
                          onPress={() => navigate(it.path)}
                          style={({ pressed }) => [styles.subRow, pressed && styles.pressed]}
                          testID={`quick-menu-${it.key}`}
                        >
                          <View style={[styles.subIcon, { backgroundColor: `${it.color}1A`, borderColor: `${it.color}40` }]}>
                            <it.Icon color={it.color} size={15} strokeWidth={2.6} />
                          </View>
                          <View style={styles.subMid}>
                            <Text style={styles.subLabel}>{it.label}</Text>
                            <Text style={styles.subDesc} numberOfLines={1}>{it.description}</Text>
                          </View>
                          <ChevronRight color={Colors.muted} size={14} strokeWidth={2.6} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={onLogout}
            disabled={isSigningOut}
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed, isSigningOut && { opacity: 0.6 }]}
            testID="quick-menu-logout"
          >
            <LogOut color={Colors.rose} size={15} strokeWidth={2.6} />
            <Text style={styles.logoutText}>{isSigningOut ? "Signing out…" : "Log out"}</Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  safe: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    margin: 12,
    padding: 16,
    borderRadius: 28,
    backgroundColor: "rgba(10,10,8,0.96)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.22)",
    overflow: "hidden",
    gap: 12,
    maxHeight: "82%",
  },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { maxHeight: 520 },
  scrollContent: { gap: 8, paddingBottom: 4 },
  pressed: { opacity: 0.85 },

  categoryWrap: {
    borderRadius: 18,
    backgroundColor: "rgba(16,16,14,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  catHeaderOpen: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  catMid: { flex: 1 },
  catLabel: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  catCaption: { color: Colors.muted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  catBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  catBadgeText: { color: Colors.muted, fontSize: 11, fontWeight: "900" },

  subList: { paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  subIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subMid: { flex: 1 },
  subLabel: { color: Colors.text, fontSize: 13.5, fontWeight: "800", letterSpacing: -0.1 },
  subDesc: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(247,242,231,0.04)",
    borderWidth: 1,
    borderColor: "rgba(247,242,231,0.18)",
  },
  logoutText: { color: Colors.rose, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
});
