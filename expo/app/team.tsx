import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  Ban,
  BarChart3,
  BookOpen,
  Check,
  Clock,
  FileText,
  Flag,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  Video,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { navigateBack } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { useAdmin, type TeamPermissions } from "@/providers/admin-provider";
import { useAuth } from "@/providers/auth-provider";

type Tab = "overview" | "posts" | "comments" | "stories" | "reels" | "users" | "reports" | "online" | "log";

interface TabItem {
  key: Tab;
  label: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  perm?: keyof TeamPermissions;
}

const TABS: TabItem[] = [
  { key: "overview", label: "Overview", Icon: BarChart3, perm: "view_analytics" },
  { key: "posts", label: "Posts", Icon: FileText, perm: "delete_posts" },
  { key: "comments", label: "Comments", Icon: MessageSquare, perm: "delete_comments" },
  { key: "stories", label: "Stories", Icon: BookOpen, perm: "delete_stories" },
  { key: "reels", label: "Reels", Icon: Video, perm: "delete_reels" },
  { key: "users", label: "Users", Icon: Users, perm: "ban_users" },
  { key: "reports", label: "Reports", Icon: Flag, perm: "resolve_reports" },
  { key: "online", label: "Online", Icon: Activity, perm: "view_online" },
  { key: "log", label: "Log", Icon: ShieldCheck },
];

interface AnalyticsRow {
  total_users: number;
  active_24h: number;
  banned_users: number;
  suspended_users: number;
  open_reports: number;
  team_actions_24h: number;
  online_now: number;
}

interface PostRow {
  id: string;
  user_id: string | null;
  content: string | null;
  image_url: string | null;
  created_at: string;
  likes_count: number | null;
  comments_count: number | null;
}

interface ReelRow {
  id: string;
  user_id: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  created_at: string;
  likes_count: number | null;
  views_count: number | null;
}

interface UserRow {
  id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  is_banned: boolean | null;
  is_suspended: boolean | null;
  ban_expires_at: string | null;
  ban_reason: string | null;
  suspend_expires_at: string | null;
  suspend_reason: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  reporter_id: string | null;
  target_type: string | null;
  category: string | null;
  target_user_id: string | null;
  target_post_id: string | null;
  target_comment_id: string | null;
  target_reel_id: string | null;
  target_story_id: string | null;
  target_story_comment_id: string | null;
  target_community_id: string | null;
  target_token: string | null;
  reason: string;
  details: string | null;
  status: string;
  action_taken: string | null;
  created_at: string;
}

type ReportCategoryTab =
  | "all"
  | "post"
  | "comment"
  | "reel"
  | "story"
  | "story_comment"
  | "user"
  | "community"
  | "token";

const REPORT_CATEGORY_TABS: { key: ReportCategoryTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "post", label: "Posts" },
  { key: "comment", label: "Comments" },
  { key: "reel", label: "Reels" },
  { key: "story", label: "Stories" },
  { key: "story_comment", label: "Story replies" },
  { key: "user", label: "Users" },
  { key: "community", label: "Communities" },
  { key: "token", label: "Tokens" },
];

interface OnlineRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  surface: string | null;
  last_seen: string;
}

interface ActionLogRow {
  id: string;
  team_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export default function TeamDashboard() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { isTeam, permissions, role, isLoading } = useAdmin();
  const [tab, setTab] = useState<Tab>("overview");

  const allowedTabs = useMemo(() => {
    return TABS.filter((t) => !t.perm || permissions[t.perm]);
  }, [permissions]);

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.find((t) => t.key === tab)) {
      setTab(allowedTabs[0].key);
    }
  }, [allowedTabs, tab]);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["team"] });
  }, [qc]);

  if (isLoading) {
    return (
      <View style={styles.gateRoot}>
        <ActivityIndicator color={Colors.goldBright} />
      </View>
    );
  }

  if (!isAuthenticated || !isTeam) {
    return (
      <SafeAreaView style={styles.gateRoot} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ShieldCheck color={Colors.goldBright} size={46} strokeWidth={2.4} />
        <Text style={styles.gateTitle}>Team dashboard</Text>
        <Text style={styles.gateBody}>
          This area is reserved for moderators. Ask the owner to promote your account from the admin dashboard.
        </Text>
        <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.primarySolid, pressed && styles.pressedDeep]}>
          <Text style={styles.primarySolidText}>Return home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root} testID="team-dashboard">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient
        colors={["rgba(98,208,255,0.18)", "rgba(11,15,26,0.4)", "rgba(0,0,0,0)"]}
        style={styles.bgGlow}
        pointerEvents="none"
      />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigateBack(router, "/(tabs)/home")} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Moderator console</Text>
            <Text style={styles.headerTitle}>Team Dashboard</Text>
          </View>
          <Pressable onPress={refresh} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <RefreshCw color={Colors.goldBright} size={16} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.rolePill}>
            <ShieldCheck color={Colors.goldBright} size={11} strokeWidth={3} />
            <Text style={styles.rolePillText}>{(role ?? "team").toUpperCase()}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
          {allowedTabs.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={({ pressed }) => [styles.tabBtn, active && styles.tabBtnActive, pressed && styles.pressedDeep]}
              >
                <t.Icon color={active ? Colors.ink : Colors.muted} size={13} strokeWidth={2.6} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.content}>
          {tab === "overview" && <OverviewTab />}
          {tab === "posts" && <PostsTab />}
          {tab === "comments" && <CommentsTab />}
          {tab === "stories" && <StoriesTab />}
          {tab === "reels" && <ReelsTab />}
          {tab === "users" && <UsersTab />}
          {tab === "reports" && <ReportsTab />}
          {tab === "online" && <OnlineTab />}
          {tab === "log" && <ActionLogTab />}
        </View>
      </SafeAreaView>
    </View>
  );
}

