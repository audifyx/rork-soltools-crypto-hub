import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Bell,
  Bot,
  ChartLine,
  Compass,
  Crosshair,
  Eye,
  Filter,
  ListChecks,
  Flame,
  Hash,
  Heart,
  Pickaxe,
  Plus,
  RefreshCcw,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCircle2,
  Waves,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  ListRenderItem,
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

import TokenAvatar from "@/components/TokenAvatar";
import AlphaInsightsCard from "@/components/discover/AlphaInsightsCard";
import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import {
  compareOgMemeTokens,
  getAlphaRunnerScore,
  getDailyAlphaRunners,
  getOgMemeTokens,
  isDailyAlphaRunner,
  isNewCharityCoin,
  isOgMemeToken,
  isRunnerFromYear,
  isUtilityRunner,
} from "@/lib/alpha-runners";
import { fmtNum, fmtUsd } from "@/utils/format";
import { useApp } from "@/providers/app-provider";
import { isSafeToken } from "@/lib/safety";
import { useAuth } from "@/providers/auth-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";
import {
  extractSolanaAddress,
  fetchLaunchTokenForSearchQuery,
  getTokenSearchRank,
  mergeTokenSearchResult,
  tokenMatchesSearch,
} from "@/lib/token-search";
import { LaunchToken } from "@/types/launchpad";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number; fill?: string }>;

type Section = "all" | "featured" | "tokens" | "mine" | "hot" | "new" | "migrated" | "gainers" | "losers" | "volume" | "whales" | "og" | "ai";

const SECTIONS: { id: Section; label: string; Icon: LucideIcon }[] = [
  { id: "all", label: "All", Icon: Sparkles },
  { id: "featured", label: "Featured", Icon: Star },
  { id: "tokens", label: "Tokens", Icon: Rocket },
  { id: "mine", label: "Mine", Icon: UserCircle2 },
  { id: "hot", label: "Hot", Icon: Flame },
  { id: "new", label: "New", Icon: Zap },
  { id: "migrated", label: "Migrated", Icon: Rocket },
  { id: "gainers", label: "Gainers", Icon: TrendingUp },
  { id: "losers", label: "Losers", Icon: TrendingDown },
  { id: "volume", label: "Volume", Icon: BarChart3 },
  { id: "whales", label: "Whales", Icon: Waves },
  { id: "og", label: "OG Tokens", Icon: Award },
  { id: "ai", label: "Daily Runners", Icon: Bot },
];

type Category = {
  id: string;
  label: string;
  Icon: LucideIcon;
  tone: string;
  match: (t: LaunchToken) => boolean;
};

type DiscoverStats = {
  hot: number;
  tracked: number;
  featured: number;
  total: number;
  totalVol: number;
  listed: number;
  pending: number;
};

function tokenHaystack(t: LaunchToken): string {
  return [t.name, t.ticker, t.description ?? "", ...(t.tags ?? [])]
    .join(" ")
    .toLowerCase();
}

function hasRealMarket(token: LaunchToken): boolean {
  return (token.marketCapUsd ?? 0) > 0 && (token.liquidityUsd ?? 0) > 0;
}

function isDiscoverSafeToken(token: LaunchToken): boolean {
  return isSafeToken({
    marketCapUsd: token.marketCapUsd,
    liquidityUsd: token.liquidityUsd,
    volume24hUsd: token.volume24hUsd,
    holders: token.holders,
    priceUsd: token.price,
    priceChange24hPct: token.change24hPct,
    venue: token.venue,
    tags: token.tags,
  });
}

function heatScore(token: LaunchToken): number {
  return (
    (token.hot ? 1_000_000 : 0) +
    (token.verified ? 250_000 : 0) +
    (token.volume24hUsd ?? 0) * 0.72 +
    (token.liquidityUsd ?? 0) * 0.22 +
    Math.max(0, token.change24hPct ?? 0) * 15_000 +
    token.upvotes * 2_500 +
    token.watchers * 1_000
  );
}

const SPOTLIGHT_DAILY_GAIN_MIN_PCT = 50;
const SPOTLIGHT_MAX_ANOMALY_PCT = 2_500;
const MIGRATED_WINDOW_MS = 1000 * 60 * 60 * 72;

function isSpotlightDailyGainer(token: LaunchToken): boolean {
  const change = token.change24hPct ?? Number.NEGATIVE_INFINITY;
  return (
    isDiscoverSafeToken(token) &&
    change >= SPOTLIGHT_DAILY_GAIN_MIN_PCT &&
    change <= SPOTLIGHT_MAX_ANOMALY_PCT &&
    (token.volume24hUsd ?? 0) >= 50_000 &&
    (token.liquidityUsd ?? 0) >= 25_000
  );
}

function isFreshlyMigratedToken(token: LaunchToken): boolean {
  const age = Date.now() - token.createdAt;
  const text = tokenHaystack(token);
  const looksGraduated =
    token.venue === "pumpswap" ||
    token.venue === "raydium" ||
    token.venue === "meteora" ||
    /pump|migrated|graduate|graduated|bonding/i.test(text);
  return (
    isDiscoverSafeToken(token) &&
    looksGraduated &&
    age >= 0 &&
    age <= MIGRATED_WINDOW_MS &&
    (token.liquidityUsd ?? 0) >= 20_000
  );
}

function isCurrentDailyRunner(token: LaunchToken): boolean {
  const change = token.change24hPct ?? Number.NEGATIVE_INFINITY;
  return (
    isDiscoverSafeToken(token) &&
    change >= 25 &&
    change <= SPOTLIGHT_MAX_ANOMALY_PCT &&
    (token.volume24hUsd ?? 0) >= 100_000 &&
    (token.liquidityUsd ?? 0) >= 25_000
  );
}

