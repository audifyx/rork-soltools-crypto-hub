import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Crown,
  DollarSign,
  Droplets,
  Filter,
  Flame,
  ListChecks,
  Plus,
  RefreshCcw,
  Rocket,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  UserCircle2,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
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

import TokenCard from "@/components/launchpad/TokenCard";
import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { getTokenBanner, getTokenLogo } from "@/utils/token-art";
import { LaunchSort, LaunchTab, LaunchToken, LaunchVenueFilter } from "@/types/launchpad";

const TABS: { key: LaunchTab; label: string; Icon: typeof Rocket }[] = [
  { key: "all", label: "All Tokens", Icon: Rocket },
  { key: "featured", label: "Featured", Icon: Star },
  { key: "mine", label: "My Listings", Icon: UserCircle2 },
];

const SORTS: { key: LaunchSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "trending", label: "Trending" },
  { key: "liquidity", label: "Liquidity" },
  { key: "marketcap", label: "Market Cap" },
  { key: "volume", label: "Volume" },
];

const VENUES: { key: LaunchVenueFilter; label: string }[] = [
  { key: "all", label: "All venues" },
  { key: "pumpfun", label: "pump.fun" },
  { key: "pumpswap", label: "pumpswap" },
  { key: "raydium", label: "raydium" },
  { key: "meteora", label: "meteora" },
  { key: "jupiter", label: "jupiter" },
  { key: "other", label: "other" },
];

