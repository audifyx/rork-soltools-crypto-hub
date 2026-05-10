export function limitFeedItems<T>(items: T[], limit = 25): T[] {
  return items.slice(0, limit);
}

export function removeEmptyFeedItems<T extends { title?: string }>(items: T[]): T[] {
  return items.filter((item) => Boolean(item.title));
}
