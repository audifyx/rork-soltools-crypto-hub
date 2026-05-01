import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

const POSTS_KEY = "soltools.posts.v1";
const WATCH_KEY = "soltools.watchlist.v1";
const ALERTS_KEY = "soltools.alerts.v1";
const WALLETS_KEY = "soltools.wallets.v1";
const PROFILE_KEY = "soltools.profile.v2";
const PREFS_KEY = "soltools.prefs.v1";
const FOLLOWS_KEY = "soltools.follows.v1";

export interface UserPost {
  id: string;
  text: string;
  ticker?: string;
  changePct?: number;
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
  handle: "@degen",
  displayName: "Sol Tools Trader",
  bio: "Hunting Solana alpha · 24/7 · DM for collabs",
  avatarColor: "#55F5B2",
  bannerFrom: "#FF5D8F",
  bannerTo: "#38D7FF",
  walletAddress: "",
  twitterHandle: "",
  website: "",
  location: "",
  verified: true,
  joinedAt: Date.now(),
  xp: 0,
  trades: 0,
  winRate: 0,
  pnlPct: 0,
  rank: "Recruit",
  followers: 0,
  following: 0,
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

export const [AppProvider, useApp] = createContextHook(() => {
  const qc = useQueryClient();

  const postsQ = useQuery<UserPost[]>({
    queryKey: ["app", "posts"],
    queryFn: () => loadJson<UserPost[]>(POSTS_KEY, []),
    staleTime: Infinity,
  });
  const watchQ = useQuery<WatchItem[]>({
    queryKey: ["app", "watch"],
    queryFn: () => loadJson<WatchItem[]>(WATCH_KEY, []),
    staleTime: Infinity,
  });
  const alertsQ = useQuery<AlertItem[]>({
    queryKey: ["app", "alerts"],
    queryFn: () => loadJson<AlertItem[]>(ALERTS_KEY, []),
    staleTime: Infinity,
  });
  const walletsQ = useQuery<TrackedWallet[]>({
    queryKey: ["app", "wallets"],
    queryFn: () => loadJson<TrackedWallet[]>(WALLETS_KEY, []),
    staleTime: Infinity,
  });
  const profileQ = useQuery<UserProfile>({
    queryKey: ["app", "profile"],
    queryFn: async () => {
      const stored = await loadJson<Partial<UserProfile>>(PROFILE_KEY, {});
      return { ...DEFAULT_PROFILE, ...stored } as UserProfile;
    },
    staleTime: Infinity,
  });
  const prefsQ = useQuery<UserPrefs>({
    queryKey: ["app", "prefs"],
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
    mutationFn: async (input: { text: string; ticker?: string; changePct?: number }) => {
      const post: UserPost = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: input.text,
        ticker: input.ticker,
        changePct: input.changePct,
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
    onSuccess: (next) => qc.setQueryData(["app", "posts"], next),
  });

  const togglePostLike = useCallback(
    async (id: string) => {
      const next = posts.map((p) =>
        p.id === id
          ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) }
          : p,
      );
      qc.setQueryData(["app", "posts"], next);
      await saveJson(POSTS_KEY, next);
    },
    [posts, qc],
  );

  const deletePost = useCallback(
    async (id: string) => {
      const next = posts.filter((p) => p.id !== id);
      qc.setQueryData(["app", "posts"], next);
      await saveJson(POSTS_KEY, next);
    },
    [posts, qc],
  );

  const addWatch = useCallback(
    async (input: { ticker: string; contract: string }) => {
      if (watchlist.some((w) => w.contract === input.contract)) return;
      const item: WatchItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ticker: input.ticker.replace("$", "").toUpperCase(),
        contract: input.contract,
        addedAt: Date.now(),
      };
      const next = [item, ...watchlist];
      qc.setQueryData(["app", "watch"], next);
      await saveJson(WATCH_KEY, next);
    },
    [watchlist, qc],
  );

  const removeWatch = useCallback(
    async (id: string) => {
      const next = watchlist.filter((w) => w.id !== id);
      qc.setQueryData(["app", "watch"], next);
      await saveJson(WATCH_KEY, next);
    },
    [watchlist, qc],
  );

  const addAlert = useCallback(
    async (input: { ticker: string; type: AlertItem["type"]; value: number }) => {
      const item: AlertItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ticker: input.ticker.toUpperCase(),
        type: input.type,
        value: input.value,
        enabled: true,
        createdAt: Date.now(),
      };
      const next = [item, ...alerts];
      qc.setQueryData(["app", "alerts"], next);
      await saveJson(ALERTS_KEY, next);
    },
    [alerts, qc],
  );

  const toggleAlert = useCallback(
    async (id: string) => {
      const next = alerts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
      qc.setQueryData(["app", "alerts"], next);
      await saveJson(ALERTS_KEY, next);
    },
    [alerts, qc],
  );

  const removeAlert = useCallback(
    async (id: string) => {
      const next = alerts.filter((a) => a.id !== id);
      qc.setQueryData(["app", "alerts"], next);
      await saveJson(ALERTS_KEY, next);
    },
    [alerts, qc],
  );

  const addWallet = useCallback(
    async (input: { address: string; label: string }) => {
      if (wallets.some((w) => w.address === input.address)) return;
      const item: TrackedWallet = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        address: input.address,
        label: input.label || `${input.address.slice(0, 4)}…${input.address.slice(-4)}`,
        addedAt: Date.now(),
      };
      const next = [item, ...wallets];
      qc.setQueryData(["app", "wallets"], next);
      await saveJson(WALLETS_KEY, next);
    },
    [wallets, qc],
  );

  const removeWallet = useCallback(
    async (id: string) => {
      const next = wallets.filter((w) => w.id !== id);
      qc.setQueryData(["app", "wallets"], next);
      await saveJson(WALLETS_KEY, next);
    },
    [wallets, qc],
  );

  const updateProfile = useCallback(
    async (patch: Partial<UserProfile>) => {
      const next = { ...profile, ...patch };
      qc.setQueryData(["app", "profile"], next);
      await saveJson(PROFILE_KEY, next);
    },
    [profile, qc],
  );

  const updatePrefs = useCallback(
    async (patch: Partial<UserPrefs>) => {
      const next = { ...prefs, ...patch };
      qc.setQueryData(["app", "prefs"], next);
      await saveJson(PREFS_KEY, next);
    },
    [prefs, qc],
  );

  const resetAllData = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(POSTS_KEY),
      AsyncStorage.removeItem(WATCH_KEY),
      AsyncStorage.removeItem(ALERTS_KEY),
      AsyncStorage.removeItem(WALLETS_KEY),
      AsyncStorage.removeItem(PROFILE_KEY),
      AsyncStorage.removeItem(PREFS_KEY),
      AsyncStorage.removeItem(FOLLOWS_KEY),
    ]);
    qc.setQueryData(["app", "posts"], []);
    qc.setQueryData(["app", "watch"], []);
    qc.setQueryData(["app", "alerts"], []);
    qc.setQueryData(["app", "wallets"], []);
    qc.setQueryData(["app", "profile"], DEFAULT_PROFILE);
    qc.setQueryData(["app", "prefs"], DEFAULT_PREFS);
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
