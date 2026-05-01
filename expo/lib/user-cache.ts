import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Per-user namespaced AsyncStorage keys. Bumping the version (v3)
 * ensures stale shared caches from older builds don't leak between
 * accounts after upgrade.
 */
const NS = (base: string, scope: string) => `soltools.${base}.v3.${scope}`;

export const userKeys = (scope: string) => ({
  posts: NS("posts", scope),
  watch: NS("watch", scope),
  alerts: NS("alerts", scope),
  wallets: NS("wallets", scope),
  profile: NS("profile", scope),
  prefs: NS("prefs", scope),
  follows: NS("follows", scope),
});

/**
 * Wipe every soltools.* AsyncStorage key. Used on sign-out so a
 * different account never sees the previous user's cached data.
 */
export async function clearAllUserCache(): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const ours = all.filter((k) => k.startsWith("soltools."));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch (e) {
    console.log("[user-cache] clear failed", e);
  }
}
