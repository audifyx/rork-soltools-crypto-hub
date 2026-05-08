import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";
import {
  fetchWalletPortfolio,
  fetchWalletTokens,
  fetchWalletTransactions,
  isValidSolanaAddress,
  type WalletTokenHolding,
  type WalletTransaction,
} from "@/lib/api/wallet";

export type NewsCategory = "all" | "trending" | "meme" | "viral" | "kol";
export type NewsSentiment = "bullish" | "bearish" | "neutral";

export interface CryptoNewsItem {
  id: string;
  source: string;
  source_url?: string | null;
  title: string;
  description?: string | null;
  image_url?: string | null;
  category: NewsCategory;
  sentiment?: NewsSentiment | null;
  coin_mentions: string[];
  engagement: { likes: number; shares: number; comments: number };
  published_at: string;
  saved?: boolean;
}

interface RawNewsRow {
  id: string;
  source: string;
  source_url: string | null;
  title: string;
  description?: string | null;
  body?: string | null;
  image_url: string | null;
  category: string;
  sentiment: string | null;
  coin_mentions: string[] | null;
  engagement_likes: number | null;
  engagement_shares: number | null;
  engagement_comments: number | null;
  published_at: string;
}

export interface NewsFeedParams { category?: NewsCategory; limit?: number; before?: string | null }

type RssSource = { name: string; url: string; categoryHint?: Exclude<NewsCategory, "all"> };

const RSS_SOURCES: RssSource[] = [
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/.rss/full/" },
];

const BULLISH_RE = /(surge|rally|soar|pump|breakout|ath|moon|bull|adopt|approve|inflow|gain|launch|record|jumps|climbs)/i;
const BEARISH_RE = /(crash|plunge|dump|drop|decline|sell[- ]off|exploit|scam|rug|liquidat|bear|outflow|warning|delist|ban|lawsuit|charges)/i;
const MEME_RE = /(doge|shib|pepe|wif|bonk|floki|memecoin|meme coin|trump|brett|popcat)/i;
const KOL_RE = /(elon|musk|saylor|cz|vitalik|trump|cathie|hayes|cobie|kol|influencer|whale|founder|ceo)/i;

function scoreNews(item: CryptoNewsItem): number {
  const ageHours = Math.max(1, (Date.now() - new Date(item.published_at).getTime()) / 36e5);
  const engagement = item.engagement.likes + item.engagement.shares * 2.4 + item.engagement.comments * 1.8;
  const mentionsBoost = item.coin_mentions.length * 6;
  const viralBoost = item.category === "viral" ? 22 : 0;
  const memeBoost = item.category === "meme" ? 12 : 0;
  const kolBoost = item.category === "kol" ? 10 : 0;
  const sentimentBoost = item.sentiment === "bullish" ? 5 : item.sentiment === "bearish" ? 2 : 0;
  return engagement + mentionsBoost + viralBoost + memeBoost + kolBoost + sentimentBoost - ageHours * 1.75;
}

function rankNews(items: CryptoNewsItem[]): CryptoNewsItem[] {
  return items
    .map((item) => ({ item, score: scoreNews(item) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
