import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  ChevronRight,
  Flame,
  Plus,
  Search,
  Users,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  ListRenderItem,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Community, useSocial } from "@/providers/social-provider";

type Tab = "discover" | "joined";

const ACCENT = "#F8C947";

function fmtCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function CommunitiesScreen() {
  const router = useRouter();
  const { communities, joinedCommunities, isJoined, liveSpaces, trendingCommunities } =
    useSocial();
  const [query, setQuery] = useState<string>("");
  const [tab, setTab] = useState<Tab>("discover");

  const data = useMemo<Community[]>(() => {
    const base = tab === "joined" ? joinedCommunities : communities;
    const q = query.trim().toLowerCase();
    if (q.length === 0) return base;
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.includes(q)),
    );
  }, [tab, communities, joinedCommunities, query]);

  const renderItem: ListRenderItem<Community> = ({ item }) => (
    <CommunityCard
      community={item}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        router.push({ pathname: "/community/[id]", params: { id: item.id } });
      }}
    />
  );

  return (
    <View style={styles.root} testID="communities-screen">
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
                <View style={styles.headerLeft}>
                  <View style={styles.titleRow}>
                    <Users color={ACCENT} size={26} strokeWidth={2.6} />
                    <Text style={styles.title}>Communities</Text>
                  </View>
                  <Text style={styles.subtitle}>Connect, share, and trade together</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  }}
                  style={styles.createBtn}
                  testID="create-community"
                >
                  <Plus color={Colors.ink} size={16} strokeWidth={3} />
                  <Text style={styles.createText}>Create</Text>
                </Pressable>
              </View>

              <View style={styles.searchWrap}>
                <Search color={Colors.muted} size={18} strokeWidth={2.4} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search communities..."
                  placeholderTextColor={Colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.statsRow}>
                <StatTile
                  icon={Users}
                  value={String(communities.length)}
                  label="Communities"
                  tint={ACCENT}
                />
                <StatTile
                  icon={Activity}
                  value="Live"
                  label="Activity"
                  tint={Colors.mint}
                  small={liveSpaces.length > 0 ? `${liveSpaces.length}` : undefined}
                />
                <StatTile
                  icon={Flame}
                  value="Hot"
                  label="Trending"
                  tint={Colors.orange}
                  small={trendingCommunities.length > 0 ? `${trendingCommunities.length}` : undefined}
                />
              </View>

              <View style={styles.tabsRow}>
                <TabPill
                  label="Discover"
                  active={tab === "discover"}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTab("discover");
                  }}
                />
                <TabPill
                  label="Joined"
                  active={tab === "joined"}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTab("joined");
                  }}
                />
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
                  : "Try a different search to find your tribe."}
              </Text>
            </View>
          }
        />
      </SafeAreaView>
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
      testID={`tab-${label.toLowerCase()}`}
    >
      <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  tint,
  small,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  value: string;
  label: string;
  tint: string;
  small?: string;
}) {
  return (
    <View style={[styles.statTile, { borderColor: `${tint}33` }]}>
      <LinearGradient
        colors={[`${tint}22`, `${tint}08`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.statTopRow}>
        <Icon color={tint} size={16} strokeWidth={2.6} />
        {small ? (
          <View style={[styles.statBadge, { backgroundColor: `${tint}26` }]}>
            <Text style={[styles.statBadgeText, { color: tint }]}>{small}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: tint }]}>{label}</Text>
    </View>
  );
}

function CommunityCard({
  community,
  onPress,
}: {
  community: Community;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`community-card-${community.id}`}>
      <View style={styles.banner}>
        <LinearGradient
          colors={[community.accent[0], community.accent[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.bannerEmojiWrap}>
          <Text style={styles.bannerEmoji}>{community.iconEmoji}</Text>
        </View>
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.5)"]}
          style={[StyleSheet.absoluteFill, { top: "60%" }]}
        />
        {community.tags.length > 0 ? (
          <View style={styles.bannerTagRow}>
            {community.tags.slice(0, 3).map((t) => (
              <View key={t} style={styles.bannerTag}>
                <Text style={styles.bannerTagText}>#{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardAvatar}>
          <LinearGradient
            colors={[community.accent[0], community.accent[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.cardAvatarEmoji}>{community.iconEmoji}</Text>
        </View>
        <View style={styles.cardMid}>
          <Text style={styles.cardName} numberOfLines={1}>
            {community.name}
          </Text>
          <Text style={styles.cardDesc} numberOfLines={1}>
            {community.description || `The official community for ${community.name}`}
          </Text>
          <View style={styles.cardMeta}>
            <Users color={Colors.muted} size={12} strokeWidth={2.6} />
            <Text style={styles.cardMetaText}>{fmtCount(community.members)}</Text>
            <Text style={styles.cardMetaSep}>by</Text>
            <Text style={styles.cardOwner} numberOfLines={1}>
              {community.ownerHandle || "@administration"}
            </Text>
            {isJoinedDisplay(community) ? null : null}
          </View>
        </View>
        <ChevronRight color={Colors.muted} size={18} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

function isJoinedDisplay(_c: Community): boolean {
  return false;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  listContent: { paddingBottom: 140 },
  sep: { height: 14 },

  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerLeft: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: {
    color: ACCENT,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  createText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },

  searchWrap: {
    marginHorizontal: 18,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
    padding: 0,
  },

  statsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    marginTop: 18,
  },
  statTile: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 86,
  },
  statTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 6,
    letterSpacing: -0.4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    opacity: 0.8,
  },

  tabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 6,
  },
  tabPill: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tabPillActive: { backgroundColor: ACCENT },
  tabPillText: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  tabPillTextActive: { color: Colors.ink },

  card: {
    marginHorizontal: 18,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  banner: {
    height: 140,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  bannerEmojiWrap: {
    position: "absolute",
    right: 18,
    top: 18,
    opacity: 0.4,
  },
  bannerEmoji: { fontSize: 90 },
  bannerTagRow: {
    flexDirection: "row",
    gap: 6,
    padding: 12,
    flexWrap: "wrap",
  },
  bannerTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  bannerTagText: { color: Colors.text, fontSize: 10, fontWeight: "800" },

  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  cardAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -36,
    borderWidth: 3,
    borderColor: Colors.ink,
  },
  cardAvatarEmoji: { fontSize: 28 },
  cardMid: { flex: 1 },
  cardName: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  cardDesc: { color: Colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  cardMetaText: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  cardMetaSep: { color: Colors.muted, fontSize: 12, fontWeight: "600", marginLeft: 8 },
  cardOwner: { color: Colors.muted, fontSize: 12, fontWeight: "800", flex: 1 },

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
