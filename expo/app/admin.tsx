import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Ban,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarPlus,
  Check,
  Coins,
  Crown,
  FileText,
  Headphones,
  Megaphone,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Star,
  Tag,
  Trash2,
  Users,
  Volume2,
  Wallet,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { DEFAULT_BADGES, HOLDER_TIERS, type UserBadge } from "@/lib/badge-system";
import { navigateBack } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { useAdmin, type AdminRole } from "@/providers/admin-provider";
import { useAuth } from "@/providers/auth-provider";
import { fmtUsd } from "@/utils/format";

const OWNER_EMAIL = "audifyx@gmail.com";

type Section =
  | "overview"
  | "users"
  | "badges"
  | "submissions"
  | "lobbies"
  | "events"
  | "credits"
  | "logs"
  | "announcements"
  | "security"
  | "team"
  | "ops"
  | "growth"
  | "settings"
  | "support";

type IconComponent = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

interface TabItem {
  val: Section;
  label: string;
  Icon: IconComponent;
}

const TABS: TabItem[] = [
  { val: "overview", label: "Overview", Icon: BarChart3 },
  { val: "users", label: "Users", Icon: Users },
  { val: "badges", label: "Badges", Icon: Tag },
  { val: "submissions", label: "Submissions", Icon: Rocket },
  { val: "lobbies", label: "Lobbies", Icon: Volume2 },
  { val: "events", label: "Events", Icon: CalendarDays },
  { val: "credits", label: "Credits", Icon: Coins },
  { val: "logs", label: "Logs", Icon: FileText },
  { val: "announcements", label: "Announce", Icon: Bell },
  { val: "security", label: "Security", Icon: ShieldAlert },
  { val: "team", label: "Team", Icon: ShieldCheck },
  { val: "ops", label: "Ops", Icon: Radio },
  { val: "growth", label: "Growth", Icon: Megaphone },
  { val: "settings", label: "Settings", Icon: SettingsIcon },
  { val: "support", label: "Support", Icon: Headphones },
];

interface OverviewStats {
  totalUsers: number;
  activeUsers24h: number;
  submissionsPending: number;
  openTickets: number;
  activeLobbies: number;
  creditUsage24h: number;
}

interface ProfileRow {
  id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  sol_wallet: string | null;
  wallet_address: string | null;
  is_public: boolean | null;
  is_banned: boolean | null;
  verified: boolean | null;
  badge: string | null;
  custom_badges: UserBadge[] | null;
  followers_count: number | null;
  trades_count: number | null;
  win_rate: number | null;
  pnl_pct: number | null;
  created_at: string;
}

interface SubmissionRow {
  id: string;
  user_id: string | null;
  token_name: string;
  symbol: string;
  contract_address: string;
  status: "pending" | "approved" | "rejected" | "live" | string;
  tier: "free" | "gold" | "platinum" | string;
  is_featured: boolean;
  is_verified: boolean;
  is_hot: boolean;
  admin_notes: string | null;
  market_cap: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  created_at: string;
}

interface LobbyRow {
  id: string;
  name: string;
  host_id: string | null;
  livekit_room: string | null;
  status: string | null;
  is_active: boolean | null;
  created_at: string;
  memberCount: number;
}

interface CommunityRow {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
}

interface CreditRow {
  user_id: string;
  balance: number;
  monthly_cap: number;
  updated_at: string;
}

interface CreditLogRow {
  id: string;
  user_id: string;
  action: string;
  cost: number;
  created_at: string;
}

interface AuditRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

interface AdminRoleRow {
  id: string | null;
  user_id: string;
  email: string | null;
  role: AdminRole;
  permissions: Record<string, unknown> | null;
  created_at: string;
}

interface SettingRow {
  id: string | null;
  key: string;
  value: unknown;
  category: string;
  description: string | null;
  updated_at: string;
}

interface SupportTicketRow {
  id: string;
  user_id: string;
  username: string | null;
  subject: string;
  body: string | null;
  status: string;
  priority: string | null;
  created_at: string;
  updated_at: string | null;
}

interface NotificationInput {
  title: string;
  message: string;
  type: "announcement" | "alert" | "system";
}

interface AdminTool {
  id: string;
  title: string;
  subtitle: string;
  category: "moderation" | "wallets" | "launches" | "growth" | "security" | "support" | "data" | "automation";
  action: Section;
  Icon: IconComponent;
  danger?: boolean;
}

const ADMIN_TOOLKIT: AdminTool[] = [
  { id: "user-ban-hammer", title: "Ban hammer", subtitle: "Suspend spam accounts instantly", category: "moderation", action: "users", Icon: Ban, danger: true },
  { id: "badge-forge", title: "Badge forge", subtitle: "Grant verified, team, mod, holder, whale", category: "moderation", action: "badges", Icon: Tag },
  { id: "wallet-lookup", title: "Wallet lookup", subtitle: "Search users by SOL wallet", category: "wallets", action: "users", Icon: Wallet },
  { id: "credit-printer", title: "Credit printer", subtitle: "Top up or reset user credits", category: "wallets", action: "credits", Icon: Coins },
  { id: "pump-approvals", title: "Pump approvals", subtitle: "Approve, reject, feature launches", category: "launches", action: "submissions", Icon: Rocket },
  { id: "hot-token-toggle", title: "Hot token toggle", subtitle: "Feature high priority submissions", category: "launches", action: "submissions", Icon: Star },
  { id: "global-broadcast", title: "Global broadcast", subtitle: "Send alerts to every user", category: "growth", action: "announcements", Icon: Megaphone },
  { id: "notification-center", title: "Notification center", subtitle: "System, alert, announcement blasts", category: "growth", action: "announcements", Icon: Bell },
  { id: "role-vault", title: "Role vault", subtitle: "Audit and revoke admin access", category: "security", action: "security", Icon: Crown },
  { id: "audit-radar", title: "Audit radar", subtitle: "Realtime admin action log", category: "security", action: "logs", Icon: ShieldAlert },
  { id: "support-inbox", title: "Support inbox", subtitle: "Close, pend, triage tickets", category: "support", action: "support", Icon: Headphones },
  { id: "lobby-control", title: "Lobby control", subtitle: "Remove bad rooms and communities", category: "support", action: "lobbies", Icon: Volume2 },
  { id: "platform-switches", title: "Platform switches", subtitle: "Feature flags and live settings", category: "automation", action: "settings", Icon: SettingsIcon },
  { id: "mission-stats", title: "Mission stats", subtitle: "Users, spend, launches, tickets", category: "data", action: "overview", Icon: BarChart3 },
];