function OverviewTab() {
  const analytics = useQuery<AnalyticsRow | null>({
    queryKey: ["team", "analytics"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("team_analytics_snapshot").select("*").maybeSingle();
      if (error) throw error;
      return (data as AnalyticsRow | null) ?? null;
    },
  });
  const s = analytics.data;
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[Colors.goldBright, Colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        <View style={styles.heroBadge}>
          <ShieldCheck color={Colors.ink} size={11} strokeWidth={3} />
          <Text style={styles.heroBadgeText}>TEAM · LIVE PULSE</Text>
        </View>
        <Text style={styles.heroTitle}>Keep the community safe</Text>
        <Text style={styles.heroBody}>Moderate posts, watch online users, triage reports, and act fast — all from one mobile-first console.</Text>
      </LinearGradient>

      <Text style={styles.sectionLabel}>PLATFORM PULSE</Text>
      <View style={styles.statsGrid}>
        <StatCard label="USERS" value={s?.total_users} Icon={Users} />
        <StatCard label="ACTIVE · 24H" value={s?.active_24h} Icon={Activity} />
        <StatCard label="ONLINE NOW" value={s?.online_now} Icon={Activity} accent={Colors.goldBright} />
        <StatCard label="OPEN REPORTS" value={s?.open_reports} Icon={Flag} accent={Colors.platinum} />
        <StatCard label="SUSPENDED" value={s?.suspended_users} Icon={Clock} />
        <StatCard label="BANNED" value={s?.banned_users} Icon={Ban} accent={Colors.platinum} />
        <StatCard label="TEAM ACTIONS · 24H" value={s?.team_actions_24h} Icon={ShieldCheck} />
      </View>
      {analytics.isError ? <Text style={styles.errorText}>Analytics view not found. Apply the latest team-roles migration.</Text> : null}
    </ScrollView>
  );
}

