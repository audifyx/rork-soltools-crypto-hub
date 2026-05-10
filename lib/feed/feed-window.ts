export function getFeedWindow<T>(items: T[], limit = 10): T[] {
  return items.slice(0, limit);
}

export function appendFeedWindow(current = 10, step = 10): number {
  return current + step;
}