function tokenAgeLabel(createdAt: number): string {
  const ageMs = Math.max(0, Date.now() - createdAt);
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const CATEGORIES: Category[] = [
  {
    id: "runners-2025",
    label: "2025 Runners",
    Icon: Trophy,
    tone: Colors.orange,
    match: (t) => isRunnerFromYear(t, 2025),
  },
  {
    id: "runners-2026",
    label: "2026 Runners",
    Icon: Rocket,
    tone: Colors.mint,
    match: (t) => isRunnerFromYear(t, 2026),
  },
  {
    id: "daily-runners",
    label: "Daily Runners",
    Icon: Flame,
    tone: Colors.rose,
    match: (t) => isDailyAlphaRunner(t),
  },
  {
    id: "og-tokens",
    label: "OG Tokens",
    Icon: Award,
    tone: Colors.goldBright,
    match: (t) => isOgMemeToken(t),
  },
  {
    id: "utility-runners",
    label: "Utility Runners",
    Icon: Pickaxe,
    tone: Colors.cyan,
    match: (t) => isUtilityRunner(t),
  },
  {
    id: "charity-coins",
    label: "New Charity",
    Icon: Heart,
    tone: Colors.magenta,
    match: (t) => isNewCharityCoin(t),
  },
  {
    id: "infra-tools",
    label: "Infra Tools",
    Icon: Shield,
    tone: Colors.violet,
    match: (t) =>
      isUtilityRunner(t) &&
      /infra|depin|oracle|bridge|rpc|data|protocol|network|sdk|api/i.test(tokenHaystack(t)),
  },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const { listings, refresh, isRefreshing } = useLaunchpad();
  const { userId, isAuthenticated } = useAuth();
  const { watchlist, addWatch, removeWatch } = useApp();
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState<string>("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchResolvedToken, setSearchResolvedToken] = useState<LaunchToken | null>(null);

  useEffect(() => {
    let alive = true;
    const q = query.trim();
    if (q.length === 0 || !extractSolanaAddress(q)) {
      setSearchResolvedToken(null);
      return () => {
        alive = false;
      };
    }
    void (async () => {
      try {
        const token = await fetchLaunchTokenForSearchQuery(q);
        if (alive) setSearchResolvedToken(token);
      } catch (e) {
        console.log("[discover] contract search fetch failed", e instanceof Error ? e.message : e);
        if (alive) setSearchResolvedToken(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [query]);

  const publicListings = useMemo<LaunchToken[]>(
    () =>
      listings.filter(
        (t) => t.approvalStatus !== "pending" && t.approvalStatus !== "rejected" && isDiscoverSafeToken(t),
      ),
    [listings],
  );

  const searchableListings = useMemo<LaunchToken[]>(
    () => mergeTokenSearchResult(listings, searchResolvedToken),
    [listings, searchResolvedToken],
  );

  const filtered = useMemo<LaunchToken[]>(() => {
    const q = query.trim();
    const pastedAddress = extractSolanaAddress(q);
    let items = searchableListings.slice();
    if (pastedAddress) {
      return items
        .filter(
          (t) =>
            tokenMatchesSearch(t, q) &&
            t.approvalStatus !== "rejected" &&
            (isDiscoverSafeToken(t) || (!!userId && t.ownerId === userId)),
        )
        .sort((a, b) => getTokenSearchRank(a, q) - getTokenSearchRank(b, q) || b.createdAt - a.createdAt);
    }
    items = items.filter(
      (t) =>
        t.approvalStatus !== "rejected" &&
        (t.approvalStatus !== "pending" || section === "mine") &&
        (section === "mine" ? !!userId && t.ownerId === userId : isDiscoverSafeToken(t)),
    );
    if (section === "hot")
      items = items
        .filter((t) => hasRealMarket(t) && heatScore(t) > 0)
        .sort((a, b) => heatScore(b) - heatScore(a));
    if (section === "new") items = items.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    if (section === "migrated") items = items.filter(isFreshlyMigratedToken).sort((a, b) => b.createdAt - a.createdAt);
    if (section === "gainers")
      items = items
        .filter((t) => hasRealMarket(t) && (t.change24hPct ?? 0) > 0)
        .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0));
    if (section === "losers")
      items = items
        .filter((t) => hasRealMarket(t) && (t.change24hPct ?? 0) < 0)
        .sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0));
    if (section === "volume")
      items = items
        .filter((t) => hasRealMarket(t) && (t.volume24hUsd ?? 0) > 0)
        .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
    if (section === "whales")
      items = items
        .filter((t) => (t.holders ?? 0) > 100 || (t.volume24hUsd ?? 0) > 50_000)
        .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
    if (section === "featured") items = items.filter((t) => t.featured && t.approvalStatus !== "pending");
    if (section === "tokens") items = items.filter((t) => t.submittedBy === "user" && t.approvalStatus !== "pending");
    if (section === "mine") items = items.filter((t) => !!userId && t.ownerId === userId);
    if (section === "og") items = getOgMemeTokens(items, 80);
    if (section === "ai") items = getDailyAlphaRunners(items, 50);
    if (activeCat) {
      const cat = CATEGORIES.find((c) => c.id === activeCat);
      if (cat) {
        items = items.filter(cat.match);
        if (cat.id === "og-tokens") items = items.sort(compareOgMemeTokens);
      }
    }
    if (q.length > 0) {
      items = items
        .filter((t) => tokenMatchesSearch(t, q))
        .sort((a, b) => getTokenSearchRank(a, q) - getTokenSearchRank(b, q));
    }
    return items;
  }, [searchableListings, section, query, activeCat, userId]);

  const onOpen = useCallback(
    (id: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push({ pathname: "/launch/[id]", params: { id } });
    },
    [router],
  );

  const isWatching = useCallback(
    (contract: string) => watchlist.some((w) => w.contract === contract),
    [watchlist],
  );

  const onToggleWatch = useCallback(
    async (token: LaunchToken) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const existing = watchlist.find((w) => w.contract === token.contract);
      if (existing) await removeWatch(existing.id);
      else await addWatch({ ticker: token.ticker, contract: token.contract });
    },
    [watchlist, addWatch, removeWatch],
  );

  const onSubmitSearch = useCallback(() => {
    const q = query.trim();
    if (q.length === 0) return;
    setRecentSearches((prev) => [q, ...prev.filter((s) => s !== q)].slice(0, 6));
  }, [query]);

  const onListToken = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    router.push("/list-token");
  }, [isAuthenticated, router]);

  const stats = useMemo<DiscoverStats>(() => {
    const hot = publicListings.filter((t) => t.hot).length;
    const tracked = watchlist.length;
    const featured = publicListings.filter((t) => t.featured).length;
    const total = publicListings.length;
    const totalVol = publicListings.reduce((s, t) => s + (t.volume24hUsd ?? 0), 0);
    const listed = publicListings.filter((t) => t.submittedBy === "user").length;
    const pending = listings.filter((t) => t.approvalStatus === "pending" && !!userId && t.ownerId === userId).length;
    return { hot, tracked, featured, total, totalVol, listed, pending };
  }, [listings, publicListings, watchlist, userId]);

  const featuredSpotlight = useMemo(
    () =>
      publicListings
        .filter(isSpotlightDailyGainer)
        .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0) || heatScore(b) - heatScore(a)),
    [publicListings],
  );

  const topGainers = useMemo(
    () =>
      publicListings
        .filter((t) => hasRealMarket(t) && (t.change24hPct ?? 0) > 0)
        .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))
        .slice(0, 5),
    [publicListings],
  );

  const topLosers = useMemo(
    () =>
      publicListings
        .filter((t) => hasRealMarket(t) && (t.change24hPct ?? 0) < 0)
        .sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0))
        .slice(0, 5),
    [publicListings],
  );

  const newListings = useMemo(
    () => publicListings.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
    [publicListings],
  );

  const migratedTokens = useMemo(
    () => publicListings.filter(isFreshlyMigratedToken).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
    [publicListings],
  );

  const dailyRunners = useMemo(
    () =>
      publicListings
        .filter(isCurrentDailyRunner)
        .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0) || (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
        .slice(0, 8),
    [publicListings],
  );

  const aiPicks = useMemo(
    () => getDailyAlphaRunners(publicListings, 5),
    [publicListings],
  );

  const trendingTags = useMemo(() => {
    const counts = new Map<string, number>();
    publicListings.forEach((t) => t.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }, [publicListings]);

  const renderRow: ListRenderItem<LaunchToken> = useCallback(
    ({ item, index }) => (
      <DiscoverRow
        rank={index + 1}
        token={item}
        watching={isWatching(item.contract)}
        onPress={() => onOpen(item.id)}
        onWatch={() => onToggleWatch(item)}
      />
    ),
    [onOpen, onToggleWatch, isWatching],
  );

  const showSearchOnly = query.trim().length > 0;
  const isFiltering = showSearchOnly || activeCat !== null || section !== "all";
  const activeCategory = useMemo(
    () => (activeCat ? CATEGORIES.find((c) => c.id === activeCat) ?? null : null),
    [activeCat],
  );

  return (
    <View style={styles.root} testID="discover-screen">
      <AppBackground variant="market" />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.eyebrowRow}>
              <Compass color={Colors.cyan} size={13} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>ALPHA RADAR</Text>
            </View>
            <Text style={styles.title}>Discover</Text>
            <Text style={styles.sub}>
              {listings.length > 0
                ? `${stats.total} coins · tokens, AI runners, OG memes, live data`
                : "Tokens, AI runners, OG memes, and Solana market feeds"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push("/notifications");
              }}
              testID="discover-alerts"
            >
              <Bell color={Colors.text} size={16} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                refresh();
              }}
              style={styles.iconBtn}
              testID="discover-refresh"
            >
              <RefreshCcw
                color={Colors.text}
                size={16}
                strokeWidth={2.6}
                style={isRefreshing ? { opacity: 0.4 } : undefined}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Search color={Colors.muted} size={16} strokeWidth={2.4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSubmitSearch}
            placeholder="Search ticker, contract, name..."
            placeholderTextColor={Colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="discover-search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <X color={Colors.muted} size={14} strokeWidth={2.4} />
            </Pressable>
          ) : (
            <View style={styles.searchKbd}>
              <Filter color={Colors.muted} size={12} strokeWidth={2.6} />
            </View>
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => refresh()}
              tintColor={Colors.mint}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <DiscoverHeader
              showingSearch={showSearchOnly}
              isFiltering={isFiltering}
              activeCategory={activeCategory}
              query={query}
              filtered={filtered}
              section={section}
              setSection={setSection}
              activeCat={activeCat}
              setActiveCat={setActiveCat}
              stats={stats}
              featuredSpotlight={featuredSpotlight}
              topGainers={topGainers}
              topLosers={topLosers}
              newListings={newListings}
              migratedTokens={migratedTokens}
              dailyRunners={dailyRunners}
              aiPicks={aiPicks}
              trendingTags={trendingTags}
              recentSearches={recentSearches}
              clearRecent={() => setRecentSearches([])}
              setQuery={setQuery}
              onOpen={onOpen}
              isWatching={isWatching}
              onWatch={onToggleWatch}
              onListToken={onListToken}
            />
          }
          ListEmptyComponent={
            isFiltering ? (
              showSearchOnly ? (
                <SearchEmpty query={query} />
              ) : (
                <FilterEmpty
                  label={activeCategory ? activeCategory.label : SECTIONS.find((s) => s.id === section)?.label ?? ""}
                  onClear={() => {
                    setActiveCat(null);
                    setSection("all");
                  }}
                />
              )
            ) : null
          }
        />
      </SafeAreaView>
    </View>
  );
}

