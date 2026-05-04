import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { normalizeMediaUrl } from "@/lib/media";
import { fetchOwnProfileRow, saveOwnProfilePatch, type ProfilePatch } from "@/lib/profile-db";
import { supabase } from "@/lib/supabase";
import { uploadProfileMedia, type ProfileMediaKind } from "@/lib/upload";
import { useAuth } from "@/providers/auth-provider";

export interface CustomBadge {
  id: string;
  label: string;
  color?: string;
  icon?: string;
  granted_at?: string;
}

export interface PublicProfile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  avatar_color: string | null;
  banner_from: string | null;
  banner_to: string | null;
  wallet_address: string | null;
  twitter_handle: string | null;
  website: string | null;
  location: string | null;
  badge: string | null;
  verified: boolean;
  custom_badges: CustomBadge[];
  followers_count: number;
  following_count: number;
  trades_count: number;
  win_rate: number;
  pnl_pct: number;
  xp: number;
  created_at: string;
  is_following: boolean;
}

export interface ProfileSummary {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  custom_badges: CustomBadge[];
  followers_count?: number;
}

export interface PlatformUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  verified: boolean;
  custom_badges: CustomBadge[];
  followers_count: number;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
  is_following: boolean;
}

export interface UsersOverview {
  total_users: number;
  online_users: number;
  new_today: number;
}

function normalizeBadges(input: unknown): CustomBadge[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? "").trim();
      const label = String(r.label ?? "").trim();
      if (!id || !label) return null;
      return {
        id,
        label,
        color: typeof r.color === "string" ? r.color : undefined,
        icon: typeof r.icon === "string" ? r.icon : undefined,
        granted_at: typeof r.granted_at === "string" ? r.granted_at : undefined,
      } as CustomBadge;
    })
    .filter((b): b is CustomBadge => b !== null);
}

