import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  BookmarkMinus,
  Heart,
  HeartOff,
  MessageCircle,
  Quote,
  Repeat2,
  Search,
  Sparkles,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import {
  listMyBookmarkedPosts,
  listMyLikedPosts,
  listMyQuotedPosts,
  removeBookmark,
  removeLike,
  removeQuote,
  type BookmarkedPost,
} from "@/lib/api/bookmarks";
import { hapticSelect } from "@/lib/haptics";
import { navigateBack } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";

type Tab = "bookmarks" | "quotes" | "likes";
type Filter = "all" | "media" | "tickers";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "media", label: "Media" },
  { id: "tickers", label: "Tickers" },
];

const TABS: { id: Tab; label: string; Icon: typeof Bookmark }[] = [
  { id: "bookmarks", label: "Bookmarks", Icon: Bookmark },
  { id: "quotes", label: "Quotes", Icon: Quote },
  { id: "likes", label: "Likes", Icon: Heart },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

function fmtCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

export default function BookmarksScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("bookmarks");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState<string>("");

  const bookmarksQuery = useQuery<BookmarkedPost[]>({
    queryKey: ["bookmarks", "mine"],
    queryFn: () => listMyBookmarkedPosts(),
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  const quotesQuery = useQuery<BookmarkedPost[]>({
    queryKey: ["bookmarks", "quotes"],
    queryFn: () => listMyQuotedPosts(),
    enabled: isAuthenticated && tab === "quotes",
    staleTime: 15_000,
  });

  const likesQuery = useQuery<BookmarkedPost[]>({
    queryKey: ["bookmarks", "likes"],
    queryFn: () => listMyLikedPosts(),
    enabled: isAuthenticated && tab === "likes",
    staleTime: 15_000,
  });

  const query =
    tab === "bookmarks" ? bookmarksQuery : tab === "quotes" ? quotesQuery : likesQuery;
  const queryKey: [string, string] =
    tab === "bookmarks"
      ? ["bookmarks", "mine"]
      : tab === "quotes"
      ? ["bookmarks", "quotes"]
      : ["bookmarks", "likes"];

  const items = query.data ?? [];

  const filtered = useMemo<BookmarkedPost[]>(() => {
    const q = search.trim().toLowerCase();
    return items.filter((p) => {
      if (filter === "media" && !p.imageUrl) return false;
      if (filter === "tickers" && !p.ticker) return false;
      if (q.length === 0) return true;
      return (
        p.content.toLowerCase().includes(q) ||
        (p.ticker ?? "").toLowerCase().includes(q) ||
        (p.authorDisplayName ?? "").toLowerCase().includes(q) ||
        (p.authorUsername ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const remove = useMutation({
    mutationFn: async (postId: string) => {
      if (tab === "bookmarks") await removeBookmark(postId);
      else if (tab === "likes") await removeLike(postId);
      else await removeQuote(postId);
    },
    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<BookmarkedPost[]>(queryKey);
      qc.setQueryData<BookmarkedPost[]>(queryKey, (curr) =>
        (curr ?? []).filter((p) => p.id !== postId),
      );
      return { prev };
    },
    onError: (e: unknown, _postId, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      Alert.alert("Couldn't remove", e instanceof Error ? e.message : "Try again.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social"] }).catch(() => {});
    },
  });

  const openPost = (p: BookmarkedPost) => {
    hapticSelect();
    router.push({ pathname: "/post/[id]", params: { id: p.id } });
  };

  const askRemove = (p: BookmarkedPost) => {
    const title =
      tab === "bookmarks"
        ? "Remove bookmark?"
        : tab === "likes"
        ? "Remove like?"
        : "Remove quote?";
    const body =
      tab === "bookmarks"
        ? "You can bookmark it again later."
        : tab === "likes"
        ? "You can like it again later."
        : "This will undo your quoted repost.";
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove.mutate(p.id) },
    ]);
  };

  const eyebrowText =
    tab === "bookmarks" ? "SAVED FOR LATER" : tab === "quotes" ? "YOUR REMIXES" : "YOUR HEARTS";
  const titleText = tab === "bookmarks" ? "Bookmarks" : tab === "quotes" ? "Quotes" : "Likes";
  const HeaderIcon = tab === "bookmarks" ? Bookmark : tab === "quotes" ? Quote : Heart;
  const emptyTitle =
    search.trim().length > 0 || filter !== "all"
      ? "No matches"
      : tab === "bookmarks"
      ? "No bookmarks yet"
      : tab === "quotes"
      ? "No quoted posts yet"
      : "No liked posts yet";
  const emptyBody =
    search.trim().length > 0 || filter !== "all"
      ? "Try clearing the filter or search."
      : tab === "bookmarks"
      ? "Tap the bookmark icon on any post to save it here."
      : tab === "quotes"
      ? "Add your take when you repost something."
      : "Double-tap or hit the heart on any post.";

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.nav}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/home")}
            style={styles.iconBtn}
            testID="bookmarks-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>{eyebrowText}</Text>
            </View>
            <Text style={styles.title}>{titleText}</Text>
          </View>
          <View style={styles.countPill}>
            <HeaderIcon color={Colors.goldBright} size={12} strokeWidth={2.8} />
            <Text style={styles.countText}>{items.length}</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          {TABS.map((t) => {
            const active = tab === t.id;
            const TabIcon = t.Icon;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  hapticSelect();
                  setTab(t.id);
                }}
                style={[styles.tabChip, active && styles.tabChipActive]}
                testID={`bookmark-tab-${t.id}`}
              >
                <TabIcon
                  color={active ? Colors.goldBright : Colors.muted}
                  size={14}
                  strokeWidth={2.6}
                  fill={active && t.id === "likes" ? Colors.goldBright : "transparent"}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchWrap}>
          <Search color={Colors.muted} size={14} strokeWidth={2.4} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search saved posts"
            placeholderTextColor={Colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            testID="bookmarks-search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <X color={Colors.muted} size={14} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  hapticSelect();
                  setFilter(f.id);
                }}
                style={[styles.filterChip, active && styles.filterChipActive]}
                testID={`bookmark-filter-${f.id}`}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {!isAuthenticated ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <HeaderIcon color={Colors.goldBright} size={28} strokeWidth={2.2} />
            </View>
            <Text style={styles.emptyTitle}>Sign in to view your library</Text>
            <Text style={styles.emptyBody}>
              Save, quote and like posts to keep them at your fingertips.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            refreshControl={
              <RefreshControl
                refreshing={query.isFetching && !query.isLoading}
                onRefresh={() => query.refetch()}
                tintColor={Colors.muted}
              />
            }
            ListEmptyComponent={
              query.isLoading ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyBody}>Loading…</Text>
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyIcon}>
                    <HeaderIcon color={Colors.goldBright} size={28} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                  <Text style={styles.emptyBody}>{emptyBody}</Text>
                </View>
              )
            }
            renderItem={({ item }) => (
              <BookmarkCard
                post={item}
                tab={tab}
                onPress={() => openPost(item)}
                onRemove={() => askRemove(item)}
              />
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

interface BookmarkCardProps {
  post: BookmarkedPost;
  tab: Tab;
  onPress: () => void;
  onRemove: () => void;
}

function BookmarkCard({ post, tab, onPress, onRemove }: BookmarkCardProps) {
  const initial = (post.authorDisplayName ?? post.authorUsername ?? "?").slice(0, 1).toUpperCase();
  const handle = post.authorUsername ? `@${post.authorUsername}` : "";
  const savedLabel =
    tab === "bookmarks" ? "Saved" : tab === "quotes" ? "Quoted" : "Liked";
  const RemoveIcon = tab === "bookmarks" ? BookmarkMinus : tab === "likes" ? HeartOff : X;

  return (
    <Pressable onPress={onPress} style={styles.card} testID={`bookmark-${post.id}`}>
      <View style={styles.cardHead}>
        <View style={[styles.avatar, { backgroundColor: post.authorAvatarColor ?? Colors.mint }]}>
          {post.authorAvatarUrl ? (
            <ExpoImage source={{ uri: post.authorAvatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarInit}>{initial}</Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text style={styles.authorName} numberOfLines={1}>
              {post.authorDisplayName ?? post.authorUsername ?? "Someone"}
            </Text>
            {post.authorVerified ? (
              <BadgeCheck color={Colors.mint} size={13} strokeWidth={2.6} />
            ) : null}
            {handle ? (
              <Text style={styles.authorHandle} numberOfLines={1}>
                {handle}
              </Text>
            ) : null}
            <Text style={styles.dot}>·</Text>
            <Text style={styles.timeText}>{timeAgo(post.createdAt)}</Text>
          </View>
          <Text style={styles.savedAt}>{savedLabel} {timeAgo(post.bookmarkedAt)} ago</Text>
        </View>
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          style={styles.removeBtn}
          testID={`bookmark-remove-${post.id}`}
        >
          <RemoveIcon color={Colors.goldBright} size={16} strokeWidth={2.5} />
        </Pressable>
      </View>

      {tab === "quotes" && post.quoteText ? (
        <View style={styles.quoteWrap}>
          <Quote color={Colors.goldBright} size={12} strokeWidth={2.6} />
          <Text style={styles.quoteText} numberOfLines={4}>
            {post.quoteText}
          </Text>
        </View>
      ) : null}

      {post.content.length > 0 ? (
        <Text style={styles.body} numberOfLines={6}>
          {post.content}
        </Text>
      ) : null}

      {post.imageUrl ? (
        <View style={styles.mediaWrap}>
          <ExpoImage source={{ uri: post.imageUrl }} style={styles.media} contentFit="cover" />
        </View>
      ) : null}

      {post.ticker ? (
        <LinearGradient
          colors={["rgba(244,198,91,0.18)", "rgba(244,198,91,0.04)"]}
          style={styles.tickerPill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.tickerText}>{post.ticker}</Text>
          {post.changePct != null ? (
            <Text
              style={[
                styles.changeText,
                { color: post.changePct >= 0 ? Colors.mint : Colors.rose },
              ]}
            >
              {post.changePct >= 0 ? "+" : ""}
              {post.changePct.toFixed(2)}%
            </Text>
          ) : null}
        </LinearGradient>
      ) : null}

      <View style={styles.footRow}>
        <View style={styles.foot}>
          <MessageCircle color={Colors.muted} size={13} strokeWidth={2.5} />
          <Text style={styles.footText}>{fmtCount(post.comments)}</Text>
        </View>
        <View style={styles.foot}>
          <Repeat2 color={Colors.muted} size={13} strokeWidth={2.5} />
          <Text style={styles.footText}>{fmtCount(post.reposts)}</Text>
        </View>
        <View style={styles.foot}>
          <Heart color={Colors.muted} size={13} strokeWidth={2.5} />
          <Text style={styles.footText}>{fmtCount(post.likes)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 24, fontWeight: "900", marginTop: 2 },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(244,198,91,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.24)",
  },
  countText: { color: Colors.goldBright, fontSize: 12, fontWeight: "900" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 0,
  },

  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  tabChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabChipActive: {
    backgroundColor: "rgba(244,198,91,0.14)",
    borderColor: "rgba(244,198,91,0.4)",
  },
  tabText: { color: Colors.muted, fontSize: 13, fontWeight: "800" },
  tabTextActive: { color: Colors.goldBright },
  quoteWrap: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(244,198,91,0.08)",
    borderLeftWidth: 2,
    borderLeftColor: "rgba(244,198,91,0.6)",
  },
  quoteText: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: {
    backgroundColor: "rgba(244,198,91,0.16)",
    borderColor: "rgba(244,198,91,0.4)",
  },
  filterText: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: Colors.goldBright },

  list: { paddingHorizontal: 16, paddingBottom: 140, paddingTop: 4 },
  sep: { height: 10 },

  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInit: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "nowrap" },
  authorName: { color: Colors.text, fontSize: 14, fontWeight: "800", maxWidth: 140 },
  authorHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", maxWidth: 110 },
  dot: { color: Colors.muted, fontSize: 12 },
  timeText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  savedAt: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(244,198,91,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  body: { color: Colors.text, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  mediaWrap: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.4)",
    aspectRatio: 16 / 10,
  },
  media: { width: "100%", height: "100%" },

  tickerPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tickerText: { color: Colors.goldBright, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  changeText: { fontSize: 12, fontWeight: "900" },

  footRow: { flexDirection: "row", gap: 20, marginTop: 2 },
  foot: { flexDirection: "row", alignItems: "center", gap: 5 },
  footText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

  emptyWrap: {
    paddingTop: 60,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(244,198,91,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 19,
  },
});
