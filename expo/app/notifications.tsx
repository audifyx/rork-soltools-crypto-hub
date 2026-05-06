import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AtSign,
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  Repeat2,
  Rocket,
  Settings,
  Sparkles,
  TrendingUp,
  UserPlus,
  Waves,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  ListRenderItem,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import AppBackground from "@/components/ui/AppBackground";
import { navigateBack } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { useApp } from "@/providers/app-provider";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

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

type Notif = {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  ts: number;
  unread: boolean;
  actor?: string;
  symbol?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  targetType?: string | null;
  targetId?: string | null;
  remoteId?: string;
};

interface NotifRow {
  id: string;
  kind: string;
  title: string | null;
  message: string | null;
  body: string | null;
  created_at: string;
  read_at: string | null;
  priority: string | null;
  actor_id: string | null;
  actor_username: string | null;
  target_type: string | null;
  target_id: string | null;
}

function normalizeKind(raw: string): NotifKind {
  const valid: NotifKind[] = [
    "like",
    "repost",
    "comment",
    "mention",
    "follow",
    "trade",
    "whale",
    "alert",
    "system",
    "dm_message",
    "dm_reaction",
    "launchpad_update",
    "lobby_invite",
    "lobby_event",
    "moderation_update",
    "announcement",
  ];
  return (valid.includes(raw as NotifKind) ? (raw as NotifKind) : "system");
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mentions", label: "Mentions" },
  { id: "social", label: "Social" },
  { id: "trades", label: "Trades" },
  { id: "whales", label: "Whales" },
];

