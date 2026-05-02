import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bell,
  Crown,
  Database,
  Flame,
  Gauge,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  Plus,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShieldOff,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { fmtUsd as sharedFmtUsd } from "@/utils/format";
import { useAdmin, type AdminRole } from "@/providers/admin-provider";
import { useAuth } from "@/providers/auth-provider";

type Section =
  | "overview"
  | "ops"
  | "admins"
  | "users"
  | "listings"
  | "tickets"
  | "broadcasts"
  | "settings"
  | "audit";

interface UserRow {
  user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  badge: string | null;
  custom_badges: { id: string; label: string; color?: string; icon?: string }[];
  is_banned: boolean;
  followers_count: number;
  created_at: string;
}

interface DashboardStats {
  users: number;
  admins: number;
  listings: number;
  featured: number;
  verified: number;
  hot: number;
  support_open: number;
  support_pending: number;
  support_total: number;
  online_now: number;
  communities: number;
  live_rooms_active: number;
  comments_total: number;
  tracked_tokens: number;
  tracked_wallets: number;
  active_alerts: number;
  whale_events_24h: number;
  broadcasts_active: number;
  pending_moderation: number;
  data_sources_total: number;
  data_sources_degraded: number;
  banned_users: number;
  verified_users: number;
  new_users_24h: number;
  new_users_7d: number;
  new_listings_24h: number;
  new_listings_7d: number;
  posts_total: number;
  posts_24h: number;
  announcements: number;
  last_listing_at: string | null;
  last_signup_at: string | null;
}

interface AdminRow {
  user_id: string;
  role: AdminRole;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface ListingRow {
  id: string;
  token_name: string;
  symbol: string;
  contract_address: string;
  is_featured: boolean;
  is_verified: boolean;
  is_hot: boolean;
  market_cap: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  created_at: string;
}

interface TicketRow {
  id: string;
  subject: string;
  body: string;
  status: string;
  priority: string;
  user_id: string | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  admin_id: string | null;
  admin_username: string | null;
  admin_avatar: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  severity: "info" | "success" | "warning" | "critical";
  audience: "all" | "traders" | "admins";
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

interface TopUserRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number;
  verified: boolean;
  is_banned: boolean;
  created_at: string;
}

interface PlatformOverview {
  health_score?: number;
  users_total?: number;
  online_now?: number;
  listings_total?: number;
  listings_verified?: number;
  communities_total?: number;
  posts_total?: number;
  tracked_tokens?: number;
  tracked_wallets?: number;
  active_alerts?: number;
  open_tickets?: number;
  pending_moderation?: number;
  data_sources_degraded?: number;
  live_rooms_active?: number;
  whale_events_24h?: number;
  volume_24h_usd?: number;
  liquidity_usd?: number;
  market_cap_usd?: number;
  last_listing_at?: string | null;
  last_signup_at?: string | null;
}

interface DataSourceRow {
  provider: string;
  status: "healthy" | "degraded" | "outage" | "unknown";
  last_success_at: string | null;
  last_error_at: string | null;
  latency_ms: number | null;
  request_count_24h: number;
  error_count_24h: number;
  meta: Record<string, unknown>;
  updated_at: string;
}

interface ModerationRow {
  id: string;
  item_type: string;
  item_id: string;
  reason: string;
  status: "open" | "reviewing" | "resolved" | "rejected";
  reporter_id: string | null;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
}

const ROLES: AdminRole[] = ["superadmin", "admin", "moderator", "support"];
const fmtUsd = sharedFmtUsd;

export default function AdminDashboard() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated, email } = useAuth();
  const { isAdmin, isSuperadmin, role, isLoading } = useAdmin();
  const [section, setSection] = useState<Section>("overview");

  if (isLoading) {
    return (
      <View style={styles.gateRoot}>
        <ActivityIndicator color={Colors.mint} />
      </View>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <SafeAreaView style={styles.gateRoot} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Shield color={Colors.rose} size={42} strokeWidth={2.4} />
        <Text style={styles.gateTitle}>Admin only</Text>
        <Text style={styles.gateBody}>
          {isAuthenticated
            ? `${email ?? "Your account"} is not authorized for the SolTools admin console.`
            : "Sign in with an admin account to continue."}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.gateBtn}>
          <Text style={styles.gateBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
  };

  return (
    <View style={styles.root} testID="admin-dashboard">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient
        colors={["rgba(85,245,178,0.10)", "rgba(56,215,255,0.04)", "transparent"]}
        style={styles.bgGlow}
        pointerEvents="none"
      />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} testID="admin-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>SolTools control room</Text>
            <Text style={styles.headerTitle}>Admin Console</Text>
          </View>
          <Pressable onPress={refresh} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} testID="admin-refresh">
            <RefreshCw color={Colors.mint} size={16} strokeWidth={2.4} />
          </Pressable>
          <View style={[styles.rolePill, { borderColor: roleColor(role) }]}>
            <Crown color={roleColor(role)} size={11} strokeWidth={3} />
            <Text style={[styles.rolePillText, { color: roleColor(role) }]}>
              {(role ?? "admin").toUpperCase()}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsRow}
        >
          {(
            [
              { id: "overview", label: "Overview", Icon: Sparkles },
              { id: "ops", label: "Ops", Icon: Gauge },
              { id: "admins", label: "Admins", Icon: Crown },
              { id: "users", label: "Users", Icon: Users },
              { id: "listings", label: "Listings", Icon: Rocket },
              { id: "tickets", label: "Support", Icon: LifeBuoy },
              { id: "broadcasts", label: "Broadcasts", Icon: Megaphone },
              { id: "settings", label: "Settings", Icon: SettingsIcon },
              { id: "audit", label: "Audit", Icon: Shield },
            ] as { id: Section; label: string; Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }> }[]
          ).map((t) => {
            const active = section === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setSection(t.id)}
                style={({ pressed }) => [styles.tabBtn, active && styles.tabBtnActive, pressed && styles.pressed]}
                testID={`admin-tab-${t.id}`}
              >
                <t.Icon color={active ? Colors.ink : Colors.muted} size={13} strokeWidth={2.6} />
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flex: 1 }}>
          {section === "overview" && <OverviewSection onJump={setSection} />}
          {section === "ops" && <OpsSection />}
          {section === "admins" && <AdminsSection isSuperadmin={isSuperadmin} />}
          {section === "users" && <UsersSection isSuperadmin={isSuperadmin} />}
          {section === "listings" && <ListingsSection />}
          {section === "tickets" && <TicketsSection />}
          {section === "broadcasts" && <BroadcastsSection />}
          {section === "settings" && <SettingsSection />}
          {section === "audit" && <AuditSection />}
        </View>
      </SafeAreaView>
    </View>
  );
}

function roleColor(r: AdminRole | null): string {
  switch (r) {
    case "superadmin":
      return "#FFD56B";
    case "admin":
      return Colors.mint;
    case "moderator":
      return Colors.cyan;
    case "support":
      return Colors.orange;
    default:
      return Colors.muted;
  }
}

