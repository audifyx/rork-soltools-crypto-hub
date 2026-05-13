import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  BadgeCheck,
  CalendarDays,
  Compass,
  EyeOff,
  Flame,
  Heart,
  MessageCircle,
  Play,
  Repeat2,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import {
  hideFypCard,
  listFyp,
  listSuggestedFollows,
  listTrendingHashtags,
  type FypCard,
  type SuggestedFollowRow,
  type TrendingHashtagRow,
} from "@/lib/api/platform";
import { hapticMedium, hapticSelect } from "@/lib/haptics";
import { useAuth } from "@/providers/auth-provider";
import { useSocial } from "@/providers/social-provider";

interface CardPayload {
  title?: string;
  body?: string;
  caption?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  ticker?: string | null;
  members_count?: number;
  starts_at?: string;
  likes?: number;
  comments?: number;
  reposts?: number;
  liked?: boolean;
  reposted?: boolean;
  reason?: string;
}

type KindKey = FypCard["kind"];
type FilterKey = "all" | KindKey;

const KIND_LABEL: Record<KindKey, { label: string; Icon: typeof Sparkles; tint: string }> = {
  post: { label: "Post", Icon: MessageCircle, tint: Colors.mint },
  reel: { label: "Reel", Icon: Play, tint: "#FF5C8A" },
  story: { label: "Story", Icon: Flame, tint: "#FF8C28" },
  community: { label: "Community", Icon: Users, tint: Colors.violet },
  event: { label: "Event", Icon: CalendarDays, tint: Colors.goldBright },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "post", label: "Posts" },
  { key: "reel", label: "Reels" },
  { key: "story", label: "Stories" },
  { key: "community", label: "Spaces" },
  { key: "event", label: "Events" },
];

const { width: SCREEN_W } = Dimensions.get("window");
const GUTTER = 16;
const GRID_GAP = 10;
const COL_WIDTH = (SCREEN_W - GUTTER * 2 - GRID_GAP) / 2;

