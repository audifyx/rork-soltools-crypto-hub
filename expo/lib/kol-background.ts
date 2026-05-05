/**
 * Background fetch registration for KOL transaction sync.
 *
 * Defines a TaskManager task that runs `syncKOLTransactions` and registers it
 * with `expo-background-fetch`. Background fetch is iOS/Android only — on web
 * the helpers no-op safely so callers can invoke them unconditionally.
 *
 * Note: in Expo Go the OS may throttle or disable background execution; this
 * is expected and handled gracefully.
 */
import { Platform } from "react-native";

import { supportsBackgroundSync, syncKOLTransactions } from "@/lib/kol-transaction-sync";

const KOL_SYNC_TASK = "kol-transaction-sync";

let taskDefined = false;
let registered = false;

function defineTaskIfNeeded(): void {
  if (taskDefined) return;
  if (!supportsBackgroundSync) return;
  try {
    // Lazy require so web bundles don't pull native-only modules.
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    const BackgroundFetch =
      require("expo-background-fetch") as typeof import("expo-background-fetch");
    if (TaskManager.isTaskDefined(KOL_SYNC_TASK)) {
      taskDefined = true;
      return;
    }
    TaskManager.defineTask(KOL_SYNC_TASK, async () => {
      try {
        const result = await syncKOLTransactions();
        return result.ok && result.inserted > 0
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch (e) {
        console.log("[kol-bg] task failed", e);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
    taskDefined = true;
  } catch (e) {
    console.log("[kol-bg] defineTask skipped", e);
  }
}

/**
 * Register the KOL background sync task. Safe to call multiple times — only
 * the first call performs work. Resolves silently on unsupported platforms.
 */
export async function registerKOLSync(): Promise<void> {
  if (registered) return;
  if (!supportsBackgroundSync) return;
  if (Platform.OS === "web") return;
  defineTaskIfNeeded();
  try {
    const BackgroundFetch =
      require("expo-background-fetch") as typeof import("expo-background-fetch");
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      console.log("[kol-bg] background fetch unavailable", status);
      return;
    }
    await BackgroundFetch.registerTaskAsync(KOL_SYNC_TASK, {
      minimumInterval: 5 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    registered = true;
  } catch (e) {
    console.log("[kol-bg] register failed", e);
  }
}

/** Unregister the background sync task. Used for tests / sign-out flows. */
export async function unregisterKOLSync(): Promise<void> {
  if (!supportsBackgroundSync) return;
  try {
    const BackgroundFetch =
      require("expo-background-fetch") as typeof import("expo-background-fetch");
    await BackgroundFetch.unregisterTaskAsync(KOL_SYNC_TASK);
    registered = false;
  } catch (e) {
    console.log("[kol-bg] unregister failed", e);
  }
}

export { KOL_SYNC_TASK };