export default function AdminDashboard() {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId, email, isAuthenticated } = useAuth();
  const { isAdmin, isOwner, role, isLoading } = useAdmin();
  const [section, setSection] = useState<Section>("overview");

  useEffect(() => {
    if (userId && email?.toLowerCase() === OWNER_EMAIL) {
      supabase
        .rpc("ensure_owner_role", { check_user_id: userId, check_email: email })
        .then(({ error }) => {
          if (error) console.log("[admin] owner role ensure failed", error.message);
        });
    }
  }, [email, userId]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin"] });
  }, [qc]);

  if (isLoading) {
    return (
      <View style={styles.gateRoot}>
        <ActivityIndicator color={Colors.goldBright} />
      </View>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <SafeAreaView style={styles.gateRoot} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ShieldAlert color={Colors.goldBright} size={46} strokeWidth={2.4} />
        <Text style={styles.gateTitle}>Owner console</Text>
        <Text style={styles.gateBody}>
          {isAuthenticated
            ? `${email ?? "This account"} is not authorized for SolTools admin access.`
            : "Sign in with the owner or admin account to continue."}
        </Text>
        <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.primarySolid, pressed && styles.pressedDeep]}>
          <Text style={styles.primarySolidText}>Return home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root} testID="admin-dashboard">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient
        colors={["rgba(244,198,91,0.22)", "rgba(17,39,79,0.26)", "rgba(2,2,2,0)"]}
        style={styles.bgGlow}
        pointerEvents="none"
      />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigateBack(router, "/(tabs)/home")} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} testID="admin-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Broken Glass control room</Text>
            <Text style={styles.headerTitle}>Admin Dashboard</Text>
          </View>
          <Pressable onPress={refresh} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} testID="admin-refresh">
            <RefreshCw color={Colors.goldBright} size={16} strokeWidth={2.4} />
          </Pressable>
          <View style={[styles.rolePill, { borderColor: roleColor(role) }]}>
            <Crown color={roleColor(role)} size={11} strokeWidth={3} />
            <Text style={[styles.rolePillText, { color: roleColor(role) }]}>{(role ?? "admin").toUpperCase()}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
          {TABS.map((t) => {
            const active = section === t.val;
            return (
              <Pressable
                key={t.val}
                onPress={() => setSection(t.val)}
                style={({ pressed }) => [styles.tabBtn, active && styles.tabBtnActive, pressed && styles.pressedDeep]}
                testID={`admin-tab-${t.val}`}
              >
                <t.Icon color={active ? Colors.ink : Colors.muted} size={13} strokeWidth={2.6} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.content}>
          {section === "overview" && <OverviewSection onJump={setSection} />}
          {section === "users" && <UsersSection />}
          {section === "badges" && <BadgesSection />}
          {section === "submissions" && <SubmissionsSection />}
          {section === "lobbies" && <LobbiesSection />}
          {section === "events" && <EventsSection />}
          {section === "credits" && <CreditsSection />}
          {section === "logs" && <LogsSection />}
          {section === "announcements" && <AnnouncementsSection />}
          {section === "security" && <SecuritySection isOwner={isOwner} />}
          {section === "team" && <TeamSection isOwner={isOwner} />}
          {section === "ops" && <OpsSection onJump={setSection} />}
          {section === "growth" && <GrowthSection onJump={setSection} />}
          {section === "settings" && <SettingsSection />}
          {section === "support" && <SupportSection />}
        </View>
      </SafeAreaView>
    </View>
  );
}

function useAuditLogger() {
  const { userId } = useAuth();
  return useCallback(
    async (action: string, targetType: string, targetId?: string | null, oldValues?: unknown, newValues?: unknown) => {
      if (!userId) return;
      const { error } = await supabase.from("admin_audit_log").insert({
        admin_user_id: userId,
        action,
        target_type: targetType,
        target_id: targetId && isUuid(targetId) ? targetId : null,
        old_values: oldValues ?? null,
        new_values: newValues ?? null,
      });
      if (error) console.log("[admin] audit log failed", error.message);
    },
    [userId],
  );
}

/* -------------------------------- OVERVIEW ------------------------------- */

function OverviewSection({ onJump }: { onJump: (s: Section) => void }) {
  const statsQuery = useQuery<OverviewStats>({
    queryKey: ["admin", "overview"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [users, active, submissions, tickets, lobbies, credits] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("updated_at", since),
        supabase.from("pump_v5_submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("trading_lobbies").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("credit_logs").select("cost").gte("created_at", since).limit(1000),
      ]);
      const creditRows = (credits.data ?? []) as Pick<CreditLogRow, "cost">[];
      const creditUsage24h = creditRows.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
      return {
        totalUsers: users.count ?? 0,
        activeUsers24h: active.count ?? 0,
        submissionsPending: submissions.count ?? 0,
        openTickets: tickets.count ?? 0,
        activeLobbies: lobbies.count ?? 0,
        creditUsage24h,
      };
    },
  });

  const s = statsQuery.data;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[Colors.goldBright, Colors.gold, Colors.silver]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        <View style={styles.heroBadge}>
          <Crown color={Colors.ink} size={11} strokeWidth={3} />
          <Text style={styles.heroBadgeText}>OWNER LOCKED · LIVE</Text>
        </View>
        <Text style={styles.heroTitle}>SolTools mission control</Text>
        <Text style={styles.heroBody}>Manage users, launches, credits, lobbies, settings, announcements, support, security, and owner-only growth ops from one mobile-first console.</Text>
        <View style={styles.heroMetricsRow}>
          <HeroMetric label="USERS" value={s?.totalUsers} />
          <HeroMetric label="PENDING" value={s?.submissionsPending} />
          <HeroMetric label="OPEN TICKETS" value={s?.openTickets} />
        </View>
      </LinearGradient>

      <Text style={styles.sectionLabel}>PLATFORM SNAPSHOT</Text>
      <View style={styles.statsGrid}>
        <StatCard label="TOTAL USERS" value={s?.totalUsers} Icon={Users} accent={Colors.goldBright} />
        <StatCard label="ACTIVE USERS · 24H" value={s?.activeUsers24h} Icon={Radio} accent={Colors.silver} />
        <StatCard label="PENDING SUBMISSIONS" value={s?.submissionsPending} Icon={Rocket} accent={Colors.gold} />
        <StatCard label="OPEN TICKETS" value={s?.openTickets} Icon={Headphones} accent={Colors.platinum} />
        <StatCard label="ACTIVE LOBBIES" value={s?.activeLobbies} Icon={Volume2} accent={Colors.silver} />
        <StatCard label="CREDITS USED · 24H" value={s?.creditUsage24h} Icon={Coins} accent={Colors.goldBright} />
      </View>

      <Text style={styles.sectionLabel}>FAST LANES</Text>
      <View style={styles.quickGrid}>
        <QuickAction Icon={Users} label="Users" sub="Ban, promote, reset" onPress={() => onJump("users")} />
        <QuickAction Icon={Rocket} label="Submissions" sub="Approve Pump V5" onPress={() => onJump("submissions")} />
        <QuickAction Icon={Tag} label="Badges" sub="Grant holder/admin" onPress={() => onJump("badges")} />
        <QuickAction Icon={Coins} label="Credits" sub="Adjust balances" onPress={() => onJump("credits")} />
        <QuickAction Icon={Bell} label="Announce" sub="Broadcast to all" onPress={() => onJump("announcements")} />
        <QuickAction Icon={ShieldAlert} label="Security" sub="Roles & revokes" onPress={() => onJump("security")} />
        <QuickAction Icon={Radio} label="Ops tools" sub="Owner toolkit" onPress={() => onJump("ops")} />
        <QuickAction Icon={Megaphone} label="Growth" sub="Promos & blasts" onPress={() => onJump("growth")} />
        <QuickAction Icon={Headphones} label="Support" sub="Realtime inbox" onPress={() => onJump("support")} />
      </View>

      {statsQuery.isError ? <Text style={styles.errorText}>Overview failed to load. Confirm the admin database migration has been applied.</Text> : null}
    </ScrollView>
  );
}

/* --------------------------------- USERS --------------------------------- */

function UsersSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();
  const [query, setQuery] = useState<string>("");

  const usersQuery = useQuery<ProfileRow[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,username,display_name,avatar_url,sol_wallet,wallet_address,is_public,is_banned,verified,badge,custom_badges,followers_count,trades_count,win_rate,pnl_pct,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return usersQuery.data ?? [];
    return (usersQuery.data ?? []).filter((u) => {
      const haystack = `${u.username ?? ""} ${u.display_name ?? ""} ${u.sol_wallet ?? ""} ${u.wallet_address ?? ""} ${u.user_id ?? u.id}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query, usersQuery.data]);

  const banMutation = useMutation({
    mutationFn: async (row: ProfileRow) => {
      const uid = profileUserId(row);
      const next = !row.is_banned;
      const { error } = await supabase
        .from("profiles")
        .update({ is_banned: next, is_public: !next, updated_at: new Date().toISOString() })
        .or(`user_id.eq.${uid},id.eq.${uid}`);
      if (error) throw error;
      await logAction(next ? "ban_user" : "unban_user", "user", uid, { is_banned: row.is_banned }, { is_banned: next });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: (e: Error) => Alert.alert("User update failed", e.message),
  });

  const resetCreditsMutation = useMutation({
    mutationFn: async (row: ProfileRow) => {
      const uid = profileUserId(row);
      const { error } = await supabase.from("credits").upsert({ user_id: uid, balance: 10000, monthly_cap: 6500 }, { onConflict: "user_id" });
      if (error) throw error;
      await logAction("reset_user_credits", "user", uid, null, { balance: 10000 });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Reset failed", e.message),
  });

  const quickBadgeMutation = useMutation({
    mutationFn: async (input: { row: ProfileRow; badge: UserBadge; remove?: boolean }) => updateProfileBadge(input.row, input.badge, logAction, input.remove),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "badge-users"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => Alert.alert("Badge update failed", e.message),
  });

  return (
    <View style={styles.content}>
      <SearchBox value={query} onChangeText={setQuery} placeholder="Search username, wallet, or user id…" />
      <FlatList
        data={filtered}
        keyExtractor={(item) => profileUserId(item)}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={usersQuery.isLoading ? <Loader /> : <EmptyState text="No users found." />}
        renderItem={({ item }) => (
          <View style={styles.card} testID={`admin-user-${profileUserId(item)}`}>
            <View style={styles.rowHeader}>
              <Avatar label={item.display_name ?? item.username ?? "U"} />
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.display_name ?? item.username ?? profileUserId(item).slice(0, 8)}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>@{item.username ?? "unset"} · {item.wallet_address ?? item.sol_wallet ?? "no wallet"}</Text>
              </View>
              {item.is_banned ? <Pill label="BANNED" color={Colors.platinum} /> : <Pill label="ACTIVE" color={Colors.goldBright} />}
            </View>
            <View style={styles.metricsRow}>
              <Metric label="PNL" value={`${Number(item.pnl_pct ?? 0).toFixed(1)}%`} />
              <Metric label="TRADES" value={String(item.trades_count ?? 0)} />
              <Metric label="WIN" value={`${Number(item.win_rate ?? 0).toFixed(0)}%`} />
            </View>
            <BadgeAdminPanel row={item} onToggle={(badge, remove) => quickBadgeMutation.mutate({ row: item, badge, remove })} />
            <View style={styles.actionGrid}>
              <ActionButton label="View" Icon={Wallet} onPress={() => Alert.alert("User activity", `PnL: ${Number(item.pnl_pct ?? 0).toFixed(1)}%\nTrades: ${item.trades_count ?? 0}\nWin rate: ${Number(item.win_rate ?? 0).toFixed(0)}%`)} />
              <ActionButton label={item.is_banned ? "Unban" : "Ban"} Icon={Ban} danger onPress={() => banMutation.mutate(item)} />
              <ActionButton label="Reset credits" Icon={Coins} onPress={() => resetCreditsMutation.mutate(item)} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

/* -------------------------------- BADGES --------------------------------- */

const BADGE_OPTIONS: UserBadge[] = [
  DEFAULT_BADGES.admin,
  DEFAULT_BADGES.team,
  DEFAULT_BADGES.mod,
  DEFAULT_BADGES.verified,
  DEFAULT_BADGES.beta,
  ...HOLDER_TIERS.map((tier) => tier.badge),
];

function BadgesSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();
  const [query, setQuery] = useState<string>("");
  const [customLabel, setCustomLabel] = useState<string>("");
  const [customColor, setCustomColor] = useState<string>(Colors.goldBright);

  const usersQuery = useQuery<ProfileRow[]>({
    queryKey: ["admin", "badge-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,username,display_name,avatar_url,sol_wallet,wallet_address,is_public,is_banned,verified,badge,custom_badges,followers_count,trades_count,win_rate,pnl_pct,created_at")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = usersQuery.data ?? [];
    if (!q) return rows;
    return rows.filter((u) => `${u.username ?? ""} ${u.display_name ?? ""} ${u.wallet_address ?? ""} ${u.sol_wallet ?? ""} ${profileUserId(u)}`.toLowerCase().includes(q));
  }, [query, usersQuery.data]);

  const updateBadgesMutation = useMutation({
    mutationFn: async (input: { row: ProfileRow; badge: UserBadge; remove?: boolean }) => updateProfileBadge(input.row, input.badge, logAction, input.remove),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "badge-users"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => Alert.alert("Badge update failed", e.message),
  });

  const makeCustomBadge = useCallback((): UserBadge | null => {
    const label = customLabel.trim();
    const color = customColor.trim() || Colors.goldBright;
    if (!label) return null;
    return {
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `badge-${Date.now()}`,
      label: label.toUpperCase(),
      color,
      glow: true,
      priority: 70,
      rarity: "rare",
    };
  }, [customColor, customLabel]);

  return (
    <View style={styles.content}>
      <SearchBox value={query} onChangeText={setQuery} placeholder="Search user to grant badges…" />
      <FlatList
        data={filtered}
        keyExtractor={(item) => profileUserId(item)}
        contentContainerStyle={styles.listPad}
        ListHeaderComponent={
          <View style={styles.noticeCard}>
            <Tag color={Colors.goldBright} size={18} strokeWidth={2.6} />
            <Text style={styles.noticeText}>Grant admin, team, moderator, verified, beta, holder, supporter, whale, or custom badges. These write into profiles.custom_badges and immediately render on profiles/user cards.</Text>
          </View>
        }
        ListEmptyComponent={usersQuery.isLoading ? <Loader /> : <EmptyState text="No users found for badge assignment." />}
        renderItem={({ item }) => {
          const badges = normalizeAdminBadges(item.custom_badges);
          const customBadge = makeCustomBadge();
          return (
            <View style={styles.card} testID={`admin-badges-${profileUserId(item)}`}>
              <View style={styles.rowHeader}>
                <Avatar label={item.display_name ?? item.username ?? "U"} Icon={Tag} />
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{item.display_name ?? item.username ?? profileUserId(item).slice(0, 8)}</Text>
                  <Text style={styles.rowSub}>@{item.username ?? "unset"} · {badges.length} badge{badges.length === 1 ? "" : "s"}</Text>
                </View>
                {item.verified ? <Pill label="VERIFIED" color={Colors.goldBright} /> : null}
              </View>

              <View style={styles.badgePreviewRow}>
                {badges.length > 0 ? (
                  badges.map((badge) => (
                    <RemovableBadgePill
                      key={badge.id}
                      badge={badge}
                      onRemove={() =>
                        Alert.alert(
                          "Remove badge?",
                          `Remove "${badge.label}" from ${item.display_name ?? item.username ?? "this user"}?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Remove",
                              style: "destructive",
                              onPress: () => updateBadgesMutation.mutate({ row: item, badge, remove: true }),
                            },
                          ],
                        )
                      }
                    />
                  ))
                ) : (
                  <Text style={styles.rowSub}>No badges assigned yet.</Text>
                )}
              </View>

              <Text style={styles.inputLabel}>PRESET BADGES</Text>
              <View style={styles.actionGrid}>
                {BADGE_OPTIONS.map((badge) => {
                  const hasBadge = badges.some((b) => b.id === badge.id);
                  return (
                    <ActionButton
                      key={badge.id}
                      label={hasBadge ? `Remove ${badge.label}` : badge.label}
                      Icon={hasBadge ? X : Star}
                      danger={hasBadge}
                      onPress={() => updateBadgesMutation.mutate({ row: item, badge, remove: hasBadge })}
                    />
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>CUSTOM BADGE</Text>
              <View style={styles.inlineInputRow}>
                <TextInput value={customLabel} onChangeText={setCustomLabel} placeholder="Founder, OG, whale caller…" placeholderTextColor={Colors.muted2} style={styles.compactInput} />
                <TextInput value={customColor} onChangeText={setCustomColor} placeholder="#55F5B2" placeholderTextColor={Colors.muted2} style={styles.compactInput} autoCapitalize="none" />
                <ActionButton label="Grant custom" Icon={Tag} disabled={!customBadge} onPress={() => customBadge && updateBadgesMutation.mutate({ row: item, badge: customBadge })} />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function BadgeAdminPanel({ row, onToggle }: { row: ProfileRow; onToggle: (badge: UserBadge, remove: boolean) => void }) {
  const badges = normalizeAdminBadges(row.custom_badges);
  return (
    <View style={styles.badgeAdminPanel}>
      <View style={styles.badgePanelHeader}>
        <Text style={styles.inputLabel}>USER BADGES</Text>
        <Text style={styles.badgePanelCount}>{badges.length} active</Text>
      </View>
      <View style={styles.badgePreviewRow}>
        {badges.length > 0 ? (
          badges.map((badge) => (
            <RemovableBadgePill key={badge.id} badge={badge} onRemove={() => onToggle(badge, true)} />
          ))
        ) : (
          <Text style={styles.rowSub}>No badges yet. Tap below to add one.</Text>
        )}
      </View>
      <View style={styles.actionGrid}>
        {BADGE_OPTIONS.slice(0, 6).map((badge) => {
          const hasBadge = badges.some((b) => b.id === badge.id);
          return <ActionButton key={badge.id} label={hasBadge ? `Remove ${badge.label}` : `Add ${badge.label}`} Icon={hasBadge ? X : Tag} danger={hasBadge} onPress={() => onToggle(badge, hasBadge)} />;
        })}
      </View>
    </View>
  );
}

/* ------------------------------ SUBMISSIONS ------------------------------ */

function SubmissionsSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();
  const [filter, setFilter] = useState<string>("pending");

  const submissionsQuery = useQuery<SubmissionRow[]>({
    queryKey: ["admin", "submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pump_v5_submissions")
        .select("id,user_id,token_name,symbol,contract_address,status,tier,is_featured,is_verified,is_hot,admin_notes,market_cap,liquidity_usd,volume_24h_usd,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubmissionRow[];
    },
  });

  const rows = useMemo(() => {
    const all = submissionsQuery.data ?? [];
    if (filter === "all") return all;
    return all.filter((s) => s.status === filter);
  }, [filter, submissionsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async (input: { row: SubmissionRow; patch: Partial<SubmissionRow>; action: string }) => {
      const { error } = await supabase.from("pump_v5_submissions").update({ ...input.patch, updated_at: new Date().toISOString() }).eq("id", input.row.id);
      if (error) throw error;
      await logAction(input.action, "submission", input.row.id, input.row, input.patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "submissions"] });
      qc.invalidateQueries({ queryKey: ["launchpad", "listings"] });
    },
    onError: (e: Error) => Alert.alert("Submission update failed", e.message),
  });

  return (
    <View style={styles.content}>
      <FilterRail values={["pending", "approved", "rejected", "live", "all"]} active={filter} onChange={setFilter} />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={submissionsQuery.isLoading ? <Loader /> : <EmptyState text="No submissions in this queue." />}
        renderItem={({ item }) => (
          <View style={styles.card} testID={`submission-${item.id}`}>
            <View style={styles.rowHeader}>
              <Avatar label={item.symbol} Icon={Rocket} />
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>${item.symbol} · {item.token_name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{item.contract_address}</Text>
              </View>
              <Pill label={item.status.toUpperCase()} color={statusColor(item.status)} />
            </View>
            <View style={styles.metricsRow}>
              <Metric label="MCAP" value={fmtUsd(Number(item.market_cap ?? 0))} />
              <Metric label="LIQ" value={fmtUsd(Number(item.liquidity_usd ?? 0))} />
              <Metric label="TIER" value={item.tier.toUpperCase()} />
            </View>
            <View style={styles.actionGrid}>
              <ActionButton label="Approve" Icon={Check} onPress={() => updateMutation.mutate({ row: item, patch: { status: "approved", is_verified: true }, action: "approve_submission" })} />
              <ActionButton label="Reject" Icon={X} danger onPress={() => updateMutation.mutate({ row: item, patch: { status: "rejected" }, action: "reject_submission" })} />
              <ActionButton label={item.is_featured ? "Unfeature" : "Feature"} Icon={Star} onPress={() => updateMutation.mutate({ row: item, patch: { is_featured: !item.is_featured }, action: "toggle_featured_submission" })} />
            </View>
            <View style={styles.tierRow}>
              {(["free", "gold", "platinum"] as const).map((tier) => (
                <Pressable key={tier} onPress={() => updateMutation.mutate({ row: item, patch: { tier }, action: "set_submission_tier" })} style={[styles.filterChip, item.tier === tier && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, item.tier === tier && styles.filterChipTextActive]}>{tier.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      />
    </View>
  );
}

/* -------------------------------- LOBBIES -------------------------------- */

function LobbiesSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();

  const lobbiesQuery = useQuery<LobbyRow[]>({
    queryKey: ["admin", "lobbies"],
    queryFn: async () => {
      const [{ data: lobbies, error }, { data: members }] = await Promise.all([
        supabase.from("trading_lobbies").select("id,name,host_id,livekit_room,status,is_active,created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("lobby_members").select("lobby_id,left_at").is("left_at", null).limit(2000),
      ]);
      if (error) throw error;
      const counts = new Map<string, number>();
      ((members ?? []) as { lobby_id: string }[]).forEach((m) => counts.set(m.lobby_id, (counts.get(m.lobby_id) ?? 0) + 1));
      return ((lobbies ?? []) as Omit<LobbyRow, "memberCount">[]).map((lobby) => ({ ...lobby, memberCount: counts.get(lobby.id) ?? 0 }));
    },
  });

  const communitiesQuery = useQuery<CommunityRow[]>({
    queryKey: ["admin", "communities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("id,name,owner_id,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as CommunityRow[];
    },
  });

  const deleteLobbyMutation = useMutation({
    mutationFn: async (row: LobbyRow) => {
      const { error } = await supabase.from("trading_lobbies").delete().eq("id", row.id);
      if (error) throw error;
      await logAction("delete_lobby", "lobby", row.id, row, null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  const deleteCommunityMutation = useMutation({
    mutationFn: async (row: CommunityRow) => {
      const { error } = await supabase.from("communities").delete().eq("id", row.id);
      if (error) throw error;
      await logAction("delete_community", "community", row.id, row, null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionLabel}>TRADING LOBBIES</Text>
      {(lobbiesQuery.data ?? []).map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.rowHeader}>
            <Avatar label={item.name} Icon={Volume2} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>{item.livekit_room ?? "no LiveKit room"} · {item.memberCount} members</Text>
            </View>
            <Pill label={item.is_active ? "LIVE" : "ENDED"} color={item.is_active ? Colors.goldBright : Colors.muted} />
            <IconDanger onPress={() => deleteLobbyMutation.mutate(item)} />
          </View>
        </View>
      ))}
      {lobbiesQuery.isLoading ? <Loader /> : (lobbiesQuery.data ?? []).length === 0 ? <EmptyState text="No lobbies yet." /> : null}

      <Text style={styles.sectionLabel}>COMMUNITIES</Text>
      {(communitiesQuery.data ?? []).map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.rowHeader}>
            <Avatar label={item.name} Icon={Users} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>Owner {item.owner_id?.slice(0, 8) ?? "—"} · {new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            <IconDanger onPress={() => deleteCommunityMutation.mutate(item)} />
          </View>
        </View>
      ))}
      {communitiesQuery.isLoading ? <Loader /> : (communitiesQuery.data ?? []).length === 0 ? <EmptyState text="No communities yet." /> : null}
    </ScrollView>
  );
}

/* --------------------------------- EVENTS -------------------------------- */

interface AdminEventRow {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  cover_url: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  is_virtual: boolean;
  category: string | null;
  event_url: string | null;
  is_featured: boolean;
  is_published: boolean;
  rsvp_count: number;
  going_count: number;
  created_at: string;
}

interface EventDraft {
  id: string | null;
  title: string;
  description: string;
  bannerUrl: string;
  startsAt: string;
  endsAt: string;
  location: string;
  isVirtual: boolean;
  category: string;
  eventUrl: string;
  isFeatured: boolean;
  isPublished: boolean;
}

const EMPTY_EVENT: EventDraft = {
  id: null,
  title: "",
  description: "",
  bannerUrl: "",
  startsAt: "",
  endsAt: "",
  location: "",
  isVirtual: true,
  category: "",
  eventUrl: "",
  isFeatured: false,
  isPublished: true,
};

function toLocalInputValue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function EventsSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();
  const [draft, setDraft] = useState<EventDraft>(EMPTY_EVENT);

  const eventsQuery = useQuery<AdminEventRow[]>({
    queryKey: ["admin", "events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,title,description,banner_url,cover_url,starts_at,ends_at,location,is_virtual,category,event_url,is_featured,is_published,rsvp_count,going_count,created_at")
        .order("starts_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as AdminEventRow[];
    },
  });

  const resetDraft = useCallback(() => setDraft(EMPTY_EVENT), []);

  const saveMutation = useMutation({
    mutationFn: async (input: EventDraft) => {
      const title = input.title.trim();
      if (!title) throw new Error("Title is required");
      const startsAtIso = parseLocalInput(input.startsAt);
      if (!startsAtIso) throw new Error("Start time must be like 2026-05-20 19:30");
      const endsAtIso = input.endsAt.trim() ? parseLocalInput(input.endsAt) : null;
      if (input.endsAt.trim() && !endsAtIso) throw new Error("End time must be like 2026-05-20 21:00");
      const payload = {
        title,
        description: input.description.trim() || null,
        bannerUrl: input.bannerUrl.trim() || null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        location: input.location.trim() || null,
        isVirtual: input.isVirtual,
        category: input.category.trim() || null,
        eventUrl: input.eventUrl.trim() || null,
        isFeatured: input.isFeatured,
      };
      if (input.id) {
        const { error } = await supabase.rpc("admin_update_event", {
          p_event_id: input.id,
          p_title: payload.title,
          p_description: payload.description,
          p_banner_url: payload.bannerUrl,
          p_starts_at: payload.startsAt,
          p_ends_at: payload.endsAt,
          p_location: payload.location,
          p_is_virtual: payload.isVirtual,
          p_category: payload.category,
          p_event_url: payload.eventUrl,
          p_is_featured: payload.isFeatured,
          p_is_published: input.isPublished,
        });
        if (error) throw error;
        await logAction("admin_update_event", "event", input.id, null, payload);
        return input.id;
      }
      const { data, error } = await supabase.rpc("admin_create_event", {
        p_title: payload.title,
        p_description: payload.description,
        p_banner_url: payload.bannerUrl,
        p_starts_at: payload.startsAt,
        p_ends_at: payload.endsAt,
        p_location: payload.location,
        p_is_virtual: payload.isVirtual,
        p_category: payload.category,
        p_event_url: payload.eventUrl,
        p_is_featured: payload.isFeatured,
      });
      if (error) throw error;
      const newId = (data as string) ?? null;
      await logAction("admin_create_event", "event", newId ?? "new", null, payload);
      return newId;
    },
    onSuccess: () => {
      resetDraft();
      qc.invalidateQueries({ queryKey: ["admin", "events"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["fyp"] });
    },
    onError: (e: Error) => Alert.alert("Save failed", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: AdminEventRow) => {
      const { error } = await supabase.rpc("admin_delete_event", { p_event_id: row.id });
      if (error) throw error;
      await logAction("admin_delete_event", "event", row.id, row, null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "events"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["fyp"] });
    },
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  const togglePublishMutation = useMutation({
    mutationFn: async (row: AdminEventRow) => {
      const { error } = await supabase.rpc("admin_update_event", {
        p_event_id: row.id,
        p_title: null,
        p_description: null,
        p_banner_url: null,
        p_starts_at: null,
        p_ends_at: null,
        p_location: null,
        p_is_virtual: null,
        p_category: null,
        p_event_url: null,
        p_is_featured: null,
        p_is_published: !row.is_published,
      });
      if (error) throw error;
      await logAction("admin_toggle_event_published", "event", row.id, { is_published: row.is_published }, { is_published: !row.is_published });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "events"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["fyp"] });
    },
    onError: (e: Error) => Alert.alert("Toggle failed", e.message),
  });

  const onEdit = useCallback((row: AdminEventRow) => {
    setDraft({
      id: row.id,
      title: row.title ?? "",
      description: row.description ?? "",
      bannerUrl: row.banner_url ?? row.cover_url ?? "",
      startsAt: toLocalInputValue(row.starts_at),
      endsAt: row.ends_at ? toLocalInputValue(row.ends_at) : "",
      location: row.location ?? "",
      isVirtual: !!row.is_virtual,
      category: row.category ?? "",
      eventUrl: row.event_url ?? "",
      isFeatured: !!row.is_featured,
      isPublished: !!row.is_published,
    });
  }, []);

  const list = eventsQuery.data ?? [];

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.noticeCard}>
        <CalendarPlus color={Colors.goldBright} size={16} strokeWidth={2.6} />
        <Text style={styles.noticeText}>Create Discord-style events with banner, date, location and details. Published events surface on every user&apos;s For You tab and on the Events screen.</Text>
      </View>

      <Text style={styles.sectionLabel}>{draft.id ? "EDIT EVENT" : "NEW EVENT"}</Text>
      <View style={styles.cardLarge}>
        {draft.bannerUrl.trim() ? (
          <View style={styles.eventBannerPreview}>
            <ExpoImage source={{ uri: draft.bannerUrl.trim() }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>
        ) : null}
        <Text style={styles.inputLabel}>TITLE</Text>
        <TextInput value={draft.title} onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))} placeholder="Launch party, AMA, community meetup…" placeholderTextColor={Colors.muted2} style={styles.input} />

        <Text style={styles.inputLabel}>BANNER URL</Text>
        <TextInput value={draft.bannerUrl} onChangeText={(v) => setDraft((d) => ({ ...d, bannerUrl: v }))} placeholder="https://..." placeholderTextColor={Colors.muted2} style={styles.input} autoCapitalize="none" autoCorrect={false} />

        <Text style={styles.inputLabel}>DESCRIPTION</Text>
        <TextInput value={draft.description} onChangeText={(v) => setDraft((d) => ({ ...d, description: v }))} placeholder="What is this event about?" placeholderTextColor={Colors.muted2} style={[styles.input, styles.textArea]} multiline />

        <Text style={styles.inputLabel}>STARTS AT (YYYY-MM-DD HH:MM)</Text>
        <TextInput value={draft.startsAt} onChangeText={(v) => setDraft((d) => ({ ...d, startsAt: v }))} placeholder="2026-05-20 19:30" placeholderTextColor={Colors.muted2} style={styles.input} autoCapitalize="none" autoCorrect={false} />

        <Text style={styles.inputLabel}>ENDS AT (optional)</Text>
        <TextInput value={draft.endsAt} onChangeText={(v) => setDraft((d) => ({ ...d, endsAt: v }))} placeholder="2026-05-20 21:00" placeholderTextColor={Colors.muted2} style={styles.input} autoCapitalize="none" autoCorrect={false} />

        <Text style={styles.inputLabel}>LOCATION / LINK INFO</Text>
        <TextInput value={draft.location} onChangeText={(v) => setDraft((d) => ({ ...d, location: v }))} placeholder="Discord voice, NYC HQ, Twitter Space…" placeholderTextColor={Colors.muted2} style={styles.input} />

        <Text style={styles.inputLabel}>CATEGORY</Text>
        <TextInput value={draft.category} onChangeText={(v) => setDraft((d) => ({ ...d, category: v }))} placeholder="ama, launch, party, workshop…" placeholderTextColor={Colors.muted2} style={styles.input} autoCapitalize="none" />

        <Text style={styles.inputLabel}>JOIN URL (optional)</Text>
        <TextInput value={draft.eventUrl} onChangeText={(v) => setDraft((d) => ({ ...d, eventUrl: v }))} placeholder="https://discord.gg/..." placeholderTextColor={Colors.muted2} style={styles.input} autoCapitalize="none" autoCorrect={false} />

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Virtual event</Text>
            <Text style={styles.rowSub}>Online instead of in-person.</Text>
          </View>
          <Switch value={draft.isVirtual} onValueChange={(v) => setDraft((d) => ({ ...d, isVirtual: v }))} trackColor={{ true: Colors.goldBright, false: Colors.line }} thumbColor={Colors.text} />
        </View>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Featured on For You</Text>
            <Text style={styles.rowSub}>Boost to the top of the FYP feed.</Text>
          </View>
          <Switch value={draft.isFeatured} onValueChange={(v) => setDraft((d) => ({ ...d, isFeatured: v }))} trackColor={{ true: Colors.goldBright, false: Colors.line }} thumbColor={Colors.text} />
        </View>
        {draft.id ? (
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Published</Text>
              <Text style={styles.rowSub}>Unpublish to hide from users without deleting.</Text>
            </View>
            <Switch value={draft.isPublished} onValueChange={(v) => setDraft((d) => ({ ...d, isPublished: v }))} trackColor={{ true: Colors.goldBright, false: Colors.line }} thumbColor={Colors.text} />
          </View>
        ) : null}

        <PrimaryButton label={draft.id ? "Save changes" : "Create event"} Icon={draft.id ? Check : CalendarPlus} onPress={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending} style={styles.formButton} />
        {draft.id ? <ActionButton label="Cancel edit" Icon={X} onPress={resetDraft} /> : null}
      </View>

      <Text style={styles.sectionLabel}>EVENTS ({list.length})</Text>
      {list.map((item) => (
        <View key={item.id} style={styles.card} testID={`admin-event-${item.id}`}>
          {item.banner_url || item.cover_url ? (
            <View style={styles.eventCardBanner}>
              <ExpoImage source={{ uri: item.banner_url ?? item.cover_url ?? "" }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
          ) : null}
          <View style={styles.rowHeader}>
            <Avatar label={item.title.slice(0, 2).toUpperCase()} Icon={CalendarDays} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {new Date(item.starts_at).toLocaleString()} · {item.is_virtual ? "Virtual" : item.location ?? "In person"}
              </Text>
            </View>
            <Pill label={item.is_published ? "LIVE" : "DRAFT"} color={item.is_published ? Colors.goldBright : Colors.muted} />
          </View>
          <View style={styles.metricsRow}>
            <Metric label="GOING" value={String(item.going_count ?? 0)} />
            <Metric label="RSVPS" value={String(item.rsvp_count ?? 0)} />
            <Metric label="FEATURED" value={item.is_featured ? "YES" : "NO"} />
          </View>
          <View style={styles.actionGrid}>
            <ActionButton label="Edit" Icon={FileText} onPress={() => onEdit(item)} />
            <ActionButton label={item.is_published ? "Unpublish" : "Publish"} Icon={item.is_published ? ShieldOff : Check} onPress={() => togglePublishMutation.mutate(item)} />
            <ActionButton label="Delete" Icon={Trash2} danger onPress={() => Alert.alert("Delete event?", item.title, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item) }])} />
          </View>
        </View>
      ))}
      {eventsQuery.isLoading ? <Loader /> : list.length === 0 ? <EmptyState text="No events yet. Create the first one above." /> : null}
    </ScrollView>
  );
}

/* -------------------------------- CREDITS -------------------------------- */

function CreditsSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();
  const [adjustByUser, setAdjustByUser] = useState<Record<string, string>>({});

  const creditsQuery = useQuery<CreditRow[]>({
    queryKey: ["admin", "credits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credits").select("user_id,balance,monthly_cap,updated_at").order("balance", { ascending: true }).limit(100);
      if (error) throw error;
      return (data ?? []) as CreditRow[];
    },
  });

  const topSpendersQuery = useQuery<CreditLogRow[]>({
    queryKey: ["admin", "credit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_logs").select("id,user_id,action,cost,created_at").order("created_at", { ascending: false }).limit(80);
      if (error) throw error;
      return (data ?? []) as CreditLogRow[];
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async (input: { row: CreditRow; delta: number }) => {
      const next = Math.max(0, input.row.balance + input.delta);
      const { error } = await supabase.from("credits").update({ balance: next, updated_at: new Date().toISOString() }).eq("user_id", input.row.user_id);
      if (error) throw error;
      await logAction("adjust_credits", "user", input.row.user_id, { balance: input.row.balance }, { balance: next, delta: input.delta });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Credit adjustment failed", e.message),
  });

  const resetAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("credits").update({ balance: 10000, monthly_cap: 6500, updated_at: new Date().toISOString() }).gte("balance", 0);
      if (error) throw error;
      await logAction("reset_all_monthly_credits", "credits", null, null, { balance: 10000, monthly_cap: 6500 });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Reset failed", e.message),
  });

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <PrimaryButton label="Reset all monthly credits" Icon={RefreshCw} onPress={() => Alert.alert("Reset every user?", "Set every credit balance to 10,000.", [{ text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: () => resetAllMutation.mutate() }])} />
      <Text style={styles.sectionLabel}>BALANCES</Text>
      {(creditsQuery.data ?? []).map((row) => {
        const input = adjustByUser[row.user_id] ?? "";
        const delta = Number(input || 0);
        return (
          <View key={row.user_id} style={styles.card}>
            <View style={styles.rowHeader}>
              <Avatar label="C" Icon={Coins} />
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{row.balance.toLocaleString()} credits</Text>
                <Text style={styles.rowSub}>{row.user_id} · cap {row.monthly_cap.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.inlineInputRow}>
              <TextInput value={input} onChangeText={(value) => setAdjustByUser((prev) => ({ ...prev, [row.user_id]: value }))} keyboardType="numeric" placeholder="Amount" placeholderTextColor={Colors.muted2} style={styles.compactInput} />
              <ActionButton label="Add" Icon={Coins} disabled={!delta} onPress={() => adjustMutation.mutate({ row, delta: Math.abs(delta) })} />
              <ActionButton label="Subtract" Icon={Coins} danger disabled={!delta} onPress={() => adjustMutation.mutate({ row, delta: -Math.abs(delta) })} />
            </View>
          </View>
        );
      })}
      {creditsQuery.isLoading ? <Loader /> : (creditsQuery.data ?? []).length === 0 ? <EmptyState text="No credit balances yet." /> : null}

      <Text style={styles.sectionLabel}>RECENT SPEND</Text>
      {(topSpendersQuery.data ?? []).slice(0, 12).map((row) => (
        <View key={row.id} style={styles.auditLine}>
          <Coins color={Colors.goldBright} size={14} strokeWidth={2.6} />
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{row.action}</Text>
            <Text style={styles.rowSub}>{row.user_id.slice(0, 8)} · {relTime(row.created_at)} ago</Text>
          </View>
          <Text style={styles.goldValue}>{row.cost}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/* ---------------------------------- LOGS --------------------------------- */

function LogsSection() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("");

  const logsQuery = useQuery<AuditRow[]>({
    queryKey: ["admin", "logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_audit_log").select("id,admin_user_id,action,target_type,target_id,old_values,new_values,created_at").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-audit-log-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_audit_log" }, () => {
        qc.invalidateQueries({ queryKey: ["admin", "logs"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return logsQuery.data ?? [];
    return (logsQuery.data ?? []).filter((row) => `${row.action} ${row.admin_user_id} ${row.target_type ?? ""} ${row.target_id ?? ""}`.toLowerCase().includes(q));
  }, [filter, logsQuery.data]);

  return (
    <View style={styles.content}>
      <SearchBox value={filter} onChangeText={setFilter} placeholder="Filter action, admin, target…" />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={logsQuery.isLoading ? <Loader /> : <EmptyState text="Audit log is empty." />}
        renderItem={({ item }) => (
          <View style={styles.auditLine} testID={`audit-${item.id}`}>
            <ShieldAlert color={Colors.goldBright} size={15} strokeWidth={2.6} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.action.replace(/_/g, " ")}</Text>
              <Text style={styles.rowSub}>{item.admin_user_id.slice(0, 8)} · {item.target_type ?? "system"} · {relTime(item.created_at)} ago</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

/* ------------------------------ ANNOUNCEMENTS ---------------------------- */

function AnnouncementsSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();
  const [form, setForm] = useState<NotificationInput>({ title: "", message: "", type: "announcement" });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { data: profiles, error: usersError } = await supabase.from("profiles").select("id,user_id").limit(5000);
      if (usersError) throw usersError;
      const userIds = ((profiles ?? []) as Pick<ProfileRow, "id" | "user_id">[])
        .map((row) => row.user_id ?? row.id)
        .filter((id): id is string => !!id && isUuid(id));
      if (userIds.length === 0) throw new Error("No users found to notify.");
      const rows = userIds.map((user_id) => ({
        user_id,
        type: form.type,
        title: form.title.trim(),
        message: form.message.trim(),
        body: form.message.trim(),
        data: { source: "admin" },
      }));
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) throw error;
      await logAction("broadcast_announcement", "notification", null, null, { count: rows.length, type: form.type, title: form.title.trim() });
    },
    onSuccess: () => {
      setForm({ title: "", message: "", type: "announcement" });
      qc.invalidateQueries({ queryKey: ["admin"] });
      Alert.alert("Announcement sent", "Notification broadcast was queued for all users.");
    },
    onError: (e: Error) => Alert.alert("Broadcast failed", e.message),
  });

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.cardLarge}>
        <Text style={styles.cardTitle}>Broadcast notification</Text>
        <Text style={styles.cardBody}>Send an announcement, alert, or system message to every profile in the platform.</Text>
        <Text style={styles.inputLabel}>TITLE</Text>
        <TextInput value={form.title} onChangeText={(title) => setForm((prev) => ({ ...prev, title }))} placeholder="New SolTools update…" placeholderTextColor={Colors.muted2} style={styles.input} />
        <Text style={styles.inputLabel}>MESSAGE</Text>
        <TextInput value={form.message} onChangeText={(message) => setForm((prev) => ({ ...prev, message }))} placeholder="What should everyone know?" placeholderTextColor={Colors.muted2} style={[styles.input, styles.textArea]} multiline />
        <Text style={styles.inputLabel}>TYPE</Text>
        <View style={styles.tierRow}>
          {(["announcement", "alert", "system"] as const).map((type) => (
            <Pressable key={type} onPress={() => setForm((prev) => ({ ...prev, type }))} style={[styles.filterChip, form.type === type && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, form.type === type && styles.filterChipTextActive]}>{type.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label={sendMutation.isPending ? "Sending…" : "Send announcement"} Icon={Megaphone} disabled={!form.title.trim() || !form.message.trim() || sendMutation.isPending} onPress={() => sendMutation.mutate()} style={styles.formButton} />
      </View>
    </ScrollView>
  );
}

/* -------------------------------- SECURITY ------------------------------- */

function SecuritySection({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const logAction = useAuditLogger();

  const adminsQuery = useQuery<AdminRoleRow[]>({
    queryKey: ["admin", "security"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_roles").select("id,user_id,email,role,permissions,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminRoleRow[];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (row: AdminRoleRow) => {
      if (row.role === "owner" || row.email?.toLowerCase() === OWNER_EMAIL) throw new Error("Owner role is protected.");
      const { error } = await supabase.from("admin_roles").delete().eq("user_id", row.user_id);
      if (error) throw error;
      await logAction("revoke_admin_role", "user", row.user_id, row, null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Revoke failed", e.message),
  });

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.noticeCard}>
        <ShieldAlert color={Colors.goldBright} size={18} strokeWidth={2.6} />
        <Text style={styles.noticeText}>Admin access is owner-only. Any legacy admin/superadmin rows are ignored by the app and should be revoked here after applying the owner-lock SQL.</Text>
      </View>
      {(adminsQuery.data ?? []).map((row) => (
        <View key={`${row.user_id}-${row.role}`} style={styles.card}>
          <View style={styles.rowHeader}>
            <Avatar label={row.email ?? row.role} Icon={Crown} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{row.email || row.user_id.slice(0, 8)}</Text>
              <Text style={styles.rowSub}>{row.user_id} · added {new Date(row.created_at).toLocaleDateString()}</Text>
            </View>
            <Pill label={row.role.toUpperCase()} color={roleColor(row.role)} />
            {isOwner && row.role !== "owner" ? <IconDanger Icon={ShieldOff} onPress={() => revokeMutation.mutate(row)} /> : null}
          </View>
        </View>
      ))}
      {adminsQuery.isLoading ? <Loader /> : (adminsQuery.data ?? []).length === 0 ? <EmptyState text="No admin roles found." /> : null}
    </ScrollView>
  );
}

/* ----------------------------------- OPS ---------------------------------- */

function OpsSection({ onJump }: { onJump: (s: Section) => void }) {
  const categories: AdminTool["category"][] = ["moderation", "wallets", "launches", "security", "support", "data", "automation"];
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={["rgba(244,198,91,0.20)", "rgba(255,255,255,0.05)"]} style={styles.cardLarge}>
        <Text style={styles.cardTitle}>Owner power tools</Text>
        <Text style={styles.cardBody}>A mobile command palette for faster admin access. These shortcuts route into the real admin systems already connected to Supabase.</Text>
        <View style={styles.metricsRow}>
          <Metric label="TOOLS" value={`${ADMIN_TOOLKIT.length}+`} />
          <Metric label="ACCESS" value="OWNER" />
          <Metric label="MODE" value="LIVE" />
        </View>
      </LinearGradient>
      {categories.map((category) => {
        const tools = ADMIN_TOOLKIT.filter((tool) => tool.category === category);
        return (
          <View key={category}>
            <Text style={styles.sectionLabel}>{category.toUpperCase()}</Text>
            <View style={styles.quickGrid}>
              {tools.map((tool) => (
                <Pressable key={tool.id} onPress={() => onJump(tool.action)} style={({ pressed }) => [styles.toolCard, tool.danger && styles.toolCardDanger, pressed && styles.pressedDeep]}>
                  <View style={styles.quickIcon}><tool.Icon color={tool.danger ? Colors.platinum : Colors.goldBright} size={16} strokeWidth={2.8} /></View>
                  <Text style={styles.quickLabel}>{tool.title}</Text>
                  <Text style={styles.quickSub}>{tool.subtitle}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

/* --------------------------------- GROWTH -------------------------------- */

function GrowthSection({ onJump }: { onJump: (s: Section) => void }) {
  const plays = ADMIN_TOOLKIT.filter((tool) => tool.category === "growth" || tool.category === "launches" || tool.category === "data");
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.noticeCard}>
        <Megaphone color={Colors.goldBright} size={18} strokeWidth={2.6} />
        <Text style={styles.noticeText}>Growth console for pushing announcements, curating featured launches, checking platform pulse, and routing into monetization levers fast.</Text>
      </View>
      <View style={styles.statsGrid}>
        <StatCard label="PROMO LANES" value={4} Icon={Megaphone} accent={Colors.goldBright} />
        <StatCard label="LAUNCH LEVERS" value={3} Icon={Rocket} accent={Colors.gold} />
        <StatCard label="AUDIENCE BLASTS" value={3} Icon={Bell} accent={Colors.silver} />
        <StatCard label="OWNER SHORTCUTS" value={plays.length} Icon={Crown} accent={Colors.platinum} />
      </View>
      <Text style={styles.sectionLabel}>GROWTH SHORTCUTS</Text>
      <View style={styles.quickGrid}>
        {plays.map((tool) => (
          <QuickAction key={tool.id} Icon={tool.Icon} label={tool.title} sub={tool.subtitle} onPress={() => onJump(tool.action)} />
        ))}
      </View>
      <PrimaryButton label="Open broadcast composer" Icon={Megaphone} onPress={() => onJump("announcements")} />
    </ScrollView>
  );
}

/* -------------------------------- SETTINGS ------------------------------- */

function SettingsSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();

  const settingsQuery = useQuery<SettingRow[]>({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("id,key,value,category,description,updated_at").order("category").order("key");
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { row: SettingRow; value: unknown }) => {
      const { error } = await supabase.from("platform_settings").upsert(
        { key: input.row.key, value: input.value, category: input.row.category, description: input.row.description, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (error) throw error;
      await logAction("update_platform_setting", "setting", null, { key: input.row.key, value: input.row.value }, { key: input.row.key, value: input.value });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
    onError: (e: Error) => Alert.alert("Setting update failed", e.message),
  });

  const groups = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    (settingsQuery.data ?? []).forEach((row) => {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    });
    return Array.from(map.entries());
  }, [settingsQuery.data]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {groups.map(([category, rows]) => (
        <View key={category}>
          <Text style={styles.sectionLabel}>{category.toUpperCase()}</Text>
          <View style={styles.cardWrap}>
            {rows.map((row) => (
              <SettingControl key={row.key} row={row} onSave={(value) => updateMutation.mutate({ row, value })} />
            ))}
          </View>
        </View>
      ))}
      {settingsQuery.isLoading ? <Loader /> : groups.length === 0 ? <EmptyState text="No settings found." /> : null}
    </ScrollView>
  );
}

function SettingControl({ row, onSave }: { row: SettingRow; onSave: (value: unknown) => void }) {
  const [draft, setDraft] = useState<string>(jsonToDraft(row.value));
  useEffect(() => setDraft(jsonToDraft(row.value)), [row.value]);

  const booleanValue = typeof row.value === "boolean";
  return (
    <View style={styles.settingRow}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{titleForKey(row.key)}</Text>
        <Text style={styles.rowSub}>{row.description ?? row.key}</Text>
      </View>
      {booleanValue ? (
        <Switch
          value={row.value === true}
          onValueChange={(value) => onSave(value)}
          trackColor={{ true: Colors.goldBright, false: "rgba(255,255,255,0.12)" }}
          thumbColor={row.value === true ? Colors.ink : Colors.muted}
        />
      ) : (
        <View style={styles.settingInputWrap}>
          <TextInput value={draft} onChangeText={setDraft} style={styles.settingInput} placeholderTextColor={Colors.muted2} />
          <Pressable onPress={() => onSave(parseDraft(draft, row.value))} style={({ pressed }) => [styles.smallGoldBtn, pressed && styles.pressedDeep]}>
            <Text style={styles.smallGoldText}>Save</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* -------------------------------- SUPPORT -------------------------------- */

function SupportSection() {
  const qc = useQueryClient();
  const logAction = useAuditLogger();

  const ticketsQuery = useQuery<SupportTicketRow[]>({
    queryKey: ["admin", "support"],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_tickets").select("id,user_id,username,subject,body,status,priority,created_at,updated_at").order("updated_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as SupportTicketRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-support-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => qc.invalidateQueries({ queryKey: ["admin", "support"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, () => qc.invalidateQueries({ queryKey: ["admin", "support"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const updateMutation = useMutation({
    mutationFn: async (input: { row: SupportTicketRow; status: string }) => {
      const { error } = await supabase.from("support_tickets").update({ status: input.status, updated_at: new Date().toISOString() }).eq("id", input.row.id);
      if (error) throw error;
      await logAction("update_support_ticket", "support_ticket", input.row.id, { status: input.row.status }, { status: input.status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "support"] }),
    onError: (e: Error) => Alert.alert("Ticket update failed", e.message),
  });

  return (
    <FlatList
      data={ticketsQuery.data ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listPad}
      ListHeaderComponent={
        <View style={styles.noticeCard}>
          <Headphones color={Colors.goldBright} size={18} strokeWidth={2.6} />
          <Text style={styles.noticeText}>Realtime ticket inbox is connected to support_tickets and support_messages. Typing indicators can be layered on Supabase broadcast channels.</Text>
        </View>
      }
      ListEmptyComponent={ticketsQuery.isLoading ? <Loader /> : <EmptyState text="No support tickets yet." />}
      renderItem={({ item }) => (
        <View style={styles.card} testID={`support-ticket-${item.id}`}>
          <View style={styles.rowHeader}>
            <Avatar label={item.username ?? "S"} Icon={Headphones} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.subject}</Text>
              <Text style={styles.rowSub}>@{item.username ?? "unknown"} · {item.priority ?? "normal"} · {relTime(item.updated_at ?? item.created_at)} ago</Text>
            </View>
            <Pill label={item.status.toUpperCase()} color={statusColor(item.status)} />
          </View>
          {item.body ? <Text style={styles.cardBody}>{item.body}</Text> : null}
          <View style={styles.actionGrid}>
            {(["open", "pending", "closed"] as const).map((status) => (
              <ActionButton key={status} label={status} Icon={Check} disabled={item.status === status} onPress={() => updateMutation.mutate({ row: item, status })} />
            ))}
          </View>
        </View>
      )}
    />
  );
}

/* ---------------------------------- TEAM --------------------------------- */

interface TeamMemberRow {
  user_id: string;
  email: string | null;
  role: AdminRole;
  permissions: Record<string, boolean> | null;
  created_at: string;
}

interface TeamPermissionKey {
  key: string;
  label: string;
  desc: string;
}

const TEAM_PERMISSION_KEYS: TeamPermissionKey[] = [
  { key: "delete_posts", label: "Delete posts", desc: "Remove community posts and replies." },
  { key: "delete_reels", label: "Delete reels", desc: "Remove reels and short videos." },
  { key: "ban_users", label: "Ban users", desc: "Permanently revoke account access." },
  { key: "suspend_users", label: "Suspend users", desc: "Temporary timeout with expiry." },
  { key: "limit_users", label: "Limit users", desc: "Restrict posting, commenting, DMs." },
  { key: "resolve_reports", label: "Resolve reports", desc: "Triage report queue." },
  { key: "view_online", label: "View online users", desc: "See live presence." },
  { key: "view_analytics", label: "View analytics", desc: "Mod-tier dashboard metrics." },
];

const DEFAULT_TEAM_PERMS: Record<string, boolean> = Object.fromEntries(
  TEAM_PERMISSION_KEYS.map((p) => [p.key, true]),
);

function TeamSection({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const logAction = useAuditLogger();
  const [query, setQuery] = useState<string>("");
  const [permsDraft, setPermsDraft] = useState<Record<string, Record<string, boolean>>>({});

  const teamQuery = useQuery<TeamMemberRow[]>({
    queryKey: ["admin", "team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_roles")
        .select("user_id,email,role,permissions,created_at")
        .eq("role", "team")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeamMemberRow[];
    },
  });

  const candidatesQuery = useQuery<ProfileRow[]>({
    queryKey: ["admin", "team-candidates", query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const q = query.trim();
      const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,username,display_name,avatar_url,sol_wallet,wallet_address,is_public,is_banned,verified,badge,custom_badges,followers_count,trades_count,win_rate,pnl_pct,created_at")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (input: { row: ProfileRow }) => {
      const uid = profileUserId(input.row);
      const { error } = await supabase.rpc("promote_team_member", {
        p_user_id: uid,
        p_email: input.row.username ?? null,
        p_permissions: DEFAULT_TEAM_PERMS,
      });
      if (error) throw error;
      await logAction("promote_team_member", "user", uid, null, { role: "team", permissions: DEFAULT_TEAM_PERMS });
    },
    onSuccess: () => {
      setQuery("");
      qc.invalidateQueries({ queryKey: ["admin", "team-members"] });
      qc.invalidateQueries({ queryKey: ["admin", "security"] });
    },
    onError: (e: Error) => Alert.alert("Promote failed", e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (row: TeamMemberRow) => {
      const { error } = await supabase.rpc("revoke_team_member", { p_user_id: row.user_id });
      if (error) throw error;
      await logAction("revoke_team_member", "user", row.user_id, row, null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "team-members"] }),
    onError: (e: Error) => Alert.alert("Revoke failed", e.message),
  });

  const updatePermsMutation = useMutation({
    mutationFn: async (input: { row: TeamMemberRow; perms: Record<string, boolean> }) => {
      const { error } = await supabase.rpc("update_team_permissions", {
        p_user_id: input.row.user_id,
        p_permissions: input.perms,
      });
      if (error) throw error;
      await logAction("update_team_permissions", "user", input.row.user_id, input.row.permissions, input.perms);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "team-members"] }),
    onError: (e: Error) => Alert.alert("Update failed", e.message),
  });

  const teamList = teamQuery.data ?? [];

  if (!isOwner) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.noticeCard}>
          <ShieldAlert color={Colors.goldBright} size={18} strokeWidth={2.6} />
          <Text style={styles.noticeText}>Only the owner can promote and manage team moderators.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.noticeCard}>
        <ShieldCheck color={Colors.goldBright} size={18} strokeWidth={2.6} />
        <Text style={styles.noticeText}>Promote trusted users to the team role so they can moderate posts, ban/suspend abusers, resolve reports, and watch the platform pulse from a dedicated dashboard.</Text>
      </View>

      <Text style={styles.sectionLabel}>PROMOTE A USER</Text>
      <SearchBox value={query} onChangeText={setQuery} placeholder="Search username or display name…" />
      {query.trim().length >= 2 ? (
        <View style={{ gap: 8 }}>
          {(candidatesQuery.data ?? []).map((row) => {
            const uid = profileUserId(row);
            const alreadyTeam = teamList.some((m) => m.user_id === uid);
            return (
              <View key={uid} style={styles.card}>
                <View style={styles.rowHeader}>
                  <Avatar label={row.display_name ?? row.username ?? "U"} Icon={Users} />
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{row.display_name ?? row.username ?? uid.slice(0, 8)}</Text>
                    <Text style={styles.rowSub}>@{row.username ?? "unset"}</Text>
                  </View>
                  {alreadyTeam ? (
                    <Pill label="TEAM" color={Colors.goldBright} />
                  ) : (
                    <ActionButton label="Promote" Icon={ShieldCheck} onPress={() => promoteMutation.mutate({ row })} />
                  )}
                </View>
              </View>
            );
          })}
          {candidatesQuery.isLoading ? <Loader /> : null}
          {!candidatesQuery.isLoading && (candidatesQuery.data ?? []).length === 0 ? (
            <EmptyState text="No users matched." />
          ) : null}
        </View>
      ) : (
        <Text style={styles.rowSub}>Type at least 2 characters to search.</Text>
      )}

      <Text style={styles.sectionLabel}>TEAM MEMBERS ({teamList.length})</Text>
      {teamList.map((row) => {
        const draft = permsDraft[row.user_id] ?? { ...DEFAULT_TEAM_PERMS, ...(row.permissions ?? {}) };
        return (
          <View key={row.user_id} style={styles.card}>
            <View style={styles.rowHeader}>
              <Avatar label={row.email ?? "T"} Icon={ShieldCheck} />
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{row.email ?? row.user_id.slice(0, 8)}</Text>
                <Text style={styles.rowSub}>{row.user_id} · added {new Date(row.created_at).toLocaleDateString()}</Text>
              </View>
              <Pill label="TEAM" color={Colors.goldBright} />
            </View>

            <Text style={styles.inputLabel}>PERMISSIONS</Text>
            {TEAM_PERMISSION_KEYS.map((p) => (
              <View key={p.key} style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{p.label}</Text>
                  <Text style={styles.rowSub}>{p.desc}</Text>
                </View>
                <Switch
                  value={!!draft[p.key]}
                  onValueChange={(v) =>
                    setPermsDraft((prev) => ({
                      ...prev,
                      [row.user_id]: { ...draft, [p.key]: v },
                    }))
                  }
                  trackColor={{ true: Colors.goldBright, false: Colors.line }}
                  thumbColor={Colors.text}
                />
              </View>
            ))}
            <View style={styles.actionGrid}>
              <ActionButton
                label="Save permissions"
                Icon={Check}
                onPress={() => updatePermsMutation.mutate({ row, perms: draft })}
              />
              <ActionButton
                label="Revoke team"
                Icon={ShieldOff}
                danger
                onPress={() =>
                  Alert.alert("Revoke team role?", row.email ?? row.user_id, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Revoke", style: "destructive", onPress: () => revokeMutation.mutate(row) },
                  ])
                }
              />
            </View>
          </View>
        );
      })}
      {teamQuery.isLoading ? <Loader /> : teamList.length === 0 ? <EmptyState text="No team members yet. Search above to promote your first mod." /> : null}
    </ScrollView>
  );
}

/* -------------------------------- SHARED UI ------------------------------ */

function HeroMetric({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.heroMetric}>
      <Text style={styles.heroMetricVal}>{typeof value === "number" ? value.toLocaleString() : "—"}</Text>
      <Text style={styles.heroMetricKey}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, Icon, accent }: { label: string; value?: number; Icon: IconComponent; accent: string }) {
  return (
    <View style={[styles.statCard, { borderColor: `${accent}44` }]}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}1F` }]}>
        <Icon color={accent} size={15} strokeWidth={2.8} />
      </View>
      <Text style={styles.statNum}>{typeof value === "number" ? value.toLocaleString() : "—"}</Text>
      <Text style={styles.statKey}>{label}</Text>
    </View>
  );
}

function QuickAction({ Icon, label, sub, onPress }: { Icon: IconComponent; label: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickCard, pressed && styles.pressedDeep]}>
      <View style={styles.quickIcon}><Icon color={Colors.goldBright} size={16} strokeWidth={2.8} /></View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickSub}>{sub}</Text>
    </Pressable>
  );
}

function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={styles.searchBox}>
      <Search color={Colors.muted} size={14} strokeWidth={2.6} />
      <TextInput value={value} onChangeText={onChangeText} autoCapitalize="none" placeholder={placeholder} placeholderTextColor={Colors.muted2} style={styles.searchInput} />
      {value.length > 0 ? <Pressable onPress={() => onChangeText("")} hitSlop={8}><X color={Colors.muted} size={14} strokeWidth={2.6} /></Pressable> : null}
    </View>
  );
}

function FilterRail({ values, active, onChange }: { values: string[]; active: string; onChange: (value: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
      {values.map((value) => (
        <Pressable key={value} onPress={() => onChange(value)} style={[styles.filterChip, active === value && styles.filterChipActive]}>
          <Text style={[styles.filterChipText, active === value && styles.filterChipTextActive]}>{value.toUpperCase()}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Avatar({ label, Icon }: { label: string; Icon?: IconComponent }) {
  return (
    <View style={styles.avatar}>
      {Icon ? <Icon color={Colors.goldBright} size={15} strokeWidth={2.8} /> : <Text style={styles.avatarText}>{label.slice(0, 1).toUpperCase()}</Text>}
    </View>
  );
}

function RemovableBadgePill({ badge, onRemove }: { badge: UserBadge; onRemove: () => void }) {
  const color = badge.color ?? Colors.goldBright;
  return (
    <View style={[styles.pill, { borderColor: `${color}66`, backgroundColor: `${color}1A`, flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 4 }]}>
      <Text style={[styles.pillText, { color }]}>{badge.label}</Text>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        style={({ pressed }) => [styles.pillRemoveBtn, { backgroundColor: `${color}33` }, pressed && { opacity: 0.6 }]}
        testID={`remove-badge-${badge.id}`}
      >
        <X color={color} size={11} strokeWidth={3} />
      </Pressable>
    </View>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: `${color}66`, backgroundColor: `${color}1A` }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricKey}>{label}</Text>
      <Text style={styles.metricVal} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, Icon, onPress, danger, disabled }: { label: string; Icon: IconComponent; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const color = danger ? Colors.platinum : Colors.goldBright;
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionBtn, { borderColor: `${color}44` }, danger && styles.actionBtnDanger, disabled && styles.disabled, pressed && !disabled && styles.pressedDeep]}>
      <Icon color={danger ? Colors.platinum : Colors.goldBright} size={12} strokeWidth={2.8} />
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, Icon, onPress, disabled, style }: { label: string; Icon?: IconComponent; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryBtn, disabled && styles.disabled, pressed && !disabled && styles.pressedDeep, style]}>
      <LinearGradient colors={[Colors.goldBright, Colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryGradient} />
      {Icon ? <Icon color={Colors.ink} size={14} strokeWidth={3} /> : null}
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function IconDanger({ onPress, Icon = Trash2 }: { onPress: () => void; Icon?: IconComponent }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressedDeep]}>
      <Icon color={Colors.platinum} size={14} strokeWidth={2.6} />
    </Pressable>
  );
}

function Loader() {
  return <ActivityIndicator color={Colors.goldBright} style={styles.loader} />;
}

function EmptyState({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

/* -------------------------------- HELPERS -------------------------------- */

function roleColor(role: AdminRole | null): string {
  if (role === "owner" || role === "superadmin") return Colors.goldBright;
  if (role === "admin") return Colors.gold;
  if (role === "moderator") return Colors.silver;
  if (role === "support") return Colors.platinum;
  return Colors.muted;
}

function statusColor(status: string): string {
  if (status === "approved" || status === "live" || status === "open") return Colors.goldBright;
  if (status === "pending") return Colors.silver;
  if (status === "rejected" || status === "closed") return Colors.platinum;
  return Colors.muted;
}

function profileUserId(row: ProfileRow): string {
  return row.user_id ?? row.id;
}

async function updateProfileBadge(
  row: ProfileRow,
  badge: UserBadge,
  logAction: ReturnType<typeof useAuditLogger>,
  remove?: boolean,
): Promise<void> {
  const uid = profileUserId(row);
  const current = normalizeAdminBadges(row.custom_badges);
  const next = remove
    ? current.filter((b) => b.id !== badge.id)
    : [{ ...badge, granted_at: new Date().toISOString() }, ...current.filter((b) => b.id !== badge.id)];
  const patch: Record<string, unknown> = { custom_badges: next, updated_at: new Date().toISOString() };
  if (badge.id === "verified") patch.verified = !remove;
  if (["admin", "team", "mod", "holder", "supporter", "whale"].includes(badge.id)) patch.badge = remove ? null : badge.id;
  const { error } = await supabase.from("profiles").update(patch).or(`user_id.eq.${uid},id.eq.${uid}`);
  if (error) throw error;
  await logAction(remove ? "revoke_profile_badge" : "grant_profile_badge", "user", uid, { custom_badges: current }, { badge: badge.id, custom_badges: next });
}

function normalizeAdminBadges(input: unknown): UserBadge[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? "").trim();
      const label = String(r.label ?? "").trim();
      if (!id || !label) return null;
      return {
        id,
        label,
        color: typeof r.color === "string" ? r.color : Colors.goldBright,
        icon: typeof r.icon === "string" ? r.icon : undefined,
        glow: typeof r.glow === "boolean" ? r.glow : true,
        priority: typeof r.priority === "number" ? r.priority : 70,
        rarity: typeof r.rarity === "string" ? (r.rarity as UserBadge["rarity"]) : "rare",
        background: typeof r.background === "string" ? r.background : undefined,
        textColor: typeof r.textColor === "string" ? r.textColor : undefined,
        animated: typeof r.animated === "boolean" ? r.animated : undefined,
      };
    })
    .filter((badge): badge is UserBadge => badge !== null);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function relTime(iso: string): string {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function titleForKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function jsonToDraft(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function parseDraft(draft: string, previousValue: unknown): unknown {
  if (typeof previousValue === "number") return Number(draft);
  if (typeof previousValue === "string") return draft;
  try {
    return JSON.parse(draft);
  } catch {
    return draft;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  content: { flex: 1 },
  bgGlow: { position: "absolute", top: 0, left: 0, right: 0, height: 360 },
  pressed: { opacity: 0.72 },
  pressedDeep: { transform: [{ translateY: 2 }, { scale: 0.985 }], opacity: 0.94 },
  disabled: { opacity: 0.42 },

  gateRoot: { flex: 1, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", padding: 28, gap: 12 },
  gateTitle: { color: Colors.text, fontSize: 24, fontWeight: "900" },
  gateBody: { color: Colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  primarySolid: { marginTop: 10, backgroundColor: Colors.goldBright, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12 },
  primarySolidText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },

  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12, gap: 10 },
  headerCopy: { flex: 1 },
  headerEyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, textTransform: "uppercase" },
  headerTitle: { color: Colors.text, fontSize: 23, fontWeight: "900", marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.line, alignItems: "center", justifyContent: "center" },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.04)" },
  rolePillText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  tabsScroll: { flexGrow: 0, maxHeight: 48, marginBottom: 4 },
  tabsRow: { paddingHorizontal: 12, gap: 7, alignItems: "center" },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.line },
  tabBtnActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright, shadowColor: Colors.goldBright, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  tabText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  tabTextActive: { color: Colors.ink },

  scroll: { padding: 16, paddingBottom: 90, gap: 14 },
  listPad: { paddingHorizontal: 16, paddingBottom: 90, gap: 10 },
  loader: { paddingVertical: 28 },
  empty: { color: Colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 30, paddingHorizontal: 20 },
  errorText: { color: Colors.platinum, fontSize: 12, lineHeight: 18 },
  sectionLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginTop: 6 },

  heroCard: { borderRadius: 24, padding: 20, gap: 9, borderWidth: 1, borderColor: Colors.lineStrong },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(2,2,2,0.16)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  heroBadgeText: { color: Colors.ink, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { color: Colors.ink, fontSize: 27, fontWeight: "900", letterSpacing: -0.8 },
  heroBody: { color: "rgba(2,2,2,0.76)", fontSize: 13, lineHeight: 19, maxWidth: 330 },
  heroMetricsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  heroMetric: { flex: 1, backgroundColor: "rgba(2,2,2,0.16)", borderRadius: 15, padding: 11 },
  heroMetricVal: { color: Colors.ink, fontSize: 19, fontWeight: "900" },
  heroMetricKey: { color: "rgba(2,2,2,0.62)", fontSize: 8, fontWeight: "900", letterSpacing: 1 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: Colors.card, borderWidth: 1, borderRadius: 18, padding: 14, gap: 6 },
  statIcon: { width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statNum: { color: Colors.text, fontSize: 23, fontWeight: "900" },
  statKey: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: { flexBasis: "31%", flexGrow: 1, minWidth: 104, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 17, padding: 12, gap: 6 },
  toolCard: { flexBasis: "47%", flexGrow: 1, minWidth: 148, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 18, padding: 13, gap: 7 },
  toolCardDanger: { borderColor: "rgba(247,242,231,0.25)", backgroundColor: "rgba(247,242,231,0.055)" },
  quickIcon: { width: 32, height: 32, borderRadius: 11, borderWidth: 1, borderColor: Colors.lineStrong, backgroundColor: Colors.glass, alignItems: "center", justifyContent: "center" },
  quickLabel: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  quickSub: { color: Colors.muted, fontSize: 10, fontWeight: "700" },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.line },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, paddingVertical: 0 },
  filterScroll: { flexGrow: 0, marginBottom: 8 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  filterChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.line },
  filterChipActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  filterChipText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  filterChipTextActive: { color: Colors.ink },

  card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 18, padding: 14, gap: 12 },
  cardLarge: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 22, padding: 18, gap: 10 },
  cardWrap: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 18, overflow: "hidden" },
  cardTitle: { color: Colors.text, fontSize: 20, fontWeight: "900" },
  cardBody: { color: Colors.muted, fontSize: 13, lineHeight: 19 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  rowMain: { flex: 1 },
  rowTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  rowSub: { color: Colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  avatar: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.glass, borderWidth: 1, borderColor: Colors.lineStrong },
  avatarText: { color: Colors.goldBright, fontSize: 15, fontWeight: "900" },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  pillRemoveBtn: { width: 18, height: 18, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  metricsRow: { flexDirection: "row", gap: 9 },
  metric: { flex: 1, backgroundColor: Colors.cardSoft, borderRadius: 13, padding: 10, gap: 3 },
  metricKey: { color: Colors.muted2, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  metricVal: { color: Colors.text, fontSize: 12, fontWeight: "900" },

  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11, backgroundColor: "rgba(244,198,91,0.08)", borderWidth: 1 },
  actionBtnDanger: { backgroundColor: "rgba(247,242,231,0.07)" },
  actionBtnText: { fontSize: 11, fontWeight: "900", textTransform: "capitalize" },
  tierRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  badgePreviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, minHeight: 26, alignItems: "center" },
  badgeAdminPanel: { backgroundColor: "rgba(216,183,90,0.055)", borderWidth: 1, borderColor: "rgba(216,183,90,0.16)", borderRadius: 14, padding: 10, gap: 9 },
  badgePanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badgePanelCount: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  dangerBtn: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(247,242,231,0.08)", borderWidth: 1, borderColor: "rgba(247,242,231,0.22)" },

  inlineInputRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  compactInput: { minWidth: 92, flexGrow: 1, color: Colors.text, backgroundColor: Colors.cardSoft, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },
  auditLine: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 15, padding: 12 },
  goldValue: { color: Colors.goldBright, fontSize: 14, fontWeight: "900" },

  inputLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginTop: 8 },
  input: { color: Colors.text, backgroundColor: Colors.cardSoft, borderWidth: 1, borderColor: Colors.line, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  textArea: { minHeight: 110, textAlignVertical: "top" },
  formButton: { marginTop: 10 },
  primaryBtn: { minHeight: 46, borderRadius: 15, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  primaryGradient: { ...StyleSheet.absoluteFillObject },
  primaryBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.4 },

  noticeCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 16, padding: 13 },
  noticeText: { flex: 1, color: Colors.muted, fontSize: 12, lineHeight: 18 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: "rgba(216,183,90,0.10)" },
  settingInputWrap: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 168 },
  settingInput: { minWidth: 86, flex: 1, color: Colors.text, backgroundColor: Colors.cardSoft, borderWidth: 1, borderColor: Colors.line, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, fontSize: 12 },
  smallGoldBtn: { backgroundColor: Colors.goldBright, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8 },
  smallGoldText: { color: Colors.ink, fontSize: 10, fontWeight: "900" },

  eventBannerPreview: { height: 140, borderRadius: 16, overflow: "hidden", backgroundColor: Colors.cardSoft, marginBottom: 6 },
  eventCardBanner: { height: 96, borderRadius: 14, overflow: "hidden", backgroundColor: Colors.cardSoft, marginBottom: 4 },
});
