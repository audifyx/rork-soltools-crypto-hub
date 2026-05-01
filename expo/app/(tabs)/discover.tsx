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
  Diamond,
  Eye,
  Filter,
  Flame,
  Gamepad2,
  Gem,
  Hash,
  Layers,
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
  Waves,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
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
import Colors from "@/constants/colors";
import { useApp } from "@/providers/app-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { LaunchToken } from "@/types/launchpad";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number; fill?: string }>;

type Section = "all" | "hot" | "new" | "gainers" | "losers" | "whales" | "ai";

const SECTIONS: { id: Section; label: string; Icon: LucideIcon }[] = [
  { id: "all", label: "All", Icon: Sparkles },
  { id: "hot", label: "Hot", Icon: Flame },
  { id: "new", label: "New", Icon: Zap },
  { id: "gainers", label: "Gainers", Icon: TrendingUp },
  { id: "losers", label: "Losers", Icon: TrendingDown },
  { id: "whales", label: "Whales", Icon: Waves },
  { id: "ai", label: "AI Picks", Icon: Bot },
];

type Category = {
  id: string;
  label: string;
  Icon: LucideIcon;
  tone: string;
  match: (t: LaunchToken) => boolean;
};

const CATEGORIES: Category[] = [
  {
    id: "memes",
    label: "Memes",
    Icon: Flame,
    tone: Colors.orange,
    match: (t) => t.tags.some((x) => /meme|dog|cat|pepe|frog/i.test(x)),
  },
  {
    id: "ai",
    label: "AI",
    Icon: Bot,
    tone: Colors.cyan,
    match: (t) => t.tags.some((x) => /ai|agent|gpt|llm/i.test(x)),
  },
  {
    id: "gaming",
    label: "Gaming",
    Icon: Gamepad2,
    tone: Colors.mint,
    match: (t) => t.tags.some((x) => /game|play|p2e/i.test(x)),
  },
  {
    id: "defi",
    label: "DeFi",
    Icon: Layers,
    tone: Colors.cyan,
    match: (t) => t.tags.some((x) => /defi|swap|lend|yield|liquid/i.test(x)),
  },
  {
    id: "nft",
    label: "NFT",
    Icon: Gem,
    tone: Colors.rose,
    match: (t) => t.tags.some((x) => /nft|collectible|art/i.test(x)),
  },
  {
    id: "infra",
    label: "Infra",
    Icon: Shield,
    tone: Colors.mint,
    match: (t) => t.tags.some((x) => /infra|tool|sdk|node/i.test(x)),
  },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const { listings, refresh, isRefreshing } = useLaunchpad();
  const { watchlist, addWatch, removeWatch } = useApp();
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState<string>("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const filtered = useMemo<LaunchToken[]>(() => {
    let items = listings.slice();
    if (section === "hot") items = items.filter((t) => t.hot);
    if (section === "new") items = items.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    if (section === "gainers")
      items = items
        .filter((t) => (t.change24hPct ?? 0) > 0)
        .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0));
    if (section === "losers")
      items = items
        .filter((t) => (t.change24hPct ?? 0) < 0)
        .sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0));
    if (section === "whales")
      items = items.filter((t) => (t.holders ?? 0) > 100 || (t.volume24hUsd ?? 0) > 50_000);
    if (section === "ai") items = items.filter((t) => t.featured || t.upvotes > 0);
    if (activeCat) {
      const cat = CATEGORIES.find((c) => c.id === activeCat);
      if (cat) items = items.filter(cat.match);
    }
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.ticker.toLowerCase().includes(q) ||
          t.contract.toLowerCase().includes(q),
      );
    }
    return items;
  }, [listings, section, query, activeCat]);

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

  const stats = useMemo(() => {
    const hot = listings.filter((t) => t.hot).length;
    const tracked = watchlist.length;
    const featured = listings.filter((t) => t.featured).length;
    const total = listings.length;
    const totalVol = listings.reduce((s, t) => s + (t.volume24hUsd ?? 0), 0);
    return { hot, tracked, featured, total, totalVol };
  }, [listings, watchlist]);

  const featuredSpotlight = useMemo(
    () => listings.filter((t) => t.featured || t.hot).slice(0, 6),
    [listings],
  );

  const topGainers = useMemo(
    () =>
      listings
        .filter((t) => (t.change24hPct ?? 0) > 0)
        .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))
        .slice(0, 5),
    [listings],
  );

  const topLosers = useMemo(
    () =>
      listings
        .filter((t) => (t.change24hPct ?? 0) < 0)
        .sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0))
        .slice(0, 5),
    [listings],
  );

  const newListings = useMemo(
    () => listings.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
    [listings],
  );

  const aiPicks = useMemo(
    () =>
      listings
        .filter((t) => t.featured || t.upvotes > 0)
        .sort((a, b) => b.upvotes - a.upvotes)
        .slice(0, 5),
    [listings],
  );

  const trendingTags = useMemo(() => {
    const counts = new Map<string, number>();
    listings.forEach((t) => t.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }, [listings]);

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

  return (
    <View style={styles.root} testID="discover-screen">
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
                ? `${stats.total} tokens · ${stats.hot} hot`
                : "Trending pairs, whales, AI picks"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconBtn} testID="discover-alerts">
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
          data={showSearchOnly ? filtered : []}
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
              aiPicks={aiPicks}
              trendingTags={trendingTags}
              recentSearches={recentSearches}
              clearRecent={() => setRecentSearches([])}
              setQuery={setQuery}
              onOpen={onOpen}
              isWatching={isWatching}
              onWatch={onToggleWatch}
            />
          }
          ListEmptyComponent={
            showSearchOnly ? (
              <SearchEmpty query={query} />
            ) : null
          }
        />
      </SafeAreaView>
    </View>
  );
}

