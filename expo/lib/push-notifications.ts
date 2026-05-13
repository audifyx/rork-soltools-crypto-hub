import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import type * as NotificationsType from "expo-notifications";

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

export interface LocalNotificationInput {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
}

let permissionAsked = false;
let handlerConfigured = false;
let androidChannelConfigured = false;
let cachedExpoPushToken: string | null = null;
let registeringForUserId: string | null = null;

function isAndroidExpoGo(): boolean {
  return Platform.OS === "android" && Constants.appOwnership === "expo";
}

async function getNotificationsModule(): Promise<typeof NotificationsType | null> {
  if (Platform.OS === "web" || isAndroidExpoGo()) return null;
  const notifications = await import("expo-notifications");
  if (!handlerConfigured) {
    handlerConfigured = true;
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  if (Platform.OS === "android" && !androidChannelConfigured) {
    androidChannelConfigured = true;
    await notifications
      .setNotificationChannelAsync("default", {
        name: "Default",
        importance: notifications.AndroidImportance.HIGH,
        lightColor: "#55F5B2",
        vibrationPattern: [0, 220, 110, 220],
        lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
      })
      .catch(() => {});
  }
  return notifications;
}

/** Requests local/push notification permissions once per app session. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const notifications = await getNotificationsModule();
  if (!notifications) return false;
  if (!Device.isDevice) return true;

  const existing = await notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (permissionAsked) return false;
  permissionAsked = true;

  const requested = await notifications.requestPermissionsAsync();
  return requested.granted;
}

function resolveProjectId(): string | undefined {
  const expoConfig = Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null;
  const easConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig;
  return expoConfig?.extra?.eas?.projectId ?? easConfig?.projectId;
}

/**
 * Acquires the Expo push token for this device. Returns null on web,
 * Android Expo Go, or when permission was denied.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (cachedExpoPushToken) return cachedExpoPushToken;
  const notifications = await getNotificationsModule();
  if (!notifications) return null;
  if (!Device.isDevice) return null;
  const allowed = await ensureNotificationPermission();
  if (!allowed) return null;
  try {
    const projectId = resolveProjectId();
    const tokenResp = projectId
      ? await notifications.getExpoPushTokenAsync({ projectId })
      : await notifications.getExpoPushTokenAsync();
    const token = tokenResp?.data ?? null;
    if (token) cachedExpoPushToken = token;
    return token;
  } catch (error) {
    console.log("[push] token fetch skipped", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Registers the device's Expo push token with Supabase for the current user. */
export async function registerPushTokenForUser(userId: string | null): Promise<void> {
  if (!userId) return;
  if (registeringForUserId === userId) return;
  registeringForUserId = userId;
  try {
    const token = await getExpoPushToken();
    if (!token) return;
    const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
    const deviceName = Device.deviceName ?? Device.modelName ?? null;
    const appVersion = (Constants.expoConfig?.version as string | undefined) ?? null;
    const { error } = await supabase.rpc("register_push_token", {
      p_token: token,
      p_platform: platform,
      p_device_name: deviceName,
      p_app_version: appVersion,
    });
    if (error) {
      console.log("[push] register failed", error.message);
    }
  } catch (error) {
    console.log("[push] register error", error instanceof Error ? error.message : error);
  } finally {
    if (registeringForUserId === userId) registeringForUserId = null;
  }
}

/** Unregisters this device's token (e.g. on sign out). */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = cachedExpoPushToken ?? (await getExpoPushToken());
    if (!token) return;
    await supabase.rpc("unregister_push_token", { p_token: token });
    cachedExpoPushToken = null;
  } catch (error) {
    console.log("[push] unregister error", error instanceof Error ? error.message : error);
  }
}

/** Best-effort: kicks the push-dispatch edge function to drain the queue. */
export async function kickPushDispatch(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken || !SUPABASE_URL) return;
    await fetch(`${SUPABASE_URL}/functions/v1/push-dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ limit: 25 }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/** Schedules an immediate local notification when allowed by the device. */
export async function scheduleLocalNotification(input: LocalNotificationInput): Promise<void> {
  const notifications = await getNotificationsModule();
  if (!notifications) return;
  const allowed = await ensureNotificationPermission();
  if (!allowed) return;
  await notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      sound: true,
    },
    trigger: null,
  });
}

/** Updates the native app badge where supported. */
export async function setAppBadgeCount(count: number): Promise<void> {
  const notifications = await getNotificationsModule();
  if (!notifications) return;
  await notifications.setBadgeCountAsync(Math.max(0, Math.floor(count))).catch(() => {});
}

export interface PushTapPayload {
  notificationId?: string | null;
  kind?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  actor?: string | null;
  route?: string | null;
  conversationId?: string | null;
}

/** Resolves a router path from a notification payload, or null if unknown. */
export function resolveNotificationRoute(payload: PushTapPayload | undefined | null): string | null {
  if (!payload) return null;
  if (payload.route && typeof payload.route === "string") return payload.route;
  if (payload.conversationId) return `/dm/${payload.conversationId}`;
  const kind = (payload.kind ?? "").toString();
  const targetId = payload.targetId ?? null;
  const actor = (payload.actor ?? "").toString().replace(/^@/, "");
  if ((kind === "dm_message" || kind === "dm_reaction") && targetId) return `/dm/${targetId}`;
  if (kind === "follow_request") return "/follow-requests";
  if (kind === "follow" && actor) return `/u/${actor}`;
  if (kind === "mention" && targetId) return `/post/${targetId}`;
  if (kind === "comment" && targetId) return `/post/${targetId}`;
  if (kind === "like" && targetId) return `/post/${targetId}`;
  if (kind === "repost" && targetId) return `/post/${targetId}`;
  if ((kind === "lobby_invite" || kind === "lobby_event") && targetId) return `/space/${targetId}`;
  if (kind === "launchpad_update" && targetId) return `/launch/${targetId}`;
  if (kind === "whale" || kind === "trade" || kind === "alert") return "/notifications";
  return "/notifications";
}

/**
 * Subscribes to push tap events and forwards the resolved route to onRoute.
 * Returns a teardown that removes both listeners.
 */
export async function attachNotificationTapHandler(
  onRoute: (route: string, payload: PushTapPayload) => void,
): Promise<() => void> {
  const notifications = await getNotificationsModule();
  if (!notifications) return () => {};

  const handle = (response: NotificationsType.NotificationResponse) => {
    const raw = (response?.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
    const payload: PushTapPayload = {
      notificationId: typeof raw.notificationId === "string" ? raw.notificationId : null,
      kind: typeof raw.kind === "string" ? raw.kind : null,
      targetType: typeof raw.targetType === "string" ? raw.targetType : null,
      targetId: typeof raw.targetId === "string" ? raw.targetId : null,
      actor: typeof raw.actor === "string" ? raw.actor : null,
      route: typeof raw.route === "string" ? raw.route : null,
      conversationId: typeof raw.conversationId === "string" ? raw.conversationId : null,
    };
    const route = resolveNotificationRoute(payload);
    if (route) onRoute(route, payload);
  };

  // Cold-start: a tap that launched the app
  try {
    const last = await notifications.getLastNotificationResponseAsync();
    if (last) handle(last);
  } catch {
    // ignore
  }

  const sub = notifications.addNotificationResponseReceivedListener(handle);
  return () => {
    try {
      sub.remove();
    } catch {
      // ignore
    }
  };
}
