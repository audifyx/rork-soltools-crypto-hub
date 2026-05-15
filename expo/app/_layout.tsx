import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { enableFreeze } from "react-native-screens";

enableFreeze(true);

import Colors from "@/constants/colors";
import { checkTeamStatus } from "@/lib/check-team-status";
import { registerKOLSync } from "@/lib/kol-background";
import { attachNotificationTapHandler, ensureNotificationPermission } from "@/lib/push-notifications";
import { AdminProvider } from "@/providers/admin-provider";
import { AppProvider } from "@/providers/app-provider";
import ModerationGate from "@/components/ui/ModerationGate";
import { AuthProvider } from "@/providers/auth-provider";
import { ModerationProvider } from "@/providers/moderation-provider";
import { LaunchpadProvider } from "@/providers/launchpad-provider";
import { LobbiesProvider } from "@/providers/lobbies-provider";
import { MessagesProvider } from "@/providers/messages-provider";
import { ProfileProvider } from "@/providers/profile-provider";
import { ReportsProvider } from "@/providers/reports-provider";
import { SocialProvider } from "@/providers/social-provider";
import { CommunityAccessProvider } from "@/providers/community-access-provider";
import ReportSheet from "@/components/social/ReportSheet";

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

function RootLayoutNav() {
  const router = useRouter();
  useEffect(() => {
    let teardown: (() => void) | null = null;
    attachNotificationTapHandler((route) => {
      try {
        router.push(route as never);
      } catch (error) {
        console.log("SolTools notification route push skipped", error instanceof Error ? error.message : error);
      }
    })
      .then((fn) => {
        teardown = fn;
      })
      .catch(() => {});
    return () => {
      if (teardown) teardown();
    };
  }, [router]);
  return (
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
      <Stack.Screen name="spaces" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="space/[id]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="messages" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="dm/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="notes-to-self" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="lobbies" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="lobby/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="notifications" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="follow-requests" options={{ animation: "slide_from_right" }} />
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
});
