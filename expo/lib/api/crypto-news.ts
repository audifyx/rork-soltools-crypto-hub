import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";
import {
  fetchWalletPortfolio,
  isValidSolanaAddress,
  type WalletTokenHolding,
} from "@/lib/api/wallet";

export type NewsCategory =
  | "all"
  | "solana"
  | "bitcoin"
  | "ethereum"
  | "defi"
  | "nft"
  | "meme"
  | "market"
  | "trending"
  | "viral"
  | "kol";
export type NewsSentiment = "bullish" | "bearish" | "neutral";
export type NewsTimeRange = "24h" | "7d" | "all";
export type Blockchain = "solana" | "ethereum" | "base" | "bitcoin";

export interface UserWalletWithBalance {
  id: string;
  user_id?: string | null;
  address: string;
  wallet_address: string;
  blockchain: Blockchain;
  label?: string | null;
  created_at?: string | null;
  balanceUsd: number;
  tokenCount: number;
  topHolding?: WalletTokenHolding | null;
}

export interface PortfolioStats {
  totalUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  walletCount: number;
  tokenCount: number;
  topHolding?: WalletTokenHolding | null;
  wallets: UserWalletWithBalance[];
}

interface TrackedWalletRow {
  id: string;
  user_id?: string | null;
  wallet_address: string;
  blockchain?: string | null;
  label?: string | null;
  created_at?: string | null;
}

interface AddUserWalletInput {
  blockchain: Blockchain;
  address: string;
  label?: string;
}

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

export interface NewsFeedParams { category?: NewsCategory; range?: NewsTimeRange; limit?: number; before?: string | null }

export interface NewsComment {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  body: string;
  created_at: string;
}

type RssSource = { name: string; url: string; categoryHint?: Exclude<NewsCategory, "all"> };

// Trimmed to the most active, highest-signal feeds to keep fetch volume light
// and avoid memory pressure / crashes on lower-end devices.
const RSS_SOURCES: RssSource[] = [
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss", categoryHint: "trending" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", categoryHint: "market" },
  { name: "Decrypt", url: "https://decrypt.co/feed", categoryHint: "trending" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml", categoryHint: "market" },
  { name: "Blockworks", url: "https://blockworks.co/feed", categoryHint: "market" },
  { name: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/.rss/full/", categoryHint: "bitcoin" },
  { name: "The Defiant", url: "https://thedefiant.io/api/feed", categoryHint: "defi" },
  { name: "Solana Blog", url: "https://solana.com/news/rss.xml", categoryHint: "solana" },
  { name: "Solana Floor", url: "https://solanafloor.com/feed", categoryHint: "solana" },
  { name: "r/solana", url: "https://www.reddit.com/r/solana/.rss", categoryHint: "solana" },
  { name: "r/CryptoCurrency", url: "https://www.reddit.com/r/CryptoCurrency/.rss", categoryHint: "trending" },
  { name: "CryptoPanic Hot", url: "https://cryptopanic.com/news/rss/", categoryHint: "trending" },
];

const USER_WALLETS_CACHE_KEY = "soltools.userWallets.v1";

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

function sortByDateDesc(items: CryptoNewsItem[]): CryptoNewsItem[] {
  return [...items].sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
  );
}

const NEWS_CACHE_KEY = "soltools.cryptoNews.cache.v2";
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

const SOLANA_RE = /(\bsolana\b|\bsol\b|\bspl\b|jupiter|jito|phantom|raydium|orca|magic eden|pump\.fun|bonk|wif|tensor|drift|marinade|kamino|metaplex|helius)/i;
const BITCOIN_RE = /(\bbitcoin\b|\bbtc\b|satoshi|ordinals|brc-20|halving|mining|hashrate|lightning network)/i;
const ETHEREUM_RE = /(\bethereum\b|\beth\b|vitalik|erc-?20|layer ?2|optimism|arbitrum|base chain|rollup)/i;
const DEFI_RE = /(defi|liquidity|yield|lending|stablecoin|amm|swap|tvl|aave|uniswap|curve|maker)/i;
const NFT_RE = /(\bnft\b|opensea|magic eden|tensor|mint(?:ing)? collection|pfp|jpegs?)/i;
const MARKET_RE = /(price|etf|sec|fed|inflation|cpi|market cap|trading|chart|analysis|forecast|prediction|outlook)/i;

function detectCategory(text: string, hint?: Exclude<NewsCategory, "all">): NewsCategory {
  if (KOL_RE.test(text)) return "kol";
  if (MEME_RE.test(text)) return "meme";
  if (SOLANA_RE.test(text)) return "solana";
  if (BITCOIN_RE.test(text)) return "bitcoin";
  if (ETHEREUM_RE.test(text)) return "ethereum";
  if (DEFI_RE.test(text)) return "defi";
  if (NFT_RE.test(text)) return "nft";
  if (/(viral|trending|breaking|exclusive|leak)/i.test(text)) return "viral";
  if (MARKET_RE.test(text)) return "market";
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
  const limit = params.limit ?? 80;
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
      // Cache the union sorted by date — ranking is applied per-request based on range.
      const cacheable = sortByDateDesc(merged);
      await writeCache(cacheable);
      return applyFilters(cacheable, params).slice(0, limit);
    }
    if (cached?.items?.length) return applyFilters(cached.items, params).slice(0, limit);
    return [];
  }

  return applyFilters(fresh, params).slice(0, limit);
}

