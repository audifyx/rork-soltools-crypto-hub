export interface FeedCacheItem {
  id: string;
  createdAt?: number | string | null;
}

export function dedupeFeedItems<T extends FeedCacheItem>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (!item?.id) return false;
    if (seen.has(item.id)) return false;

    seen.add(item.id);
    return true;
  });
}

export function sortFeedItems<T extends FeedCacheItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    return bTime - aTime;
  });
}

export function mergeFeedItems<T extends FeedCacheItem>(
  existing: T[],
  incoming: T[],
): T[] {
  return sortFeedItems(dedupeFeedItems([...incoming, ...existing]));
}
