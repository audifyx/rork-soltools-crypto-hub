import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDexTokens } from "@/lib/api/dexscreener";
import { fetchLivePairs } from "@/lib/api/pairs";
import { isSafeToken } from "@/lib/safety";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import {
  LaunchSort,
  LaunchTab,
  LaunchToken,
  LaunchVenue,
  LaunchVenueFilter,
  LaunchpadStats,
} from "@/types/launchpad";

const STORAGE_KEY_BASE = "soltools.launchpad.listings.v2";
const UPVOTES_KEY_BASE = "soltools.launchpad.upvotes.v2";

function launchpadKeys(scope: string): { listings: string; upvotes: string } {
  return {
    listings: `${STORAGE_KEY_BASE}.${scope}`,
    upvotes: `${UPVOTES_KEY_BASE}.${scope}`,
  };
}

async function loadListings(key: string): Promise<LaunchToken[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LaunchToken[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.log("[launchpad] load listings failed", e);
    return [];
  }
}

async function persistListings(key: string, items: LaunchToken[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    console.log("[launchpad] persist listings failed", e);
  }
}

async function loadUpvotes(key: string): Promise<Record<string, true>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, true>;
  } catch {
    return {};
  }
}

async function persistUpvotes(key: string, map: Record<string, true>): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

export type SubmitTokenInput = Omit<
  LaunchToken,
  "id" | "createdAt" | "upvotes" | "watchers" | "featured" | "hot" | "verified" | "submittedBy"
> & {
  featured?: boolean;
};

const VALID_VENUES: LaunchVenue[] = [
  "pumpfun",
  "pumpswap",
  "raydium",
  "meteora",
  "jupiter",
  "other",
];

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 12);
}

function isUuid(input: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
}

function rowToToken(row: Record<string, unknown>, _currentUserId: string | null): LaunchToken {
  const venueRaw = String(row.status ?? "other").toLowerCase();
  const venue: LaunchVenue = (VALID_VENUES.includes(venueRaw as LaunchVenue)
    ? venueRaw
    : "other") as LaunchVenue;
  return {
    id: String(row.id ?? ""),
    name: (row.token_name as string) ?? "Unnamed",
    ticker: ((row.symbol as string) ?? "").toUpperCase(),
    description: (row.description as string) ?? "",
    logoUrl: (row.logo_url as string) ?? null,
    bannerUrl: (row.banner_url as string) ?? null,
    contract: (row.contract_address as string) ?? "",
    venue,
    status: "live",
    website: (row.website as string) ?? undefined,
    twitter: (row.twitter as string) ?? undefined,
    telegram: (row.telegram as string) ?? undefined,
    discord: (row.discord as string) ?? undefined,
    tags: normalizeTags(row.tags),
    featured: !!row.is_featured,
    hot: !!row.is_hot,
    verified: !!row.is_verified,
    createdAt: row.created_at
      ? new Date(row.created_at as string).getTime()
      : Date.now(),
    // Anything coming out of pump_v5_submissions is a real user submission;
    // we keep the actual owner id so screens can still distinguish "mine" vs
    // "other users". This is what allows users to see each other's listings.
    submittedBy: "user",
    ownerId: (row.user_id as string | null) ?? null,
    price: Number(row.price_usd ?? 0) || null,
    change24hPct: row.change_24h_pct != null ? Number(row.change_24h_pct) : null,
    liquidityUsd: Number(row.liquidity_usd ?? 0) || null,
    marketCapUsd: Number(row.market_cap ?? 0) || null,
    volume24hUsd: Number(row.volume_24h_usd ?? 0) || null,
    holders: Number(row.holders ?? 0) || null,
    upvotes: Number(row.upvotes ?? 0),
    watchers: Number(row.watchers ?? 0),
  };
}

