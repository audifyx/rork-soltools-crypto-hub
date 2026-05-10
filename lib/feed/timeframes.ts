export const FEED_TIMEFRAMES = ['1H', '24H', '7D', '30D', 'ALL'] as const;

export type FeedTimeframe = (typeof FEED_TIMEFRAMES)[number];

export function createFeedCacheKey(timeframe: FeedTimeframe): string {
  return `feed:${timeframe.toLowerCase()}`;
}

export function shouldBypassTimeFilter(timeframe: FeedTimeframe): boolean {
  return timeframe === 'ALL';
}

export function resetFeedPage(): number {
  return 1;
}
