import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Crown,
  Flame,
  LifeBuoy,
  Plus,
  Rocket,
  Search,
  Shield,
  ShieldOff,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  X,
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
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { useAdmin, type AdminRole } from "@/providers/admin-provider";
import { useAuth } from "@/providers/auth-provider";

type Section = "overview" | "admins" | "users" | "listings" | "tickets" | "audit";

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
  support_open: number;
  support_total: number;
  new_users_7d: number;
  new_listings_7d: number;
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
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

const ROLES: AdminRole[] = ["superadmin", "admin", "moderator", "support"];

export default function AdminDashboard() {
  const router = useRouter();
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

  return (
    <View style={styles.root} testID="admin-dashboard">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="admin-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>SolTools control room</Text>
            <Text style={styles.headerTitle}>Admin Console</Text>
          </View>
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
          contentContainerStyle={styles.tabsRow}
        >
          {(
            [
              { id: "overview", label: "Overview", Icon: Sparkles },
              { id: "admins", label: "Admins", Icon: Crown },
              { id: "users", label: "Users", Icon: Users },
              { id: "listings", label: "Listings", Icon: Rocket },
              { id: "tickets", label: "Support", Icon: LifeBuoy },
              { id: "audit", label: "Audit Log", Icon: Shield },
            ] as { id: Section; label: string; Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }> }[]
          ).map((t) => {
            const active = section === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setSection(t.id)}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                testID={`admin-tab-${t.id}`}
              >
                <t.Icon color={active ? Colors.ink : Colors.text} size={13} strokeWidth={2.6} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flex: 1 }}>
          {section === "overview" && <OverviewSection />}
          {section === "admins" && <AdminsSection isSuperadmin={isSuperadmin} />}
          {section === "users" && <UsersSection />}
          {section === "listings" && <ListingsSection />}
          {section === "tickets" && <TicketsSection />}
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

function OverviewSection() {
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ["admin", "dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_stats");
      if (error) throw error;
      return data as DashboardStats;
    },
    refetchInterval: 30_000,
  });

  const s = statsQuery.data;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={[Colors.mint, Colors.cyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <Sparkles color={Colors.ink} size={18} strokeWidth={3} />
        <Text style={styles.heroTitle}>SolTools at a glance</Text>
        <Text style={styles.heroBody}>
          Live operations data refreshed every 30s. Curate the launchpad, manage your team, and keep traders moving.
        </Text>
      </LinearGradient>

      <View style={styles.statsGrid}>
        <StatCard label="USERS" value={s?.users} accent={Colors.mint} Icon={Users} />
        <StatCard label="ADMINS" value={s?.admins} accent="#FFD56B" Icon={Crown} />
        <StatCard label="LISTINGS" value={s?.listings} accent={Colors.cyan} Icon={Rocket} />
        <StatCard label="FEATURED" value={s?.featured} accent={Colors.orange} Icon={Star} />
        <StatCard label="VERIFIED" value={s?.verified} accent={Colors.cyan} Icon={BadgeCheck} />
        <StatCard label="OPEN TICKETS" value={s?.support_open} accent={Colors.rose} Icon={LifeBuoy} />
        <StatCard label="NEW USERS · 7D" value={s?.new_users_7d} accent={Colors.mint} Icon={TrendingUp} />
        <StatCard label="NEW LISTINGS · 7D" value={s?.new_listings_7d} accent="#B88CFF" Icon={Flame} />
      </View>

      {statsQuery.isError ? (
        <Text style={styles.errorText}>
          Couldn&apos;t load stats: {String((statsQuery.error as Error)?.message ?? "unknown")}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  accent,
  Icon,
}: {
  label: string;
  value: number | undefined;
  accent: string;
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
      qc.invalidateQueries({ queryKey: ["admin", "admins"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard-stats"] });
      Alert.alert("Admin added", "Role granted successfully.");
    },
    onError: (e: Error) => Alert.alert("Couldn't add admin", e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (uid: string) => {
      const { error } = await supabase.rpc("admin_remove", { target_user_id: uid });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "admins"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard-stats"] });
    },
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
          <Pressable onPress={() => setAddOpen(true)} style={styles.primaryBtn} testID="admin-add">
            <UserPlus color={Colors.ink} size={14} strokeWidth={3} />
            <Text style={styles.primaryBtnText}>Add admin by email</Text>
          </Pressable>
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
                style={styles.dangerBtn}
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
            <Pressable
              onPress={() =>
                addMutation.mutate({ email: emailInput.trim(), role: roleInput })
              }
              disabled={!emailInput.trim() || addMutation.isPending}
              style={[styles.primaryBtn, { marginTop: 18 }, (!emailInput.trim() || addMutation.isPending) && { opacity: 0.55 }]}
              testID="admin-add-confirm"
            >
              <Text style={styles.primaryBtnText}>
                {addMutation.isPending ? "Granting…" : "Grant role"}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function UsersSection() {
  const qc = useQueryClient();
  const [query, setQuery] = useState<string>("");
  const [badgeFor, setBadgeFor] = useState<UserRow | null>(null);

  const usersQuery = useQuery<UserRow[]>({
    queryKey: ["admin", "users", query],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_search_users", {
        q: query.trim(),
        max_rows: 60,
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
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
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
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => Alert.alert("Couldn't remove badge", e.message),
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
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  @{item.username ?? "—"} · {item.email ?? "no email"} · {item.followers_count} followers
                </Text>
              </View>
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
                    <Text
                      style={[
                        styles.userBadgeText,
                        { color: b.color ?? "#FFD56B" },
                      ]}
                    >
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
                style={[styles.toggleChip, { borderColor: "rgba(255,213,107,0.55)", backgroundColor: "rgba(255,213,107,0.12)" }]}
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
          qc.invalidateQueries({ queryKey: ["admin", "users"] });
          qc.invalidateQueries({ queryKey: ["profile"] });
        }}
      />
    </View>
  );
}

function BadgeModal({
  target,
  onClose,
  onSaved,
}: {
  target: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
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
          <Pressable
            onPress={() => addMutation.mutate()}
            disabled={!label.trim() || addMutation.isPending}
            style={[
              styles.primaryBtn,
              { marginTop: 18 },
              (!label.trim() || addMutation.isPending) && { opacity: 0.55 },
            ]}
            testID="badge-grant"
          >
            <Text style={styles.primaryBtnText}>
              {addMutation.isPending ? "Granting…" : "Grant bag"}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "listings"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["launchpad"] });
    },
    onError: (e: Error) => Alert.alert("Update failed", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_delete_listing", { submission_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "listings"] });
      qc.invalidateQueries({ queryKey: ["launchpad"] });
    },
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
                style={styles.dangerBtn}
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
                label="Featured"
                active={item.is_featured}
                color={Colors.orange}
                Icon={Star}
                onPress={() => flagsMutation.mutate({ id: item.id, featured: !item.is_featured })}
                testID={`listing-featured-${item.id}`}
              />
              <ToggleChip
                label="Verified"
                active={item.is_verified}
                color={Colors.cyan}
                Icon={BadgeCheck}
                onPress={() => flagsMutation.mutate({ id: item.id, verified: !item.is_verified })}
                testID={`listing-verified-${item.id}`}
              />
              <ToggleChip
                label="Hot"
                active={item.is_hot}
                color={Colors.rose}
                Icon={Flame}
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

function ToggleChip({
  label,
  active,
  color,
  Icon,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  color: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggleChip, active ? { backgroundColor: color, borderColor: color } : { borderColor: `${color}55` }]}
      testID={testID}
    >
      <Icon color={active ? Colors.ink : color} size={11} strokeWidth={2.8} />
      <Text style={[styles.toggleChipText, active ? { color: Colors.ink } : { color }]}>{label}</Text>
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

function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard-stats"] });
    },
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
          <Text style={styles.ticketBody} numberOfLines={3}>
            {item.body}
          </Text>
          <View style={styles.ticketActions}>
            {(["open", "in_progress", "resolved", "closed"] as const).map((s) => (
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
                  {s.replace("_", " ")}
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
  if (s === "in_progress") return "rgba(255,184,76,0.22)";
  if (s === "resolved") return "rgba(85,245,178,0.22)";
  return "rgba(141,167,164,0.22)";
}

function AuditSection() {
  const auditQuery = useQuery<AuditRow[]>({
    queryKey: ["admin", "audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id,admin_id,action,target_type,target_id,meta,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
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
            <Text style={styles.rowTitle}>{item.action}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {item.target_type ?? "—"} · {item.target_id?.slice(0, 12) ?? "—"}
            </Text>
          </View>
          <Text style={styles.rowSub}>{new Date(item.created_at).toLocaleTimeString()}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  gateRoot: { flex: 1, backgroundColor: Colors.ink, justifyContent: "center", alignItems: "center", padding: 28, gap: 12 },
  gateTitle: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  gateBody: { color: Colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  gateBtn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: Colors.mint, borderRadius: 14 },
  gateBtnText: { color: Colors.ink, fontWeight: "900", fontSize: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12, gap: 12 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  headerTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 2 },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  rolePillText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  tabsRow: { paddingHorizontal: 14, gap: 8, paddingBottom: 8 },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabBtnActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  tabText: { color: Colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  tabTextActive: { color: Colors.ink },
  scroll: { padding: 18, paddingBottom: 60, gap: 16 },
  heroCard: { borderRadius: 22, padding: 20, gap: 8 },
  heroTitle: { color: Colors.ink, fontSize: 20, fontWeight: "900" },
  heroBody: { color: "rgba(3,7,8,0.78)", fontSize: 13, lineHeight: 19 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    backgroundColor: Colors.card,
  },
  statIcon: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statNum: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  statKey: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  errorText: { color: Colors.rose, fontSize: 12, marginTop: 12 },
  actionRow: { paddingHorizontal: 18, paddingBottom: 8 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.mint,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryBtnText: { color: Colors.ink, fontWeight: "900", fontSize: 13, letterSpacing: 0.4 },
  notice: { color: Colors.muted, fontSize: 12, paddingHorizontal: 18, paddingBottom: 8 },
  listPad: { paddingHorizontal: 18, paddingBottom: 60, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  rowMuted: { color: Colors.muted, fontWeight: "600" },
  rowSub: { color: Colors.muted, fontSize: 11, marginTop: 2 },
  dangerBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,93,143,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { color: Colors.muted, textAlign: "center", marginTop: 32, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 32,
    gap: 6,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 4,
    backgroundColor: Colors.muted,
    opacity: 0.5,
    marginBottom: 8,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  modalLabel: { color: Colors.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "800", marginTop: 14, marginBottom: 6 },
  modalInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  roleChipText: { color: Colors.text, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.card,
    marginHorizontal: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, paddingVertical: 0 },
  filterRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  filterChipActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  filterChipText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  listingCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 12,
  },
  listingHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  listingMetrics: { flexDirection: "row", gap: 10 },
  metric: {
    flex: 1,
    backgroundColor: Colors.cardSoft,
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  metricKey: { color: Colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  metricVal: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  toggleRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  toggleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  toggleChipText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  ticketCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 8,
  },
  ticketHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  ticketSubject: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  ticketBody: { color: Colors.muted, fontSize: 12, lineHeight: 17 },
  ticketActions: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  ticketBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  ticketBtnText: { color: Colors.text, fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  auditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  userCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 10,
  },
  userBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  userBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  userBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
});