function formatCurrency(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

export default function LaunchpadScreen() {
  const router = useRouter();
  const {
    filtered,
    featured,
    trending,
    stats,
    tab,
    setTab,
    sort,
    setSort,
    venue,
    setVenue,
    search,
    setSearch,
    refresh,
    isRefreshing,
    isLoading,
  } = useLaunchpad();

  const [sortOpen, setSortOpen] = useState<boolean>(false);
  const [venueOpen, setVenueOpen] = useState<boolean>(false);

  const onListToken = useCallback(() => {
    router.push("/list-token");
  }, [router]);

  const onOpenToken = useCallback(
    (id: string) => {
      router.push({ pathname: "/launch/[id]", params: { id } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: LaunchToken }) => (
      <View style={styles.gridCell}>
        <TokenCard token={item} onPress={() => onOpenToken(item.id)} onChart={() => onOpenToken(item.id)} />
      </View>
    ),
    [onOpenToken],
  );

  const sortLabel = useMemo(() => SORTS.find((s) => s.key === sort)?.label ?? "Sort", [sort]);
  const venueLabel = useMemo(() => VENUES.find((v) => v.key === venue)?.label ?? "All", [venue]);

  return (
    <View style={styles.root} testID="launchpad-screen">
      <AppBackground variant="market" />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing || isLoading}
              onRefresh={() => refresh()}
              tintColor={Colors.mint}
              colors={[Colors.mint]}
            />
          }
          ListHeaderComponent={
            <View>
              <HeroCard onListToken={onListToken} onRefresh={() => refresh()} refreshing={isRefreshing} />
              <StatsGrid
                listed={stats.listedTokens}
                volume={stats.volume24hUsd}
                liquidity={stats.totalLiquidityUsd}
                featured={stats.featuredCount}
              />
              <TrendingRail tokens={trending} onPress={onOpenToken} />
              <FeaturedSection tokens={featured} onPress={onOpenToken} />

              <View style={styles.filterTabsRow}>
                {TABS.map(({ key, label, Icon }) => {
                  const active = tab === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setTab(key)}
                      style={[styles.filterTabBtn, active && styles.filterTabBtnActive]}
                      testID={`launch-tab-${key}`}
                    >
                      <Icon
                        color={active ? Colors.mint : Colors.muted}
                        size={14}
                        strokeWidth={2.6}
                      />
                      <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.searchBar}>
                <Search color={Colors.muted} size={15} strokeWidth={2.4} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search tokens, ticker, contract..."
                  placeholderTextColor={Colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="launch-search"
                />
                {search.length > 0 ? (
                  <Pressable onPress={() => setSearch("")} hitSlop={10} testID="launch-search-clear">
                    <X color={Colors.muted} size={14} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.dropRow}>
                <Pressable
                  onPress={() => setVenueOpen(true)}
                  style={styles.dropBtn}
                  testID="venue-dropdown"
                >
                  <Filter color={Colors.muted} size={13} strokeWidth={2.4} />
                  <Text style={styles.dropText} numberOfLines={1}>
                    {venueLabel}
                  </Text>
                  <SlidersHorizontal color={Colors.muted} size={12} strokeWidth={2.4} />
                </Pressable>
                <Pressable
                  onPress={() => setSortOpen(true)}
                  style={styles.dropBtn}
                  testID="sort-dropdown"
                >
                  <Sparkles color={Colors.mint} size={13} strokeWidth={2.4} />
                  <Text style={styles.dropText} numberOfLines={1}>
                    {sortLabel}
                  </Text>
                  <SlidersHorizontal color={Colors.muted} size={12} strokeWidth={2.4} />
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState onListToken={onListToken} tab={tab} />}
        />
      </SafeAreaView>

      <PickerSheet
        visible={sortOpen}
        title="Sort by"
        onClose={() => setSortOpen(false)}
        options={SORTS}
        selected={sort}
        onSelect={(k) => {
          setSort(k);
          setSortOpen(false);
        }}
      />
      <PickerSheet
        visible={venueOpen}
        title="Filter venue"
        onClose={() => setVenueOpen(false)}
        options={VENUES}
        selected={venue}
        onSelect={(k) => {
          setVenue(k);
          setVenueOpen(false);
        }}
      />
    </View>
  );
}

function HeroCard({
  onListToken,
  onRefresh,
  refreshing,
}: {
  onListToken: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <View style={styles.heroWrap}>
      <LinearGradient
        colors={["rgba(255,255,255,0.14)", "rgba(229,231,235,0.04)", "rgba(0,0,0,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroGradient}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroIconBox}>
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconGradient}
            >
              <Rocket color={Colors.ink} size={22} strokeWidth={2.8} />
            </LinearGradient>
          </View>
          <View style={styles.heroTitleCol}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>Sol Tools Launch Pad</Text>
              <View style={styles.livePillTop}>
                <Sparkles color={Colors.mint} size={10} strokeWidth={3} />
                <Text style={styles.livePillTopText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.heroSub}>Discover & list the hottest Solana tokens</Text>
          </View>
        </View>

        <View style={styles.heroActions}>
          <View style={styles.miniLive}>
            <View style={styles.miniLiveDot} />
            <Text style={styles.miniLiveText}>LIVE</Text>
          </View>
          <Pressable
            onPress={onRefresh}
            style={[styles.refreshBtn, refreshing && styles.refreshBtnSpin]}
            testID="hero-refresh"
            hitSlop={6}
          >
            <RefreshCcw color={Colors.text} size={16} strokeWidth={2.6} />
          </Pressable>
          <Pressable onPress={onListToken} style={styles.listTokenBtn} testID="list-token-btn">
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.listTokenGradient}
            >
              <Plus color={Colors.ink} size={15} strokeWidth={3} />
              <Text style={styles.listTokenText}>List Your Token</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}

function StatsGrid({
  listed,
  volume,
  liquidity,
  featured,
}: {
  listed: number;
  volume: number;
  liquidity: number;
  featured: number;
}) {
  return (
    <View style={styles.statsGrid}>
      <StatCard
        Icon={Rocket}
        label="Listed Tokens"
        value={listed.toString()}
        tint="rgba(255,255,255,0.10)"
        color={Colors.mint}
      />
      <StatCard
        Icon={DollarSign}
        label="24h Volume"
        value={formatCurrency(volume)}
        tint="rgba(229,231,235,0.10)"
        color={Colors.cyan}
      />
      <StatCard
        Icon={Droplets}
        label="Total Liquidity"
        value={formatCurrency(liquidity)}
        tint="rgba(184,190,200,0.10)"
        color="#B8BEC8"
      />
      <StatCard
        Icon={Crown}
        label="Featured"
        value={featured.toString()}
        tint="rgba(201,206,216,0.10)"
        color={Colors.orange}
      />
    </View>
  );
}

function StatCard({
  Icon,
  label,
  value,
  tint,
  color,
}: {
  Icon: typeof Rocket;
  label: string;
  value: string;
  tint: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBox, { backgroundColor: tint }]}>
        <Icon color={color} size={16} strokeWidth={2.6} />
      </View>
      <Text style={styles.statCardLabel}>{label}</Text>
      <Text style={styles.statCardValue}>{value}</Text>
    </View>
  );
}

function TrendingRail({ tokens, onPress }: { tokens: LaunchToken[]; onPress: (id: string) => void }) {
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionIcon, { backgroundColor: "rgba(201,206,216,0.10)" }]}>
            <Flame color={Colors.orange} size={14} strokeWidth={2.6} />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Trending on Solana</Text>
            <Text style={styles.sectionSub}>Most boosted tokens right now</Text>
          </View>
        </View>
      </View>

      {tokens.length === 0 ? (
        <View style={styles.railEmpty}>
          <Text style={styles.railEmptyText}>
            Trending tokens will appear here once the community starts boosting listings.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railScroll}
        >
          {tokens.map((t, i) => (
            <TrendingChip key={t.id} token={t} rank={i + 1} onPress={() => onPress(t.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function TrendingChip({ token, rank, onPress }: { token: LaunchToken; rank: number; onPress: () => void }) {
  const positive = (token.change24hPct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  return (
    <Pressable onPress={onPress} style={styles.trendChip} testID={`trend-${token.id}`}>
      <View style={styles.trendRankWrap}>
        <View style={styles.trendRank}>
          <Text style={styles.trendRankText}>{rank}</Text>
        </View>
        <Image
          source={{ uri: getTokenLogo(token.logoUrl, token.id || token.ticker) }}
          style={styles.trendLogo}
          contentFit="cover"
        />
      </View>
      <View style={styles.trendInfo}>
        <Text style={styles.trendName} numberOfLines={1}>
          {token.name}
        </Text>
        <View style={styles.trendMetaRow}>
          <View style={styles.trendTickerPill}>
            <Text style={styles.trendTickerText}>${token.ticker.replace("$", "")}</Text>
          </View>
          {token.change24hPct != null ? (
            <View style={[styles.trendChangeBadge, { backgroundColor: `${accent}1A` }]}>
              {positive ? (
                <TrendingUp color={accent} size={9} strokeWidth={3} />
              ) : (
                <TrendingDown color={accent} size={9} strokeWidth={3} />
              )}
              <Text style={[styles.trendChangeText, { color: accent }]}>
                {positive ? "+" : ""}
                {token.change24hPct.toFixed(1)}%
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function FeaturedSection({ tokens, onPress }: { tokens: LaunchToken[]; onPress: (id: string) => void }) {
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionIcon, { backgroundColor: "rgba(201,206,216,0.10)" }]}>
            <Crown color={Colors.orange} size={14} strokeWidth={2.6} />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Featured Tokens</Text>
            <Text style={styles.sectionSub}>Promoted and verified tokens</Text>
          </View>
        </View>
      </View>

      {tokens.length === 0 ? (
        <View style={styles.featuredEmpty}>
          <Text style={styles.featuredEmptyTitle}>No featured tokens yet</Text>
          <Text style={styles.featuredEmptyBody}>
            Featured listings will appear here once boosted by the community.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredScroll}
        >
          {tokens.map((t) => (
            <FeaturedCard key={t.id} token={t} onPress={() => onPress(t.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function FeaturedCard({ token, onPress }: { token: LaunchToken; onPress: () => void }) {
  const positive = (token.change24hPct ?? 0) >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  return (
    <Pressable onPress={onPress} style={styles.featuredCard} testID={`featured-${token.id}`}>
      <View style={styles.featuredBanner}>
        <Image
          source={{ uri: getTokenBanner(token.bannerUrl, token.id || token.ticker) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={["rgba(3,7,8,0)", "rgba(3,7,8,0.55)", "rgba(3,7,8,0.95)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.featuredBannerTop}>
          <View style={styles.featuredBadge}>
            <Star color={Colors.orange} size={11} strokeWidth={3} fill={Colors.orange} />
            <Text style={styles.featuredBadgeText}>Featured</Text>
          </View>
          {token.change24hPct != null ? (
            <View style={[styles.featuredChange, { backgroundColor: `${accent}26`, borderColor: `${accent}66` }]}>
              {positive ? (
                <TrendingUp color={accent} size={10} strokeWidth={3} />
              ) : (
                <TrendingDown color={accent} size={10} strokeWidth={3} />
              )}
              <Text style={[styles.featuredChangeText, { color: accent }]}>
                {positive ? "+" : ""}
                {token.change24hPct.toFixed(1)}%
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.featuredFoot}>
        <Image
          source={{ uri: getTokenLogo(token.logoUrl, token.id || token.ticker) }}
          style={styles.featuredLogo}
          contentFit="cover"
        />
        <View style={styles.featuredInfo}>
          <Text style={styles.featuredName} numberOfLines={1}>
            {token.name}
          </Text>
          <View style={styles.featuredMetaRow}>
            <View style={styles.trendTickerPill}>
              <Text style={styles.trendTickerText}>${token.ticker.replace("$", "")}</Text>
            </View>
            <View style={styles.venueChip}>
              <Text style={styles.venueChipText}>{token.venue}</Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState({ onListToken, tab }: { onListToken: () => void; tab: LaunchTab }) {
  const title =
    tab === "mine"
      ? "You haven't listed any tokens"
      : tab === "featured"
        ? "No featured tokens"
        : "Be the first to list";
  const body =
    tab === "mine"
      ? "Submit your project to the launch pad and grow your community on SolTools."
      : tab === "featured"
        ? "Featured slots open up as projects get verified and boosted by the community."
        : "Drop your token contract, logo and links — we'll surface it across SolTools.";

  return (
    <View style={styles.emptyWrap} testID="launch-empty">
      <View style={styles.emptyIcon}>
        <ListChecks color={Colors.mint} size={26} strokeWidth={2.4} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      <Pressable onPress={onListToken} style={styles.emptyBtn} testID="empty-list-btn">
        <LinearGradient
          colors={[Colors.mint, Colors.cyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyBtnGrad}
        >
          <Plus color={Colors.ink} size={14} strokeWidth={3} />
          <Text style={styles.emptyBtnText}>List Your Token</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

interface PickerOption<K extends string> {
  key: K;
  label: string;
}

function PickerSheet<K extends string>({
  visible,
  title,
  onClose,
  options,
  selected,
  onSelect,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  options: PickerOption<K>[];
  selected: K;
  onSelect: (key: K) => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {options.map((o) => {
            const active = o.key === selected;
            return (
              <Pressable
                key={o.key}
                onPress={() => onSelect(o.key)}
                style={[styles.sheetRow, active && styles.sheetRowActive]}
                testID={`sheet-${o.key}`}
              >
                <Text style={[styles.sheetRowText, active && styles.sheetRowTextActive]}>
                  {o.label}
                </Text>
                {active ? <View style={styles.sheetActiveDot} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  listContent: { paddingBottom: 140 },
  columnWrap: { paddingHorizontal: 14, gap: 12, marginBottom: 12 },
  gridCell: { flex: 1, minWidth: 0 },

  heroWrap: {
    margin: 16,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: Colors.card,
  },
  heroGradient: { padding: 18, paddingVertical: 20 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIconBox: { borderRadius: 16, overflow: "hidden" },
  heroIconGradient: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  heroTitleCol: { flex: 1, minWidth: 0 },
  heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  heroTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  livePillTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  livePillTopText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroSub: { color: Colors.muted, fontSize: 13, fontWeight: "700", marginTop: 6, lineHeight: 18 },

  heroActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  miniLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  miniLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.mint },
  miniLiveText: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshBtnSpin: { opacity: 0.6 },
  listTokenBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  listTokenGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
  },
  listTokenText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
    marginTop: 4,
  },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statIconBox: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  statCardLabel: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.4, marginTop: 8 },
  statCardValue: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 2, letterSpacing: -0.3 },

  sectionWrap: { marginTop: 22 },
  sectionHeader: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  sectionSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  railScroll: { paddingHorizontal: 14, gap: 10 },
  railEmpty: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  railEmptyText: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17 },

  trendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    minWidth: 220,
  },
  trendRankWrap: { position: "relative" },
  trendLogo: { width: 36, height: 36, borderRadius: 12 },
  trendLogoFallback: { backgroundColor: Colors.cardSoft, alignItems: "center", justifyContent: "center" },
  trendLogoText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  trendRank: {
    position: "absolute",
    top: -6,
    left: -6,
    zIndex: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  trendRankText: { color: Colors.ink, fontSize: 10, fontWeight: "900" },
  trendInfo: { flex: 1 },
  trendName: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  trendMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  trendTickerPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  trendTickerText: { color: Colors.muted, fontSize: 10, fontWeight: "800" },
  trendChangeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  trendChangeText: { fontSize: 10, fontWeight: "900" },

  featuredScroll: { paddingHorizontal: 14, gap: 12 },
  featuredEmpty: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(201,206,216,0.16)",
    backgroundColor: "rgba(201,206,216,0.035)",
  },
  featuredEmptyTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  featuredEmptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", marginTop: 4, lineHeight: 17 },
  featuredCard: {
    width: 300,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(201,206,216,0.18)",
  },
  featuredBanner: { height: 150, position: "relative", overflow: "hidden" },
  featuredBannerTop: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  featuredChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  featuredChangeText: { fontSize: 10, fontWeight: "900" },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(201,206,216,0.24)",
  },
  featuredBadgeText: { color: Colors.orange, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  featuredFoot: { padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginTop: -22 },
  featuredLogo: { width: 48, height: 48, borderRadius: 14, borderWidth: 3, borderColor: Colors.card },
  featuredInfo: { flex: 1 },
  featuredName: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  featuredMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  venueChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  venueChipText: { color: Colors.mint, fontSize: 10, fontWeight: "800" },

  filterTabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    marginTop: 22,
  },
  filterTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  filterTabBtnActive: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.30)",
    shadowColor: Colors.mint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 4,
  },
  filterTabText: { color: Colors.muted, fontSize: 13, fontWeight: "800" },
  filterTabTextActive: { color: Colors.mint, fontWeight: "900" },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 11,
    borderRadius: 999,
    backgroundColor: "rgba(184,190,200,0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(184,190,200,0.24)",
    shadowColor: "#B8BEC8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  dropRow: { flexDirection: "row", gap: 10, paddingHorizontal: 14, marginTop: 12, marginBottom: 14 },
  dropBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: Colors.mint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 4,
  },
  dropText: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },

  emptyWrap: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.035)",
    alignItems: "center",
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    marginBottom: 14,
  },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 14,
  },
  emptyBtn: { borderRadius: 12, overflow: "hidden" },
  emptyBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 14,
  },
  sheetTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", marginBottom: 8 },
  sheetRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetRowActive: { backgroundColor: "rgba(255,255,255,0.08)" },
  sheetRowText: { color: Colors.muted, fontSize: 14, fontWeight: "700" },
  sheetRowTextActive: { color: Colors.mint, fontWeight: "900" },
  sheetActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.mint },
});
