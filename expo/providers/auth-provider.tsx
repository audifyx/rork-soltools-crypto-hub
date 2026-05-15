import createContextHook from "@nkzw/create-context-hook";
import type { Session, User } from "@supabase/supabase-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { clearSignedOutCache, invalidateCacheScopes } from "@/lib/provider-cache";
import { saveOwnProfilePatch } from "@/lib/profile-db";
import { registerPushTokenForUser, unregisterPushToken } from "@/lib/push-notifications";
import { SUPABASE_ANON_KEY, SUPABASE_READY, SUPABASE_URL, supabase } from "@/lib/supabase";
import { clearAllUserCache } from "@/lib/user-cache";

function normalizeUsername(input: string | null | undefined, fallbackEmail?: string): string {
  const raw = (input?.trim() || fallbackEmail?.split("@")[0] || "trader").toLowerCase();
  const cleaned = raw.replace(/^@/, "").replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned || "trader").slice(0, 24);
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!SUPABASE_READY) {
      console.log("[auth] Supabase is not configured for this build");
      setIsLoading(false);
      return () => {
        mounted = false;
      };
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const nextUser = data.session?.user ?? null;
        currentUserIdRef.current = nextUser?.id ?? null;
        setSession(data.session ?? null);
        setUser(nextUser);
        if (nextUser?.id) {
          registerPushTokenForUser(nextUser.id).catch(() => {});
        }
        console.log("[auth] initial session", nextUser?.email ?? "(none)");
      })
      .catch((e) => console.log("[auth] getSession error", e))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[auth] event", event, s?.user?.email ?? "(none)");
      const nextUser = s?.user ?? null;
      const prevId = currentUserIdRef.current;
      const nextId = nextUser?.id ?? null;
      currentUserIdRef.current = nextId;
      setSession(s ?? null);
      setUser(nextUser);

      if (prevId !== nextId) {
        clearSignedOutCache(qc).catch(() => {});
        if (!nextId) {
          unregisterPushToken().catch(() => {});
        }
      } else {
        invalidateCacheScopes(qc, ["profile", "social", "feed", "notifications"]).catch(() => {});
      }
      if (nextId) {
        registerPushTokenForUser(nextId).catch(() => {});
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  const signIn = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email.trim(),
        password: input.password,
      });
      if (error) throw error;
      return data;
    },
  });

  const signUp = useMutation({
    mutationFn: async (input: { email: string; password: string; username?: string; inviteCode?: string }) => {
      const email = input.email.trim().toLowerCase();
      const username = normalizeUsername(input.username, email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: {
          data: { username, display_name: username },
        },
      });
      if (error) throw error;
      if (data.user) {
        try {
          await saveOwnProfilePatch(data.user.id, {
            username,
            display_name: username,
          });
        } catch (e) {
          console.log("[auth] profile create best-effort failed", e);
        }
      }
      const code = input.inviteCode?.trim();
      if (code && data.session) {
        try {
          const { error: rErr } = await supabase.rpc("redeem_invite_code", { p_code: code });
          if (rErr) console.log("[auth] redeem invite failed", rErr.message);
        } catch (e) {
          console.log("[auth] redeem invite threw", e);
        }
      }
      return data;
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      // Optimistically clear local auth state first so the UI reacts even if
      // the network round-trip to Supabase is slow or fails.
      currentUserIdRef.current = null;
      setSession(null);
      setUser(null);
      try {
        await unregisterPushToken();
      } catch (e) {
        console.log("[auth] unregister push token failed", e);
      }
      try {
        // `scope: 'local'` clears the session in AsyncStorage without
        // requiring a network call. This makes sign-out reliable on poor
        // connections and when the access token is already expired.
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) console.log("[auth] signOut error (ignored)", error.message);
      } catch (e) {
        console.log("[auth] signOut threw (ignored)", e);
      }
      try {
        await clearAllUserCache();
      } catch (e) {
        console.log("[auth] clearAllUserCache failed", e);
      }
    },
    onSuccess: () => {
      clearSignedOutCache(qc).catch(() => {});
    },
  });

  const resetPassword = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "soltools://reset-password",
      });
      if (error) throw error;
    },
  });

  const updatePassword = useMutation({
    mutationFn: async (newPassword: string) => {
      if (!newPassword || newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("You must be signed in to delete your account.");
      if (!SUPABASE_URL) throw new Error("Supabase is not configured.");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: "{}",
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = "Failed to delete account.";
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed?.error) msg = parsed.error;
        } catch {}
        throw new Error(msg);
      }
      try {
        await supabase.auth.signOut();
      } catch {}
      await clearAllUserCache();
    },
    onSuccess: () => {
      clearSignedOutCache(qc).catch(() => {});
    },
  });

  return useMemo(
    () => ({
      session,
      user,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      isAuthenticated: !!user,
      isLoading,
      signIn: signIn.mutateAsync,
      signInError: signIn.error as Error | null,
      isSigningIn: signIn.isPending,
      signUp: signUp.mutateAsync,
      signUpError: signUp.error as Error | null,
      isSigningUp: signUp.isPending,
      signOut: signOut.mutateAsync,
      isSigningOut: signOut.isPending,
      resetPassword: resetPassword.mutateAsync,
      isResettingPassword: resetPassword.isPending,
      updatePassword: updatePassword.mutateAsync,
      isUpdatingPassword: updatePassword.isPending,
      deleteAccount: deleteAccount.mutateAsync,
      isDeletingAccount: deleteAccount.isPending,
    }),
    [
      session,
      user,
      isLoading,
      signIn.mutateAsync,
      signIn.error,
      signIn.isPending,
      signUp.mutateAsync,
      signUp.error,
      signUp.isPending,
      signOut.mutateAsync,
      signOut.isPending,
      resetPassword.mutateAsync,
      resetPassword.isPending,
      updatePassword.mutateAsync,
      updatePassword.isPending,
      deleteAccount.mutateAsync,
      deleteAccount.isPending,
    ],
  );
});
