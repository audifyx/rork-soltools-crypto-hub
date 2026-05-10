import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { normalizeMediaUrl } from "@/lib/media";
import { fetchOwnProfileRow, saveOwnProfilePatch, type ProfilePatch } from "@/lib/profile-db";
import { supabase } from "@/lib/supabase";
import { uploadPostImage, uploadReelMedia } from "@/lib/upload";
import type { CustomBadge } from "@/providers/profile-provider";
import { useAuth } from "@/providers/auth-provider";

import { clearAllUserCache, userKeys } from "@/lib/user-cache";

export { clearAllUserCache } from "@/lib/user-cache";

export interface UserPost {
  id: string;
  text: string;
  ticker?: string;
  contract?: string;
  changePct?: number;
  images?: string[];
  createdAt: number;
  likes: number;
  reposts: number;
  comments: number;
  liked: boolean;
}

export interface PostTokenInput {
  address: string;
  symbol?: string | null;
  name?: string | null;
  logoUrl?: string | null;
  priceUsd?: number | null;
  change24h?: number | null;
  marketCapUsd?: number | null;
  liquidityUsd?: number | null;
  volume24hUsd?: number | null;
  pairAddress?: string | null;
  decimals?: number | null;
  holderCount?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface WatchItem {
  id: string;
  ticker: string;
  contract: string;
  addedAt: number;
}

export interface AlertItem {
  id: string;
  ticker: string;
  contract?: string;
  type: "price-above" | "price-below" | "volume-spike" | "whale-buy";
  value: number;
  enabled: boolean;
  createdAt: number;
}

export interface TrackedWallet {
  id: string;
  address: string;
  label: string;
  addedAt: number;
}

export interface UserProfile {
  handle: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  bannerFrom: string;
  bannerTo: string;
  walletAddress: string;
  twitterHandle: string;
  website: string;
  location: string;
  verified: boolean;
  joinedAt: number;
  xp: number;
  trades: number;
  winRate: number;
  pnlPct: number;
  rank: string;
  followers: number;
  following: number;
  avatarUrl?: string;
  bannerUrl?: string;
  customBadges: CustomBadge[];
}

export type Currency = "USD" | "EUR" | "GBP" | "SOL";
export type ThemeMode = "dark" | "midnight" | "sunset";
export type Language = "en" | "es" | "fr" | "de" | "jp";

export interface UserPrefs {
  push: boolean;
  haptics: boolean;
  voiceLobbies: boolean;
  whaleAlerts: boolean;
  aiNarration: boolean;
  privateProfile: boolean;
  hideBalance: boolean;
  twoFactor: boolean;
  biometric: boolean;
  currency: Currency;
  theme: ThemeMode;
  language: Language;
  slippage: number;
  priorityFee: number;
  mevProtection: boolean;
}

const DEFAULT_PROFILE: UserProfile = {
  handle: "",
  displayName: "",
  bio: "",
  avatarColor: "#55F5B2",
  bannerFrom: "#FF5D8F",
  bannerTo: "#38D7FF",
  walletAddress: "",
  twitterHandle: "",
  website: "",
  location: "",
  verified: false,
  joinedAt: Date.now(),
  xp: 0,
  trades: 0,
  winRate: 0,
  pnlPct: 0,
  rank: "Recruit",
  followers: 0,
  following: 0,
  customBadges: [],
};

const DEFAULT_PREFS: UserPrefs = {
  push: true,
  haptics: true,
  voiceLobbies: false,
  whaleAlerts: true,
  aiNarration: false,
  privateProfile: false,
  hideBalance: false,
  twoFactor: false,
  biometric: false,
  currency: "USD",
  theme: "dark",
  language: "en",
  slippage: 1.0,
  priorityFee: 0.0005,
  mevProtection: true,
};


async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveJson<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.log("[app] persist failed", key, e);
  }
}

