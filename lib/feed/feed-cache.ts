export type FeedCacheEntry<T> = {
  data: T;
  createdAt: number;
};

export function isFeedCacheValid(createdAt: number, ttl = 60000): boolean {
  return Date.now() - createdAt < ttl;
}
