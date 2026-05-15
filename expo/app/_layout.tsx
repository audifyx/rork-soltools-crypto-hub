import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { enableFreeze } from "react-native-screens";

enableFreeze(true);

import Colors from "@/constants/colors";
import { checkTeamStatus } from "@/lib/check-team-status";
import { registerKOLSync } from "@/lib/kol-background";
import { attachNotificationTapHandler, ensureNotificationPermission } from "@/lib/push-notifications";
import { routeForIncomingShareUrl } from "@/lib/share-links";
import { supabase } from "@/lib/supabase";
import { AdminProvider } from "@/providers/admin-provider";
import { AppProvider } from "@/providers/app-provider";
import ModerationGate from "@/components/ui/ModerationGate";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { ModerationProvider } from "@/providers/moderation-provider";
import { LaunchpadProvider } from "@/providers/launchpad-provider";
import { LobbiesProvider } from "@/providers/lobbies-provider";
import { MessagesProvider } from "@/providers/messages-provider";
import { ProfileProvider } from "@/providers/profile-provider";
import { ReportsProvider } from "@/providers/reports-provider";
import { SocialProvider } from "@/providers/social-provider";
import { CommunityAccessProvider } from "@/providers/community-access-provider";
import ReportSheet from "@/components/social/ReportSheet";
import { acceptCommunityInviteNotification } from "@/lib/api/community-invites";
import { invalidateNotificationState } from "@/lib/social-query-keys";

SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.log("SolTools splash hold skipped during boot", error);
});

/**
 * Returns true for transient fetch errors (offline, DNS, TLS handshake, timeout)
 * that React Native surfaces as a bare `TypeError: Network request failed`.
 * These are already retried by React Query and individually caught by callers,
 * so we never want them to bubble as red console.error overlays — especially
 * during cold start while the device is still on the lock screen and the
 * network stack is unavailable.
 */
function isTransientNetworkError(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return false;
  return (
    message.includes("Network request failed") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("timeout") ||
    message.includes("AbortError")
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isTransientNetworkError(error)) {
        console.log("[query] transient network error suppressed", query.queryHash);
        return;
      }
      console.log("[query] error", query.queryHash, error instanceof Error ? error.message : error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isTransientNetworkError(error)) {
        console.log("[mutation] transient network error suppressed");
        return;
      }
      console.log("[mutation] error", error instanceof Error ? error.message : error);
    },
  }),
});

// Swallow unhandled promise rejections caused by transient network failures so
// they don't render the red LogBox while the device is still offline / locked.
if (typeof globalThis !== "undefined") {
  const g = globalThis as unknown as {
    HermesInternal?: { enablePromiseRejectionTracker?: (opts: { allRejections: boolean; onUnhandled: (id: number, err: unknown) => void }) => void };
    addEventListener?: (type: string, listener: (e: Event & { reason?: unknown; preventDefault?: () => void }) => void) => void;
  };
  try {
    g.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, err) => {
        if (isTransientNetworkError(err)) {
          console.log("[unhandled] transient network rejection suppressed");
          return;
        }
        console.log("[unhandled] promise rejection", err instanceof Error ? err.message : err);
      },
    });
  } catch {
    // ignore — tracker not available
  }
  try {
    g.addEventListener?.("unhandledrejection", (event) => {
      if (isTransientNetworkError(event?.reason)) {
        event.preventDefault?.();
      }
    });
  } catch {
    // ignore
  }
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  console.log("SolTools root error", error.message);

  return (
    <View style={styles.errorRoot} testID="soltools-error-boundary">
      <Text style={styles.errorEyebrow}>SolTools scanner interrupted</Text>
      <Text style={styles.errorTitle}>SolTools hit a loading glitch.</Text>
      <Text style={styles.errorBody}>Tap retry to reconnect wallet tracking, pair scanning, and the social feed.</Text>
      <Text onPress={retry} style={styles.errorAction} testID="soltools-error-retry">
        Retry SolTools
      </Text>
    </View>
  );
}

interface CommunityInviteNotice {
  notificationId: string;
  communityId: string;
  communityName: string;
  actorName: string;
  message: string;
}

function inviteFromNotificationRow(row: Record<string, unknown>): CommunityInviteNotice | null {
  const data = typeof row.data === "object" && row.data !== null ? (row.data as Record<string, unknown>) : {};
  const kind = String(row.kind ?? data.kind ?? "");
  if (kind !== "community_invite") return null;
  if (row.read_at) return null;
  const notificationId = String(row.id ?? data.notificationId ?? "");
  const communityId = String(row.target_id ?? data.communityId ?? data.targetId ?? "");
  if (!notificationId || !communityId) return null;
  const communityName = String(data.communityName ?? "this community");
  const actorName = String(data.actorName ?? "Someone");
  const message = String(row.message ?? row.body ?? `${actorName} invited you to join ${communityName}`);
  return { notificationId, communityId, communityName, actorName, message };
}