export const [LaunchpadProvider, useLaunchpad] = createContextHook(() => {
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const scope = userId ?? "guest";
  const keys = useMemo(() => launchpadKeys(scope), [scope]);
  const [tab, setTab] = useState<LaunchTab>("all");
  const [sort, setSort] = useState<LaunchSort>("newest");
  const [venue, setVenue] = useState<LaunchVenueFilter>("all");
  const [search, setSearch] = useState<string>("");
  const [upvoted, setUpvoted] = useState<Record<string, true>>({});

  const listingsQuery = useQuery<LaunchToken[]>({
    queryKey: ["launchpad", "listings", userId ?? "guest"],
    queryFn: async () => {
      const [remote, live, local] = await Promise.all([
        (async () => {
          try {
            const { data, error } = await supabase
              .from("pump_v5_submissions")
              .select(
                "id,user_id,token_name,symbol,description,logo_url,banner_url,contract_address,website,twitter,telegram,discord,tags,liquidity_usd,market_cap,volume_24h_usd,holders,price_usd,change_24h_pct,upvotes,watchers,is_featured,is_hot,is_verified,status,created_at",
              )
              .order("created_at", { ascending: false })
              .limit(200);
            if (error) throw error;
            return (data ?? []).map((row) => rowToToken(row as Record<string, unknown>, userId));
          } catch (e) {
            console.log("[launchpad] supabase fetch failed", e);
            return [] as LaunchToken[];
          }
        })(),
        (async () => {
          try {
            return await fetchLivePairs();
          } catch (e) {
            console.log("[launchpad] live pairs failed", e);
            return [] as LaunchToken[];
          }
        })(),
        loadListings(keys.listings),
      ]);
      const map = new Map<string, LaunchToken>();
      // Priority: user submissions (remote) > local drafts > live market data
      [...live, ...local, ...remote].forEach((t) => {
        if (!t.id) return;
        map.set(t.contract || t.id, t);
      });
      return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    let alive = true;
    setUpvoted({});
    loadUpvotes(keys.upvotes).then((next) => {
      if (alive) setUpvoted(next);
    });
    return () => {
      alive = false;
    };
  }, [keys.upvotes]);

  const submitMutation = useMutation({
    mutationFn: async (input: SubmitTokenInput) => {
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("pump_v5_submissions")
            .insert({
              user_id: userId,
              token_name: input.name,
              symbol: input.ticker,
              description: input.description,
              logo_url: input.logoUrl ?? null,
              banner_url: input.bannerUrl ?? null,
              contract_address: input.contract,
              website: input.website ?? null,
              twitter: input.twitter ?? null,
              telegram: input.telegram ?? null,
              discord: input.discord ?? null,
              liquidity_usd: input.liquidityUsd ?? null,
              market_cap: input.marketCapUsd ?? null,
              tags: input.tags,
              volume_24h_usd: input.volume24hUsd ?? null,
              holders: input.holders ?? null,
              price_usd: input.price ?? null,
              change_24h_pct: input.change24hPct ?? null,
              is_featured: input.featured ?? false,
              is_hot: false,
              is_verified: false,
              status: input.venue,
            })
            .select(
              "id,user_id,token_name,symbol,description,logo_url,banner_url,contract_address,website,twitter,telegram,discord,tags,liquidity_usd,market_cap,volume_24h_usd,holders,price_usd,change_24h_pct,upvotes,watchers,is_featured,is_hot,is_verified,status,created_at",
            )
            .single();
          if (error) throw error;
          const token = rowToToken(data as Record<string, unknown>, userId);
          token.submittedBy = "user";
          token.ownerId = userId;
          const prev =
            (queryClient.getQueryData<LaunchToken[]>([
              "launchpad",
              "listings",
              userId,
            ]) ?? []).slice();
          const next = [token, ...prev];
          console.log("[launchpad] supabase token submitted", token.ticker);
          return next;
        } catch (e) {
          console.log("[launchpad] supabase submit failed, falling back", e);
        }
      }
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
        ownerId: userId ?? null,
      };
      const prev =
        (queryClient.getQueryData<LaunchToken[]>([
          "launchpad",
          "listings",
          userId ?? "guest",
        ]) ?? []).slice();
      const next = [token, ...prev];
      await persistListings(keys.listings, next);
      console.log("[launchpad] local token submitted", token.ticker);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["launchpad", "listings", userId ?? "guest"], next);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isAuthenticated) {
        try {
          await supabase.from("pump_v5_submissions").delete().eq("id", id);
        } catch (e) {
          console.log("[launchpad] remote delete failed", e);
        }
      }
      const prev =
        (queryClient.getQueryData<LaunchToken[]>([
          "launchpad",
          "listings",
          userId ?? "guest",
        ]) ?? []).slice();
      const next = prev.filter((t) => t.id !== id);
      await persistListings(keys.listings, next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["launchpad", "listings", userId ?? "guest"], next);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: ["launchpad", "listings"] });
      return Date.now();
    },
  });

  const toggleUpvote = useCallback(
    (id: string) => {
      const wasUpvoted = !!upvoted[id];
      const nextUpvoted = { ...upvoted };
      if (wasUpvoted) {
        delete nextUpvoted[id];
      } else {
        nextUpvoted[id] = true;
      }
      setUpvoted(nextUpvoted);
      void persistUpvotes(keys.upvotes, nextUpvoted);

      const key = ["launchpad", "listings", userId ?? "guest"] as const;
      const prev = queryClient.getQueryData<LaunchToken[]>(key) ?? [];
      const updated = prev.map((t) =>
        t.id === id
          ? { ...t, upvotes: Math.max(0, t.upvotes + (wasUpvoted ? -1 : 1)) }
          : t,
      );
      queryClient.setQueryData(key, updated);

      if (isAuthenticated && userId && isUuid(id)) {
        void (async () => {
          try {
            if (wasUpvoted) {
              const { error } = await supabase
                .from("launch_upvotes")
                .delete()
                .eq("user_id", userId)
                .eq("submission_id", id);
              if (error) throw error;
            } else {
              const { error } = await supabase
                .from("launch_upvotes")
                .upsert({ user_id: userId, submission_id: id }, { onConflict: "user_id,submission_id" });
              if (error) throw error;
            }
          } catch (e) {
            console.log("[launchpad] upvote sync failed", e);
            queryClient.invalidateQueries({ queryKey: ["launchpad", "listings"] });
          }
        })();
      }
    },
    [queryClient, upvoted, userId, isAuthenticated, keys.upvotes],
  );

  const rawListings = listingsQuery.data ?? [];

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const submissionIds = rawListings.map((t) => t.id).filter(isUuid);
    if (submissionIds.length === 0) return;
    let alive = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("launch_upvotes")
          .select("submission_id")
          .eq("user_id", userId)
          .in("submission_id", submissionIds);
        if (error) throw error;
        if (!alive) return;
        const remote = Object.fromEntries(
          (data ?? []).map((r) => [String(r.submission_id), true] as const),
        ) as Record<string, true>;
        setUpvoted(remote);
        await persistUpvotes(keys.upvotes, remote);
      } catch (e) {
        console.log("[launchpad] upvotes fetch failed", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated, userId, rawListings, keys.upvotes]);

  // Live overlay: poll DexScreener for the visible contracts so price / MC /
  // liquidity / 24h change always match the chart and refresh in real time.
  const visibleAddresses = useMemo(() => {
    const addrs = rawListings
      .map((t) => t.contract)
      .filter((c): c is string => !!c && c.length >= 32);
    return Array.from(new Set(addrs)).slice(0, 60);
  }, [rawListings]);
  const { data: dexMap } = useDexTokens(visibleAddresses);

  const listings = useMemo<LaunchToken[]>(() => {
    if (!dexMap) return rawListings;
    return rawListings.map((t) => {
      const live = t.contract ? dexMap[t.contract] : undefined;
      if (!live) return t;
      return {
        ...t,
        price: live.priceUsd ?? t.price ?? null,
        change24hPct: live.priceChange24hPct ?? t.change24hPct ?? null,
        liquidityUsd: live.liquidityUsd ?? t.liquidityUsd ?? null,
        marketCapUsd: live.marketCapUsd ?? t.marketCapUsd ?? null,
        volume24hUsd: live.volume24hUsd ?? t.volume24hUsd ?? null,
        logoUrl: t.logoUrl ?? live.imageUrl ?? null,
      };
    });
  }, [rawListings, dexMap]);

  const filtered = useMemo<LaunchToken[]>(() => {
    let items = listings.slice().filter((t) =>
      // User-submitted listings always pass; market data is rug-screened.
      t.submittedBy === "user" ||
        isSafeToken({
          marketCapUsd: t.marketCapUsd,
          liquidityUsd: t.liquidityUsd,
          priceChange24hPct: t.change24hPct,
          venue: t.venue,
          tags: t.tags,
        }),
    );
    if (tab === "featured") items = items.filter((t) => t.featured);
    if (tab === "mine")
      items = items.filter(
        (t) => !!userId && t.ownerId === userId,
      );
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
  }, [listings, tab, venue, search, sort, userId]);

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
