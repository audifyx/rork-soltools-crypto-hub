import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import type * as NotificationsType from "expo-notifications";

export interface LocalNotificationInput {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
}

let permissionAsked = false;
let handlerConfigured = false;

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