export default function ForYouScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { userId, isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("all");

  const results = useQueries({
    queries: [
      {
        queryKey: ["fyp", userId ?? "guest"],
        enabled: !!userId,
        staleTime: 20_000,
        refetchInterval: 90_000,
        queryFn: () => (userId ? listFyp(userId) : Promise.resolve([])),
      },
      {
        queryKey: ["fyp-hashtags"],
        staleTime: 60_000,
        queryFn: () => listTrendingHashtags(8),
      },
      {
        queryKey: ["fyp-suggested", userId ?? "guest"],
        enabled: !!userId,
        staleTime: 60_000,
        queryFn: () => (userId ? listSuggestedFollows(userId, 10) : Promise.resolve([] as SuggestedFollowRow[])),
      },
    ],
  });

  const fypQuery = results[0];
  const hashtagsQuery = results[1];
  const suggestionsQuery = results[2];

  const cards = (fypQuery.data ?? []) as FypCard[];
  const hashtags = (hashtagsQuery.data ?? []) as TrendingHashtagRow[];
  const suggestions = (suggestionsQuery.data ?? []) as SuggestedFollowRow[];

  const filtered = useMemo<FypCard[]>(() => {
    if (filter === "all") return cards;
    return cards.filter((c) => c.kind === filter);
  }, [cards, filter]);

  const hero = filtered[0];
  const rest = filtered.slice(1);

  // Pair rest into rows of 2 for the grid
  const gridRows = useMemo<FypCard[][]>(() => {
    const rows: FypCard[][] = [];
    for (let i = 0; i < rest.length; i += 2) {
      rows.push(rest.slice(i, i + 2));
    }
    return rows;
  }, [rest]);

  const onRefresh = useCallback(() => {
    hapticSelect();
    Promise.all([fypQuery.refetch(), hashtagsQuery.refetch(), suggestionsQuery.refetch()]).catch(() => {});
  }, [fypQuery, hashtagsQuery, suggestionsQuery]);

  const onOpen = useCallback(
    (card: FypCard) => {
      hapticSelect();
      try {
        if (card.kind === "reel") router.push({ pathname: "/(tabs)/reels", params: { focus: card.ref_id } });
        else if (card.kind === "story") router.push({ pathname: "/story/[id]", params: { id: card.ref_id } });
        else if (card.kind === "event") router.push("/events");
        else if (card.kind === "community") router.push({ pathname: "/community/[id]", params: { id: card.ref_id } });
        else if (card.kind === "post") router.push({ pathname: "/post/[id]", params: { id: card.ref_id } });
        else router.push("/(tabs)/home");
      } catch (e) {
        console.log("[fyp] open failed", e instanceof Error ? e.message : String(e));
      }
    },
    [router],
  );

  const onHide = useCallback(
    (card: FypCard) => {
      if (!userId) return;
      hapticMedium();
      queryClient.setQueryData<FypCard[]>(["fyp", userId], (prev) =>
        (prev ?? []).filter((c) => c.id !== card.id),
      );
      hideFypCard(userId, card.id, card.ref_id).catch(() => {});
    },
    [queryClient, userId],
  );

  const onLongPress = useCallback(
    (card: FypCard) => {
      Alert.alert("Not interested?", "We'll show less like this.", [
        { text: "Cancel", style: "cancel" },
        { text: "Hide", style: "destructive", onPress: () => onHide(card) },
      ]);
    },
    [onHide],
  );

  const onHashtag = useCallback(
    (tag: string) => {
      hapticSelect();
      router.push({ pathname: "/(tabs)/discover", params: { q: `#${tag}` } });
    },
    [router],
  );

  const onOpenUser = useCallback(
    (row: SuggestedFollowRow) => {
      hapticSelect();
      if (row.username) {
        router.push({ pathname: "/u/[handle]", params: { handle: row.username } });
      } else {
        router.push({ pathname: "/u/[handle]", params: { handle: row.suggested_user_id } });
      }
    },
    [router],
  );

  const TAB_BAR_BLOCK = 74 + (Platform.OS === "ios" ? 22 : 14) + 12;
  const isInitialLoading = fypQuery.isLoading && cards.length === 0;
  const isEmpty = !isInitialLoading && filtered.length === 0;

  return (
    <View style={styles.root} testID="fyp-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>For you</Text>
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.goldBright} size={11} strokeWidth={2.8} />
              <Text style={styles.eyebrow}>Curated daily</Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push("/interest-quiz")}
            style={({ pressed }) => [styles.tuneBtn, pressed && { opacity: 0.85 }]}
            testID="fyp-tune"
          >
            <Compass color={Colors.text} size={14} strokeWidth={2.6} />
            <Text style={styles.tuneBtnText}>Tune</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          keyboardShouldPersistTaps="always"
          removeClippedSubviews={false}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  hapticSelect();
                  setFilter(f.key);
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && { opacity: 0.7 },
                ]}
                testID={`fyp-filter-${f.key}`}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${f.label}`}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <FlatList
        data={gridRows}
        keyExtractor={(_, i) => `row-${i}`}
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_BLOCK + insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={fypQuery.isFetching && !fypQuery.isLoading}
            onRefresh={onRefresh}
            tintColor={Colors.goldBright}
            colors={[Colors.goldBright]}
          />
        }
        ListHeaderComponent={
          <View>
            {hero ? (
              <View style={styles.heroWrap}>
                <HeroCard card={hero} onPress={() => onOpen(hero)} onLongPress={() => onLongPress(hero)} />
              </View>
            ) : null}

            {hashtags.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  Icon={TrendingUp}
                  title="Trending"
                  subtitle={`${hashtags.length} hashtags`}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hashtagRow}
                >
                  {hashtags.map((h, i) => (
                    <Pressable
                      key={h.tag}
                      onPress={() => onHashtag(h.tag)}
                      style={({ pressed }) => [styles.hashtagPill, pressed && { opacity: 0.75 }]}
                      testID={`fyp-hashtag-${h.tag}`}
                    >
                      <Text style={styles.hashtagRankText}>{i + 1}</Text>
                      <View style={styles.hashtagDivider} />
                      <View>
                        <Text style={styles.hashtagTag} numberOfLines={1}>
                          #{h.tag}
                        </Text>
                        <Text style={styles.hashtagCount}>
                          {formatCount(h.post_count ?? 0)} posts
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {suggestions.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  Icon={UserPlus}
                  title="People to follow"
                  subtitle="Based on your activity"
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestRow}
                >
                  {suggestions.map((s) => (
                    <SuggestionCard key={s.suggested_user_id} row={s} onPress={() => onOpenUser(s)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {gridRows.length > 0 ? (
              <View style={styles.gridHeader}>
                <SectionHeader Icon={Sparkles} title="More for you" subtitle="" />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.gridRow}>
            {item.map((card) => (
              <GridCard
                key={card.id}
                card={card}
                onPress={() => onOpen(card)}
                onLongPress={() => onLongPress(card)}
                onHide={() => onHide(card)}
              />
            ))}
            {item.length === 1 ? <View style={{ width: COL_WIDTH }} /> : null}
          </View>
        )}
        removeClippedSubviews={false}
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
        ListEmptyComponent={
          isInitialLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={Colors.goldBright} />
            </View>
          ) : isEmpty ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Sparkles color={Colors.goldBright} size={28} strokeWidth={2.6} />
              </View>
              <Text style={styles.emptyTitle}>
                {!isAuthenticated
                  ? "Sign in to unlock For You"
                  : cards.length === 0
                    ? "Warming up your feed…"
                    : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase() ?? ""} yet`}
              </Text>
              <Text style={styles.emptyBody}>
                {isAuthenticated
                  ? "Tap people, posts and reels you love. We'll personalize this in seconds."
                  : "We tune your feed based on who you follow and what you tap."}
              </Text>
              <Pressable
                onPress={() => router.push("/interest-quiz")}
                style={styles.emptyBtn}
                testID="fyp-empty-tune"
              >
                <Compass color={Colors.ink} size={15} strokeWidth={2.7} />
                <Text style={styles.emptyBtnText}>Pick interests</Text>
              </Pressable>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function SectionHeader({
  Icon,
  title,
  subtitle,
}: {
  Icon: typeof Sparkles;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionIcon}>
          <Icon color={Colors.goldBright} size={12} strokeWidth={2.8} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function HeroCard({
  card,
  onPress,
  onLongPress,
}: {
  card: FypCard;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const meta = KIND_LABEL[card.kind];
  const Icon = meta.Icon;
  const payload = (card.payload ?? {}) as CardPayload;
  const cover = payload.thumbnail_url ?? payload.media_url ?? payload.avatar_url ?? null;
  const title = payload.title ?? payload.caption ?? payload.body ?? meta.label;
  const subtitle = payload.username
    ? `@${payload.username}`
    : payload.display_name ?? payload.reason ?? "Recommended";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.95 }]}
      testID={`fyp-hero-${card.id}`}
    >
      <View style={styles.heroMedia}>
        {cover ? (
          <ExpoImage source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[meta.tint, "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.30)", "rgba(0,0,0,0.95)"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.heroTopRow}>
          <View style={[styles.cardChip, { backgroundColor: `${meta.tint}26`, borderColor: `${meta.tint}99` }]}>
            <Icon color={meta.tint} size={11} strokeWidth={2.8} />
            <Text style={[styles.cardChipText, { color: meta.tint }]}>{meta.label.toUpperCase()}</Text>
          </View>
          <View style={styles.heroPickBadge}>
            <Sparkles color={Colors.goldBright} size={10} strokeWidth={2.8} />
            <Text style={styles.heroPickBadgeText}>TOP PICK</Text>
          </View>
        </View>

        <View style={styles.heroBody}>
          <Text style={styles.heroTitle} numberOfLines={3}>
            {title}
          </Text>
          <View style={styles.heroMetaRow}>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            {typeof payload.likes === "number" ? (
              <View style={styles.metric}>
                <Heart color={Colors.text} size={11} strokeWidth={2.6} />
                <Text style={styles.metricText}>{formatCount(payload.likes)}</Text>
              </View>
            ) : null}
            {typeof payload.comments === "number" ? (
              <View style={styles.metric}>
                <MessageCircle color={Colors.text} size={11} strokeWidth={2.6} />
                <Text style={styles.metricText}>{formatCount(payload.comments)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function GridCard({
  card,
  onPress,
  onLongPress,
  onHide,
}: {
  card: FypCard;
  onPress: () => void;
  onLongPress: () => void;
  onHide: () => void;
}) {
  const meta = KIND_LABEL[card.kind];
  const Icon = meta.Icon;
  const payload = (card.payload ?? {}) as CardPayload;
  const cover = payload.thumbnail_url ?? payload.media_url ?? payload.avatar_url ?? null;
  const title = payload.title ?? payload.caption ?? payload.body ?? `${meta.label}`;
  const subtitle = payload.username
    ? `@${payload.username}`
    : payload.display_name ?? payload.reason ?? "Recommended";

  // Vary heights for a magazine-like layout
  const tallKinds: KindKey[] = ["reel", "story"];
  const mediaHeight = tallKinds.includes(card.kind) ? 220 : 160;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.gridCard, { width: COL_WIDTH }, pressed && { opacity: 0.92 }]}
      testID={`fyp-card-${card.id}`}
    >
      <View style={[styles.gridMedia, { height: mediaHeight }]}>
        {cover ? (
          <ExpoImage source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[meta.tint, "rgba(0,0,0,0.4)"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.70)"]} style={StyleSheet.absoluteFill} />

        <View style={[styles.cardChip, styles.cardChipFloat, { backgroundColor: `${meta.tint}26`, borderColor: `${meta.tint}99` }]}>
          <Icon color={meta.tint} size={10} strokeWidth={2.8} />
          <Text style={[styles.cardChipText, { color: meta.tint, fontSize: 9 }]}>{meta.label.toUpperCase()}</Text>
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onHide();
          }}
          hitSlop={8}
          style={styles.hideBtn}
          testID={`fyp-hide-${card.id}`}
        >
          <EyeOff color={Colors.text} size={12} strokeWidth={2.6} />
        </Pressable>

        {/* Footer over media for compact look */}
        <View style={styles.gridMediaFooter}>
          <Text style={styles.gridTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>
      </View>

      <View style={styles.gridBody}>
        <Text style={styles.gridSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        {card.kind === "post" ? (
          <FypPostActions card={card} payload={payload} onOpen={onPress} />
        ) : typeof payload.likes === "number" || typeof payload.comments === "number" ? (
          <View style={styles.inlineMetricsRow}>
            {typeof payload.likes === "number" ? (
              <View style={styles.metricGhost}>
                <Heart color={Colors.muted2} size={11} strokeWidth={2.4} />
                <Text style={styles.metricGhostText}>{formatCount(payload.likes)}</Text>
              </View>
            ) : null}
            {typeof payload.comments === "number" ? (
              <View style={styles.metricGhost}>
                <MessageCircle color={Colors.muted2} size={11} strokeWidth={2.4} />
                <Text style={styles.metricGhostText}>{formatCount(payload.comments)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function FypPostActions({
  card,
  payload,
  onOpen,
}: {
  card: FypCard;
  payload: CardPayload;
  onOpen: () => void;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { togglePostLike, togglePostRepost } = useSocial();
  const liked = !!payload.liked;
  const reposted = !!payload.reposted;
  const likes = typeof payload.likes === "number" ? payload.likes : 0;
  const comments = typeof payload.comments === "number" ? payload.comments : 0;
  const reposts = typeof payload.reposts === "number" ? payload.reposts : 0;

  const requireAuth = useCallback((): boolean => {
    if (isAuthenticated) return true;
    Alert.alert("Sign in", "Sign in to interact with posts.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign in", onPress: () => router.push("/auth") },
    ]);
    return false;
  }, [isAuthenticated, router]);

  const onLike = useCallback(
    (e: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      if (!requireAuth()) return;
      hapticSelect();
      togglePostLike(card.ref_id).catch((err) => {
        console.log("[fyp] like failed", err instanceof Error ? err.message : String(err));
      });
    },
    [requireAuth, togglePostLike, card.ref_id],
  );

  const onRepost = useCallback(
    (e: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      if (!requireAuth()) return;
      hapticMedium();
      togglePostRepost(card.ref_id).catch((err) => {
        console.log("[fyp] repost failed", err instanceof Error ? err.message : String(err));
      });
    },
    [requireAuth, togglePostRepost, card.ref_id],
  );

  const onComment = useCallback(
    (e: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      hapticSelect();
      onOpen();
    },
    [onOpen],
  );

  return (
    <View style={styles.actionRow}>
      <Pressable onPress={onLike} hitSlop={8} style={styles.actionBtn} testID={`fyp-like-${card.id}`}>
        <Heart
          color={liked ? Colors.rose : Colors.muted2}
          size={13}
          strokeWidth={2.4}
          fill={liked ? Colors.rose : "transparent"}
        />
        <Text style={[styles.actionText, liked && { color: Colors.rose }]}>{formatCount(likes)}</Text>
      </Pressable>
      <Pressable onPress={onComment} hitSlop={8} style={styles.actionBtn} testID={`fyp-comment-${card.id}`}>
        <MessageCircle color={Colors.muted2} size={13} strokeWidth={2.4} />
        <Text style={styles.actionText}>{formatCount(comments)}</Text>
      </Pressable>
      <Pressable onPress={onRepost} hitSlop={8} style={styles.actionBtn} testID={`fyp-repost-${card.id}`}>
        <Repeat2 color={reposted ? Colors.mint : Colors.muted2} size={13} strokeWidth={2.4} />
        <Text style={[styles.actionText, reposted && { color: Colors.mint }]}>{formatCount(reposts)}</Text>
      </Pressable>
    </View>
  );
}

function SuggestionCard({ row, onPress }: { row: SuggestedFollowRow; onPress: () => void }) {
  const name = row.display_name ?? row.username ?? "Trader";
  const handle = row.username ? `@${row.username}` : "";
  const reason =
    row.reason === "fof"
      ? `${row.mutual_count} mutual${row.mutual_count === 1 ? "" : "s"}`
      : row.reason === "topic"
        ? "Shared interests"
        : row.reason === "community"
          ? "Same community"
          : "Suggested";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.suggestCard, pressed && { opacity: 0.9 }]}
      testID={`fyp-suggest-${row.suggested_user_id}`}
    >
      <LinearGradient
        colors={["rgba(98,208,255,0.22)", "rgba(91,141,239,0.04)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.suggestAvatarWrap}>
        {row.avatar_url ? (
          <ExpoImage source={{ uri: row.avatar_url }} style={styles.suggestAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.suggestAvatar, { backgroundColor: Colors.violet, alignItems: "center", justifyContent: "center" }]}>
            <Text style={styles.suggestAvatarText}>{(name[0] ?? "?").toUpperCase()}</Text>
          </View>
        )}
        {row.verified ? (
          <View style={styles.suggestVerified}>
            <BadgeCheck color={Colors.goldBright} size={13} strokeWidth={2.8} />
          </View>
        ) : null}
      </View>
      <Text style={styles.suggestName} numberOfLines={1}>
        {name}
      </Text>
      {handle ? (
        <Text style={styles.suggestHandle} numberOfLines={1}>
          {handle}
        </Text>
      ) : null}
      <View style={styles.suggestReason}>
        <Text style={styles.suggestReasonText} numberOfLines={1}>
          {reason}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  headerWrap: {
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.40)",
  },
  header: {
    paddingHorizontal: GUTTER,
    paddingTop: 4,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  eyebrow: { color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  title: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.4,
    lineHeight: 36,
  },
  tuneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tuneBtnText: { color: Colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },

  filterRow: { paddingHorizontal: GUTTER, paddingTop: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  filterChipText: { color: Colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  filterChipTextActive: { color: Colors.ink, fontWeight: "900" },

  list: { paddingTop: 14 },

  heroWrap: { paddingHorizontal: GUTTER, marginBottom: 22 },
  heroCard: {
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroMedia: { height: 320, position: "relative" },
  heroTopRow: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroPickBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.50)",
  },
  heroPickBadgeText: { color: Colors.goldBright, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.7 },
  heroBody: { position: "absolute", left: 18, right: 18, bottom: 18, gap: 10 },
  heroTitle: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.8, lineHeight: 28 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  heroSubtitle: { color: Colors.muted, fontSize: 12, fontWeight: "800", flex: 1 },

  section: { marginBottom: 22 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: GUTTER,
    marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(98,208,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 },
  sectionSubtitle: { color: Colors.muted2, fontSize: 11, fontWeight: "700" },

  hashtagRow: { paddingHorizontal: GUTTER, gap: 8 },
  hashtagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginRight: 8,
  },
  hashtagRankText: { color: Colors.goldBright, fontSize: 16, fontWeight: "900", letterSpacing: -0.5, minWidth: 16 },
  hashtagDivider: { width: 1, height: 22, backgroundColor: "rgba(255,255,255,0.10)" },
  hashtagTag: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  hashtagCount: { color: Colors.muted2, fontSize: 10, fontWeight: "700", marginTop: 1 },

  suggestRow: { paddingHorizontal: GUTTER, gap: 10 },
  suggestCard: {
    width: 144,
    padding: 14,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.18)",
    marginRight: 10,
    alignItems: "center",
    overflow: "hidden",
  },
  suggestAvatarWrap: { width: 62, height: 62, marginBottom: 10 },
  suggestAvatar: { width: 62, height: 62, borderRadius: 31 },
  suggestAvatarText: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  suggestVerified: {
    position: "absolute",
    right: -2,
    bottom: -2,
    backgroundColor: Colors.ink,
    borderRadius: 999,
    padding: 1,
  },
  suggestName: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  suggestHandle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  suggestReason: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(98,208,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.28)",
  },
  suggestReasonText: { color: Colors.goldBright, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.4 },

  gridHeader: { marginBottom: 6 },
  gridRow: {
    flexDirection: "row",
    paddingHorizontal: GUTTER,
    gap: GRID_GAP,
  },

  gridCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  gridMedia: { position: "relative" },
  gridMediaFooter: { position: "absolute", left: 12, right: 12, bottom: 12 },
  gridTitle: { color: Colors.text, fontSize: 13.5, fontWeight: "900", letterSpacing: -0.3, lineHeight: 17 },
  gridBody: { paddingHorizontal: 12, paddingVertical: 10 },
  gridSubtitle: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

  cardChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  cardChipFloat: { position: "absolute", top: 10, left: 10 },
  cardChipText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  hideBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  metric: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.50)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  metricText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  metricGhost: { flexDirection: "row", alignItems: "center", gap: 4 },
  metricGhostText: { color: Colors.muted2, fontSize: 10.5, fontWeight: "800" },
  inlineMetricsRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 2 },
  actionText: { color: Colors.muted2, fontSize: 11, fontWeight: "800" },

  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 40, gap: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "rgba(63,169,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.32)",
  },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 19 },
  emptyBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: Colors.goldBright,
  },
  emptyBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
