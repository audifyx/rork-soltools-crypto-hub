export const FEED_CATEGORIES = [
  'all',
  'trending',
  'memes',
  'solana',
  'ai',
  'macro',
  'whales',
  'kols',
  'news',
  'security',
];

export function normalizeFeedCategory(category: string): string {
  return category.toLowerCase().trim();
}
