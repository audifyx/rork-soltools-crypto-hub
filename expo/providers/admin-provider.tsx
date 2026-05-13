import createContextHook from "@nkzw/create-context-hook";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { SOLTOOLS_ADMIN_EMAIL } from "@/lib/soltools-platform";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export type AdminRole = "owner" | "superadmin" | "admin" | "moderator" | "team" | "support" | "user";

export interface TeamPermissions {
  delete_posts: boolean;
  delete_reels: boolean;
  delete_comments: boolean;
  delete_stories: boolean;
  ban_users: boolean;
  suspend_users: boolean;
  limit_users: boolean;
  resolve_reports: boolean;
  view_online: boolean;
  view_analytics: boolean;
}

export const DEFAULT_TEAM_PERMISSIONS: TeamPermissions = {
  delete_posts: true,
  delete_reels: true,
  delete_comments: true,
  delete_stories: true,
  ban_users: true,
  suspend_users: true,
  limit_users: true,
  resolve_reports: true,
  view_online: true,
  view_analytics: true,
};

function normalizePerms(input: unknown): TeamPermissions {
  if (!input || typeof input !== "object") return DEFAULT_TEAM_PERMISSIONS;
  const r = input as Record<string, unknown>;
  const get = (k: keyof TeamPermissions) => (typeof r[k] === "boolean" ? (r[k] as boolean) : DEFAULT_TEAM_PERMISSIONS[k]);
  return {
    delete_posts: get("delete_posts"),
    delete_reels: get("delete_reels"),
    delete_comments: get("delete_comments"),
    delete_stories: get("delete_stories"),
    ban_users: get("ban_users"),
    suspend_users: get("suspend_users"),
    limit_users: get("limit_users"),
    resolve_reports: get("resolve_reports"),
    view_online: get("view_online"),
    view_analytics: get("view_analytics"),
  };
}

export const [AdminProvider, useAdmin] = createContextHook(() => {
  const { userId, email, isAuthenticated } = useAuth();
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const isOwnerEmail = normalizedEmail === SOLTOOLS_ADMIN_EMAIL;

  const roleQuery = useQuery<{ role: AdminRole | null; permissions: TeamPermissions | null }>({
    queryKey: ["admin", "self-role", userId ?? "guest", normalizedEmail],
    enabled: isAuthenticated && !!userId,
    // Short stale time + periodic refetch so newly-promoted moderators see
    // their team dashboard unlock automatically without restarting the app.
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    queryFn: async () => {
      if (!userId) return { role: null, permissions: null };
      if (isOwnerEmail) {
        const { error: ownerError } = await supabase.rpc("ensure_owner_role", {
          check_user_id: userId,
          check_email: normalizedEmail,
        });
        if (ownerError) console.log("[admin] owner role ensure skipped", ownerError.message);
      }
      // Prefer the SECURITY DEFINER RPC so RLS on admin_roles can't hide the
      // current user's own row (this was the bug that left newly-promoted
      // team members stuck on the locked dashboard).
      const rpc = await supabase.rpc("get_my_admin_role");
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
        const row = rpc.data[0] as { role: string | null; permissions: unknown };
        const rpcRole = (row?.role as AdminRole | null) ?? null;
        if (rpcRole) {
          const perms = rpcRole === "team" ? normalizePerms(row.permissions) : null;
          return { role: rpcRole, permissions: perms };
        }
        // RPC returned a null-role placeholder — user has no admin_roles row.
        return { role: isOwnerEmail ? ("owner" as const) : null, permissions: null };
      }
      if (rpc.error) console.log("[admin] get_my_admin_role failed", rpc.error.message);

      const { data, error } = await supabase
        .from("admin_roles")
        .select("role,permissions")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.log("[admin] role fetch failed", error.message);
        return { role: isOwnerEmail ? ("owner" as const) : null, permissions: null };
      }
      if (!data) return { role: isOwnerEmail ? ("owner" as const) : null, permissions: null };
      const role = (data.role as AdminRole) ?? null;
      const perms = role === "team" ? normalizePerms(data.permissions) : null;
      return { role, permissions: perms };
    },
  });

  const role = roleQuery.data?.role ?? (isOwnerEmail ? "owner" : null);
  const permissions = roleQuery.data?.permissions ?? null;
  const isOwner = role === "owner";
  const isSuperadmin = isOwner || role === "superadmin";
  const isAdmin = isOwner || role === "superadmin" || role === "admin";
  const isTeam = isAdmin || role === "team" || role === "moderator";

  const effectivePermissions: TeamPermissions = useMemo(() => {
    if (isAdmin) return DEFAULT_TEAM_PERMISSIONS;
    if (role === "team" && permissions) return permissions;
    if (role === "moderator") return DEFAULT_TEAM_PERMISSIONS;
    return {
      delete_posts: false,
      delete_reels: false,
      delete_comments: false,
      delete_stories: false,
      ban_users: false,
      suspend_users: false,
      limit_users: false,
      resolve_reports: false,
      view_online: false,
      view_analytics: false,
    };
  }, [isAdmin, permissions, role]);

  return useMemo(
    () => ({
      role,
      permissions: effectivePermissions,
      isAdmin,
      isOwner,
      isSuperadmin,
      isTeam,
      isLoading: roleQuery.isLoading,
    }),
    [role, effectivePermissions, isAdmin, isOwner, isSuperadmin, isTeam, roleQuery.isLoading],
  );
});