function severityColor(s: AnnouncementRow["severity"]): string {
  switch (s) {
    case "success": return Colors.mint;
    case "warning": return Colors.orange;
    case "critical": return Colors.rose;
    default: return Colors.cyan;
  }
}

/* ---------------------------- OVERVIEW --------------------------- */

function OverviewSection({ onJump }: { onJump: (s: Section) => void }) {
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ["admin", "dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_stats");
      if (error) throw error;
      return data as DashboardStats;
    },
    refetchInterval: 30_000,
  });

  const topUsersQuery = useQuery<TopUserRow[]>({
    queryKey: ["admin", "top-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_top_users", { max_rows: 6 });
      if (error) throw error;
      return (data ?? []) as TopUserRow[];
    },
  });

  const recentActivityQuery = useQuery<AuditRow[]>({
    queryKey: ["admin", "recent-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_recent_activity", { max_rows: 8 });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    refetchInterval: 60_000,
  });

  const s = statsQuery.data;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={["#55F5B2", "#38D7FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroBadge}>
          <Sparkles color={Colors.ink} size={11} strokeWidth={3} />
          <Text style={styles.heroBadgeText}>LIVE · 30s</Text>
        </View>
        <Text style={styles.heroTitle}>Mission control</Text>
        <Text style={styles.heroBody}>
          Curate launches, manage your team, and keep traders shipping.
        </Text>
        <View style={styles.heroMetricsRow}>
          <HeroMetric label="USERS" value={s?.users} />
          <HeroMetric label="LISTINGS" value={s?.listings} />
          <HeroMetric label="OPEN TICKETS" value={s?.support_open} accent={Colors.rose} />
        </View>
      </LinearGradient>

      <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
      <View style={styles.quickGrid}>
        <QuickAction Icon={Users} label="Users" sub={`${s?.users ?? "—"} total`} accent={Colors.mint} onPress={() => onJump("users")} />
        <QuickAction Icon={Crown} label="Admins" sub={`${s?.admins ?? "—"} active`} accent="#FFD56B" onPress={() => onJump("admins")} />
        <QuickAction Icon={Rocket} label="Launches" sub={`${s?.featured ?? "—"} featured`} accent={Colors.cyan} onPress={() => onJump("listings")} />
        <QuickAction Icon={LifeBuoy} label="Support" sub={`${s?.support_open ?? "—"} open`} accent={Colors.rose} onPress={() => onJump("tickets")} />
        <QuickAction Icon={Megaphone} label="Broadcasts" sub={`${s?.announcements ?? "—"} sent`} accent={Colors.orange} onPress={() => onJump("broadcasts")} />
        <QuickAction Icon={Gauge} label="Ops" sub={`${s?.data_sources_degraded ?? "—"} degraded`} accent="#B88CFF" onPress={() => onJump("ops")} />
        <QuickAction Icon={SettingsIcon} label="Settings" sub="Platform flags" accent={Colors.cyan} onPress={() => onJump("settings")} />
      </View>

      <Text style={styles.sectionLabel}>TODAY</Text>
      <View style={styles.statsGrid}>
        <StatCard label="NEW USERS · 24H" value={s?.new_users_24h} accent={Colors.mint} Icon={UserPlus} />
        <StatCard label="NEW LISTINGS · 24H" value={s?.new_listings_24h} accent={Colors.cyan} Icon={Rocket} />
        <StatCard label="POSTS · 24H" value={s?.posts_24h} accent="#B88CFF" Icon={Activity} />
        <StatCard label="ONLINE NOW" value={s?.online_now} accent={Colors.mint} Icon={Radio} />
        <StatCard label="ACTIVE ALERTS" value={s?.active_alerts} accent={Colors.orange} Icon={Bell} />
        <StatCard label="WHALES · 24H" value={s?.whale_events_24h} accent={Colors.cyan} Icon={Zap} />
        <StatCard label="VERIFIED USERS" value={s?.verified_users} accent={Colors.cyan} Icon={BadgeCheck} />
        <StatCard label="BANNED USERS" value={s?.banned_users} accent={Colors.rose} Icon={Ban} />
        <StatCard label="HOT LAUNCHES" value={s?.hot} accent="#FF7A45" Icon={Flame} />
        <StatCard label="COMMUNITIES" value={s?.communities} accent="#B88CFF" Icon={MessageCircle} />
      </View>

      <Text style={styles.sectionLabel}>WEEK · 7D GROWTH</Text>
      <View style={styles.statsGrid}>
        <StatCard label="USERS · 7D" value={s?.new_users_7d} accent={Colors.mint} Icon={TrendingUp} />
        <StatCard label="LISTINGS · 7D" value={s?.new_listings_7d} accent={Colors.cyan} Icon={Flame} />
        <StatCard label="WATCHED TOKENS" value={s?.tracked_tokens} accent={Colors.orange} Icon={Wallet} />
        <StatCard label="OPEN MODERATION" value={s?.pending_moderation} accent={Colors.rose} Icon={Shield} />
      </View>

      <Text style={styles.sectionLabel}>TOP TRADERS</Text>
      <View style={styles.cardWrap}>
        {topUsersQuery.isLoading ? (
          <ActivityIndicator color={Colors.mint} style={{ padding: 20 }} />
        ) : (topUsersQuery.data ?? []).length === 0 ? (
          <Text style={styles.empty}>No traders yet.</Text>
        ) : (
          (topUsersQuery.data ?? []).map((u) => (
            <View key={u.user_id} style={styles.miniRow}>
              <View style={[styles.avatar, { backgroundColor: "rgba(85,245,178,0.16)" }]}>
                <Text style={{ color: Colors.mint, fontWeight: "900" }}>
                  {(u.display_name ?? u.username ?? "?").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {u.display_name ?? u.username ?? u.user_id.slice(0, 8)}
                  {u.verified ? " ✓" : ""}
                </Text>
                <Text style={styles.rowSub}>@{u.username ?? "—"} · {u.followers_count} followers</Text>
              </View>
              {u.is_banned ? (
                <View style={[styles.miniPill, { backgroundColor: "rgba(255,93,143,0.18)" }]}>
                  <Text style={[styles.miniPillText, { color: Colors.rose }]}>BANNED</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>

      <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
      <View style={styles.cardWrap}>
        {recentActivityQuery.isLoading ? (
          <ActivityIndicator color={Colors.mint} style={{ padding: 20 }} />
        ) : (recentActivityQuery.data ?? []).length === 0 ? (
          <Text style={styles.empty}>No admin actions yet.</Text>
        ) : (
          (recentActivityQuery.data ?? []).map((a) => (
            <View key={a.id} style={styles.miniRow}>
              <View style={[styles.avatar, { backgroundColor: "rgba(56,215,255,0.16)" }]}>
                <Shield color={Colors.cyan} size={13} strokeWidth={2.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{a.action.replace(/_/g, " ")}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {a.admin_username ?? "system"} · {a.target_type ?? "—"}
                </Text>
              </View>
              <Text style={styles.rowSub}>{relTime(a.created_at)}</Text>
            </View>
          ))
        )}
      </View>

      {statsQuery.isError ? (
        <Text style={styles.errorText}>
          Couldn&apos;t load stats: {String((statsQuery.error as Error)?.message ?? "unknown")}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function HeroMetric({ label, value, accent }: { label: string; value: number | undefined; accent?: string }) {
  return (
    <View style={styles.heroMetric}>
      <Text style={[styles.heroMetricVal, accent ? { color: accent } : null]}>
        {typeof value === "number" ? value.toLocaleString() : "—"}
      </Text>
      <Text style={styles.heroMetricKey}>{label}</Text>
    </View>
  );
}

function QuickAction({
  Icon, label, sub, accent, onPress,
}: {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string; sub: string; accent: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickCard, pressed && styles.pressedDeep]} testID={`quick-${label.toLowerCase()}`}>
      <View style={[styles.quickIcon, { backgroundColor: `${accent}1F`, borderColor: `${accent}55` }]}>
        <Icon color={accent} size={16} strokeWidth={2.6} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickSub}>{sub}</Text>
    </Pressable>
  );
}

function StatCard({
  label, value, accent, Icon,
}: {
  label: string; value: number | undefined; accent: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
}) {
  return (
    <View style={[styles.statCard, { borderColor: `${accent}33` }]}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}1A` }]}>
        <Icon color={accent} size={14} strokeWidth={2.6} />
      </View>
      <Text style={styles.statNum}>{typeof value === "number" ? value.toLocaleString() : "—"}</Text>
      <Text style={styles.statKey}>{label}</Text>
    </View>
  );
}

/* ------------------------------- OPS ----------------------------- */

function OpsSection() {
  const qc = useQueryClient();

  const overviewQuery = useQuery<PlatformOverview>({
    queryKey: ["admin", "platform-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_platform_overview");
      if (error) throw error;
      return (data ?? {}) as PlatformOverview;
    },
    refetchInterval: 30_000,
  });

  const sourcesQuery = useQuery<DataSourceRow[]>({
    queryKey: ["admin", "data-sources"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_data_sources_all");
      if (error) throw error;
      return (data ?? []) as DataSourceRow[];
    },
    refetchInterval: 45_000,
  });

  const moderationQuery = useQuery<ModerationRow[]>({
    queryKey: ["admin", "moderation-queue"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_moderation_queue", {
        max_rows: 50,
        include_resolved: false,
      });
      if (error) throw error;
      return (data ?? []) as ModerationRow[];
    },
    refetchInterval: 30_000,
  });

  const sourceMutation = useMutation({
    mutationFn: async (input: { provider: string; status: DataSourceRow["status"] }) => {
      const { error } = await supabase.rpc("admin_data_source_upsert", {
        in_provider: input.provider,
        in_status: input.status,
        in_latency_ms: null,
        in_meta: {},
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Source update failed", e.message),
  });

  const moderationMutation = useMutation({
    mutationFn: async (input: { id: string; status: ModerationRow["status"] }) => {
      const { error } = await supabase.rpc("admin_moderation_resolve", {
        queue_id: input.id,
        new_status: input.status,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Moderation update failed", e.message),
  });

  const o = overviewQuery.data;
  const health = Math.max(0, Math.min(100, Number(o?.health_score ?? 0)));

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={["#102225", "#071113"]} style={styles.opsHero}>
        <View style={styles.listingHeader}>
          <View style={[styles.avatar, { backgroundColor: "rgba(85,245,178,0.16)" }]}> 
            <Gauge color={Colors.mint} size={16} strokeWidth={2.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>Connected platform health</Text>
            <Text style={styles.opsHeroTitle}>{health || "—"}% operational</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${health >= 90 ? Colors.mint : health >= 70 ? Colors.orange : Colors.rose}22` }]}> 
            <Text style={[styles.statusPillText, { color: health >= 90 ? Colors.mint : health >= 70 ? Colors.orange : Colors.rose }]}>LIVE</Text>
          </View>
        </View>
        <View style={styles.healthTrack}>
          <View style={[styles.healthFill, { width: `${health}%`, backgroundColor: health >= 90 ? Colors.mint : health >= 70 ? Colors.orange : Colors.rose }]} />
        </View>
        <View style={styles.listingMetrics}>
          <Metric label="VOLUME 24H" value={fmtUsd(Number(o?.volume_24h_usd ?? 0))} />
          <Metric label="LIQUIDITY" value={fmtUsd(Number(o?.liquidity_usd ?? 0))} />
          <Metric label="MCAP" value={fmtUsd(Number(o?.market_cap_usd ?? 0))} />
        </View>
      </LinearGradient>

      <Text style={styles.sectionLabel}>CONNECTED DATA</Text>
      <View style={styles.statsGrid}>
        <StatCard label="USERS" value={o?.users_total} accent={Colors.mint} Icon={Users} />
        <StatCard label="ONLINE" value={o?.online_now} accent={Colors.mint} Icon={Radio} />
        <StatCard label="LISTINGS" value={o?.listings_total} accent={Colors.cyan} Icon={Rocket} />
        <StatCard label="VERIFIED TOKENS" value={o?.listings_verified} accent={Colors.cyan} Icon={BadgeCheck} />
        <StatCard label="COMMUNITIES" value={o?.communities_total} accent="#B88CFF" Icon={MessageCircle} />
        <StatCard label="POSTS" value={o?.posts_total} accent="#B88CFF" Icon={Activity} />
        <StatCard label="WATCHED TOKENS" value={o?.tracked_tokens} accent={Colors.orange} Icon={Wallet} />
        <StatCard label="WATCHED WALLETS" value={o?.tracked_wallets} accent={Colors.orange} Icon={Database} />
        <StatCard label="OPEN TICKETS" value={o?.open_tickets} accent={Colors.rose} Icon={LifeBuoy} />
        <StatCard label="MODERATION" value={o?.pending_moderation} accent={Colors.rose} Icon={Shield} />
        <StatCard label="LIVE SPACES" value={o?.live_rooms_active} accent={Colors.mint} Icon={Radio} />
        <StatCard label="WHALES · 24H" value={o?.whale_events_24h} accent={Colors.cyan} Icon={Zap} />
      </View>

      <Text style={styles.sectionLabel}>DATA SOURCES</Text>
      <View style={styles.cardWrap}>
        {sourcesQuery.isLoading ? (
          <ActivityIndicator color={Colors.mint} style={{ padding: 20 }} />
        ) : (sourcesQuery.data ?? []).length === 0 ? (
          <Text style={styles.empty}>No data sources configured. Run the admin ops SQL.</Text>
        ) : (
          (sourcesQuery.data ?? []).map((src) => {
            const tint = sourceStatusColor(src.status);
            return (
              <View key={src.provider} style={styles.sourceRow} testID={`source-${src.provider}`}>
                <View style={[styles.sourceDot, { backgroundColor: tint }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{sourceLabel(src.provider)}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {src.status.toUpperCase()} · {src.latency_ms ? `${src.latency_ms}ms` : "no latency"} · {src.error_count_24h} errors
                  </Text>
                </View>
                <View style={styles.sourceActions}>
                  {(["healthy", "degraded", "outage"] as const).map((status) => (
                    <Pressable
                      key={status}
                      onPress={() => sourceMutation.mutate({ provider: src.provider, status })}
                      style={[styles.sourceAction, src.status === status && { backgroundColor: sourceStatusColor(status), borderColor: sourceStatusColor(status) }]}
                      testID={`source-${src.provider}-${status}`}
                    >
                      <Text style={[styles.sourceActionText, src.status === status && { color: Colors.ink }]}>{status.slice(0, 1).toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.sectionLabel}>MODERATION QUEUE</Text>
      <View style={styles.cardWrap}>
        {moderationQuery.isLoading ? (
          <ActivityIndicator color={Colors.mint} style={{ padding: 20 }} />
        ) : (moderationQuery.data ?? []).length === 0 ? (
          <Text style={styles.empty}>No open moderation items.</Text>
        ) : (
          (moderationQuery.data ?? []).map((item) => (
            <View key={item.id} style={styles.modRow} testID={`mod-${item.id}`}>
              <View style={[styles.avatar, { backgroundColor: "rgba(255,93,143,0.16)" }]}> 
                <Shield color={Colors.rose} size={13} strokeWidth={2.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.item_type} · {item.status}</Text>
                <Text style={styles.rowSub} numberOfLines={2}>{item.reason || item.item_id}</Text>
              </View>
              <View style={styles.sourceActions}>
                {(["reviewing", "resolved", "rejected"] as const).map((status) => (
                  <Pressable
                    key={status}
                    onPress={() => moderationMutation.mutate({ id: item.id, status })}
                    style={styles.sourceAction}
                    testID={`mod-${item.id}-${status}`}
                  >
                    <Text style={styles.sourceActionText}>{status.slice(0, 1).toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </View>

      {overviewQuery.isError || sourcesQuery.isError || moderationQuery.isError ? (
        <Text style={styles.errorText}>Ops data is unavailable. Confirm the admin database functions are applied and your account has admin access.</Text>
      ) : null}
    </ScrollView>
  );
}

function sourceStatusColor(status: DataSourceRow["status"]): string {
  if (status === "healthy") return Colors.mint;
  if (status === "degraded") return Colors.orange;
  if (status === "outage") return Colors.rose;
  return Colors.muted;
}

function sourceLabel(provider: string): string {
  return provider.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/* ----------------------------- ADMINS ---------------------------- */

function AdminsSection({ isSuperadmin }: { isSuperadmin: boolean }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [emailInput, setEmailInput] = useState<string>("");
  const [roleInput, setRoleInput] = useState<AdminRole>("admin");

  const adminsQuery = useQuery<AdminRow[]>({
    queryKey: ["admin", "admins"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_admins");
      if (error) throw error;
      return (data ?? []) as AdminRow[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (input: { email: string; role: AdminRole }) => {
      const { error } = await supabase.rpc("admin_add_by_email", {
        target_email: input.email,
        target_role: input.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAddOpen(false);
      setEmailInput("");
      setRoleInput("admin");
      qc.invalidateQueries({ queryKey: ["admin"] });
      Alert.alert("Admin added", "Role granted successfully.");
    },
    onError: (e: Error) => Alert.alert("Couldn't add admin", e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (uid: string) => {
      const { error } = await supabase.rpc("admin_remove", { target_user_id: uid });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Couldn't revoke", e.message),
  });

  const onConfirmRemove = useCallback(
    (row: AdminRow) => {
      Alert.alert(
        "Revoke admin?",
        `Remove ${row.email ?? row.username ?? row.user_id} (${row.role}) from the admin team?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Revoke", style: "destructive", onPress: () => removeMutation.mutate(row.user_id) },
        ],
      );
    },
    [removeMutation],
  );

  return (
    <View style={{ flex: 1 }}>
      {isSuperadmin ? (
        <View style={styles.actionRow}>
          <PrimaryButton onPress={() => setAddOpen(true)} Icon={UserPlus} label="Add admin by email" testID="admin-add" />
        </View>
      ) : (
        <Text style={styles.notice}>Only superadmins can add or revoke admins.</Text>
      )}

      <FlatList
        data={adminsQuery.data ?? []}
        keyExtractor={(it) => it.user_id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          adminsQuery.isLoading ? (
            <ActivityIndicator color={Colors.mint} style={{ marginTop: 24 }} />
          ) : (
            <Text style={styles.empty}>No admins yet.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row} testID={`admin-row-${item.user_id}`}>
            <View style={[styles.avatar, { backgroundColor: `${roleColor(item.role)}22` }]}>
              <Crown color={roleColor(item.role)} size={14} strokeWidth={2.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.username ?? item.email ?? item.user_id.slice(0, 8)}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {item.email ?? "—"} · {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={[styles.rolePill, { borderColor: roleColor(item.role) }]}>
              <Text style={[styles.rolePillText, { color: roleColor(item.role) }]}>
                {item.role.toUpperCase()}
              </Text>
            </View>
            {isSuperadmin ? (
              <Pressable
                onPress={() => onConfirmRemove(item)}
                hitSlop={8}
                style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
                testID={`admin-remove-${item.user_id}`}
              >
                <ShieldOff color={Colors.rose} size={14} strokeWidth={2.6} />
              </Pressable>
            ) : null}
          </View>
        )}
      />

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add admin</Text>
              <Pressable onPress={() => setAddOpen(false)} hitSlop={8}>
                <X color={Colors.muted} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>
            <Text style={styles.modalLabel}>EMAIL</Text>
            <TextInput
              value={emailInput}
              onChangeText={setEmailInput}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="user@example.com"
              placeholderTextColor={Colors.muted}
              style={styles.modalInput}
              testID="admin-add-email"
            />
            <Text style={styles.modalLabel}>ROLE</Text>
            <View style={styles.roleGrid}>
              {ROLES.map((r) => {
                const active = roleInput === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setRoleInput(r)}
                    style={[
                      styles.roleChip,
                      active && { backgroundColor: roleColor(r), borderColor: roleColor(r) },
                    ]}
                    testID={`admin-role-${r}`}
                  >
                    <Text style={[styles.roleChipText, active && { color: Colors.ink }]}>{r}</Text>
                  </Pressable>
                );
              })}
            </View>
            <PrimaryButton
              onPress={() => addMutation.mutate({ email: emailInput.trim(), role: roleInput })}
              disabled={!emailInput.trim() || addMutation.isPending}
              label={addMutation.isPending ? "Granting…" : "Grant role"}
              testID="admin-add-confirm"
              style={{ marginTop: 18 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ------------------------------ USERS ---------------------------- */

function UsersSection({ isSuperadmin }: { isSuperadmin: boolean }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState<string>("");
  const [badgeFor, setBadgeFor] = useState<UserRow | null>(null);

  const usersQuery = useQuery<UserRow[]>({
    queryKey: ["admin", "users", query],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_search_users", {
        q: query.trim(),
        max_rows: 80,
      });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): UserRow => ({
          user_id: String(r.user_id),
          email: (r.email as string | null) ?? null,
          username: (r.username as string | null) ?? null,
          display_name: (r.display_name as string | null) ?? null,
          avatar_url: (r.avatar_url as string | null) ?? null,
          verified: !!r.verified,
          badge: (r.badge as string | null) ?? null,
          custom_badges: Array.isArray(r.custom_badges)
            ? (r.custom_badges as { id: string; label: string; color?: string; icon?: string }[])
            : [],
          is_banned: !!r.is_banned,
          followers_count: Number(r.followers_count ?? 0),
          created_at: (r.created_at as string) ?? new Date().toISOString(),
        }),
      );
    },
    staleTime: 15_000,
  });

  const flagsMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      verified?: boolean;
      banned?: boolean;
      badge?: string;
    }) => {
      const { error } = await supabase.rpc("admin_set_user_flags", {
        target_user_id: input.id,
        set_verified: input.verified ?? null,
        set_badge: input.badge ?? null,
        set_banned: input.banned ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => Alert.alert("Update failed", e.message),
  });

  const removeBadgeMutation = useMutation({
    mutationFn: async (input: { user_id: string; badge_id: string }) => {
      const { error } = await supabase.rpc("admin_remove_badge", {
        target_user_id: input.user_id,
        badge_id: input.badge_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => Alert.alert("Couldn't remove badge", e.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (uid: string) => {
      const { error } = await supabase.rpc("admin_delete_user", { target_user_id: uid });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBox}>
        <Search color={Colors.muted} size={14} strokeWidth={2.6} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by email, @handle, name…"
          placeholderTextColor={Colors.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          testID="admin-users-search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <X color={Colors.muted} size={14} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={usersQuery.data ?? []}
        keyExtractor={(it) => it.user_id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          usersQuery.isLoading ? (
            <ActivityIndicator color={Colors.mint} style={{ marginTop: 24 }} />
          ) : (
            <Text style={styles.empty}>No users match.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.userCard} testID={`user-${item.user_id}`}>
            <View style={styles.listingHeader}>
              <View style={[styles.avatar, { backgroundColor: "rgba(85,245,178,0.16)" }]}>
                <Text style={{ color: Colors.mint, fontWeight: "900" }}>
                  {(item.display_name ?? item.username ?? item.email ?? "?")
                    .slice(0, 1)
                    .toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.display_name ?? item.username ?? item.email ?? item.user_id.slice(0, 8)}
                  {item.verified ? "  ✓" : ""}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  @{item.username ?? "—"} · {item.email ?? "no email"} · {item.followers_count} followers
                </Text>
              </View>
              {isSuperadmin ? (
                <Pressable
                  onPress={() =>
                    Alert.alert("Delete user?", `${item.email ?? item.username ?? "this account"} will be wiped permanently.`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteUserMutation.mutate(item.user_id) },
                    ])
                  }
                  hitSlop={8}
                  style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
                  testID={`user-delete-${item.user_id}`}
                >
                  <Trash2 color={Colors.rose} size={14} strokeWidth={2.6} />
                </Pressable>
              ) : null}
            </View>

            {item.custom_badges.length > 0 ? (
              <View style={styles.userBadgeRow}>
                {item.custom_badges.map((b) => (
                  <Pressable
                    key={b.id}
                    onLongPress={() =>
                      Alert.alert("Remove badge?", b.label, [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () =>
                            removeBadgeMutation.mutate({ user_id: item.user_id, badge_id: b.id }),
                        },
                      ])
                    }
                    style={[
                      styles.userBadge,
                      {
                        borderColor: `${b.color ?? "#FFD56B"}55`,
                        backgroundColor: `${b.color ?? "#FFD56B"}1A`,
                      },
                    ]}
                  >
                    <Sparkles color={b.color ?? "#FFD56B"} size={10} strokeWidth={3} />
                    <Text style={[styles.userBadgeText, { color: b.color ?? "#FFD56B" }]}>
                      {b.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.toggleRow}>
              <ToggleChip
                label={item.verified ? "Verified" : "Verify"}
                active={item.verified}
                color={Colors.cyan}
                Icon={BadgeCheck}
                onPress={() => flagsMutation.mutate({ id: item.user_id, verified: !item.verified })}
                testID={`user-verify-${item.user_id}`}
              />
              <ToggleChip
                label={item.is_banned ? "Banned" : "Active"}
                active={item.is_banned}
                color={Colors.rose}
                Icon={Ban}
                onPress={() => flagsMutation.mutate({ id: item.user_id, banned: !item.is_banned })}
                testID={`user-ban-${item.user_id}`}
              />
              <Pressable
                onPress={() => setBadgeFor(item)}
                style={({ pressed }) => [
                  styles.toggleChip,
                  { borderColor: "rgba(255,213,107,0.55)", backgroundColor: "rgba(255,213,107,0.12)" },
                  pressed && styles.pressed,
                ]}
                testID={`user-add-badge-${item.user_id}`}
              >
                <Plus color="#FFD56B" size={11} strokeWidth={2.8} />
                <Text style={[styles.toggleChipText, { color: "#FFD56B" }]}>Add bag</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <BadgeModal
        target={badgeFor}
        onClose={() => setBadgeFor(null)}
        onSaved={() => {
          setBadgeFor(null);
          qc.invalidateQueries({ queryKey: ["admin"] });
          qc.invalidateQueries({ queryKey: ["profile"] });
        }}
      />
    </View>
  );
}

function BadgeModal({
  target, onClose, onSaved,
}: {
  target: UserRow | null; onClose: () => void; onSaved: () => void;
}) {
  const [label, setLabel] = useState<string>("");
  const [color, setColor] = useState<string>("#FFD56B");
  const colors = ["#FFD56B", "#55F5B2", "#38D7FF", "#FF5D8F", "#FFB84C", "#B88CFF"];

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("No user");
      const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || `bag-${Date.now()}`;
      const { error } = await supabase.rpc("admin_add_badge", {
        target_user_id: target.user_id,
        badge_id: id,
        badge_label: label.trim(),
        badge_color: color,
        badge_icon: "sparkles",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLabel("");
      setColor("#FFD56B");
      onSaved();
    },
    onError: (e: Error) => Alert.alert("Couldn't grant badge", e.message),
  });

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Grant verify bag</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X color={Colors.muted} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>
          <Text style={styles.modalLabel}>BADGE LABEL</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="OG, Diamond Hands, Whale, Genesis…"
            placeholderTextColor={Colors.muted}
            style={styles.modalInput}
            maxLength={32}
            testID="badge-label"
          />
          <Text style={styles.modalLabel}>COLOR</Text>
          <View style={styles.roleGrid}>
            {colors.map((c) => {
              const active = color === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    active && { borderColor: Colors.text, borderWidth: 3 },
                  ]}
                  testID={`badge-color-${c}`}
                />
              );
            })}
          </View>
          <PrimaryButton
            onPress={() => addMutation.mutate()}
            disabled={!label.trim() || addMutation.isPending}
            label={addMutation.isPending ? "Granting…" : "Grant bag"}
            testID="badge-grant"
            style={{ marginTop: 18 }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ----------------------------- LISTINGS -------------------------- */

function ListingsSection() {
  const qc = useQueryClient();
  const [query, setQuery] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "featured" | "verified" | "hot">("all");

  const listingsQuery = useQuery<ListingRow[]>({
    queryKey: ["admin", "listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pump_v5_submissions")
        .select(
          "id,token_name,symbol,contract_address,is_featured,is_verified,is_hot,market_cap,liquidity_usd,volume_24h_usd,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ListingRow[];
    },
  });

  const flagsMutation = useMutation({
    mutationFn: async (input: { id: string; featured?: boolean; verified?: boolean; hot?: boolean }) => {
      const { error } = await supabase.rpc("admin_set_listing_flags", {
        submission_id: input.id,
        set_featured: input.featured ?? null,
        set_verified: input.verified ?? null,
        set_hot: input.hot ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Update failed", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_delete_listing", { submission_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  const data = useMemo(() => {
    let items = listingsQuery.data ?? [];
    if (filter === "featured") items = items.filter((i) => i.is_featured);
    if (filter === "verified") items = items.filter((i) => i.is_verified);
    if (filter === "hot") items = items.filter((i) => i.is_hot);
    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (i) =>
          i.token_name.toLowerCase().includes(q) ||
          i.symbol.toLowerCase().includes(q) ||
          i.contract_address.toLowerCase().includes(q),
      );
    }
    return items;
  }, [listingsQuery.data, filter, query]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBox}>
        <Search color={Colors.muted} size={14} strokeWidth={2.6} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, ticker, contract…"
          placeholderTextColor={Colors.muted}
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(["all", "featured", "verified", "hot"] as const).map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              testID={`admin-filter-${f}`}
            >
              <Text style={[styles.filterChipText, active && { color: Colors.ink }]}>{f.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          listingsQuery.isLoading ? (
            <ActivityIndicator color={Colors.mint} style={{ marginTop: 24 }} />
          ) : (
            <Text style={styles.empty}>No listings match.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.listingCard} testID={`listing-row-${item.id}`}>
            <View style={styles.listingHeader}>
              <View style={[styles.avatar, { backgroundColor: "rgba(184,140,255,0.16)" }]}>
                <Rocket color="#B88CFF" size={14} strokeWidth={2.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  ${item.symbol} <Text style={styles.rowMuted}>· {item.token_name}</Text>
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.contract_address}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert("Delete listing?", `${item.token_name} (${item.symbol})`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
                  ])
                }
                hitSlop={8}
                style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
                testID={`listing-delete-${item.id}`}
              >
                <Trash2 color={Colors.rose} size={14} strokeWidth={2.6} />
              </Pressable>
            </View>
            <View style={styles.listingMetrics}>
              <Metric label="MCAP" value={fmtUsd(item.market_cap)} />
              <Metric label="LIQ" value={fmtUsd(item.liquidity_usd)} />
              <Metric label="VOL 24H" value={fmtUsd(item.volume_24h_usd)} />
            </View>
            <View style={styles.toggleRow}>
              <ToggleChip
                label="Featured" active={item.is_featured} color={Colors.orange} Icon={Star}
                onPress={() => flagsMutation.mutate({ id: item.id, featured: !item.is_featured })}
                testID={`listing-featured-${item.id}`}
              />
              <ToggleChip
                label="Verified" active={item.is_verified} color={Colors.cyan} Icon={BadgeCheck}
                onPress={() => flagsMutation.mutate({ id: item.id, verified: !item.is_verified })}
                testID={`listing-verified-${item.id}`}
              />
              <ToggleChip
                label="Hot" active={item.is_hot} color={Colors.rose} Icon={Flame}
                onPress={() => flagsMutation.mutate({ id: item.id, hot: !item.is_hot })}
                testID={`listing-hot-${item.id}`}
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}

/* ---------------------------- TICKETS ---------------------------- */

function TicketsSection() {
  const qc = useQueryClient();
  const ticketsQuery = useQuery<TicketRow[]>({
    queryKey: ["admin", "tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id,subject,body,status,priority,user_id,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TicketRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; status?: string; priority?: string }) => {
      const { error } = await supabase.rpc("admin_update_ticket", {
        ticket_id: input.id,
        new_status: input.status ?? null,
        new_priority: input.priority ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Update failed", e.message),
  });

  return (
    <FlatList
      data={ticketsQuery.data ?? []}
      keyExtractor={(it) => it.id}
      contentContainerStyle={styles.listPad}
      ListEmptyComponent={
        ticketsQuery.isLoading ? (
          <ActivityIndicator color={Colors.mint} style={{ marginTop: 24 }} />
        ) : (
          <Text style={styles.empty}>No support tickets yet.</Text>
        )
      }
      renderItem={({ item }) => (
        <View style={styles.ticketCard} testID={`ticket-${item.id}`}>
          <View style={styles.ticketHeader}>
            <View style={[styles.statusPill, { backgroundColor: ticketStatusColor(item.status) }]}>
              <Text style={styles.statusPillText}>{item.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.rowSub}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.ticketSubject}>{item.subject}</Text>
          <Text style={styles.ticketBody} numberOfLines={3}>{item.body}</Text>
          <View style={styles.ticketActions}>
            {(["open", "pending", "resolved", "closed"] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => updateMutation.mutate({ id: item.id, status: s })}
                style={[
                  styles.ticketBtn,
                  item.status === s && { backgroundColor: Colors.mint, borderColor: Colors.mint },
                ]}
                testID={`ticket-${item.id}-${s}`}
              >
                <Text style={[styles.ticketBtnText, item.status === s && { color: Colors.ink }]}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    />
  );
}

function ticketStatusColor(s: string): string {
  if (s === "open") return "rgba(255,93,143,0.22)";
  if (s === "pending") return "rgba(255,184,76,0.22)";
  if (s === "resolved") return "rgba(85,245,178,0.22)";
  return "rgba(141,167,164,0.22)";
}

/* --------------------------- BROADCASTS -------------------------- */

function BroadcastsSection() {
  const qc = useQueryClient();
  const [composeOpen, setComposeOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [severity, setSeverity] = useState<AnnouncementRow["severity"]>("info");
  const [audience, setAudience] = useState<AnnouncementRow["audience"]>("all");

  const announcementsQuery = useQuery<AnnouncementRow[]>({
    queryKey: ["admin", "announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id,title,body,severity,audience,created_by,created_at,expires_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_announcement_create", {
        in_title: title.trim(),
        in_body: body.trim(),
        in_severity: severity,
        in_audience: audience,
        in_expires_at: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComposeOpen(false);
      setTitle("");
      setBody("");
      setSeverity("info");
      setAudience("all");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => Alert.alert("Couldn't broadcast", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_announcement_delete", { announcement_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Couldn't delete", e.message),
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.actionRow}>
        <PrimaryButton onPress={() => setComposeOpen(true)} Icon={Megaphone} label="Compose broadcast" testID="broadcast-new" />
      </View>

      <FlatList
        data={announcementsQuery.data ?? []}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          announcementsQuery.isLoading ? (
            <ActivityIndicator color={Colors.mint} style={{ marginTop: 24 }} />
          ) : (
            <Text style={styles.empty}>No broadcasts yet. Send your first one above.</Text>
          )
        }
        renderItem={({ item }) => {
          const tint = severityColor(item.severity);
          return (
            <View style={[styles.announceCard, { borderColor: `${tint}44` }]} testID={`announce-${item.id}`}>
              <View style={styles.listingHeader}>
                <View style={[styles.avatar, { backgroundColor: `${tint}1F` }]}>
                  <Bell color={tint} size={14} strokeWidth={2.6} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.severity.toUpperCase()} · {item.audience} · {relTime(item.created_at)} ago
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert("Delete broadcast?", item.title, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
                    ])
                  }
                  hitSlop={8}
                  style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
                  testID={`announce-delete-${item.id}`}
                >
                  <Trash2 color={Colors.rose} size={14} strokeWidth={2.6} />
                </Pressable>
              </View>
              <Text style={styles.announceBody}>{item.body}</Text>
            </View>
          );
        }}
      />

      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setComposeOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>New broadcast</Text>
              <Pressable onPress={() => setComposeOpen(false)} hitSlop={8}>
                <X color={Colors.muted} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>
            <Text style={styles.modalLabel}>TITLE</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Heads up traders…"
              placeholderTextColor={Colors.muted}
              style={styles.modalInput}
              maxLength={80}
              testID="broadcast-title"
            />
            <Text style={styles.modalLabel}>MESSAGE</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="What's the news?"
              placeholderTextColor={Colors.muted}
              style={[styles.modalInput, { minHeight: 90, textAlignVertical: "top" }]}
              multiline
              maxLength={500}
              testID="broadcast-body"
            />
            <Text style={styles.modalLabel}>SEVERITY</Text>
            <View style={styles.roleGrid}>
              {(["info", "success", "warning", "critical"] as const).map((s) => {
                const active = severity === s;
                const tint = severityColor(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSeverity(s)}
                    style={[
                      styles.roleChip,
                      active && { backgroundColor: tint, borderColor: tint },
                    ]}
                  >
                    <Text style={[styles.roleChipText, active && { color: Colors.ink }]}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.modalLabel}>AUDIENCE</Text>
            <View style={styles.roleGrid}>
              {(["all", "traders", "admins"] as const).map((a) => {
                const active = audience === a;
                return (
                  <Pressable
                    key={a}
                    onPress={() => setAudience(a)}
                    style={[
                      styles.roleChip,
                      active && { backgroundColor: Colors.mint, borderColor: Colors.mint },
                    ]}
                  >
                    <Text style={[styles.roleChipText, active && { color: Colors.ink }]}>{a}</Text>
                  </Pressable>
                );
              })}
            </View>
            <PrimaryButton
              onPress={() => createMutation.mutate()}
              disabled={!title.trim() || !body.trim() || createMutation.isPending}
              label={createMutation.isPending ? "Sending…" : "Send broadcast"}
              testID="broadcast-send"
              style={{ marginTop: 18 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ---------------------------- SETTINGS --------------------------- */

function SettingsSection() {
  const qc = useQueryClient();
  const settingsQuery = useQuery<SettingRow[]>({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_settings_all");
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });

  const setMutation = useMutation({
    mutationFn: async (input: { key: string; value: unknown }) => {
      const { error } = await supabase.rpc("admin_setting_set", {
        in_key: input.key,
        in_value: input.value,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => Alert.alert("Update failed", e.message),
  });

  const flagKeys = ["signups_open", "listings_open", "maintenance_mode"];
  const settings = settingsQuery.data ?? [];
  const flagFor = (k: string) => settings.find((s) => s.key === k);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.cardWrap, { padding: 0 }]}>
        {flagKeys.map((k, i) => {
          const row = flagFor(k);
          const value = row?.value === true;
          return (
            <View key={k} style={[styles.settingRow, i < flagKeys.length - 1 && styles.settingDivider]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{titleForKey(k)}</Text>
                <Text style={styles.rowSub}>{descForKey(k)}</Text>
              </View>
              <Switch
                value={value}
                onValueChange={(v) => setMutation.mutate({ key: k, value: v })}
                trackColor={{ true: Colors.mint, false: "rgba(255,255,255,0.12)" }}
                thumbColor={value ? Colors.ink : Colors.muted}
                testID={`setting-${k}`}
              />
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>OTHER KEYS</Text>
      <View style={styles.cardWrap}>
        {settings.filter((s) => !flagKeys.includes(s.key)).map((s) => (
          <View key={s.key} style={styles.miniRow}>
            <View style={[styles.avatar, { backgroundColor: "rgba(56,215,255,0.16)" }]}>
              <SettingsIcon color={Colors.cyan} size={13} strokeWidth={2.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.key}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{JSON.stringify(s.value)}</Text>
            </View>
          </View>
        ))}
        {settings.length === 0 ? (
          settingsQuery.isLoading ? (
            <ActivityIndicator color={Colors.mint} style={{ padding: 20 }} />
          ) : (
            <Text style={styles.empty}>No settings yet.</Text>
          )
        ) : null}
      </View>
    </ScrollView>
  );
}

function titleForKey(k: string): string {
  if (k === "signups_open") return "Sign-ups open";
  if (k === "listings_open") return "Token listings open";
  if (k === "maintenance_mode") return "Maintenance mode";
  return k;
}

function descForKey(k: string): string {
  if (k === "signups_open") return "Allow new accounts to be created from auth.";
  if (k === "listings_open") return "Allow traders to submit new launches to the launchpad.";
  if (k === "maintenance_mode") return "Show a maintenance banner across the app.";
  return "Platform setting.";
}

/* ----------------------------- AUDIT ----------------------------- */

function AuditSection() {
  const auditQuery = useQuery<AuditRow[]>({
    queryKey: ["admin", "audit"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_recent_activity", { max_rows: 100 });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    refetchInterval: 30_000,
  });

  return (
    <FlatList
      data={auditQuery.data ?? []}
      keyExtractor={(it) => it.id}
      contentContainerStyle={styles.listPad}
      ListEmptyComponent={
        auditQuery.isLoading ? (
          <ActivityIndicator color={Colors.mint} style={{ marginTop: 24 }} />
        ) : (
          <Text style={styles.empty}>Audit log is empty.</Text>
        )
      }
      renderItem={({ item }) => (
        <View style={styles.auditRow} testID={`audit-${item.id}`}>
          <View style={[styles.avatar, { backgroundColor: "rgba(85,245,178,0.16)" }]}>
            <Shield color={Colors.mint} size={13} strokeWidth={2.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.action.replace(/_/g, " ")}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {item.admin_username ?? "system"} · {item.target_type ?? "—"} · {item.target_id?.slice(0, 12) ?? "—"}
            </Text>
          </View>
          <Text style={styles.rowSub}>{relTime(item.created_at)}</Text>
        </View>
      )}
    />
  );
}

/* ---------------------------- SHARED UI -------------------------- */

function ToggleChip({
  label, active, color, Icon, onPress, testID,
}: {
  label: string; active: boolean; color: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  onPress: () => void; testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggleChip,
        active ? { backgroundColor: color, borderColor: color } : { borderColor: `${color}55` },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <Icon color={active ? Colors.ink : color} size={11} strokeWidth={2.8} />
      <Text style={[styles.toggleChipText, active ? { color: Colors.ink } : { color }]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({
  onPress, label, Icon, disabled, style, testID,
}: {
  onPress: () => void;
  label: string;
  Icon?: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  disabled?: boolean;
  style?: object;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.primaryBtn,
        disabled && { opacity: 0.45 },
        pressed && !disabled && styles.pressedDeep,
        style,
      ]}
    >
      <LinearGradient
        colors={["#55F5B2", "#38D7FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryGradient}
      />
      {Icon ? <Icon color={Colors.ink} size={14} strokeWidth={3} /> : null}
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricKey}>{label}</Text>
      <Text style={styles.metricVal}>{value}</Text>
    </View>
  );
}

/* ----------------------------- STYLES ---------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  bgGlow: { position: "absolute", top: 0, left: 0, right: 0, height: 320 },
  safe: { flex: 1 },
  pressed: { opacity: 0.7 },
  pressedDeep: { transform: [{ scale: 0.97 }], opacity: 0.92 },

  gateRoot: { flex: 1, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", padding: 28, gap: 12 },
  gateTitle: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  gateBody: { color: Colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  gateBtn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: Colors.mint, borderRadius: 14 },
  gateBtnText: { color: Colors.ink, fontWeight: "900", fontSize: 14 },

  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12, gap: 10 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  headerEyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, textTransform: "uppercase" },
  headerTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 2 },
  rolePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1.5, borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  rolePillText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  tabsScroll: { flexGrow: 0, maxHeight: 48, marginBottom: 4 },
  tabsRow: { paddingHorizontal: 14, gap: 8, alignItems: "center" },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 13, height: 34, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  tabBtnActive: {
    backgroundColor: Colors.mint,
    borderColor: Colors.mint,
    shadowColor: Colors.mint,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tabText: { color: Colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  tabTextActive: { color: Colors.ink },

  scroll: { padding: 18, paddingBottom: 80, gap: 14 },
  sectionLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginTop: 8 },

  heroCard: { borderRadius: 22, padding: 20, gap: 8 },
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: "rgba(3,7,8,0.18)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  heroBadgeText: { color: Colors.ink, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { color: Colors.ink, fontSize: 26, fontWeight: "900", marginTop: 2 },
  heroBody: { color: "rgba(3,7,8,0.78)", fontSize: 13, lineHeight: 19 },
  heroMetricsRow: { flexDirection: "row", gap: 14, marginTop: 14 },
  heroMetric: {
    flex: 1, backgroundColor: "rgba(3,7,8,0.18)",
    borderRadius: 14, padding: 12, gap: 4,
  },
  heroMetricVal: { color: Colors.ink, fontSize: 18, fontWeight: "900" },
  heroMetricKey: { color: "rgba(3,7,8,0.65)", fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: {
    flexBasis: "31%", flexGrow: 1, gap: 6,
    backgroundColor: Colors.card, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  quickIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  quickLabel: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 2 },
  quickSub: { color: Colors.muted, fontSize: 10, fontWeight: "700" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flexBasis: "47%", flexGrow: 1,
    borderWidth: 1, borderRadius: 16, padding: 14, gap: 6,
    backgroundColor: Colors.card,
  },
  statIcon: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statNum: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  statKey: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },

  cardWrap: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", gap: 4,
  },
  miniRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 8, paddingVertical: 10,
  },
  miniPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  miniPillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },

  errorText: { color: Colors.rose, fontSize: 12, marginTop: 12 },
  actionRow: { paddingHorizontal: 18, paddingBottom: 8, paddingTop: 4 },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 13, borderRadius: 14,
    overflow: "hidden",
  },
  primaryGradient: { ...StyleSheet.absoluteFillObject },
  primaryBtnText: { color: Colors.ink, fontWeight: "900", fontSize: 13, letterSpacing: 0.4 },
  notice: { color: Colors.muted, fontSize: 12, paddingHorizontal: 18, paddingBottom: 8 },

  listPad: { paddingHorizontal: 18, paddingBottom: 80, gap: 10 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.card, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  rowMuted: { color: Colors.muted, fontWeight: "600" },
  rowSub: { color: Colors.muted, fontSize: 11, marginTop: 2 },
  dangerBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: "rgba(255,93,143,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,93,143,0.25)",
  },

  empty: { color: Colors.muted, textAlign: "center", marginTop: 32, marginBottom: 32, fontSize: 13, paddingHorizontal: 18 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 18, paddingBottom: 32, gap: 6,
  },
  sheetHandle: {
    alignSelf: "center", width: 36, height: 4, borderRadius: 4,
    backgroundColor: Colors.muted, opacity: 0.5, marginBottom: 8,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  modalLabel: { color: Colors.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "800", marginTop: 14, marginBottom: 6 },
  modalInput: {
    backgroundColor: Colors.card, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    color: Colors.text, fontSize: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: {
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)",
  },
  roleChipText: { color: Colors.text, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.card,
    marginHorizontal: 18, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, paddingVertical: 0 },

  filterRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  filterChipActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  filterChipText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },

  listingCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", gap: 12,
  },
  listingHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  listingMetrics: { flexDirection: "row", gap: 10 },
  metric: { flex: 1, backgroundColor: Colors.cardSoft, borderRadius: 12, padding: 10, gap: 4 },
  metricKey: { color: Colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  metricVal: { color: Colors.text, fontSize: 13, fontWeight: "900" },

  toggleRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  toggleChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5,
  },
  toggleChipText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },

  ticketCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", gap: 8,
  },
  ticketHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  ticketSubject: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  ticketBody: { color: Colors.muted, fontSize: 12, lineHeight: 17 },
  ticketActions: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  ticketBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  ticketBtnText: { color: Colors.text, fontSize: 10, fontWeight: "800", textTransform: "capitalize" },

  auditRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },

  userCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", gap: 10,
  },
  userBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  userBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  userBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },

  announceCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 14,
    borderWidth: 1, gap: 10,
  },
  announceBody: { color: Colors.muted, fontSize: 13, lineHeight: 19 },

  opsHero: {
    borderRadius: 22, padding: 16, gap: 14,
    borderWidth: 1, borderColor: "rgba(85,245,178,0.16)",
  },
  opsHeroTitle: { color: Colors.text, fontSize: 24, fontWeight: "900", marginTop: 2 },
  healthTrack: { height: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  healthFill: { height: 8, borderRadius: 999 },
  sourceRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
  },
  sourceDot: { width: 10, height: 10, borderRadius: 5 },
  sourceActions: { flexDirection: "row", gap: 5, alignItems: "center" },
  sourceAction: {
    width: 26, height: 26, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  sourceActionText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  modRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 8, paddingVertical: 10,
  },

  settingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  settingDivider: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
});