function mergePosts(primary: UserPost[], fallback: UserPost[]): UserPost[] {
  const seen = new Set<string>();
  return [...primary, ...fallback]
    .filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type AlertCondition = "above" | "below" | "volume_spike" | "whale_buy";
const alertTypeToCond: Record<AlertItem["type"], AlertCondition> = {
  "price-above": "above",
  "price-below": "below",
  "volume-spike": "volume_spike",
  "whale-buy": "whale_buy",
};
const condToAlertType: Record<string, AlertItem["type"]> = {
  above: "price-above",
  below: "price-below",
  volume_spike: "volume-spike",
  whale_buy: "whale-buy",
};

export const [AppProvider, useApp] = createContextHook(() => {
  const qc = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const scope = userId ?? "guest";
  const K = userKeys(scope);
  const POSTS_KEY = K.posts;
  const WATCH_KEY = K.watch;
  const ALERTS_KEY = K.alerts;
  const WALLETS_KEY = K.wallets;
  const PROFILE_KEY = K.profile;
  const PREFS_KEY = K.prefs;

  const postsQ = useQuery<UserPost[]>({
    queryKey: ["app", "posts", userId ?? "guest"],
    queryFn: async () => {
      const localPosts = await loadJson<UserPost[]>(POSTS_KEY, []);
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("community_posts")
            .select("id,user_id,content,image_url,ticker,change_pct,token_address,likes_count,reposts_count,comments_count,created_at")
            .eq("user_id", userId)
            .is("community_id", null)
            .is("parent_post_id", null)
            .order("created_at", { ascending: false })
            .limit(200);
          if (error) throw error;
          const remotePosts = (data ?? []).map((row): UserPost => ({
            id: row.id as string,
            text: (row.content as string) ?? "",
            ticker: (row.ticker as string) ?? undefined,
            contract: (row.token_address as string | null) ?? undefined,
            changePct: row.change_pct != null ? Number(row.change_pct) : undefined,
            images: row.image_url ? [row.image_url as string] : undefined,
            createdAt: new Date(row.created_at as string).getTime(),
            likes: (row.likes_count as number) ?? 0,
            reposts: (row.reposts_count as number) ?? 0,
            comments: (row.comments_count as number) ?? 0,
            liked: false,
          }));
          return mergePosts(localPosts, remotePosts);
        } catch (e) {
          console.log("[app] posts fetch fallback", e);
        }
      }
      return localPosts;
    },
    staleTime: 30_000,
  });

  const watchQ = useQuery<WatchItem[]>({
    queryKey: ["app", "watch", userId ?? "guest"],
    queryFn: async () => {
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("tracked_tokens")
            .select("id,token_address,symbol,name,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          if (error) throw error;
          return (data ?? []).map((r): WatchItem => ({
            id: r.id as string,
            ticker: ((r.symbol as string) ?? "").toUpperCase(),
            contract: (r.token_address as string) ?? "",
            addedAt: new Date(r.created_at as string).getTime(),
          }));
        } catch (e) {
          console.log("[app] watchlist fetch fallback", e);
        }
      }
      return loadJson<WatchItem[]>(WATCH_KEY, []);
    },
    staleTime: 30_000,
  });

  const alertsQ = useQuery<AlertItem[]>({
    queryKey: ["app", "alerts", userId ?? "guest"],
    queryFn: async () => {
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("price_alerts")
            .select("id,token_address,symbol,target_price,condition,is_active,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          if (error) throw error;
          return (data ?? []).map((r): AlertItem => ({
            id: r.id as string,
            ticker: ((r.symbol as string) ?? "").toUpperCase(),
            contract: (r.token_address as string) ?? undefined,
            type: condToAlertType[(r.condition as string) ?? "above"] ?? "price-above",
            value: Number(r.target_price ?? 0),
            enabled: !!r.is_active,
            createdAt: new Date(r.created_at as string).getTime(),
          }));
        } catch (e) {
          console.log("[app] alerts fetch fallback", e);
        }
      }
      return loadJson<AlertItem[]>(ALERTS_KEY, []);
    },
    staleTime: 30_000,
  });

  const walletsQ = useQuery<TrackedWallet[]>({
    queryKey: ["app", "wallets", userId ?? "guest"],
    queryFn: async () => {
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("tracked_wallets")
            .select("id,wallet_address,label,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          if (error) throw error;
          return (data ?? []).map((r): TrackedWallet => ({
            id: r.id as string,
            address: (r.wallet_address as string) ?? "",
            label: (r.label as string) ?? "",
            addedAt: new Date(r.created_at as string).getTime(),
          }));
        } catch (e) {
          console.log("[app] wallets fetch fallback", e);
        }
      }
      return loadJson<TrackedWallet[]>(WALLETS_KEY, []);
    },
    staleTime: 30_000,
  });

  const profileQ = useQuery<UserProfile>({
    queryKey: ["app", "profile", userId ?? "guest"],
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const local = await loadJson<Partial<UserProfile>>(PROFILE_KEY, {});
      // Keep the local cache as a safety net for signed-in users too. If the
      // server returns null/empty profile fields during a failed or delayed
      // write, the UI should not suddenly blank out.
      const base = { ...DEFAULT_PROFILE, ...local } as UserProfile;
      if (isAuthenticated && userId) {
        try {
          const data = await fetchOwnProfileRow<Record<string, unknown>>(
            userId,
            "id,user_id,username,display_name,bio,avatar_url,banner_url,avatar_color,banner_from,banner_to,wallet_address,twitter_handle,website,location,followers_count,following_count,badge,verified,custom_badges,trades_count,win_rate,pnl_pct,xp,created_at",
          );
          if (data) {
            const rawBadges = (data as { custom_badges?: unknown }).custom_badges;
            const customBadges: CustomBadge[] = Array.isArray(rawBadges)
              ? (rawBadges as Record<string, unknown>[])
                  .map((b) => {
                    const id = String(b?.id ?? "").trim();
                    const label = String(b?.label ?? "").trim();
                    if (!id || !label) return null;
                    return {
                      id,
                      label,
                      color: typeof b?.color === "string" ? (b.color as string) : undefined,
                      icon: typeof b?.icon === "string" ? (b.icon as string) : undefined,
                      granted_at:
                        typeof b?.granted_at === "string" ? (b.granted_at as string) : undefined,
                    } as CustomBadge;
                  })
                  .filter((b): b is CustomBadge => b !== null)
              : [];
            const username = nonEmptyString(data.username);
            const displayName = nonEmptyString(data.display_name) ?? username ?? base.displayName;
            const merged: UserProfile = {
              ...base,
              handle: username ? `@${username}` : base.handle,
              displayName,
              bio: (data.bio as string) ?? base.bio,
              avatarUrl: normalizeMediaUrl(data.avatar_url) ?? base.avatarUrl,
              bannerUrl: normalizeMediaUrl(data.banner_url) ?? base.bannerUrl,
              avatarColor: (data.avatar_color as string) ?? base.avatarColor,
              bannerFrom: (data.banner_from as string) ?? base.bannerFrom,
              bannerTo: (data.banner_to as string) ?? base.bannerTo,
              walletAddress: (data.wallet_address as string) ?? base.walletAddress,
              twitterHandle: (data.twitter_handle as string) ?? base.twitterHandle,
              website: (data.website as string) ?? base.website,
              location: (data.location as string) ?? base.location,
              followers: Number(data.followers_count ?? base.followers),
              following: Number(data.following_count ?? base.following),
              trades: Number(data.trades_count ?? base.trades),
              winRate: Number(data.win_rate ?? base.winRate),
              pnlPct: Number(data.pnl_pct ?? base.pnlPct),
              xp: Number(data.xp ?? base.xp),
              verified: !!data.verified,
              rank: (data.badge as string) ?? base.rank,
              customBadges,
              joinedAt: data.created_at
                ? new Date(data.created_at as string).getTime()
                : base.joinedAt,
            } as UserProfile;
            // Cache server profile locally for offline/cold-start.
            await saveJson(PROFILE_KEY, merged);
            return merged;
          }
        } catch (e) {
          console.log("[app] profile fetch fallback", e);
          // On error while authed, return local cache so UI isn't blank.
          return { ...DEFAULT_PROFILE, ...local } as UserProfile;
        }
      }
      return base;
    },
    staleTime: 5_000,
  });

  const prefsQ = useQuery<UserPrefs>({
    queryKey: ["app", "prefs", userId ?? "guest"],
    queryFn: async () => {
      const stored = await loadJson<Partial<UserPrefs>>(PREFS_KEY, {});
      const localPrefs = { ...DEFAULT_PREFS, ...stored } as UserPrefs;
      if (!isAuthenticated || !userId) return localPrefs;
      try {
        const { data, error } = await supabase
          .from("user_settings")
          .select(
            "push,haptics,voice_lobbies,whale_alerts,ai_narration,private_profile,hide_balance,two_factor,biometric,currency,theme,language,slippage,priority_fee,mev_protection",
          )
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return localPrefs;
        const remote: UserPrefs = {
          push: data.push ?? localPrefs.push,
          haptics: data.haptics ?? localPrefs.haptics,
          voiceLobbies: data.voice_lobbies ?? localPrefs.voiceLobbies,
          whaleAlerts: data.whale_alerts ?? localPrefs.whaleAlerts,
          aiNarration: data.ai_narration ?? localPrefs.aiNarration,
          privateProfile: data.private_profile ?? localPrefs.privateProfile,
          hideBalance: data.hide_balance ?? localPrefs.hideBalance,
          twoFactor: data.two_factor ?? localPrefs.twoFactor,
          biometric: data.biometric ?? localPrefs.biometric,
          currency: (data.currency as Currency | null) ?? localPrefs.currency,
          theme: (data.theme as ThemeMode | null) ?? localPrefs.theme,
          language: (data.language as Language | null) ?? localPrefs.language,
          slippage: Number(data.slippage ?? localPrefs.slippage),
          priorityFee: Number(data.priority_fee ?? localPrefs.priorityFee),
          mevProtection: data.mev_protection ?? localPrefs.mevProtection,
        };
        await saveJson(PREFS_KEY, remote);
        return remote;
      } catch (e) {
        console.log("[app] settings fetch fallback", e);
        return localPrefs;
      }
    },
    staleTime: 30_000,
  });

  const posts = postsQ.data ?? [];
  const watchlist = watchQ.data ?? [];
  const alerts = alertsQ.data ?? [];
  const wallets = walletsQ.data ?? [];
  const profile = profileQ.data ?? DEFAULT_PROFILE;
  const prefs = prefsQ.data ?? DEFAULT_PREFS;

  const addPost = useMutation({
    mutationFn: async (input: { text: string; ticker?: string; contract?: string; token?: PostTokenInput | null; changePct?: number; images?: string[]; video?: { uri: string; mimeType?: string | null; fileName?: string | null } }) => {
      if (isAuthenticated && userId) {
        let uploadedUrl: string | undefined;
        if (input.video?.uri) {
          try {
            uploadedUrl = await uploadReelMedia(userId, input.video.uri, input.video.fileName ?? null, input.video.mimeType ?? null);
          } catch (e) {
            console.log("[app] post video upload failed", e);
          }
        } else {
          const firstImage = input.images?.[0];
          if (firstImage) {
            try {
              uploadedUrl = await uploadPostImage(userId, firstImage);
            } catch (e) {
              console.log("[app] post image upload failed", e);
            }
          }
        }
        // content is NOT NULL on community_posts; ensure a non-empty string
        // when the user posts only images.
        const safeContent = input.text && input.text.trim().length > 0
          ? input.text
          : uploadedUrl
            ? ""
            : input.text;
        const tokenAddress = input.token?.address ?? input.contract ?? null;
        const tokenFields: Record<string, unknown> = tokenAddress
          ? {
              token_address: tokenAddress,
              token_symbol: input.token?.symbol ?? input.ticker ?? null,
              token_name: input.token?.name ?? null,
              token_logo_url: input.token?.logoUrl ?? null,
              token_price_usd: input.token?.priceUsd ?? null,
              token_change_24h: input.token?.change24h ?? input.changePct ?? null,
              token_market_cap_usd: input.token?.marketCapUsd ?? null,
              token_liquidity_usd: input.token?.liquidityUsd ?? null,
              token_volume_24h_usd: input.token?.volume24hUsd ?? null,
              token_pair_address: input.token?.pairAddress ?? null,
              token_decimals: input.token?.decimals ?? null,
              token_holder_count: input.token?.holderCount ?? null,
              token_metadata: input.token?.metadata ?? {},
              token_scanned_at: new Date().toISOString(),
            }
          : {};
        const { data, error } = await supabase
          .from("community_posts")
          .insert({
            user_id: userId,
            community_id: null,
            content: safeContent ?? "",
            image_url: uploadedUrl ?? null,
            ticker: input.ticker ?? input.token?.symbol ?? null,
            change_pct: input.changePct ?? input.token?.change24h ?? null,
            ...tokenFields,
          })
          .select("id,user_id,community_id,content,image_url,ticker,change_pct,token_address,likes_count,reposts_count,comments_count,created_at")
          .single();
        if (error) {
          console.log("[app] community_posts insert error", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });
          throw new Error(error.message || "Post failed");
        }
        const post: UserPost = {
          id: data.id as string,
          text: (data.content as string) ?? input.text,
          ticker: (data.ticker as string) ?? input.ticker,
          contract: (data.token_address as string | null) ?? tokenAddress ?? undefined,
          changePct: data.change_pct != null ? Number(data.change_pct) : input.changePct,
          images: data.image_url ? [data.image_url as string] : input.images,
          createdAt: new Date(data.created_at as string).getTime(),
          likes: (data.likes_count as number) ?? 0,
          reposts: (data.reposts_count as number) ?? 0,
          comments: (data.comments_count as number) ?? 0,
          liked: false,
        };
        const latestLocal = await loadJson<UserPost[]>(POSTS_KEY, []);
        const next = mergePosts([post], mergePosts(latestLocal, posts));
        await saveJson(POSTS_KEY, next);
        return next;
      }
      const post: UserPost = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: input.text,
        ticker: input.ticker,
        contract: input.token?.address ?? input.contract,
        changePct: input.changePct,
        images: input.images,
        createdAt: Date.now(),
        likes: 0,
        reposts: 0,
        comments: 0,
        liked: false,
      };
      const latestLocal = await loadJson<UserPost[]>(POSTS_KEY, []);
      const next = mergePosts([post], mergePosts(latestLocal, posts));
      await saveJson(POSTS_KEY, next);
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(["app", "posts", userId ?? "guest"], next);
      qc.invalidateQueries({ queryKey: ["home", "following-feed"] }).catch(() => {});
    },
  });

  const togglePostLike = useCallback(
    async (id: string) => {
      const next = posts.map((p) =>
        p.id === id ? { ...p, liked: !p.liked, likes: Math.max(0, p.likes + (p.liked ? -1 : 1)) } : p,
      );
      qc.setQueryData(["app", "posts", userId ?? "guest"], next);
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase.rpc("toggle_post_like", {
            target_post_id: id,
          });
          if (error) throw error;
          const row = Array.isArray(data) ? (data[0] as { liked: boolean; likes_count: number } | undefined) : undefined;
          if (row) {
            const synced = next.map((p) =>
              p.id === id ? { ...p, liked: !!row.liked, likes: Number(row.likes_count ?? p.likes) } : p,
            );
            qc.setQueryData(["app", "posts", userId], synced);
            qc.invalidateQueries({ queryKey: ["home", "following-feed"] });
          }
        } catch (e) {
          console.log("[app] post like sync failed", e);
        }
      } else {
        await saveJson(POSTS_KEY, next);
      }
    },
    [posts, qc, userId, isAuthenticated],
  );

  const deletePost = useCallback(
    async (id: string) => {
      const next = posts.filter((p) => p.id !== id);
      qc.setQueryData(["app", "posts", userId ?? "guest"], next);
      if (isAuthenticated) {
        try {
          await supabase.from("community_posts").delete().eq("id", id);
        } catch (e) {
          console.log("[app] post delete failed", e);
        }
      } else {
        await saveJson(POSTS_KEY, next);
      }
    },
    [posts, qc, userId, isAuthenticated],
  );

  const addWatch = useCallback(
    async (input: { ticker: string; contract: string }) => {
      if (watchlist.some((w) => w.contract === input.contract)) return;
      const symbol = input.ticker.replace("$", "").toUpperCase();
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("tracked_tokens")
            .insert({
              user_id: userId,
              token_address: input.contract,
              symbol,
              name: symbol,
            })
            .select("id,created_at")
            .single();
          if (error) throw error;
          const item: WatchItem = {
            id: data.id as string,
            ticker: symbol,
            contract: input.contract,
            addedAt: new Date(data.created_at as string).getTime(),
          };
          const next = [item, ...watchlist];
          qc.setQueryData(["app", "watch", userId], next);
          return;
        } catch (e) {
          console.log("[app] watch insert fallback", e);
        }
      }
      const item: WatchItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ticker: symbol,
        contract: input.contract,
        addedAt: Date.now(),
      };
      const next = [item, ...watchlist];
      qc.setQueryData(["app", "watch", userId ?? "guest"], next);
      await saveJson(WATCH_KEY, next);
    },
    [watchlist, qc, userId, isAuthenticated],
  );

  const removeWatch = useCallback(
    async (id: string) => {
      const next = watchlist.filter((w) => w.id !== id);
      qc.setQueryData(["app", "watch", userId ?? "guest"], next);
      if (isAuthenticated) {
        try {
          await supabase.from("tracked_tokens").delete().eq("id", id);
        } catch (e) {
          console.log("[app] watch delete fallback", e);
        }
      } else {
        await saveJson(WATCH_KEY, next);
      }
    },
    [watchlist, qc, userId, isAuthenticated],
  );

  const addAlert = useCallback(
    async (input: { ticker: string; type: AlertItem["type"]; value: number; contract?: string }) => {
      const ticker = input.ticker.toUpperCase();
      const contract = input.contract?.trim() || ticker;
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("price_alerts")
            .insert({
              user_id: userId,
              symbol: ticker,
              token_address: contract,
              target_price: input.value,
              condition: alertTypeToCond[input.type],
              is_active: true,
            })
            .select("id,created_at")
            .single();
          if (error) throw error;
          const item: AlertItem = {
            id: data.id as string,
            ticker,
            contract,
            type: input.type,
            value: input.value,
            enabled: true,
            createdAt: new Date(data.created_at as string).getTime(),
          };
          const next = [item, ...alerts];
          qc.setQueryData(["app", "alerts", userId], next);
          return;
        } catch (e) {
          console.log("[app] alert insert fallback", e);
        }
      }
      const item: AlertItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ticker,
        contract,
        type: input.type,
        value: input.value,
        enabled: true,
        createdAt: Date.now(),
      };
      const next = [item, ...alerts];
      qc.setQueryData(["app", "alerts", userId ?? "guest"], next);
      await saveJson(ALERTS_KEY, next);
    },
    [alerts, qc, userId, isAuthenticated],
  );

  const toggleAlert = useCallback(
    async (id: string) => {
      const next = alerts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
      qc.setQueryData(["app", "alerts", userId ?? "guest"], next);
      if (isAuthenticated) {
        try {
          const target = next.find((a) => a.id === id);
          if (target) {
            await supabase
              .from("price_alerts")
              .update({ is_active: target.enabled })
              .eq("id", id);
          }
        } catch (e) {
          console.log("[app] alert toggle sync failed", e);
        }
      } else {
        await saveJson(ALERTS_KEY, next);
      }
    },
    [alerts, qc, userId, isAuthenticated],
  );

  const removeAlert = useCallback(
    async (id: string) => {
      const next = alerts.filter((a) => a.id !== id);
      qc.setQueryData(["app", "alerts", userId ?? "guest"], next);
      if (isAuthenticated) {
        try {
          await supabase.from("price_alerts").delete().eq("id", id);
        } catch (e) {
          console.log("[app] alert delete fallback", e);
        }
      } else {
        await saveJson(ALERTS_KEY, next);
      }
    },
    [alerts, qc, userId, isAuthenticated],
  );

  const addWallet = useCallback(
    async (input: { address: string; label: string }) => {
      if (wallets.some((w) => w.address === input.address)) return;
      const label = input.label || `${input.address.slice(0, 4)}…${input.address.slice(-4)}`;
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("tracked_wallets")
            .insert({
              user_id: userId,
              wallet_address: input.address,
              label,
            })
            .select("id,created_at")
            .single();
          if (error) throw error;
          const item: TrackedWallet = {
            id: data.id as string,
            address: input.address,
            label,
            addedAt: new Date(data.created_at as string).getTime(),
          };
          const next = [item, ...wallets];
          qc.setQueryData(["app", "wallets", userId], next);
          return;
        } catch (e) {
          console.log("[app] wallet insert fallback", e);
        }
      }
      const item: TrackedWallet = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        address: input.address,
        label,
        addedAt: Date.now(),
      };
      const next = [item, ...wallets];
      qc.setQueryData(["app", "wallets", userId ?? "guest"], next);
      await saveJson(WALLETS_KEY, next);
    },
    [wallets, qc, userId, isAuthenticated],
  );

  const removeWallet = useCallback(
    async (id: string) => {
      const next = wallets.filter((w) => w.id !== id);
      qc.setQueryData(["app", "wallets", userId ?? "guest"], next);
      if (isAuthenticated) {
        try {
          await supabase.from("tracked_wallets").delete().eq("id", id);
        } catch (e) {
          console.log("[app] wallet delete fallback", e);
        }
      } else {
        await saveJson(WALLETS_KEY, next);
      }
    },
    [wallets, qc, userId, isAuthenticated],
  );

  const updateProfile = useCallback(
    async (patch: Partial<UserProfile>) => {
      const previous = profile;
      const next = { ...profile, ...patch };
      qc.setQueryData(["app", "profile", userId ?? "guest"], next);
      await saveJson(PROFILE_KEY, next);
      if (isAuthenticated && userId) {
        const dbPatch: ProfilePatch = {};
        if ("handle" in patch) {
          const username = nonEmptyString(next.handle.replace(/^@/, ""));
          if (!username) throw new Error("Handle is required");
          dbPatch.username = username;
        }
        if ("displayName" in patch) {
          const displayName = nonEmptyString(next.displayName);
          if (!displayName) throw new Error("Display name is required");
          dbPatch.display_name = displayName;
        }
        if ("bio" in patch) dbPatch.bio = next.bio || null;
        if ("avatarUrl" in patch) dbPatch.avatar_url = normalizeMediaUrl(next.avatarUrl);
        if ("bannerUrl" in patch) dbPatch.banner_url = normalizeMediaUrl(next.bannerUrl);
        if ("avatarColor" in patch) dbPatch.avatar_color = next.avatarColor || null;
        if ("bannerFrom" in patch) dbPatch.banner_from = next.bannerFrom || null;
        if ("bannerTo" in patch) dbPatch.banner_to = next.bannerTo || null;
        if ("walletAddress" in patch) dbPatch.wallet_address = next.walletAddress || null;
        if ("twitterHandle" in patch) dbPatch.twitter_handle = next.twitterHandle || null;
        if ("website" in patch) dbPatch.website = next.website || null;
        if ("location" in patch) dbPatch.location = next.location || null;
        if (Object.keys(dbPatch).length === 0) return;

        try {
          await saveOwnProfilePatch(userId, dbPatch);
        } catch (e) {
          qc.setQueryData(["app", "profile", userId], previous);
          await saveJson(PROFILE_KEY, previous);
          const message = e instanceof Error ? e.message : "Could not save profile";
          console.log("[app] profile save failed", message);
          throw new Error(message);
        }
      }
    },
    [profile, qc, userId, isAuthenticated, PROFILE_KEY],
  );

  const updatePrefs = useCallback(
    async (patch: Partial<UserPrefs>) => {
      const next = { ...prefs, ...patch };
      qc.setQueryData(["app", "prefs", userId ?? "guest"], next);
      await saveJson(PREFS_KEY, next);
      if (isAuthenticated && userId) {
        try {
          await supabase
            .from("user_settings")
            .upsert(
              {
                user_id: userId,
                push: next.push,
                haptics: next.haptics,
                voice_lobbies: next.voiceLobbies,
                whale_alerts: next.whaleAlerts,
                ai_narration: next.aiNarration,
                private_profile: next.privateProfile,
                hide_balance: next.hideBalance,
                two_factor: next.twoFactor,
                biometric: next.biometric,
                currency: next.currency,
                theme: next.theme,
                language: next.language,
                slippage: next.slippage,
                priority_fee: next.priorityFee,
                mev_protection: next.mevProtection,
              },
              { onConflict: "user_id" },
            );
        } catch (e) {
          console.log("[app] settings touch failed", e);
        }
      }
    },
    [prefs, qc, userId, isAuthenticated],
  );

  const resetAllData = useCallback(async () => {
    await clearAllUserCache();
    qc.invalidateQueries({ queryKey: ["app"] });
  }, [qc]);

  return useMemo(
    () => ({
      posts,
      addPost: addPost.mutateAsync,
      isPosting: addPost.isPending,
      togglePostLike,
      deletePost,
      watchlist,
      addWatch,
      removeWatch,
      alerts,
      addAlert,
      toggleAlert,
      removeAlert,
      wallets,
      addWallet,
      removeWallet,
      profile,
      updateProfile,
      prefs,
      updatePrefs,
      resetAllData,
    }),
    [
      posts,
      addPost.mutateAsync,
      addPost.isPending,
      togglePostLike,
      deletePost,
      watchlist,
      addWatch,
      removeWatch,
      alerts,
      addAlert,
      toggleAlert,
      removeAlert,
      wallets,
      addWallet,
      removeWallet,
      profile,
      updateProfile,
      prefs,
      updatePrefs,
      resetAllData,
    ],
  );
});
