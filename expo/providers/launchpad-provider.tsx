import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { fetchLivePairs } from "@/lib/api/pairs";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import type { LaunchSort, LaunchTab, LaunchToken, LaunchVenue, LaunchVenueFilter } from "@/types/launchpad";

type SubmissionRow = Record<string, unknown>;

type SubmitInput = Pick<
  LaunchToken,
  | "name"
  | "ticker"
  | "contract"
  | "description"
  | "venue"
  | "status"
  | "logoUrl"
  | "bannerUrl"
  | "website"
  | "twitter"
  | "telegram"
  | "discord"
  | "tags"
  | "featured"
  | "price"
  | "change24hPct"
  | "liquidityUsd"
  | "marketCapUsd"
  | "volume24hUsd"
  | "holders"
>;

function numberOrNull(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function rowToToken(row: SubmissionRow): LaunchToken {
  const statusRaw = String(row.status ?? "approved").toLowerCase();
  const validVenues: LaunchVenue[] = ["pumpfun", "pumpswap", "raydium", "meteora", "jupiter", "moonshot", "fomo", "other"];
  const rawTags = Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [];
  const venueTag = rawTags.find((tag) => tag.toLowerCase().startsWith("venue:"));
  const venueRaw = (venueTag?.slice("venue:".length) ?? "other").toLowerCase();
  const venue: LaunchVenue = validVenues.includes(venueRaw as LaunchVenue) ? (venueRaw as LaunchVenue) : "other";

  return {
    id: String(row.id ?? row.contract_address ?? ""),
    name: String(row.token_name ?? "Unnamed"),
    ticker: String(row.symbol ?? "TOKEN").replace("$", "").toUpperCase(),
    description: String(row.description ?? ""),
    logoUrl: (row.logo_url as string | null) ?? null,
    bannerUrl: (row.banner_url as string | null) ?? null,
    contract: String(row.contract_address ?? ""),
    venue,
    status: statusRaw === "pending" || statusRaw === "rejected" ? statusRaw : "live",
    approvalStatus: (["pending", "approved", "rejected", "live"].includes(statusRaw) ? statusRaw : "approved") as LaunchToken["approvalStatus"],
    website: (row.website as string | null) ?? undefined,
    twitter: (row.twitter as string | null) ?? undefined,
    telegram: (row.telegram as string | null) ?? undefined,
    discord: (row.discord as string | null) ?? undefined,
    tags: rawTags.filter((tag) => !tag.toLowerCase().startsWith("venue:")),
    featured: Boolean(row.is_featured),
    hot: Boolean(row.is_hot),
    verified: Boolean(row.is_verified),
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
    submittedBy: "user",
    ownerId: (row.user_id as string | null) ?? null,
    price: numberOrNull(row.price_usd),
    change24hPct: row.change_24h_pct == null ? null : Number(row.change_24h_pct),
    liquidityUsd: numberOrNull(row.liquidity_usd),
    marketCapUsd: numberOrNull(row.market_cap),
    volume24hUsd: numberOrNull(row.volume_24h_usd),
    holders: numberOrNull(row.holders),
    upvotes: Number(row.upvotes ?? 0),
    watchers: Number(row.watchers ?? 0),
  };
}

async function fetchSubmissionListings(): Promise<LaunchToken[]> {
  try {
    const { data, error } = await supabase
      .from("pump_v5_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.log("[launchpad] submissions fetch failed", error.message);
      return [];
    }
    return (data ?? []).map((row) => rowToToken(row as SubmissionRow));
  } catch (e) {
    console.log("[launchpad] submissions fetch threw", e instanceof Error ? e.message : e);
    return [];
  }
}

function mergeListings(system: LaunchToken[], submissions: LaunchToken[]): LaunchToken[] {
  const map = new Map<string, LaunchToken>();
  system.forEach((token) => map.set(token.contract || token.id, token));
  submissions.forEach((token) => {
    const key = token.contract || token.id;
    const existing = map.get(key);
    map.set(key, existing ? { ...existing, ...token, price: existing.price ?? token.price, change24hPct: existing.change24hPct ?? token.change24hPct, volume24hUsd: existing.volume24hUsd ?? token.volume24hUsd, liquidityUsd: existing.liquidityUsd ?? token.liquidityUsd, marketCapUsd: existing.marketCapUsd ?? token.marketCapUsd } : token);
  });
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export const [LaunchpadProvider, useLaunchpad] = createContextHook(() => {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const [tab, setTab] = useState<LaunchTab>("all");
  const [sort, setSort] = useState<LaunchSort>("newest");
  const [venue, setVenue] = useState<LaunchVenueFilter>("all");
  const [search, setSearch] = useState<string>("");
  const [upvoted, setUpvoted] = useState<Record<string, boolean>>({});

  const listingsQuery = useQuery({
    queryKey: ["launchpad", "listings"],
    queryFn: async () => {
      const [systemRes, submissionsRes] = await Promise.allSettled([
        fetchLivePairs(),
        fetchSubmissionListings(),
      ]);
      const system = systemRes.status === "fulfilled" ? systemRes.value : [];
      const submissions = submissionsRes.status === "fulfilled" ? submissionsRes.value : [];
      if (systemRes.status === "rejected") {
        console.log("[launchpad] live pairs failed", systemRes.reason);
      }
      if (submissionsRes.status === "rejected") {
        console.log("[launchpad] submissions failed", submissionsRes.reason);
      }
      return mergeListings(system, submissions);
    },
    staleTime: 45_000,
    retry: 1,
  });

  const submitMutation = useMutation({
    mutationFn: async (input: SubmitInput) => {
      const { data, error } = await supabase
        .from("pump_v5_submissions")
        .insert({
          user_id: userId,
          token_name: input.name,
          symbol: input.ticker,
          contract_address: input.contract,
          description: input.description,
          logo_url: input.logoUrl,
          banner_url: input.bannerUrl,
          website: input.website ?? null,
          twitter: input.twitter ?? null,
          telegram: input.telegram ?? null,
          discord: input.discord ?? null,
          tags: [`venue:${input.venue}`, ...input.tags],
          status: input.status ?? "pending",
          is_featured: input.featured,
          market_cap: input.marketCapUsd,
          liquidity_usd: input.liquidityUsd,
          volume_24h_usd: input.volume24hUsd,
        })
        .select("*")
        .single();
      if (error) throw error;
      return rowToToken(data as SubmissionRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["launchpad", "listings"] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pump_v5_submissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["launchpad", "listings"] }),
  });

  const listings = listingsQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let items = listings.slice();
    if (tab === "featured") items = items.filter((t) => t.featured);
    if (tab === "mine") items = items.filter((t) => !!userId && t.ownerId === userId);
    if (venue !== "all") items = items.filter((t) => t.venue === venue);
    if (q) items = items.filter((t) => `${t.name} ${t.ticker} ${t.contract}`.toLowerCase().includes(q));
    if (sort === "trending") items.sort((a, b) => b.upvotes + b.watchers - (a.upvotes + a.watchers));
    else if (sort === "gainers") items.sort((a, b) => (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity));
    else if (sort === "losers") items.sort((a, b) => (a.change24hPct ?? Infinity) - (b.change24hPct ?? Infinity));
    else if (sort === "liquidity") items.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    else if (sort === "marketcap") items.sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0));
    else if (sort === "volume") items.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
    else items.sort((a, b) => b.createdAt - a.createdAt);
    return items;
  }, [listings, search, sort, tab, userId, venue]);

  const featured = useMemo(() => listings.filter((t) => t.featured), [listings]);
  const trending = useMemo(() => listings.slice().sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0)).slice(0, 20), [listings]);
  const stats = useMemo(() => ({
    listedTokens: listings.length,
    volume24hUsd: listings.reduce((sum, t) => sum + (t.volume24hUsd ?? 0), 0),
    totalLiquidityUsd: listings.reduce((sum, t) => sum + (t.liquidityUsd ?? 0), 0),
    featuredCount: featured.length,
  }), [featured.length, listings]);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["launchpad", "listings"] });
  }, [qc]);

  const toggleUpvote = useCallback((id: string) => {
    setUpvoted((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const getById = useCallback((id: string) => listings.find((t) => t.id === id || t.contract === id) ?? null, [listings]);

  return {
    isLoading: listingsQuery.isLoading,
    isRefreshing: listingsQuery.isFetching,
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
    refresh,
    upvoted,
    toggleUpvote,
    getById,
  };
});
