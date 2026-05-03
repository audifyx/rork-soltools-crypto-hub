import type { Href } from "expo-router";

export type RouterWithBack = {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: Href) => void;
};

/**
 * Navigates back when history exists, otherwise replaces with a safe parent route.
 * This keeps deep links and refreshed previews from trapping users on detail pages.
 */
export function navigateBack(router: RouterWithBack, fallback: Href = "/(tabs)/home"): void {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // Router history may be unavailable during a cold deep-link load; use fallback below.
  }

  router.replace(fallback);
}