export const [ProfileProvider, useProfileProvider] = createContextHook(() => {
  const qc = useQueryClient();
  const { userId, isAuthenticated } = useAuth();

  const myBadgesQ = useQuery<CustomBadge[]>({
    queryKey: ["profile", "self-badges", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    queryFn: async () => {
      if (!userId) return [];
      try {
        const data = await fetchOwnProfileRow<{ custom_badges?: unknown }>(userId, "custom_badges");
        return normalizeBadges(data?.custom_badges);
      } catch (e) {
        console.log("[profile] badges fetch error", e instanceof Error ? e.message : e);
        return [];
      }
    },
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (input: {
      kind: ProfileMediaKind;
      uri: string;
      base64?: string | null;
      fileName?: string | null;
      mimeType?: string | null;
    }) => {
      if (!userId) throw new Error("Sign in to upload");
      const url = await uploadProfileMedia(
        userId,
        input.kind,
        input.uri,
        input.base64 ?? null,
        input.fileName ?? null,
        input.mimeType ?? null,
      );
      // Write only the image column directly. A broken/older profile RPC can
      // treat omitted params as null and wipe username/display_name.
      const patch: ProfilePatch = input.kind === "avatar" ? { avatar_url: url } : { banner_url: url };
      await saveOwnProfilePatch(userId, patch);
      return url;
    },
    onSuccess: (url, input) => {
      qc.setQueriesData({ queryKey: ["app", "profile"] }, (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return {
          ...(current as Record<string, unknown>),
          ...(input.kind === "avatar" ? { avatarUrl: url } : { bannerUrl: url }),
        };
      });
      qc.invalidateQueries({ queryKey: ["app", "profile"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // Presence heartbeat — keep the current user marked online while the
  // app is in the foreground.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let cancelled = false;

    const beat = async (status: "online" | "away" | "offline" = "online") => {
      try {
        await supabase.rpc("heartbeat", { set_status: status });
      } catch (e) {
        console.log("[presence] heartbeat error", e);
      }
    };

    beat("online");
    const id = setInterval(() => {
      if (!cancelled) beat("online");
    }, 45_000);

    const onAppState = (s: AppStateStatus) => {
      if (s === "active") beat("online");
      else beat("away");
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
      supabase.rpc("set_offline").then(
        () => undefined,
        () => undefined,
      );
    };
  }, [isAuthenticated, userId]);

  const followMutation = useMutation({
    mutationFn: async (target: string) => {
      const { data, error } = await supabase.rpc("toggle_follow", {
        target_user_id: target,
      });
      if (error) {
        console.log("[profile] toggle_follow error", error.message);
        throw error;
      }
      return data as boolean;
    },
    onMutate: async (target: string) => {
      // Optimistically flip is_following + counts so the UI updates instantly.
      await qc.cancelQueries({ queryKey: ["profile"] });
      await qc.cancelQueries({ queryKey: ["users"] });

      // Public profile cache: ['profile', 'public', handle]
      qc.setQueriesData<PublicProfile | null>({ queryKey: ["profile", "public"] }, (curr) => {
        if (!curr || curr.user_id !== target) return curr;
        const willFollow = !curr.is_following;
        return {
          ...curr,
          is_following: willFollow,
          followers_count: Math.max(0, curr.followers_count + (willFollow ? 1 : -1)),
        };
      });

      // Users list cache: ['users', 'list', q, onlineOnly]
      qc.setQueriesData<PlatformUser[] | undefined>({ queryKey: ["users", "list"] }, (curr) => {
        if (!Array.isArray(curr)) return curr;
        return curr.map((u) => {
          if (u.user_id !== target) return u;
          const willFollow = !u.is_following;
          return {
            ...u,
            is_following: willFollow,
            followers_count: Math.max(0, u.followers_count + (willFollow ? 1 : -1)),
          };
        });
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["app", "profile"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err, target) => {
      console.log("[profile] follow rollback", err instanceof Error ? err.message : err, target);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  return useMemo(
    () => ({
      myBadges: myBadgesQ.data ?? [],
      isLoadingBadges: myBadgesQ.isLoading,
      uploadMedia: uploadMutation.mutateAsync,
      isUploading: uploadMutation.isPending,
      toggleFollow: followMutation.mutateAsync,
      isToggling: followMutation.isPending,
    }),
    [
      myBadgesQ.data,
      myBadgesQ.isLoading,
      uploadMutation.mutateAsync,
      uploadMutation.isPending,
      followMutation.mutateAsync,
      followMutation.isPending,
    ],
  );
});

/**
 * Hook for loading another user's profile by handle (X-style).
 */
function publicProfileFromRow(row: Record<string, unknown>): PublicProfile {
  const userId = String(row.user_id ?? row.id);
  return {
    id: userId,
    user_id: userId,
    username: (row.username as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    avatar_url: normalizeMediaUrl(row.avatar_url),
    banner_url: normalizeMediaUrl(row.banner_url),
    avatar_color: (row.avatar_color as string | null) ?? null,
    banner_from: (row.banner_from as string | null) ?? null,
    banner_to: (row.banner_to as string | null) ?? null,
    wallet_address: (row.wallet_address as string | null) ?? null,
    twitter_handle: (row.twitter_handle as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    badge: (row.badge as string | null) ?? null,
    verified: !!row.verified,
    custom_badges: normalizeBadges(row.custom_badges),
    followers_count: Number(row.followers_count ?? 0),
    following_count: Number(row.following_count ?? 0),
    trades_count: Number(row.trades_count ?? 0),
    win_rate: Number(row.win_rate ?? 0),
    pnl_pct: Number(row.pnl_pct ?? 0),
    xp: Number(row.xp ?? 0),
    created_at: (row.created_at as string) ?? new Date().toISOString(),
    is_following: !!row.is_following,
  };
}

function profileSummaryFromRow(row: Record<string, unknown>): ProfileSummary {
  return {
    user_id: String(row.user_id ?? row.id),
    username: (row.username as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    avatar_url: normalizeMediaUrl(row.avatar_url),
    verified: !!row.verified,
    custom_badges: normalizeBadges(row.custom_badges),
    followers_count: Number(row.followers_count ?? 0),
  };
}

function platformUserFromRow(row: Record<string, unknown>): PlatformUser {
  return {
    user_id: String(row.user_id ?? row.id),
    username: (row.username as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    avatar_url: normalizeMediaUrl(row.avatar_url),
    banner_url: normalizeMediaUrl(row.banner_url),
    bio: (row.bio as string | null) ?? null,
    verified: !!row.verified,
    custom_badges: normalizeBadges(row.custom_badges),
    followers_count: Number(row.followers_count ?? 0),
    is_online: !!row.is_online,
    last_seen: (row.last_seen as string | null) ?? null,
    created_at: (row.created_at as string) ?? new Date().toISOString(),
    is_following: !!row.is_following,
  };
}

export function usePublicProfile(handle: string | null | undefined) {
  return useQuery<PublicProfile | null>({
    queryKey: ["profile", "public", (handle ?? "").toLowerCase()],
    enabled: !!handle && handle.length > 0,
    queryFn: async () => {
      if (!handle) return null;
      const cleanHandle = handle.replace(/^@/, "").trim();
      const { data, error } = await supabase.rpc("get_profile_by_handle", { handle: cleanHandle });
      if (!error) {
        const row = Array.isArray(data) ? data[0] : (data as unknown);
        return row ? publicProfileFromRow(row as Record<string, unknown>) : null;
      }

      console.log("[profile] get_profile_by_handle fallback", error.message);
      const { data: fallback, error: fallbackError } = await supabase
        .from("profiles")
        .select(
          "id,user_id,username,display_name,bio,avatar_url,banner_url,avatar_color,banner_from,banner_to,wallet_address,twitter_handle,website,location,followers_count,following_count,badge,verified,custom_badges,trades_count,win_rate,pnl_pct,xp,created_at",
        )
        .ilike("username", cleanHandle)
        .maybeSingle();
      if (fallbackError) throw fallbackError;
      return fallback ? publicProfileFromRow(fallback as Record<string, unknown>) : null;
    },
    staleTime: 30_000,
  });
}

export function useFollowList(userId: string | null | undefined, kind: "followers" | "following") {
  return useQuery<ProfileSummary[]>({
    queryKey: ["profile", kind, userId ?? "guest"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const fn = kind === "followers" ? "list_followers" : "list_following";
      const { data, error } = await supabase.rpc(fn, { target_user_id: userId });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): ProfileSummary => ({
          user_id: String(r.user_id),
          username: (r.username as string | null) ?? null,
          display_name: (r.display_name as string | null) ?? null,
          avatar_url: normalizeMediaUrl(r.avatar_url),
          verified: !!r.verified,
          custom_badges: normalizeBadges(r.custom_badges),
          followers_count: Number(r.followers_count ?? 0),
        }),
      );
    },
    staleTime: 5_000,
    refetchOnMount: "always",
  });
}

export function usePlatformUsers(opts: { q?: string; onlineOnly?: boolean }) {
  const q = (opts.q ?? "").trim();
  const onlineOnly = !!opts.onlineOnly;
  return useQuery<PlatformUser[]>({
    queryKey: ["users", "list", q, onlineOnly],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_users", {
        q,
        online_only: onlineOnly,
        max_rows: 200,
      });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(platformUserFromRow);
    },
    refetchInterval: onlineOnly ? 30_000 : 60_000,
    staleTime: 15_000,
  });
}

export function useUsersOverview() {
  return useQuery<UsersOverview>({
    queryKey: ["users", "overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("users_overview");
      if (!error) {
        const row = Array.isArray(data) ? data[0] : (data as unknown);
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          total_users: Number(r.total_users ?? 0),
          online_users: Number(r.online_users ?? 0),
          new_today: Number(r.new_today ?? 0),
        };
      }

      console.log("[users] overview fallback", error.message);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [{ count: total }, { count: newToday }, onlineRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", today.toISOString()),
        supabase.rpc("list_users", { q: "", online_only: true, max_rows: 200 }),
      ]);
      const onlineRows = onlineRes.error ? [] : ((onlineRes.data ?? []) as unknown[]);
      return {
        total_users: total ?? 0,
        online_users: onlineRows.length,
        new_today: newToday ?? 0,
      };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useSearchProfiles(query: string) {
  return useQuery<ProfileSummary[]>({
    queryKey: ["profile", "search", query],
    enabled: true,
    queryFn: async () => {
      const q = (query ?? "").replace(/^@/, "").trim();
      const { data, error } = await supabase.rpc("search_profiles", {
        q,
        max_rows: 30,
      });
      if (!error) return ((data ?? []) as Record<string, unknown>[]).map(profileSummaryFromRow);

      console.log("[profile] search_profiles fallback", error.message);
      let req = supabase
        .from("profiles")
        .select("id,user_id,username,display_name,avatar_url,verified,custom_badges,followers_count")
        .order("created_at", { ascending: false })
        .limit(30);
      if (q.length > 0) {
        req = req.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
      }
      const { data: fallback, error: fallbackError } = await req;
      if (fallbackError) throw fallbackError;
      return ((fallback ?? []) as Record<string, unknown>[]).map(profileSummaryFromRow);
    },
    staleTime: 20_000,
  });
}
