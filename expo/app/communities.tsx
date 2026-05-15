import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Coins,
  Flame,
  Gamepad2,
  Image as ImageIcon,
  LineChart,
  Lock,
  Plus,
  Radio,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  ListRenderItem,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import AppBackground from "@/components/ui/AppBackground";
import { navigateBack } from "@/lib/navigation";
import { Community, useSocial } from "@/providers/social-provider";

type Tab = "for-you" | "trending" | "joined" | "all";

const ACCENT = "#3FA9FF";
const ACCENT_WARM = "#62D0FF";

type LucideIcon = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
  fill?: string;
}>;

type CategoryDef = {
  id: Community["category"] | "all";
  label: string;
  Icon: LucideIcon;
  tone: string;
};

const CATEGORIES: CategoryDef[] = [
  { id: "all", label: "All", Icon: Sparkles, tone: ACCENT },
  { id: "memes", label: "Memes", Icon: Flame, tone: "#FF7A45" },
  { id: "ai", label: "AI", Icon: Bot, tone: "#62D0FF" },
  { id: "defi", label: "DeFi", Icon: Coins, tone: "#3FA9FF" },
  { id: "trading", label: "Trading", Icon: LineChart, tone: "#7DD3FC" },
  { id: "alpha", label: "Alpha", Icon: Zap, tone: "#F472B6" },
  { id: "nft", label: "NFT", Icon: ImageIcon, tone: "#C084FC" },
  { id: "gaming", label: "Gaming", Icon: Gamepad2, tone: "#34D399" },
  { id: "infra", label: "Infra", Icon: Wrench, tone: "#94A3B8" },
];

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ------------------------------------------------------------------ */
/*  Pulse dot – uses Animated for a soft heartbeat                     */
/* ------------------------------------------------------------------ */
function PulseDot({ color, size = 7 }: { color: string; size?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline / heat bars – pseudo-random but deterministic            */
/* ------------------------------------------------------------------ */
function HeatBars({ seed, tone }: { seed: string; tone: string }) {
  const bars = useMemo(() => {
    const h = hashSeed(seed);
    return Array.from({ length: 14 }).map((_, i) => {
      const v = ((h >> i) & 0xff) / 255;
      return 0.25 + v * 0.75;
    });
  }, [seed]);
  return (
    <View style={styles.heatRow}>
      {bars.map((b, i) => (
        <View
          key={i}
          style={[
            styles.heatBar,
            { height: 4 + b * 14, backgroundColor: `${tone}${i > 8 ? "FF" : "88"}` },
          ]}
        />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */
export default function CommunitiesScreen() {
  const router = useRouter();
  const { communities, joinedCommunities, isJoined, toggleJoin, trendingCommunities } = useSocial();
  const [query, setQuery] = useState<string>("");
  const [tab, setTab] = useState<Tab>("for-you");
  const [category, setCategory] = useState<CategoryDef["id"]>("all");

  const spotlight = useMemo<Community | undefined>(() => trendingCommunities[0], [trendingCommunities]);
  const rail = useMemo<Community[]>(
    () => trendingCommunities.slice(1, 8),
    [trendingCommunities],
  );

  const totalMembers = useMemo(
    () => communities.reduce((s, c) => s + c.members, 0),
    [communities],
  );
  const totalOnline = useMemo(
    () => communities.reduce((s, c) => s + c.online, 0),
    [communities],
  );

  const data = useMemo<Community[]>(() => {
    let base: Community[];
    if (tab === "joined") base = joinedCommunities;
    else if (tab === "trending") base = trendingCommunities;
    else if (tab === "for-you") {
      const joinedIds = new Set(joinedCommunities.map((c) => c.id));
      base = communities
        .slice()
        .sort((a, b) => {
          const aScore = (a.trending ? 1000 : 0) + a.online + (joinedIds.has(a.id) ? 5000 : 0);
          const bScore = (b.trending ? 1000 : 0) + b.online + (joinedIds.has(b.id) ? 5000 : 0);
          return bScore - aScore;
        });
    } else base = communities;
    if (category !== "all") base = base.filter((c) => c.category === category);
    const q = query.trim().toLowerCase();
    if (q.length === 0) return base;
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.includes(q)),
    );
  }, [tab, communities, joinedCommunities, trendingCommunities, query, category]);

  const onOpenCommunity = useCallback(
    (id: string) => {
      Haptics.selectionAsync().catch(() => {});
      router.push({ pathname: "/community/[id]", params: { id } });
    },
    [router],
  );

  const onToggleJoin = useCallback(
    (c: Community) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      toggleJoin(c.id);
    },
    [toggleJoin],
  );

  const renderItem: ListRenderItem<Community> = ({ item, index }) => (
    <CommunityRow
      community={item}
      index={index}
      joined={isJoined(item.id)}
      onPress={() => onOpenCommunity(item.id)}
      onJoin={() => onToggleJoin(item)}
    />
  );

  return (
    <View style={styles.root} testID="communities-screen">
      <AppBackground variant="social" />
      {/* Ambient mesh tint */}
      <LinearGradient
        colors={["rgba(63,169,255,0.18)", "rgba(98,208,255,0.04)", "rgba(0,0,0,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.7 }}
        style={styles.mesh1}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["rgba(91,141,239,0.0)", "rgba(91,141,239,0.10)", "rgba(0,0,0,0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.mesh2}
        pointerEvents="none"
      />

      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            <View>
              {/* Masthead */}
              <View style={styles.header}>
                <Pressable
                  onPress={() => navigateBack(router, "/(tabs)/home")}
                  style={styles.backBtn}
                  hitSlop={8}
                  testID="communities-back"
                >
                  <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
                </Pressable>
                <View style={styles.mastheadRule} />
                <Text style={styles.mastheadKicker}>ISSUE · {new Date().getFullYear()}</Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    router.push("/community/create");
                  }}
                  style={styles.createBtn}
                  testID="create-community"
                >
                  <Plus color={Colors.ink} size={16} strokeWidth={3} />
                </Pressable>
              </View>

              {/* Display title */}
              <View style={styles.titleBlock}>
                <Text style={styles.titleHuge}>Tribes</Text>
                <View style={styles.titleSubRow}>
                  <PulseDot color={Colors.mint} size={6} />
                  <Text style={styles.titleSubText}>
                    {fmtCount(totalOnline)} online · {fmtCount(totalMembers)} members ·{" "}
                    {communities.length} tribes
                  </Text>
                </View>
              </View>

              {/* Live trending ticker */}
              <TickerStrip items={trendingCommunities.slice(0, 8)} />

              {/* Spotlight – the big editorial card */}
              {spotlight ? (
                <SpotlightCard
                  community={spotlight}
                  joined={isJoined(spotlight.id)}
                  onPress={() => onOpenCommunity(spotlight.id)}
                  onJoin={() => onToggleJoin(spotlight)}
                />
              ) : null}

              {/* Trending rail – smaller cards */}
              {rail.length > 0 ? (
                <View style={styles.railWrap}>
                  <View style={styles.sectionHeadRow}>
                    <TrendingUp color={ACCENT_WARM} size={14} strokeWidth={2.8} />
                    <Text style={styles.sectionTitle}>Buzzing now</Text>
                    <View style={styles.dotSep} />
                    <Text style={styles.sectionSub}>updated live</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.railRow}
                    decelerationRate="fast"
                    snapToInterval={184}
                  >
                    {rail.map((c, i) => (
                      <RailCard
                        key={c.id}
                        community={c}
                        rank={i + 2}
                        joined={isJoined(c.id)}
                        onPress={() => onOpenCommunity(c.id)}
                        onJoin={() => onToggleJoin(c)}
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {/* Search */}
              <View style={styles.searchWrap}>
                <Search color={Colors.muted} size={16} strokeWidth={2.4} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search tribes, tickers, tags…"
                  placeholderTextColor={Colors.muted2}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {query.length > 0 ? (
                  <Pressable
                    onPress={() => setQuery("")}
                    hitSlop={8}
                    style={styles.searchClear}
                  >
                    <Text style={styles.searchClearText}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Category dock */}
              <View style={styles.catWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.catRow}
                >
                  {CATEGORIES.map((c) => {
                    const active = category === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setCategory(c.id);
                        }}
                        style={[
                          styles.catChip,
                          {
                            borderColor: active ? c.tone : "rgba(255,255,255,0.08)",
                            backgroundColor: active ? `${c.tone}24` : "rgba(255,255,255,0.025)",
                          },
                          active && {
                            shadowColor: c.tone,
                            shadowOpacity: 0.45,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: 4 },
                          },
                        ]}
                        testID={`cat-${c.id}`}
                      >
                        <c.Icon color={c.tone} size={13} strokeWidth={2.8} />
                        <Text
                          style={[
                            styles.catChipText,
                            { color: active ? c.tone : Colors.text },
                          ]}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Segmented tabs */}
              <View style={styles.tabsRow}>
                {(["for-you", "trending", "joined", "all"] as Tab[]).map((t) => (
                  <TabPill
                    key={t}
                    label={
                      t === "for-you"
                        ? "For you"
                        : t === "trending"
                          ? "Trending"
                          : t === "joined"
                            ? `Joined${joinedCommunities.length > 0 ? ` · ${joinedCommunities.length}` : ""}`
                            : "All"
                    }
                    active={tab === t}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setTab(t);
                    }}
                  />
                ))}
              </View>

              <View style={styles.listHeadRow}>
                <Text style={styles.listHeadLabel}>
                  {data.length} {data.length === 1 ? "tribe" : "tribes"}
                </Text>
                <View style={styles.listHeadDot} />
                <Text style={styles.listHeadSub}>
                  {tab === "for-you"
                    ? "Curated for you"
                    : tab === "trending"
                      ? "Hot right now"
                      : tab === "joined"
                        ? "Your homebase"
                        : "Whole directory"}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Users color={ACCENT} size={26} strokeWidth={2.4} />
              </View>
              <Text style={styles.emptyTitle}>
                {tab === "joined" ? "You haven't joined yet" : "No communities match"}
              </Text>
              <Text style={styles.emptyBody}>
                {tab === "joined"
                  ? "Discover and join a community to see it here."
                  : "Try a different filter or search to find your tribe."}
              </Text>
              {tab === "joined" ? (
                <Pressable
                  onPress={() => setTab("for-you")}
                  style={styles.emptyCta}
                  testID="empty-cta"
                >
                  <Text style={styles.emptyCtaText}>Explore tribes</Text>
                  <ArrowUpRight color={Colors.ink} size={13} strokeWidth={3} />
                </Pressable>
              ) : null}
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Ticker strip                                                       */
/* ------------------------------------------------------------------ */
function TickerStrip({ items }: { items: Community[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.tickerWrap}>
      <View style={styles.tickerTag}>
        <Radio color={Colors.ink} size={10} strokeWidth={3} />
        <Text style={styles.tickerTagText}>LIVE</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tickerRow}
      >
        {items.map((c) => (
          <View key={c.id} style={styles.tickerItem}>
            <Text style={styles.tickerEmoji}>{c.iconEmoji}</Text>
            <Text style={styles.tickerName}>{c.name}</Text>
            <View style={[styles.tickerDot, { backgroundColor: c.accent[0] }]} />
            <Text style={[styles.tickerOnline, { color: c.accent[0] }]}>
              {fmtCount(c.online)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Spotlight card – cinematic large feature                           */
/* ------------------------------------------------------------------ */
function SpotlightCard({
  community,
  joined,
  onPress,
  onJoin,
}: {
  community: Community;
  joined: boolean;
  onPress: () => void;
  onJoin: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.spotlight, { shadowColor: community.accent[0] }]}
      testID={`spotlight-${community.id}`}
    >
      <View style={styles.spotlightArt}>
        <LinearGradient
          colors={[community.accent[0], community.accent[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {community.bannerUrl ? (
          <Image source={{ uri: community.bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.92)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.spotlightArtTop}>
          <View style={styles.spotlightHotPill}>
            <Flame color={"#FF7A45"} size={10} strokeWidth={3} />
            <Text style={styles.spotlightHotText}>FEATURED · #1</Text>
          </View>
          {community.verified ? (
            <View style={styles.spotlightVerified}>
              <BadgeCheck color={Colors.cyan} size={14} strokeWidth={2.8} />
            </View>
          ) : null}
        </View>
        <View style={styles.spotlightArtBottom}>
          <View style={styles.spotlightAvatar}>
            {community.avatarUrl ? (
              <Image source={{ uri: community.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={styles.spotlightAvatarEmoji}>{community.iconEmoji}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.spotlightName} numberOfLines={1}>
              {community.name}
            </Text>
            <Text style={styles.spotlightHandle} numberOfLines={1}>
              {community.handle}
            </Text>
          </View>
          {community.isPrivate || community.holderOnly ? (
            <View style={styles.spotlightLock}>
              <Lock color={Colors.text} size={12} strokeWidth={2.6} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.spotlightBody}>
        <Text style={styles.spotlightDesc} numberOfLines={2}>
          {community.description || `The official community for ${community.name}.`}
        </Text>

        <View style={styles.spotlightStatsRow}>
          <View style={styles.spotlightStat}>
            <Text style={[styles.spotlightStatVal, { color: community.accent[0] }]}>
              {fmtCount(community.members)}
            </Text>
            <Text style={styles.spotlightStatLbl}>members</Text>
          </View>
          <View style={styles.spotlightStatDivider} />
          <View style={styles.spotlightStat}>
            <View style={styles.spotlightStatTop}>
              <PulseDot color={Colors.mint} size={5} />
              <Text style={[styles.spotlightStatVal, { color: Colors.mint }]}>
                {fmtCount(community.online)}
              </Text>
            </View>
            <Text style={styles.spotlightStatLbl}>online</Text>
          </View>
          <View style={styles.spotlightStatDivider} />
          <View style={styles.spotlightStat}>
            <Text style={styles.spotlightStatVal}>{fmtCount(community.posts)}</Text>
            <Text style={styles.spotlightStatLbl}>posts</Text>
          </View>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onJoin();
            }}
            hitSlop={6}
            style={[
              styles.spotlightJoinBtn,
              joined
                ? styles.joinBtnOn
                : { backgroundColor: community.accent[0], shadowColor: community.accent[0] },
            ]}
            testID={`spotlight-join-${community.id}`}
          >
            <Text style={[styles.joinText, { color: joined ? Colors.text : Colors.ink }]}>
              {joined ? "JOINED" : "JOIN"}
            </Text>
            {!joined ? <ArrowUpRight color={Colors.ink} size={12} strokeWidth={3} /> : null}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Rail card                                                          */
/* ------------------------------------------------------------------ */
function RailCard({
  community,
  rank,
  joined,
  onPress,
  onJoin,
}: {
  community: Community;
  rank: number;
  joined: boolean;
  onPress: () => void;
  onJoin: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.rail, { shadowColor: community.accent[0] }]}
      testID={`rail-${community.id}`}
    >
      <View style={styles.railArt}>
        <LinearGradient
          colors={[community.accent[0], community.accent[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {community.bannerUrl ? (
          <Image source={{ uri: community.bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.railRank}>#{rank}</Text>
        <View style={styles.railAvatar}>
          {community.avatarUrl ? (
            <Image source={{ uri: community.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Text style={styles.railAvatarEmoji}>{community.iconEmoji}</Text>
          )}
        </View>
      </View>
      <View style={styles.railBody}>
        <View style={styles.railTitleRow}>
          <Text style={styles.railName} numberOfLines={1}>
            {community.name}
          </Text>
          {community.verified ? <BadgeCheck color={Colors.cyan} size={11} strokeWidth={2.8} /> : null}
        </View>
        <HeatBars seed={community.id} tone={community.accent[0]} />
        <View style={styles.railFoot}>
          <View style={styles.railStat}>
            <PulseDot color={Colors.mint} size={4} />
            <Text style={styles.railStatText}>{fmtCount(community.online)}</Text>
          </View>
          <Text style={styles.railStatDim}>· {fmtCount(community.members)}</Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onJoin();
            }}
            hitSlop={6}
            style={[
              styles.railJoinBtn,
              joined ? styles.joinBtnOn : { backgroundColor: community.accent[0] },
            ]}
            testID={`rail-join-${community.id}`}
          >
            <Text style={[styles.railJoinText, { color: joined ? Colors.text : Colors.ink }]}>
              {joined ? "✓" : "JOIN"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab pill                                                           */
/* ------------------------------------------------------------------ */
function TabPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabPill, active && styles.tabPillActive]}
      testID={`tab-${label.toLowerCase().split(" ")[0]}`}
    >
      <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Row card                                                           */
/* ------------------------------------------------------------------ */
function CommunityRow({
  community,
  index,
  joined,
  onPress,
  onJoin,
}: {
  community: Community;
  index: number;
  joined: boolean;
  onPress: () => void;
  onJoin: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`community-card-${community.id}`}>
      <LinearGradient
        colors={[`${community.accent[0]}22`, "rgba(255,255,255,0.02)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.rowLeft}>
        <Text style={styles.rowIndex}>{String(index + 1).padStart(2, "0")}</Text>
        <View style={styles.rowAvatar}>
          <LinearGradient
            colors={[community.accent[0], community.accent[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {community.avatarUrl ? (
            <Image source={{ uri: community.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Text style={styles.rowAvatarEmoji}>{community.iconEmoji}</Text>
          )}
          {community.online > 0 ? (
            <View style={styles.rowAvatarPulse}>
              <PulseDot color={Colors.mint} size={6} />
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.rowMid}>
        <View style={styles.rowTitleRow}>
          <Text style={styles.rowName} numberOfLines={1}>
            {community.name}
          </Text>
          {community.verified ? (
            <BadgeCheck color={Colors.cyan} size={13} strokeWidth={2.8} />
          ) : null}
          {community.trending ? (
            <View style={styles.rowTrendDot}>
              <Flame color={"#FF7A45"} size={9} strokeWidth={3} />
            </View>
          ) : null}
          {community.isPrivate || community.holderOnly ? (
            <Lock color={Colors.muted} size={11} strokeWidth={2.6} />
          ) : null}
        </View>
        <Text style={styles.rowDesc} numberOfLines={1}>
          {community.description || `The official community for ${community.name}.`}
        </Text>
        <View style={styles.rowMeta}>
          <View style={styles.rowMetaItem}>
            <Users color={Colors.muted} size={10} strokeWidth={2.8} />
            <Text style={styles.rowMetaText}>{fmtCount(community.members)}</Text>
          </View>
          <View style={styles.rowMetaItem}>
            <PulseDot color={Colors.mint} size={5} />
            <Text style={styles.rowMetaText}>{fmtCount(community.online)}</Text>
          </View>
          {community.tags.slice(0, 2).map((t) => (
            <Text key={t} style={styles.rowTag}>
              #{t}
            </Text>
          ))}
        </View>
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onJoin();
        }}
        hitSlop={8}
        style={[
          styles.rowJoinBtn,
          joined ? styles.joinBtnOn : { backgroundColor: community.accent[0] },
        ]}
        testID={`row-join-${community.id}`}
      >
        {joined ? (
          <Text style={[styles.joinText, { color: Colors.text }]}>JOINED</Text>
        ) : (
          <>
            <Text style={[styles.joinText, { color: Colors.ink }]}>JOIN</Text>
            <ArrowUpRight color={Colors.ink} size={11} strokeWidth={3} />
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  listContent: { paddingBottom: 140 },
  sep: { height: 8 },

  mesh1: {
    position: "absolute",
    top: -60,
    left: -40,
    width: 360,
    height: 360,
    borderRadius: 360,
  },
  mesh2: {
    position: "absolute",
    top: 200,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 320,
  },

  /* Masthead */
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  mastheadRule: {
    width: 22,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  mastheadKicker: {
    flex: 1,
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  createBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  titleBlock: { paddingHorizontal: 18, marginTop: 10 },
  titleHuge: {
    color: Colors.text,
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: -3,
    lineHeight: 60,
  },
  titleSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  titleSubText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  /* Ticker */
  tickerWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    paddingLeft: 18,
    gap: 10,
  },
  tickerTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#FF3B30",
  },
  tickerTagText: {
    color: Colors.ink,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  tickerRow: { gap: 14, paddingRight: 18 },
  tickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tickerEmoji: { fontSize: 13 },
  tickerName: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  tickerDot: { width: 4, height: 4, borderRadius: 2 },
  tickerOnline: { fontSize: 11, fontWeight: "900" },

  /* Spotlight */
  spotlight: {
    marginHorizontal: 18,
    marginTop: 18,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "rgba(10,12,18,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  spotlightArt: { height: 200, overflow: "hidden" },
  spotlightArtTop: {
    position: "absolute",
    top: 12,
    left: 14,
    right: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  spotlightHotPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,122,69,0.55)",
  },
  spotlightHotText: { color: "#FF7A45", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  spotlightVerified: {
    padding: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  spotlightArtBottom: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  spotlightAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.ink,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.18)",
  },
  spotlightAvatarEmoji: { fontSize: 28 },
  spotlightName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  spotlightHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 1 },
  spotlightLock: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  spotlightBody: { padding: 16 },
  spotlightDesc: { color: Colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  spotlightStatsRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  spotlightStat: { alignItems: "flex-start" },
  spotlightStatTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  spotlightStatVal: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  spotlightStatLbl: {
    color: Colors.muted2,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 1,
    textTransform: "uppercase",
  },
  spotlightStatDivider: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  spotlightJoinBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },

  /* Rail */
  railWrap: { marginTop: 22 },
  sectionHeadRow: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  sectionSub: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  dotSep: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.muted2 },

  railRow: { paddingHorizontal: 14, gap: 10, paddingBottom: 4 },
  rail: {
    width: 174,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(10,12,18,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  railArt: { height: 84, position: "relative" },
  railRank: {
    position: "absolute",
    top: 8,
    right: 10,
    color: Colors.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
    opacity: 0.85,
  },
  railAvatar: {
    position: "absolute",
    bottom: -16,
    left: 12,
    width: 38,
    height: 38,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.ink,
    borderWidth: 2.5,
    borderColor: Colors.ink,
  },
  railAvatarEmoji: { fontSize: 19 },
  railBody: { paddingHorizontal: 12, paddingTop: 22, paddingBottom: 12 },
  railTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  railName: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2, flexShrink: 1 },
  heatRow: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 18, marginTop: 8 },
  heatBar: { width: 3, borderRadius: 2 },
  railFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  railStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  railStatText: { color: Colors.text, fontSize: 10.5, fontWeight: "800" },
  railStatDim: { color: Colors.muted2, fontSize: 10, fontWeight: "700" },
  railJoinBtn: {
    marginLeft: "auto",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  railJoinText: { fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5 },

  /* Search */
  searchWrap: {
    marginHorizontal: 18,
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 9,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  searchClear: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  searchClearText: { color: Colors.text, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4 },

  /* Categories */
  catWrap: { marginTop: 16 },
  catRow: { paddingHorizontal: 14, gap: 8 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    elevation: 0,
  },
  catChipText: { fontSize: 12, fontWeight: "800" },

  /* Tabs */
  tabsRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    marginTop: 18,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabPillActive: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  tabPillText: { color: Colors.text, fontSize: 12.5, fontWeight: "800" },
  tabPillTextActive: { color: Colors.ink, fontWeight: "900" },

  /* List head */
  listHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    marginTop: 18,
    marginBottom: 8,
  },
  listHeadLabel: { color: Colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  listHeadDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.muted },
  listHeadSub: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

  /* Row */
  row: {
    marginHorizontal: 14,
    padding: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIndex: {
    color: Colors.muted2,
    fontSize: 11,
    fontWeight: "900",
    width: 22,
    letterSpacing: 0.4,
  },
  rowAvatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  rowAvatarEmoji: { fontSize: 24 },
  rowAvatarPulse: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1, minWidth: 0 },
  rowTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowName: {
    color: Colors.text,
    fontSize: 14.5,
    fontWeight: "900",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  rowTrendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,122,69,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowDesc: { color: Colors.muted, fontSize: 11.5, fontWeight: "600", marginTop: 2 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  rowMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowMetaText: { color: Colors.text, fontSize: 10.5, fontWeight: "800" },
  rowTag: { color: Colors.muted, fontSize: 10.5, fontWeight: "700" },

  /* Join */
  rowJoinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  joinBtnOn: {
    backgroundColor: "rgba(221,227,236,0.08)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.18)",
  },
  joinText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },

  /* Empty */
  empty: { paddingHorizontal: 32, paddingVertical: 60, alignItems: "center" },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: `${ACCENT}1F`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
  emptyCta: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  emptyCtaText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
});
