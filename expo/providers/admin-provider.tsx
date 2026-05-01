import createContextHook from "@nkzw/create-context-hook";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export type AdminRole = "superadmin" | "admin" | "moderator" | "support";

interface AdminRoleRow {
  user_id: string;
  role: AdminRole;
}

export const [AdminProvider, useAdmin] = createContextHook(() => {
  const { userId, isAuthenticated } = useAuth();

  const roleQuery = useQuery<AdminRole | null>({
    queryKey: ["admin", "self-role", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("admin_roles")
        .select("user_id,role")
        .eq("user_id", userId)
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
  const isAdmin = role !== null;
  const isSuperadmin = role === "superadmin";

  return useMemo(
    () => ({
      role,
      isAdmin,
      isSuperadmin,
      isLoading: roleQuery.isLoading,
    }),
    [role, isAdmin, isSuperadmin, roleQuery.isLoading],
  );
});
