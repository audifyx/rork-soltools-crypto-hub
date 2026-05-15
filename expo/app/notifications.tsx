import * as Haptics from "expo-haptics";
import { useRouter, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AtSign, Bell, BellOff, CheckCheck, Heart, MessageCircle, Repeat2, Rocket, Settings, Sparkles, TrendingUp, UserPlus, Waves, Zap } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { countUnreadNotifications, dedupeNotifications, sortNotifications } from "@/lib/notification-cache";
import { invalidateNotificationState } from "@/lib/social-query-keys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type Tab = "all" | "mentions" | "social" | "trades" | "whales";
type NotifKind =
  | "like"
  | "repost"
  | "comment"
  | "mention"
  | "follow"
  | "trade"
  | "whale"
  | "alert"
  | "system"
  | "dm_message"
  | "dm_reaction"
  | "launchpad_update"
  | "lobby_invite"
  | "lobby_event"
  | "moderation_update"
  | "announcement";
type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type Notif = {
  id: string;
  remoteId?: string;
  kind: NotifKind;
  title: string;
  body: string;
  ts: number;
  unread: boolean;
  actor?: string;
  actorAvatar?: string | null;
  symbol?: string;
  targetType?: string | null;
  targetId?: string | null;
};

interface NotifRow {
  id: string;
  kind: string;
  title: string | null;
  message: string | null;
  body: string | null;
  created_at: string;
  read_at: string | null;
  actor_username: string | null;
  actor_avatar_url?: string | null;
  target_type: string | null;
  target_id: string | null;
}

const PAGE_LIMIT = 30;
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mentions", label: "Mentions" },
  { id: "social", label: "Social" },
  { id: "trades", label: "Trades" },
  { id: "whales", label: "Whales" },
];

const KIND_META: Record<NotifKind, { Icon: LucideIcon; color: string; bg: string }> = {
  like: { Icon: Heart, color: "#FF5D8F", bg: "rgba(255,93,143,0.14)" },
  repost: { Icon: Repeat2, color: "#55F5B2", bg: "rgba(85,245,178,0.14)" },
  comment: { Icon: MessageCircle, color: Colors.cyan, bg: "rgba(98,208,255,0.14)" },
  mention: { Icon: AtSign, color: Colors.mint, bg: "rgba(63,169,255,0.14)" },
  follow: { Icon: UserPlus, color: Colors.violet, bg: "rgba(91,141,239,0.16)" },
  trade: { Icon: TrendingUp, color: "#55F5B2", bg: "rgba(85,245,178,0.14)" },
  whale: { Icon: Waves, color: Colors.cyan, bg: "rgba(98,208,255,0.14)" },
  alert: { Icon: Bell, color: "#FFB84C", bg: "rgba(255,184,76,0.16)" },
  system: { Icon: Sparkles, color: Colors.neon, bg: "rgba(156,215,255,0.16)" },
  dm_message: { Icon: MessageCircle, color: Colors.cyan, bg: "rgba(98,208,255,0.14)" },
  dm_reaction: { Icon: Heart, color: "#FF5D8F", bg: "rgba(255,93,143,0.14)" },
  launchpad_update: { Icon: Rocket, color: "#FFB84C", bg: "rgba(255,184,76,0.16)" },
  lobby_invite: { Icon: Zap, color: Colors.violet, bg: "rgba(91,141,239,0.16)" },
  lobby_event: { Icon: Zap, color: Colors.violet, bg: "rgba(91,141,239,0.16)" },
  moderation_update: { Icon: Sparkles, color: "#FFB84C", bg: "rgba(255,184,76,0.16)" },
  announcement: { Icon: Sparkles, color: Colors.mint, bg: "rgba(63,169,255,0.16)" },
};

function normalizeKind(raw: string): NotifKind {
  return Object.prototype.hasOwnProperty.call(KIND_META, raw) ? (raw as NotifKind) : "system";
}

