import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Bookmark,
  Feather,
  Flame,
  Gem,
  Heart,
  ImagePlus,
  Inbox,
  Menu,
  MessageCircle,
  Plus,
  Quote,
  Repeat2,
  Rocket,
  Search,
  Send,
  Share2,
  Award,
  Skull,
  Sparkles,
  X,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  ListRenderItem,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import QuickAccessMenu from "@/components/QuickAccessMenu";
import TokenAvatar from "@/components/TokenAvatar";
import LiveTicker from "@/components/ui/LiveTicker";
import CommunitiesRail from "@/components/home/CommunitiesRail";
import OurTokenBadge from "@/components/home/OurTokenBadge";
import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { fmtPrice } from "@/utils/format";

import {
  BONK_MINT,
  JUP_MINT,
  SOL_MINT,
  useTrendingTokens,
  useNewSolanaPairs,
} from "@/lib/api/market";
import { type DexPair, useDexTokens } from "@/lib/api/dexscreener";
import { getOgMemeTokens } from "@/lib/alpha-runners";
import { isSafeToken } from "@/lib/safety";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { LaunchToken } from "@/types/launchpad";
import { UserPost, useApp } from "@/providers/app-provider";
import { useSocial } from "@/providers/social-provider";

const FILTERS = ["For You", "Following", "Trending", "New Pairs", "Whales", "OG Tokens"] as const;
type Filter = (typeof FILTERS)[number];

type WhaleFeedEvent = {
  id: string;
  wallet_address: string;
  token_address: string | null;
  symbol: string | null;
  side: "buy" | "sell" | "transfer";
  amount_usd: number | null;
  amount_token: number | null;
  tx_signature: string | null;
  created_at: string;
};

type FeedItem =
  | { kind: "user"; data: UserPost }
  | { kind: "token"; data: LaunchToken }
  | { kind: "whale"; data: WhaleFeedEvent };

