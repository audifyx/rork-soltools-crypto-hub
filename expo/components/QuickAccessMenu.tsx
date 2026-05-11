import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  Headphones,
  LogOut,
  Newspaper,
  Radio,
  Settings,
  TrendingUp,
  Wallet,
  Wrench,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAuth } from "@/providers/auth-provider";

interface QuickAccessMenuProps {
  visible: boolean;
  onClose: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  color: string;
  onPress: () => void;
}

export default function QuickAccessMenu({ visible, onClose }: QuickAccessMenuProps) {
  const router = useRouter();
  const { signOut, isSigningOut } = useAuth();
  const sheetTranslate = useRef(new Animated.Value(40)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      sheetTranslate.setValue(40);
      sheetOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(sheetOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(sheetTranslate, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, sheetOpacity, sheetTranslate]);

  const navigate = useCallback(
    (path: string) => {
      Haptics.selectionAsync().catch(() => {});
      onClose();
      // small delay so the modal closes cleanly first
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

  const items: MenuItem[] = [
    {
      key: "tools",
      label: "Tools",
      description: "OG scanner, token lookup, wallets, AI and trading tools",
      Icon: Wrench,
      color: Colors.goldBright,
      onPress: () => navigate("/(tabs)/tools"),
    },
    {
      key: "spaces",
      label: "Spaces",
      description: "Live audio rooms, alpha calls, AMAs and trading shows",
      Icon: Headphones,
      color: Colors.rose,
      onPress: () => navigate("/spaces"),
    },
    {
      key: "news",
      label: "Crypto News",
      description: "Trending headlines, KOL signals, viral mentions",
      Icon: Newspaper,
      color: Colors.mint,
      onPress: () => navigate("/crypto-news"),
    },
    {
      key: "settings",
      label: "Settings",
      description: "Preferences, privacy, notifications, account controls",
      Icon: Settings,
      color: Colors.text,
      onPress: () => navigate("/(tabs)/settings"),
    },
    {
      key: "portfolio",
      label: "Portfolio Tracker",
      description: "Multi-wallet balances, top holdings, P&L",
      Icon: Wallet,
      color: Colors.cyan,
      onPress: () => navigate("/wallet"),
    },
    {
      key: "kol",
      label: "KOL Scan",
      description: "Track smart money: live KOL on-chain activity",
      Icon: Radio,
      color: Colors.magenta,
      onPress: () => navigate("/kol-scan"),
    },
    {
      key: "alerts",
      label: "Price Alerts",
      description: "Get pinged when tokens hit your levels",
      Icon: Bell,
      color: Colors.orange,
      onPress: () => navigate("/notifications"),
    },
    {
      key: "trends",
      label: "Market Trends",
      description: "Live trending pairs, gainers, and volume",
      Icon: TrendingUp,
      color: Colors.violet,
      onPress: () => navigate("/(tabs)/discover"),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} testID="quick-menu-backdrop">
        {Platform.OS !== "web" ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
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
            <View>
              <Text style={styles.eyebrow}>QUICK ACCESS</Text>
              <Text style={styles.title}>Jump anywhere</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} testID="quick-menu-close">
              <X color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>

          <View style={styles.list}>
            {items.map((it) => (
              <Pressable
                key={it.key}
                onPress={it.onPress}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                testID={`quick-menu-${it.key}`}
              >
                <View style={[styles.rowIcon, { backgroundColor: `${it.color}1F`, borderColor: `${it.color}55` }]}>
                  <it.Icon color={it.color} size={18} strokeWidth={2.6} />
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowLabel}>{it.label}</Text>
                  <Text style={styles.rowDesc} numberOfLines={1}>{it.description}</Text>
                </View>
                <ChevronRight color={Colors.muted} size={16} strokeWidth={2.6} />
              </Pressable>
            ))}
          </View>

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
    gap: 14,
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
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(16,16,14,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  pressed: { opacity: 0.9 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1 },
  rowLabel: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  rowDesc: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  logoutBtn: {
    marginTop: 4,
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