function RootLayoutNav() {
  const router = useRouter();
  useEffect(() => {
    let notificationTeardown: (() => void) | null = null;
    let alive = true;

    const pushRoute = (route: string) => {
      try {
        router.push(route as never);
      } catch (error) {
        console.log("SolTools route push skipped", error instanceof Error ? error.message : error);
      }
    };

    const handleIncomingUrl = (url: string | null) => {
      if (!url) return;
      void routeForIncomingShareUrl(url).then((route) => {
        if (alive && route) pushRoute(route);
      });
    };

    attachNotificationTapHandler(pushRoute)
      .then((fn) => {
        notificationTeardown = fn;
      })
      .catch(() => {});

    Linking.getInitialURL().then(handleIncomingUrl).catch(() => {});
    const linkSub = Linking.addEventListener("url", ({ url }) => handleIncomingUrl(url));

    return () => {
      alive = false;
      if (notificationTeardown) notificationTeardown();
      linkSub.remove();
    };
  }, [router]);
  return (
    <>
      <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: styles.stackContent,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animation: "ios_from_right",
        animationDuration: 180,
        freezeOnBlur: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" options={{ presentation: "modal" }} />
      <Stack.Screen name="reset-password" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="legal/privacy" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="legal/terms" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="legal/licenses" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="list-token" options={{ presentation: "modal" }} />
      <Stack.Screen name="compose" options={{ presentation: "modal" }} />
      <Stack.Screen name="upload-reel" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="launch/[id]" />
      <Stack.Screen name="tool/[id]" />
      <Stack.Screen name="ogscan/[slug]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="app" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="command" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="our-coin" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="roadmap" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="market-pulse" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="snipe-feed" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="scanner" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="og-finder" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="pairs" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="migrations" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="trending" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="whales" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="tx-feed" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="swap" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="tech" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="dev-wallet" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="dev-wallet-radar" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="og-scanner" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="ogscan-scanner" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="migration-tool" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="migration-tracker" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="page/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="page-[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="u/[handle]" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="owner" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="team" animation="slide_from_right" />
      <Stack.Screen name="communities" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="community/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="community/create" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="l/[code]" options={{ animation: "fade" }} />
      <Stack.Screen name="spaces" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="space/[id]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="messages" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="dm/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="notes-to-self" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="lobbies" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="lobby/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="notifications" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="blocked-users" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="posts" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="post/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="wallet" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="crypto-news" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="kol-scan" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="kol/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="faq-bot" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="+not-found" />
      </Stack>
      <CommunityInviteOverlay />
    </>
  );
}