function PostsTab() {
  const qc = useQueryClient();
  const [query, setQuery] = useState<string>("");
  const postsQuery = useQuery<PostRow[]>({
    queryKey: ["team", "posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("id,user_id,content,image_url,created_at,likes_count,comments_count")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PostRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: PostRow) => {
      const { error } = await supabase.rpc("team_delete_post", { p_post_id: row.id, p_reason: null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "posts"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = postsQuery.data ?? [];
    if (!q) return list;
    return list.filter((p) => `${p.content ?? ""} ${p.user_id ?? ""}`.toLowerCase().includes(q));
  }, [postsQuery.data, query]);

  return (
    <View style={styles.content}>
      <SearchBox value={query} onChangeText={setQuery} placeholder="Search posts…" />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={postsQuery.isLoading ? <Loader /> : <EmptyState text="No posts found." />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.rowTitle} numberOfLines={3}>{item.content ?? "(media post)"}</Text>
            <Text style={styles.rowSub}>{(item.user_id ?? "?").slice(0, 8)} · {relTime(item.created_at)} ago · {item.likes_count ?? 0} likes · {item.comments_count ?? 0} comments</Text>
            <View style={styles.actionGrid}>
              <ActionButton
                label="Delete"
                Icon={Trash2}
                danger
                onPress={() =>
                  Alert.alert("Delete post?", "This removes the post for everyone.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item) },
                  ])
                }
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}

interface CommentRow {
  id: string;
  post_id: string | null;
  parent_post_id: string | null;
  user_id: string | null;
  content: string | null;
  created_at: string;
  likes_count: number | null;
}

function CommentsTab() {
  const qc = useQueryClient();
  const [query, setQuery] = useState<string>("");
  const commentsQuery = useQuery<CommentRow[]>({
    queryKey: ["team", "comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("id,parent_post_id,user_id,content,created_at,likes_count")
        .not("parent_post_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      const rows = ((data ?? []) as Omit<CommentRow, "post_id">[]).map((r) => ({
        ...r,
        post_id: r.parent_post_id,
      })) as CommentRow[];
      return rows;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: CommentRow) => {
      const { error } = await supabase.rpc("team_delete_comment", { p_comment_id: row.id, p_reason: null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "comments"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = commentsQuery.data ?? [];
    if (!q) return list;
    return list.filter((c) => `${c.content ?? ""} ${c.user_id ?? ""}`.toLowerCase().includes(q));
  }, [commentsQuery.data, query]);

  return (
    <View style={styles.content}>
      <SearchBox value={query} onChangeText={setQuery} placeholder="Search comments…" />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={commentsQuery.isLoading ? <Loader /> : <EmptyState text="No comments found." />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.rowTitle} numberOfLines={4}>{item.content ?? "(empty)"}</Text>
            <Text style={styles.rowSub}>{(item.user_id ?? "?").slice(0, 8)} · on post {(item.post_id ?? "?").slice(0, 8)} · {relTime(item.created_at)} ago · {item.likes_count ?? 0} likes</Text>
            <View style={styles.actionGrid}>
              <ActionButton
                label="Delete"
                Icon={Trash2}
                danger
                onPress={() =>
                  Alert.alert("Delete comment?", "This removes the comment for everyone.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item) },
                  ])
                }
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}

interface StoryRow {
  id: string;
  author_id: string | null;
  caption: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  expires_at: string | null;
  view_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
}

interface StoryCommentRow {
  id: string;
  story_id: string;
  user_id: string;
  body: string;
  parent_comment_id: string | null;
  created_at: string;
  likes_count: number | null;
}

function StoriesTab() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"stories" | "comments">("stories");
  const [query, setQuery] = useState<string>("");

  const storiesQuery = useQuery<StoryRow[]>({
    queryKey: ["team", "stories"],
    enabled: mode === "stories",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stories")
        .select("id,author_id,caption,media_url,media_type,created_at,expires_at,view_count,likes_count,comments_count")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as StoryRow[];
    },
  });

  const storyCommentsQuery = useQuery<StoryCommentRow[]>({
    queryKey: ["team", "story-comments"],
    enabled: mode === "comments",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_comments")
        .select("id,story_id,user_id,body,parent_comment_id,created_at,likes_count")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as StoryCommentRow[];
    },
  });

  const deleteStoryMutation = useMutation({
    mutationFn: async (row: StoryRow) => {
      const { error } = await supabase.rpc("team_delete_story", { p_story_id: row.id, p_reason: null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "stories"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  const deleteStoryCommentMutation = useMutation({
    mutationFn: async (row: StoryCommentRow) => {
      const { error } = await supabase.rpc("team_delete_story_comment", { p_comment_id: row.id, p_reason: null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "story-comments"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  const filteredStories = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = storiesQuery.data ?? [];
    if (!q) return list;
    return list.filter((s) => `${s.caption ?? ""} ${s.author_id ?? ""}`.toLowerCase().includes(q));
  }, [storiesQuery.data, query]);

  const filteredStoryComments = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = storyCommentsQuery.data ?? [];
    if (!q) return list;
    return list.filter((c) => `${c.body ?? ""} ${c.user_id ?? ""}`.toLowerCase().includes(q));
  }, [storyCommentsQuery.data, query]);

  return (
    <View style={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {([
          { key: "stories", label: "STORIES" },
          { key: "comments", label: "STORY COMMENTS" },
        ] as const).map((m) => (
          <Pressable key={m.key} onPress={() => setMode(m.key)} style={[styles.filterChip, mode === m.key && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, mode === m.key && styles.filterChipTextActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <SearchBox value={query} onChangeText={setQuery} placeholder={mode === "stories" ? "Search stories…" : "Search story comments…"} />
      {mode === "stories" ? (
        <FlatList
          data={filteredStories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={storiesQuery.isLoading ? <Loader /> : <EmptyState text="No stories found." />}
          renderItem={({ item }) => {
            const expired = item.expires_at ? new Date(item.expires_at).getTime() < Date.now() : false;
            return (
              <View style={styles.card}>
                <View style={styles.rowHeader}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{item.caption ?? "(no caption)"}</Text>
                    <Text style={styles.rowSub}>{(item.author_id ?? "?").slice(0, 8)} · {item.media_type ?? "media"} · {relTime(item.created_at)} ago · {item.view_count ?? 0} views · {item.likes_count ?? 0} likes · {item.comments_count ?? 0} comments</Text>
                  </View>
                  <Pill label={expired ? "EXPIRED" : "LIVE"} color={expired ? Colors.muted : Colors.goldBright} />
                </View>
                <View style={styles.actionGrid}>
                  <ActionButton
                    label="Delete"
                    Icon={Trash2}
                    danger
                    onPress={() =>
                      Alert.alert("Delete story?", "This removes the story and its comments for everyone.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => deleteStoryMutation.mutate(item) },
                      ])
                    }
                  />
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={filteredStoryComments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={storyCommentsQuery.isLoading ? <Loader /> : <EmptyState text="No story comments found." />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.rowTitle} numberOfLines={4}>{item.body}</Text>
              <Text style={styles.rowSub}>{item.user_id.slice(0, 8)} · on story {item.story_id.slice(0, 8)} · {relTime(item.created_at)} ago · {item.likes_count ?? 0} likes{item.parent_comment_id ? " · reply" : ""}</Text>
              <View style={styles.actionGrid}>
                <ActionButton
                  label="Delete"
                  Icon={Trash2}
                  danger
                  onPress={() =>
                    Alert.alert("Delete comment?", "This removes the comment and its replies for everyone.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteStoryCommentMutation.mutate(item) },
                    ])
                  }
                />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function ReelsTab() {
  const qc = useQueryClient();
  const reelsQuery = useQuery<ReelRow[]>({
    queryKey: ["team", "reels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reels")
        .select("id,user_id,caption,thumbnail_url,created_at,likes_count,views_count")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ReelRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: ReelRow) => {
      const { error } = await supabase.rpc("team_delete_reel", { p_reel_id: row.id, p_reason: null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "reels"] }),
    onError: (e: Error) => Alert.alert("Delete failed", e.message),
  });

  return (
    <FlatList
      data={reelsQuery.data ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listPad}
      ListEmptyComponent={reelsQuery.isLoading ? <Loader /> : <EmptyState text="No reels yet." />}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.rowTitle} numberOfLines={2}>{item.caption ?? "(no caption)"}</Text>
          <Text style={styles.rowSub}>{(item.user_id ?? "?").slice(0, 8)} · {relTime(item.created_at)} ago · {item.views_count ?? 0} views · {item.likes_count ?? 0} likes</Text>
          <View style={styles.actionGrid}>
            <ActionButton
              label="Delete"
              Icon={Trash2}
              danger
              onPress={() =>
                Alert.alert("Delete reel?", "This removes the reel for everyone.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item) },
                ])
              }
            />
          </View>
        </View>
      )}
    />
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { permissions } = useAdmin();
  const [query, setQuery] = useState<string>("");
  const [suspendHours, setSuspendHours] = useState<Record<string, string>>({});
  const [banHours, setBanHours] = useState<Record<string, string>>({});
  const [reasonText, setReasonText] = useState<Record<string, string>>({});

  const usersQuery = useQuery<UserRow[]>({
    queryKey: ["team", "users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,username,display_name,is_banned,is_suspended,ban_expires_at,ban_reason,suspend_expires_at,suspend_reason,created_at")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  const banMutation = useMutation({
    mutationFn: async (input: { row: UserRow; hours: number | null; reason: string | null }) => {
      const uid = input.row.user_id ?? input.row.id;
      if (input.row.is_banned) {
        const { error } = await supabase.rpc("team_unban_user", { p_user_id: uid });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("team_ban_user", {
          p_user_id: uid,
          p_reason: input.reason,
          p_hours: input.hours,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "users"] }),
    onError: (e: Error) => Alert.alert("Action failed", e.message),
  });

  const suspendMutation = useMutation({
    mutationFn: async (input: { row: UserRow; hours: number | null; reason: string | null }) => {
      const uid = input.row.user_id ?? input.row.id;
      if (input.row.is_suspended) {
        const { error } = await supabase.rpc("team_unsuspend_user", { p_user_id: uid });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("team_suspend_user", {
          p_user_id: uid,
          p_hours: input.hours,
          p_reason: input.reason,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "users"] }),
    onError: (e: Error) => Alert.alert("Suspend failed", e.message),
  });

  const limitMutation = useMutation({
    mutationFn: async (input: { row: UserRow; can_post: boolean; can_comment: boolean; can_like: boolean; can_dm: boolean; hours: number }) => {
      const uid = input.row.user_id ?? input.row.id;
      const { error } = await supabase.rpc("team_limit_user", {
        p_user_id: uid,
        p_can_post: input.can_post,
        p_can_comment: input.can_comment,
        p_can_like: input.can_like,
        p_can_dm: input.can_dm,
        p_hours: input.hours,
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "users"] }),
    onError: (e: Error) => Alert.alert("Limit failed", e.message),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = usersQuery.data ?? [];
    if (!q) return list;
    return list.filter((u) => `${u.username ?? ""} ${u.display_name ?? ""} ${u.user_id ?? u.id}`.toLowerCase().includes(q));
  }, [usersQuery.data, query]);

  return (
    <View style={styles.content}>
      <SearchBox value={query} onChangeText={setQuery} placeholder="Search users…" />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.user_id ?? item.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={usersQuery.isLoading ? <Loader /> : <EmptyState text="No users." />}
        renderItem={({ item }) => {
          const uid = item.user_id ?? item.id;
          const suspendStr = suspendHours[uid] ?? "24";
          const banStr = banHours[uid] ?? "";
          const reason = reasonText[uid] ?? "";
          const suspendH = Math.max(1, Number(suspendStr) || 24);
          const banH = banStr.trim() === "" ? null : Math.max(1, Number(banStr) || 24);
          const reasonVal = reason.trim() === "" ? null : reason.trim();
          return (
            <View style={styles.card}>
              <View style={styles.rowHeader}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{item.display_name ?? item.username ?? uid.slice(0, 8)}</Text>
                  <Text style={styles.rowSub}>@{item.username ?? "unset"}</Text>
                  {item.is_banned && item.ban_reason ? (
                    <Text style={styles.rowSub}>Ban: “{item.ban_reason}”{item.ban_expires_at ? ` · until ${new Date(item.ban_expires_at).toLocaleString()}` : " · permanent"}</Text>
                  ) : null}
                  {item.is_suspended && item.suspend_reason ? (
                    <Text style={styles.rowSub}>Suspended: “{item.suspend_reason}”{item.suspend_expires_at ? ` · until ${new Date(item.suspend_expires_at).toLocaleString()}` : " · permanent"}</Text>
                  ) : null}
                </View>
                {item.is_banned ? (
                  <Pill label="BANNED" color={"#FF4D6D"} />
                ) : item.is_suspended ? (
                  <Pill label="SUSPENDED" color={"#FFB84C"} />
                ) : (
                  <Pill label="ACTIVE" color={Colors.goldBright} />
                )}
              </View>

              {(permissions.ban_users || permissions.suspend_users) && !item.is_banned ? (
                <TextInput
                  value={reason}
                  onChangeText={(value) => setReasonText((prev) => ({ ...prev, [uid]: value }))}
                  placeholder="Reason (optional, shown to the user)"
                  placeholderTextColor={Colors.muted2}
                  style={styles.reasonInput}
                  multiline
                />
              ) : null}

              {permissions.ban_users ? (
                <View style={styles.inlineInputRow}>
                  {item.is_banned ? (
                    <ActionButton
                      label="Unban"
                      Icon={Ban}
                      onPress={() => banMutation.mutate({ row: item, hours: null, reason: null })}
                    />
                  ) : (
                    <>
                      <TextInput
                        value={banStr}
                        onChangeText={(value) => setBanHours((prev) => ({ ...prev, [uid]: value }))}
                        keyboardType="numeric"
                        placeholder="Ban hours · blank = forever"
                        placeholderTextColor={Colors.muted2}
                        style={styles.compactInput}
                      />
                      <ActionButton
                        label={banH ? `Ban ${banH}h` : "Ban forever"}
                        Icon={Ban}
                        danger
                        onPress={() => banMutation.mutate({ row: item, hours: banH, reason: reasonVal })}
                      />
                    </>
                  )}
                </View>
              ) : null}

              {permissions.suspend_users ? (
                <View style={styles.inlineInputRow}>
                  {item.is_suspended ? (
                    <ActionButton
                      label="Unsuspend"
                      Icon={Clock}
                      onPress={() => suspendMutation.mutate({ row: item, hours: null, reason: null })}
                    />
                  ) : (
                    <>
                      <TextInput
                        value={suspendStr}
                        onChangeText={(value) => setSuspendHours((prev) => ({ ...prev, [uid]: value }))}
                        keyboardType="numeric"
                        placeholder="Hours · blank = forever"
                        placeholderTextColor={Colors.muted2}
                        style={styles.compactInput}
                      />
                      <ActionButton
                        label={suspendStr.trim() === "" ? "Suspend forever" : `Suspend ${suspendH}h`}
                        Icon={Clock}
                        onPress={() => suspendMutation.mutate({ row: item, hours: suspendStr.trim() === "" ? null : suspendH, reason: reasonVal })}
                      />
                    </>
                  )}
                </View>
              ) : null}

              {permissions.limit_users && !item.is_banned && !item.is_suspended ? (
                <View style={styles.actionGrid}>
                  <ActionButton label="Mute posts 24h" Icon={Clock} onPress={() => limitMutation.mutate({ row: item, can_post: false, can_comment: true, can_like: true, can_dm: true, hours: 24 })} />
                  <ActionButton label="Mute comments 24h" Icon={Clock} onPress={() => limitMutation.mutate({ row: item, can_post: true, can_comment: false, can_like: true, can_dm: true, hours: 24 })} />
                  <ActionButton label="Mute likes 24h" Icon={Clock} onPress={() => limitMutation.mutate({ row: item, can_post: true, can_comment: true, can_like: false, can_dm: true, hours: 24 })} />
                  <ActionButton label="Mute all 24h" Icon={Clock} onPress={() => limitMutation.mutate({ row: item, can_post: false, can_comment: false, can_like: false, can_dm: false, hours: 24 })} />
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

function reportTargetId(row: ReportRow): string | null {
  return (
    row.target_post_id ??
    row.target_comment_id ??
    row.target_reel_id ??
    row.target_story_id ??
    row.target_story_comment_id ??
    row.target_user_id ??
    row.target_community_id ??
    row.target_token ??
    null
  );
}

function ReportsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("open");
  const [category, setCategory] = useState<ReportCategoryTab>("all");

  const reportsQuery = useQuery<ReportRow[]>({
    queryKey: ["team", "reports", status, category],
    queryFn: async () => {
      let query = supabase
        .from("user_reports")
        .select(
          "id,reporter_id,target_type,category,target_user_id,target_post_id,target_comment_id,target_reel_id,target_story_id,target_story_comment_id,target_community_id,target_token,reason,details,status,action_taken,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (status !== "all") query = query.eq("status", status);
      if (category !== "all") query = query.eq("target_type", category);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const countsQuery = useQuery<Record<string, number>>({
    queryKey: ["team", "reports", "counts"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_report_counts")
        .select("target_type,status,total");
      if (error) return {};
      const map: Record<string, number> = { all: 0 };
      ((data ?? []) as { target_type: string | null; status: string; total: number }[]).forEach((r) => {
        if (r.status !== "open") return;
        const key = r.target_type ?? "other";
        map[key] = (map[key] ?? 0) + Number(r.total ?? 0);
        map.all = (map.all ?? 0) + Number(r.total ?? 0);
      });
      return map;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (input: { row: ReportRow; status: string }) => {
      const { error } = await supabase.rpc("team_resolve_report", {
        p_report_id: input.row.id,
        p_status: input.status,
        p_notes: null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "reports"] }),
    onError: (e: Error) => Alert.alert("Update failed", e.message),
  });

  const actionMutation = useMutation({
    mutationFn: async (input: { row: ReportRow }) => {
      const row = input.row;
      const kind = row.target_type ?? "";
      switch (kind) {
        case "post": {
          if (!row.target_post_id) throw new Error("Missing post id");
          const { error } = await supabase.rpc("team_delete_post", { p_post_id: row.target_post_id, p_reason: row.reason });
          if (error) throw error;
          break;
        }
        case "comment": {
          if (!row.target_comment_id) throw new Error("Missing comment id");
          const { error } = await supabase.rpc("team_delete_comment", { p_comment_id: row.target_comment_id, p_reason: row.reason });
          if (error) throw error;
          break;
        }
        case "reel": {
          if (!row.target_reel_id) throw new Error("Missing reel id");
          const { error } = await supabase.rpc("team_delete_reel", { p_reel_id: row.target_reel_id, p_reason: row.reason });
          if (error) throw error;
          break;
        }
        case "story": {
          if (!row.target_story_id) throw new Error("Missing story id");
          const { error } = await supabase.rpc("team_delete_story", { p_story_id: row.target_story_id, p_reason: row.reason });
          if (error) throw error;
          break;
        }
        case "story_comment": {
          if (!row.target_story_comment_id) throw new Error("Missing comment id");
          const { error } = await supabase.rpc("team_delete_story_comment", { p_comment_id: row.target_story_comment_id, p_reason: row.reason });
          if (error) throw error;
          break;
        }
        case "community": {
          if (!row.target_community_id) throw new Error("Missing community id");
          const { error } = await supabase.rpc("team_delete_community", { p_community_id: row.target_community_id, p_reason: row.reason });
          if (error) throw error;
          break;
        }
        case "token": {
          if (!row.target_token) throw new Error("Missing token");
          const { error } = await supabase.rpc("team_delete_token", { p_token: row.target_token, p_reason: row.reason });
          if (error) throw error;
          break;
        }
        case "user": {
          if (!row.target_user_id) throw new Error("Missing user id");
          const { error } = await supabase.rpc("team_ban_user", { p_user_id: row.target_user_id, p_reason: row.reason, p_hours: null });
          if (error) throw error;
          break;
        }
        default:
          throw new Error(`Unsupported target type: ${kind || "unknown"}`);
      }
      const { error: resolveError } = await supabase.rpc("team_resolve_report", {
        p_report_id: row.id,
        p_status: "actioned",
        p_notes: kind === "user" ? "User banned" : "Content removed",
      });
      if (resolveError) throw resolveError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", "reports"] }),
    onError: (e: Error) => Alert.alert("Action failed", e.message),
  });

  const counts = countsQuery.data ?? {};
  const actionLabel = (kind: string | null): string => {
    switch (kind) {
      case "user": return "Ban user";
      case "token": return "Remove token";
      case "community": return "Delete community";
      case "comment":
      case "story_comment": return "Delete comment";
      default: return "Delete content";
    }
  };

  return (
    <View style={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {REPORT_CATEGORY_TABS.map((t) => {
          const open = counts[t.key] ?? 0;
          return (
            <Pressable key={t.key} onPress={() => setCategory(t.key)} style={[styles.filterChip, category === t.key && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, category === t.key && styles.filterChipTextActive]}>
                {t.label}{open > 0 ? `  ·  ${open}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {(["open", "reviewing", "resolved", "dismissed", "actioned", "all"] as const).map((s) => (
          <Pressable key={s} onPress={() => setStatus(s)} style={[styles.filterChip, status === s && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, status === s && styles.filterChipTextActive]}>{s.toUpperCase()}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={reportsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={reportsQuery.isLoading ? <Loader /> : <EmptyState text="No reports in this queue." />}
        renderItem={({ item }) => {
          const kind = (item.target_type ?? "other").toUpperCase();
          const tgt = reportTargetId(item);
          const tgtPreview = tgt ? (tgt.length > 18 ? `${tgt.slice(0, 10)}…${tgt.slice(-6)}` : tgt) : "—";
          const canAction = !!item.target_type && item.target_type !== "other";
          return (
            <View style={styles.card}>
              <View style={styles.rowHeader}>
                <AlertOctagon color={Colors.goldBright} size={18} strokeWidth={2.6} />
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{(item.category ?? item.reason ?? "report").toString()}</Text>
                  <Text style={styles.rowSub}>{kind} · {tgtPreview} · {relTime(item.created_at)} ago</Text>
                </View>
                <Pill label={item.status.toUpperCase()} color={item.status === "open" ? Colors.goldBright : item.status === "actioned" ? "#FF4D6D" : Colors.muted} />
              </View>
              {item.details ? <Text style={styles.rowSub}>{item.details}</Text> : null}
              <View style={styles.actionGrid}>
                <ActionButton label="Resolve" Icon={Check} onPress={() => resolveMutation.mutate({ row: item, status: "resolved" })} />
                <ActionButton label="Reviewing" Icon={Clock} onPress={() => resolveMutation.mutate({ row: item, status: "reviewing" })} />
                <ActionButton label="Dismiss" Icon={Trash2} onPress={() => resolveMutation.mutate({ row: item, status: "dismissed" })} />
                {canAction ? (
                  <ActionButton
                    label={actionLabel(item.target_type)}
                    Icon={Ban}
                    danger
                    onPress={() =>
                      Alert.alert(
                        actionLabel(item.target_type) + "?",
                        "This action is permanent. Continue?",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Yes", style: "destructive", onPress: () => actionMutation.mutate({ row: item }) },
                        ],
                      )
                    }
                  />
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function OnlineTab() {
  const qc = useQueryClient();
  const onlineQuery = useQuery<OnlineRow[]>({
    queryKey: ["team", "online"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_online_users")
        .select("user_id,username,display_name,avatar_url,surface,last_seen")
        .order("last_seen", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as OnlineRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("team-presence-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_presence" }, () =>
        qc.invalidateQueries({ queryKey: ["team", "online"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <FlatList
      data={onlineQuery.data ?? []}
      keyExtractor={(item) => item.user_id}
      contentContainerStyle={styles.listPad}
      ListHeaderComponent={
        <View style={styles.noticeCard}>
          <Activity color={Colors.goldBright} size={16} strokeWidth={2.6} />
          <Text style={styles.noticeText}>{(onlineQuery.data ?? []).length} users online in the last 5 minutes.</Text>
        </View>
      }
      ListEmptyComponent={onlineQuery.isLoading ? <Loader /> : <EmptyState text="No one online right now." />}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <View style={styles.dotLive} />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.display_name ?? item.username ?? item.user_id.slice(0, 8)}</Text>
              <Text style={styles.rowSub}>@{item.username ?? "unset"} · {item.surface ?? "—"} · {relTime(item.last_seen)} ago</Text>
            </View>
          </View>
        </View>
      )}
    />
  );
}

function ActionLogTab() {
  const qc = useQueryClient();
  const logQuery = useQuery<ActionLogRow[]>({
    queryKey: ["team", "log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_actions_log")
        .select("id,team_user_id,action,target_type,target_id,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ActionLogRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("team-actions-log-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_actions_log" }, () =>
        qc.invalidateQueries({ queryKey: ["team", "log"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <FlatList
      data={logQuery.data ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listPad}
      ListEmptyComponent={logQuery.isLoading ? <Loader /> : <EmptyState text="No team actions yet." />}
      renderItem={({ item }) => (
        <View style={styles.auditLine}>
          <ShieldCheck color={Colors.goldBright} size={14} strokeWidth={2.6} />
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{item.action.replace(/_/g, " ")}</Text>
            <Text style={styles.rowSub}>{item.team_user_id.slice(0, 8)} · {item.target_type ?? "system"} · {relTime(item.created_at)} ago</Text>
          </View>
        </View>
      )}
    />
  );
}

/* ---------- Shared ---------- */

function StatCard({ label, value, Icon, accent = Colors.goldBright }: { label: string; value?: number; Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; accent?: string }) {
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

function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={styles.searchBox}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        placeholder={placeholder}
        placeholderTextColor={Colors.muted2}
        style={styles.searchInput}
      />
    </View>
  );
}

function ActionButton({ label, Icon, onPress, danger, disabled }: { label: string; Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const color = danger ? Colors.platinum : Colors.goldBright;
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionBtn, { borderColor: `${color}44` }, danger && styles.actionBtnDanger, disabled && styles.disabled, pressed && !disabled && styles.pressedDeep]}>
      <Icon color={color} size={12} strokeWidth={2.8} />
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: `${color}66`, backgroundColor: `${color}1A` }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function Loader() {
  return <ActivityIndicator color={Colors.goldBright} style={styles.loader} />;
}

function EmptyState({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

function relTime(iso: string): string {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Reference unused Switch to keep import for downstream extensions
const _Switch = Switch;
void _Switch;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  content: { flex: 1 },
  bgGlow: { position: "absolute", top: 0, left: 0, right: 0, height: 320 },
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
  rolePill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderColor: Colors.goldBright, backgroundColor: "rgba(255,255,255,0.04)" },
  rolePillText: { fontSize: 9, fontWeight: "900", letterSpacing: 1, color: Colors.goldBright },

  tabsScroll: { flexGrow: 0, maxHeight: 48, marginBottom: 4 },
  tabsRow: { paddingHorizontal: 12, gap: 7, alignItems: "center" },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.line },
  tabBtnActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  tabText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  tabTextActive: { color: Colors.ink },

  scroll: { padding: 16, paddingBottom: 90, gap: 14 },
  listPad: { paddingHorizontal: 16, paddingBottom: 90, gap: 10 },
  loader: { paddingVertical: 28 },
  empty: { color: Colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 30 },
  errorText: { color: Colors.platinum, fontSize: 12, lineHeight: 18 },
  sectionLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginTop: 6 },

  heroCard: { borderRadius: 24, padding: 20, gap: 9, borderWidth: 1, borderColor: Colors.lineStrong },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(2,2,2,0.16)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  heroBadgeText: { color: Colors.ink, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { color: Colors.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.6 },
  heroBody: { color: "rgba(2,2,2,0.76)", fontSize: 13, lineHeight: 19, maxWidth: 330 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: Colors.card, borderWidth: 1, borderRadius: 18, padding: 14, gap: 6 },
  statIcon: { width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statNum: { color: Colors.text, fontSize: 23, fontWeight: "900" },
  statKey: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  searchBox: { marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.line },
  searchInput: { color: Colors.text, fontSize: 13, paddingVertical: 0 },

  filterScroll: { flexGrow: 0, marginBottom: 8 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  filterChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.line },
  filterChipActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  filterChipText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  filterChipTextActive: { color: Colors.ink },

  card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 18, padding: 14, gap: 10 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  rowMain: { flex: 1 },
  rowTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  rowSub: { color: Colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },

  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11, backgroundColor: "rgba(98,208,255,0.08)", borderWidth: 1 },
  actionBtnDanger: { backgroundColor: "rgba(247,242,231,0.07)" },
  actionBtnText: { fontSize: 11, fontWeight: "900", textTransform: "capitalize" },

  inlineInputRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  compactInput: { minWidth: 92, flexGrow: 0, width: 110, color: Colors.text, backgroundColor: Colors.cardSoft, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },

  auditLine: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 15, padding: 12 },

  noticeCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 16, padding: 13, marginBottom: 10 },
  noticeText: { flex: 1, color: Colors.muted, fontSize: 12, lineHeight: 18 },

  dotLive: { width: 10, height: 10, borderRadius: 999, backgroundColor: Colors.goldBright, shadowColor: Colors.goldBright, shadowOpacity: 0.6, shadowRadius: 8 },
});
