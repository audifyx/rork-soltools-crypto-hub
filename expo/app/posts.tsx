import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Feather,
  Flame,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Repeat2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  ListRenderItem,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import AppBackground from "@/components/ui/AppBackground";
import { withDefaultAvatar } from "@/lib/brand-media";
import { navigateBack } from "@/lib/navigation";
import { loadBasicProfilesByAnyId } from "@/lib/profile-lookup";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { useApp } from "@/providers/app-provider";
import {
  type FeedSort,
  computeHotScore,
  rankPosts,
} from "@/lib/feed-algo";

interface FeedPost {
  id: string;
  userId: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string;
  authorAvatarColor: string;
  authorVerified: boolean;
  text: string;
  imageUrl?: string;
  ticker?: string;
  changePct?: number;
  createdAt: number;
  likes: number;
  reposts: number;
  comments: number;
  liked: boolean;
  isFollowing: boolean;
}

const TABS: { key: FeedSort; label: string; Icon: typeof Sparkles }[] = [
  { key: "for-you", label: "For You", Icon: Sparkles },
  { key: "latest", label: "Latest", Icon: Zap },
  { key: "top", label: "Top 24h", Icon: Flame },
  { key: "following", label: "Following", Icon: Heart },
  { key: "media", label: "Media", Icon: ImageIcon },
];

