export interface NotificationCacheItem {
  id: string;
  remoteId?: string | null;
  ts: number;
  unread?: boolean;
  read_at?: string | null;
}

export function dedupeNotifications<T extends NotificationCacheItem>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = item.remoteId || item.id;
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sortNotifications<T extends NotificationCacheItem>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.ts ?? 0) - Number(a.ts ?? 0));
}

export function reconcileNotifications<T extends NotificationCacheItem>(
  existing: T[],
  incoming: T[],
): T[] {
  return sortNotifications(dedupeNotifications([...incoming, ...existing]));
}

export function countUnreadNotifications<T extends NotificationCacheItem>(
  items: T[],
  locallyReadIds: Set<string>,
): number {
  return items.filter((item) => {
    const key = item.remoteId || item.id;
    if (!item.unread) return false;
    if (key && locallyReadIds.has(key)) return false;
    if (locallyReadIds.has(item.id)) return false;
    return true;
  }).length;
}