function CommunityInviteOverlay() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const [pendingInvite, setPendingInviteState] = useState<CommunityInviteNotice | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const dismissedIdsRef = useRef<Set<string>>(new Set<string>());
  const pendingInviteRef = useRef<CommunityInviteNotice | null>(null);

  const setPendingInvite = useCallback((invite: CommunityInviteNotice | null) => {
    pendingInviteRef.current = invite;
    setPendingInviteState(invite);
  }, []);

  useEffect(() => {
    if (!userId || !isAuthenticated) {
      setPendingInvite(null);
      return;
    }

    let mounted = true;
    const showInvite = (row: Record<string, unknown>) => {
      const invite = inviteFromNotificationRow(row);
      if (!invite) {
        if (pendingInviteRef.current && String(row.id ?? "") === pendingInviteRef.current.notificationId) setPendingInvite(null);
        return;
      }
      if (!dismissedIdsRef.current.has(invite.notificationId)) setPendingInvite(invite);
    };

    supabase
      .from("notifications")
      .select("id,kind,title,message,body,data,target_id,target_type,read_at,created_at")
      .eq("user_id", userId)
      .eq("kind", "community_invite")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted && data) showInvite(data as Record<string, unknown>);
      })
      .catch(() => {});

    const channelName = `community-invite-popup-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? {}) as Record<string, unknown>;
          showInvite(row);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated, setPendingInvite, userId]);

  const dismissInvite = useCallback(() => {
    if (pendingInvite) dismissedIdsRef.current.add(pendingInvite.notificationId);
    setPendingInvite(null);
  }, [pendingInvite]);

  const acceptInvite = useCallback(async () => {
    if (!pendingInvite || acceptingId) return;
    setAcceptingId(pendingInvite.notificationId);
    try {
      const { communityId } = await acceptCommunityInviteNotification(
        pendingInvite.notificationId,
        pendingInvite.communityId,
        userId,
      );
      setPendingInvite(null);
      await Promise.allSettled([
        invalidateNotificationState(queryClient),
        queryClient.invalidateQueries({ queryKey: ["social", "memberships"] }),
        queryClient.invalidateQueries({ queryKey: ["social", "communities"] }),
        queryClient.invalidateQueries({ queryKey: ["community", "members", communityId] }),
      ]);
      router.push({ pathname: "/community/[id]", params: { id: communityId } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Try again from notifications.";
      Alert.alert("Could not join", msg);
    } finally {
      setAcceptingId(null);
    }
  }, [acceptingId, pendingInvite, queryClient, router, userId]);

  return (
    <Modal visible={!!pendingInvite} transparent animationType="fade" onRequestClose={dismissInvite}>
      <View style={styles.inviteOverlay}>
        {pendingInvite ? (
          <View style={styles.inviteCard} testID="community-invite-popup">
            <View style={styles.inviteGlow} />
            <View style={styles.inviteAvatar}>
              <Text style={styles.inviteAvatarText}>{pendingInvite.actorName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.inviteCopy}>
              <Text style={styles.inviteEyebrow}>Community invite</Text>
              <Text style={styles.inviteTitle} numberOfLines={2}>{pendingInvite.message}</Text>
              <Text style={styles.inviteBody} numberOfLines={1}>Tap join to enter {pendingInvite.communityName}</Text>
            </View>
            <View style={styles.inviteActions}>
              <Pressable onPress={dismissInvite} style={styles.inviteLaterBtn} testID="community-invite-later">
                <Text style={styles.inviteLaterText}>Later</Text>
              </Pressable>
              <Pressable onPress={acceptInvite} disabled={!!acceptingId} style={styles.inviteJoinBtn} testID="community-invite-join">
                {acceptingId ? <ActivityIndicator color={Colors.ink} size="small" /> : <Text style={styles.inviteJoinText}>Join</Text>}
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch((error: unknown) => {
      console.log("SolTools splash hide skipped", error);
    });
    registerKOLSync().catch((error: unknown) => {
      console.log("SolTools kol bg sync skipped", error);
    });
    ensureNotificationPermission().catch((error: unknown) => {
      console.log("SolTools notification setup skipped", error instanceof Error ? error.message : error);
    });
    checkTeamStatus()
      .then((status) => {
        if (status.isTeam) {
          console.log("[team] dashboard unlocked", status.role);
        }
      })
      .catch((error: unknown) => {
        console.log("SolTools team status check skipped", error instanceof Error ? error.message : error);
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AdminProvider>
          <ModerationProvider>
            <ProfileProvider>
              <AppProvider>
                <LaunchpadProvider>
                  <SocialProvider>
                    <CommunityAccessProvider>
                    <MessagesProvider>
                      <LobbiesProvider>
                        <ReportsProvider>
                          <GestureHandlerRootView style={styles.gestureRoot}>
                            <ModerationGate>
                              <RootLayoutNav />
                              <ReportSheet />
                            </ModerationGate>
                          </GestureHandlerRootView>
                        </ReportsProvider>
                      </LobbiesProvider>
                    </MessagesProvider>
                    </CommunityAccessProvider>
                  </SocialProvider>
                </LaunchpadProvider>
              </AppProvider>
            </ProfileProvider>
          </ModerationProvider>
        </AdminProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  stackContent: {
    backgroundColor: Colors.ink,
  },
  errorRoot: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: Colors.ink,
  },
  errorEyebrow: {
    color: Colors.orange,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
  },
  errorBody: {
    color: Colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    marginBottom: 22,
  },
  errorAction: {
    alignSelf: "flex-start",
    color: Colors.ink,
    backgroundColor: Colors.mint,
    borderRadius: 16,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "900",
  },
  inviteOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 58,
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  inviteCard: {
    width: "100%",
    minHeight: 112,
    borderRadius: 28,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "rgba(6,8,15,0.96)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.36)",
    shadowColor: Colors.mint,
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  inviteGlow: {
    position: "absolute",
    top: -60,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(63,169,255,0.18)",
  },
  inviteAvatar: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.mint,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  inviteAvatarText: {
    color: Colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  inviteCopy: {
    flex: 1,
    gap: 3,
  },
  inviteEyebrow: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  inviteTitle: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  inviteBody: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  inviteActions: {
    alignItems: "stretch",
    gap: 8,
  },
  inviteLaterBtn: {
    minWidth: 64,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  inviteLaterText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  inviteJoinBtn: {
    minWidth: 64,
    minHeight: 34,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.mint,
  },
  inviteJoinText: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
});
