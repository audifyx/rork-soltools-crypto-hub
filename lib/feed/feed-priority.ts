export function sortFeedPriority<T extends { score?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
}
