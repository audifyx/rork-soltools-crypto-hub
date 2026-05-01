import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Bookmark,
  Flame,
  Heart,
  Inbox,
  MessageCircle,
  Repeat2,
  Search,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
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

import Colors from "@/constants/colors";
import { FEED_POSTS, FeedPost, TRENDING_PAIRS, TRENDING_TOPICS, TrendingPair } from "@/constants/feed";
import { UserPost, useApp } from "@/providers/app-provider";

const FILTERS = ["For You", "Trending", "New Pairs", "Whales", "Following"] as const;
type Filter = (typeof FILTERS)[number];

export default function HomeFeedScreen() {
  const router = useRouter();
  const { posts: userPosts, togglePostLike, deletePost, profile } = useApp();
  const [filter, setFilter] = useState<Filter>("For You");

  const onSelectFilter = useCallback((next: Filter) => {
    Haptics.selectionAsync().catch(() => {});
    setFilter(next);
  }, []);

  const combined = useMemo<(UserPost | FeedPost)[]>(() => {
    if (filter === "Following") return userPosts;
    return [...userPosts, ...FEED_POSTS];
  }, [filter, userPosts]);

  const renderPost: ListRenderItem<UserPost | FeedPost> = useCallback(
    ({ item }) => {
      if ("createdAt" in item) {
        return (
          <UserPostCard
            post={item}
            displayName={profile.displayName}
            handle={profile.handle}
            avatarColor={profile.avatarColor}
            onLike={() => togglePostLike(item.id)}
            onDelete={() => deletePost(item.id)}
          />
        );
      }
      return <PostCard post={item} />;
    },
    [profile, togglePostLike, deletePost],
  );

  return (
    <View style={styles.root} testID="home-screen">
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
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
                  style={[styles.filterChip, active && styles.filterChipActive]}
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
          keyExtractor={(p) => p.id}
          renderItem={renderPost}
          ListHeaderComponent={<FeedHeader />}
          ListEmptyComponent={<FeedEmpty />}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="home-feed"
        />

        <Pressable style={styles.fab} onPress={() => router.push("/compose")} testID="compose-fab">
          <LinearGradient
            colors={[Colors.mint, Colors.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Sparkles color={Colors.ink} size={22} strokeWidth={3} />
          </LinearGradient>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function FeedHeader() {
  return (
    <View style={styles.headerStack}>
      <MarketStrip />
      <TrendingPairsRail />
      <TrendingTopics />
      <View style={styles.feedTitleRow}>
        <Text style={styles.feedTitle}>Live feed</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>
    </View>
  );
}

function MarketStrip() {
  return (
    <View style={styles.marketCard}>
      <LinearGradient
        colors={["rgba(85,245,178,0.18)", "rgba(56,215,255,0.04)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.marketGradient}
      >
        <View style={styles.marketRow}>
          <MarketTile label="SOL" />
          <View style={styles.marketDivider} />
          <MarketTile label="MEME IDX" />
          <View style={styles.marketDivider} />
          <MarketTile label="GAS" />
        </View>
      </LinearGradient>
    </View>
  );
}

function MarketTile({ label }: { label: string }) {
  return (
    <View style={styles.marketTile}>
      <Text style={styles.marketLabel}>{label}</Text>
      <Text style={styles.marketValue}>—</Text>
      <View style={styles.marketChangeRow}>
        <Text style={[styles.marketChange, { color: Colors.muted }]}>awaiting data</Text>
      </View>
    </View>
  );
}

function TrendingPairsRail() {
  const hasPairs = TRENDING_PAIRS.length > 0;
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
          {TRENDING_PAIRS.map((p) => (
            <PairCard key={p.id} pair={p} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.railEmpty} testID="pairs-empty">
          <Text style={styles.railEmptyTitle}>No pairs yet</Text>
          <Text style={styles.railEmptyBody}>
            Connect a data source to start tracking new Solana launches in real time.
          </Text>
        </View>
      )}
    </View>
  );
}

function PairCard({ pair }: { pair: TrendingPair }) {
  const positive = pair.changePct >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  return (
    <Pressable style={styles.pairCard} testID={`pair-${pair.id}`}>
      <View style={styles.pairTopRow}>
        <View style={[styles.pairAvatar, { backgroundColor: pair.avatarColor }]}>
          <Text style={styles.pairAvatarText}>{pair.ticker.replace("$", "").slice(0, 2)}</Text>
        </View>
        {pair.hot ? (
          <View style={styles.hotBadge}>
            <Flame color={Colors.orange} size={10} strokeWidth={3} />
            <Text style={styles.hotText}>HOT</Text>
          </View>
        ) : (
          <View style={styles.agePill}>
            <Text style={styles.ageText}>{pair.ageMin}m</Text>
          </View>
        )}
      </View>
      <Text style={styles.pairTicker}>{pair.ticker}</Text>
      <Text style={styles.pairName} numberOfLines={1}>
        {pair.name}
      </Text>

      <View style={styles.pairStatsRow}>
        <View style={styles.pairStatBox}>
          <Text style={styles.pairStatLabel}>MC</Text>
          <Text style={styles.pairStatValue}>{pair.mc}</Text>
        </View>
        <View style={styles.pairStatBox}>
          <Text style={styles.pairStatLabel}>LIQ</Text>
          <Text style={styles.pairStatValue}>{pair.liq}</Text>
        </View>
      </View>

      <View style={[styles.pairChangePill, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}>
        {positive ? (
          <TrendingUp color={accent} size={12} strokeWidth={3} />
        ) : (
          <TrendingDown color={accent} size={12} strokeWidth={3} />
        )}
        <Text style={[styles.pairChangeText, { color: accent }]}>
          {positive ? "+" : ""}
          {pair.changePct.toFixed(1)}%
        </Text>
      </View>
    </Pressable>
  );
}

function TrendingTopics() {
  const hasTopics = TRENDING_TOPICS.length > 0;
  return (
    <View style={styles.topicsWrap}>
      <Text style={styles.sectionLabel}>Trending</Text>
      {hasTopics ? (
        <View style={styles.topicsList}>
          {TRENDING_TOPICS.map((t, i) => (
            <Pressable key={t.id} style={styles.topicRow} testID={`topic-${t.id}`}>
              <View style={styles.topicLeft}>
                <Text style={styles.topicRank}>{i + 1}</Text>
                <View>
                  <Text style={[styles.topicTag, { color: t.tone }]}>{t.tag}</Text>
                  <Text style={styles.topicCount}>{t.count}</Text>
                </View>
              </View>
              <ArrowUpRight color={Colors.muted} size={16} strokeWidth={2.4} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.topicsEmpty}>
          Trending tags will appear here once the social feed comes online.
        </Text>
      )}
    </View>
  );
}

function UserPostCard({
  post,
  displayName,
  handle,
  avatarColor,
  onLike,
  onDelete,
}: {
  post: UserPost;
  displayName: string;
  handle: string;
  avatarColor: string;
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
        <Text style={styles.postAvatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.postBody}>
        <View style={styles.postHeaderRow}>
          <Text style={styles.postName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.postHandle}>{handle}</Text>
          <Text style={styles.postDot}>·</Text>
          <Text style={styles.postTime}>{time}</Text>
          <Pressable onPress={onDelete} hitSlop={6} style={{ marginLeft: "auto" }} testID={`delete-${post.id}`}>
            <Text style={[styles.actionLabel, { color: Colors.muted }]}>×</Text>
          </Pressable>
        </View>
        <Text style={styles.postText}>{post.text}</Text>
        {post.ticker ? (
          <PostPairCard pair={{ ticker: `${post.ticker}`, changePct: post.changePct ?? 0 }} />
        ) : null}
        <View style={styles.actionsRow}>
          <ActionItem icon={<MessageCircle color={Colors.muted} size={16} strokeWidth={2.2} />} label={formatCount(post.comments)} />
          <ActionItem icon={<Repeat2 color={Colors.muted} size={17} strokeWidth={2.2} />} label={formatCount(post.reposts)} />
          <Pressable style={styles.actionBtn} onPress={onLike} hitSlop={6} testID={`like-user-${post.id}`}>
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

function FeedEmpty() {
  return (
    <View style={styles.feedEmpty} testID="feed-empty">
      <View style={styles.feedEmptyIcon}>
        <Inbox color={Colors.mint} size={26} strokeWidth={2.2} />
      </View>
      <Text style={styles.feedEmptyTitle}>No posts yet</Text>
      <Text style={styles.feedEmptyBody}>
        The live feed is empty. Connect your account or follow traders to start seeing alpha and chatter here.
      </Text>
    </View>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const [liked, setLiked] = useState<boolean>(false);
  const onLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLiked((v) => !v);
  }, []);

  return (
    <View style={styles.post} testID={`post-${post.id}`}>
      <View style={[styles.postAvatar, { backgroundColor: post.avatarColor }]}>
        <Text style={styles.postAvatarText}>{post.name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.postBody}>
        <View style={styles.postHeaderRow}>
          <Text style={styles.postName} numberOfLines={1}>
            {post.name}
          </Text>
          {post.verified ? <BadgeCheck color={Colors.cyan} size={14} strokeWidth={2.6} /> : null}
          <Text style={styles.postHandle}>{post.handle}</Text>
          <Text style={styles.postDot}>·</Text>
          <Text style={styles.postTime}>{post.time}</Text>
        </View>
        <Text style={styles.postText}>{post.text}</Text>

        {post.pair ? <PostPairCard pair={post.pair} /> : null}

        <View style={styles.actionsRow}>
          <ActionItem
            icon={<MessageCircle color={Colors.muted} size={16} strokeWidth={2.2} />}
            label={formatCount(post.comments)}
          />
          <ActionItem
            icon={<Repeat2 color={Colors.muted} size={17} strokeWidth={2.2} />}
            label={formatCount(post.reposts)}
          />
          <Pressable style={styles.actionBtn} onPress={onLike} hitSlop={6} testID={`like-${post.id}`}>
            <Heart
              color={liked ? Colors.rose : Colors.muted}
              size={16}
              strokeWidth={2.2}
              fill={liked ? Colors.rose : "transparent"}
            />
            <Text style={[styles.actionLabel, liked ? { color: Colors.rose } : null]}>
              {formatCount(post.likes + (liked ? 1 : 0))}
            </Text>
          </Pressable>
          <ActionItem icon={<Bookmark color={Colors.muted} size={15} strokeWidth={2.2} />} label={post.views} />
          <ActionItem icon={<Share2 color={Colors.muted} size={15} strokeWidth={2.2} />} label="" />
        </View>
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
      <View style={[styles.embedChange, { backgroundColor: `${accent}1A`, borderColor: `${accent}55` }]}>
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
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  brandDot: { width: 14, height: 14, borderRadius: 7 },
  brandText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  topActions: { flexDirection: "row", gap: 10 },
  iconBtn: {
    width: 38,
    height: 38,
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
  },
  filterChipActive: {},
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
    paddingBottom: 120,
    flexGrow: 1,
  },

  headerStack: {
    paddingTop: 14,
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
    width: 168,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  pairTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pairAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pairAvatarText: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
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
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
    letterSpacing: -0.4,
  },
  pairName: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  pairStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  pairStatBox: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pairStatLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  pairStatValue: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  pairChangePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
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