function DiscoverHeader({
  showingSearch,
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
  aiPicks,
  trendingTags,
  recentSearches,
  clearRecent,
  setQuery,
  onOpen,
  isWatching,
  onWatch,
}: {
  showingSearch: boolean;
  query: string;
  filtered: LaunchToken[];
  section: Section;
  setSection: (s: Section) => void;
  activeCat: string | null;
  setActiveCat: (id: string | null) => void;
  stats: { hot: number; tracked: number; featured: number; total: number; totalVol: number };
  featuredSpotlight: LaunchToken[];
  topGainers: LaunchToken[];
  topLosers: LaunchToken[];
  newListings: LaunchToken[];
  aiPicks: LaunchToken[];
  trendingTags: { tag: string; count: number }[];
  recentSearches: string[];
  clearRecent: () => void;
  setQuery: (q: string) => void;
  onOpen: (id: string) => void;
  isWatching: (c: string) => boolean;
  onWatch: (t: LaunchToken) => void;
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

  return (
    <View>
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
        <StatTile label="LISTED" value={stats.total.toString()} accent={Colors.mint} Icon={Rocket} />
        <StatTile
          label="TRACKING"
          value={stats.tracked.toString()}
          accent={Colors.cyan}
          Icon={Eye}
        />
        <StatTile
          label="FEAT"
          value={stats.featured.toString()}
          accent={Colors.rose}
          Icon={Sparkles}
        />
      </View>

      {featuredSpotlight.length > 0 ? (
        <View style={styles.spotlightWrap}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadLeft}>
              <Sparkles color={Colors.mint} size={15} strokeWidth={2.6} />
              <Text style={styles.sectionTitle}>Spotlight</Text>
            </View>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.spotlightContent}
            decelerationRate="fast"
          >
            {featuredSpotlight.map((t, idx) => (
              <SpotlightCard
                key={t.id}
                token={t}
                index={idx}
                onPress={() => onOpen(t.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.categoriesWrap}>
        <Text style={styles.sectionLabel}>EXPLORE BY CATEGORY</Text>
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
              <Text style={styles.sectionTitle}>AI Picks</Text>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>BETA</Text>
              </View>
            </View>
            <Text style={styles.seeAll}>See all</Text>
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

      {newListings.length > 0 ? (
        <View style={styles.newWrap}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadLeft}>
              <Zap color={Colors.orange} size={15} strokeWidth={2.6} />
              <Text style={styles.sectionTitle}>New Launches</Text>
            </View>
            <Text style={styles.seeAll}>See all</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.newRow}
          >
            {newListings.map((t) => (
              <NewLaunchCard
                key={t.id}
                token={t}
                watching={isWatching(t.contract)}
                onPress={() => onOpen(t.id)}
                onWatch={() => onWatch(t)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

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
            <Text style={styles.sectionTitle}>All tokens</Text>
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

const SPOTLIGHT_GRADIENTS: [string, string][] = [
  [Colors.mint, Colors.cyan],
  [Colors.cyan, "#7B5BFF"],
  [Colors.rose, Colors.orange],
  ["#FFB84C", "#FF5D8F"],
  ["#7B5BFF", Colors.mint],
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
            {token.featured ? (
              <>
                <Award color={Colors.mint} size={10} strokeWidth={3} />
                <Text style={[styles.spotlightBadgeText, { color: Colors.mint }]}>FEATURED</Text>
              </>
            ) : (
              <>
                <Flame color={Colors.orange} size={10} strokeWidth={3} />
                <Text style={[styles.spotlightBadgeText, { color: Colors.orange }]}>HOT</Text>
              </>
            )}
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
                    ? "rgba(85,245,178,0.16)"
                    : "rgba(255,93,143,0.16)",
                  borderColor: positive
                    ? "rgba(85,245,178,0.4)"
                    : "rgba(255,93,143,0.4)",
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
  const score = Math.min(99, 60 + (token.upvotes ?? 0) * 3 + (token.featured ? 15 : 0));
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
        gradient={[Colors.cyan, "#7B5BFF"]}
      />
      <View style={styles.aiMid}>
        <View style={styles.aiTopRow}>
          <Text style={styles.aiTicker}>${token.ticker.replace("$", "")}</Text>
          {token.verified ? <Star color={Colors.cyan} size={10} fill={Colors.cyan} /> : null}
        </View>
        <Text style={styles.aiName} numberOfLines={1}>
          {token.name}
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
          style={[styles.newWatch, watching && { backgroundColor: "rgba(85,245,178,0.14)" }]}
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
          {token.price != null && token.price > 0
            ? `${token.price < 0.01 ? token.price.toFixed(6) : token.price.toFixed(token.price < 1 ? 4 : 2)} · `
            : ""}
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
        Tokens listed on the launch pad will surface here, ranked by heat, volume, and AI score.
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

function formatUsd(n?: number | null): string {
  if (n == null || n === 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
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
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: "rgba(255,93,143,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.35)",
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.rose },
  liveText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

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
    backgroundColor: "rgba(56,215,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.4)",
  },
  aiBadgeText: { color: Colors.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  aiList: { marginHorizontal: 16, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  aiRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  aiRank: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(56,215,255,0.14)",
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
  watchBtnOn: { backgroundColor: "rgba(85,245,178,0.12)", borderColor: "rgba(85,245,178,0.4)" },
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
    backgroundColor: "rgba(56,215,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.3)",
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
  searchEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,93,143,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
});