type FeedPostRow = {
  id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  ticker: string | null;
  token_address?: string | null;
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

async function hydrateLikedPosts(rows: FeedPostRow[], userId: string): Promise<UserPost[]> {
  const missingAuthorIds = Array.from(new Set(rows.filter((row) => !row.author_username && row.user_id).map((row) => row.user_id)));
  let authors = new Map<string, Record<string, unknown>>();
  if (missingAuthorIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id,user_id,username,display_name,avatar_url,avatar_color,verified")
      .or(`id.in.(${missingAuthorIds.join(",")}),user_id.in.(${missingAuthorIds.join(",")})`);
    authors = new Map(
      ((data ?? []) as Record<string, unknown>[]).flatMap((row) => [
        [String(row.id), row],
        [String(row.user_id), row],
      ]),
    );
  }
  const posts = rows.map((row): UserPost => {
    const author = authors.get(row.user_id);
    return {
      id: row.id,
      text: row.content ?? "",
      ticker: row.ticker ?? undefined,
      contract: row.token_address ?? undefined,
      changePct: row.change_pct != null ? Number(row.change_pct) : undefined,
      images: row.image_url ? [row.image_url] : undefined,
      createdAt: new Date(row.created_at).getTime(),
      likes: row.likes_count ?? 0,
      reposts: row.reposts_count ?? 0,
      comments: row.comments_count ?? 0,
      liked: false,
      reposted: false,
      authorId: row.user_id,
      authorUsername: row.author_username ?? (author?.username as string | null | undefined) ?? null,
      authorDisplayName: row.author_display_name ?? (author?.display_name as string | null | undefined) ?? null,
      authorAvatarUrl: row.author_avatar_url ?? (author?.avatar_url as string | null | undefined) ?? null,
      authorAvatarColor: row.author_avatar_color ?? (author?.avatar_color as string | null | undefined) ?? null,
      authorVerified: !!(row.author_verified ?? author?.verified),
    };
  });
  if (posts.length === 0) return posts;
  const ids = posts.map((p) => p.id);
  const [{ data: likes }, { data: reposts }] = await Promise.all([
    supabase
      .from("community_post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", ids),
    supabase
      .from("community_post_reposts")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", ids),
  ]);
  const likedSet = new Set((likes ?? []).map((r) => r.post_id as string));
  const repostedSet = new Set((reposts ?? []).map((r) => r.post_id as string));
  return posts.map((p) => ({ ...p, liked: likedSet.has(p.id), reposted: repostedSet.has(p.id) }));
}

export default function HomeFeedScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { posts: userPosts, togglePostLike, togglePostRepost, deletePost, profile } = useApp();
  const { addPostReply, quotePost } = useSocial();
  const [interaction, setInteraction] = useState<{
    mode: "reply" | "quote";
    post: UserPost;
  } | null>(null);
  const [interactionText, setInteractionText] = useState<string>("");
  const [submittingInteraction, setSubmittingInteraction] = useState<boolean>(false);
  const { listings } = useLaunchpad();
  const { data: trendingTokens } = useTrendingTokens(40);
  const { data: newPairsData } = useNewSolanaPairs(40);
  const { userId, isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<Filter>("For You");
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ["app", "posts", userId ?? "guest"] }).catch(() => {});
      return undefined;
    }, [qc, userId]),
  );

  const onSelectFilter = useCallback((next: Filter) => {
    Haptics.selectionAsync().catch(() => {});
    setFilter(next);
  }, []);

  const livePostsQ = useQuery<UserPost[]>({
    queryKey: ["home", "live-feed", userId ?? "guest"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("community_posts")
          .select("id,user_id,content,image_url,ticker,token_address,change_pct,likes_count,reposts_count,comments_count,created_at")
          .is("parent_post_id", null)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return userId ? hydrateLikedPosts((data ?? []) as FeedPostRow[], userId) : ((data ?? []) as FeedPostRow[]).map((row): UserPost => ({
          id: row.id,
          text: row.content ?? "",
          ticker: row.ticker ?? undefined,
          contract: row.token_address ?? undefined,
          changePct: row.change_pct != null ? Number(row.change_pct) : undefined,
          images: row.image_url ? [row.image_url] : undefined,
          createdAt: new Date(row.created_at).getTime(),
          likes: row.likes_count ?? 0,
          reposts: row.reposts_count ?? 0,
          comments: row.comments_count ?? 0,
          liked: false,
          reposted: false,
          authorId: row.user_id,
        }));
      } catch (e) {
        console.log("[home] live feed fallback", e);
        return userPosts;
      }
    },
    staleTime: 10_000,
    refetchInterval: 20_000,
  });

  const followingPostsQ = useQuery<UserPost[]>({
    queryKey: ["home", "following-feed", userId ?? "guest"],
    enabled: isAuthenticated && !!userId && filter === "Following",
    queryFn: async () => {
      if (!userId) return [];
      try {
        const { data, error } = await supabase.rpc("get_following_feed", { max_rows: 50 });
        if (error) {
          console.log("[home] following feed rpc fallback", error.message);
          const { data: follows, error: followsError } = await supabase
            .from("followers")
            .select("followee_id")
            .eq("follower_id", userId);
          if (followsError) throw followsError;
          const followeeIds = (follows ?? [])
            .map((row) => String(row.followee_id ?? ""))
            .filter((id) => id.length > 0);
          if (followeeIds.length === 0) return [];
          const { data: fallbackPosts, error: postsError } = await supabase
            .from("community_posts")
            .select("id,user_id,content,image_url,ticker,token_address,change_pct,likes_count,reposts_count,comments_count,created_at")
            .in("user_id", followeeIds)
            .is("parent_post_id", null)
            .order("created_at", { ascending: false })
            .limit(50);
          if (postsError) throw postsError;
          return hydrateLikedPosts(fallbackPosts ?? [], userId);
        }
        return hydrateLikedPosts((data ?? []) as FeedPostRow[], userId);
      } catch (e) {
        console.log("[home] following feed failed", e);
        return [];
      }
    },
    staleTime: 30_000,
  });

  type WhaleEvent = {
    id: string;
    wallet_address: string;
    token_address: string | null;
    symbol: string | null;
    side: "buy" | "sell" | "transfer";
    amount_usd: number | null;
    amount_token: number | null;
    tx_signature: string | null;
    created_at: string;
  };
  const whalesQ = useQuery<WhaleEvent[]>({
    queryKey: ["home", "whales"],
    enabled: filter === "Whales",
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("whale_events")
          .select("id,wallet_address,token_address,symbol,side,amount_usd,amount_token,tx_signature,created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return (data ?? []) as WhaleEvent[];
      } catch (e) {
        console.log("[home] whales failed", e);
        return [];
      }
    },
    staleTime: 15_000,
    refetchInterval: filter === "Whales" ? 30_000 : false,
  });

  const patchTimelinePost = useCallback(
    (postId: string, updater: (post: UserPost) => UserPost) => {
      qc.setQueryData<UserPost[]>(["home", "live-feed", userId ?? "guest"], (prev) =>
        prev?.map((post) => (post.id === postId ? updater(post) : post)),
      );
      qc.setQueryData<UserPost[]>(["home", "following-feed", userId ?? "guest"], (prev) =>
        prev?.map((post) => (post.id === postId ? updater(post) : post)),
      );
      qc.setQueryData<UserPost[]>(["app", "posts", userId ?? "guest"], (prev) =>
        prev?.map((post) => (post.id === postId ? updater(post) : post)),
      );
    },
    [qc, userId],
  );

  const onTimelineDelete = useCallback(
    (post: UserPost) => {
      if (!userId) {
        Alert.alert("Sign in required", "Sign in to delete your posts.");
        return;
      }
      if (post.authorId && post.authorId !== userId) {
        Alert.alert("Not allowed", "You can only delete your own posts.");
        return;
      }
      Alert.alert(
        "Delete post?",
        "This permanently removes your post.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              qc.setQueryData<UserPost[]>(["home", "live-feed", userId ?? "guest"], (prev) =>
                prev?.filter((p) => p.id !== post.id),
              );
              qc.setQueryData<UserPost[]>(["home", "following-feed", userId ?? "guest"], (prev) =>
                prev?.filter((p) => p.id !== post.id),
              );
              deletePost(post.id)
                .then(() => {
                  qc.invalidateQueries({ queryKey: ["home", "live-feed"] });
                  qc.invalidateQueries({ queryKey: ["home", "following-feed"] });
                })
                .catch((e: unknown) => {
                  console.log("[home] delete post failed", e);
                  qc.invalidateQueries({ queryKey: ["home", "live-feed"] });
                  qc.invalidateQueries({ queryKey: ["home", "following-feed"] });
                  Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again.");
                });
            },
          },
        ],
      );
    },
    [deletePost, qc, userId],
  );

  const onTimelineLike = useCallback(
    (post: UserPost) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      patchTimelinePost(post.id, (p) => ({
        ...p,
        liked: !p.liked,
        likes: Math.max(0, p.likes + (p.liked ? -1 : 1)),
      }));
      togglePostLike(post.id).catch((e) => {
        patchTimelinePost(post.id, (p) => ({
          ...p,
          liked: !p.liked,
          likes: Math.max(0, p.likes + (p.liked ? -1 : 1)),
        }));
        console.log("[home] timeline like failed", e);
      });
    },
    [patchTimelinePost, togglePostLike],
  );

  const onTimelineRepost = useCallback(
    (post: UserPost) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      patchTimelinePost(post.id, (p) => ({
        ...p,
        reposted: !p.reposted,
        reposts: Math.max(0, p.reposts + (p.reposted ? -1 : 1)),
      }));
      togglePostRepost(post.id).catch((e) => {
        patchTimelinePost(post.id, (p) => ({
          ...p,
          reposted: !p.reposted,
          reposts: Math.max(0, p.reposts + (p.reposted ? -1 : 1)),
        }));
        console.log("[home] timeline repost failed", e);
      });
    },
    [patchTimelinePost, togglePostRepost],
  );

  const onTimelineShare = useCallback(async (post: UserPost) => {
    Haptics.selectionAsync().catch(() => {});
    const ticker = post.ticker ? `\n\n${post.ticker.replace("$", "")}` : "";
    const author = post.authorUsername
      ? `@${post.authorUsername}`
      : post.authorDisplayName ?? "a trader";
    try {
      await Share.share({
        message: `${post.text || "Crypto Community App post"}${ticker}\n\n— ${author}`,
      });
    } catch (e) {
      console.log("[home] share failed", e);
    }
  }, []);

  const openReply = useCallback(
    (post: UserPost) => {
      if (!isAuthenticated) {
        Alert.alert("Sign in", "Sign in to reply to posts.");
        return;
      }
      Haptics.selectionAsync().catch(() => {});
      setInteraction({ mode: "reply", post });
      setInteractionText("");
    },
    [isAuthenticated],
  );

  const openQuote = useCallback(
    (post: UserPost) => {
      if (!isAuthenticated) {
        Alert.alert("Sign in", "Sign in to quote posts.");
        return;
      }
      Haptics.selectionAsync().catch(() => {});
      setInteraction({ mode: "quote", post });
      setInteractionText("");
    },
    [isAuthenticated],
  );

  const closeInteraction = useCallback(() => {
    setInteraction(null);
    setInteractionText("");
  }, []);

  const submitInteraction = useCallback(async () => {
    if (!interaction) return;
    const text = interactionText.trim();
    if (text.length === 0) return;
    const { mode, post } = interaction;
    setSubmittingInteraction(true);
    try {
      const viewer = {
        authorHandle: profile.handle || "@you",
        authorName: profile.displayName || "You",
        authorColor: profile.avatarColor,
      };
      const targetPost = {
        id: post.id,
        communityId: "",
        authorUserId: post.authorId ?? null,
        authorHandle: post.authorUsername ? `@${post.authorUsername}` : "",
        authorName: post.authorDisplayName ?? post.authorUsername ?? "Trader",
        authorColor: post.authorAvatarColor ?? Colors.mint,
        content: post.text,
        imageUrl: post.images?.[0] ?? null,
        ticker: post.ticker,
        changePct: post.changePct,
        createdAt: post.createdAt,
        likes: post.likes,
        comments: post.comments,
        reposts: post.reposts,
        liked: !!post.liked,
        reposted: !!post.reposted,
        bookmarked: false,
        token: null,
      };
      if (mode === "reply") {
        await addPostReply({ post: targetPost, content: text, ...viewer });
        patchTimelinePost(post.id, (p) => ({ ...p, comments: p.comments + 1 }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        await quotePost({ post: targetPost, content: text, ...viewer });
        patchTimelinePost(post.id, (p) => ({
          ...p,
          reposts: p.reposts + 1,
          reposted: true,
        }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["home", "live-feed", userId ?? "guest"] });
      closeInteraction();
    } catch (e) {
      Alert.alert(
        mode === "reply" ? "Reply failed" : "Quote failed",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setSubmittingInteraction(false);
    }
  }, [
    interaction,
    interactionText,
    profile.handle,
    profile.displayName,
    profile.avatarColor,
    addPostReply,
    quotePost,
    patchTimelinePost,
    qc,
    userId,
    closeInteraction,
  ]);

  const combined = useMemo<FeedItem[]>(() => {
    if (filter === "Following") {
      const remote = followingPostsQ.data ?? [];
      return remote.map((p): FeedItem => ({ kind: "user", data: p }));
    }
    if (filter === "Trending") {
      const tokens =
        (trendingTokens ?? [])
          .filter((t) =>
            isSafeToken({
              marketCapUsd: t.marketCap ?? null,
              liquidityUsd: t.liquidity ?? null,
              volume24hUsd: t.volume24hUSD ?? null,
              holders: t.holder ?? null,
              priceUsd: t.price ?? null,
              priceChange24hPct: t.priceChange24h ?? null,
            }),
          )
          .map((t, i): LaunchToken => ({
            id: t.address,
            name: t.name ?? t.symbol ?? "Token",
            ticker: (t.symbol ?? "").toUpperCase(),
            description: "",
            logoUrl: t.logoURI ?? null,
            bannerUrl: null,
            contract: t.address,
            venue: "other",
            status: "live",
            tags: [],
            featured: false,
            hot: (t.priceChange24h ?? 0) > 20,
            verified: false,
            createdAt: Date.now() - i * 60_000,
            submittedBy: "system",
            price: t.price ?? null,
            change24hPct: t.priceChange24h ?? null,
            liquidityUsd: t.liquidity ?? null,
            marketCapUsd: t.marketCap ?? null,
            volume24hUsd: t.volume24hUSD ?? null,
            holders: t.holder ?? null,
            upvotes: 0,
            watchers: 0,
          }))
          .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
          .slice(0, 40);
      const fallback = listings
        .slice()
        .filter((t) =>
          isSafeToken({
            marketCapUsd: t.marketCapUsd,
            liquidityUsd: t.liquidityUsd,
            volume24hUsd: t.volume24hUsd,
            holders: t.holders,
            priceUsd: t.price,
            priceChange24hPct: t.change24hPct,
            venue: t.venue,
            tags: t.tags,
          }),
        )
        .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
      return (tokens.length > 0 ? tokens : fallback).map((t): FeedItem => ({ kind: "token", data: t }));
    }
    if (filter === "New Pairs") {
      const fromDex: LaunchToken[] = (newPairsData ?? []).map((p): LaunchToken => {
        const created = p.pairCreatedAt ?? Date.now();
        const change = p.priceChange?.h24 ?? null;
        return {
          id: p.baseToken.address,
          name: p.baseToken.name ?? p.baseToken.symbol ?? "Token",
          ticker: (p.baseToken.symbol ?? "").toUpperCase(),
          description: "",
          logoUrl: p.info?.imageUrl ?? null,
          bannerUrl: null,
          contract: p.baseToken.address,
          venue: "other",
          status: "live",
          tags: [],
          featured: false,
          hot: (Date.now() - created) < 86_400_000 || (change ?? 0) > 50,
          verified: false,
          createdAt: created,
          submittedBy: "system",
          price: p.priceUsd ? Number(p.priceUsd) : null,
          change24hPct: change,
          liquidityUsd: p.liquidity?.usd ?? null,
          marketCapUsd: p.marketCap ?? p.fdv ?? null,
          volume24hUsd: p.volume?.h24 ?? null,
          holders: null,
          upvotes: 0,
          watchers: 0,
        };
      });
      const safeDex = fromDex.filter((t) =>
        isSafeToken({
          marketCapUsd: t.marketCapUsd,
          liquidityUsd: t.liquidityUsd,
          volume24hUsd: t.volume24hUsd,
          holders: t.holders,
          priceUsd: t.price,
          priceChange24hPct: t.change24hPct,
          venue: t.venue,
          tags: t.tags,
        }),
      );
      const localNew = listings
        .slice()
        .filter((t) =>
          isSafeToken({
            marketCapUsd: t.marketCapUsd,
            liquidityUsd: t.liquidityUsd,
            volume24hUsd: t.volume24hUsd,
            holders: t.holders,
            priceUsd: t.price,
            priceChange24hPct: t.change24hPct,
            venue: t.venue,
            tags: t.tags,
          }),
        );
      // De-dup by contract/id, prefer dex (live) over local listing
      const seen = new Set<string>();
      const merged: LaunchToken[] = [];
      for (const t of [...safeDex, ...localNew]) {
        const key = (t.contract ?? t.id).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(t);
      }
      return merged
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 40)
        .map((t): FeedItem => ({ kind: "token", data: t }));
    }
    if (filter === "Whales") {
      const events = whalesQ.data ?? [];
      if (events.length > 0) {
        return events.map((e): FeedItem => ({ kind: "whale", data: e }));
      }
      return listings
        .slice()
        .filter((t) => (t.holders ?? 0) > 100 || (t.volume24hUsd ?? 0) > 50_000 || (t.liquidityUsd ?? 0) > 100_000)
        .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
        .slice(0, 30)
        .map((t): FeedItem => ({ kind: "token", data: t }));
    }
    if (filter === "OG Tokens") {
      return getOgMemeTokens(listings, 40).map((t): FeedItem => ({ kind: "token", data: t }));
    }
    const remote = livePostsQ.data ?? [];
    return (remote.length > 0 ? remote : userPosts).map((p): FeedItem => ({ kind: "user", data: p }));
  }, [filter, userPosts, livePostsQ.data, followingPostsQ.data, listings, trendingTokens, newPairsData, whalesQ.data]);

  const openCompose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push("/compose");
  }, [router]);

  const renderPost: ListRenderItem<FeedItem> = useCallback(
    ({ item }) => {
      if (item.kind === "token") {
        return (
          <TokenFeedRow
            token={item.data}
            onPress={() =>
              router.push({ pathname: "/launch/[id]", params: { id: item.data.id } })
            }
          />
        );
      }
      if (item.kind === "whale") {
        return <WhaleEventCard event={item.data} />;
      }
      if (item.kind === "user") {
        return (
          <UserPostCard
            post={item.data}
            displayName={item.data.authorDisplayName ?? item.data.authorUsername ?? profile.displayName}
            handle={item.data.authorUsername ? `@${item.data.authorUsername}` : profile.handle}
            avatarColor={item.data.authorAvatarColor ?? profile.avatarColor}
            avatarUrl={item.data.authorAvatarUrl ?? profile.avatarUrl}
            verified={item.data.authorVerified ?? profile.verified}
            canDelete={!!userId && (!item.data.authorId || item.data.authorId === userId)}
            onLike={() => onTimelineLike(item.data)}
            onRepost={() => onTimelineRepost(item.data)}
            onQuote={() => openQuote(item.data)}
            onComment={() => openReply(item.data)}
            onShare={() => void onTimelineShare(item.data)}
            onDelete={() => onTimelineDelete(item.data)}
          />
        );
      }
      return null;
    },
    [
      profile,
      onTimelineLike,
      onTimelineRepost,
      onTimelineShare,
      openReply,
      openQuote,
      onTimelineDelete,
      router,
      userId,
    ],
  );

  return (
    <View style={styles.root} testID="home-screen">
      <AppBackground variant="feed" />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={[styles.avatarBtn, { backgroundColor: profile.avatarColor }]}
            hitSlop={6}
            testID="profile-btn"
          >
            {profile.avatarUrl ? (
              <ExpoImage
                source={{ uri: profile.avatarUrl }}
                style={styles.avatarImg}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.avatarBtnText}>
                {profile.displayName.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </Pressable>
          <View style={styles.homeTitleWrap}>
            <Text style={styles.homeTitle}>Crypto Community App</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setMenuOpen(true);
              }}
              testID="menu-btn"
            >
              <Menu color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push("/notifications");
              }}
              testID="bell-btn"
            >
              <Bell color={Colors.text} size={18} strokeWidth={2.4} />
              <View style={styles.bellDot} pointerEvents="none" />
            </Pressable>
            <Pressable
              style={[styles.iconBtn, styles.plusBtn]}
              onPress={openCompose}
              testID="header-compose-btn"
            >
              <Plus color={Colors.ink} size={19} strokeWidth={3} />
            </Pressable>
          </View>
        </View>

        <View style={styles.filterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <Pressable
                  key={f}
                  onPress={() => onSelectFilter(f)}
                  style={styles.filterChip}
                  testID={`filter-${f}`}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f}</Text>
                  {active ? <View style={styles.filterUnderline} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <FlatList
          data={combined}
          keyExtractor={(p) => `${p.kind}-${p.data.id}`}
          renderItem={renderPost}
          ListHeaderComponent={
            <FeedHeader
              filter={filter}
              displayName={profile.displayName}
              avatarColor={profile.avatarColor}
              avatarUrl={profile.avatarUrl}
              onCompose={openCompose}
            />
          }
          ListEmptyComponent={<FeedEmpty filter={filter} onCompose={openCompose} />}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="home-feed"
        />

        <QuickAccessMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

        <PostInteractionModal
          interaction={interaction}
          text={interactionText}
          onChangeText={setInteractionText}
          onClose={closeInteraction}
          onSubmit={submitInteraction}
          submitting={submittingInteraction}
          viewerName={profile.displayName}
          viewerAvatarColor={profile.avatarColor}
        />

        <Pressable style={styles.fab} onPress={openCompose} testID="compose-fab">
          <LinearGradient
            colors={[Colors.mint, Colors.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Feather color={Colors.ink} size={22} strokeWidth={3} />
          </LinearGradient>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function FeedHeader({
  filter,
  displayName,
  avatarColor,
  avatarUrl,
  onCompose,
}: {
  filter: Filter;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  onCompose: () => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.headerStack}>
      {filter === "For You" ? (
        <>
          <HomeCommandHero />
          <View style={styles.tickerWrap}>
            <LiveTicker />
          </View>
          <OurTokenBadge />
          <MarketStrip />
          <CommunitiesRail />
          <TrendingPairsRail />
          <TrendingTickersRail />
          <TrendingTagsCard />
        </>
      ) : null}
      <ComposePrompt
        displayName={displayName}
        avatarColor={avatarColor}
        avatarUrl={avatarUrl}
        onPress={onCompose}
      />
      <View style={styles.feedTitleRow}>
        <Text style={styles.feedTitle}>
          {filter === "Following"
            ? "Following"
            : filter === "Trending"
              ? "Trending tokens"
              : filter === "New Pairs"
                ? "New pairs"
                : filter === "Whales"
                  ? "Whale activity"
                  : filter === "OG Tokens"
                    ? "OG tokens"
                    : "Live feed"}
        </Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>
    </View>
  );
}

function HomeCommandHero() {
  const router = useRouter();
  return (
    <View style={styles.commandHero} testID="home-command-hero">
      <LinearGradient
        colors={["rgba(63,169,255,0.20)", "rgba(221,227,236,0.075)", "rgba(0,0,0,0.24)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.commandGrid} pointerEvents="none" />
      <View style={styles.commandTopRow}>
        <View style={styles.commandBadge}>
          <Sparkles color={Colors.goldBright} size={12} strokeWidth={3} />
          <Text style={styles.commandBadgeText}>SOLTOOLS COMMAND</Text>
        </View>
        <View style={styles.commandLivePill}>
          <View style={styles.commandLiveDot} />
          <Text style={styles.commandLiveText}>LIVE DATA</Text>
        </View>
      </View>
      <Text style={styles.commandTitle}>Your live Solana command center.</Text>
      <Text style={styles.commandSub}>
        Posts, rooms, fresh pairs, whale prints, and token rails redesigned into one fast tactical dashboard.
      </Text>
      <View style={styles.commandStatsRow}>
        <View style={styles.commandStatBox}>
          <Text style={styles.commandStatValue}>24/7</Text>
          <Text style={styles.commandStatLabel}>market pulse</Text>
        </View>
        <View style={styles.commandStatBox}>
          <Text style={styles.commandStatValue}>ALL</Text>
          <Text style={styles.commandStatLabel}>Solana tokens</Text>
        </View>
        <View style={styles.commandStatBox}>
          <Text style={styles.commandStatValue}>SOCIAL</Text>
          <Text style={styles.commandStatLabel}>alpha feed</Text>
        </View>
      </View>
      <View style={styles.commandActions}>
        <Pressable
          onPress={() => router.push("/(tabs)/discover")}
          style={({ pressed }) => [styles.commandPrimary, pressed && styles.pressed]}
          testID="hero-scan-alpha"
        >
          <Search color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.commandPrimaryText}>Scan alpha</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/tools")}
          style={({ pressed }) => [styles.commandSecondary, pressed && styles.pressed]}
          testID="hero-open-tools"
        >
          <Zap color={Colors.goldBright} size={15} strokeWidth={2.8} />
          <Text style={styles.commandSecondaryText}>Tools</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/list-token")}
          style={({ pressed }) => [styles.commandSecondary, pressed && styles.pressed]}
          testID="hero-list-token"
        >
          <Rocket color={Colors.silver} size={15} strokeWidth={2.8} />
          <Text style={styles.commandSecondaryText}>List token</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ComposePrompt({
  displayName,
  avatarColor,
  avatarUrl,
  onPress,
}: {
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.composer} onPress={onPress} testID="compose-prompt">
      <View style={[styles.composerAvatar, { backgroundColor: avatarColor }]}>
        {avatarUrl ? (
          <ExpoImage source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={styles.composerAvatarText}>
            {displayName.slice(0, 1).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.composerBody}>
        <Text style={styles.composerHint}>Share alpha, charts, or a hot take…</Text>
        <View style={styles.composerActions}>
          <View style={styles.composerActionPill}>
            <ImagePlus color={Colors.mint} size={14} strokeWidth={2.4} />
            <Text style={styles.composerActionText}>Photos</Text>
          </View>
          <View style={styles.composerActionPill}>
            <Sparkles color={Colors.cyan} size={14} strokeWidth={2.4} />
            <Text style={styles.composerActionText}>Token</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MarketStrip() {
  const router = useRouter();
  const mints = useMemo(() => [SOL_MINT, BONK_MINT, JUP_MINT], []);
  const { data, isLoading } = useDexTokens(mints);
  const sol = data?.[SOL_MINT];
  const bonk = data?.[BONK_MINT];
  const jup = data?.[JUP_MINT];
  const onOpen = useCallback(
    (mint: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push({ pathname: "/launch/[id]", params: { id: mint } });
    },
    [router],
  );
  return (
    <View style={styles.marketCard}>
      <LinearGradient
        colors={["rgba(63,169,255,0.16)", "rgba(221,227,236,0.055)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.marketGradient}
      >
        <View style={styles.marketRow}>
          <MarketTile
            label="SOL"
            price={sol?.priceUsd ?? null}
            change={sol?.priceChange24hPct ?? null}
            loading={isLoading}
            onPress={() => onOpen(SOL_MINT)}
          />
          <View style={styles.marketDivider} />
          <MarketTile
            label="BONK"
            price={bonk?.priceUsd ?? null}
            change={bonk?.priceChange24hPct ?? null}
            loading={isLoading}
            onPress={() => onOpen(BONK_MINT)}
          />
          <View style={styles.marketDivider} />
          <MarketTile
            label="JUP"
            price={jup?.priceUsd ?? null}
            change={jup?.priceChange24hPct ?? null}
            loading={isLoading}
            onPress={() => onOpen(JUP_MINT)}
          />
        </View>
      </LinearGradient>
    </View>
  );
}

function MarketTile({
  label,
  price,
  change,
  loading,
  onPress,
}: {
  label: string;
  price: number | null;
  change: number | null;
  loading?: boolean;
  onPress?: () => void;
}) {
  const hasPrice = price != null && price > 0;
  const display = hasPrice ? fmtPrice(price as number) : loading ? "…" : "—";
  const positive = (change ?? 0) >= 0;
  const changeColor = change == null ? Colors.muted : positive ? Colors.mint : Colors.rose;
  const changeLabel =
    change == null
      ? loading
        ? "loading"
        : "—"
      : `${positive ? "+" : ""}${change.toFixed(2)}%`;
  return (
    <Pressable style={styles.marketTile} onPress={onPress} testID={`market-${label}`}>
      <Text style={styles.marketLabel}>{label}</Text>
      <Text style={styles.marketValue}>{display}</Text>
      <View style={styles.marketChangeRow}>
        {change != null ? (
          positive ? (
            <TrendingUp color={changeColor} size={10} strokeWidth={3} />
          ) : (
            <TrendingDown color={changeColor} size={10} strokeWidth={3} />
          )
        ) : null}
        <Text style={[styles.marketChange, { color: changeColor }]}>{changeLabel}</Text>
      </View>
    </Pressable>
  );
}

function dexPairToLaunchToken(p: DexPair): LaunchToken {
  const created = p.pairCreatedAt ?? Date.now();
  const ageMs = Date.now() - created;
  const ageHours = ageMs / 3_600_000;
  const change = p.priceChange?.h24 ?? null;
  const price = p.priceUsd ? Number(p.priceUsd) : null;
  return {
    id: p.baseToken.address,
    name: p.baseToken.name ?? p.baseToken.symbol ?? "Token",
    ticker: (p.baseToken.symbol ?? "").toUpperCase(),
    description: "",
    logoUrl: p.info?.imageUrl ?? null,
    bannerUrl: null,
    contract: p.baseToken.address,
    venue: "other",
    status: "live",
    tags: [],
    featured: false,
    hot: ageHours < 24 || (change ?? 0) > 50,
    verified: false,
    createdAt: created,
    submittedBy: "system",
    price: Number.isFinite(price) ? price : null,
    change24hPct: change,
    liquidityUsd: p.liquidity?.usd ?? null,
    marketCapUsd: p.marketCap ?? p.fdv ?? null,
    volume24hUsd: p.volume?.h24 ?? null,
    holders: null,
    upvotes: 0,
    watchers: 0,
  };
}

function getTokenDedupeKeys(t: LaunchToken): string[] {
  return [t.id, t.contract, t.ticker ? `symbol:${t.ticker}` : null]
    .filter((value): value is string => !!value)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function hasExcludedTokenKey(t: LaunchToken, excluded: Set<string>): boolean {
  return getTokenDedupeKeys(t).some((key) => excluded.has(key));
}

function makeTokenKeySet(tokens: LaunchToken[]): Set<string> {
  const keys = new Set<string>();
  tokens.forEach((token) => getTokenDedupeKeys(token).forEach((key) => keys.add(key)));
  return keys;
}

function uniqueLaunchTokens(tokens: LaunchToken[]): LaunchToken[] {
  const seen = new Set<string>();
  const out: LaunchToken[] = [];
  tokens.forEach((token) => {
    const keys = getTokenDedupeKeys(token);
    if (keys.length > 0 && keys.some((key) => seen.has(key))) return;
    keys.forEach((key) => seen.add(key));
    out.push(token);
  });
  return out;
}

function getVisibleNewPairTokens(newPairs: DexPair[] | undefined, listings: LaunchToken[]): LaunchToken[] {
  const fromDex = (newPairs ?? []).map(dexPairToLaunchToken);
  const safeDex = fromDex.filter((t) =>
    isSafeToken({
      marketCapUsd: t.marketCapUsd,
      liquidityUsd: t.liquidityUsd,
      volume24hUsd: t.volume24hUsd,
      holders: t.holders,
      priceUsd: t.price,
      priceChange24hPct: t.change24hPct,
      venue: t.venue,
      tags: t.tags,
    }),
  );
  if (safeDex.length > 0) return uniqueLaunchTokens(safeDex).slice(0, 12);
  return uniqueLaunchTokens(
    listings
      .slice()
      .filter((t) =>
        isSafeToken({
          marketCapUsd: t.marketCapUsd,
          liquidityUsd: t.liquidityUsd,
          volume24hUsd: t.volume24hUsd,
          holders: t.holders,
          priceUsd: t.price,
          priceChange24hPct: t.change24hPct,
          venue: t.venue,
          tags: t.tags,
        }),
      )
      .sort((a, b) => b.createdAt - a.createdAt),
  ).slice(0, 12);
}

function TrendingPairsRail() {
  const router = useRouter();
  const { data: newPairs } = useNewSolanaPairs(12);
  const { listings } = useLaunchpad();
  const goAll = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push("/(tabs)/discover");
  }, [router]);

  const pairs: LaunchToken[] = useMemo(
    () => getVisibleNewPairTokens(newPairs, listings),
    [newPairs, listings],
  );

  const hasPairs = pairs.length > 0;
  return (
    <TrendingPairsRailInner
      pairs={pairs}
      hasPairs={hasPairs}
      onOpen={(id) => router.push({ pathname: "/launch/[id]", params: { id } })}
      onSeeAll={goAll}
    />
  );
}

function formatCompactUsd(n?: number): string {
  if (!n || n === 0) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n.toFixed(0)}`;
}

function TrendingPairsRailInner({
  pairs,
  hasPairs,
  onOpen,
  onSeeAll,
}: {
  pairs: LaunchToken[];
  hasPairs: boolean;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <View style={styles.railWrap}>
      <View style={styles.railHeader}>
        <View style={styles.railTitleRow}>
          <Flame color={Colors.orange} size={16} strokeWidth={2.6} />
          <Text style={styles.railTitle}>New pairs trending</Text>
        </View>
        <Pressable hitSlop={8} onPress={onSeeAll} testID="see-all-pairs">
          <Text style={styles.railLink}>See all</Text>
        </Pressable>
      </View>
      {hasPairs ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
        >
          {pairs.map((p) => (
            <PairCard key={p.id} pair={p} onPress={() => onOpen(p.id)} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.railEmpty} testID="pairs-empty">
          <Text style={styles.railEmptyTitle}>No pairs yet</Text>
          <Text style={styles.railEmptyBody}>
            Live Solana pairs will surface here as soon as they hit the market.
          </Text>
        </View>
      )}
    </View>
  );
}

function PairCard({ pair, onPress }: { pair: LaunchToken; onPress: () => void }) {
  const change = pair.change24hPct ?? 0;
  const positive = change >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  const ringColor = pair.hot ? Colors.orange : positive ? Colors.mint : "#B8BEC8";
  const ageMs = Math.max(0, Date.now() - pair.createdAt);
  const ageLabel =
    ageMs < 60_000
      ? `${Math.max(1, Math.floor(ageMs / 1000))}s`
      : ageMs < 3_600_000
        ? `${Math.floor(ageMs / 60_000)}m`
        : ageMs < 86_400_000
          ? `${Math.floor(ageMs / 3_600_000)}h`
          : `${Math.floor(ageMs / 86_400_000)}d`;
  const price = pair.price;
  return (
    <Pressable
      style={[styles.pairCard, { shadowColor: ringColor }]}
      onPress={onPress}
      testID={`pair-${pair.id}`}
    >
      <View
        style={[styles.pairHalo, { borderColor: ringColor, shadowColor: ringColor }]}
        pointerEvents="none"
      />
      <View style={styles.pairInner}>
        <LinearGradient
          colors={[`${ringColor}22`, "rgba(0,0,0,0)", `${ringColor}11`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.pairGlowBlob, { backgroundColor: `${ringColor}33` }]} />

        <View style={styles.pairTopRow}>
          <TokenAvatar uri={pair.logoUrl} ticker={pair.ticker} size={40} radius={14} />
          <View style={styles.agePill}>
            <Text style={styles.ageText}>{ageLabel}</Text>
          </View>
          {pair.hot ? (
            <View style={styles.hotBadge}>
              <Flame color={Colors.orange} size={10} strokeWidth={3} />
              <Text style={styles.hotText}>NEW</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.pairTicker, { color: ringColor, textShadowColor: `${ringColor}AA` }]}
          numberOfLines={1}
        >
          ${pair.ticker.replace("$", "")}
        </Text>
        <Text style={styles.pairName} numberOfLines={1}>
          {pair.name}
        </Text>
        <Text style={styles.pairPrice} numberOfLines={1}>
          MC ${formatCompactUsd(pair.marketCapUsd ?? undefined)}
        </Text>

        <View style={styles.pairStatsRow}>
          <View style={[styles.pairStatBox, styles.pairStatLiq]}>
            <Text style={styles.pairStatLabel}>LIQ</Text>
            <Text style={[styles.pairStatValue, { color: Colors.cyan }]}>
              {formatCompactUsd(pair.liquidityUsd ?? undefined)}
            </Text>
          </View>
          <View style={[styles.pairStatBox, styles.pairStatPrice]}>
            <Text style={styles.pairStatLabel}>PRICE</Text>
            <Text style={[styles.pairStatValue, { color: Colors.neon }]}>
              {price != null && price > 0 ? fmtPrice(price) : "—"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.pairChangePill,
            {
              borderColor: `${accent}88`,
              backgroundColor: `${accent}1A`,
              shadowColor: accent,
            },
          ]}
        >
          {positive ? (
            <TrendingUp color={accent} size={12} strokeWidth={3} />
          ) : (
            <TrendingDown color={accent} size={12} strokeWidth={3} />
          )}
          <Text style={[styles.pairChangeText, { color: accent }]}>
            {positive ? "+" : ""}
            {change.toFixed(1)}%
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

type TickerTab = "trending" | "gainers" | "losers" | "volume";
type TickerTimeframe = "1h" | "24h" | "7d";
const TICKER_TABS: { key: TickerTab; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "gainers", label: "Gainers" },
  { key: "losers", label: "Losers" },
  { key: "volume", label: "Volume" },
];
const TICKER_TIMEFRAMES: { key: TickerTimeframe; label: string }[] = [
  { key: "1h", label: "1H" },
  { key: "24h", label: "24H" },
  { key: "7d", label: "7D" },
];

function tokenOverviewToPair(t: {
  address: string;
  symbol?: string;
  name?: string;
  logoURI?: string;
  price?: number;
  priceChange1h?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  liquidity?: number;
  marketCap?: number;
  volume24hUSD?: number;
}, idx: number): LaunchToken {
  const symbol = (t.symbol ?? "").toUpperCase();
  return {
    id: t.address,
    name: t.name ?? symbol,
    ticker: symbol,
    description: "",
    logoUrl: t.logoURI ?? null,
    bannerUrl: null,
    contract: t.address,
    venue: "other",
    status: "live",
    tags: [],
    featured: false,
    hot: idx < 3,
    verified: false,
    createdAt: Date.now(),
    submittedBy: "system",
    price: t.price ?? null,
    change24hPct: t.priceChange24h ?? null,
    liquidityUsd: t.liquidity ?? null,
    marketCapUsd: t.marketCap ?? null,
    volume24hUsd: t.volume24hUSD ?? null,
    holders: null,
    upvotes: 0,
    watchers: 0,
  };
}

function getTickerCategoryItems(tokens: LaunchToken[], tab: TickerTab): LaunchToken[] {
  const withRealMetrics = tokens.filter((token) => {
    const hasMarket = (token.marketCapUsd ?? 0) > 0 && (token.liquidityUsd ?? 0) > 0;
    if (!hasMarket) return false;
    if (tab === "gainers") return typeof token.change24hPct === "number" && token.change24hPct > 0;
    if (tab === "losers") return typeof token.change24hPct === "number" && token.change24hPct < 0;
    if (tab === "volume") return (token.volume24hUsd ?? 0) > 0;
    return (token.volume24hUsd ?? 0) > 0 || typeof token.change24hPct === "number";
  });

  const ranked = withRealMetrics.slice();
  switch (tab) {
    case "gainers":
      ranked.sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0));
      break;
    case "losers":
      ranked.sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0));
      break;
    case "volume":
      ranked.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
      break;
    case "trending":
    default:
      ranked.sort((a, b) => {
        const score = (token: LaunchToken): number =>
          (token.hot ? 1_000_000 : 0) +
          (token.verified ? 250_000 : 0) +
          (token.volume24hUsd ?? 0) * 0.7 +
          (token.liquidityUsd ?? 0) * 0.2 +
          Math.max(0, token.change24hPct ?? 0) * 15_000 +
          token.upvotes * 2_500;
        return score(b) - score(a);
      });
      break;
  }
  return uniqueLaunchTokens(ranked).slice(0, 12);
}

function TrendingTickersRail() {
  const router = useRouter();
  const { listings } = useLaunchpad();
  const [tab, setTab] = useState<TickerTab>("trending");
  const [timeframe, setTimeframe] = useState<TickerTimeframe>("24h");

  const sortBy = useMemo<"rank" | "volume24hUSD" | "liquidity" | "priceChangePercent">(() => {
    switch (tab) {
      case "volume":
        return "volume24hUSD";
      case "gainers":
      case "losers":
        return "priceChangePercent";
      case "trending":
      default:
        return "rank";
    }
  }, [tab]);
  const sortType = tab === "losers" ? ("asc" as const) : ("desc" as const);

  const { data: trending } = useTrendingTokens({
    limit: 60,
    sort_by: sortBy,
    sort_type: sortType,
    timeframe,
  });
  const { data: visibleNewPairs } = useNewSolanaPairs(12);
  const excludedNewPairKeys = useMemo<Set<string>>(
    () => makeTokenKeySet(getVisibleNewPairTokens(visibleNewPairs, listings)),
    [visibleNewPairs, listings],
  );

  const pickChange = useCallback(
    (t: { priceChange1h?: number; priceChange24h?: number; priceChange7d?: number }): number | null => {
      const v =
        timeframe === "1h"
          ? t.priceChange1h
          : timeframe === "7d"
          ? t.priceChange7d
          : t.priceChange24h;
      return v ?? null;
    },
    [timeframe]
  );

  const pairs = useMemo<LaunchToken[]>(() => {
    const fromTrending = (trending ?? [])
      .filter((t) => !!t.symbol && !!t.address)
      .map((t, i) => {
        const pair = tokenOverviewToPair(t, i);
        return {
          ...pair,
          change24hPct: pickChange(t),
          volume24hUsd: t.volume24hUSD ?? pair.volume24hUsd,
        };
      })
      .filter((token) => !hasExcludedTokenKey(token, excludedNewPairKeys));
    const fallbackListings = listings.filter((token) => !hasExcludedTokenKey(token, excludedNewPairKeys));
    const primary = getTickerCategoryItems(fromTrending, tab);
    if (primary.length > 0) return primary;
    return getTickerCategoryItems(fallbackListings, tab);
  }, [trending, listings, tab, pickChange, excludedNewPairKeys]);

  const onOpen = useCallback(
    (id: string) => router.push({ pathname: "/launch/[id]", params: { id } }),
    [router]
  );

  return (
    <View style={styles.railWrap}>
      <View style={styles.railHeader}>
        <View style={styles.railTitleRow}>
          <TrendingUp color={Colors.mint} size={16} strokeWidth={2.6} />
          <Text style={styles.railTitle}>{TICKER_TABS.find((t) => t.key === tab)?.label ?? "Trending"} tickers</Text>
        </View>
        <Pressable
          hitSlop={8}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            router.push("/(tabs)/discover");
          }}
          testID="tickers-see-all"
        >
          <Text style={styles.railLink}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tickerTabsRow}
      >
        {TICKER_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTab(t.key);
              }}
              style={[styles.tickerTab, active ? styles.tickerTabActive : null]}
              testID={`ticker-tab-${t.key}`}
            >
              <Text style={[styles.tickerTabText, active ? styles.tickerTabTextActive : null]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.timeframeRow}>
        {TICKER_TIMEFRAMES.map((tf) => {
          const active = timeframe === tf.key;
          return (
            <Pressable
              key={tf.key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTimeframe(tf.key);
              }}
              style={[styles.timeframeChip, active ? styles.timeframeChipActive : null]}
              testID={`ticker-timeframe-${tf.key}`}
            >
              <Text
                style={[
                  styles.timeframeChipText,
                  active ? styles.timeframeChipTextActive : null,
                ]}
              >
                {tf.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {pairs.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
        >
          {pairs.map((p) => (
            <PairCard key={`${tab}-${p.id}`} pair={p} onPress={() => onOpen(p.id)} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.railEmpty} testID="tickers-empty">
          <Text style={styles.railEmptyTitle}>No trending tickers</Text>
          <Text style={styles.railEmptyBody}>
            {TICKER_TABS.find((t) => t.key === tab)?.label ?? "Trending"} tickers will appear here as soon as live market data loads.
          </Text>
        </View>
      )}
    </View>
  );
}

function TrendingTagsCard() {
  const router = useRouter();
  const { listings } = useLaunchpad();

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    listings.forEach((t) => t.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));
  }, [listings]);

  if (topTags.length === 0) return null;

  return (
    <View style={styles.topicsWrap}>
      <Text style={styles.sectionLabel}>Trending tags</Text>
      <View style={styles.tagsRow}>
        {topTags.map(({ tag, count }) => (
          <Pressable
            key={tag}
            style={styles.tagChip}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push("/(tabs)/discover");
            }}
            testID={`tag-${tag}`}
          >
            <Text style={styles.tagText}>#{tag}</Text>
            <Text style={styles.tagCount}>{count}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function isVideoUri(uri: string): boolean {
  return /\.(mp4|mov|m4v|webm|qt)(\?|$)/i.test(uri);
}

function PostMediaItem({ uri }: { uri: string }) {
  if (isVideoUri(uri)) {
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:cover;background:#000}</style></head><body><video controls playsinline webkit-playsinline preload="metadata" src="${uri.replace(/"/g, "&quot;")}"></video></body></html>`;
    return (
      <WebView
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://soltools.app" }}
        style={styles.imgFill}
        scrollEnabled={false}
        bounces={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
      />
    );
  }
  return <ExpoImage source={{ uri }} style={styles.imgFill} contentFit="cover" />;
}

function PostImageGrid({ images }: { images: string[] }) {
  const count = Math.min(images.length, 4);
  if (count === 0) return null;
  if (count === 1) {
    return (
      <View style={styles.imgGridSolo} testID="post-images-1">
        <PostMediaItem uri={images[0]} />
      </View>
    );
  }
  if (count === 2) {
    return (
      <View style={styles.imgGridRow} testID="post-images-2">
        {images.slice(0, 2).map((u, i) => (
          <View key={`${u}-${i}`} style={styles.imgHalf}>
            <PostMediaItem uri={u} />
          </View>
        ))}
      </View>
    );
  }
  if (count === 3) {
    return (
      <View style={styles.imgGridRow} testID="post-images-3">
        <View style={styles.imgHalf}>
          <PostMediaItem uri={images[0]} />
        </View>
        <View style={styles.imgHalf}>
          <View style={styles.imgQuarter}>
            <PostMediaItem uri={images[1]} />
          </View>
          <View style={[styles.imgQuarter, { marginTop: 4 }]}>
            <PostMediaItem uri={images[2]} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.imgGrid4} testID="post-images-4">
      {images.slice(0, 4).map((u, i) => (
        <View key={`${u}-${i}`} style={styles.imgQuad}>
          <PostMediaItem uri={u} />
        </View>
      ))}
    </View>
  );
}

function UserPostCard({
  post,
  displayName,
  handle,
  avatarColor,
  avatarUrl,
  verified,
  onLike,
  onRepost,
  onQuote,
  onComment,
  onShare,
  onDelete,
  canDelete,
}: {
  post: UserPost;
  displayName: string;
  handle: string;
  avatarColor: string;
  avatarUrl?: string | null;
  verified: boolean;
  onLike: () => void;
  onRepost: () => void;
  onQuote: () => void;
  onComment: () => void;
  onShare: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [commentsOpen, setCommentsOpen] = useState<boolean>(false);
  const toggleComments = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setCommentsOpen((v) => !v);
  }, []);
  const time = useMemo(() => {
    const diff = Date.now() - post.createdAt;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }, [post.createdAt]);

  return (
    <View style={styles.post} testID={`user-post-${post.id}`}>
      <View style={[styles.postAvatar, { backgroundColor: avatarColor }]}>
        {avatarUrl ? (
          <ExpoImage source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={styles.postAvatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.postBody}>
        <View style={styles.postHeaderRow}>
          <Text style={styles.postName} numberOfLines={1}>
            {displayName}
          </Text>
          {verified ? <BadgeCheck color={Colors.cyan} size={14} strokeWidth={2.6} /> : null}
          <Text style={styles.postHandle}>{handle}</Text>
          <Text style={styles.postDot}>·</Text>
          <Text style={styles.postTime}>{time}</Text>
          {canDelete ? (
            <Pressable
              onPress={onDelete}
              hitSlop={6}
              style={{ marginLeft: "auto" }}
              testID={`delete-${post.id}`}
            >
              <Text style={[styles.actionLabel, { color: Colors.muted, fontSize: 18 }]}>×</Text>
            </Pressable>
          ) : null}
        </View>
        {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}
        {post.images && post.images.length > 0 ? <PostImageGrid images={post.images} /> : null}
        {post.ticker ? (
          <PostPairCard pair={{ ticker: `${post.ticker}`, changePct: post.changePct ?? 0 }} />
        ) : null}
        <ReactionBar postId={post.id} />
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={post.comments > 0 ? toggleComments : onComment}
            onLongPress={onComment}
            hitSlop={6}
            testID={`comment-user-${post.id}`}
          >
            <MessageCircle
              color={commentsOpen ? Colors.cyan : Colors.muted}
              size={16}
              strokeWidth={2.2}
            />
            <Text style={[styles.actionLabel, commentsOpen ? { color: Colors.cyan } : null]}>
              {formatCount(post.comments)}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={onRepost}
            hitSlop={6}
            testID={`repost-user-${post.id}`}
          >
            <Repeat2
              color={post.reposted ? Colors.mint : Colors.muted}
              size={17}
              strokeWidth={2.2}
            />
            <Text style={[styles.actionLabel, post.reposted ? { color: Colors.mint } : null]}>
              {formatCount(post.reposts)}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={onQuote}
            hitSlop={6}
            testID={`quote-user-${post.id}`}
          >
            <Quote color={Colors.muted} size={15} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={onLike}
            hitSlop={6}
            testID={`like-user-${post.id}`}
          >
            <Heart
              color={post.liked ? Colors.rose : Colors.muted}
              size={16}
              strokeWidth={2.2}
              fill={post.liked ? Colors.rose : "transparent"}
            />
            <Text style={[styles.actionLabel, post.liked ? { color: Colors.rose } : null]}>
              {formatCount(post.likes)}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={onShare}
            hitSlop={6}
            testID={`share-user-${post.id}`}
          >
            <Share2 color={Colors.muted} size={15} strokeWidth={2.2} />
          </Pressable>
        </View>
        {post.comments > 0 && !commentsOpen ? (
          <Pressable
            onPress={toggleComments}
            hitSlop={6}
            style={styles.viewCommentsBtn}
            testID={`view-comments-${post.id}`}
          >
            <Text style={styles.viewCommentsText}>
              View {formatCount(post.comments)} {post.comments === 1 ? "comment" : "comments"}
            </Text>
          </Pressable>
        ) : null}
        {commentsOpen ? (
          <PostCommentsList
            postId={post.id}
            onReply={onComment}
            onCollapse={toggleComments}
          />
        ) : null}
      </View>
    </View>
  );
}

function PostCommentsList({
  postId,
  onReply,
  onCollapse,
}: {
  postId: string;
  onReply: () => void;
  onCollapse: () => void;
}) {
  const { usePostReplies } = useSocial();
  const repliesQuery = usePostReplies(postId);
  const replies = repliesQuery.data ?? [];
  return (
    <View style={styles.commentsBox} testID={`comments-${postId}`}>
      <View style={styles.commentsHeader}>
        <Text style={styles.commentsHeaderText}>Comments</Text>
        <Pressable onPress={onCollapse} hitSlop={6}>
          <Text style={styles.commentsHide}>Hide</Text>
        </Pressable>
      </View>
      {repliesQuery.isLoading && replies.length === 0 ? (
        <Text style={styles.commentsEmpty}>Loading…</Text>
      ) : replies.length === 0 ? (
        <Pressable onPress={onReply} style={styles.commentsEmptyBtn}>
          <Text style={styles.commentsEmpty}>No comments yet. Be the first to reply.</Text>
        </Pressable>
      ) : (
        replies.map((c) => <CommentRow key={c.id} reply={c} />)
      )}
      <Pressable onPress={onReply} style={styles.commentReplyBtn} testID={`reply-from-comments-${postId}`}>
        <MessageCircle color={Colors.ink} size={13} strokeWidth={2.6} />
        <Text style={styles.commentReplyBtnText}>Write a reply</Text>
      </Pressable>
    </View>
  );
}

function CommentRow({
  reply,
}: {
  reply: {
    id: string;
    authorName: string;
    authorHandle: string;
    authorColor: string;
    content: string;
    createdAt: number;
    likes: number;
  };
}) {
  const time = useMemo(() => {
    const diff = Date.now() - reply.createdAt;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }, [reply.createdAt]);
  const initial = (reply.authorName || reply.authorHandle || "?").replace("@", "").slice(0, 1).toUpperCase();
  return (
    <View style={styles.commentRow} testID={`comment-${reply.id}`}>
      <View style={[styles.commentAvatar, { backgroundColor: reply.authorColor || Colors.mint }]}>
        <Text style={styles.commentAvatarText}>{initial}</Text>
      </View>
      <View style={styles.commentBody}>
        <View style={styles.commentHeaderRow}>
          <Text style={styles.commentName} numberOfLines={1}>
            {reply.authorName || "Trader"}
          </Text>
          {reply.authorHandle ? (
            <Text style={styles.commentHandle} numberOfLines={1}>
              {reply.authorHandle}
            </Text>
          ) : null}
          <Text style={styles.commentDot}>·</Text>
          <Text style={styles.commentTime}>{time}</Text>
        </View>
        {reply.content ? <Text style={styles.commentContent}>{reply.content}</Text> : null}
        {reply.likes > 0 ? (
          <View style={styles.commentLikeRow}>
            <Heart color={Colors.muted} size={11} strokeWidth={2.4} />
            <Text style={styles.commentLikeText}>{formatCount(reply.likes)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function FeedEmpty({ filter, onCompose }: { filter: Filter; onCompose: () => void }) {
  const titles: Record<Filter, { title: string; body: string; Icon: typeof Inbox }> = {
    "For You": { title: "The feed is quiet", body: "Be the first to drop alpha. Share a chart, a token call, or a hot take.", Icon: Inbox },
    Following: { title: "No following yet", body: "Follow traders to see their posts here. Tap a profile to follow.", Icon: Heart },
    Trending: { title: "No trending tokens", body: "Trending tokens will appear once live market data loads.", Icon: Flame },
    "New Pairs": { title: "No new pairs", body: "Newly launched Solana pairs will surface here in real time.", Icon: Zap },
    Whales: { title: "No whale moves", body: "Large holder & high-volume tokens will appear here.", Icon: Waves },
    "OG Tokens": { title: "No OG tokens yet", body: "BUTTCOIN, TROLL, WOJAK, USELESS, PENGU and other OG names will appear when live market data loads.", Icon: Award },
  };
  const c = titles[filter];
  return (
    <View style={styles.feedEmpty} testID="feed-empty">
      <View style={styles.feedEmptyIcon}>
        <c.Icon color={Colors.mint} size={26} strokeWidth={2.2} />
      </View>
      <Text style={styles.feedEmptyTitle}>{c.title}</Text>
      <Text style={styles.feedEmptyBody}>{c.body}</Text>
      <Pressable onPress={onCompose} style={styles.feedEmptyBtn} testID="empty-compose">
        <LinearGradient
          colors={[Colors.mint, Colors.cyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.feedEmptyBtnGrad}
        >
          <Feather color={Colors.ink} size={14} strokeWidth={3} />
          <Text style={styles.feedEmptyBtnText}>Create post</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function TokenFeedRow({ token, onPress }: { token: LaunchToken; onPress: () => void }) {
  const change = token.change24hPct ?? 0;
  const positive = change >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  const ageMin = Math.max(1, Math.floor((Date.now() - token.createdAt) / 60_000));
  return (
    <Pressable onPress={onPress} style={styles.tokenRow} testID={`token-row-${token.id}`}>
      <TokenAvatar uri={token.logoUrl} ticker={token.ticker} size={44} radius={14} />
      <View style={styles.tokenMid}>
        <View style={styles.tokenTopRow}>
          <Text style={styles.tokenTicker} numberOfLines={1}>${token.ticker.replace("$", "")}</Text>
          {token.hot ? <Flame color={Colors.orange} size={11} strokeWidth={3} /> : null}
          <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
        </View>
        <Text style={styles.tokenStats} numberOfLines={1}>
          MC ${formatCompactUsd(token.marketCapUsd ?? undefined)} · LIQ ${formatCompactUsd(token.liquidityUsd ?? undefined)} · {ageMin}m
        </Text>
      </View>
      {change !== 0 || token.change24hPct != null ? (
        <View style={[styles.tokenChange, { backgroundColor: `${accent}1A`, borderColor: `${accent}55` }]}>
          {positive ? (
            <TrendingUp color={accent} size={12} strokeWidth={3} />
          ) : (
            <TrendingDown color={accent} size={12} strokeWidth={3} />
          )}
          <Text style={[styles.tokenChangeText, { color: accent }]}>
            {positive ? "+" : ""}{change.toFixed(1)}%
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function WhaleEventCard({ event }: { event: WhaleFeedEvent }) {
  const isBuy = event.side === "buy";
  const isSell = event.side === "sell";
  const accent = isBuy ? Colors.mint : isSell ? Colors.rose : Colors.cyan;
  const sideLabel = event.side.toUpperCase();
  const amount = event.amount_usd ?? 0;
  const ageMin = Math.max(1, Math.floor((Date.now() - new Date(event.created_at).getTime()) / 60_000));
  const wallet = event.wallet_address;
  const short = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "";
  return (
    <View style={styles.tokenRow} testID={`whale-${event.id}`}>
      <View
        style={[
          styles.postAvatar,
          { backgroundColor: `${accent}22`, alignItems: "center", justifyContent: "center" },
        ]}
      >
        <Waves color={accent} size={20} strokeWidth={2.4} />
      </View>
      <View style={styles.tokenMid}>
        <View style={styles.tokenTopRow}>
          <Text style={[styles.tokenTicker, { color: accent }]} numberOfLines={1}>
            {sideLabel}
          </Text>
          {event.symbol ? (
            <Text style={styles.tokenName} numberOfLines={1}>
              ${event.symbol.replace("$", "")}
            </Text>
          ) : null}
        </View>
        <Text style={styles.tokenStats} numberOfLines={1}>
          {short} · {formatCompactUsd(amount)} · {ageMin}m
        </Text>
      </View>
      <View style={[styles.tokenChange, { backgroundColor: `${accent}1A`, borderColor: `${accent}55` }]}>
        {isBuy ? (
          <TrendingUp color={accent} size={12} strokeWidth={3} />
        ) : isSell ? (
          <TrendingDown color={accent} size={12} strokeWidth={3} />
        ) : (
          <ArrowUpRight color={accent} size={12} strokeWidth={3} />
        )}
        <Text style={[styles.tokenChangeText, { color: accent }]}>
          {formatCompactUsd(amount)}
        </Text>
      </View>
    </View>
  );
}

function PostPairCard({ pair }: { pair: { ticker: string; changePct: number } }) {
  const positive = pair.changePct >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  return (
    <View style={[styles.embedCard, { borderColor: `${accent}33` }]} testID={`embed-${pair.ticker}`}>
      <View style={styles.embedLeft}>
        <View style={[styles.embedDot, { backgroundColor: accent }]} />
        <View>
          <Text style={styles.embedTicker}>{pair.ticker}</Text>
          <Text style={styles.embedSub}>Solana · pump.fun</Text>
        </View>
      </View>
      <View
        style={[
          styles.embedChange,
          { backgroundColor: `${accent}1A`, borderColor: `${accent}55` },
        ]}
      >
        {positive ? (
          <TrendingUp color={accent} size={12} strokeWidth={3} />
        ) : (
          <TrendingDown color={accent} size={12} strokeWidth={3} />
        )}
        <Text style={[styles.embedChangeText, { color: accent }]}>
          {positive ? "+" : ""}
          {pair.changePct.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

type ReactionKey = "rocket" | "diamond" | "fire" | "bear";
const REACTIONS: { key: ReactionKey; Icon: typeof Rocket; color: string; label: string }[] = [
  { key: "rocket", Icon: Rocket, color: Colors.mint, label: "Rocket" },
  { key: "diamond", Icon: Gem, color: Colors.cyan, label: "Diamond" },
  { key: "fire", Icon: Flame, color: Colors.orange, label: "Fire" },
  { key: "bear", Icon: Skull, color: Colors.rose, label: "Bear" },
];

function ReactionBar({ postId }: { postId: string }) {
  // Local-only reactions per session: lightweight feel-good interactions until
  // a backend reactions table lands.
  const [counts, setCounts] = useState<Record<ReactionKey, number>>(() => {
    const seed = Math.abs(
      postId.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 17),
    );
    return {
      rocket: seed % 7,
      diamond: (seed >>> 3) % 5,
      fire: (seed >>> 5) % 6,
      bear: (seed >>> 7) % 3,
    };
  });
  const [picked, setPicked] = useState<ReactionKey | null>(null);

  const onTap = useCallback(
    (key: ReactionKey) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setCounts((prev) => {
        const wasPicked = picked === key;
        return { ...prev, [key]: Math.max(0, prev[key] + (wasPicked ? -1 : 1)) };
      });
      setPicked((prev) => (prev === key ? null : key));
    },
    [picked],
  );

  return (
    <View style={styles.reactionBar} testID={`reactions-${postId}`}>
      {REACTIONS.map((r) => {
        const active = picked === r.key;
        const count = counts[r.key];
        return (
          <Pressable
            key={r.key}
            onPress={() => onTap(r.key)}
            style={[
              styles.reactionPill,
              active && {
                backgroundColor: `${r.color}1F`,
                borderColor: `${r.color}66`,
              },
            ]}
            hitSlop={4}
            testID={`react-${r.key}-${postId}`}
          >
            <r.Icon
              color={active ? r.color : Colors.muted}
              size={13}
              strokeWidth={2.4}
              fill={active ? r.color : "transparent"}
            />
            {count > 0 ? (
              <Text style={[styles.reactionCount, active && { color: r.color }]}>
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function ActionItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.actionBtn}>
      {icon}
      {label ? <Text style={styles.actionLabel}>{label}</Text> : null}
    </View>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

function PostInteractionModal({
  interaction,
  text,
  onChangeText,
  onClose,
  onSubmit,
  submitting,
  viewerName,
  viewerAvatarColor,
}: {
  interaction: { mode: "reply" | "quote"; post: UserPost } | null;
  text: string;
  onChangeText: (next: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  viewerName: string;
  viewerAvatarColor: string;
}) {
  const visible = !!interaction;
  const mode = interaction?.mode ?? "reply";
  const post = interaction?.post;
  const authorName = post?.authorDisplayName ?? post?.authorUsername ?? "Trader";
  const authorHandle = post?.authorUsername ? `@${post.authorUsername}` : "";
  const canSend = text.trim().length > 0 && !submitting;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.interactionBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.interactionSheetWrap}
        >
          <SafeAreaView edges={["bottom"]} style={styles.interactionSheet}>
            <View style={styles.interactionHeader}>
              <Text style={styles.interactionTitle}>
                {mode === "reply" ? "Reply" : "Quote post"}
              </Text>
              <Pressable onPress={onClose} hitSlop={8} testID="interaction-close">
                <X color={Colors.text} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>
            {post ? (
              <View style={styles.interactionQuote}>
                <Text style={styles.interactionQuoteAuthor} numberOfLines={1}>
                  {authorName} {authorHandle ? <Text style={styles.interactionQuoteHandle}>{authorHandle}</Text> : null}
                </Text>
                {post.text ? (
                  <Text style={styles.interactionQuoteBody} numberOfLines={4}>
                    {post.text}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.interactionComposer}>
              <View
                style={[styles.interactionAvatar, { backgroundColor: viewerAvatarColor }]}
              >
                <Text style={styles.interactionAvatarText}>
                  {(viewerName || "Y").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <TextInput
                value={text}
                onChangeText={onChangeText}
                placeholder={
                  mode === "reply"
                    ? `Reply to ${authorName}…`
                    : "Add your take…"
                }
                placeholderTextColor={Colors.muted}
                style={styles.interactionInput}
                multiline
                autoFocus
                testID="interaction-input"
              />
              <Pressable
                onPress={onSubmit}
                disabled={!canSend}
                style={[styles.interactionSend, !canSend && { opacity: 0.42 }]}
                testID="interaction-send"
              >
                <Send color={Colors.ink} size={15} strokeWidth={2.8} />
              </Pressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },

  topBar: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.18)",
    backgroundColor: "rgba(3,8,18,0.88)",
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.18)",
  },
  avatarBtnText: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  avatarImg: { width: "100%", height: "100%" },
  reactionBar: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    flexWrap: "wrap",
  },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(98,208,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.10)",
  },
  reactionCount: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  homeTitleWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  homeTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  homeSubtitle: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 1,
  },
  topActions: { flexDirection: "row", gap: 9 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(98,208,255,0.11)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  plusBtn: {
    backgroundColor: Colors.goldBright,
    borderColor: "rgba(255,248,223,0.55)",
  },
  bellDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.rose,
    borderWidth: 1.5,
    borderColor: Colors.ink,
  },
  inboxBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: Colors.cyan,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxBadgeText: { color: Colors.ink, fontSize: 9, fontWeight: "900" },

  filterWrap: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.46)",
    overflow: "hidden",
  },
  filterRow: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(98,208,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.11)",
  },
  filterText: {
    color: Colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  filterTextActive: {
    color: Colors.text,
    fontWeight: "900",
  },
  filterUnderline: {
    marginTop: 7,
    height: 3,
    width: 24,
    borderRadius: 2,
    backgroundColor: Colors.text,
  },

  listContent: {
    paddingBottom: 140,
    flexGrow: 1,
  },

  headerStack: {
    paddingTop: 10,
  },
  commandHero: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.24)",
    backgroundColor: "rgba(3,9,22,0.94)",
    overflow: "hidden",
    shadowColor: "#62D0FF",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  commandGrid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.045)",
    transform: [{ rotate: "-6deg" }, { scale: 1.18 }],
  },
  commandTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  commandBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(63,169,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.30)",
  },
  commandBadgeText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  commandLivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(221,227,236,0.10)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.18)",
  },
  commandLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.text },
  commandLiveText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  commandTitle: {
    color: Colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -1.1,
    marginTop: 18,
    maxWidth: 330,
  },
  commandSub: {
    color: Colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 9,
  },
  commandStatsRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  commandStatBox: {
    flex: 1,
    padding: 10,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.32)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.14)",
  },
  commandStatValue: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  commandStatLabel: { color: Colors.muted, fontSize: 9, fontWeight: "800", marginTop: 3, textTransform: "uppercase" },
  commandActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  commandPrimary: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: Colors.text,
  },
  commandPrimaryText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },
  commandSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: "rgba(221,227,236,0.10)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.18)",
  },
  commandSecondaryText: { color: Colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  tickerWrap: {
    marginHorizontal: 14,
    marginBottom: 6,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.12)",
    backgroundColor: "rgba(8,7,3,0.70)",
  },

  composer: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 14,
    marginTop: 18,
    padding: 15,
    borderRadius: 22,
    backgroundColor: "rgba(4,10,24,0.90)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.18)",
  },
  composerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  composerAvatarText: {
    color: Colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  composerBody: { flex: 1, justifyContent: "center", gap: 10 },
  composerHint: {
    color: Colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  composerActions: {
    flexDirection: "row",
    gap: 8,
  },
  composerActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(98,208,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.10)",
  },
  composerActionText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  marketCard: {
    marginHorizontal: 14,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.20)",
    backgroundColor: "rgba(8,7,3,0.80)",
  },
  marketGradient: {
    paddingVertical: 15,
    paddingHorizontal: 8,
  },
  marketRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  marketTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  marketDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(98,208,255,0.12)",
  },
  marketLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  marketValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  marketChangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  marketChange: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },

  railWrap: {
    marginTop: 22,
  },
  railHeader: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  railTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  railTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  railLink: {
    color: Colors.mint,
    fontSize: 12,
    fontWeight: "800",
  },
  railContent: {
    paddingHorizontal: 14,
    gap: 12,
  },
  railEmpty: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.10)",
    backgroundColor: Colors.card,
  },
  railEmptyTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  railEmptyBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    lineHeight: 17,
  },
  pairCard: {
    width: 178,
    borderRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 8,
  },
  pairHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1.4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
    elevation: 6,
  },
  pairInner: {
    padding: 14,
    borderRadius: 24,
    backgroundColor: "rgba(10, 8, 4, 0.88)",
    overflow: "hidden",
  },
  pairGlowBlob: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -50,
    right: -50,
    opacity: 0.55,
  },
  pairTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(201,206,216,0.12)",
    borderWidth: 1,
    borderColor: "rgba(201,206,216,0.34)",
  },
  hotText: {
    color: Colors.orange,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  agePill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(221,227,236,0.10)",
  },
  ageText: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  pairTicker: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 12,
    letterSpacing: -0.4,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  pairName: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  pairPrice: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
    letterSpacing: -0.2,
  },
  pairStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  pairStatBox: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  pairStatLiq: {
    backgroundColor: "rgba(229,231,235,0.12)",
    borderColor: "rgba(229,231,235,0.28)",
  },
  pairStatPrice: {
    backgroundColor: "rgba(241,241,242,0.10)",
    borderColor: "rgba(241,241,242,0.26)",
  },
  pairStatLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  pairStatValue: {
    fontSize: 12,
    fontWeight: "900",
    marginTop: 3,
    letterSpacing: -0.2,
  },
  pairChangePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 4,
  },
  pairChangeText: {
    fontSize: 12,
    fontWeight: "900",
  },

  tickerTabsRow: {
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 8,
  },
  timeframeRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  timeframeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.10)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  timeframeChipActive: {
    borderColor: `${Colors.mint}66`,
    backgroundColor: `${Colors.mint}14`,
  },
  timeframeChipText: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  timeframeChipTextActive: {
    color: Colors.mint,
    fontWeight: "900",
  },
  tickerTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.12)",
    backgroundColor: "rgba(98,208,255,0.045)",
  },
  tickerTabActive: {
    borderColor: `${Colors.mint}88`,
    backgroundColor: `${Colors.mint}1A`,
  },
  tickerTabText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  tickerTabTextActive: {
    color: Colors.mint,
    fontWeight: "900",
  },

  topicsWrap: {
    marginTop: 24,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.085)",
  },
  sectionLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  topicsList: {},
  topicsEmpty: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    paddingVertical: 6,
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  topicLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  topicRank: {
    color: Colors.muted,
    fontSize: 14,
    fontWeight: "900",
    width: 18,
  },
  topicTag: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  topicCount: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  topicsHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topicChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  topicChangeText: { fontSize: 11, fontWeight: "900" },
  tagSection: { marginTop: 14 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(98,208,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.10)",
  },
  tagText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  tagCount: { color: Colors.muted, fontSize: 10, fontWeight: "800" },

  feedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginTop: 24,
    marginBottom: 6,
  },
  feedTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(244,244,245,0.10)",
    borderWidth: 1,
    borderColor: "rgba(244,244,245,0.24)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.rose,
  },
  liveText: {
    color: Colors.rose,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  divider: {
    height: 0,
    marginHorizontal: 18,
  },

  feedEmpty: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 12,
  },
  feedEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(98,208,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.30)",
    marginBottom: 14,
  },
  feedEmptyTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  feedEmptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
  feedEmptyBtn: {
    marginTop: 16,
    borderRadius: 14,
    overflow: "hidden",
  },
  feedEmptyBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  feedEmptyBtnText: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },

  post: {
    flexDirection: "row",
    marginHorizontal: 14,
    marginVertical: 6,
    padding: 14,
    gap: 12,
    borderRadius: 22,
    backgroundColor: "rgba(10,8,4,0.82)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.14)",
  },
  postAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  postAvatarText: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  postBody: { flex: 1 },
  postHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  postName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
    maxWidth: "55%",
  },
  postHandle: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 2,
  },
  postDot: {
    color: Colors.muted,
    fontSize: 13,
    marginHorizontal: 2,
  },
  postTime: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  postText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
    fontWeight: "500",
  },

  imgGridSolo: {
    marginTop: 12,
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.10)",
  },
  imgGridRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 4,
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
  },
  imgHalf: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: Colors.card,
  },
  imgQuarter: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: Colors.card,
  },
  imgGrid4: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    borderRadius: 16,
    overflow: "hidden",
  },
  imgQuad: {
    width: "49.5%",
    aspectRatio: 1,
    overflow: "hidden",
    backgroundColor: Colors.card,
  },
  imgFill: { width: "100%", height: "100%" },

  embedCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  embedLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  embedDot: { width: 10, height: 10, borderRadius: 5 },
  embedTicker: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  embedSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  embedChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  embedChangeText: { fontSize: 11, fontWeight: "900" },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingRight: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionLabel: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  viewCommentsBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
  },
  viewCommentsText: {
    color: Colors.cyan,
    fontSize: 12,
    fontWeight: "700",
  },
  commentsBox: {
    marginTop: 12,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.14)",
    gap: 10,
  },
  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  commentsHeaderText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  commentsHide: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  commentsEmpty: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  commentsEmptyBtn: {
    paddingVertical: 6,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  commentBody: { flex: 1 },
  commentHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  commentName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
    maxWidth: 130,
  },
  commentHandle: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    maxWidth: 110,
  },
  commentDot: { color: Colors.muted, fontSize: 11 },
  commentTime: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  commentContent: {
    color: Colors.text,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 2,
  },
  commentLikeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  commentLikeText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  commentReplyBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.cyan,
  },
  commentReplyBtnText: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 14,
    marginVertical: 6,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(10,8,4,0.82)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.14)",
  },
  tokenMid: { flex: 1 },
  tokenTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tokenTicker: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 },
  tokenName: { color: Colors.muted, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  tokenStats: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 4 },
  tokenChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  tokenChangeText: { fontSize: 12, fontWeight: "900" },
  fab: {
    position: "absolute",
    right: 18,
    bottom: Platform.OS === "ios" ? 110 : 92,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: Colors.mint,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  fabGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  interactionBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,8,0.78)",
    justifyContent: "flex-end",
  },
  interactionSheetWrap: {
    width: "100%",
  },
  interactionSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    gap: 14,
  },
  interactionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  interactionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  interactionQuote: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
    gap: 6,
  },
  interactionQuoteAuthor: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  interactionQuoteHandle: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  interactionQuoteBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  interactionComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingBottom: 6,
  },
  interactionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  interactionAvatarText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  interactionInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  interactionSend: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.mint,
  },
});
