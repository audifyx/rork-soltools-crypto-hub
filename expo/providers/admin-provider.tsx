import createContextHook from "@nkzw/create-context-hook";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { SOLTOOLS_ADMIN_EMAIL } from "@/lib/soltools-platform";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export type AdminRole = "owner" | "superadmin" | "admin" | "moderator" | "support" | "user";

interface AdminRoleRow {
  user_id: string;
  role: AdminRole;
}

export const [AdminProvider, useAdmin] = createContextHook(() => {
  const { userId, email, isAuthenticated } = useAuth();

  const roleQuery = useQuery<AdminRole | null>({
    queryKey: ["admin", "self-role", userId ?? "guest", email ?? ""],
    enabled: isAuthenticated && !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) return null;
      if (email?.toLowerCase() === SOLTOOLS_ADMIN_EMAIL) {
        const { error: ownerError } = await supabase.rpc("ensure_owner_role", {
          check_user_id: userId,
          check_email: email,
        });
        if (ownerError) console.log("[admin] owner role ensure skipped", ownerError.message);
        return "owner" as const;
      }
      const { data, error } = await supabase
        .from("admin_roles")
        .select("user_id,role")
        .eq("user_id", userId)
        .in("role", ["owner", "superadmin"])
        .limit(1)
        .maybeSingle();
      if (error) {
        console.log("[admin] self-role error", error.message);
        return null;
      }
      const row = data as AdminRoleRow | null;
      return row?.role ?? null;
    },
  });

  const role = roleQuery.data ?? null;
  const isOwner = role === "owner" || role === "superadmin";
  const isAdmin = isOwner;
  const isSuperadmin = isOwner;

  return useMemo(
    () => ({
      role,
      isAdmin,
      isOwner,
      isSuperadmin,
      isLoading: roleQuery.isLoading,
    }),
    [role, isAdmin, isOwner, isSuperadmin, roleQuery.isLoading],
  );
});
