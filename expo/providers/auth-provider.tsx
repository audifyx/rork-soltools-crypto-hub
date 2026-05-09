import createContextHook from "@nkzw/create-context-hook";
import type { Session, User } from "@supabase/supabase-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { clearSignedOutCache, invalidateCacheScopes } from "@/lib/provider-cache";
import { saveOwnProfilePatch } from "@/lib/profile-db";
import { supabase } from "@/lib/supabase";
import { clearAllUserCache } from "@/lib/user-cache";

export const [AuthProvider, useAuth] = createContextHook(() => {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const nextUser = data.session?.user ?? null;
        currentUserIdRef.current = nextUser?.id ?? null;
        setSession(data.session ?? null);
        setUser(nextUser);
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
      } else {
        invalidateCacheScopes(qc, ["profile", "social", "feed", "notifications"]).catch(() => {});
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
    mutationFn: async (input: { email: string; password: string; username?: string }) => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: { username: input.username?.trim() ?? "" },
        },
      });
      if (error) throw error;
      if (data.user && input.username) {
        try {
          await saveOwnProfilePatch(data.user.id, {
            username: input.username.trim(),
            display_name: input.username.trim(),
          });
        } catch (e) {
          console.log("[auth] profile create best-effort failed", e);
        }
      }
      return data;
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await clearAllUserCache();
    },
    onSuccess: () => {
      clearSignedOutCache(qc).catch(() => {});
    },
  });

  const resetPassword = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
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
    ],
  );
});