export default function PostsFeedScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const { profile } = useApp();
  const [sort, setSort] = useState<FeedSort>("for-you");

  type Row = {
    id: string;
    user_id: string;
    content: string | null;
    image_url: string | null;
    ticker: string | null;
    change_pct: number | null;
    likes_count: number | null;
    reposts_count: number | null;
    comments_count: number | null;
    created_at: string;
    author_username?: string | null;
    author_display_name?: string | null;
    author_avatar_url?: string | null;
    author_avatar_color?: string | null;
    author_verified?: boolean | null;
  };

  const feedQ = useQuery<FeedPost[]>({
    queryKey: ["posts-feed", userId ?? "guest"],
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("get_public_feed", { max_rows: 200 });
        let rows = (data ?? []) as Row[];
        if (error) {
          console.log("[posts] public feed rpc fallback", error.message);
          const fallback = await supabase
            .from("community_posts")
            .select(
              "id,user_id,content,image_url,ticker,change_pct,likes_count,reposts_count,comments_count,created_at",
            )
            .is("community_id", null)
            .is("parent_post_id", null)
            .order("created_at", { ascending: false })
            .limit(300);
          if (fallback.error) throw fallback.error;
          rows = (fallback.data ?? []) as Row[];
        }
        if (rows.length === 0) return [];

        let likedSet = new Set<string>();
        let followingSet = new Set<string>();
        if (isAuthenticated && userId) {
          const postIds = rows.map((r) => r.id);
          const [likesRes, followsRes] = await Promise.all([
            supabase
              .from("community_post_likes")
              .select("post_id")
              .eq("user_id", userId)
              .in("post_id", postIds),
            supabase.from("followers").select("followee_id").eq("follower_id", userId),
          ]);
          likedSet = new Set((likesRes.data ?? []).map((r) => r.post_id as string));
          followingSet = new Set(
            (followsRes.data ?? []).map((r) => r.followee_id as string),
          );
        }

        const missingAuthorIds = Array.from(
          new Set(
            rows
              .filter((r) => r.user_id && (!r.author_avatar_url || !r.author_username || !r.author_display_name))
              .map((r) => r.user_id),
          ),
        );
        const authorMap = await loadBasicProfilesByAnyId(missingAuthorIds);

        return rows.map((r): FeedPost => {
          const author = authorMap.get(r.user_id);
          return {
            id: r.id,
            userId: r.user_id,
            authorName: r.author_display_name || r.author_username || author?.display_name || author?.username || "Trader",
            authorHandle: r.author_username ? `@${r.author_username}` : author?.username ? `@${author.username}` : "",
            authorAvatarUrl: r.author_avatar_url ?? author?.avatar_url ?? undefined,
            authorAvatarColor: r.author_avatar_color ?? author?.avatar_color ?? Colors.mint,
            authorVerified: !!(r.author_verified ?? author?.verified),
            text: r.content ?? "",
            imageUrl: r.image_url ?? undefined,
            ticker: r.ticker ?? undefined,
            changePct: r.change_pct != null ? Number(r.change_pct) : undefined,
            createdAt: new Date(r.created_at).getTime(),
            likes: r.likes_count ?? 0,
            reposts: r.reposts_count ?? 0,
            comments: r.comments_count ?? 0,
            liked: likedSet.has(r.id),
            isFollowing: followingSet.has(r.user_id),
          };
        });
      } catch (e) {
        console.log("[posts] feed fetch failed", e);
        return [];
      }
    },
  });

  const all = feedQ.data ?? [];

  const ranked = useMemo(
    () =>
      rankPosts(
        all.map((p) => ({
          ...p,
          hasImage: !!p.imageUrl,
          hasTicker: !!p.ticker,
          isVerified: p.authorVerified,
        })),
        sort,
      ),
    [all, sort],
  );

  const onSelectTab = useCallback((next: FeedSort) => {
    Haptics.selectionAsync().catch(() => {});
    setSort(next);
  }, []);

  const onCompose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    router.push("/compose");
  }, [isAuthenticated, router]);

  const onLike = useCallback(
    async (postId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (!isAuthenticated || !userId) {
        Alert.alert("Sign in", "Sign in to like posts and sync your activity.", [
          { text: "Cancel", style: "cancel" },
          { text: "Sign in", onPress: () => router.push("/auth") },
        ]);
        return;
      }
      qc.setQueryData<FeedPost[]>(["posts-feed", userId], (prev) =>
        (prev ?? []).map((p) =>
          p.id === postId
            ? { ...p, liked: !p.liked, likes: Math.max(0, p.likes + (p.liked ? -1 : 1)) }
            : p,
        ),
      );
      try {
        const { data } = await supabase.rpc("toggle_post_like", { target_post_id: postId });
        const row = Array.isArray(data)
          ? (data[0] as { liked: boolean; likes_count: number } | undefined)
          : undefined;
        if (row) {
          qc.setQueryData<FeedPost[]>(["posts-feed", userId], (prev) =>
            (prev ?? []).map((p) =>
              p.id === postId
                ? { ...p, liked: !!row.liked, likes: Number(row.likes_count ?? p.likes) }
                : p,
            ),
          );
        }
      } catch (e) {
        console.log("[posts] like sync failed", e);
      }
    },
    [qc, userId, isAuthenticated, router],
  );

  const renderItem: ListRenderItem<FeedPost> = useCallback(
    ({ item, index }) => (
      <PostRow
        post={item}
        rank={index + 1}
        sort={sort}
        onLike={() => onLike(item.id)}
        onOpenAuthor={() => {
          if (item.authorHandle) {
            router.push({
              pathname: "/u/[handle]",
              params: { handle: item.authorHandle.replace(/^@/, "") },
            });
          }
        }}
        onOpenTicker={() => {
          if (item.ticker) {
            router.push({
              pathname: "/(tabs)/discover",
              params: { q: item.ticker.replace("$", "") },
            });
          }
        }}
      />
    ),
    [sort, onLike, router],
  );

  return (
    <View style={styles.root} testID="posts-screen">
      <AppBackground variant="feed" />
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <LinearGradient
          colors={["rgba(85,245,178,0.16)", "rgba(56,215,255,0.05)", "rgba(3,7,8,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGlow}
          pointerEvents="none"
        />
        <View style={styles.topBar}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigateBack(router, "/(tabs)/home")}
            hitSlop={8}
            testID="posts-back"
          >
            <ArrowLeft color={Colors.text} size={22} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>Crypto Community App feed</Text>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Posts</Text>
              <View style={styles.algoPill}>
                <Sparkles color={Colors.cyan} size={11} strokeWidth={3} />
                <Text style={styles.algoText}>ALGO</Text>
              </View>
            </View>
          </View>
          <Pressable
            style={styles.composeBtn}
            onPress={onCompose}
            hitSlop={8}
            testID="posts-compose"
          >
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.composeBtnGrad}
            >
              <Feather color={Colors.ink} size={20} strokeWidth={3} />
            </LinearGradient>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroller}
          contentContainerStyle={styles.tabsRow}
        >
          {TABS.map((t) => {
            const active = sort === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => onSelectTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
                testID={`posts-tab-${t.key}`}
              >
                {active ? (
                  <LinearGradient
                    colors={["rgba(85,245,178,0.96)", "rgba(56,215,255,0.9)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <t.Icon
                  color={active ? Colors.ink : Colors.muted}
                  size={15}
                  strokeWidth={2.7}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <FlatList
          data={ranked}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          ListHeaderComponent={
            <ComposeBar
              displayName={profile.displayName}
              avatarColor={profile.avatarColor}
              avatarUrl={profile.avatarUrl}
              onPress={onCompose}
              sort={sort}
              count={ranked.length}
            />
          }
          ListEmptyComponent={<EmptyState sort={sort} onCompose={onCompose} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={feedQ.isFetching}
              onRefresh={() => feedQ.refetch()}
              tintColor={Colors.mint}
            />
          }
          testID="posts-list"
        />
      </SafeAreaView>
    </View>
  );
}

function ComposeBar({
  displayName,
  avatarColor,
  avatarUrl,
  onPress,
  sort,
  count,
}: {
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  onPress: () => void;
  sort: FeedSort;
  count: number;
}) {
  const desc: Record<FeedSort, string> = {
    "for-you": "Ranked by heat, freshness, follows, charts, and signal quality.",
    latest: "Fresh drops in chronological order.",
    top: "The strongest posts from the last 24 hours.",
    following: "Only the traders and builders you follow.",
    media: "Charts, screenshots, memes, and visual alpha.",
  };
  const activeTab = TABS.find((t) => t.key === sort);
  const ActiveIcon = activeTab?.Icon ?? Sparkles;

  return (
    <View style={styles.headerStack}>
      <View style={styles.feedSummary}>
        <LinearGradient
          colors={["rgba(85,245,178,0.15)", "rgba(56,215,255,0.06)", "rgba(255,255,255,0.02)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.feedSummaryTop}>
          <View style={styles.feedSummaryIcon}>
            <ActiveIcon color={Colors.mint} size={17} strokeWidth={2.8} />
          </View>
          <View style={styles.feedSummaryCopy}>
            <Text style={styles.feedSummaryTitle}>{activeTab?.label ?? "For You"}</Text>
            <Text style={styles.feedSummaryBody}>{desc[sort]}</Text>
          </View>
          <View style={styles.feedSummaryCount}>
            <Text style={styles.feedSummaryCountValue}>{count}</Text>
            <Text style={styles.feedSummaryCountLabel}>posts</Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.composer} onPress={onPress} testID="composer-prompt">
        <View style={styles.composerAvatar}>
          <ExpoImage source={{ uri: withDefaultAvatar(avatarUrl) }} style={styles.fillImg} contentFit="cover" />
        </View>
        <View style={styles.composerCopy}>
          <Text style={styles.composerKicker}>Share a call</Text>
          <Text style={styles.composerHint}>Drop alpha, charts, or a hot take…</Text>
        </View>
        <View style={styles.composerCta}>
          <Feather color={Colors.ink} size={14} strokeWidth={3} />
        </View>
      </Pressable>
    </View>
  );
}

function PostRow({
  post,
  rank,
  sort,
  onLike,
  onOpenAuthor,
  onOpenTicker,
}: {
  post: FeedPost;
  rank: number;
  sort: FeedSort;
  onLike: () => void;
  onOpenAuthor: () => void;
  onOpenTicker: () => void;
}) {
  const time = useMemo(() => {
    const diff = Date.now() - post.createdAt;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }, [post.createdAt]);

  const score = useMemo(
    () =>
      computeHotScore({
        id: post.id,
        createdAt: post.createdAt,
        likes: post.likes,
        reposts: post.reposts,
        comments: post.comments,
        hasImage: !!post.imageUrl,
        hasTicker: !!post.ticker,
        isFollowing: post.isFollowing,
        isVerified: post.authorVerified,
      }),
    [post],
  );

  const showRank = sort === "for-you" || sort === "top";
  const positive = (post.changePct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;

  return (
    <View style={styles.post} testID={`post-${post.id}`}>
      {showRank ? (
        <View style={styles.rankCol}>
          <Text style={styles.rankNum}>#{rank}</Text>
          <Flame color={Colors.orange} size={10} strokeWidth={3} />
          <Text style={styles.rankScore}>{score < 1 ? score.toFixed(2) : score.toFixed(1)}</Text>
        </View>
      ) : null}

      <Pressable onPress={onOpenAuthor} hitSlop={4}>
        <View style={styles.avatar}>
          <ExpoImage
            source={{ uri: withDefaultAvatar(post.authorAvatarUrl) }}
            style={styles.fillImg}
            contentFit="cover"
          />
        </View>
      </Pressable>

      <View style={styles.body}>
        <Pressable onPress={onOpenAuthor} style={styles.headerRow} hitSlop={4}>
          <Text style={styles.name} numberOfLines={1}>
            {post.authorName}
          </Text>
          {post.authorVerified ? (
            <BadgeCheck color={Colors.cyan} size={13} strokeWidth={2.6} />
          ) : null}
          <Text style={styles.handle} numberOfLines={1}>
            {post.authorHandle}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.time}>{time}</Text>
          {post.isFollowing ? (
            <View style={styles.followingPill}>
              <Text style={styles.followingText}>FOLLOWING</Text>
            </View>
          ) : null}
        </Pressable>

        {post.text ? <Text style={styles.text}>{post.text}</Text> : null}

        {post.imageUrl ? (
          <View style={styles.imageWrap}>
            <ExpoImage source={{ uri: post.imageUrl }} style={styles.image} contentFit="cover" />
          </View>
        ) : null}

        {post.ticker ? (
          <Pressable
            style={[styles.embed, { borderColor: `${accent}55` }]}
            onPress={onOpenTicker}
            hitSlop={4}
          >
            <View style={[styles.embedDot, { backgroundColor: accent }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.embedTicker}>${post.ticker.replace("$", "")}</Text>
              <Text style={styles.embedSub}>Solana · tap to view chart</Text>
            </View>
            {post.changePct != null ? (
              <View
                style={[
                  styles.embedChange,
                  { backgroundColor: `${accent}1A`, borderColor: `${accent}55` },
                ]}
              >
                {positive ? (
                  <TrendingUp color={accent} size={11} strokeWidth={3} />
                ) : (
                  <TrendingDown color={accent} size={11} strokeWidth={3} />
                )}
                <Text style={[styles.embedChangeText, { color: accent }]}>
                  {positive ? "+" : ""}
                  {post.changePct.toFixed(1)}%
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <ActionItem
            icon={<MessageCircle color={Colors.muted} size={15} strokeWidth={2.2} />}
            label={fmt(post.comments)}
          />
          <ActionItem
            icon={<Repeat2 color={Colors.muted} size={16} strokeWidth={2.2} />}
            label={fmt(post.reposts)}
          />
          <Pressable style={styles.action} onPress={onLike} hitSlop={6}>
            <Heart
              color={post.liked ? Colors.rose : Colors.muted}
              size={15}
              strokeWidth={2.2}
              fill={post.liked ? Colors.rose : "transparent"}
            />
            <Text style={[styles.actionLabel, post.liked && { color: Colors.rose }]}>
              {fmt(post.likes)}
            </Text>
          </Pressable>
          <ActionItem
            icon={<Bookmark color={Colors.muted} size={14} strokeWidth={2.2} />}
            label=""
          />
        </View>
      </View>
    </View>
  );
}

function ActionItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.action}>
      {icon}
      {label ? <Text style={styles.actionLabel}>{label}</Text> : null}
    </View>
  );
}

function EmptyState({ sort, onCompose }: { sort: FeedSort; onCompose: () => void }) {
  const map: Record<FeedSort, { title: string; body: string }> = {
    "for-you": {
      title: "Algorithm warming up",
      body: "Drop the first post — the hot ranker needs signals to surface alpha.",
    },
    latest: { title: "No posts yet", body: "Be the first to share something fresh." },
    top: {
      title: "No top posts in 24h",
      body: "Engagement-heavy posts from the last day will surface here.",
    },
    following: {
      title: "Follow some traders",
      body: "Follow profiles to see their posts here in real time.",
    },
    media: {
      title: "No media posts yet",
      body: "Charts, screenshots and visuals will appear here.",
    },
  };
  const c = map[sort];
  return (
    <View style={styles.empty} testID="posts-empty">
      <View style={styles.emptyIcon}>
        <Sparkles color={Colors.mint} size={24} strokeWidth={2.4} />
      </View>
      <Text style={styles.emptyTitle}>{c.title}</Text>
      <Text style={styles.emptyBody}>{c.body}</Text>
      <Pressable onPress={onCompose} style={styles.emptyBtn}>
        <LinearGradient
          colors={[Colors.mint, Colors.cyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyBtnGrad}
        >
          <Feather color={Colors.ink} size={14} strokeWidth={3} />
          <Text style={styles.emptyBtnText}>Create post</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  headerGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 190,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  composeBtn: {
    width: 48,
    height: 48,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: Colors.mint,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  composeBtnGrad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { alignItems: "center", gap: 3 },
  eyebrow: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  algoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.34)",
  },
  algoText: {
    color: Colors.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  tabsScroller: {
    flexGrow: 0,
    flexShrink: 0,
    height: 54,
    maxHeight: 54,
  },
  tabsRow: {
    paddingHorizontal: 14,
    paddingTop: 5,
    paddingBottom: 8,
    gap: 9,
    alignItems: "center",
  },
  tab: {
    height: 40,
    minWidth: 94,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    overflow: "hidden",
  },
  tabActive: {
    borderColor: "rgba(85,245,178,0.80)",
  },
  tabText: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: Colors.ink,
  },

  listContent: { paddingBottom: 140 },

  headerStack: { paddingTop: 8, gap: 12 },
  feedSummary: {
    marginHorizontal: 14,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
  },
  feedSummaryTop: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  feedSummaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  feedSummaryCopy: { flex: 1 },
  feedSummaryTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  feedSummaryBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 3,
  },
  feedSummaryCount: {
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: "rgba(3,7,8,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  feedSummaryCountValue: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  feedSummaryCountLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 14,
    padding: 12,
    borderRadius: 20,
    backgroundColor: "rgba(11,24,26,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  composerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  composerAvatarText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  fillImg: { width: "100%", height: "100%" },
  composerCopy: { flex: 1 },
  composerKicker: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  composerHint: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  composerCta: {
    width: 32,
    height: 32,
    borderRadius: 13,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginHorizontal: 14 },
  post: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  rankCol: {
    width: 32,
    alignItems: "center",
    paddingTop: 4,
    gap: 3,
  },
  rankNum: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  rankScore: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "800",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  body: { flex: 1, gap: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  name: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  handle: { color: Colors.muted, fontSize: 12, fontWeight: "600" },
  dot: { color: Colors.muted, fontSize: 12 },
  time: { color: Colors.muted, fontSize: 12, fontWeight: "600" },
  followingPill: {
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
  },
  followingText: { color: Colors.mint, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  text: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  imageWrap: {
    marginTop: 4,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    aspectRatio: 16 / 10,
  },
  image: { width: "100%", height: "100%" },

  embed: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  embedDot: { width: 8, height: 8, borderRadius: 4 },
  embedTicker: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  embedSub: { color: Colors.muted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  embedChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  embedChangeText: { fontSize: 11, fontWeight: "900" },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 8,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionLabel: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

  empty: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 22,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(85,245,178,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },
  emptyBtn: { marginTop: 14, borderRadius: 999, overflow: "hidden" },
  emptyBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyBtnText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
});
