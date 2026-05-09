import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Compass, Flame, Newspaper, RefreshCw, Sparkles, TrendingUp, Users } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import CryptoNewsCard from "@/components/CryptoNewsCard";
import Colors from "@/constants/colors";
import {
  fetchCryptoNewsFeed,
  getSavedNewsIds,
  toggleSavedNews,
  type CryptoNewsItem,
  type NewsCategory,
} from "@/lib/api/crypto-news";
import {
  addSocialNewsComment,
  hydrateNewsSocialCounts,
  toggleSocialNewsLike,
  toggleSocialNewsRepost,
  upsertNewsSocialItems,
} from "@/lib/api/news-social";

interface CategoryTab {
  key: NewsCategory;
  label: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  color: string;
}

const CATEGORIES: CategoryTab[] = [
  { key: "all", label: "All", Icon: Compass, color: Colors.text },
  { key: "trending", label: "Trending", Icon: Flame, color: Colors.mint },
  { key: "viral", label: "Viral", Icon: TrendingUp, color: Colors.cyan },
  { key: "meme", label: "Meme", Icon: Sparkles, color: Colors.orange },
  { key: "kol", label: "KOL", Icon: Users, color: Colors.violet },
];

export default function CryptoNewsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [category, setCategory] = useState<NewsCategory>("all");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [repostedIds, setRepostedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSavedNewsIds().then(setSavedIds).catch(() => {});
  }, []);

  const newsQ = useQuery({
    queryKey: ["crypto-news", category],
    queryFn: async () => {
      const items = await fetchCryptoNewsFeed({ category, limit: 60 });
      try {
        await upsertNewsSocialItems(items);
        const hydrated = await hydrateNewsSocialCounts(items);
        return hydrated;
      } catch {
        return items;
      }
    },
    staleTime: 1000 * 60 * 3,
  });

  const items = useMemo<CryptoNewsItem[]>(() => newsQ.data ?? [], [newsQ.data]);

  const onRefresh = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    await qc.invalidateQueries({ queryKey: ["crypto-news"] });
  }, [qc]);

  const handleSave = useCallback(async (item: CryptoNewsItem) => {
    const next = await toggleSavedNews(item.id);
    setSavedIds(next);
  }, []);

  const handleLike = useCallback(async (item: CryptoNewsItem) => {
    try {
      const liked = await toggleSocialNewsLike(item.id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(item.id); else next.delete(item.id);
        return next;
      });
      return liked;
    } catch (e) {
      console.log("[crypto-news] like failed", e);
      return false;
    }
  }, []);

  const handleRepost = useCallback(async (item: CryptoNewsItem, quoteText?: string | null) => {
    try {
      const reposted = await toggleSocialNewsRepost(item.id, quoteText ?? null);
      setRepostedIds((prev) => {
        const next = new Set(prev);
        if (reposted) next.add(item.id); else next.delete(item.id);
        return next;
      });
      return reposted;
    } catch (e) {
      console.log("[crypto-news] repost failed", e);
      return false;
    }
  }, []);

  const handleComment = useCallback(async (item: CryptoNewsItem, body: string) => {
    try { await addSocialNewsComment(item.id, body); } catch (e) { console.log("[crypto-news] comment failed", e); }
  }, []);

  const handleShare = useCallback((item: CryptoNewsItem) => {
    const url = item.source_url ?? "";
    const message = `${item.title}${url ? `\n${url}` : ""}`;
    Share.share({ message, url: url || undefined, title: item.title }).catch(() => {});
  }, []);

  const handlePress = useCallback((item: CryptoNewsItem) => {
    if (item.source_url) Linking.openURL(item.source_url).catch(() => {});
  }, []);

  const renderItem = useCallback<ListRenderItem<CryptoNewsItem>>(
    ({ item }) => (
      <CryptoNewsCard
        item={item}
        saved={savedIds.includes(item.id)}
        liked={likedIds.has(item.id)}
        reposted={repostedIds.has(item.id)}
        onToggleSave={handleSave}
        onToggleLike={handleLike}
        onToggleRepost={handleRepost}
        onComment={handleComment}
        onShare={handleShare}
        onPress={handlePress}
      />
    ),
    [savedIds, likedIds, repostedIds, handleSave, handleLike, handleRepost, handleComment, handleShare, handlePress],
  );

  const keyExtractor = useCallback((it: CryptoNewsItem) => it.id, []);

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="crypto-news-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#02060B", "#000000"]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
          hitSlop={10}
          testID="news-back"
        >
          <ArrowLeft color={Colors.text} size={20} strokeWidth={2.4} />
        </Pressable>

        <View style={styles.titleWrap}>
          <View style={styles.eyebrowRow}>
            <Newspaper color={Colors.mint} size={12} strokeWidth={2.6} />
            <Text style={styles.eyebrow}>Live signal</Text>
          </View>
          <Text style={styles.title}>Crypto Newswire</Text>
        </View>

        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
          hitSlop={10}
          testID="news-refresh"
        >
          <RefreshCw color={Colors.text} size={18} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={styles.tabsWrap}>
        <FlatList
          data={CATEGORIES}
          keyExtractor={(c) => c.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          renderItem={({ item: c }) => {
            const active = category === c.key;
            return (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCategory(c.key);
                }}
                style={({ pressed }) => [
                  styles.tab,
                  active && { borderColor: `${c.color}88`, backgroundColor: `${c.color}1A` },
                  pressed && styles.btnPressed,
                ]}
                testID={`news-tab-${c.key}`}
              >
                <c.Icon color={active ? c.color : Colors.muted} size={13} strokeWidth={2.6} />
                <Text style={[styles.tabLabel, { color: active ? c.color : Colors.muted }]}>{c.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {newsQ.isLoading && items.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.mint} />
          <Text style={styles.loadingText}>Pulling the wire...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Newspaper color={Colors.mint} size={28} strokeWidth={2.4} />
          </View>
          <Text style={styles.emptyTitle}>No signal yet</Text>
          <Text style={styles.emptyBody}>Pull to refresh and we&apos;ll pull the latest crypto stories from across the wire.</Text>
          <Pressable onPress={onRefresh} style={({ pressed }) => [styles.retryBtn, pressed && styles.btnPressed]}>
            <RefreshCw color={Colors.ink} size={14} strokeWidth={2.8} />
            <Text style={styles.retryText}>Refresh</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={newsQ.isFetching && items.length > 0}
              onRefresh={onRefresh}
              tintColor={Colors.mint}
              colors={[Colors.mint]}
            />
          }
          removeClippedSubviews={Platform.OS !== "web"}
          windowSize={9}
          maxToRenderPerBatch={6}
          initialNumToRender={6}
        />
      )}
    </SafeAreaView>
  );
}

function Separator() { return <View style={styles.sep} />; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  btnPressed: { opacity: 0.7 },
  titleWrap: { flex: 1, alignItems: "center" },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 2,
  },
  tabsWrap: { paddingBottom: 8 },
  tabsContent: { paddingHorizontal: 14, gap: 8 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tabLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  listContent: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 120 },
  sep: { height: 10 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: Colors.muted, fontSize: 13, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(63,169,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.22)",
  },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.mint,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 4,
  },
  retryText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },
});
