import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, Search, Sparkles, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import CryptoNewsCard from "@/components/CryptoNewsCard";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import {
  type CryptoNewsItem,
  type NewsCategory,
  getCryptoNewsFeed,
  getSavedCryptoNews,
  searchCryptoNews,
  subscribeToNews,
  toggleSaveNews,
} from "@/lib/api/crypto-news";
import {
  addSocialNewsComment,
  getNewsRepostFeed,
  hydrateNewsSocialCounts,
  toggleSocialNewsLike,
  toggleSocialNewsRepost,
  upsertNewsSocialItems,
} from "@/lib/api/news-social";

const FILTERS: { key: NewsCategory | "saved"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "trending", label: "Trending" },
  { key: "meme", label: "Meme" },
  { key: "viral", label: "Viral" },
  { key: "kol", label: "KOL" },
  { key: "saved", label: "Saved" },
];

const PAGE_SIZE = 20;

export default function CryptoNewsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const realtimeLock = useRef(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debouncedSearch.length > 0;
  const isSaved = filter === "saved";

  const repostFeedQuery = useQuery({
    queryKey: ["crypto-news", "reposts"],
    queryFn: () => getNewsRepostFeed(25),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });

  const feedQuery = useInfiniteQuery({
    queryKey: ["crypto-news", "feed", filter, isSearching ? debouncedSearch : ""],
    enabled: !isSaved,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (isSearching) {
        const items = await searchCryptoNews(debouncedSearch, PAGE_SIZE);
        await upsertNewsSocialItems(items);
        return hydrateNewsSocialCounts(items);
      }

      const items = await getCryptoNewsFeed({
        category: filter === "saved" ? "all" : (filter as NewsCategory),
        limit: PAGE_SIZE,
        before: pageParam,
      });

      await upsertNewsSocialItems(items);
      return hydrateNewsSocialCounts(items);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1]?.published_at ?? undefined;
    },
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });

  const savedQuery = useQuery({
    queryKey: ["crypto-news", "saved"],
    enabled: isSaved,
    queryFn: () => getSavedCryptoNews(80),
    staleTime: 30_000,
  });

  const savedIdsQuery = useQuery({
    queryKey: ["crypto-news", "saved-ids"],
    queryFn: async () => new Set((await getSavedCryptoNews(200)).map((n) => n.id)),
    staleTime: 60_000,
  });

  const repostFeed = repostFeedQuery.data ?? [];

  const items: CryptoNewsItem[] = useMemo(() => {
    if (isSaved) return savedQuery.data ?? [];

    const rss = (feedQuery.data?.pages ?? []).flat();

    const repostMapped: CryptoNewsItem[] = repostFeed.map((r) => ({
      id: `${r.external_id}-repost-${r.reposted_at}`,
      source: r.username || "Community",
      source_url: r.source_url,
      title: `Reposted: ${r.title}`,
      description: r.quote_text || r.description || null,
      image_url: r.image_url,
      category: (r.category as NewsCategory) || "trending",
      sentiment: (r.sentiment as any) || null,
      coin_mentions: r.coin_mentions || [],
      engagement: {
        likes: r.like_count || 0,
        shares: r.repost_count || 0,
        comments: r.comment_count || 0,
      },
      published_at: r.reposted_at,
    }));

    const deduped = [...repostMapped, ...rss].reduce<CryptoNewsItem[]>((acc, cur) => {
      if (!acc.find((i) => i.id === cur.id)) acc.push(cur);
      return acc;
    }, []);

    return deduped.sort(
      (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
    );
  }, [isSaved, savedQuery.data, feedQuery.data, repostFeed]);

  const savedIds = savedIdsQuery.data ?? new Set<string>();

  const saveMutation = useMutation({
    mutationFn: async (payload: { id: string; item: CryptoNewsItem }) => toggleSaveNews(payload.id, payload.item),
  });

  const socialRefresh = useCallback(() => {
    if (realtimeLock.current) return;

    realtimeLock.current = true;

    qc.invalidateQueries({ queryKey: ["crypto-news", "feed"] });
    qc.invalidateQueries({ queryKey: ["crypto-news", "reposts"] });

    setTimeout(() => {
      realtimeLock.current = false;
    }, 1200);
  }, [qc]);

  useEffect(() => {
    const unsub = subscribeToNews(() => {
      socialRefresh();
    });
    return unsub;
  }, [socialRefresh]);

  const onToggleLike = useCallback(async (item: CryptoNewsItem) => {
    await toggleSocialNewsLike(item.id.split("-repost-")[0]);
    socialRefresh();
    return true;
  }, [socialRefresh]);

  const onToggleRepost = useCallback(async (item: CryptoNewsItem, quoteText?: string | null) => {
    await toggleSocialNewsRepost(item.id.split("-repost-")[0], quoteText);
    socialRefresh();
    return true;
  }, [socialRefresh]);

  const onComment = useCallback(async (item: CryptoNewsItem, body: string) => {
    await addSocialNewsComment(item.id.split("-repost-")[0], body);
    socialRefresh();
  }, [socialRefresh]);

  const onSelectFilter = useCallback((next: (typeof FILTERS)[number]["key"]) => {
    Haptics.selectionAsync().catch(() => {});
    setFilter(next);
  }, []);

  const onShare = useCallback(async (item: CryptoNewsItem) => {
    try {
      await Share.share({
        message: `${item.title}\n${item.source_url ?? ""}`.trim(),
        url: item.source_url ?? undefined,
        title: item.title,
      });
    } catch (e) {
      console.log("[crypto-news] share failed", e);
    }
  }, []);

  const onPressItem = useCallback((item: CryptoNewsItem) => {
    if (!item.source_url) return;
    Linking.openURL(item.source_url).catch((e) => console.log("[crypto-news] open url", e));
  }, []);

  const renderItem = useCallback(({ item }: { item: CryptoNewsItem }) => (
    <CryptoNewsCard
      item={item}
      saved={savedIds.has(item.id)}
      onToggleSave={(n) => {
        saveMutation.mutate({ id: n.id, item: n });
      }}
      onToggleLike={onToggleLike}
      onToggleRepost={onToggleRepost}
      onComment={onComment}
      onShare={onShare}
      onPress={onPressItem}
    />
  ), [savedIds, saveMutation, onToggleLike, onToggleRepost, onComment, onShare, onPressItem]);

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isSaved) savedQuery.refetch();
    else {
      repostFeedQuery.refetch();
      feedQuery.refetch();
    }
  }, [isSaved, feedQuery, savedQuery, repostFeedQuery]);

  const onEndReached = useCallback(() => {
    if (isSaved || isSearching) return;
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [isSaved, isSearching, feedQuery]);

  const refreshing =
    (isSaved ? savedQuery.isRefetching : feedQuery.isRefetching) === true;

  return (
    <View style={styles.root} testID="crypto-news-screen">
      <AppBackground variant="market" />
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/home")}
            style={styles.iconBtn}
            hitSlop={8}
            testID="news-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.8} />
          </Pressable>
          <View style={styles.headerMid}>
            <Text style={styles.eyebrow}>CRYPTO NEWS</Text>
            <Text style={styles.title}>Live alpha signal</Text>
          </View>
          <View style={styles.iconBtn}>
            <Sparkles color={Colors.mint} size={18} strokeWidth={2.8} />
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Search color={Colors.muted} size={15} strokeWidth={2.6} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search news, tokens, KOLs"
            placeholderTextColor={Colors.muted2}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            testID="news-search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={10} testID="news-search-clear">
              <X color={Colors.muted} size={15} strokeWidth={2.6} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContent}
            data={FILTERS}
            keyExtractor={(f) => f.key}
            renderItem={({ item: f }) => {
              const active = f.key === filter;
              return (
                <Pressable
                  onPress={() => onSelectFilter(f.key)}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`news-filter-${f.key}`}
                >
                  {f.key === "saved" ? (
                    <Bookmark
                      color={active ? Colors.ink : Colors.muted}
                      size={11}
                      strokeWidth={3}
                      fill={active ? Colors.ink : "transparent"}
                    />
                  ) : null}
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        <FlatList
          removeClippedSubviews
          maxToRenderPerBatch={6}
          windowSize={7}
          initialNumToRender={5}
          updateCellsBatchingPeriod={40}
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.mint}
              colors={[Colors.mint]}
            />
          }
          onEndReachedThreshold={0.6}
          onEndReached={onEndReached}
          ListEmptyComponent={<EmptyState filter={filter} loading={feedQuery.isLoading || savedQuery.isLoading} />}
          ListFooterComponent={
            !isSaved && feedQuery.isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={Colors.mint} />
              </View>
            ) : null
          }
          testID="news-list"
        />
      </SafeAreaView>
    </View>
  );
}

function EmptyState({ filter, loading }: { filter: string; loading: boolean }) {
  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={Colors.mint} />
        <Text style={styles.emptyTitle}>Scanning the feed…</Text>
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Sparkles color={Colors.mint} size={20} strokeWidth={2.6} />
      </View>
      <Text style={styles.emptyTitle}>
        {filter === "saved" ? "No saved articles" : "Nothing here yet"}
      </Text>
      <Text style={styles.emptyBody}>
        {filter === "saved"
          ? "Tap the bookmark on any article to save it for later."
          : "New headlines will appear as soon as the wires light up."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerMid: { flex: 1 },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(16,16,14,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  filterRow: { marginTop: 10 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  chipText: { color: Colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  chipTextActive: { color: Colors.ink },
  list: { padding: 16, paddingTop: 14, paddingBottom: 60 },
  empty: {
    marginTop: 30,
    padding: 24,
    borderRadius: 22,
    backgroundColor: "rgba(16,16,14,0.84)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.16)",
    alignItems: "center",
    gap: 10,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(216,183,90,0.14)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  footerLoader: { paddingVertical: 18, alignItems: "center" },
});