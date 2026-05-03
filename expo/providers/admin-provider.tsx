import createContextHook from "@nkzw/create-context-hook";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { SOLTOOLS_ADMIN_EMAIL } from "@/lib/soltools-platform";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export type AdminRole = "owner" | "superadmin" | "admin" | "moderator" | "support" | "user";

export const [AdminProvider, useAdmin] = createContextHook(() => {
  const { userId, email, isAuthenticated } = useAuth();
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const isOwnerEmail = normalizedEmail === SOLTOOLS_ADMIN_EMAIL;

  const roleQuery = useQuery<AdminRole | null>({
    queryKey: ["admin", "self-role", userId ?? "guest", normalizedEmail],
    enabled: isAuthenticated && !!userId && isOwnerEmail,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId || !isOwnerEmail) return null;
      const { error: ownerError } = await supabase.rpc("ensure_owner_role", {
        check_user_id: userId,
        check_email: normalizedEmail,
      });
      if (ownerError) console.log("[admin] owner role ensure skipped", ownerError.message);
      return "owner" as const;
    },
  });

  const role = isOwnerEmail ? roleQuery.data ?? "owner" : null;
  const isOwner = role === "owner" && isOwnerEmail;
  const isAdmin = isOwner;
  const isSuperadmin = isOwner;

  return useMemo(
    () => ({
      role,
      isAdmin,
      isOwner,
      isSuperadmin,
      isLoading: isOwnerEmail && roleQuery.isLoading,
    }),
    [role, isAdmin, isOwner, isSuperadmin, isOwnerEmail, roleQuery.isLoading],
  );
});
