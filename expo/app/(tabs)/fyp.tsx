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
  Hash,
  Heart,
  MessageCircle,
  Play,
  RefreshCcw,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
        queryFn: () => listTrendingHashtags(12),
      },
      {
        queryKey: ["fyp-suggested", userId ?? "guest"],
        enabled: !!userId,
        staleTime: 60_000,
        queryFn: () => (userId ? listSuggestedFollows(userId, 12) : Promise.resolve([] as SuggestedFollowRow[])),
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

  const onRefresh = useCallback(() => {
    hapticSelect();
    Promise.all([fypQuery.refetch(), hashtagsQuery.refetch(), suggestionsQuery.refetch()]).catch(() => {});
  }, [fypQuery, hashtagsQuery, suggestionsQuery]);

  const onOpen = useCallback(
    (card: FypCard) => {
      hapticSelect();
      try {
        if (card.kind === "reel") router.push("/(tabs)/reels");
        else if (card.kind === "story") router.push({ pathname: "/story/[id]", params: { id: card.ref_id } });
        else if (card.kind === "event") router.push("/events");
        else if (card.kind === "community") router.push("/communities");
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
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>HANDPICKED FOR YOU</Text>
            </View>
            <Text style={styles.title}>For You</Text>
          </View>
          <Pressable onPress={onRefresh} style={styles.refreshBtn} testID="fyp-refresh">
            <RefreshCcw color={Colors.text} size={15} strokeWidth={2.6} />
          </Pressable>
          <Pressable onPress={() => router.push("/interest-quiz")} style={styles.tuneBtn} testID="fyp-tune">
            <LinearGradient colors={[Colors.goldBright, Colors.mint]} style={styles.tuneGrad}>
              <Compass color={Colors.ink} size={15} strokeWidth={2.8} />
            </LinearGradient>
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
        data={rest}
        keyExtractor={(c) => c.id}
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
            {hashtags.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <TrendingUp color={Colors.goldBright} size={13} strokeWidth={2.8} />
                  <Text style={styles.sectionTitle}>Trending now</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hashtagRow}
                >
                  {hashtags.map((h, i) => (
                    <Pressable
                      key={h.tag}
                      onPress={() => onHashtag(h.tag)}
                      style={styles.hashtagChip}
                      testID={`fyp-hashtag-${h.tag}`}
                    >
                      <View style={styles.hashtagRank}>
                        <Text style={styles.hashtagRankText}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.hashtagTagRow}>
                          <Hash color={Colors.goldBright} size={11} strokeWidth={2.8} />
                          <Text style={styles.hashtagTag} numberOfLines={1}>
                            {h.tag}
                          </Text>
                        </View>
                        <Text style={styles.hashtagCount}>
                          {(h.post_count ?? 0).toLocaleString()} posts
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {hero ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Sparkles color={Colors.goldBright} size={13} strokeWidth={2.8} />
                  <Text style={styles.sectionTitle}>Top pick for you</Text>
                </View>
                <HeroCard card={hero} onPress={() => onOpen(hero)} onLongPress={() => onLongPress(hero)} />
              </View>
            ) : null}

            {suggestions.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <UserPlus color={Colors.goldBright} size={13} strokeWidth={2.8} />
                  <Text style={styles.sectionTitle}>People you may know</Text>
                </View>
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

            {rest.length > 0 ? (
              <View style={styles.sectionHeader}>
                <Compass color={Colors.muted} size={13} strokeWidth={2.6} />
                <Text style={styles.sectionTitle}>More for you</Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <FypCardView
            card={item}
            onPress={() => onOpen(item)}
            onLongPress={() => onLongPress(item)}
            onHide={() => onHide(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
      style={styles.heroCard}
      testID={`fyp-hero-${card.id}`}
    >
      <View style={styles.heroMedia}>
        {cover ? (
          <ExpoImage source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[meta.tint, "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.92)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.cardChip, { backgroundColor: `${meta.tint}22`, borderColor: `${meta.tint}88` }]}>
          <Icon color={meta.tint} size={11} strokeWidth={2.8} />
          <Text style={[styles.cardChipText, { color: meta.tint }]}>{meta.label.toUpperCase()}</Text>
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
                <Text style={styles.metricText}>{payload.likes}</Text>
              </View>
            ) : null}
            {typeof payload.comments === "number" ? (
              <View style={styles.metric}>
                <MessageCircle color={Colors.text} size={11} strokeWidth={2.6} />
                <Text style={styles.metricText}>{payload.comments}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function FypCardView({
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

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={styles.card}
      testID={`fyp-card-${card.id}`}
    >
      <View style={styles.cardMedia}>
        {cover ? (
          <ExpoImage source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[meta.tint, "rgba(0,0,0,0.4)"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.65)"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.cardChip, { backgroundColor: `${meta.tint}22`, borderColor: `${meta.tint}88` }]}>
          <Icon color={meta.tint} size={11} strokeWidth={2.8} />
          <Text style={[styles.cardChipText, { color: meta.tint }]}>{meta.label.toUpperCase()}</Text>
        </View>
        <Pressable
          onPress={onHide}
          hitSlop={8}
          style={styles.hideBtn}
          testID={`fyp-hide-${card.id}`}
        >
          <EyeOff color={Colors.text} size={13} strokeWidth={2.6} />
        </Pressable>
        {typeof payload.likes === "number" || typeof payload.comments === "number" ? (
          <View style={styles.cardMetricsRow}>
            {typeof payload.likes === "number" ? (
              <View style={styles.metric}>
                <Heart color={Colors.text} size={11} strokeWidth={2.6} />
                <Text style={styles.metricText}>{payload.likes}</Text>
              </View>
            ) : null}
            {typeof payload.comments === "number" ? (
              <View style={styles.metric}>
                <MessageCircle color={Colors.text} size={11} strokeWidth={2.6} />
                <Text style={styles.metricText}>{payload.comments}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
          {payload.reason ? ` · ${payload.reason}` : ""}
        </Text>
      </View>
    </Pressable>
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
    <Pressable onPress={onPress} style={styles.suggestCard} testID={`fyp-suggest-${row.suggested_user_id}`}>
      <LinearGradient colors={["rgba(98,208,255,0.18)", "rgba(91,141,239,0.05)"]} style={StyleSheet.absoluteFill} />
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
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(63,169,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -1.1, marginTop: 2 },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  tuneBtn: { borderRadius: 13, overflow: "hidden" },
  tuneGrad: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },

  filterRow: { paddingHorizontal: 14, paddingTop: 12, gap: 8 },
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
    backgroundColor: Colors.goldBright,
    borderColor: Colors.goldBright,
  },
  filterChipText: { color: Colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
  filterChipTextActive: { color: Colors.ink },

  list: { paddingTop: 14, paddingHorizontal: 14 },
  section: { marginBottom: 18 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },

  hashtagRow: { paddingRight: 14, gap: 10 },
  hashtagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.18)",
    marginRight: 10,
    minWidth: 170,
  },
  hashtagRank: {
    width: 26, height: 26, borderRadius: 9,
    backgroundColor: "rgba(98,208,255,0.14)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(98,208,255,0.32)",
  },
  hashtagRankText: { color: Colors.goldBright, fontSize: 11, fontWeight: "900" },
  hashtagTagRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  hashtagTag: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  hashtagCount: { color: Colors.muted2, fontSize: 10, fontWeight: "700", marginTop: 2 },

  heroCard: { borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  heroMedia: { height: 280, position: "relative" },
  heroBody: { position: "absolute", left: 14, right: 14, bottom: 14, gap: 8 },
  heroTitle: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.6, lineHeight: 24 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  heroSubtitle: { color: Colors.muted, fontSize: 12, fontWeight: "800", flex: 1 },

  suggestRow: { paddingRight: 14, gap: 10 },
  suggestCard: {
    width: 140,
    padding: 12,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.16)",
    marginRight: 10,
    alignItems: "center",
    overflow: "hidden",
  },
  suggestAvatarWrap: { width: 60, height: 60, marginBottom: 8 },
  suggestAvatar: { width: 60, height: 60, borderRadius: 30 },
  suggestAvatarText: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  suggestVerified: {
    position: "absolute", right: -2, bottom: -2,
    backgroundColor: Colors.ink, borderRadius: 999, padding: 1,
  },
  suggestName: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  suggestHandle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  suggestReason: {
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(98,208,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.28)",
  },
  suggestReasonText: { color: Colors.goldBright, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.4 },

  card: { borderRadius: 22, overflow: "hidden", backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  cardMedia: { height: 160 },
  cardChip: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  cardChipText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  hideBtn: {
    position: "absolute", top: 12, right: 12,
    width: 28, height: 28, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center", justifyContent: "center",
  },
  cardMetricsRow: { position: "absolute", right: 12, bottom: 12, flexDirection: "row", gap: 6 },
  metric: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  metricText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  cardBody: { paddingHorizontal: 14, paddingVertical: 12 },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.3, lineHeight: 19 },
  cardSubtitle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 4 },

  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 40, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: "rgba(63,169,255,0.14)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(63,169,255,0.32)" },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 19 },
  emptyBtn: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, backgroundColor: Colors.goldBright },
  emptyBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
