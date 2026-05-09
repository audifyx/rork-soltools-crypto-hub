export interface FeedEntity {
  id: string;
  created_at?: string | null;
  createdAt?: string | number | null;
  updated_at?: string | null;
  updatedAt?: string | number | null;
}

function getTimestamp(item: FeedEntity): number {
  const updated = item.updated_at ?? item.updatedAt;
  const created = item.created_at ?? item.createdAt;

  if (updated) return new Date(updated).getTime();
  if (created) return new Date(created).getTime();

  return 0;
}

export function dedupeFeed<T extends FeedEntity>(items: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of items) {
    const existing = map.get(item.id);

    if (!existing) {
      map.set(item.id, item);
      continue;
    }

    const existingTs = getTimestamp(existing);
    const nextTs = getTimestamp(item);

    map.set(item.id, nextTs >= existingTs ? { ...existing, ...item } : existing);
  }

  return Array.from(map.values()).sort((a, b) => getTimestamp(b) - getTimestamp(a));
}

export function mergeFeedPages<T extends FeedEntity>(
  currentPages: T[][],
  incomingPage: T[],
): T[][] {
  const flattened = currentPages.flat();
  const merged = dedupeFeed([...incomingPage, ...flattened]);

  return [merged];
}

export function prependFeedItem<T extends FeedEntity>(
  items: T[],
  item: T,
): T[] {
  return dedupeFeed([item, ...items]);
}

export function removeFeedItem<T extends FeedEntity>(
  items: T[],
  id: string,
): T[] {
  return items.filter((item) => item.id !== id);
}
