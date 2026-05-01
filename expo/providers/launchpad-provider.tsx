import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  LaunchSort,
  LaunchTab,
  LaunchToken,
  LaunchVenueFilter,
  LaunchpadStats,
} from "@/types/launchpad";

const STORAGE_KEY = "soltools.launchpad.listings.v1";
const UPVOTES_KEY = "soltools.launchpad.upvotes.v1";

async function loadListings(): Promise<LaunchToken[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LaunchToken[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.log("[launchpad] load listings failed", e);
    return [];
  }
}

async function persistListings(items: LaunchToken[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.log("[launchpad] persist listings failed", e);
  }
}

async function loadUpvotes(): Promise<Record<string, true>> {
  try {
    const raw = await AsyncStorage.getItem(UPVOTES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, true>;
  } catch {
    return {};
  }
}

async function persistUpvotes(map: Record<string, true>): Promise<void> {
  try {
    await AsyncStorage.setItem(UPVOTES_KEY, JSON.stringify(map));
  } catch {}
}

export type SubmitTokenInput = Omit<
  LaunchToken,
  "id" | "createdAt" | "upvotes" | "watchers" | "featured" | "hot" | "verified" | "submittedBy"
> & {
  featured?: boolean;
};

export const [LaunchpadProvider, useLaunchpad] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<LaunchTab>("all");
  const [sort, setSort] = useState<LaunchSort>("newest");
  const [venue, setVenue] = useState<LaunchVenueFilter>("all");
  const [search, setSearch] = useState<string>("");
  const [upvoted, setUpvoted] = useState<Record<string, true>>({});

  const listingsQuery = useQuery<LaunchToken[]>({
    queryKey: ["launchpad", "listings"],
    queryFn: loadListings,
    staleTime: Infinity,
  });

  useEffect(() => {
    loadUpvotes().then(setUpvoted);
  }, []);

  const submitMutation = useMutation({
    mutationFn: async (input: SubmitTokenInput) => {
      const token: LaunchToken = {
        ...input,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        upvotes: 0,
        watchers: 0,
        featured: input.featured ?? false,
        hot: false,
        verified: false,
        submittedBy: "user",
      };
      const prev = (queryClient.getQueryData<LaunchToken[]>(["launchpad", "listings"]) ?? []).slice();
      const next = [token, ...prev];
      await persistListings(next);
      console.log("[launchpad] token submitted", token.ticker);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["launchpad", "listings"], next);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const prev = (queryClient.getQueryData<LaunchToken[]>(["launchpad", "listings"]) ?? []).slice();
      const next = prev.filter((t) => t.id !== id);
      await persistListings(next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["launchpad", "listings"], next);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      // TODO: wire to backend endpoint that pulls live trending pairs
      await new Promise((r) => setTimeout(r, 700));
      return Date.now();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["launchpad", "listings"] });
    },
  });

  const toggleUpvote = useCallback(
    (id: string) => {
      setUpvoted((prev) => {
        const next = { ...prev };
        if (next[id]) {
          delete next[id];
        } else {
          next[id] = true;
        }
        persistUpvotes(next);
        return next;
      });
      const prev = queryClient.getQueryData<LaunchToken[]>(["launchpad", "listings"]) ?? [];
      const updated = prev.map((t) =>
        t.id === id
          ? { ...t, upvotes: Math.max(0, t.upvotes + (upvoted[id] ? -1 : 1)) }
          : t,
      );
      queryClient.setQueryData(["launchpad", "listings"], updated);
      persistListings(updated);
    },
    [queryClient, upvoted],
  );

  const listings = listingsQuery.data ?? [];

  const filtered = useMemo<LaunchToken[]>(() => {
    let items = listings.slice();
    if (tab === "featured") items = items.filter((t) => t.featured);
    if (tab === "mine") items = items.filter((t) => t.submittedBy === "user");
    if (venue !== "all") items = items.filter((t) => t.venue === venue);
    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.ticker.toLowerCase().includes(q) ||
          t.contract.toLowerCase().includes(q),
      );
    }
    items.sort((a, b) => {
      switch (sort) {
        case "trending":
          return b.upvotes - a.upvotes;
        case "liquidity":
          return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
        case "marketcap":
          return (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0);
        case "volume":
          return (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0);
        case "newest":
        default:
          return b.createdAt - a.createdAt;
      }
    });
    return items;
  }, [listings, tab, venue, search, sort]);

  const stats = useMemo<LaunchpadStats>(
    () => ({
      listedTokens: listings.length,
      volume24hUsd: listings.reduce((sum, t) => sum + (t.volume24hUsd ?? 0), 0),
      totalLiquidityUsd: listings.reduce((sum, t) => sum + (t.liquidityUsd ?? 0), 0),
      featuredCount: listings.filter((t) => t.featured).length,
    }),
    [listings],
  );

  const featured = useMemo(() => listings.filter((t) => t.featured), [listings]);
  const trending = useMemo(
    () => listings.slice().sort((a, b) => b.upvotes - a.upvotes).slice(0, 12),
    [listings],
  );

  const getById = useCallback(
    (id: string) => listings.find((t) => t.id === id) ?? null,
    [listings],
  );

  return useMemo(
    () => ({
      isLoading: listingsQuery.isLoading,
      isRefreshing: refreshMutation.isPending,
      listings,
      filtered,
      featured,
      trending,
      stats,
      tab,
      setTab,
      sort,
      setSort,
      venue,
      setVenue,
      search,
      setSearch,
      submit: submitMutation.mutateAsync,
      isSubmitting: submitMutation.isPending,
      remove: removeMutation.mutate,
      refresh: refreshMutation.mutate,
      upvoted,
      toggleUpvote,
      getById,
    }),
    [
      listingsQuery.isLoading,
      refreshMutation.isPending,
      refreshMutation.mutate,
      listings,
      filtered,
      featured,
      trending,
      stats,
      tab,
      sort,
      venue,
      search,
      submitMutation.mutateAsync,
      submitMutation.isPending,
      removeMutation.mutate,
      upvoted,
      toggleUpvote,
      getById,
    ],
  );
});
