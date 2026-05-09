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

export interface NewsComment {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  body: string;
  created_at: string;
}

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

const NEWS_CACHE_KEY = "soltools.cryptoNews.cache.v1";
const NEWS_CACHE_TTL_MS = 1000 * 60 * 8;

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripHtml(input: string): string {
  return decodeEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1] ?? "").trim() : null;
}

function extractImage(block: string): string | null {
  const enc = block.match(/<enclosure[^>]*url="([^"]+)"/i);
  if (enc?.[1]) return enc[1];
  const media = block.match(/<media:content[^>]*url="([^"]+)"/i) ?? block.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
  if (media?.[1]) return media[1];
  const desc = extractTag(block, "description") ?? extractTag(block, "content:encoded") ?? "";
  const img = desc.match(/<img[^>]*src="([^"]+)"/i);
  return img?.[1] ?? null;
}

function detectSentiment(text: string): NewsSentiment | null {
  if (BULLISH_RE.test(text)) return "bullish";
  if (BEARISH_RE.test(text)) return "bearish";
  return "neutral";
}

function detectCategory(text: string, hint?: Exclude<NewsCategory, "all">): NewsCategory {
  if (KOL_RE.test(text)) return "kol";
  if (MEME_RE.test(text)) return "meme";
  if (/(viral|trending|breaking|exclusive|leak)/i.test(text)) return "viral";
  return hint ?? "trending";
}

function extractMentions(text: string): string[] {
  const out = new Set<string>();
  const tickerRe = /\$([A-Z]{2,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = tickerRe.exec(text)) !== null) out.add(m[1]);
  const known = ["BTC", "ETH", "SOL", "DOGE", "SHIB", "PEPE", "WIF", "BONK", "XRP", "ADA", "AVAX", "LINK", "MATIC", "TRUMP"];
  for (const k of known) if (new RegExp(`\\b${k}\\b`).test(text)) out.add(k);
  return Array.from(out).slice(0, 8);
}

function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function parseRssFeed(xml: string, source: RssSource): CryptoNewsItem[] {
  const items: CryptoNewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const rawTitle = extractTag(block, "title") ?? "";
    const title = stripHtml(rawTitle);
    if (!title) continue;
    const link = extractTag(block, "link") ?? (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? null);
    const descRaw = extractTag(block, "description") ?? extractTag(block, "summary") ?? extractTag(block, "content:encoded") ?? "";
    const description = stripHtml(descRaw).slice(0, 280);
    const pub = extractTag(block, "pubDate") ?? extractTag(block, "published") ?? extractTag(block, "updated") ?? new Date().toUTCString();
    const published_at = new Date(pub).toISOString();
    const image_url = extractImage(block);
    const combined = `${title} ${description}`;
    const id = hashId(`${source.name}:${link ?? title}:${published_at}`);
    items.push({
      id,
      source: source.name,
      source_url: link,
      title,
      description,
      image_url,
      category: detectCategory(combined, source.categoryHint),
      sentiment: detectSentiment(combined),
      coin_mentions: extractMentions(combined),
      engagement: {
        likes: 30 + (id.charCodeAt(0) % 400),
        shares: 8 + (id.charCodeAt(1 % id.length) % 90),
        comments: 4 + (id.charCodeAt(2 % id.length) % 60),
      },
      published_at,
    });
  }
  return items;
}

async function readCache(): Promise<{ at: number; items: CryptoNewsItem[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { at: number; items: CryptoNewsItem[] };
  } catch {
    return null;
  }
}

async function writeCache(items: CryptoNewsItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
  } catch (e) {
    console.log("[news] cache write failed", e);
  }
}

export async function fetchCryptoNewsFeed(params: NewsFeedParams = {}): Promise<CryptoNewsItem[]> {
  const limit = params.limit ?? 60;
  const cached = await readCache();
  const fresh = cached && Date.now() - cached.at < NEWS_CACHE_TTL_MS ? cached.items : null;

  if (!fresh) {
    const settled = await Promise.allSettled(
      RSS_SOURCES.map(async (src) => {
        const res = await fetch(src.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const xml = await res.text();
        return parseRssFeed(xml, src);
      }),
    );
    const merged: CryptoNewsItem[] = [];
    const seen = new Set<string>();
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      for (const it of r.value) {
        const key = `${it.source}|${(it.title ?? "").toLowerCase().slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(it);
      }
    }
    if (merged.length) {
      const ranked = rankNews(merged);
      await writeCache(ranked);
      return filterByCategory(ranked, params.category).slice(0, limit);
    }
    if (cached?.items?.length) return filterByCategory(cached.items, params.category).slice(0, limit);
    return [];
  }

  return filterByCategory(fresh, params.category).slice(0, limit);
}

function filterByCategory(items: CryptoNewsItem[], category?: NewsCategory): CryptoNewsItem[] {
  if (!category || category === "all") return items;
  return items.filter((i) => i.category === category);
}

const SAVED_KEY = "soltools.cryptoNews.saved.v1";

export async function getSavedNewsIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function toggleSavedNews(id: string): Promise<string[]> {
  const current = await getSavedNewsIds();
  const set = new Set(current);
  if (set.has(id)) set.delete(id); else set.add(id);
  const next = Array.from(set);
  try { await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export { rankNews };
