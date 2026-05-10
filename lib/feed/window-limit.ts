export const DEFAULT_VISIBLE_FEED_ITEMS = 10;

export function increaseVisibleFeedItems(current = 10): number {
  return current + 10;
}
