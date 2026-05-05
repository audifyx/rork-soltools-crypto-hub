import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Radio,
  Repeat,
  Search,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

import AppBackground from "@/components/ui/AppBackground";
import KOLCard from "@/components/KOLCard";
import KOLTransactionCard from "@/components/KOLTransactionCard";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import {
  getKOLProfiles,
  getKOLRecentTransactions,
  searchKOLProfiles,
  subscribeToKOLTransactions,
  toggleFollowKOL,
  type KOLProfile,
  type KOLTransaction,
  type KOLTxType,
} from "@/lib/api/kol";

type Tab = "kols" | "feed";
type TxFilter = "ALL" | KOLTxType;

const PAGE_SIZE = 25;

const TX_FILTERS: { key: TxFilter; label: string; color: string; Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }> }[] = [
  { key: "ALL", label: "All", color: Colors.cyan, Icon: Radio },
  { key: "BUY", label: "Buys", color: Colors.mint, Icon: ArrowDownLeft },
  { key: "SELL", label: "Sells", color: Colors.rose, Icon: ArrowUpRight },
  { key: "SWAP", label: "Swaps", color: Colors.cyan, Icon: Repeat },
];

export default function KOLScanScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("feed");
  const [search, setSearch] = useState<string>("");
  const [debounced, setDebounced] = useState<string>("");
  const [txFilter, setTxFilter] = useState<TxFilter>("ALL");
  const [activeKolId, setActiveKolId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debounced.length > 0;

  // KOL list
  const kolListQuery = useInfiniteQuery({
    queryKey: ["kol", "list"],
    enabled: tab === "kols" && !isSearching,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getKOLProfiles(PAGE_SIZE, (pageParam as number) * PAGE_SIZE),
    getNextPageParam: (lastPage, all) => (lastPage.length < PAGE_SIZE ? undefined : all.length),
    staleTime: 30_000,
  });

  const kolSearchQuery = useQuery({
    queryKey: ["kol", "search", debounced],
    enabled: tab === "kols" && isSearching,
    queryFn: () => searchKOLProfiles(debounced, PAGE_SIZE),
    staleTime: 15_000,
  });

  const kols: KOLProfile[] = useMemo(() => {
    if (tab !== "kols") return [];
    if (isSearching) return kolSearchQuery.data ?? [];
    return (kolListQuery.data?.pages ?? []).flat();
  }, [tab, isSearching, kolSearchQuery.data, kolListQuery.data]);

  // Transactions feed
  const txQuery = useInfiniteQuery({
    queryKey: ["kol", "tx", activeKolId, txFilter],
    enabled: tab === "feed",
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getKOLRecentTransactions({
        kolId: activeKolId ?? undefined,
        txType: txFilter === "ALL" ? null : txFilter,
        limit: PAGE_SIZE,
        before: pageParam,
      }),
    getNextPageParam: (last) =>
      last && last.length >= PAGE_SIZE ? last[last.length - 1]?.occurred_at ?? undefined : undefined,
    staleTime: 15_000,
  });

  const txs: KOLTransaction[] = useMemo(
    () => (txQuery.data?.pages ?? []).flat(),
    [txQuery.data],
  );

  // realtime push
  useEffect(() => {
    if (tab !== "feed") return;
    const unsub = subscribeToKOLTransactions(() => {
      qc.invalidateQueries({ queryKey: ["kol", "tx"] });
    });
    return unsub;
  }, [tab, qc]);

  const followMutation = useMutation({
    mutationFn: (kolId: string) => toggleFollowKOL(kolId),
    onMutate: async (kolId: string) => {
      await qc.cancelQueries({ queryKey: ["kol", "list"] });
      await qc.cancelQueries({ queryKey: ["kol", "search"] });
      const update = (rows: KOLProfile[] | undefined) =>
        (rows ?? []).map((k) =>
          k.id === kolId
            ? {
                ...k,
                is_followed: !k.is_followed,
                follower_count: Math.max(0, k.follower_count + (k.is_followed ? -1 : 1)),
              }
            : k,
        );
      qc.setQueriesData<{ pages?: KOLProfile[][] } | KOLProfile[] | undefined>(
        { queryKey: ["kol", "list"] },
        (data) => {
          if (!data) return data;
          if (Array.isArray(data)) return update(data);
          if ("pages" in data && Array.isArray(data.pages)) {
            return { ...data, pages: data.pages.map((p) => update(p)) };
          }
          return data;
        },
      );
      qc.setQueriesData<KOLProfile[] | undefined>({ queryKey: ["kol", "search"] }, (rows) => update(rows));
    },
    onError: (e) => console.log("[kol-scan] follow failed", e),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["kol", "list"] });
      qc.invalidateQueries({ queryKey: ["kol", "search"] });
    },
  });

  const onSelectTab = useCallback((next: Tab) => {
    Haptics.selectionAsync().catch(() => {});
    setTab(next);
  }, []);

  const onSelectTxFilter = useCallback((next: TxFilter) => {
    Haptics.selectionAsync().catch(() => {});
    setTxFilter(next);
  }, []);

  const onPressKOL = useCallback((kol: KOLProfile) => {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/kol/[id]", params: { id: kol.id } });
  }, [router]);

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (tab === "feed") txQuery.refetch();
    else if (isSearching) kolSearchQuery.refetch();
    else kolListQuery.refetch();
  }, [tab, isSearching, txQuery, kolSearchQuery, kolListQuery]);

  const onEndReached = useCallback(() => {
    if (tab === "feed") {
      if (txQuery.hasNextPage && !txQuery.isFetchingNextPage) txQuery.fetchNextPage();
    } else if (!isSearching) {
      if (kolListQuery.hasNextPage && !kolListQuery.isFetchingNextPage) kolListQuery.fetchNextPage();
    }
  }, [tab, isSearching, txQuery, kolListQuery]);

  const refreshing =
    tab === "feed"
      ? txQuery.isRefetching
      : isSearching
        ? kolSearchQuery.isRefetching
        : kolListQuery.isRefetching;

  const activeKolLabel = useMemo(() => {
    if (!activeKolId) return null;
    const found = kols.find((k) => k.id === activeKolId);
    return found?.name ?? null;
  }, [activeKolId, kols]);

  return (
    <View style={styles.root} testID="kol-scan-screen">
      <AppBackground variant="market" />
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/home")}
            style={styles.iconBtn}
            hitSlop={8}
            testID="kol-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.8} />
          </Pressable>
          <View style={styles.headerMid}>
            <Text style={styles.eyebrow}>KOL SCAN</Text>
            <Text style={styles.title}>Smart money tape</Text>
          </View>
          <View style={styles.iconBtn}>
            <Radio color={Colors.mint} size={18} strokeWidth={2.8} />
          </View>
        </View>

        <View style={styles.tabs}>
          <TabPill label="Live feed" active={tab === "feed"} onPress={() => onSelectTab("feed")} testID="kol-tab-feed" />
          <TabPill label="Browse KOLs" active={tab === "kols"} onPress={() => onSelectTab("kols")} testID="kol-tab-kols" />
        </View>

        {tab === "kols" ? (
          <View style={styles.searchWrap}>
            <Search color={Colors.muted} size={15} strokeWidth={2.6} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, X handle, wallet"
              placeholderTextColor={Colors.muted2}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID="kol-search"
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch("")} hitSlop={10} testID="kol-search-clear">
                <X color={Colors.muted} size={15} strokeWidth={2.6} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.filterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
              {TX_FILTERS.map((f) => {
                const active = f.key === txFilter;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => onSelectTxFilter(f.key)}
                    style={[styles.chip, active && { backgroundColor: f.color, borderColor: f.color }]}
                    testID={`kol-filter-${f.key.toLowerCase()}`}
                  >
                    <f.Icon color={active ? Colors.ink : f.color} size={11} strokeWidth={3} />
                    <Text style={[styles.chipText, { color: active ? Colors.ink : Colors.muted }]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {activeKolId ? (
              <Pressable
                onPress={() => setActiveKolId(null)}
                style={styles.activeChip}
                testID="kol-clear-active"
              >
                <Users color={Colors.mint} size={11} strokeWidth={3} />
                <Text style={styles.activeChipText} numberOfLines={1}>
                  {activeKolLabel ?? "Filtered"}
                </Text>
                <X color={Colors.mint} size={11} strokeWidth={3} />
              </Pressable>
            ) : null}
          </View>
        )}

        {tab === "feed" ? (
          <FlatList
            data={txs}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => (
              <KOLTransactionCard
                tx={item}
                onPressKOL={(id) => router.push({ pathname: "/kol/[id]", params: { id } })}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing === true} onRefresh={onRefresh} tintColor={Colors.mint} colors={[Colors.mint]} />
            }
            onEndReachedThreshold={0.5}
            onEndReached={onEndReached}
            ListEmptyComponent={<EmptyState mode="feed" loading={txQuery.isLoading} />}
            ListFooterComponent={
              txQuery.isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={Colors.mint} />
                </View>
              ) : null
            }
            testID="kol-tx-list"
          />
        ) : (
          <FlatList
            data={kols}
            keyExtractor={(k) => k.id}
            renderItem={({ item }) => (
              <KOLCard
                kol={item}
                onPress={onPressKOL}
                onToggleFollow={(k) => followMutation.mutate(k.id)}
                busy={followMutation.isPending}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing === true} onRefresh={onRefresh} tintColor={Colors.mint} colors={[Colors.mint]} />
            }
            onEndReachedThreshold={0.5}
            onEndReached={onEndReached}
            ListEmptyComponent={
              <EmptyState
                mode="kols"
                loading={isSearching ? kolSearchQuery.isLoading : kolListQuery.isLoading}
              />
            }
            ListFooterComponent={
              !isSearching && kolListQuery.isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={Colors.mint} />
                </View>
              ) : null
            }
            testID="kol-list"
          />
        )}
      </SafeAreaView>
    </View>
  );
}

interface TabPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}

function TabPill({ label, active, onPress, testID }: TabPillProps) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]} testID={testID}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ mode, loading }: { mode: "feed" | "kols"; loading: boolean }) {
  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={Colors.mint} />
        <Text style={styles.emptyTitle}>{mode === "feed" ? "Listening to the tape…" : "Loading KOLs…"}</Text>
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Radio color={Colors.mint} size={20} strokeWidth={2.6} />
      </View>
      <Text style={styles.emptyTitle}>
        {mode === "feed" ? "No transactions yet" : "No KOLs found"}
      </Text>
      <Text style={styles.emptyBody}>
        {mode === "feed"
          ? "When the tracked wallets fire, their buys, sells and swaps land here in real time."
          : "Try a different search, or browse all to discover smart-money traders."}
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
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  tabText: { color: Colors.muted, fontSize: 12.5, fontWeight: "900", letterSpacing: 0.4 },
  tabTextActive: { color: Colors.ink },
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
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingRight: 16,
  },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(216,183,90,0.14)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.42)",
    maxWidth: 150,
  },
  activeChipText: { color: Colors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
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
