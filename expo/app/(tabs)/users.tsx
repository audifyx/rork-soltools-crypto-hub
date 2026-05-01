import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import {
  ChevronRight,
  Globe,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users as UsersIcon,
  Wifi,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import LeaderboardCard from "@/components/users/LeaderboardCard";
import { useAuth } from "@/providers/auth-provider";
import {
  useProfileProvider,
  usePlatformUsers,
  useUsersOverview,
  type CustomBadge,
  type PlatformUser,
} from "@/providers/profile-provider";

type Mode = "online" | "all";

function tap() {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function UsersScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { toggleFollow, isToggling } = useProfileProvider();
  const [mode, setMode] = useState<Mode>("online");
  const [query, setQuery] = useState<string>("");

  const overview = useUsersOverview();
  const list = usePlatformUsers({ q: query, onlineOnly: mode === "online" });

  const items = useMemo<PlatformUser[]>(() => list.data ?? [], [list.data]);

  const onSwitchMode = useCallback((m: Mode) => {
    tap();
    setMode(m);
  }, []);

  const onOpenUser = useCallback(
    (u: PlatformUser) => {
      if (!u.username) return;
      tap();
      router.push({ pathname: "/u/[handle]", params: { handle: u.username } });
    },
    [router],
  );

  const onToggleFollow = useCallback(
    async (u: PlatformUser) => {
      if (!userId || u.user_id === userId) return;
      tap();
      try {
        await toggleFollow(u.user_id);
        list.refetch();
      } catch (e) {
        console.log("[users] follow error", e);
      }
    },
    [userId, toggleFollow, list],
  );

  return (
    <View style={styles.root} testID="users-screen">
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerIcon}>
              <UsersIcon color={Colors.mint} size={18} strokeWidth={2.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>COMMUNITY</Text>
              <Text style={styles.title}>Users</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatPill
              label="ONLINE"
              value={overview.data?.online_users ?? 0}
              color={Colors.mint}
              live
            />
            <StatPill
              label="MEMBERS"
              value={overview.data?.total_users ?? 0}
              color={Colors.cyan}
            />
            <StatPill
              label="NEW TODAY"
              value={overview.data?.new_today ?? 0}
              color={Colors.orange}
            />
          </View>

          <View style={styles.searchBar}>
            <Search color={Colors.muted} size={14} strokeWidth={2.6} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or @handle"
              placeholderTextColor={Colors.muted}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              testID="users-search-input"
            />
          </View>

          <View style={styles.tabsRow}>
            <ModeTab
              label="Online"
              active={mode === "online"}
              count={overview.data?.online_users ?? 0}
              onPress={() => onSwitchMode("online")}
              accent={Colors.mint}
              Icon={Wifi}
            />
            <ModeTab
              label="All Users"
              active={mode === "all"}
              count={overview.data?.total_users ?? 0}
              onPress={() => onSwitchMode("all")}
              accent={Colors.cyan}
              Icon={Globe}
            />
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching}
              onRefresh={() => {
                list.refetch();
                overview.refetch();
              }}
              tintColor={Colors.mint}
            />
          }
        >
          <LeaderboardCard />

          {list.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.mint} />
              <Text style={styles.loadingText}>Loading users…</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <UsersIcon color={Colors.muted} size={26} strokeWidth={2.2} />
              </View>
              <Text style={styles.emptyTitle}>
                {mode === "online" ? "No one is online" : "No users found"}
              </Text>
              <Text style={styles.emptyBody}>
                {mode === "online"
                  ? "Check back in a bit — traders come and go all day."
                  : "Try a different search term to find traders."}
              </Text>
            </View>
          ) : (
            items.map((u) => (
              <UserRow
                key={u.user_id}
                user={u}
                isMe={u.user_id === userId}
                onOpen={() => onOpenUser(u)}
                onFollow={() => onToggleFollow(u)}
                disabled={isToggling}
              />
            ))
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatPill({
  label,
  value,
  color,
  live,
}: {
  label: string;
  value: number;
  color: string;
  live?: boolean;
}) {
  return (
    <View style={[styles.statPill, { borderColor: `${color}33` }]}>
      {live ? <View style={[styles.liveDot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.statValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ModeTab({
  label,
  active,
  count,
  onPress,
  accent,
  Icon,
}: {
  label: string;
  active: boolean;
  count: number;
  onPress: () => void;
  accent: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeTab,
        active && { backgroundColor: `${accent}1F`, borderColor: `${accent}66` },
      ]}
      testID={`users-mode-${label.toLowerCase()}`}
    >
      <Icon color={active ? accent : Colors.muted} size={13} strokeWidth={2.6} />
      <Text style={[styles.modeTabLabel, active && { color: accent }]}>{label}</Text>
      <View style={[styles.modeCount, active && { backgroundColor: `${accent}33` }]}>
        <Text style={[styles.modeCountText, active && { color: accent }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

function UserRow({
  user,
  isMe,
  onOpen,
  onFollow,
  disabled,
}: {
  user: PlatformUser;
  isMe: boolean;
  onOpen: () => void;
  onFollow: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable onPress={onOpen} style={styles.row} testID={`user-row-${user.user_id}`}>
      <View style={styles.avatarWrap}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[Colors.mint, Colors.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>
              {(user.display_name ?? user.username ?? "?").slice(0, 1).toUpperCase()}
            </Text>
          </LinearGradient>
        )}
        {user.is_online ? <View style={styles.onlineDot} /> : null}
      </View>

      <View style={styles.rowMid}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {user.display_name ?? user.username ?? "User"}
          </Text>
          {user.verified ? (
            <ShieldCheck color={Colors.cyan} size={12} strokeWidth={3} />
          ) : null}
        </View>
        <View style={styles.subLine}>
          <Text style={styles.handle} numberOfLines={1}>
            @{user.username ?? "—"}
          </Text>
          <View style={styles.dot} />
          <Text style={[styles.lastSeen, user.is_online && { color: Colors.mint }]}>
            {user.is_online ? "online now" : timeAgo(user.last_seen)}
          </Text>
        </View>
        {user.bio ? (
          <Text style={styles.bio} numberOfLines={1}>
            {user.bio}
          </Text>
        ) : null}
        {user.custom_badges.length > 0 ? (
          <View style={styles.badgeRow}>
            {user.custom_badges.slice(0, 3).map((b) => (
              <BadgePill key={b.id} badge={b} />
            ))}
            {user.followers_count > 0 ? (
              <View style={styles.followersChip}>
                <TrendingUp color={Colors.muted} size={10} strokeWidth={3} />
                <Text style={styles.followersChipText}>
                  {user.followers_count.toLocaleString()}
                </Text>
              </View>
            ) : null}
          </View>
        ) : user.followers_count > 0 ? (
          <View style={styles.badgeRow}>
            <View style={styles.followersChip}>
              <TrendingUp color={Colors.muted} size={10} strokeWidth={3} />
              <Text style={styles.followersChipText}>
                {user.followers_count.toLocaleString()} followers
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {isMe ? (
        <View style={styles.meChip}>
          <Text style={styles.meChipText}>YOU</Text>
        </View>
      ) : (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onFollow();
          }}
          disabled={disabled}
          style={[
            styles.followBtn,
            user.is_following && styles.followBtnActive,
            disabled && { opacity: 0.6 },
          ]}
          testID={`follow-btn-${user.user_id}`}
        >
          <UserPlus
            color={user.is_following ? Colors.mint : Colors.ink}
            size={12}
            strokeWidth={3}
          />
          <Text
            style={[
              styles.followBtnText,
              user.is_following && { color: Colors.mint },
            ]}
          >
            {user.is_following ? "Following" : "Follow"}
          </Text>
        </Pressable>
      )}

      <ChevronRight color={Colors.muted} size={14} strokeWidth={2.4} />
    </Pressable>
  );
}

function BadgePill({ badge }: { badge: CustomBadge }) {
  const color = badge.color ?? "#FFD56B";
  return (
    <View style={[styles.badge, { borderColor: `${color}55`, backgroundColor: `${color}1A` }]}>
      <Sparkles color={color} size={9} strokeWidth={3} />
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>
        {badge.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(85,245,178,0.08)",
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(85,245,178,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  statsRow: { flexDirection: "row", gap: 8 },
  statPill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    alignItems: "flex-start",
    gap: 2,
  },
  liveDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statValue: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  tabsRow: { flexDirection: "row", gap: 8 },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  modeTabLabel: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  modeCount: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modeCountText: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 14 },
  loading: { paddingVertical: 60, alignItems: "center", gap: 12 },
  loadingText: { color: Colors.muted, fontSize: 13, fontWeight: "700" },
  empty: { paddingVertical: 80, alignItems: "center", gap: 10 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 19,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
  },
  avatarWrap: { width: 48, height: 48 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: Colors.mint,
    borderWidth: 2.5,
    borderColor: Colors.card,
  },
  rowMid: { flex: 1, gap: 3 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1,
  },
  subLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  handle: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.muted,
  },
  lastSeen: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  bio: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  followersChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  followersChipText: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  meChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(85,245,178,0.16)",
  },
  meChipText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  followBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: Colors.mint,
  },
  followBtnActive: {
    backgroundColor: "rgba(85,245,178,0.14)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
  },
  followBtnText: {
    color: Colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
