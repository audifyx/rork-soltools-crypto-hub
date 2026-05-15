import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import {
  Bell,
  Bot,
  ChevronRight,
  Gem,
  HelpCircle,
  Languages,
  Link as LinkIcon,
  LogOut,
  Palette,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
  Vibrate,
  Wallet,
  Wrench,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import GlassCard from "@/components/ui/GlassCard";
import Colors from "@/constants/colors";
import type { Currency, Language, ThemeMode, UserPrefs } from "@/providers/app-provider";
import { useApp } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";
import { useAdmin } from "@/providers/admin-provider";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
type Section = "overview" | "notifications" | "appearance" | "account" | "support";

const languages: { id: Language; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "jp", label: "日本語" },
];

const themes: { id: ThemeMode; label: string; sub: string }[] = [
  { id: "dark", label: "Dark", sub: "Default $OGS black" },
  { id: "midnight", label: "Midnight", sub: "Lower glow, deeper panels" },
  { id: "sunset", label: "Sunset", sub: "Warmer accent mode" },
];

function haptic(): void {
  Haptics.selectionAsync().catch(() => {});
}

export default function SettingsScreen() {
  const router = useRouter();
  const { prefs, updatePrefs, resetAllData, profile, watchlist, alerts, wallets } = useApp();
  const { isAuthenticated, signOut, deleteAccount, isDeletingAccount } = useAuth();
  const { isOwner } = useAdmin();
  const [section, setSection] = useState<Section>("overview");

  const setPrefs = useCallback(
    async (patch: Partial<UserPrefs>) => {
      haptic();
      await updatePrefs(patch);
    },
    [updatePrefs],
  );

  const openSection = useCallback((next: Section) => {
    haptic();
    setSection(next);
  }, []);

  const resetLocalData = useCallback(() => {
    Alert.alert("Reset local data?", "This clears saved posts, watchlist, alerts, wallets, and cached profile data on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          resetAllData().catch((e) => Alert.alert("Reset failed", e instanceof Error ? e.message : "Try again."));
        },
      },
    ]);
  }, [resetAllData]);

  const confirmSignOut = useCallback(() => {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    Alert.alert("Sign out?", "You can sign back in anytime.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          signOut()
            .then(() => router.replace("/auth"))
            .catch((e) => Alert.alert("Sign out failed", e instanceof Error ? e.message : "Try again."));
        },
      },
    ]);
  }, [isAuthenticated, router, signOut]);

  const confirmDelete = useCallback(() => {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    Alert.alert("Delete account?", "This permanently deletes your account, profile, posts, and synced data.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete forever",
        style: "destructive",
        onPress: () => {
          deleteAccount()
            .then(() => router.replace("/auth"))
            .catch((e) => Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again."));
        },
      },
    ]);
  }, [deleteAccount, isAuthenticated, router]);

  const accountLabel = profile.handle || profile.displayName || "Signed in";

  const completion = useMemo(() => {
    const filled = [profile.displayName, profile.handle, profile.bio, profile.walletAddress, profile.twitterHandle].filter(Boolean).length;
    return Math.round((filled / 5) * 100);
  }, [profile]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AppBackground variant="tool" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          {section !== "overview" ? (
            <Pressable style={styles.backBtn} onPress={() => openSection("overview")}>
              <ChevronRight color={Colors.text} size={18} strokeWidth={2.8} style={styles.backIcon} />
              <Text style={styles.backText}>Settings</Text>
            </Pressable>
          ) : (
            <View>
              <Text style={styles.kicker}>CONTROL CENTER</Text>
              <Text style={styles.title}>Settings</Text>
            </View>
          )}
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, isAuthenticated ? styles.dotLive : styles.dotOff]} />
            <Text style={styles.statusText}>{isAuthenticated ? "Synced" : "Guest"}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {section === "overview" ? (
            <>
              <GlassCard
                radius={28}
                padding={18}
                borderColor="rgba(98,208,255,0.30)"
                gradient={["rgba(63,169,255,0.22)", "rgba(255,255,255,0.03)"]}
                glowColor={Colors.goldBright}
              >
                <View style={styles.heroTop}>
                  <LinearGradient colors={[Colors.goldBright, Colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                    <UserRound color={Colors.ink} size={22} strokeWidth={3} />
                  </LinearGradient>
                  <View style={styles.heroCopy}>
                    <Text style={styles.heroName}>{profile.displayName || profile.handle || "$OGS user"}</Text>
                    <Text style={styles.heroSub}>{isAuthenticated ? accountLabel : "Sign in to sync settings across devices"}</Text>
                  </View>
                </View>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${completion}%` }]} /></View>
                <Text style={styles.progressText}>Profile setup {completion}% complete</Text>
              </GlassCard>

              <View style={styles.quickGrid}>
                <Stat label="Watchlist" value={String(watchlist.length)} Icon={Gem} />
                <Stat label="Alerts" value={String(alerts.length)} Icon={Bell} />
                <Stat label="Wallets" value={String(wallets.length)} Icon={Wallet} />
              </View>

              <Group title="SETTINGS">
                <MenuRow Icon={Bell} label="Notifications" sub="Push, whales, haptics" onPress={() => openSection("notifications")} />
                <MenuRow Icon={Palette} label="Appearance" sub={`${prefs.theme} · ${prefs.currency} · ${prefs.language.toUpperCase()}`} onPress={() => openSection("appearance")} />
                <MenuRow Icon={UserRound} label="Account" sub="Auth and data controls" onPress={() => openSection("account")} />
                <MenuRow Icon={HelpCircle} label="Support & legal" sub="Help, terms, privacy, licenses" onPress={() => openSection("support")} />
              </Group>
            </>
          ) : null}

          {section === "notifications" ? (
            <Group title="NOTIFICATIONS">
              <ToggleRow Icon={Bell} label="Push notifications" sub="Price moves, replies, mentions" value={prefs.push} onChange={(push) => setPrefs({ push })} />
              <ToggleRow Icon={Gem} label="Whale alerts" sub="Large buys and sells above your threshold" value={prefs.whaleAlerts} onChange={(whaleAlerts) => setPrefs({ whaleAlerts })} />
              <ToggleRow Icon={Vibrate} label="Haptics" sub="Tactile feedback for actions" value={prefs.haptics} onChange={(haptics) => setPrefs({ haptics })} />
            </Group>
          ) : null}

          {section === "appearance" ? (
            <>
              <Group title="THEME">{themes.map((t) => <ChoiceRow key={t.id} label={t.label} sub={t.sub} active={prefs.theme === t.id} onPress={() => setPrefs({ theme: t.id })} />)}</Group>
              <Group title="CURRENCY"><Chips values={["USD", "EUR", "GBP", "SOL"] as Currency[]} active={prefs.currency} format={(v) => v} onPick={(currency) => setPrefs({ currency })} /></Group>
              <Group title="LANGUAGE">{languages.map((l) => <ChoiceRow key={l.id} Icon={Languages} label={l.label} sub={l.id.toUpperCase()} active={prefs.language === l.id} onPress={() => setPrefs({ language: l.id })} />)}</Group>
            </>
          ) : null}

          {section === "account" ? (
            <Group title="ACCOUNT">
              {isOwner ? <MenuRow Icon={Wrench} label="Admin dashboard" sub="Open platform admin tools" onPress={() => router.push("/admin")} /> : null}
              <MenuRow Icon={Trash2} label="Reset local data" sub="Clear device cache and local saved data" danger onPress={resetLocalData} />
              <MenuRow Icon={LogOut} label={isAuthenticated ? "Sign out" : "Sign in / Create account"} sub={isAuthenticated ? accountLabel : "Sync profile and settings"} danger={isAuthenticated} onPress={confirmSignOut} />
              {isAuthenticated ? <MenuRow Icon={Trash2} label={isDeletingAccount ? "Deleting account…" : "Delete account"} sub="Permanently erase account and synced data" danger onPress={confirmDelete} /> : null}
            </Group>
          ) : null}

          {section === "support" ? (
            <Group title="SUPPORT & LEGAL">
              <MenuRow Icon={Bot} label="FAQ bot" sub="Instant answers · keyword engine, no AI" onPress={() => router.push("/faq-bot")} />
              <MenuRow Icon={HelpCircle} label="Help & support" sub="Telegram @ogscandev" onPress={() => Alert.alert("Support", "Message us on Telegram @ogscandev")} />
              <MenuRow Icon={Shield} label="Privacy policy" sub="How Crypto Community App handles data" onPress={() => router.push("/legal/privacy")} />
              <MenuRow Icon={Sparkles} label="Terms of service" sub="App rules and usage terms" onPress={() => router.push("/legal/terms")} />
              <MenuRow Icon={LinkIcon} label="Open-source licenses" sub="Third-party credits" onPress={() => router.push("/legal/licenses")} />
            </Group>
          ) : null}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <GlassCard
        radius={24}
        padding={0}
        borderColor="rgba(255,255,255,0.10)"
        gradient={["rgba(63,169,255,0.06)", "rgba(255,255,255,0.015)"]}
      >
        {children}
      </GlassCard>
    </View>
  );
}

function Stat({ label, value, Icon }: { label: string; value: string; Icon: LucideIcon }) {
  return (
    <GlassCard
      style={styles.stat}
      radius={20}
      padding={12}
      borderColor="rgba(255,255,255,0.10)"
      gradient={["rgba(63,169,255,0.10)", "rgba(255,255,255,0.02)"]}
    >
      <Icon color={Colors.goldBright} size={16} strokeWidth={2.6} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </GlassCard>
  );
}

function MenuRow({ Icon, label, sub, onPress, danger = false }: { Icon: LucideIcon; label: string; sub: string; onPress: () => void; danger?: boolean }) {
  return <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}><View style={[styles.rowIcon, danger && styles.dangerIcon]}><Icon color={danger ? "#FF6B6B" : Colors.goldBright} size={17} strokeWidth={2.6} /></View><View style={styles.rowCopy}><Text style={[styles.rowLabel, danger && styles.dangerText]}>{label}</Text><Text style={styles.rowSub}>{sub}</Text></View><ChevronRight color={Colors.muted2} size={18} strokeWidth={2.5} /></Pressable>;
}

function ToggleRow({ Icon, label, sub, value, onChange }: { Icon: LucideIcon; label: string; sub: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.rowIcon}><Icon color={Colors.goldBright} size={17} strokeWidth={2.6} /></View><View style={styles.rowCopy}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowSub}>{sub}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: "rgba(255,255,255,0.12)", true: Colors.gold }} thumbColor={value ? Colors.text : Colors.muted2} /></View>;
}

function ChoiceRow({ Icon, label, sub, active, onPress }: { Icon?: LucideIcon; label: string; sub: string; active: boolean; onPress: () => void }) {
  return <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}>{Icon ? <View style={styles.rowIcon}><Icon color={Colors.goldBright} size={17} strokeWidth={2.6} /></View> : null}<View style={styles.rowCopy}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowSub}>{sub}</Text></View><View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View></Pressable>;
}

function Chips<T extends string | number>({ values, active, format, onPick }: { values: T[]; active: T; format: (value: T) => string; onPick: (value: T) => void }) {
  return <View style={styles.chips}>{values.map((v) => { const isActive = v === active; return <Pressable key={String(v)} onPress={() => onPick(v)} style={[styles.chip, isActive && styles.chipActive]}><Text style={[styles.chipText, isActive && styles.chipTextActive]}>{format(v)}</Text></Pressable>; })}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { color: Colors.goldBright, fontSize: 11, fontWeight: "900", letterSpacing: 1.8 },
  title: { color: Colors.text, fontSize: 31, fontWeight: "900", letterSpacing: -1.1, marginTop: 2 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 42 },
  backIcon: { transform: [{ rotate: "180deg" }] },
  backText: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotLive: { backgroundColor: "#55F5B2" },
  dotOff: { backgroundColor: Colors.muted2 },
  statusText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  scroll: { paddingHorizontal: 20, paddingBottom: 120 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: { width: 48, height: 48, borderRadius: 18, backgroundColor: Colors.goldBright, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, minWidth: 0 },
  heroName: { color: Colors.text, fontSize: 19, fontWeight: "900" },
  heroSub: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 3 },
  progressTrack: { marginTop: 18, height: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 8, backgroundColor: Colors.goldBright },
  progressText: { color: Colors.muted, fontSize: 11, fontWeight: "800", marginTop: 9 },
  quickGrid: { flexDirection: "row", gap: 10, marginTop: 12 },
  stat: { flex: 1, minHeight: 78 },
  statValue: { color: Colors.text, fontSize: 20, fontWeight: "900", marginTop: 7 },
  statLabel: { color: Colors.muted, fontSize: 10, fontWeight: "800", marginTop: 1 },
  group: { marginTop: 22 },
  groupTitle: { color: Colors.muted2, fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: 9, marginLeft: 4 },
  row: { minHeight: 70, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)", gap: 12 },
  pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  rowIcon: { width: 36, height: 36, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(63,169,255,0.12)", borderWidth: 1, borderColor: "rgba(98,208,255,0.18)" },
  dangerIcon: { backgroundColor: "rgba(255,107,107,0.12)", borderColor: "rgba(255,107,107,0.22)" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { color: Colors.text, fontSize: 14.5, fontWeight: "900" },
  rowSub: { color: Colors.muted, fontSize: 11.5, fontWeight: "700", lineHeight: 16, marginTop: 3 },
  dangerText: { color: "#FF8E8E" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 9, padding: 14 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  chipActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  chipText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  chipTextActive: { color: Colors.ink },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: Colors.goldBright },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.goldBright },
  bottomSpacer: { height: 24 },
});
