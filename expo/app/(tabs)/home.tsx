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
  Gem,
  Heart,
  ImagePlus,
  Inbox,
  MessageCircle,
  MessageSquareText,
  Radio,
  Repeat2,
  Rocket,
  Search,
  Share2,
  Skull,
  Sparkles,
  TrendingDown,
  Users as UsersIcon,
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
import LiveTicker from "@/components/ui/LiveTicker";
import CommunitiesRail from "@/components/home/CommunitiesRail";
import VoiceRoomsRail from "@/components/home/VoiceRoomsRail";
import Colors from "@/constants/colors";
import { fmtPrice } from "@/utils/format";

import {
  BONK_MINT,
  JUP_MINT,
  SOL_MINT,
  useTrendingTokens,
  useNewSolanaPairs,
} from "@/lib/api/market";
import { useDexTokens } from "@/lib/api/dexscreener";
import { isSafeToken } from "@/lib/safety";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { LaunchToken } from "@/types/launchpad";
import { UserPost, useApp } from "@/providers/app-provider";
import { useMessages } from "@/providers/messages-provider";

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
  const { data: trendingTokens } = useTrendingTokens(40);
  const { data: newPairsData } = useNewSolanaPairs(40);
  const { userId, isAuthenticated } = useAuth();
  const { totalUnread: dmUnread } = useMessages();
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
          .filter((t) =>
            isSafeToken({
              marketCapUsd: t.marketCap ?? null,
              liquidityUsd: t.liquidity ?? null,
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
          priceChange24hPct: t.change24hPct,
          venue: t.venue,
          tags: t.tags,
        }),
      );
      const localNew = listings
        .slice()
        .filter((t) =>
          t.submittedBy === "user" ||
            isSafeToken({
              marketCapUsd: t.marketCapUsd,
              liquidityUsd: t.liquidityUsd,
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
    return userPosts.map((p): FeedItem => ({ kind: "user", data: p }));
  }, [filter, userPosts, followingPostsQ.data, listings, trendingTokens, newPairsData, whalesQ.data]);

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
            <Pressable
              style={styles.iconBtn}
              onPress={() => router.push("/(tabs)/discover")}
              testID="search-btn"
            >
              <Search color={Colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push("/posts");
              }}
              testID="posts-btn"
            >
              <MessageSquareText color={Colors.mint} size={18} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push("/(tabs)/users");
              }}
              testID="users-btn"
            >
              <UsersIcon color={Colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push("/(tabs)/streams");
              }}
              testID="streams-btn"
            >
              <Radio color={Colors.text} size={18} strokeWidth={2.4} />
              <View style={styles.bellDot} pointerEvents="none" />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push("/messages");
              }}
              testID="messages-btn"
            >
              <Inbox color={Colors.text} size={18} strokeWidth={2.4} />
              {dmUnread > 0 ? (
                <View style={styles.inboxBadge} pointerEvents="none">
                  <Text style={styles.inboxBadgeText}>
                    {dmUnread > 9 ? "9+" : dmUnread}
                  </Text>
                </View>
              ) : null}
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
  const router = useRouter();
  return (
    <View style={styles.headerStack}>
      {filter === "For You" ? (
        <>
          <View style={styles.tickerWrap}>
            <LiveTicker />
          </View>
          <MarketStrip />
          <VoiceRoomsRail />
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
        colors={["rgba(85,245,178,0.18)", "rgba(56,215,255,0.04)"]}
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

function TrendingPairsRail() {
  const router = useRouter();
  const { data: newPairs } = useNewSolanaPairs(12);
  const { listings } = useLaunchpad();
  const goAll = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push("/(tabs)/launches");
  }, [router]);

  const pairs: LaunchToken[] = useMemo(() => {
    const fromDex = (newPairs ?? []).map((p): LaunchToken => {
      const created = p.pairCreatedAt ?? Date.now();
      const ageMs = Date.now() - created;
      const ageHours = ageMs / 3_600_000;
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
        hot: ageHours < 24 || (change ?? 0) > 50,
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
        priceChange24hPct: t.change24hPct,
        venue: t.venue,
        tags: t.tags,
      }),
    );
    if (safeDex.length > 0) return safeDex;
    return listings
      .slice()
      .filter((t) =>
        t.submittedBy === "user" ||
          isSafeToken({
            marketCapUsd: t.marketCapUsd,
            liquidityUsd: t.liquidityUsd,
            priceChange24hPct: t.change24hPct,
            venue: t.venue,
            tags: t.tags,
          }),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 12);
  }, [newPairs, listings]);

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
  const ringColor = pair.hot ? Colors.orange : positive ? Colors.mint : "#B88CFF";
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
  priceChange24h?: number;
  liquidity?: number;
  marketCap?: number;
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
    volume24hUsd: t.liquidity ?? null,
    holders: null,
    upvotes: 0,
    watchers: 0,
  };
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
    limit: 30,
    sort_by: sortBy,
    sort_type: sortType,
    timeframe,
  });

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
      .filter((t) => !!t.symbol)
      .map((t, i) => {
        const pair = tokenOverviewToPair(t, i);
        const change = pickChange(t);
        return {
          ...pair,
          change24hPct: change,
          volume24hUsd: t.volume24hUSD ?? pair.volume24hUsd,
        };
      });
    const base: LaunchToken[] = fromTrending.length > 0 ? fromTrending : listings.slice();
    const arr = base.slice();
    if (fromTrending.length === 0) {
      switch (tab) {
        case "gainers":
          arr.sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0));
          break;
        case "losers":
          arr.sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0));
          break;
        case "volume":
          arr.sort(
            (a, b) =>
              (b.volume24hUsd ?? b.liquidityUsd ?? 0) - (a.volume24hUsd ?? a.liquidityUsd ?? 0)
          );
          break;
        case "trending":
        default:
          arr.sort((a, b) => Math.abs(b.change24hPct ?? 0) - Math.abs(a.change24hPct ?? 0));
          break;
      }
    }
    return arr.slice(0, 12);
  }, [trending, listings, tab, pickChange]);

  const onOpen = useCallback(
    (id: string) => router.push({ pathname: "/launch/[id]", params: { id } }),
    [router]
  );

  return (
    <View style={styles.railWrap}>
      <View style={styles.railHeader}>
        <View style={styles.railTitleRow}>
          <TrendingUp color={Colors.mint} size={16} strokeWidth={2.6} />
          <Text style={styles.railTitle}>Trending tickers</Text>
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
            Trending tickers will appear here as soon as live market data loads.
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
          <PostPairCard pair={{ ticker: `${post.ticker}`, changePct: post.changePct ?? 0 }} />
        ) : null}
        <ReactionBar postId={post.id} />
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  reactionCount: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
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
  tickerWrap: {
    marginHorizontal: 14,
    marginBottom: 6,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,12,16,0.65)",
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
    borderColor: "rgba(255,255,255,0.06)",
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
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