function DiscoverHeader({
  showingSearch,
  isFiltering,
  activeCategory,
  query,
  filtered,
  section,
  setSection,
  activeCat,
  setActiveCat,
  stats,
  featuredSpotlight,
  topGainers,
  topLosers,
  newListings,
  migratedTokens,
  dailyRunners,
  aiPicks,
  trendingTags,
  recentSearches,
  clearRecent,
  setQuery,
  onOpen,
  isWatching,
  onWatch,
  onListToken,
}: {
  showingSearch: boolean;
  isFiltering: boolean;
  activeCategory: Category | null;
  query: string;
  filtered: LaunchToken[];
  section: Section;
  setSection: (s: Section) => void;
  activeCat: string | null;
  setActiveCat: (id: string | null) => void;
  stats: DiscoverStats;
  featuredSpotlight: LaunchToken[];
  topGainers: LaunchToken[];
  topLosers: LaunchToken[];
  newListings: LaunchToken[];
  migratedTokens: LaunchToken[];
  dailyRunners: LaunchToken[];
  aiPicks: LaunchToken[];
  trendingTags: { tag: string; count: number }[];
  recentSearches: string[];
  clearRecent: () => void;
  setQuery: (q: string) => void;
  onOpen: (id: string) => void;
  isWatching: (c: string) => boolean;
  onWatch: (t: LaunchToken) => void;
  onListToken: () => void;
}) {
  if (showingSearch) {
    return (
      <View style={styles.searchHeader}>
        <View style={styles.searchHeadRow}>
          <Text style={styles.searchHeadTitle}>
            {filtered.length} {filtered.length === 1 ? "result" : "results"}
          </Text>
          <Text style={styles.searchHeadSub}>for &quot;{query}&quot;</Text>
        </View>
      </View>
    );
  }

  if (isFiltering) {
    const sectionMeta = SECTIONS.find((s) => s.id === section);
    const filterTone = activeCategory?.tone ?? Colors.mint;
    const FilterIcon = activeCategory?.Icon ?? sectionMeta?.Icon ?? Sparkles;
    const filterLabel = activeCategory?.label ?? sectionMeta?.label ?? "All";
    return (
      <View>
        <View style={styles.filterHeader}>
          <View style={[styles.filterIcon, { backgroundColor: `${filterTone}1A`, borderColor: `${filterTone}33` }]}>
            <FilterIcon color={filterTone} size={16} strokeWidth={2.6} />
          </View>
          <View style={styles.filterMid}>
            <Text style={styles.filterTitle}>{filterLabel}</Text>
            <Text style={styles.filterSub}>
              {filtered.length} {filtered.length === 1 ? "token" : "tokens"}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setActiveCat(null);
              setSection("all");
            }}
            style={styles.filterClear}
            hitSlop={10}
            testID="discover-clear-filter"
          >
            <X color={Colors.text} size={12} strokeWidth={2.8} />
            <Text style={styles.filterClearText}>Clear</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {SECTIONS.map((s) => {
            const active = section === s.id && !activeCategory;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveCat(null);
                  setSection(s.id);
                }}
                style={[styles.chip, active && styles.chipActive]}
                testID={`discover-${s.id}`}
              >
                <s.Icon color={active ? Colors.ink : Colors.text} size={13} strokeWidth={2.6} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View>
      <DiscoverLaunchHero stats={stats} onListToken={onListToken} />

      {recentSearches.length > 0 ? (
        <View style={styles.recentWrap}>
          <View style={styles.recentHeader}>
            <Text style={styles.sectionLabel}>RECENT</Text>
            <Pressable onPress={clearRecent} hitSlop={8}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentRow}
          >
            {recentSearches.map((s) => (
              <Pressable
                key={s}
                style={styles.recentChip}
                onPress={() => setQuery(s)}
                testID={`recent-${s}`}
              >
                <Search color={Colors.muted} size={12} strokeWidth={2.6} />
                <Text style={styles.recentText}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <StatTile label="HOT" value={stats.hot.toString()} accent={Colors.orange} Icon={Flame} />
        <StatTile label="TOKENS" value={stats.listed.toString()} accent={Colors.mint} Icon={Rocket} />
        <StatTile
          label="FEATURED"
          value={stats.featured.toString()}
          accent={Colors.cyan}
          Icon={Star}
        />
        <StatTile
          label="24H VOL"
          value={fmtUsd(stats.totalVol)}
          accent={Colors.rose}
          Icon={BarChart3}
        />
      </View>

      <AlphaInsightsCard />
      <RunnerSourceStrip />

      <TokenOvalRail
        title="Spotlight +50% Today"
        subtitle="Safety gated: real liquidity, sane MC, holder checks"
        Icon={Sparkles}
        tone={Colors.mint}
        badge="50%+"
        tokens={featuredSpotlight.slice(0, 8)}
        onOpen={onOpen}
        onSeeAll={() => setSection("gainers")}
      />

      <TokenOvalRail
        title="Freshly Migrated"
        subtitle="New pump.fun graduates with live post-migration liquidity"
        Icon={Rocket}
        tone={Colors.orange}
        badge="PUMP → DEX"
        tokens={migratedTokens}
        onOpen={onOpen}
        onSeeAll={() => setSection("migrated")}
      />

      <TokenOvalRail
        title="Current Daily Runners"
        subtitle="Today’s active movers, filtered for scam/rug anomalies"
        Icon={Flame}
        tone={Colors.rose}
        badge="LIVE"
        tokens={dailyRunners}
        onOpen={onOpen}
        onSeeAll={() => setSection("gainers")}
      />

      <View style={styles.categoriesWrap}>
        <Text style={styles.sectionLabel}>DISCOVER CATEGORIES</Text>
        <View style={styles.categoriesGrid}>
          {CATEGORIES.map((c) => {
            const active = activeCat === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveCat(active ? null : c.id);
                }}
                style={[
                  styles.catCard,
                  active && { borderColor: c.tone, backgroundColor: `${c.tone}14` },
                ]}
                testID={`cat-${c.id}`}
              >
                <View style={[styles.catIcon, { backgroundColor: `${c.tone}1A` }]}>
                  <c.Icon color={c.tone} size={16} strokeWidth={2.6} />
                </View>
                <Text style={styles.catLabel}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.gainerLoserRow}>
        <MoverCard
          title="Top Gainers"
          Icon={TrendingUp}
          tone={Colors.mint}
          tokens={topGainers}
          onOpen={onOpen}
          positive
        />
        <MoverCard
          title="Top Losers"
          Icon={TrendingDown}
          tone={Colors.rose}
          tokens={topLosers}
          onOpen={onOpen}
          positive={false}
        />
      </View>

      {aiPicks.length > 0 ? (
        <View style={styles.aiWrap}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadLeft}>
              <Bot color={Colors.cyan} size={15} strokeWidth={2.6} />
              <Text style={styles.sectionTitle}>AI Daily Runners</Text>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>$1M+ VOL</Text>
              </View>
            </View>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSection("ai");
              }}
              hitSlop={8}
              testID="see-all-ai"
            >
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          <View style={styles.aiList}>
            {aiPicks.map((t, i) => (
              <AiPickRow
                key={t.id}
                rank={i + 1}
                token={t}
                onPress={() => onOpen(t.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <TokenOvalRail
        title="Newest Clean Pairs"
        subtitle="Fresh tokens that passed the rug-screen before display"
        Icon={Zap}
        tone={Colors.orange}
        badge="NEW"
        tokens={newListings}
        onOpen={onOpen}
        onSeeAll={() => setSection("new")}
        isWatching={isWatching}
        onWatch={onWatch}
      />

      {trendingTags.length > 0 ? (
        <View style={styles.tagsWrap}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadLeft}>
              <Hash color={Colors.mint} size={15} strokeWidth={2.6} />
              <Text style={styles.sectionTitle}>Trending tags</Text>
            </View>
          </View>
          <View style={styles.tagsRow}>
            {trendingTags.map(({ tag, count }) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>#{tag}</Text>
                <Text style={styles.tagCount}>{count}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.allWrap}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionHeadLeft}>
            <BarChart3 color={Colors.text} size={15} strokeWidth={2.6} />
            <Text style={styles.sectionTitle}>All coins</Text>
            <Text style={styles.sectionCount}>{filtered.length}</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSection(s.id);
                }}
                style={[styles.chip, active && styles.chipActive]}
                testID={`discover-${s.id}`}
              >
                <s.Icon color={active ? Colors.ink : Colors.text} size={13} strokeWidth={2.6} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {filtered.length === 0 ? <EmptyDiscover /> : null}
    </View>
  );
}

function DiscoverLaunchHero({ stats, onListToken }: { stats: DiscoverStats; onListToken: () => void }) {
  return (
    <View style={styles.launchHero} testID="discover-listing-hero">
      <LinearGradient
        colors={["rgba(244,198,91,0.18)", "rgba(229,231,235,0.065)", "rgba(0,0,0,0.1)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.launchHeroTop}>
        <View style={styles.launchHeroIcon}>
          <Rocket color={Colors.ink} size={22} strokeWidth={3} />
        </View>
        <View style={styles.launchHeroCopy}>
          <Text style={styles.launchHeroEyebrow}>FEATURED TOKEN QUEUE</Text>
          <Text style={styles.launchHeroTitle}>List direct to Discover</Text>
          <Text style={styles.launchHeroSub}>
            Submit any Solana token for the Featured rail. Admin approval keeps the front page clean and protects users.
          </Text>
        </View>
      </View>
      <View style={styles.launchHeroMetaRow}>
        <View style={styles.launchHeroMeta}>
          <Star color={Colors.goldBright} size={12} strokeWidth={3} />
          <Text style={styles.launchHeroMetaText}>{stats.featured} featured</Text>
        </View>
        <View style={styles.launchHeroMeta}>
          <ListChecks color={Colors.cyan} size={12} strokeWidth={3} />
          <Text style={styles.launchHeroMetaText}>{stats.pending} pending</Text>
        </View>
      </View>
      <Pressable onPress={onListToken} style={({ pressed }) => [styles.launchHeroBtn, pressed && styles.launchHeroBtnPressed]} testID="discover-list-token">
        <Plus color={Colors.ink} size={15} strokeWidth={3} />
        <Text style={styles.launchHeroBtnText}>Submit token</Text>
      </Pressable>
    </View>
  );
}

function StatTile({
  label,
  value,
  accent,
  Icon,
}: {
  label: string;
  value: string;
  accent: string;
  Icon: LucideIcon;
}) {
  return (
    <View style={[styles.statTile, { borderColor: `${accent}33` }]}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}1A` }]}>
        <Icon color={accent} size={13} strokeWidth={2.6} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RunnerSourceStrip() {
  const sources = [
    { label: "Pump.fun", sub: "migration scan", tone: Colors.orange },
    { label: "Birdeye", sub: "volume proof", tone: Colors.cyan },
    { label: "DexScreener", sub: "liq + pair age", tone: Colors.rose },
    { label: "Jupiter", sub: "holder checks", tone: Colors.mint },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.sourceRow}
    >
      {sources.map((source) => (
        <View key={source.label} style={[styles.sourcePill, { borderColor: `${source.tone}33` }]}> 
          <View style={[styles.sourceDot, { backgroundColor: source.tone }]} />
          <View>
            <Text style={styles.sourceLabel}>{source.label}</Text>
            <Text style={styles.sourceSub}>{source.sub}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function TokenOvalRail({
  title,
  subtitle,
  Icon,
  tone,
  badge,
  tokens,
  onOpen,
  onSeeAll,
  isWatching,
  onWatch,
}: {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  tone: string;
  badge: string;
  tokens: LaunchToken[];
  onOpen: (id: string) => void;
  onSeeAll: () => void;
  isWatching?: (contract: string) => boolean;
  onWatch?: (token: LaunchToken) => void;
}) {
  return (
    <View style={styles.ovalRailWrap}>
      <View style={styles.ovalRailHead}>
        <View style={styles.ovalRailHeadLeft}>
          <View style={[styles.ovalRailIcon, { backgroundColor: `${tone}18`, borderColor: `${tone}30` }]}> 
            <Icon color={tone} size={14} strokeWidth={2.8} />
          </View>
          <View style={styles.ovalRailCopy}>
            <View style={styles.ovalRailTitleRow}>
              <Text style={styles.sectionTitle}>{title}</Text>
              <View style={[styles.ovalRailBadge, { borderColor: `${tone}33`, backgroundColor: `${tone}12` }]}> 
                <Text style={[styles.ovalRailBadgeText, { color: tone }]}>{badge}</Text>
              </View>
            </View>
            <Text style={styles.ovalRailSub} numberOfLines={1}>{subtitle}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onSeeAll();
          }}
          hitSlop={8}
          testID={`see-all-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        >
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>
      {tokens.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ovalRailRow}>
          {tokens.map((token, index) => (
            <TokenOvalPill
              key={token.id}
              token={token}
              rank={index + 1}
              tone={tone}
              watching={isWatching?.(token.contract) ?? false}
              onPress={() => onOpen(token.id)}
              onWatch={onWatch ? () => onWatch(token) : undefined}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.ovalRailEmpty}>
          <Shield color={Colors.muted} size={13} strokeWidth={2.6} />
          <Text style={styles.ovalRailEmptyText}>Nothing safe enough for this rail right now.</Text>
        </View>
      )}
    </View>
  );
}

function TokenOvalPill({
  token,
  rank,
  tone,
  watching,
  onPress,
  onWatch,
}: {
  token: LaunchToken;
  rank: number;
  tone: string;
  watching: boolean;
  onPress: () => void;
  onWatch?: () => void;
}) {
  const positive = (token.change24hPct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  return (
    <Pressable onPress={onPress} style={styles.ovalPill} testID={`oval-token-${token.id}`}>
      <LinearGradient
        colors={[`${tone}18`, "rgba(255,255,255,0.035)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.ovalRank, { borderColor: `${tone}33` }]}> 
        <Text style={[styles.ovalRankText, { color: tone }]}>{rank}</Text>
      </View>
      <TokenAvatar
        uri={token.logoUrl}
        ticker={token.ticker}
        size={34}
        radius={17}
        gradient={[tone, Colors.cardSoft]}
      />
      <View style={styles.ovalMid}>
        <View style={styles.ovalTopLine}>
          <Text style={styles.ovalTicker} numberOfLines={1}>${token.ticker.replace("$", "")}</Text>
          {token.verified ? <Star color={Colors.cyan} size={9} fill={Colors.cyan} strokeWidth={2.4} /> : null}
        </View>
        <Text style={styles.ovalName} numberOfLines={1}>{token.name}</Text>
        <Text style={styles.ovalMeta} numberOfLines={1}>
          MC {formatUsd(token.marketCapUsd)} · LIQ {formatUsd(token.liquidityUsd)} · {fmtNum(token.holders)} holders
        </Text>
      </View>
      <View style={styles.ovalRight}>
        {token.change24hPct != null ? (
          <View style={[styles.ovalChange, { backgroundColor: `${accent}16`, borderColor: `${accent}24` }]}> 
            {positive ? <ArrowUpRight color={accent} size={10} strokeWidth={3} /> : <ArrowDownRight color={accent} size={10} strokeWidth={3} />}
            <Text style={[styles.ovalChangeText, { color: accent }]}>{positive ? "+" : ""}{token.change24hPct.toFixed(1)}%</Text>
          </View>
        ) : (
          <Text style={styles.ovalAge}>{tokenAgeLabel(token.createdAt)}</Text>
        )}
        {onWatch ? (
          <Pressable
            onPress={onWatch}
            hitSlop={8}
            style={[styles.ovalWatch, watching && styles.ovalWatchOn]}
            testID={`oval-watch-${token.id}`}
          >
            <Eye color={watching ? Colors.mint : Colors.muted} size={12} strokeWidth={2.6} fill={watching ? Colors.mint : "transparent"} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const SPOTLIGHT_GRADIENTS: [string, string][] = [
  [Colors.mint, Colors.cyan],
  [Colors.cyan, "#B8BEC8"],
  [Colors.rose, Colors.orange],
  ["#C9CED8", "#F4F4F5"],
  ["#B8BEC8", Colors.mint],
  [Colors.cyan, Colors.mint],
];

function SpotlightCard({
  token,
  index,
  onPress,
}: {
  token: LaunchToken;
  index: number;
  onPress: () => void;
}) {
  const grad = SPOTLIGHT_GRADIENTS[index % SPOTLIGHT_GRADIENTS.length];
  const positive = (token.change24hPct ?? 0) >= 0;
  return (
    <Pressable onPress={onPress} style={styles.spotlightCard} testID={`spotlight-${token.id}`}>
      <LinearGradient
        colors={[`${grad[0]}30`, `${grad[1]}10`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.spotlightInner}
      >
        <View style={styles.spotlightHead}>
          <View style={styles.spotlightBadge}>
            <Flame color={Colors.orange} size={10} strokeWidth={3} />
            <Text style={[styles.spotlightBadgeText, { color: Colors.orange }]}>50%+ DAILY</Text>
          </View>
          <View style={styles.spotlightVenue}>
            <Text style={styles.spotlightVenueText}>{token.venue.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.spotlightBody}>
          <TokenAvatar
            uri={token.logoUrl}
            ticker={token.ticker}
            size={52}
            radius={16}
            gradient={grad}
          />
          <Text style={styles.spotlightTicker} numberOfLines={1}>
            ${token.ticker.replace("$", "")}
          </Text>
          <Text style={styles.spotlightName} numberOfLines={1}>
            {token.name}
          </Text>
          {token.description ? (
            <Text style={styles.spotlightDesc} numberOfLines={2}>
              {token.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.spotlightFoot}>
          <View style={styles.spotStatBox}>
            <Text style={styles.spotStatLabel}>MC</Text>
            <Text style={styles.spotStatValue}>{formatUsd(token.marketCapUsd)}</Text>
          </View>
          <View style={styles.spotStatBox}>
            <Text style={styles.spotStatLabel}>VOL</Text>
            <Text style={styles.spotStatValue}>{formatUsd(token.volume24hUsd)}</Text>
          </View>
          {token.change24hPct != null ? (
            <View
              style={[
                styles.spotChange,
                {
                  backgroundColor: positive
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(180,180,188,0.12)",
                  borderColor: positive
                    ? "rgba(255,255,255,0.22)"
                    : "rgba(180,180,188,0.22)",
                },
              ]}
            >
              {positive ? (
                <TrendingUp color={Colors.mint} size={11} strokeWidth={3} />
              ) : (
                <TrendingDown color={Colors.rose} size={11} strokeWidth={3} />
              )}
              <Text
                style={[
                  styles.spotChangeText,
                  { color: positive ? Colors.mint : Colors.rose },
                ]}
              >
                {positive ? "+" : ""}
                {token.change24hPct.toFixed(1)}%
              </Text>
            </View>
          ) : (
            <View style={styles.spotChangeEmpty}>
              <Activity color={Colors.muted} size={11} strokeWidth={2.6} />
            </View>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function MoverCard({
  title,
  Icon,
  tone,
  tokens,
  positive,
  onOpen,
}: {
  title: string;
  Icon: LucideIcon;
  tone: string;
  tokens: LaunchToken[];
  positive: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <View style={[styles.moverCard, { borderColor: `${tone}28` }]}>
      <View style={styles.moverHead}>
        <Icon color={tone} size={13} strokeWidth={2.8} />
        <Text style={[styles.moverTitle, { color: tone }]}>{title}</Text>
      </View>
      {tokens.length === 0 ? (
        <View style={styles.moverEmpty}>
          <Text style={styles.moverEmptyText}>
            {positive ? "No gainers yet" : "No losers yet"}
          </Text>
        </View>
      ) : (
        tokens.map((t, i) => (
          <Pressable
            key={t.id}
            style={styles.moverRow}
            onPress={() => onOpen(t.id)}
            testID={`mover-${t.id}`}
          >
            <Text style={styles.moverRank}>{i + 1}</Text>
            <View style={styles.moverMid}>
              <Text style={styles.moverTicker} numberOfLines={1}>
                ${t.ticker.replace("$", "")}
              </Text>
              <Text style={styles.moverName} numberOfLines={1}>
                {t.name}
              </Text>
            </View>
            <View style={styles.moverChange}>
              {positive ? (
                <ArrowUpRight color={tone} size={11} strokeWidth={3} />
              ) : (
                <ArrowDownRight color={tone} size={11} strokeWidth={3} />
              )}
              <Text style={[styles.moverChangeText, { color: tone }]}>
                {positive ? "+" : ""}
                {(t.change24hPct ?? 0).toFixed(1)}%
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

function AiPickRow({
  rank,
  token,
  onPress,
}: {
  rank: number;
  token: LaunchToken;
  onPress: () => void;
}) {
  const score = getAlphaRunnerScore(token);
  return (
    <Pressable onPress={onPress} style={styles.aiRow} testID={`ai-${token.id}`}>
      <View style={styles.aiRank}>
        <Text style={styles.aiRankText}>{rank}</Text>
      </View>
      <TokenAvatar
        uri={token.logoUrl}
        ticker={token.ticker}
        size={36}
        radius={12}
        gradient={[Colors.cyan, "#B8BEC8"]}
      />
      <View style={styles.aiMid}>
        <View style={styles.aiTopRow}>
          <Text style={styles.aiTicker}>${token.ticker.replace("$", "")}</Text>
          {token.verified ? <Star color={Colors.cyan} size={10} fill={Colors.cyan} /> : null}
        </View>
        <Text style={styles.aiName} numberOfLines={1}>
          {token.name}
        </Text>
        <Text style={styles.aiMeta} numberOfLines={1}>
          VOL {formatUsd(token.volume24hUsd)} · MC {formatUsd(token.marketCapUsd)}
        </Text>
        <View style={styles.aiBar}>
          <View style={[styles.aiBarFill, { width: `${score}%` }]} />
        </View>
      </View>
      <View style={styles.aiScore}>
        <Text style={styles.aiScoreValue}>{score}</Text>
        <Text style={styles.aiScoreLabel}>SCORE</Text>
      </View>
    </Pressable>
  );
}

function NewLaunchCard({
  token,
  watching,
  onPress,
  onWatch,
}: {
  token: LaunchToken;
  watching: boolean;
  onPress: () => void;
  onWatch: () => void;
}) {
  const positive = (token.change24hPct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  const ageMin = Math.max(1, Math.floor((Date.now() - token.createdAt) / 60000));
  return (
    <Pressable onPress={onPress} style={styles.newCard} testID={`new-${token.id}`}>
      <View style={styles.newTopRow}>
        <TokenAvatar
          uri={token.logoUrl}
          ticker={token.ticker}
          size={36}
          radius={12}
          gradient={[Colors.orange, Colors.rose]}
        />
        <Pressable
          onPress={onWatch}
          hitSlop={6}
          style={[styles.newWatch, watching && { backgroundColor: "rgba(255,255,255,0.10)" }]}
          testID={`new-watch-${token.id}`}
        >
          <Eye
            color={watching ? Colors.mint : Colors.muted}
            size={12}
            strokeWidth={2.6}
            fill={watching ? Colors.mint : "transparent"}
          />
        </Pressable>
      </View>
      <Text style={styles.newTicker}>${token.ticker.replace("$", "")}</Text>
      <Text style={styles.newName} numberOfLines={1}>
        {token.name}
      </Text>
      <View style={styles.newAgeRow}>
        <View style={styles.newAgeDot} />
        <Text style={styles.newAge}>{ageMin}m ago</Text>
      </View>
      <View style={styles.newStats}>
        <View style={styles.newStatBox}>
          <Text style={styles.newStatLabel}>MC</Text>
          <Text style={styles.newStatValue}>{formatUsd(token.marketCapUsd)}</Text>
        </View>
        {token.change24hPct != null ? (
          <View style={[styles.newChange, { backgroundColor: `${accent}1A` }]}>
            <Text style={[styles.newChangeText, { color: accent }]}>
              {positive ? "+" : ""}
              {token.change24hPct.toFixed(1)}%
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function DiscoverRow({
  rank,
  token,
  watching,
  onPress,
  onWatch,
}: {
  rank: number;
  token: LaunchToken;
  watching: boolean;
  onPress: () => void;
  onWatch: () => void;
}) {
  const positive = (token.change24hPct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`discover-row-${token.id}`}>
      <Text style={styles.rank}>{rank}</Text>
      <TokenAvatar
        uri={token.logoUrl}
        ticker={token.ticker}
        size={40}
        radius={12}
        style={styles.rowAvatar}
      />
      <View style={styles.rowMid}>
        <View style={styles.rowNameRow}>
          <Text style={styles.rowName} numberOfLines={1}>
            {token.name}
          </Text>
          {token.verified ? (
            <Star color={Colors.cyan} size={10} fill={Colors.cyan} strokeWidth={2.4} />
          ) : null}
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.rowTicker}>${token.ticker.replace("$", "")}</Text>
          <Text style={styles.rowDot}>·</Text>
          <Text style={styles.rowVenue}>{token.venue}</Text>
          {token.hot ? (
            <>
              <Text style={styles.rowDot}>·</Text>
              <Flame color={Colors.orange} size={10} strokeWidth={3} />
            </>
          ) : null}
        </View>
        <Text style={styles.rowMc}>
          MC {formatUsd(token.marketCapUsd)} · VOL {formatUsd(token.volume24hUsd)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {token.change24hPct != null ? (
          <View style={[styles.rowChange, { backgroundColor: `${accent}1A` }]}>
            {positive ? (
              <TrendingUp color={accent} size={10} strokeWidth={3} />
            ) : (
              <TrendingDown color={accent} size={10} strokeWidth={3} />
            )}
            <Text style={[styles.rowChangeText, { color: accent }]}>
              {positive ? "+" : ""}
              {token.change24hPct.toFixed(1)}%
            </Text>
          </View>
        ) : (
          <View style={styles.rowChangeEmpty}>
            <Activity color={Colors.muted} size={10} strokeWidth={2.6} />
          </View>
        )}
        <Pressable
          onPress={onWatch}
          hitSlop={6}
          style={[styles.watchBtn, watching && styles.watchBtnOn]}
          testID={`watch-${token.id}`}
        >
          <Eye
            color={watching ? Colors.mint : Colors.muted}
            size={13}
            strokeWidth={2.6}
            fill={watching ? Colors.mint : "transparent"}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

function EmptyDiscover() {
  return (
    <View style={styles.empty} testID="discover-empty">
      <View style={styles.emptyIcon}>
        <Compass color={Colors.cyan} size={26} strokeWidth={2.4} />
      </View>
      <Text style={styles.emptyTitle}>No alpha yet</Text>
      <Text style={styles.emptyBody}>
        Tokens submitted through Discover surface here after admin approval, ranked by heat, volume, and AI score.
      </Text>
      <View style={styles.emptyTags}>
        <View style={styles.emptyTag}>
          <Crosshair color={Colors.mint} size={11} strokeWidth={2.6} />
          <Text style={styles.emptyTagText}>Snipe-ready</Text>
        </View>
        <View style={styles.emptyTag}>
          <ChartLine color={Colors.cyan} size={11} strokeWidth={2.6} />
          <Text style={styles.emptyTagText}>Live charts</Text>
        </View>
        <View style={styles.emptyTag}>
          <ArrowUpRight color={Colors.orange} size={11} strokeWidth={2.6} />
          <Text style={styles.emptyTagText}>Hot pairs</Text>
        </View>
      </View>
    </View>
  );
}

function FilterEmpty({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <View style={styles.searchEmpty} testID="filter-empty">
      <View style={styles.emptyIcon}>
        <Filter color={Colors.cyan} size={26} strokeWidth={2.4} />
      </View>
      <Text style={styles.emptyTitle}>No tokens in {label}</Text>
      <Text style={styles.emptyBody}>
        Nothing matches this filter right now. New pairs appear as Jupiter and DexScreener stream them in.
      </Text>
      <Pressable onPress={onClear} style={styles.emptyClear} testID="filter-empty-clear">
        <X color={Colors.ink} size={12} strokeWidth={3} />
        <Text style={styles.emptyClearText}>Clear filter</Text>
      </Pressable>
    </View>
  );
}

function SearchEmpty({ query }: { query: string }) {
  return (
    <View style={styles.searchEmpty} testID="search-empty">
      <View style={styles.searchEmptyIcon}>
        <Target color={Colors.rose} size={26} strokeWidth={2.4} />
      </View>
      <Text style={styles.emptyTitle}>No matches</Text>
      <Text style={styles.emptyBody}>
        Nothing found for &quot;{query}&quot;. Try a different ticker or contract address.
      </Text>
    </View>
  );
}

const formatUsd = fmtUsd;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  headerLeft: { flex: 1 },
  headerActions: { flexDirection: "row", gap: 8 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyebrow: { color: Colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: Colors.text, fontSize: 32, fontWeight: "900", letterSpacing: -1, marginTop: 6 },
  sub: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  searchWrap: {
    marginHorizontal: 20,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 16,
    backgroundColor: "rgba(16,19,29,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "600", padding: 0 },
  searchKbd: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  searchHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  searchHeadRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  searchHeadTitle: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  searchHeadSub: { color: Colors.muted, fontSize: 13, fontWeight: "700" },

  launchHero: {
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 24,
    overflow: "hidden",
    padding: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.22)",
    shadowColor: Colors.goldBright,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 8,
  },
  launchHeroTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  launchHeroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.goldBright,
    alignItems: "center",
    justifyContent: "center",
  },
  launchHeroCopy: { flex: 1, minWidth: 0 },
  launchHeroEyebrow: { color: Colors.goldBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  launchHeroTitle: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.6, marginTop: 4 },
  launchHeroSub: { color: Colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 5 },
  launchHeroMetaRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  launchHeroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  launchHeroMetaText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  launchHeroBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: Colors.goldBright,
    borderBottomWidth: 4,
    borderBottomColor: Colors.gold,
  },
  launchHeroBtnPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  launchHeroBtnText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

  recentWrap: { marginTop: 14 },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  recentRow: { paddingHorizontal: 20, gap: 8 },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  recentText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  clearText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  statsRow: { flexDirection: "row", gap: 6, paddingHorizontal: 20, marginTop: 16 },
  statTile: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
  },
  statIcon: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statValue: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 8, letterSpacing: -0.4 },
  statLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 2 },

  sourceRow: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
  },
  sourceDot: { width: 7, height: 7, borderRadius: 4 },
  sourceLabel: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  sourceSub: { color: Colors.muted, fontSize: 9, fontWeight: "800", marginTop: 1 },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  sectionCount: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  sectionLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  seeAll: { color: Colors.mint, fontSize: 12, fontWeight: "800" },

  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(244,244,245,0.10)",
    borderWidth: 1,
    borderColor: "rgba(244,244,245,0.22)",
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.rose },
  liveText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  ovalRailWrap: { marginTop: 24 },
  ovalRailHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
    gap: 12,
  },
  ovalRailHeadLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  ovalRailIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  ovalRailCopy: { flex: 1, minWidth: 0 },
  ovalRailTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  ovalRailBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  ovalRailBadgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  ovalRailSub: { color: Colors.muted, fontSize: 10.5, fontWeight: "700", marginTop: 2 },
  ovalRailRow: { paddingHorizontal: 16, gap: 10 },
  ovalRailEmpty: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  ovalRailEmptyText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  ovalPill: {
    width: 310,
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(16,16,14,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.075)",
  },
  ovalRank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
    borderWidth: 1,
  },
  ovalRankText: { fontSize: 10, fontWeight: "900" },
  ovalMid: { flex: 1, minWidth: 0 },
  ovalTopLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  ovalTicker: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  ovalName: { color: Colors.muted, fontSize: 10.5, fontWeight: "700", marginTop: 1 },
  ovalMeta: { color: Colors.muted2, fontSize: 9.5, fontWeight: "800", marginTop: 2 },
  ovalRight: { alignItems: "flex-end", gap: 5 },
  ovalChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  ovalChangeText: { fontSize: 10, fontWeight: "900" },
  ovalAge: { color: Colors.muted, fontSize: 10, fontWeight: "900" },
  ovalWatch: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  ovalWatchOn: { backgroundColor: "rgba(216,183,90,0.12)", borderColor: "rgba(216,183,90,0.28)" },

  spotlightWrap: { marginTop: 22 },
  spotlightContent: { paddingHorizontal: 16, gap: 12 },
  spotlightCard: {
    width: 280,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  spotlightInner: { padding: 16 },
  spotlightHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  spotlightBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  spotlightBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  spotlightVenue: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  spotlightVenueText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  spotlightBody: { marginTop: 18, alignItems: "flex-start" },
  spotlightAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  spotlightAvatarText: { color: Colors.ink, fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
  spotlightTicker: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6, marginTop: 12 },
  spotlightName: { color: Colors.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
  spotlightDesc: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 6 },
  spotlightFoot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  spotStatBox: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  spotStatLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  spotStatValue: { color: Colors.text, fontSize: 12, fontWeight: "900", marginTop: 2 },
  spotChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  spotChangeText: { fontSize: 11, fontWeight: "900" },
  spotChangeEmpty: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  categoriesWrap: { marginTop: 26, paddingHorizontal: 20 },
  categoriesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  catCard: {
    width: "31.5%",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    gap: 8,
  },
  catIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  catLabel: { color: Colors.text, fontSize: 12, fontWeight: "800" },

  gainerLoserRow: { flexDirection: "row", gap: 10, marginTop: 22, paddingHorizontal: 16 },
  moverCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
  },
  moverHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  moverTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  moverEmpty: { paddingVertical: 18, alignItems: "center" },
  moverEmptyText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  moverRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 },
  moverRank: { color: Colors.muted, fontSize: 11, fontWeight: "900", width: 14 },
  moverMid: { flex: 1, minWidth: 0 },
  moverTicker: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  moverName: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 1 },
  moverChange: { flexDirection: "row", alignItems: "center", gap: 2 },
  moverChangeText: { fontSize: 11, fontWeight: "900" },

  aiWrap: { marginTop: 26 },
  aiBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(229,231,235,0.10)",
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.22)",
  },
  aiBadgeText: { color: Colors.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  aiList: { marginHorizontal: 16, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  aiRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  aiRank: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(229,231,235,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiRankText: { color: Colors.cyan, fontSize: 10, fontWeight: "900" },
  aiAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  aiAvatarText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  aiMid: { flex: 1, minWidth: 0 },
  aiTopRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  aiTicker: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  aiName: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  aiMeta: { color: Colors.cyan, fontSize: 9.5, fontWeight: "800", marginTop: 2 },
  aiBar: { marginTop: 6, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  aiBarFill: { height: 4, backgroundColor: Colors.cyan, borderRadius: 2 },
  aiScore: { alignItems: "center", paddingHorizontal: 4 },
  aiScoreValue: { color: Colors.cyan, fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  aiScoreLabel: { color: Colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 },

  newWrap: { marginTop: 26 },
  newRow: { paddingHorizontal: 16, gap: 10 },
  newCard: {
    width: 152,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  newTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  newAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  newAvatarText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  newWatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  newTicker: { color: Colors.text, fontSize: 16, fontWeight: "900", marginTop: 12, letterSpacing: -0.4 },
  newName: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  newAgeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  newAgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.orange },
  newAge: { color: Colors.orange, fontSize: 10, fontWeight: "800" },
  newStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 6 },
  newStatBox: { flex: 1 },
  newStatLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  newStatValue: { color: Colors.text, fontSize: 11, fontWeight: "900", marginTop: 1 },
  newChange: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  newChangeText: { fontSize: 10, fontWeight: "900" },

  tagsWrap: { marginTop: 26 },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 20,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tagText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  tagCount: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },

  allWrap: { marginTop: 26 },
  chipsRow: { paddingHorizontal: 20, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chipActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  chipText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: Colors.ink, fontWeight: "900" },

  listContent: { paddingBottom: 140, paddingHorizontal: 0 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  rank: { color: Colors.muted, fontSize: 12, fontWeight: "900", width: 18 },
  rowAvatar: { width: 40, height: 40, borderRadius: 12, overflow: "hidden" },
  rowAvatarGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  rowAvatarText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  rowMid: { flex: 1, minWidth: 0 },
  rowNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowName: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  rowTicker: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  rowDot: { color: Colors.muted, fontSize: 11 },
  rowVenue: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  rowMc: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rowChangeText: { fontSize: 11, fontWeight: "900" },
  rowChangeEmpty: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  watchBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  watchBtnOn: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.22)" },
  separator: { height: 1, backgroundColor: "rgba(255,255,255,0.04)", marginHorizontal: 20 },

  empty: {
    marginTop: 24,
    marginBottom: 30,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(229,231,235,0.08)",
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 14 },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
  emptyTags: { flexDirection: "row", gap: 8, marginTop: 16, flexWrap: "wrap", justifyContent: "center" },
  emptyTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  emptyTagText: { color: Colors.text, fontSize: 11, fontWeight: "800" },

  searchEmpty: { marginTop: 40, alignItems: "center", paddingHorizontal: 24 },
  emptyClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.mint,
    marginTop: 16,
  },
  emptyClearText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },

  filterHeader: {
    marginTop: 16,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  filterIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  filterMid: { flex: 1, minWidth: 0 },
  filterTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  filterSub: { color: Colors.muted, fontSize: 11, fontWeight: "800", marginTop: 2 },
  filterClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterClearText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  searchEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(244,244,245,0.08)",
    borderWidth: 1,
    borderColor: "rgba(244,244,245,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
});
