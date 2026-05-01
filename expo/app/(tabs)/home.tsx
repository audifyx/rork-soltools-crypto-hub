import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Bookmark,
  Feather,
  Flame,
  Heart,
  ImagePlus,
  Inbox,
  MessageCircle,
  Repeat2,
  Search,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
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

import TokenAvatar from "@/components/TokenAvatar";
import Colors from "@/constants/colors";
import { fmtPrice } from "@/utils/format";

import {
  BONK_MINT,
  JUP_MINT,
  SOL_MINT,
  useJupiterPrices,
  useTrendingTokens,
} from "@/lib/api/market";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { LaunchToken } from "@/types/launchpad";
import { UserPost, useApp } from "@/providers/app-provider";

const FILTERS = ["For You", "Following", "Trending", "New Pairs", "Whales"] as const;
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

export default function HomeFeedScreen() {
  const router = useRouter();
  const { posts: userPosts, togglePostLike, deletePost, profile } = useApp();
  const { listings } = useLaunchpad();
  const { data: trendingTokens } = useTrendingTokens(20);
  const { userId, isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<Filter>("For You");

  const onSelectFilter = useCallback((next: Filter) => {
    Haptics.selectionAsync().catch(() => {});
    setFilter(next);
  }, []);

  const followingPostsQ = useQuery<UserPost[]>({
    queryKey: ["home", "following-feed", userId ?? "guest"],
    enabled: isAuthenticated && !!userId && filter === "Following",
    queryFn: async () => {
      if (!userId) return [];
      try {
        const { data, error } = await supabase.rpc("get_following_feed", { max_rows: 50 });
        if (error) throw error;
        const rows = (data ?? []) as Array<{
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
        }>;
        const posts = rows.map((row): UserPost => ({
          id: row.id,
          text: row.content ?? "",
          ticker: row.ticker ?? undefined,
          changePct: row.change_pct != null ? Number(row.change_pct) : undefined,
          images: row.image_url ? [row.image_url] : undefined,
          createdAt: new Date(row.created_at).getTime(),
          likes: row.likes_count ?? 0,
          reposts: row.reposts_count ?? 0,
          comments: row.comments_count ?? 0,
          liked: false,
        }));
        // mark liked state for caller
        if (posts.length > 0) {
          const ids = posts.map((p) => p.id);
          const { data: likes } = await supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", userId)
            .in("post_id", ids);
          const likedSet = new Set((likes ?? []).map((r) => r.post_id as string));
          return posts.map((p) => ({ ...p, liked: likedSet.has(p.id) }));
        }
        return posts;
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

  const combined = useMemo<FeedItem[]>(() => {
    if (filter === "Following") {
      const remote = followingPostsQ.data ?? [];
      return remote.map((p): FeedItem => ({ kind: "user", data: p }));
    }
    if (filter === "Trending") {
      const tokens =
        (trendingTokens ?? [])
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
            volume24hUsd: null,
            holders: t.holder ?? null,
            upvotes: 0,
            watchers: 0,
          }));
      const fallback = listings.slice().sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
      return (tokens.length > 0 ? tokens : fallback).map((t): FeedItem => ({ kind: "token", data: t }));
    }
    if (filter === "New Pairs") {
      return listings
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30)
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
    return userPosts.map((p): FeedItem => ({ kind: "user", data: p }));
  }, [filter, userPosts, followingPostsQ.data, listings, trendingTokens, whalesQ.data]);

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
            displayName={profile.displayName}
            handle={profile.handle}
            avatarColor={profile.avatarColor}
            avatarUrl={profile.avatarUrl}
            verified={profile.verified}
            onLike={() => togglePostLike(item.data.id)}
            onDelete={() => deletePost(item.data.id)}
          />
        );
      }
      return null;
    },
    [profile, togglePostLike, deletePost, router],
  );

  return (
    <View style={styles.root} testID="home-screen">
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
          <View style={styles.brandPill}>
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandDot}
            />
            <Text style={styles.brandText}>SOL TOOLS</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable style={styles.iconBtn} testID="search-btn">
              <Search color={Colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
            <Pressable style={styles.iconBtn} testID="bell-btn">
              <Bell color={Colors.text} size={18} strokeWidth={2.4} />
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
  return (
    <View style={styles.headerStack}>
      {filter === "For You" ? (
        <>
          <MarketStrip />
          <TrendingPairsRail />
          <TrendingTopics />
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
  const { data, isLoading } = useJupiterPrices([SOL_MINT, BONK_MINT, JUP_MINT]);
  const sol = data?.[SOL_MINT]?.price;
  const bonk = data?.[BONK_MINT]?.price;
  const jup = data?.[JUP_MINT]?.price;
  return (
    <View style={styles.marketCard}>
      <LinearGradient
        colors={["rgba(85,245,178,0.18)", "rgba(56,215,255,0.04)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.marketGradient}
      >
        <View style={styles.marketRow}>
          <MarketTile label="SOL" price={sol} loading={isLoading} />
          <View style={styles.marketDivider} />
          <MarketTile label="BONK" price={bonk} loading={isLoading} digits={8} />
          <View style={styles.marketDivider} />
          <MarketTile label="JUP" price={jup} loading={isLoading} />
        </View>
      </LinearGradient>
    </View>
  );
}

function MarketTile({
  label,
  price,
  loading,
  digits = 2,
}: {
  label: string;
  price?: number;
  loading?: boolean;
  digits?: number;
}) {
  const display =
    price != null && price > 0
      ? fmtPrice(price)
      : loading
        ? "…"
        : "—";
  return (
    <View style={styles.marketTile}>
      <Text style={styles.marketLabel}>{label}</Text>
      <Text style={styles.marketValue}>{display}</Text>
      <View style={styles.marketChangeRow}>
        <Text style={[styles.marketChange, { color: price ? Colors.mint : Colors.muted }]}>
          {price ? "live" : loading ? "loading" : "awaiting data"}
        </Text>
      </View>
    </View>
  );
}

function TrendingPairsRail() {
  const router = useRouter();
  const { data: trending } = useTrendingTokens(10);
  const { listings } = useLaunchpad();

  const pairs: LaunchToken[] = useMemo(() => {
    const fromBird = (trending ?? []).slice(0, 10).map((t, i): LaunchToken => ({
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
      volume24hUsd: null,
      holders: t.holder ?? null,
      upvotes: 0,
      watchers: 0,
    }));
    if (fromBird.length > 0) return fromBird;
    return listings
      .slice()
      .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
      .slice(0, 12);
  }, [trending, listings]);

  const hasPairs = pairs.length > 0;
  return (
    <TrendingPairsRailInner
      pairs={pairs}
      hasPairs={hasPairs}
      onOpen={(id) => router.push({ pathname: "/launch/[id]", params: { id } })}
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
}: {
  pairs: LaunchToken[];
  hasPairs: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <View style={styles.railWrap}>
      <View style={styles.railHeader}>
        <View style={styles.railTitleRow}>
          <Flame color={Colors.orange} size={16} strokeWidth={2.6} />
          <Text style={styles.railTitle}>New pairs trending</Text>
        </View>
        <Pressable hitSlop={8} testID="see-all-pairs">
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
  const ringColor = pair.hot ? Colors.orange : positive ? Colors.mint : "#B88CFF";
  const ageMin = Math.max(1, Math.floor((Date.now() - pair.createdAt) / 60_000));
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
          {pair.hot ? (
            <View style={styles.hotBadge}>
              <Flame color={Colors.orange} size={10} strokeWidth={3} />
              <Text style={styles.hotText}>HOT</Text>
            </View>
          ) : (
            <View style={styles.agePill}>
              <Text style={styles.ageText}>{ageMin}m</Text>
            </View>
          )}
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

function TrendingTopics() {
  return (
    <View style={styles.topicsWrap}>
      <Text style={styles.sectionLabel}>Trending</Text>
      <Text style={styles.topicsEmpty}>
        Trending tags will appear here once the social feed comes online.
      </Text>
    </View>
  );
}

function PostImageGrid({ images }: { images: string[] }) {
  const count = Math.min(images.length, 4);
  if (count === 0) return null;
  if (count === 1) {
    return (
      <View style={styles.imgGridSolo} testID="post-images-1">
        <ExpoImage source={{ uri: images[0] }} style={styles.imgFill} contentFit="cover" />
      </View>
    );
  }
  if (count === 2) {
    return (
      <View style={styles.imgGridRow} testID="post-images-2">
        {images.slice(0, 2).map((u, i) => (
          <View key={`${u}-${i}`} style={styles.imgHalf}>
            <ExpoImage source={{ uri: u }} style={styles.imgFill} contentFit="cover" />
          </View>
        ))}
      </View>
    );
  }
  if (count === 3) {
    return (
      <View style={styles.imgGridRow} testID="post-images-3">
        <View style={styles.imgHalf}>
          <ExpoImage source={{ uri: images[0] }} style={styles.imgFill} contentFit="cover" />
        </View>
        <View style={styles.imgHalf}>
          <View style={styles.imgQuarter}>
            <ExpoImage source={{ uri: images[1] }} style={styles.imgFill} contentFit="cover" />
          </View>
          <View style={[styles.imgQuarter, { marginTop: 4 }]}>
            <ExpoImage source={{ uri: images[2] }} style={styles.imgFill} contentFit="cover" />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.imgGrid4} testID="post-images-4">
      {images.slice(0, 4).map((u, i) => (
        <View key={`${u}-${i}`} style={styles.imgQuad}>
          <ExpoImage source={{ uri: u }} style={styles.imgFill} contentFit="cover" />
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
  onDelete,
}: {
  post: UserPost;
  displayName: string;
  handle: string;
  avatarColor: string;
  avatarUrl?: string;
  verified: boolean;
  onLike: () => void;
  onDelete: () => void;
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
          <Pressable
            onPress={onDelete}
            hitSlop={6}
            style={{ marginLeft: "auto" }}
            testID={`delete-${post.id}`}
          >
            <Text style={[styles.actionLabel, { color: Colors.muted, fontSize: 18 }]}>×</Text>
          </Pressable>
        </View>
        {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}
        {post.images && post.images.length > 0 ? <PostImageGrid images={post.images} /> : null}
        {post.ticker ? (
          <PostPairCard pair={{ ticker: `$${post.ticker}`, changePct: post.changePct ?? 0 }} />
        ) : null}
        <View style={styles.actionsRow}>
          <ActionItem
            icon={<MessageCircle color={Colors.muted} size={16} strokeWidth={2.2} />}
            label={formatCount(post.comments)}
          />
          <ActionItem
            icon={<Repeat2 color={Colors.muted} size={17} strokeWidth={2.2} />}
            label={formatCount(post.reposts)}
          />
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
          <ActionItem icon={<Bookmark color={Colors.muted} size={15} strokeWidth={2.2} />} label="" />
          <ActionItem icon={<Share2 color={Colors.muted} size={15} strokeWidth={2.2} />} label="" />
        </View>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },

  topBar: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  avatarBtnText: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  avatarImg: { width: "100%", height: "100%" },
  brandPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.08)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.2)",
  },
  brandDot: { width: 12, height: 12, borderRadius: 6 },
  brandText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  topActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  filterWrap: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  filterRow: {
    paddingHorizontal: 14,
    gap: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
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
    marginTop: 8,
    height: 3,
    width: 24,
    borderRadius: 2,
    backgroundColor: Colors.mint,
  },

  listContent: {
    paddingBottom: 140,
    flexGrow: 1,
  },

  headerStack: {
    paddingTop: 14,
  },

  composer: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.16)",
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  composerActionText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  marketCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
  },
  marketGradient: {
    paddingVertical: 14,
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
    backgroundColor: "rgba(255,255,255,0.08)",
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
    borderColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: "rgba(8, 14, 18, 0.86)",
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
    backgroundColor: "rgba(255,184,76,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.4)",
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
    backgroundColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: "rgba(56,215,255,0.16)",
    borderColor: "rgba(56,215,255,0.45)",
  },
  pairStatPrice: {
    backgroundColor: "rgba(217,70,255,0.14)",
    borderColor: "rgba(217,70,255,0.45)",
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

  topicsWrap: {
    marginTop: 24,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
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
    backgroundColor: "rgba(255,93,143,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.35)",
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
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
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
    backgroundColor: "rgba(85,245,178,0.1)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
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
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
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
    borderColor: "rgba(255,255,255,0.06)",
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

  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
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
});