function tap() {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

const DAY = 86_400_000;

function bucketOf(ts: number): "today" | "week" | "earlier" {
  const diff = Date.now() - ts;
  if (diff < DAY) return "today";
  if (diff < 7 * DAY) return "week";
  return "earlier";
}

function rowToNotif(row: NotifRow): Notif {
  return {
    id: `remote-${row.id}`,
    remoteId: row.id,
    kind: normalizeKind(row.kind),
    title: row.title ?? "Update",
    body: row.message ?? row.body ?? "",
    ts: new Date(row.created_at).getTime(),
    unread: !row.read_at,
    actor: row.actor_username ?? undefined,
    actorAvatar: row.actor_avatar_url ?? null,
    targetType: row.target_type,
    targetId: row.target_id,
  };
}

type Section = { key: string; title: string; data: Notif[] };

function groupBySection(items: Notif[]): Section[] {
  const today: Notif[] = [];
  const week: Notif[] = [];
  const earlier: Notif[] = [];
  for (const item of items) {
    const b = bucketOf(item.ts);
    if (b === "today") today.push(item);
    else if (b === "week") week.push(item);
    else earlier.push(item);
  }
  const out: Section[] = [];
  if (today.length) out.push({ key: "today", title: "Today", data: today });
  if (week.length) out.push({ key: "week", title: "This week", data: week });
  if (earlier.length) out.push({ key: "earlier", title: "Earlier", data: earlier });
  return out;
}

type FlatItem = { type: "header"; key: string; title: string } | { type: "row"; key: string; item: Notif };

function flatten(sections: Section[]): FlatItem[] {
  const out: FlatItem[] = [];
  for (const s of sections) {
    out.push({ type: "header", key: `h-${s.key}`, title: s.title });
    for (const it of s.data) out.push({ type: "row", key: it.remoteId ?? it.id, item: it });
  }
  return out;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remoteQ = useInfiniteQuery({
    queryKey: ["notifications", "page", userId ?? "guest"],
    enabled: !!userId && isAuthenticated,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("list_notifications_page", {
        p_before: pageParam,
        p_limit: PAGE_LIMIT,
        p_unread_only: false,
      });
      if (error) {
        console.log("[notifications] list failed", error.message);
        return [] as NotifRow[];
      }
      return (data ?? []) as NotifRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE_LIMIT ? last[last.length - 1].created_at : undefined),
    staleTime: 15_000,
  });

  const unreadCountQ = useQuery({
    queryKey: ["notifications", "unread-count", userId ?? "guest"],
    enabled: !!userId && isAuthenticated,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_unread_notification_count");
      if (error) return 0;
      const count = Number(Array.isArray(data) ? data[0] : data);
      return Number.isFinite(count) ? count : 0;
    },
    staleTime: 10_000,
    refetchInterval: 60_000,
  });

  const markReadMut = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: notificationId });
      if (error) throw error;
    },
    onSuccess: () => invalidateNotificationState(queryClient),
  });

  useEffect(() => {
    if (!userId) return;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        invalidateNotificationState(queryClient).catch(() => {});
      }, 350);
    };

    const channelName = `notifications-screen-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(channelName);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      scheduleRefresh,
    );
    channel.subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [queryClient, userId]);

  const remoteItems = useMemo(
    () => dedupeNotifications((remoteQ.data?.pages ?? []).flat().map(rowToNotif)),
    [remoteQ.data]
  );

  const items = useMemo(() => sortNotifications(remoteItems), [remoteItems]);

  const filtered = useMemo(() => {
    if (tab === "mentions") return items.filter((i) => i.kind === "mention" || i.kind === "comment");
    if (tab === "social") return items.filter((i) => ["like", "repost", "follow"].includes(i.kind));
    if (tab === "trades") return items.filter((i) => i.kind === "trade" || i.kind === "alert" || i.kind === "launchpad_update");
    if (tab === "whales") return items.filter((i) => i.kind === "whale");
    return items;
  }, [items, tab]);

  const sections = useMemo(() => groupBySection(filtered), [filtered]);
  const flatData = useMemo(() => flatten(sections), [sections]);

  const tabCounts = useMemo(() => {
    const counts: Record<Tab, number> = { all: 0, mentions: 0, social: 0, trades: 0, whales: 0 };
    for (const i of items) {
      const isUnread = i.unread && !readIds.has(i.id) && !(i.remoteId && readIds.has(i.remoteId));
      if (!isUnread) continue;
      counts.all += 1;
      if (i.kind === "mention" || i.kind === "comment") counts.mentions += 1;
      if (["like", "repost", "follow"].includes(i.kind)) counts.social += 1;
      if (i.kind === "trade" || i.kind === "alert" || i.kind === "launchpad_update") counts.trades += 1;
      if (i.kind === "whale") counts.whales += 1;
    }
    return counts;
  }, [items, readIds]);

  const unreadCount = useMemo(() => {
    const local = countUnreadNotifications(items, readIds);
    return typeof unreadCountQ.data === "number" && unreadCountQ.data > 0 ? Math.max(unreadCountQ.data, local) : local;
  }, [items, readIds, unreadCountQ.data]);

  const markLocalRead = useCallback((n: Notif) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(n.id);
      if (n.remoteId) next.add(n.remoteId);
      return next;
    });
  }, []);

  const onMarkAllRead = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setReadIds(new Set(items.flatMap((i) => [i.id, i.remoteId].filter(Boolean) as string[])));
    items.forEach((i) => {
      if (i.remoteId && i.unread) markReadMut.mutate(i.remoteId);
    });
  }, [items, markReadMut]);

  const onTap = useCallback(
    (n: Notif) => {
      tap();
      markLocalRead(n);
      if (n.remoteId && n.unread) markReadMut.mutate(n.remoteId);
      if ((n.kind === "follow" || n.kind === "mention" || n.kind === "like" || n.kind === "repost" || n.kind === "comment") && n.actor) {
        router.push({ pathname: "/u/[handle]", params: { handle: n.actor.replace(/^@/, "") } });
      } else if ((n.kind === "dm_message" || n.kind === "dm_reaction") && n.targetId) {
        router.push({ pathname: "/dm/[id]", params: { id: n.targetId } });
      } else if ((n.kind === "lobby_invite" || n.kind === "lobby_event") && n.targetId) {
        router.push({ pathname: "/space/[id]", params: { id: n.targetId } });
      } else if (n.kind === "launchpad_update" && n.targetId) {
        router.push({ pathname: "/launch/[id]", params: { id: n.targetId } });
      } else if (n.kind === "whale" || n.kind === "trade" || n.kind === "alert") {
        router.push("/(tabs)/discover");
      }
    },
    [markLocalRead, markReadMut, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: FlatItem }) => {
      if (item.type === "header") return <SectionHeader title={item.title} />;
      const n = item.item;
      const isUnread = n.unread && !(readIds.has(n.id) || (n.remoteId ? readIds.has(n.remoteId) : false));
      return <NotifRow item={n} unread={isUnread} onPress={() => onTap(n)} />;
    },
    [onTap, readIds]
  );

  return (
    <View style={styles.root} testID="notifications-screen">
      <AppBackground variant="social" />
      <Stack.Screen options={{ headerShown: false, animation: "slide_from_right" }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => navigateBack(router, "/(tabs)/home")} style={styles.iconBtn} testID="notif-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Notifications</Text>
            {unreadCount > 0 ? (
              <View style={styles.unreadPill}>
                <View style={styles.unreadDot} />
                <Text style={styles.unreadText}>{unreadCount} new</Text>
              </View>
            ) : (
              <Text style={styles.titleSub}>All caught up</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                tap();
                router.push("/(tabs)/settings");
              }}
              style={styles.iconBtn}
              testID="notif-settings"
            >
              <Settings color={Colors.muted} size={17} strokeWidth={2.4} />
            </Pressable>
            <Pressable onPress={onMarkAllRead} style={styles.iconBtn} disabled={unreadCount === 0} testID="mark-all-read">
              <CheckCheck color={unreadCount > 0 ? Colors.mint : Colors.muted2} size={18} strokeWidth={2.4} />
            </Pressable>
          </View>
        </View>

        <View style={styles.tabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {TABS.map((t) => {
              const active = tab === t.id;
              const count = tabCounts[t.id];
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    tap();
                    setTab(t.id);
                  }}
                  style={[styles.tab, active && styles.tabActive]}
                  testID={`tab-${t.id}`}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                  {count > 0 ? (
                    <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                      <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count > 99 ? "99+" : count}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <FlatList
          data={flatData}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            remoteQ.isLoading ? (
              <ActivityIndicator color={Colors.mint} style={{ marginTop: 80 }} />
            ) : (
              <EmptyState tab={tab} />
            )
          }
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (remoteQ.hasNextPage && !remoteQ.isFetchingNextPage) remoteQ.fetchNextPage().catch(() => {});
          }}
          onEndReachedThreshold={0.4}
          refreshing={remoteQ.isRefetching}
          onRefresh={() => invalidateNotificationState(queryClient).catch(() => {})}
        />
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  );
}

function NotifRow({ item, unread, onPress }: { item: Notif; unread: boolean; onPress: () => void }) {
  const meta = KIND_META[item.kind];
  const [pressed, setPressed] = useState<boolean>(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.row, unread && styles.rowUnread, pressed && styles.rowPressed]}
      testID={`notif-${item.id}`}
    >
      {unread ? <View style={[styles.unreadStripe, { backgroundColor: meta.color }]} /> : null}
      <View style={styles.avatarWrap}>
        {item.actorAvatar ? (
          <Image source={{ uri: item.actorAvatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: meta.bg, alignItems: "center", justifyContent: "center" }]}>
            <meta.Icon color={meta.color} size={16} strokeWidth={2.4} />
          </View>
        )}
        {item.actorAvatar ? (
          <View style={[styles.kindBadge, { backgroundColor: meta.color }]}>
            <meta.Icon color={Colors.ink} size={9} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.bodyTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.rowTime}>{timeAgo(item.ts)}</Text>
        </View>
        {item.body ? (
          <Text style={styles.rowBody} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
      </View>
      {unread ? <View style={[styles.unreadDotTrail, { backgroundColor: meta.color }]} /> : null}
    </Pressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const meta = {
    all: { Icon: Bell, title: "You're all caught up", body: "Likes, mentions, alerts, and whale moves all land here." },
    mentions: { Icon: AtSign, title: "No mentions yet", body: "When someone @s you or replies, it shows up here." },
    social: { Icon: Heart, title: "No social activity", body: "Likes, reposts, and new followers will appear here." },
    trades: { Icon: TrendingUp, title: "No trade alerts", body: "Price alerts and launchpad events will land here." },
    whales: { Icon: Waves, title: "No whale moves", body: "Whale activity on tracked tokens will surface here." },
  } as const;
  const { Icon, title, body } = meta[tab];
  return (
    <View style={styles.empty} testID="notif-empty">
      <View style={styles.emptyIconWrap}>
        <Icon color={Colors.mint} size={28} strokeWidth={2.2} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      <View style={styles.emptyHint}>
        <BellOff color={Colors.muted2} size={12} strokeWidth={2.4} />
        <Text style={styles.emptyHintText}>Pull down to refresh</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  header: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerCenter: { alignItems: "center", gap: 4 },
  headerActions: { flexDirection: "row", gap: 8 },
  title: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  titleSub: { color: Colors.muted2, fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  unreadPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(63,169,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.36)",
  },
  unreadDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.mint },
  unreadText: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabsWrap: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", marginBottom: 4 },
  tabsRow: { paddingHorizontal: 12, gap: 6, paddingBottom: 10 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  tabText: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: Colors.ink, fontWeight: "900" },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "rgba(63,169,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeActive: { backgroundColor: "rgba(0,0,0,0.2)" },
  tabBadgeText: { color: Colors.mint, fontSize: 10, fontWeight: "900" },
  tabBadgeTextActive: { color: Colors.ink },
  listContent: { paddingTop: 4, paddingBottom: 80, flexGrow: 1 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionHeaderText: { color: Colors.muted2, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  sectionHeaderLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: "relative",
    backgroundColor: "transparent",
  },
  rowUnread: { backgroundColor: "rgba(63,169,255,0.045)" },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  unreadStripe: { position: "absolute", left: 0, top: 16, bottom: 16, width: 3, borderRadius: 2 },
  avatarWrap: { width: 40, height: 40, position: "relative" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.card },
  kindBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  body: { flex: 1, gap: 4, paddingTop: 1 },
  bodyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowTitle: { color: Colors.text, fontSize: 14, fontWeight: "800", flex: 1, letterSpacing: -0.2 },
  rowTime: { color: Colors.muted2, fontSize: 11, fontWeight: "700" },
  rowBody: { color: Colors.muted, fontSize: 12.5, fontWeight: "500", lineHeight: 17 },
  unreadDotTrail: { width: 7, height: 7, borderRadius: 4, marginTop: 8, marginLeft: 4 },
  empty: { paddingTop: 80, alignItems: "center", paddingHorizontal: 32, gap: 10 },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(63,169,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", marginTop: 8, letterSpacing: -0.3 },
  emptyBody: { color: Colors.muted, fontSize: 13, fontWeight: "600", textAlign: "center", lineHeight: 19 },
  emptyHint: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  emptyHintText: { color: Colors.muted2, fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
});
