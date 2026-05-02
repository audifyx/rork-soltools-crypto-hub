import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { supabase } from "@/lib/supabase";
import { uploadPostImage } from "@/lib/upload";
import type { CustomBadge } from "@/providers/profile-provider";
import { useAuth } from "@/providers/auth-provider";

import { userKeys } from "@/lib/user-cache";

export { clearAllUserCache } from "@/lib/user-cache";

export interface UserPost {
  id: string;
  text: string;
  ticker?: string;
  changePct?: number;
  images?: string[];
  createdAt: number;
  likes: number;
  reposts: number;
  comments: number;
  liked: boolean;
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
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("community_posts")
            .select("id,user_id,content,image_url,ticker,change_pct,likes_count,reposts_count,comments_count,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(200);
          if (error) throw error;
          return (data ?? []).map((row): UserPost => ({
            id: row.id as string,
            text: (row.content as string) ?? "",
            ticker: (row.ticker as string) ?? undefined,
            changePct: row.change_pct != null ? Number(row.change_pct) : undefined,
            images: row.image_url ? [row.image_url as string] : undefined,
            createdAt: new Date(row.created_at as string).getTime(),
            likes: (row.likes_count as number) ?? 0,
            reposts: (row.reposts_count as number) ?? 0,
            comments: (row.comments_count as number) ?? 0,
            liked: false,
          }));
        } catch (e) {
          console.log("[app] posts fetch fallback", e);
        }
      }
      return loadJson<UserPost[]>(POSTS_KEY, []);
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
      // When signed in, server is the source of truth — only fall back to
      // local cache for fields the server returns null for.
      const base = isAuthenticated && userId
        ? ({ ...DEFAULT_PROFILE } as UserProfile)
        : ({ ...DEFAULT_PROFILE, ...local } as UserProfile);
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select(
              "id,user_id,username,display_name,bio,avatar_url,banner_url,avatar_color,banner_from,banner_to,wallet_address,twitter_handle,website,location,followers_count,following_count,badge,verified,custom_badges,trades_count,win_rate,pnl_pct,xp,created_at",
            )
            .eq("id", userId)
            .maybeSingle();
          if (error) throw error;
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
            const merged: UserProfile = {
              ...base,
              handle: data.username ? `@${data.username}` : base.handle,
              displayName: ((data.display_name as string) || (data.username as string)) ?? base.displayName,
              bio: (data.bio as string) ?? base.bio,
              avatarUrl: (data.avatar_url as string) ?? base.avatarUrl,
              bannerUrl: (data.banner_url as string) ?? base.bannerUrl,
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
      return { ...DEFAULT_PREFS, ...stored } as UserPrefs;
    },
    staleTime: Infinity,
  });

  const posts = postsQ.data ?? [];
  const watchlist = watchQ.data ?? [];
  const alerts = alertsQ.data ?? [];
  const wallets = walletsQ.data ?? [];
  const profile = profileQ.data ?? DEFAULT_PROFILE;
  const prefs = prefsQ.data ?? DEFAULT_PREFS;

  const addPost = useMutation({
    mutationFn: async (input: { text: string; ticker?: string; changePct?: number; images?: string[] }) => {
      if (isAuthenticated && userId) {
        let uploadedUrl: string | undefined;
        const firstImage = input.images?.[0];
        if (firstImage) {
          try {
            uploadedUrl = await uploadPostImage(userId, firstImage);
          } catch (e) {
            console.log("[app] post image upload failed", e);
          }
        }
        // content is NOT NULL on community_posts; ensure a non-empty string
        // when the user posts only images.
        const safeContent = input.text && input.text.trim().length > 0
          ? input.text
          : uploadedUrl
            ? ""
            : input.text;
        const { data, error } = await supabase
          .from("community_posts")
          .insert({
            user_id: userId,
            content: safeContent ?? "",
            image_url: uploadedUrl ?? null,
            ticker: input.ticker ?? null,
            change_pct: input.changePct ?? null,
          })
          .select("id,user_id,content,image_url,ticker,change_pct,likes_count,reposts_count,comments_count,created_at")
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
          changePct: data.change_pct != null ? Number(data.change_pct) : input.changePct,
          images: data.image_url ? [data.image_url as string] : input.images,
          createdAt: new Date(data.created_at as string).getTime(),
          likes: (data.likes_count as number) ?? 0,
          reposts: (data.reposts_count as number) ?? 0,
          comments: (data.comments_count as number) ?? 0,
          liked: false,
        };
        return [post, ...posts];
      }
      const post: UserPost = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: input.text,
        ticker: input.ticker,
        changePct: input.changePct,
        images: input.images,
        createdAt: Date.now(),
        likes: 0,
        reposts: 0,
        comments: 0,
        liked: false,
      };
      const next = [post, ...posts];
      await saveJson(POSTS_KEY, next);
      return next;
    },
    onSuccess: (next) => qc.setQueryData(["app", "posts", userId ?? "guest"], next),
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
    async (input: { ticker: string; type: AlertItem["type"]; value: number }) => {
      const ticker = input.ticker.toUpperCase();
      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase
            .from("price_alerts")
            .insert({
              user_id: userId,
              symbol: ticker,
              token_address: ticker,
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
      const next = { ...profile, ...patch };
      qc.setQueryData(["app", "profile", userId ?? "guest"], next);
      await saveJson(PROFILE_KEY, next);
      if (isAuthenticated && userId) {
        try {
          const handleVal = next.handle.replace(/^@/, "").trim();
          await supabase.from("profiles").upsert(
            {
              id: userId,
              user_id: userId,
              username: handleVal || null,
              display_name: next.displayName || null,
              bio: next.bio || null,
              avatar_url: next.avatarUrl ?? null,
              banner_url: next.bannerUrl ?? null,
              avatar_color: next.avatarColor || null,
              banner_from: next.bannerFrom || null,
              banner_to: next.bannerTo || null,
              wallet_address: next.walletAddress || null,
              twitter_handle: next.twitterHandle || null,
              website: next.website || null,
              location: next.location || null,
            },
            { onConflict: "id" },
          );
        } catch (e) {
          console.log("[app] profile upsert failed", e);
        }
      }
    },
    [profile, qc, userId, isAuthenticated],
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
            .upsert({ user_id: userId, id: userId }, { onConflict: "user_id" });
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
