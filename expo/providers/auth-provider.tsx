import createContextHook from "@nkzw/create-context-hook";
import type { Session, User } from "@supabase/supabase-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

export const [AuthProvider, useAuth] = createContextHook(() => {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        console.log("[auth] initial session", data.session?.user?.email ?? "(none)");
      })
      .catch((e) => console.log("[auth] getSession error", e))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[auth] event", event, s?.user?.email ?? "(none)");
      setSession(s ?? null);
      setUser(s?.user ?? null);
      qc.invalidateQueries();
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
          await supabase.from("profiles").upsert(
            {
              id: data.user.id,
              user_id: data.user.id,
              username: input.username.trim(),
            },
            { onConflict: "id" },
          );
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
    },
    onSuccess: () => {
      qc.clear();
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
