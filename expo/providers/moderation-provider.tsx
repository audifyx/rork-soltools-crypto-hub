import createContextHook from "@nkzw/create-context-hook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export interface ModerationStatus {
  is_banned: boolean;
  ban_expires_at: string | null;
  ban_reason: string | null;
  banned_at: string | null;
  is_suspended: boolean;
  suspend_expires_at: string | null;
  suspend_reason: string | null;
  suspended_at: string | null;
  can_post: boolean;
  can_comment: boolean;
  can_like: boolean;
  can_dm: boolean;
  limit_expires_at: string | null;
  limit_reason: string | null;
}

const DEFAULT_STATUS: ModerationStatus = {
  is_banned: false,
  ban_expires_at: null,
  ban_reason: null,
  banned_at: null,
  is_suspended: false,
  suspend_expires_at: null,
  suspend_reason: null,
  suspended_at: null,
  can_post: true,
  can_comment: true,
  can_like: true,
  can_dm: true,
  limit_expires_at: null,
  limit_reason: null,
};

export const [ModerationProvider, useModeration] = createContextHook(() => {
  const qc = useQueryClient();
  const { userId, isAuthenticated } = useAuth();

  const query = useQuery<ModerationStatus>({
    queryKey: ["moderation", "self", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_moderation_status");
      if (error) {
        console.log("[moderation] fetch failed", error.message);
        return DEFAULT_STATUS;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return DEFAULT_STATUS;
      return {
        is_banned: !!row.is_banned,
        ban_expires_at: row.ban_expires_at ?? null,
        ban_reason: row.ban_reason ?? null,
        banned_at: row.banned_at ?? null,
        is_suspended: !!row.is_suspended,
        suspend_expires_at: row.suspend_expires_at ?? null,
        suspend_reason: row.suspend_reason ?? null,
        suspended_at: row.suspended_at ?? null,
        can_post: row.can_post !== false,
        can_comment: row.can_comment !== false,
        can_like: row.can_like !== false,
        can_dm: row.can_dm !== false,
        limit_expires_at: row.limit_expires_at ?? null,
        limit_reason: row.limit_reason ?? null,
      } as ModerationStatus;
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`moderation-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["moderation", "self", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  const status = query.data ?? DEFAULT_STATUS;
  const isBanned = status.is_banned;
  const isSuspended = !isBanned && status.is_suspended;
  const isLimited =
    !isBanned && !isSuspended && (!status.can_post || !status.can_comment || !status.can_like || !status.can_dm);

  /**
   * Throws a user-friendly error when the current account cannot perform the
   * given action because they are banned, suspended, or limited. Callers should
   * invoke this BEFORE any optimistic UI update or RPC call.
   */
  const assertCanAct = useCallback(
    (action: "post" | "comment" | "like" | "dm") => {
      if (status.is_banned) {
        throw new Error("Your account is banned. You can't use the app.");
      }
      if (status.is_suspended) {
        const when = status.suspend_expires_at
          ? ` until ${new Date(status.suspend_expires_at).toLocaleString()}`
          : "";
        throw new Error(`Your account is suspended${when}. You can't ${action === "dm" ? "send messages" : action} right now.`);
      }
      if (action === "post" && !status.can_post) {
        throw new Error("Posting is temporarily disabled on your account.");
      }
      if (action === "comment" && !status.can_comment) {
        throw new Error("Commenting is temporarily disabled on your account.");
      }
      if (action === "like" && !status.can_like) {
        throw new Error("Liking is temporarily disabled on your account.");
      }
      if (action === "dm" && !status.can_dm) {
        throw new Error("Messaging is temporarily disabled on your account.");
      }
    },
    [status],
  );

  return useMemo(
    () => ({
      status,
      isBanned,
      isSuspended,
      isLimited,
      isLoading: query.isLoading,
      assertCanAct,
      refresh: () => qc.invalidateQueries({ queryKey: ["moderation", "self", userId ?? "guest"] }),
    }),
    [status, isBanned, isSuspended, isLimited, query.isLoading, assertCanAct, qc, userId],
  );
});
