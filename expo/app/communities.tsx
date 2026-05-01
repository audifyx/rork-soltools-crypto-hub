import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  Flame,
  Gamepad2,
  Gem,
  Hash,
  Layers,
  Plus,
  Rocket,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
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
import { Community, useSocial } from "@/providers/social-provider";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type CategoryFilter = "all" | Community["category"];

const FILTERS: { id: CategoryFilter; label: string; Icon: LucideIcon; tone: string }[] = [
  { id: "all", label: "All", Icon: Sparkles, tone: Colors.text },
  { id: "memes", label: "Memes", Icon: Flame, tone: Colors.orange },
  { id: "ai", label: "AI", Icon: Bot, tone: Colors.cyan },
  { id: "trading", label: "Trading", Icon: TrendingUp, tone: Colors.mint },
  { id: "defi", label: "DeFi", Icon: Layers, tone: Colors.cyan },
  { id: "nft", label: "NFT", Icon: Gem, tone: Colors.rose },
  { id: "gaming", label: "Gaming", Icon: Gamepad2, tone: Colors.violet },
  { id: "infra", label: "Infra", Icon: Shield, tone: Colors.mint },
  { id: "alpha", label: "Alpha", Icon: Rocket, tone: Colors.cyan },
];

function fmtCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function CommunitiesScreen() {
  const router = useRouter();
  const { communities, joinedCommunities, trendingCommunities, isJoined, toggleJoin } = useSocial();
  const [query, setQuery] = useState<string>("");
  const [filter, setFilter] = useState<CategoryFilter>("all");

  const filtered = useMemo<Community[]>(() => {
    let items = communities.slice();
    if (filter !== "all") items = items.filter((c) => c.category === filter);
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.handle.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.includes(q)),
      );
    }
    return items.sort((a, b) => b.online - a.online);
  }, [communities, filter, query]);

  const renderItem: ListRenderItem<Community> = ({ item }) => (
    <CommunityRow
      community={item}
      joined={isJoined(item.id)}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        router.push({ pathname: "/community/[id]", params: { id: item.id } });
      }}
      onJoin={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        toggleJoin(item.id);
      }}
    />
  );

  return (
    <View style={styles.root} testID="communities-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="communities-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headTitleWrap}>
            <View style={styles.eyebrowRow}>
              <Users color={Colors.violet} size={12} strokeWidth={2.8} />
              <Text style={styles.eyebrow}>SOL TRIBES</Text>
            </View>
            <Text style={styles.title}>Communities</Text>
          </View>
          <Pressable
            onPress={() => Haptics.selectionAsync().catch(() => {})}
            style={styles.createBtn}
            testID="create-community"
          >
            <Plus color={Colors.ink} size={14} strokeWidth={3} />
            <Text style={styles.createText}>NEW</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Search color={Colors.muted} size={15} strokeWidth={2.4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search communities, tags, handles..."
            placeholderTextColor={Colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <X color={Colors.muted} size={14} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            <View>
              {joinedCommunities.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Hash color={Colors.mint} size={14} strokeWidth={2.8} />
                    <Text style={styles.sectionTitle}>Your communities</Text>
                    <Text style={styles.sectionCount}>{joinedCommunities.length}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.joinedRow}
                  >
                    {joinedCommunities.map((c) => (
                      <JoinedCard
                        key={c.id}
                        community={c}
                        onPress={() =>
                          router.push({ pathname: "/community/[id]", params: { id: c.id } })
                        }
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Flame color={Colors.orange} size={14} strokeWidth={2.8} />
                  <Text style={styles.sectionTitle}>Trending now</Text>
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>HOT</Text>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.trendRow}
                >
                  {trendingCommunities.map((c) => (
                    <TrendCard
                      key={c.id}
                      community={c}
                      joined={isJoined(c.id)}
                      onPress={() =>
                        router.push({ pathname: "/community/[id]", params: { id: c.id } })
                      }
                      onJoin={() => toggleJoin(c.id)}
                    />
                  ))}
                </ScrollView>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {FILTERS.map((f) => {
                  const active = filter === f.id;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setFilter(f.id);
                      }}
                      style={[
                        styles.chip,
                        active && { backgroundColor: f.tone, borderColor: f.tone },
                      ]}
                      testID={`com-filter-${f.id}`}
                    >
                      <f.Icon
                        color={active ? Colors.ink : f.tone}
                        size={12}
                        strokeWidth={2.8}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          active && { color: Colors.ink },
                        ]}
                      >
                        {f.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.allHead}>
                <Text style={styles.allTitle}>All communities</Text>
                <Text style={styles.allCount}>{filtered.length} found</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Users color={Colors.violet} size={26} strokeWidth={2.4} />
              </View>
              <Text style={styles.emptyTitle}>No communities match</Text>
              <Text style={styles.emptyBody}>
                Try a different search or category filter to find your tribe.
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

function JoinedCard({ community, onPress }: { community: Community; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.joinedCard} testID={`joined-${community.id}`}>
      <LinearGradient
        colors={[`${community.accent[0]}40`, `${community.accent[1]}12`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.joinedInner}
      >
        <View style={[styles.joinedAvatar, { backgroundColor: `${community.accent[0]}28` }]}>
          <Text style={styles.joinedEmoji}>{community.iconEmoji}</Text>
        </View>
        <Text style={styles.joinedName} numberOfLines={1}>
          {community.name}
        </Text>
        <View style={styles.joinedMeta}>
          <View style={styles.onlineDot} />
          <Text style={styles.joinedMetaText}>{fmtCount(community.online)} online</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function TrendCard({
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
    <Pressable onPress={onPress} style={styles.trendCard} testID={`trend-${community.id}`}>
      <LinearGradient
        colors={[`${community.accent[0]}50`, `${community.accent[1]}10`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.trendInner}
      >
        <View style={styles.trendHead}>
          <View style={[styles.trendAvatar, { backgroundColor: `${community.accent[0]}30` }]}>
            <Text style={styles.trendEmoji}>{community.iconEmoji}</Text>
          </View>
          {community.verified ? (
            <BadgeCheck color={Colors.cyan} size={14} strokeWidth={2.8} />
          ) : null}
        </View>
        <Text style={styles.trendName} numberOfLines={1}>
          {community.name}
        </Text>
        <Text style={styles.trendDesc} numberOfLines={2}>
          {community.description}
        </Text>
        <View style={styles.trendStats}>
          <View style={styles.trendStat}>
            <Users color={Colors.muted} size={10} strokeWidth={2.8} />
            <Text style={styles.trendStatText}>{fmtCount(community.members)}</Text>
          </View>
          <View style={styles.trendStat}>
            <View style={styles.onlineDot} />
            <Text style={styles.trendStatText}>{fmtCount(community.online)}</Text>
          </View>
        </View>
        <Pressable
          onPress={onJoin}
          style={[
            styles.trendJoin,
            joined && { backgroundColor: "rgba(255,255,255,0.08)" },
            !joined && { backgroundColor: community.accent[0] },
          ]}
          testID={`trend-join-${community.id}`}
        >
          <Text
            style={[
              styles.trendJoinText,
              { color: joined ? Colors.text : Colors.ink },
            ]}
          >
            {joined ? "JOINED" : "JOIN"}
          </Text>
        </Pressable>
      </LinearGradient>
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
    <Pressable onPress={onPress} style={styles.row} testID={`row-${community.id}`}>
      <View style={[styles.rowAvatar, { backgroundColor: `${community.accent[0]}24`, borderColor: `${community.accent[0]}55` }]}>
        <Text style={styles.rowEmoji}>{community.iconEmoji}</Text>
      </View>
      <View style={styles.rowMid}>
        <View style={styles.rowTopRow}>
          <Text style={styles.rowName} numberOfLines={1}>
            {community.name}
          </Text>
          {community.verified ? (
            <BadgeCheck color={Colors.cyan} size={13} strokeWidth={2.8} />
          ) : null}
          {community.trending ? (
            <View style={styles.hotBadge}>
              <Flame color={Colors.orange} size={9} strokeWidth={3} />
            </View>
          ) : null}
        </View>
        <Text style={styles.rowDesc} numberOfLines={1}>
          {community.description}
        </Text>
        <View style={styles.rowMeta}>
          <View style={styles.rowMetaPill}>
            <Users color={Colors.muted} size={10} strokeWidth={2.8} />
            <Text style={styles.rowMetaText}>{fmtCount(community.members)}</Text>
          </View>
          <View style={styles.rowMetaPill}>
            <View style={styles.onlineDot} />
            <Text style={styles.rowMetaText}>{fmtCount(community.online)} online</Text>
          </View>
          {community.pinnedTicker ? (
            <View style={[styles.rowMetaPill, { backgroundColor: `${community.accent[0]}14` }]}>
              <Wallet color={community.accent[0]} size={10} strokeWidth={2.8} />
              <Text style={[styles.rowMetaText, { color: community.accent[0] }]}>
                {community.pinnedTicker}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={onJoin}
        hitSlop={6}
        style={[
          styles.joinBtn,
          joined ? styles.joinBtnOn : { backgroundColor: community.accent[0] },
        ]}
        testID={`join-${community.id}`}
      >
        <Text style={[styles.joinText, { color: joined ? Colors.text : Colors.ink }]}>
          {joined ? "Joined" : "Join"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
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
  headTitleWrap: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.violet, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8, marginTop: 2 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.mint,
  },
  createText: { color: Colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  searchWrap: {
    marginHorizontal: 18,
    marginTop: 12,
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

  listContent: { paddingBottom: 140 },
  sep: { height: 1, marginHorizontal: 18, backgroundColor: "rgba(255,255,255,0.04)" },

  section: { marginTop: 22 },
  sectionHead: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  sectionCount: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,184,76,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.4)",
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.orange },
  liveText: { color: Colors.orange, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  joinedRow: { paddingHorizontal: 14, gap: 10 },
  joinedCard: {
    width: 130,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.card,
  },
  joinedInner: { padding: 12, alignItems: "flex-start" },
  joinedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  joinedEmoji: { fontSize: 24 },
  joinedName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10,
    letterSpacing: -0.2,
  },
  joinedMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  joinedMetaText: { color: Colors.muted, fontSize: 10, fontWeight: "800" },
  onlineDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.mint },

  trendRow: { paddingHorizontal: 14, gap: 12 },
  trendCard: {
    width: 230,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: Colors.card,
  },
  trendInner: { padding: 14, minHeight: 180 },
  trendHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  trendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  trendEmoji: { fontSize: 22 },
  trendName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
    letterSpacing: -0.3,
  },
  trendDesc: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 4,
  },
  trendStats: { flexDirection: "row", gap: 8, marginTop: 12 },
  trendStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  trendStatText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  trendJoin: {
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
  },
  trendJoinText: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  chipsRow: { paddingHorizontal: 18, gap: 8, marginTop: 18, paddingBottom: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chipText: { color: Colors.text, fontSize: 12, fontWeight: "800" },

  allHead: {
    paddingHorizontal: 18,
    marginTop: 18,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  allTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  allCount: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  rowAvatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  rowEmoji: { fontSize: 22 },
  rowMid: { flex: 1 },
  rowTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  hotBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,184,76,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowDesc: { color: Colors.muted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  rowMeta: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  rowMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  rowMetaText: { color: Colors.text, fontSize: 10, fontWeight: "800" },
  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  joinBtnOn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  joinText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },

  empty: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "rgba(184,140,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },
});
