import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export interface LocalNotificationInput {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let permissionAsked = false;

/** Requests local/push notification permissions once per app session. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!Device.isDevice) return true;

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (permissionAsked) return false;
  permissionAsked = true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Schedules an immediate local notification when allowed by the device. */
export async function scheduleLocalNotification(input: LocalNotificationInput): Promise<void> {
  const allowed = await ensureNotificationPermission();
  if (!allowed || Platform.OS === "web") return;
  await Notifications.scheduleNotificationAsync({
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
  if (Platform.OS === "web") return;
  await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count))).catch(() => {});
}
