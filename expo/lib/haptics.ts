import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Centralized haptic helpers that respect the user's `prefs.haptics` toggle.
 * The app provider keeps `enabled` in sync via `setHapticsEnabled`.
 */
let enabled: boolean = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function canFire(): boolean {
  if (!enabled) return false;
  if (Platform.OS === "web") return false;
  return true;
}

export function hapticSelect(): void {
  if (!canFire()) return;
  Haptics.selectionAsync().catch(() => {});
}

export function hapticLight(): void {
  if (!canFire()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticMedium(): void {
  if (!canFire()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticHeavy(): void {
  if (!canFire()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

export function hapticSuccess(): void {
  if (!canFire()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticWarning(): void {
  if (!canFire()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function hapticError(): void {
  if (!canFire()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
