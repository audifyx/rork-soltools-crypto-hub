import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { AppState, type AppStateStatus } from "react-native";

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
      const { data, error } = await supabase
        .from("profiles")
        .select("custom_badges")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        console.log("[profile] badges fetch error", error.message);
        return [];
      }
      return normalizeBadges((data as { custom_badges?: unknown } | null)?.custom_badges);
    },
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (input: { kind: ProfileMediaKind; uri: string }) => {
      if (!userId) throw new Error("Sign in to upload");
      const url = await uploadProfileMedia(userId, input.kind, input.uri);
      const patch = input.kind === "avatar" ? { avatar_url: url } : { banner_url: url };
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
      return url;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app", "profile"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
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
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["app", "profile"] });
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
export function usePublicProfile(handle: string | null | undefined) {
  return useQuery<PublicProfile | null>({
    queryKey: ["profile", "public", (handle ?? "").toLowerCase()],
    enabled: !!handle && handle.length > 0,
    queryFn: async () => {
      if (!handle) return null;
      const { data, error } = await supabase.rpc("get_profile_by_handle", { handle });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : (data as unknown);
      if (!row) return null;
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        username: (r.username as string | null) ?? null,
        display_name: (r.display_name as string | null) ?? null,
        bio: (r.bio as string | null) ?? null,
        avatar_url: (r.avatar_url as string | null) ?? null,
        banner_url: (r.banner_url as string | null) ?? null,
        avatar_color: (r.avatar_color as string | null) ?? null,
        banner_from: (r.banner_from as string | null) ?? null,
        banner_to: (r.banner_to as string | null) ?? null,
        wallet_address: (r.wallet_address as string | null) ?? null,
        twitter_handle: (r.twitter_handle as string | null) ?? null,
        website: (r.website as string | null) ?? null,
        location: (r.location as string | null) ?? null,
        badge: (r.badge as string | null) ?? null,
        verified: !!r.verified,
        custom_badges: normalizeBadges(r.custom_badges),
        followers_count: Number(r.followers_count ?? 0),
        following_count: Number(r.following_count ?? 0),
        trades_count: Number(r.trades_count ?? 0),
        win_rate: Number(r.win_rate ?? 0),
        pnl_pct: Number(r.pnl_pct ?? 0),
        xp: Number(r.xp ?? 0),
        created_at: (r.created_at as string) ?? new Date().toISOString(),
        is_following: !!r.is_following,
      };
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
          avatar_url: (r.avatar_url as string | null) ?? null,
          verified: !!r.verified,
          custom_badges: normalizeBadges(r.custom_badges),
        }),
      );
    },
    staleTime: 20_000,
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
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): PlatformUser => ({
          user_id: String(r.user_id),
          username: (r.username as string | null) ?? null,
          display_name: (r.display_name as string | null) ?? null,
          avatar_url: (r.avatar_url as string | null) ?? null,
          banner_url: (r.banner_url as string | null) ?? null,
          bio: (r.bio as string | null) ?? null,
          verified: !!r.verified,
          custom_badges: normalizeBadges(r.custom_badges),
          followers_count: Number(r.followers_count ?? 0),
          is_online: !!r.is_online,
          last_seen: (r.last_seen as string | null) ?? null,
          created_at: (r.created_at as string) ?? new Date().toISOString(),
          is_following: !!r.is_following,
        }),
      );
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
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : (data as unknown);
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        total_users: Number(r.total_users ?? 0),
        online_users: Number(r.online_users ?? 0),
        new_today: Number(r.new_today ?? 0),
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
      const { data, error } = await supabase.rpc("search_profiles", {
        q: query ?? "",
        max_rows: 30,
      });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): ProfileSummary => ({
          user_id: String(r.user_id),
          username: (r.username as string | null) ?? null,
          display_name: (r.display_name as string | null) ?? null,
          avatar_url: (r.avatar_url as string | null) ?? null,
          verified: !!r.verified,
          custom_badges: normalizeBadges(r.custom_badges),
          followers_count: Number(r.followers_count ?? 0),
        }),
      );
    },
    staleTime: 20_000,
  });
}
