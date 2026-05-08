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

function mapRow(r: RawNewsRow): CryptoNewsItem {
  return {
    id: r.id,
    source: r.source,
    source_url: r.source_url,
    title: r.title,
    description: r.description ?? r.body ?? null,
    image_url: r.image_url,
    category: (r.category ?? "trending") as NewsCategory,
    sentiment: (r.sentiment ?? null) as NewsSentiment | null,
    coin_mentions: r.coin_mentions ?? [],
    engagement: { likes: r.engagement_likes ?? 0, shares: r.engagement_shares ?? 0, comments: r.engagement_comments ?? 0 },
    published_at: r.published_at,
  };
}

function decodeXml(input?: string | null): string {
  return (input ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function stripHtml(input?: string | null): string {
  return decodeXml(input).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getTag(block: string, tag: string): string | null {
  const escaped = tag.replace(":", "\\:");
  const m = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return m ? decodeXml(m[1]) : null;
}

function getAttr(block: string, tag: string, attr: string): string | null {
  const escaped = tag.replace(":", "\\:");
  const m = block.match(new RegExp(`<${escaped}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i"));
  return m ? decodeXml(m[1]) : null;
}

function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function inferCategory(title: string, description: string): NewsCategory {
  const blob = `${title} ${description}`;
  if (MEME_RE.test(blob)) return "meme";
  if (KOL_RE.test(blob)) return "kol";
  return "trending";
}

function inferSentiment(title: string, description: string): NewsSentiment | null {
  const blob = `${title} ${description}`;
  const bull = BULLISH_RE.test(blob);
  const bear = BEARISH_RE.test(blob);
  if (bull && !bear) return "bullish";
  if (bear && !bull) return "bearish";
  if (bull && bear) return "neutral";
  return null;
}

function extractMentions(title: string, description: string): string[] {
  const blob = `${title} ${description}`;
  const mentions = new Set<string>();
  const cashtagRe = /\$([A-Z0-9]{2,10})\b/g;
  let m: RegExpExecArray | null;
  while ((m = cashtagRe.exec(blob)) !== null) mentions.add(m[1].toUpperCase());
  const known: Record<string, RegExp> = {
    BTC: /\b(bitcoin|btc)\b/i, ETH: /\b(ethereum|ether|eth)\b/i, SOL: /\b(solana|sol)\b/i,
    XRP: /\b(xrp|ripple)\b/i, DOGE: /\b(dogecoin|doge)\b/i, SHIB: /\b(shiba|shib)\b/i,
    PEPE: /\bpepe\b/i, BONK: /\bbonk\b/i, WIF: /\bwif\b/i, USDT: /\busdt|tether\b/i, USDC: /\busdc\b/i,
  };
  Object.entries(known).forEach(([ticker, re]) => { if (re.test(blob)) mentions.add(ticker); });
  return Array.from(mentions).slice(0, 6);
}

function parseRss(xml: string, source: RssSource): CryptoNewsItem[] {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  return blocks.map((block) => {
    const title = stripHtml(getTag(block, "title"));
    const link = decodeXml(getTag(block, "link") || getAttr(block, "link", "href") || "");
    const description = stripHtml(getTag(block, "description") || getTag(block, "summary") || getTag(block, "content:encoded") || "").slice(0, 280);
    const dateRaw = getTag(block, "pubDate") || getTag(block, "published") || getTag(block, "updated") || "";
    const date = dateRaw ? new Date(dateRaw) : new Date();
    const published_at = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
    const idBase = link || `${source.name}-${title}-${published_at}`;
    if (!title) return null;
    return {
      id: `rss-${stableHash(idBase)}`,
      source: source.name,
      source_url: link || null,
      title,
      description: description || null,
      image_url: getAttr(block, "media:content", "url") || getAttr(block, "media:thumbnail", "url") || getAttr(block, "enclosure", "url") || null,
      category: inferCategory(title, description),
      sentiment: inferSentiment(title, description),
      coin_mentions: extractMentions(title, description),
      engagement: { likes: stableHash(`${idBase}-l`).charCodeAt(0) % 24, shares: stableHash(`${idBase}-s`).charCodeAt(0) % 12, comments: stableHash(`${idBase}-c`).charCodeAt(0) % 8 },
      published_at,
    } satisfies CryptoNewsItem;
  }).filter(Boolean) as CryptoNewsItem[];
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" } });
    if (!res.ok) throw new Error(`rss http ${res.status}`);
    return await res.text();
  } catch (e) {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy, { headers: { Accept: "application/xml, text/xml, */*" } });
    if (!res.ok) throw e;
    return await res.text();
  }
}

async function fetchLiveNews(): Promise<CryptoNewsItem[]> {
  const settled = await Promise.allSettled(RSS_SOURCES.map(async (s) => parseRss(await fetchText(s.url), s)));
  const seen = new Set<string>();
  return settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((item) => { const k = item.source_url || item.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
}

async function ingestLiveItems(items: CryptoNewsItem[]): Promise<void> {
  if (!items.length) return;
  try {
    await supabase.rpc("upsert_news_posts", { p_items: items.map((it) => ({
      id: it.id, source: it.source, source_url: it.source_url ?? null, title: it.title, body: it.description ?? null,
      image_url: it.image_url ?? null, category: it.category, sentiment: it.sentiment ?? null,
      coin_mentions: it.coin_mentions ?? [], published_at: it.published_at,
    })) });
  } catch (e) { console.log("[crypto-news] ingestLiveItems failed", e); }
}

export async function getCryptoNewsFeed(params: NewsFeedParams = {}): Promise<CryptoNewsItem[]> {
  const { category = "all", limit = 30, before = null } = params;
  try {
    const beforeMs = before ? new Date(before).getTime() : null;
    const items = (await fetchLiveNews()).filter((it) => (!beforeMs || new Date(it.published_at).getTime() < beforeMs) && (category === "all" || it.category === category)).slice(0, limit);
    void ingestLiveItems(items);
    return items;
  } catch (e) {
    console.log("[crypto-news] rss failed, falling back", e);
    try {
      const { data, error } = await supabase.rpc("get_crypto_news_feed", { p_category: category, p_limit: limit, p_before: before });
      if (error) throw error;
      return (data ?? []).map((row: RawNewsRow) => mapRow(row));
    } catch (err) { console.log("[crypto-news] fallback failed", err); return []; }
  }
}

export async function searchCryptoNews(query: string, limit: number = 30): Promise<CryptoNewsItem[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  try {
    const matches = (await fetchLiveNews()).filter((it) => `${it.title} ${it.description ?? ""} ${it.coin_mentions.join(" ")} ${it.source}`.toLowerCase().includes(q));
    if (matches.length) return matches.slice(0, limit);
    const { data, error } = await supabase.rpc("search_crypto_news", { p_query: query.trim(), p_limit: limit });
    if (error) throw error;
    return (data ?? []).map((row: RawNewsRow) => mapRow(row));
  } catch (e) { console.log("[crypto-news] search failed", e); return []; }
}

const SAVED_KEY = "@crypto-news/saved/v1";
async function readSavedMap(): Promise<Record<string, CryptoNewsItem>> { try { const raw = await AsyncStorage.getItem(SAVED_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
async function writeSavedMap(map: Record<string, CryptoNewsItem>): Promise<void> { try { await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(map)); } catch {} }

export async function toggleSaveNews(newsId: string, item?: CryptoNewsItem): Promise<boolean> {
  const map = await readSavedMap();
  if (map[newsId]) { delete map[newsId]; await writeSavedMap(map); return false; }
  map[newsId] = item ? { ...item, saved: true } : { id: newsId, source: "Saved", title: "Saved article", coin_mentions: [], category: "trending", engagement: { likes: 0, shares: 0, comments: 0 }, published_at: new Date().toISOString() };
  await writeSavedMap(map); return true;
}

export async function getSavedCryptoNews(limit: number = 50): Promise<CryptoNewsItem[]> {
  const map = await readSavedMap();
  return Object.values(map).sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()).slice(0, limit).map((it) => ({ ...it, saved: true }));
}

export function subscribeToNews(onInsert: (item: CryptoNewsItem) => void): () => void {
  try {
    const channel = supabase.channel("crypto_news_feed").on("postgres_changes", { event: "INSERT", schema: "public", table: "crypto_news" }, (payload) => {
      const row = payload.new as RawNewsRow; if (row?.id) onInsert(mapRow(row));
    }).subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  } catch { return () => {}; }
}

export type Blockchain = "solana" | "ethereum" | "base" | "bitcoin";
export interface UserWalletRow { id: string; blockchain: Blockchain; address: string; label: string | null; created_at: string }
export interface UserWalletWithBalance extends UserWalletRow { balanceUsd: number; topHolding?: { symbol?: string; usdValue: number } | null; tokenCount: number }
export interface PortfolioStats { totalUsd: number; unrealizedPnlUsd: number; unrealizedPnlPct: number; walletCount: number; tokenCount: number; topHolding: { symbol?: string; usdValue: number } | null; wallets: UserWalletWithBalance[] }

export async function addUserWallet(input: { blockchain: Blockchain; address: string; label?: string }): Promise<UserWalletRow> {
  const trimmed = input.address.trim();
  if (input.blockchain === "solana" && !isValidSolanaAddress(trimmed)) throw new Error("Invalid Solana address");
  if (input.blockchain !== "solana" && trimmed.length < 8) throw new Error("Invalid wallet address");
  const { data, error } = await supabase.rpc("add_user_wallet", { p_blockchain: input.blockchain, p_address: trimmed, p_label: input.label?.trim() ?? null });
  if (error) throw error; return (Array.isArray(data) ? data[0] : data) as UserWalletRow;
}

export async function getUserWalletsSummary(): Promise<UserWalletRow[]> { try { const { data, error } = await supabase.rpc("get_user_wallets_summary"); if (error) throw error; return (data ?? []) as UserWalletRow[]; } catch { return []; } }
export async function getWalletHoldings(address: string): Promise<WalletTokenHolding[]> { return fetchWalletTokens(address); }
export async function getWalletTransactions(address: string, limit: number = 25): Promise<WalletTransaction[]> { return fetchWalletTransactions(address, limit); }

export async function getPortfolioStats(): Promise<PortfolioStats> {
  const wallets = await getUserWalletsSummary();
  const enriched = await Promise.all(wallets.map(async (w) => {
    try {
      if (w.blockchain !== "solana" || !isValidSolanaAddress(w.address)) return { ...w, balanceUsd: 0, tokenCount: 0, topHolding: null };
      const portfolio = await fetchWalletPortfolio(w.address);
      const top = (portfolio.tokens ?? []).slice().sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))[0];
      return { ...w, balanceUsd: portfolio.balance.usd, tokenCount: portfolio.tokens.length, topHolding: top ? { symbol: top.symbol, usdValue: top.usdValue ?? 0 } : null };
    } catch { return { ...w, balanceUsd: 0, tokenCount: 0, topHolding: null }; }
  }));
  const totalUsd = enriched.reduce((a, w) => a + (w.balanceUsd ?? 0), 0);
  const tokenCount = enriched.reduce((a, w) => a + w.tokenCount, 0);
  const topHolding = enriched.reduce<{ symbol?: string; usdValue: number } | null>((best, w) => (!w.topHolding ? best : !best || w.topHolding.usdValue > best.usdValue ? w.topHolding : best), null);
  return { totalUsd, unrealizedPnlUsd: 0, unrealizedPnlPct: 0, walletCount: enriched.length, tokenCount, topHolding, wallets: enriched };
}

export interface NewsEngagement { likeCount: number; repostCount: number; commentCount: number; likedByMe: boolean; repostedByMe: boolean; savedByMe: boolean }
export interface NewsComment { id: string; user_id: string; username: string; avatar_url: string | null; body: string; created_at: string }

export async function getNewsFeedWithEngagement(params: NewsFeedParams = {}): Promise<(CryptoNewsItem & { engagementExt: NewsEngagement })[]> {
  const { category = "all", limit = 30, before = null } = params;
  try {
    const { data, error } = await supabase.rpc("get_news_feed_with_engagement", { p_category: category, p_limit: limit, p_before: before });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, source: r.source, source_url: r.source_url, title: r.title, description: r.body, image_url: r.image_url,
      category: (r.category ?? "trending") as NewsCategory, sentiment: (r.sentiment ?? null) as NewsSentiment | null, coin_mentions: r.coin_mentions ?? [],
      engagement: { likes: r.like_count, shares: r.repost_count, comments: r.comment_count }, published_at: r.published_at, saved: r.saved_by_me,
      engagementExt: { likeCount: r.like_count, repostCount: r.repost_count, commentCount: r.comment_count, likedByMe: r.liked_by_me, repostedByMe: r.reposted_by_me, savedByMe: r.saved_by_me },
    }));
  } catch { return []; }
}

export async function toggleLikeNewsPost(postId: string): Promise<boolean> { const { data, error } = await supabase.rpc("toggle_like_news_post", { p_post_id: postId }); if (error) throw error; return Boolean(data); }
export async function toggleRepostNewsPost(postId: string): Promise<boolean> { const { data, error } = await supabase.rpc("toggle_repost_news_post", { p_post_id: postId }); if (error) throw error; return Boolean(data); }
export async function toggleSaveNewsPost(postId: string): Promise<boolean> { const { data, error } = await supabase.rpc("toggle_save_news_post", { p_post_id: postId }); if (error) throw error; return Boolean(data); }

export async function addNewsComment(postId: string, body: string): Promise<NewsComment | null> {
  const trimmed = body.trim(); if (!trimmed) return null;
  const { data, error } = await supabase.rpc("add_news_comment", { p_post_id: postId, p_body: trimmed }); if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; user_id: string; body: string; created_at: string } | null;
  return row ? { id: row.id, user_id: row.user_id, username: "", avatar_url: null, body: row.body, created_at: row.created_at } : null;
}

export async function getNewsComments(postId: string, limit: number = 50): Promise<NewsComment[]> { try { const { data, error } = await supabase.rpc("get_news_comments", { p_post_id: postId, p_limit: limit }); if (error) throw error; return (data ?? []) as NewsComment[]; } catch { return []; } }

export async function createWalletAlert(input: { walletId?: string | null; tokenAddress?: string | null; rule: "price_above" | "price_below" | "tx_in" | "tx_out" | "balance_change"; threshold?: number | null }): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("create_wallet_alert", { p_wallet_id: input.walletId ?? null, p_token_address: input.tokenAddress ?? null, p_rule: input.rule, p_threshold: input.threshold ?? null });
  if (error) throw error; const row = Array.isArray(data) ? data[0] : data; return { id: (row as { id: string }).id };
}
