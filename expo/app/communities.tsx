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
  Compass,
  Flame,
  Gamepad2,
  Image as ImageIcon,
  Layers,
  LineChart,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
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
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import AppBackground from "@/components/ui/AppBackground";
import { navigateBack } from "@/lib/navigation";
import { Community, useSocial } from "@/providers/social-provider";

type Tab = "for-you" | "trending" | "joined" | "all";

const ACCENT = "#F8C947";

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
  { id: "memes", label: "Memes", Icon: Flame, tone: Colors.orange },
  { id: "ai", label: "AI", Icon: Bot, tone: Colors.cyan },
  { id: "defi", label: "DeFi", Icon: Coins, tone: Colors.mint },
  { id: "trading", label: "Trading", Icon: LineChart, tone: "#7DD3FC" },
  { id: "alpha", label: "Alpha", Icon: Zap, tone: "#F472B6" },
  { id: "nft", label: "NFT", Icon: ImageIcon, tone: "#C084FC" },
  { id: "gaming", label: "Gaming", Icon: Gamepad2, tone: "#34D399" },
  { id: "infra", label: "Infra", Icon: Wrench, tone: "#94A3B8" },
];

function fmtCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function CommunitiesScreen() {
  const router = useRouter();
  const { communities, joinedCommunities, isJoined, toggleJoin, trendingCommunities } = useSocial();
  const [query, setQuery] = useState<string>("");
  const [tab, setTab] = useState<Tab>("for-you");
  const [category, setCategory] = useState<CategoryDef["id"]>("all");

  const featured = useMemo<Community[]>(
    () => trendingCommunities.slice(0, 5),
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

  const renderItem: ListRenderItem<Community> = ({ item }) => (
    <CommunityRow
      community={item}
      joined={isJoined(item.id)}
      onPress={() => onOpenCommunity(item.id)}
      onJoin={() => onToggleJoin(item)}
    />
  );

  return (
    <View style={styles.root} testID="communities-screen">
      <AppBackground variant="social" />
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
              <View style={styles.header}>
                <Pressable
                  onPress={() => navigateBack(router, "/(tabs)/home")}
                  style={styles.backBtn}
                  hitSlop={8}
                  testID="communities-back"
                >
                  <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
                </Pressable>
                <View style={styles.headerLeft}>
                  <View style={styles.eyebrowRow}>
                    <Compass color={ACCENT} size={11} strokeWidth={2.8} />
                    <Text style={styles.eyebrow}>TRIBES · LIVE</Text>
                  </View>
                  <Text style={styles.title}>Communities</Text>
                </View>
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

              <View style={styles.heroCard}>
                <LinearGradient
                  colors={["rgba(248,201,71,0.20)", "rgba(96,165,250,0.10)", "rgba(0,0,0,0)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroStatsRow}>
                  <HeroStat value={String(communities.length)} label="Tribes" tone={ACCENT} />
                  <View style={styles.heroDivider} />
                  <HeroStat value={fmtCount(totalMembers)} label="Members" tone={Colors.mint} />
                  <View style={styles.heroDivider} />
                  <HeroStat value={fmtCount(totalOnline)} label="Online" tone={Colors.cyan} dot />
                </View>
                <Text style={styles.heroBody}>
                  Find your tribe. Share alpha, talk markets, and trade together.
                </Text>
              </View>

              <View style={styles.searchWrap}>
                <Search color={Colors.muted} size={16} strokeWidth={2.4} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search communities, tickers, tags…"
                  placeholderTextColor={Colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {featured.length > 0 ? (
                <View style={styles.featuredWrap}>
                  <View style={styles.sectionHeadRow}>
                    <View style={styles.sectionHeadLeft}>
                      <Flame color={Colors.orange} size={14} strokeWidth={2.8} />
                      <Text style={styles.sectionTitle}>Featured</Text>
                      <View style={styles.livePill}>
                        <View style={styles.liveDot} />
                        <Text style={styles.livePillText}>HOT</Text>
                      </View>
                    </View>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredRow}
                    decelerationRate="fast"
                    snapToInterval={272}
                  >
                    {featured.map((c) => (
                      <FeaturedCard
                        key={c.id}
                        community={c}
                        joined={isJoined(c.id)}
                        onPress={() => onOpenCommunity(c.id)}
                        onJoin={() => onToggleJoin(c)}
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : null}

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
                            backgroundColor: active ? `${c.tone}1F` : "rgba(255,255,255,0.03)",
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
                    ? "Picked for you"
                    : tab === "trending"
                      ? "Buzzing right now"
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
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

function HeroStat({
  value,
  label,
  tone,
  dot,
}: {
  value: string;
  label: string;
  tone: string;
  dot?: boolean;
}) {
  return (
    <View style={styles.heroStat}>
      <View style={styles.heroStatTop}>
        {dot ? <View style={[styles.heroStatDot, { backgroundColor: tone }]} /> : null}
        <Text style={[styles.heroStatValue, { color: tone }]}>{value}</Text>
      </View>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

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

function FeaturedCard({
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
      style={[styles.featuredCard, { shadowColor: community.accent[0] }]}
      testID={`featured-${community.id}`}
    >
      <View style={styles.featuredBanner}>
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
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.78)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.featuredTopRow}>
          <View style={styles.featuredHotPill}>
            <Flame color={Colors.orange} size={10} strokeWidth={3} />
            <Text style={styles.featuredHotText}>TRENDING</Text>
          </View>
          {community.verified ? (
            <BadgeCheck color={Colors.cyan} size={14} strokeWidth={2.8} />
          ) : null}
        </View>
        <View style={styles.featuredAvatarWrap}>
          <View style={styles.featuredAvatar}>
            {community.avatarUrl ? (
              <Image source={{ uri: community.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={styles.featuredAvatarEmoji}>{community.iconEmoji}</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.featuredBody}>
        <View style={styles.featuredTitleRow}>
          <Text style={styles.featuredName} numberOfLines={1}>
            {community.name}
          </Text>
        </View>
        <Text style={styles.featuredDesc} numberOfLines={2}>
          {community.description || `The official community for ${community.name}.`}
        </Text>
        <View style={styles.featuredFoot}>
          <View style={styles.featuredStat}>
            <Users color={Colors.muted} size={11} strokeWidth={2.8} />
            <Text style={styles.featuredStatText}>{fmtCount(community.members)}</Text>
          </View>
          <View style={styles.featuredStat}>
            <View style={styles.featuredOnlineDot} />
            <Text style={styles.featuredStatText}>{fmtCount(community.online)} live</Text>
          </View>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onJoin();
            }}
            style={[
              styles.featuredJoinBtn,
              joined
                ? styles.featuredJoinBtnOn
                : { backgroundColor: community.accent[0] },
            ]}
            hitSlop={6}
            testID={`featured-join-${community.id}`}
          >
            <Text
              style={[
                styles.featuredJoinText,
                { color: joined ? Colors.text : Colors.ink },
              ]}
            >
              {joined ? "JOINED" : "JOIN"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function CommunityRow({
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
    <Pressable onPress={onPress} style={styles.row} testID={`community-card-${community.id}`}>
      <LinearGradient
        colors={[`${community.accent[0]}1A`, "rgba(255,255,255,0.02)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
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
              <Flame color={Colors.orange} size={9} strokeWidth={3} />
            </View>
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
            <View style={styles.rowOnlineDot} />
            <Text style={styles.rowMetaText}>{fmtCount(community.online)}</Text>
          </View>
          {community.tags.slice(0, 2).map((t) => (
            <Text key={t} style={styles.rowTag}>#{t}</Text>
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
          joined
            ? styles.rowJoinBtnOn
            : { backgroundColor: community.accent[0] },
        ]}
        testID={`row-join-${community.id}`}
      >
        {joined ? (
          <Text style={[styles.rowJoinText, { color: Colors.text }]}>JOINED</Text>
        ) : (
          <>
            <Text style={[styles.rowJoinText, { color: Colors.ink }]}>JOIN</Text>
            <ArrowUpRight color={Colors.ink} size={11} strokeWidth={3} />
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  listContent: { paddingBottom: 140 },
  sep: { height: 10 },

  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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
  headerLeft: { flex: 1, paddingHorizontal: 4 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyebrow: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 2,
  },
  createBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  heroCard: {
    marginHorizontal: 18,
    marginTop: 14,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(248,201,71,0.18)",
    backgroundColor: "rgba(10,8,4,0.6)",
  },
  heroStatsRow: { flexDirection: "row", alignItems: "center" },
  heroDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginHorizontal: 4,
  },
  heroStat: { flex: 1, alignItems: "flex-start" },
  heroStatTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroStatDot: { width: 7, height: 7, borderRadius: 4 },
  heroStatValue: { fontSize: 20, fontWeight: "900", letterSpacing: -0.6 },
  heroStatLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: "uppercase",
  },
  heroBody: {
    color: Colors.muted,
    fontSize: 12.5,
    fontWeight: "600",
    marginTop: 14,
    lineHeight: 18,
  },

  searchWrap: {
    marginHorizontal: 18,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 9,
    borderRadius: 14,
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

  featuredWrap: { marginTop: 22 },
  sectionHeadRow: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(244,134,91,0.14)",
    borderWidth: 1,
    borderColor: "rgba(244,134,91,0.32)",
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.orange },
  livePillText: { color: Colors.orange, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },

  featuredRow: { paddingHorizontal: 14, gap: 12, paddingBottom: 4 },
  featuredCard: {
    width: 260,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(10,10,12,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  featuredBanner: { height: 110, overflow: "hidden" },
  featuredTopRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  featuredHotPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(244,134,91,0.5)",
  },
  featuredHotText: { color: Colors.orange, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  featuredAvatarWrap: {
    position: "absolute",
    bottom: -22,
    left: 14,
  },
  featuredAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.ink,
    borderWidth: 3,
    borderColor: Colors.ink,
  },
  featuredAvatarEmoji: { fontSize: 26 },

  featuredBody: { padding: 14, paddingTop: 30 },
  featuredTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featuredName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  featuredDesc: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 4,
  },
  featuredFoot: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featuredStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  featuredStatText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  featuredOnlineDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.mint },
  featuredJoinBtn: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  featuredJoinBtnOn: {
    backgroundColor: "rgba(221,227,236,0.08)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.18)",
  },
  featuredJoinText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },

  catWrap: { marginTop: 18 },
  catRow: { paddingHorizontal: 14, gap: 8 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  catChipText: { fontSize: 12, fontWeight: "800" },

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
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  tabPillText: { color: Colors.text, fontSize: 12.5, fontWeight: "800" },
  tabPillTextActive: { color: Colors.ink, fontWeight: "900" },

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

  row: {
    marginHorizontal: 14,
    padding: 12,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowAvatar: {
    width: 50,
    height: 50,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  rowAvatarEmoji: { fontSize: 24 },
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
    backgroundColor: "rgba(244,134,91,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowDesc: { color: Colors.muted, fontSize: 11.5, fontWeight: "600", marginTop: 2 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  rowMetaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  rowMetaText: { color: Colors.text, fontSize: 10.5, fontWeight: "800" },
  rowOnlineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.mint },
  rowTag: { color: Colors.muted, fontSize: 10.5, fontWeight: "700" },

  rowJoinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  rowJoinBtnOn: {
    backgroundColor: "rgba(221,227,236,0.08)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.18)",
  },
  rowJoinText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },

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
});