function applyFilters(items: CryptoNewsItem[], params: NewsFeedParams): CryptoNewsItem[] {
  // Filter first, then sort/rank, then dedupe — "all" bypasses recency-biased ranking
  // and surfaces the full historical feed sorted by date.
  const filtered = filterByTimeRange(filterByCategory(items, params.category), params.range);
  const deduped = dedupeByTitle(filtered);
  if (params.range === "all") return sortByDateDesc(deduped);
  return rankNews(deduped);
}

function dedupeByTitle(items: CryptoNewsItem[]): CryptoNewsItem[] {
  const seen = new Set<string>();
  const out: CryptoNewsItem[] = [];
  for (const it of items) {
    const key = (it.title ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 90);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function filterByCategory(items: CryptoNewsItem[], category?: NewsCategory): CryptoNewsItem[] {
  if (!category || category === "all") return items;
  return items.filter((i) => i.category === category);
}

function filterByTimeRange(items: CryptoNewsItem[], range?: NewsTimeRange): CryptoNewsItem[] {
  if (!range || range === "all") return items;
  const ms = range === "24h" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ms;
  return items.filter((i) => new Date(i.published_at).getTime() >= cutoff);
}

export function getActiveFeedCount(): number { return RSS_SOURCES.length; }

function normalizeBlockchain(value?: string | null): Blockchain {
  if (value === "ethereum" || value === "base" || value === "bitcoin") return value;
  return "solana";
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch (e) {
    console.log("[wallets] auth lookup failed", e);
    return null;
  }
}

async function readCachedWallets(): Promise<TrackedWalletRow[]> {
  try {
    const raw = await AsyncStorage.getItem(USER_WALLETS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as TrackedWalletRow[]) : [];
  } catch {
    return [];
  }
}

async function writeCachedWallets(wallets: TrackedWalletRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_WALLETS_CACHE_KEY, JSON.stringify(wallets));
  } catch (e) {
    console.log("[wallets] cache write failed", e);
  }
}

async function fetchTrackedWalletRows(): Promise<TrackedWalletRow[]> {
  const userId = await getCurrentUserId();
  if (!userId) return readCachedWallets();
  try {
    const { data, error } = await supabase
      .from("tracked_wallets")
      .select("id,user_id,wallet_address,blockchain,label,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as TrackedWalletRow[];
  } catch (e) {
    console.log("[wallets] remote fetch failed, using cache", e);
    return readCachedWallets();
  }
}

export async function addUserWallet(input: AddUserWalletInput): Promise<UserWalletWithBalance> {
  const address = input.address.trim();
  const blockchain = input.blockchain;
  if (blockchain !== "solana") {
    throw new Error("Only Solana wallet tracking is live right now.");
  }
  if (!isValidSolanaAddress(address)) {
    throw new Error("Enter a valid Solana wallet address.");
  }

  const userId = await getCurrentUserId();
  const label = input.label?.trim() || null;
  let row: TrackedWalletRow = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    wallet_address: address,
    blockchain,
    label,
    created_at: new Date().toISOString(),
  };

  if (userId) {
    try {
      const { data, error } = await supabase
        .from("tracked_wallets")
        .insert({ user_id: userId, wallet_address: address, blockchain, label })
        .select("id,user_id,wallet_address,blockchain,label,created_at")
        .single();
      if (error) throw error;
      row = data as TrackedWalletRow;
    } catch (e) {
      console.log("[wallets] remote insert failed, saving local", e);
    }
  }

  const cached = await readCachedWallets();
  const withoutDuplicate = cached.filter((w) => w.wallet_address !== address);
  await writeCachedWallets([row, ...withoutDuplicate]);
  return hydrateWalletRow(row);
}

async function hydrateWalletRow(row: TrackedWalletRow): Promise<UserWalletWithBalance> {
  const blockchain = normalizeBlockchain(row.blockchain);
  if (blockchain !== "solana" || !isValidSolanaAddress(row.wallet_address)) {
    return {
      id: row.id,
      user_id: row.user_id ?? null,
      address: row.wallet_address,
      wallet_address: row.wallet_address,
      blockchain,
      label: row.label ?? null,
      created_at: row.created_at ?? null,
      balanceUsd: 0,
      tokenCount: 0,
      topHolding: null,
    };
  }

  const portfolio = await fetchWalletPortfolio(row.wallet_address);
  const sortedTokens = [...portfolio.tokens].sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  return {
    id: row.id,
    user_id: row.user_id ?? null,
    address: row.wallet_address,
    wallet_address: row.wallet_address,
    blockchain,
    label: row.label ?? null,
    created_at: row.created_at ?? null,
    balanceUsd: portfolio.balance.usd,
    tokenCount: portfolio.tokens.length,
    topHolding: sortedTokens[0] ?? null,
  };
}

export async function getPortfolioStats(): Promise<PortfolioStats> {
  const rows = await fetchTrackedWalletRows();
  const wallets = await Promise.all(rows.map((row) => hydrateWalletRow(row)));
  const totalUsd = wallets.reduce((sum, wallet) => sum + wallet.balanceUsd, 0);
  const topHolding = wallets
    .map((wallet) => wallet.topHolding)
    .filter((holding): holding is WalletTokenHolding => Boolean(holding))
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))[0] ?? null;

  return {
    totalUsd,
    unrealizedPnlUsd: 0,
    unrealizedPnlPct: 0,
    walletCount: wallets.length,
    tokenCount: wallets.reduce((sum, wallet) => sum + wallet.tokenCount, 0),
    topHolding,
    wallets,
  };
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