function tap() {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

const KIND_META: Record<NotifKind, { Icon: LucideIcon; color: string; bg: string }> = {
  like: { Icon: Heart, color: Colors.rose, bg: "rgba(255,93,143,0.16)" },
  repost: { Icon: Repeat2, color: Colors.mint, bg: "rgba(85,245,178,0.16)" },
  comment: { Icon: MessageCircle, color: Colors.cyan, bg: "rgba(56,215,255,0.16)" },
  mention: { Icon: AtSign, color: Colors.cyan, bg: "rgba(56,215,255,0.16)" },
  follow: { Icon: UserPlus, color: Colors.violet, bg: "rgba(184,140,255,0.16)" },
  trade: { Icon: TrendingUp, color: Colors.mint, bg: "rgba(85,245,178,0.16)" },
  whale: { Icon: Waves, color: Colors.cyan, bg: "rgba(56,215,255,0.16)" },
  alert: { Icon: Bell, color: Colors.orange, bg: "rgba(255,184,76,0.16)" },
  system: { Icon: Sparkles, color: Colors.mint, bg: "rgba(85,245,178,0.16)" },
  dm_message: { Icon: MessageCircle, color: Colors.cyan, bg: "rgba(56,215,255,0.16)" },
  dm_reaction: { Icon: Heart, color: Colors.rose, bg: "rgba(255,93,143,0.16)" },
  launchpad_update: { Icon: Rocket, color: Colors.orange, bg: "rgba(255,184,76,0.16)" },
  lobby_invite: { Icon: Zap, color: Colors.violet, bg: "rgba(184,140,255,0.16)" },
  lobby_event: { Icon: Zap, color: Colors.violet, bg: "rgba(184,140,255,0.16)" },
  moderation_update: { Icon: Settings, color: Colors.orange, bg: "rgba(255,184,76,0.16)" },
  announcement: { Icon: Sparkles, color: Colors.mint, bg: "rgba(85,245,178,0.16)" },
};

const PRIORITY_TINT: Record<NonNullable<Notif["priority"]>, string | null> = {
  urgent: Colors.rose,
  high: Colors.goldBright,
  normal: null,
  low: null,
};

const PAGE_LIMIT = 30;

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const { alerts, watchlist, posts } = useApp();
  const [tab, setTab] = useState<Tab>("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

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
        console.log("[notifications] list_notifications_page failed", error.message);
        return [] as NotifRow[];
      }
      return (data ?? []) as NotifRow[];
    },
    getNextPageParam: (last) =>
      last && last.length === PAGE_LIMIT ? last[last.length - 1].created_at : undefined,
    staleTime: 15_000,
  });

  const unreadCountQ = useQuery({
    queryKey: ["notifications", "unread-count", userId ?? "guest"],
    enabled: !!userId && isAuthenticated,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_unread_notification_count");
      if (error) {
        console.log("[notifications] unread count failed", error.message);
        return 0;
      }
      const n = Number(Array.isArray(data) ? data[0] : data);
      return Number.isFinite(n) ? n : 0;
    },
    staleTime: 10_000,
    refetchInterval: 60_000,
  });

  const markReadMut = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc("mark_notification_read", {
        p_notification_id: notificationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] }).catch(() => {});
    },
  });

  const remoteRows = useMemo<NotifRow[]>(() => {
    return (remoteQ.data?.pages ?? []).flat();
  }, [remoteQ.data]);

  // Subscribe to realtime inserts and patch the cached page list.
  React.useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications"] }).catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [queryClient, userId]);

  const whalesQ = useQuery({
    queryKey: ["notifications", "whales"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("whale_events")
          .select("id,wallet_address,symbol,side,amount_usd,created_at")
          .order("created_at", { ascending: false })
          .limit(15);
        if (error) throw error;
        return data ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const followersQ = useQuery({
    queryKey: ["notifications", "followers", userId ?? "guest"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [] as { follower_id: string; created_at: string; username: string | null; display_name: string | null }[];
      try {
        const { data, error } = await supabase
          .from("followers")
          .select("follower_id,created_at")
          .eq("followee_id", userId)
          .order("created_at", { ascending: false })
          .limit(15);
        if (error) throw error;
        const rows = (data ?? []) as { follower_id: string; created_at: string }[];
        if (rows.length === 0) return [];
        const ids = Array.from(new Set(rows.map((r) => r.follower_id)));
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id,username,display_name")
          .in("user_id", ids);
        const profileMap = new Map<string, { username: string | null; display_name: string | null }>();
        ((profiles ?? []) as { user_id: string; username: string | null; display_name: string | null }[]).forEach((p) =>
          profileMap.set(p.user_id, { username: p.username, display_name: p.display_name }),
        );
        return rows.map((r) => ({
          ...r,
          username: profileMap.get(r.follower_id)?.username ?? null,
          display_name: profileMap.get(r.follower_id)?.display_name ?? null,
        }));
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const items: Notif[] = useMemo(() => {
    const list: Notif[] = [];

    remoteRows.forEach((r) => {
      const kind = normalizeKind(r.kind);
      list.push({
        id: `remote-${r.id}`,
        remoteId: r.id,
        kind,
        title: r.title ?? "Update",
        body: r.message ?? r.body ?? "",
        ts: new Date(r.created_at).getTime(),
        unread: !r.read_at,
        actor: r.actor_username ?? undefined,
        priority:
          r.priority === "urgent" || r.priority === "high" || r.priority === "low" || r.priority === "normal"
            ? r.priority
            : "normal",
        targetType: r.target_type,
        targetId: r.target_id,
      });
    });

    (followersQ.data ?? []).forEach((f, i) => {
      const display = f.display_name ?? f.username ?? `${f.follower_id.slice(0, 6)}…`;
      const handle = f.username ? `@${f.username.replace(/^@/, "")}` : "";
      list.push({
        id: `follow-${f.follower_id}-${i}`,
        kind: "follow",
        title: "New follower",
        body: `${display}${handle ? ` (${handle})` : ""} started following you`,
        ts: new Date(f.created_at as string).getTime(),
        unread: true,
        actor: f.username ?? undefined,
      });
    });

    (whalesQ.data ?? []).forEach((w) => {
      const usd = Number(w.amount_usd ?? 0);
      const side = (w.side as string)?.toUpperCase();
      list.push({
        id: `whale-${w.id}`,
        kind: "whale",
        title: `${side} · $${(w.symbol as string) ?? "?"}`,
        body: `Whale ${(w.wallet_address as string)?.slice(0, 4)}…${(w.wallet_address as string)?.slice(-4)} moved ${formatUsd(usd)}`,
        ts: new Date(w.created_at as string).getTime(),
        unread: true,
        symbol: (w.symbol as string) ?? undefined,
      });
    });

    alerts.forEach((a) => {
      list.push({
        id: `alert-${a.id}`,
        kind: "alert",
        title: `Alert · $${a.ticker}`,
        body: `${a.type.replace("-", " ")} target ${a.value}`,
        ts: a.createdAt,
        unread: a.enabled,
      });
    });

    posts.forEach((p) => {
      if (p.likes > 0) {
        list.push({
          id: `like-${p.id}`,
          kind: "like",
          title: `${p.likes} like${p.likes === 1 ? "" : "s"}`,
          body: p.text.slice(0, 70) || "Your post",
          ts: p.createdAt,
          unread: false,
        });
      }
      if (p.reposts > 0) {
        list.push({
          id: `repost-${p.id}`,
          kind: "repost",
          title: `${p.reposts} repost${p.reposts === 1 ? "" : "s"}`,
          body: p.text.slice(0, 70) || "Your post",
          ts: p.createdAt,
          unread: false,
        });
      }
    });

    watchlist.slice(0, 5).forEach((w) => {
      list.push({
        id: `move-${w.id}`,
        kind: "trade",
        title: `$${w.ticker} moved`,
        body: "Watchlist token had significant activity",
        ts: w.addedAt,
        unread: false,
      });
    });

    if (list.length === 0 && isAuthenticated) {
      list.push({
        id: "welcome",
        kind: "system",
        title: "Welcome to SolTools",
        body: "We'll notify you about likes, mentions, whale moves, alerts, and follows.",
        ts: Date.now(),
        unread: true,
      });
    }

    return list.sort((a, b) => b.ts - a.ts);
  }, [remoteRows, followersQ.data, whalesQ.data, alerts, posts, watchlist, isAuthenticated]);

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    if (tab === "mentions") return items.filter((i) => i.kind === "mention" || i.kind === "comment");
    if (tab === "social")
      return items.filter((i) => ["like", "repost", "follow"].includes(i.kind));
    if (tab === "trades") return items.filter((i) => i.kind === "trade" || i.kind === "alert");
    if (tab === "whales") return items.filter((i) => i.kind === "whale");
    return items;
  }, [items, tab]);

  const unreadCount = useMemo(() => {
    if (typeof unreadCountQ.data === "number" && unreadCountQ.data > 0) return unreadCountQ.data;
    return items.filter((i) => i.unread && !readIds.has(i.id)).length;
  }, [unreadCountQ.data, items, readIds]);

  const onMarkAllRead = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const allIds = items.map((i) => i.id);
    setReadIds(new Set(allIds));
    items.forEach((i) => {
      if (i.remoteId && i.unread) {
        markReadMut.mutate(i.remoteId);
      }
    });
  }, [items, markReadMut]);

  const onTap = useCallback(
    (n: Notif) => {
      tap();
      setReadIds((prev) => {
        const next = new Set(prev);
        next.add(n.id);
        return next;
      });
      if (n.remoteId && n.unread) {
        markReadMut.mutate(n.remoteId);
      }
      if (n.kind === "follow") {
        if (n.actor) {
          router.push({ pathname: "/u/[handle]", params: { handle: n.actor.replace(/^@/, "") } });
        } else {
          router.push("/(tabs)/users");
        }
      } else if (n.kind === "dm_message" || n.kind === "dm_reaction") {
        if (n.targetId) router.push({ pathname: "/dm/[id]", params: { id: n.targetId } });
        else router.push("/messages");
      } else if (n.kind === "lobby_invite" || n.kind === "lobby_event") {
        if (n.targetId) router.push({ pathname: "/space/[id]", params: { id: n.targetId } });
        else router.push("/spaces");
      } else if (n.kind === "launchpad_update") {
        if (n.targetId) router.push({ pathname: "/launch/[id]", params: { id: n.targetId } });
      } else if (n.kind === "whale" || n.kind === "trade" || n.kind === "alert") {
        router.push("/(tabs)/discover");
      }
    },
    [router, markReadMut],
  );

  const renderItem: ListRenderItem<Notif> = useCallback(
    ({ item }) => {
      const isUnread = item.unread && !readIds.has(item.id);
      return <NotifRow item={item} unread={isUnread} onPress={() => onTap(item)} />;
    },
    [onTap, readIds],
  );

  return (
    <View style={styles.root} testID="notifications-screen">
      <AppBackground variant="social" />
      <Stack.Screen options={{ headerShown: false, animation: "slide_from_right" }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/home")}
            style={styles.iconBtn}
            hitSlop={8}
            testID="notif-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Notifications</Text>
            {unreadCount > 0 ? (
              <View style={styles.unreadPill}>
                <View style={styles.unreadDot} />
                <Text style={styles.unreadText}>{unreadCount} new</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={onMarkAllRead}
            style={styles.iconBtn}
            hitSlop={8}
            testID="mark-all-read"
            disabled={unreadCount === 0}
          >
            <CheckCheck
              color={unreadCount > 0 ? Colors.mint : Colors.muted}
              size={18}
              strokeWidth={2.4}
            />
          </Pressable>
        </View>

        <View style={styles.tabsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {TABS.map((t) => {
              const active = tab === t.id;
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
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<EmptyState tab={tab} />}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (remoteQ.hasNextPage && !remoteQ.isFetchingNextPage) {
              remoteQ.fetchNextPage().catch(() => {});
            }
          }}
          onEndReachedThreshold={0.4}
          refreshing={remoteQ.isRefetching}
          onRefresh={() => {
            remoteQ.refetch().catch(() => {});
            unreadCountQ.refetch().catch(() => {});
          }}
        />
      </SafeAreaView>
    </View>
  );
}

function NotifRow({
  item,
  unread,
  onPress,
}: {
  item: Notif;
  unread: boolean;
  onPress: () => void;
}) {
  const meta = KIND_META[item.kind];
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, unread && styles.rowUnread]}
      testID={`notif-${item.id}`}
    >
      {unread ? <View style={[styles.unreadStripe, { backgroundColor: meta.color }]} /> : null}
      <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
        <meta.Icon color={meta.color} size={16} strokeWidth={2.4} />
      </View>
      <View style={styles.body}>
        <View style={styles.bodyTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.rowTime}>{timeAgo(item.ts)}</Text>
        </View>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <View style={styles.empty} testID="notif-empty">
      <LinearGradient
        colors={["rgba(85,245,178,0.16)", "rgba(56,215,255,0.04)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.emptyIcon}
      >
        <Bell color={Colors.mint} size={28} strokeWidth={2.2} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>You're all caught up</Text>
      <Text style={styles.emptyBody}>
        {tab === "whales"
          ? "Whale moves on tracked tokens will land here."
          : tab === "trades"
            ? "Price alerts and trade events will land here."
            : tab === "social"
              ? "Likes, reposts, and new followers will appear here."
              : tab === "mentions"
                ? "When someone mentions you, you'll see it here."
                : "Likes, mentions, follows, alerts, and whale moves all in one place."}
      </Text>
    </View>
  );
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCenter: { alignItems: "center", gap: 4 },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  unreadPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.32)",
  },
  unreadDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.mint },
  unreadText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
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
  tabsWrap: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    marginBottom: 4,
  },
  tabsRow: { paddingHorizontal: 12, gap: 6, paddingBottom: 10 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabActive: {
    backgroundColor: Colors.mint,
    borderColor: Colors.mint,
  },
  tabText: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: Colors.ink, fontWeight: "900" },
  listContent: { paddingVertical: 6, paddingBottom: 80, flexGrow: 1 },
  separator: { height: 1, backgroundColor: "rgba(255,255,255,0.04)", marginLeft: 64 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: "relative",
  },
  rowUnread: { backgroundColor: "rgba(85,245,178,0.04)" },
  unreadStripe: {
    position: "absolute",
    left: 0,
    top: 14,
    bottom: 14,
    width: 3,
    borderRadius: 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 4 },
  bodyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
    letterSpacing: -0.2,
  },
  rowTime: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  rowBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  empty: { paddingTop: 80, alignItems: "center", paddingHorizontal: 32, gap: 10 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.2)",
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: -0.3,
  },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 19,
  },
});
