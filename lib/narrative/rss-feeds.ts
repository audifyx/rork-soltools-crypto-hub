export type NarrativeFeedCategory =
  | 'crypto'
  | 'solana'
  | 'macro'
  | 'politics'
  | 'ai'
  | 'memes'
  | 'security'
  | 'markets';

export type NarrativeRSSFeed = {
  id: string;
  name: string;
  category: NarrativeFeedCategory;
  url: string;
};

export const NARRATIVE_RSS_FEEDS: NarrativeRSSFeed[] = [
  {
    id: 'coindesk',
    name: 'CoinDesk',
    category: 'crypto',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
  },
  {
    id: 'cointelegraph',
    name: 'Cointelegraph',
    category: 'crypto',
    url: 'https://cointelegraph.com/rss',
  },
  {
    id: 'decrypt',
    name: 'Decrypt',
    category: 'crypto',
    url: 'https://decrypt.co/feed',
  },
  {
    id: 'blockworks',
    name: 'Blockworks',
    category: 'crypto',
    url: 'https://blockworks.co/feed',
  },
  {
    id: 'bitcoin-magazine',
    name: 'Bitcoin Magazine',
    category: 'crypto',
    url: 'https://bitcoinmagazine.com/.rss/full/',
  },
  {
    id: 'solana-floor',
    name: 'SolanaFloor',
    category: 'solana',
    url: 'https://solanafloor.com/feed',
  },
  {
    id: 'solana-compass',
    name: 'Solana Compass',
    category: 'solana',
    url: 'https://solanacompass.com/rss.xml',
  },
  {
    id: 'reuters-markets',
    name: 'Reuters Markets',
    category: 'markets',
    url: 'https://feeds.reuters.com/reuters/businessNews',
  },
  {
    id: 'cnbc',
    name: 'CNBC',
    category: 'markets',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  },
  {
    id: 'tesla-news',
    name: 'Tesla News',
    category: 'ai',
    url: 'https://www.teslarati.com/feed/',
  },
  {
    id: 'ai-news',
    name: 'OpenAI News',
    category: 'ai',
    url: 'https://openai.com/news/rss.xml',
  },
  {
    id: 'security',
    name: 'The Hacker News',
    category: 'security',
    url: 'https://feeds.feedburner.com/TheHackersNews',
  },
  {
    id: 'politics',
    name: 'Politico',
    category: 'politics',
    url: 'https://rss.politico.com/politics-news.xml',
  },
  {
    id: 'fox-business',
    name: 'Fox Business',
    category: 'markets',
    url: 'https://moxie.foxbusiness.com/google-publisher/markets.xml',
  },
  {
    id: 'meme-news',
    name: 'Know Your Meme',
    category: 'memes',
    url: 'https://knowyourmeme.com/feed',
  },
];
