export type FeedItem = {
  id: string;
  title?: string;
  type?: string;
  timestamp?: number;
};

export function mergeFeeds(...feeds: FeedItem[][]): FeedItem[] {
  return feeds
    .flat()
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}
