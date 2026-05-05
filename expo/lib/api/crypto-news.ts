/**
 * Crypto news + portfolio tracker API layer.
 *
 * Backed by Supabase RPCs (see migration 20260504_crypto_news_wallets.sql)
 * and the on-chain wallet helpers in `@/lib/api/wallet`. External feeds
 * (Twitter/Reddit/CoinGecko/Moralis/Alchemy/Solscan) plug in here as
 * additional sources for `getCryptoNewsFeed` / wallet enrichment.
 */
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
  engagement: {
    likes: number;
    shares: number;
    comments: number;
  };
  published_at: string;
  saved?: boolean;
}

interface RawNewsRow {
  id: string;
  source: string;
  source_url: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  category: string;
  sentiment: string | null;
  coin_mentions: string[] | null;
  engagement_likes: number | null;
  engagement_shares: number | null;
  engagement_comments: number | null;
  published_at: string;
}

function mapRow(r: RawNewsRow): CryptoNewsItem {
  const cat = (r.category ?? "trending") as NewsCategory;
  const sent = (r.sentiment ?? null) as NewsSentiment | null;
  return {
    id: r.id,
    source: r.source,
    source_url: r.source_url,
    title: r.title,
    description: r.description,
    image_url: r.image_url,
    category: cat,
    sentiment: sent,
    coin_mentions: r.coin_mentions ?? [],
    engagement: {
      likes: r.engagement_likes ?? 0,
      shares: r.engagement_shares ?? 0,
      comments: r.engagement_comments ?? 0,
    },
    published_at: r.published_at,
  };
}

export interface NewsFeedParams {
  category?: NewsCategory;
  limit?: number;
  before?: string | null;
}

// ---------- LIVE NEWS (CryptoCompare public feed, no auth required) ----------

interface CryptoCompareNewsRow {
  id: string;
  guid: string;
  published_on: number;
  imageurl: string;
  title: string;
  url: string;
  source: string;
  body: string;
  tags: string;
  categories: string;
  upvotes: string;
  downvotes: string;
  lang: string;
  source_info?: { name?: string; img?: string };
}

interface CryptoCompareNewsResponse {
  Type: number;
  Message?: string;
  Data?: CryptoCompareNewsRow[];
}

const BULLISH_RE = /(surge|rally|soar|pump|breakout|all[- ]time high|ath|moon|bull|adopt|approve|inflow|gain|skyrocket|partnership)/i;
const BEARISH_RE = /(crash|plunge|dump|drop|decline|sell[- ]off|hack|exploit|scam|rug|liquidat|bear|outflow|drain|warning|delist|ban|lawsuit|sec)/i;
const MEME_RE = /(doge|shib|pepe|wif|bonk|floki|memecoin|meme coin|trump|brett|popcat)/i;
const KOL_RE = /(elon|musk|saylor|cz|vitalik|trump|cathie|hayes|dragosch|kaiko|cobie|kol|influencer|whale)/i;

function inferCategory(row: CryptoCompareNewsRow): NewsCategory {
  const blob = `${row.title} ${row.tags} ${row.categories}`;
  if (MEME_RE.test(blob)) return "meme";
  if (KOL_RE.test(blob)) return "kol";
  const up = Number(row.upvotes ?? 0);
  if (up >= 5) return "viral";
  return "trending";
}

function inferSentiment(row: CryptoCompareNewsRow): NewsSentiment | null {
  const blob = `${row.title} ${row.body ?? ""}`;
  const isBull = BULLISH_RE.test(blob);
  const isBear = BEARISH_RE.test(blob);
  if (isBull && !isBear) return "bullish";
  if (isBear && !isBull) return "bearish";
  if (isBull && isBear) return "neutral";
  return null;
}

function extractMentions(row: CryptoCompareNewsRow): string[] {
  const tagBag = `${row.tags ?? ""}|${row.categories ?? ""}`;
  const tickers = new Set<string>();
  tagBag
    .split(/[|,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z0-9]{2,8}$/.test(t))
    .filter((t) => !/^(NEWS|MARKET|TRADING|MINING|REGULATION|EXCHANGE|BLOCKCHAIN|TECHNOLOGY|BUSINESS|ICO|ALTCOIN|FIAT|GENERAL|SPONSORED|EN)$/.test(t))
    .forEach((t) => tickers.add(t));
  // Pull cashtags from title
  const cashRe = /\$([A-Z]{2,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = cashRe.exec(row.title)) !== null) tickers.add(m[1]);
  return Array.from(tickers).slice(0, 6);
}

function mapLive(row: CryptoCompareNewsRow): CryptoNewsItem {
  const upvotes = Number(row.upvotes ?? 0);
  const downvotes = Number(row.downvotes ?? 0);
  return {
    id: `cc-${row.id}`,
    source: row.source_info?.name ?? row.source ?? "Unknown",
    source_url: row.url,
    title: row.title,
    description: row.body?.slice(0, 280) ?? null,
    image_url: row.imageurl || null,
    category: inferCategory(row),
    sentiment: inferSentiment(row),
    coin_mentions: extractMentions(row),
    engagement: {
      likes: upvotes,
      shares: downvotes,
      comments: 0,
    },
    published_at: new Date((row.published_on ?? 0) * 1000).toISOString(),
  };
}

async function fetchLiveNews(params: { lToken?: number | null; categories?: string | null } = {}): Promise<CryptoNewsItem[]> {
  const url = new URL("https://min-api.cryptocompare.com/data/v2/news/");
  url.searchParams.set("lang", "EN");
  if (params.lToken) url.searchParams.set("lTs", String(params.lToken));
  if (params.categories) url.searchParams.set("categories", params.categories);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`news http ${res.status}`);
  const json = (await res.json()) as CryptoCompareNewsResponse;
  if (!json?.Data) return [];
  return json.Data.map(mapLive);
}

/**
 * Best-effort ingest of live items into Supabase so that engagement
 * (likes/reposts/comments/saves) and realtime can persist across refreshes.
 * Silent on failure (e.g. anonymous users / RLS).
 */
async function ingestLiveItems(items: CryptoNewsItem[]): Promise<void> {
  if (!items.length) return;
  try {
    const payload = items.map((it) => ({
      id: it.id,
      source: it.source,
      source_url: it.source_url ?? null,
      title: it.title,
      body: it.description ?? null,
      image_url: it.image_url ?? null,
      category: it.category,
      sentiment: it.sentiment ?? null,
      coin_mentions: it.coin_mentions ?? [],
      published_at: it.published_at,
    }));
    await supabase.rpc("upsert_news_posts", { p_items: payload });
  } catch (e) {
    console.log("[crypto-news] ingestLiveItems failed", e);
  }
}

export async function getCryptoNewsFeed(params: NewsFeedParams = {}): Promise<CryptoNewsItem[]> {
  const { category = "all", limit = 30, before = null } = params;
  try {
    const beforeTs = before ? Math.floor(new Date(before).getTime() / 1000) : null;
    const items = await fetchLiveNews({ lToken: beforeTs });
    const filtered = category === "all" ? items : items.filter((i) => i.category === category);
    const sliced = filtered.slice(0, limit);
    void ingestLiveItems(sliced);
    return sliced;
  } catch (e) {
    console.log("[crypto-news] live feed failed, falling back to supabase", e);
    try {
      const { data, error } = await supabase.rpc("get_crypto_news_feed", {
        p_category: category,
        p_limit: limit,
        p_before: before,
      });
      if (error) throw error;
      return (data ?? []).map((row: RawNewsRow) => mapRow(row));
    } catch (err) {
      console.log("[crypto-news] getCryptoNewsFeed fallback failed", err);
      return [];
    }
  }
}

export async function searchCryptoNews(query: string, limit: number = 30): Promise<CryptoNewsItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const items = await fetchLiveNews({});
    const needle = q.toLowerCase();
    const matches = items.filter((it) => {
      const hay = `${it.title} ${it.description ?? ""} ${it.coin_mentions.join(" ")} ${it.source}`.toLowerCase();
      return hay.includes(needle);
    });
    if (matches.length > 0) return matches.slice(0, limit);
    // fallback to supabase search if live yields nothing
    const { data, error } = await supabase.rpc("search_crypto_news", {
      p_query: q,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []).map((row: RawNewsRow) => mapRow(row));
  } catch (e) {
    console.log("[crypto-news] searchCryptoNews failed", e);
    return [];
  }
}

// ---------- SAVED ARTICLES (local storage; live items aren't in DB) ----------

import AsyncStorage from "@react-native-async-storage/async-storage";

const SAVED_KEY = "@crypto-news/saved/v1";

async function readSavedMap(): Promise<Record<string, CryptoNewsItem>> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CryptoNewsItem>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.log("[crypto-news] readSavedMap failed", e);
    return {};
  }
}

async function writeSavedMap(map: Record<string, CryptoNewsItem>): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(map));
  } catch (e) {
    console.log("[crypto-news] writeSavedMap failed", e);
  }
}

export async function toggleSaveNews(newsId: string, item?: CryptoNewsItem): Promise<boolean> {
  const map = await readSavedMap();
  if (map[newsId]) {
    delete map[newsId];
    await writeSavedMap(map);
    return false;
  }
  if (item) {
    map[newsId] = { ...item, saved: true };
  } else {
    map[newsId] = {
      id: newsId,
      source: "Saved",
      title: "Saved article",
      coin_mentions: [],
      category: "trending",
      engagement: { likes: 0, shares: 0, comments: 0 },
      published_at: new Date().toISOString(),
    } as CryptoNewsItem;
  }
  await writeSavedMap(map);
  return true;
}

export async function getSavedCryptoNews(limit: number = 50): Promise<CryptoNewsItem[]> {
  const map = await readSavedMap();
  return Object.values(map)
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, limit)
    .map((it) => ({ ...it, saved: true }));
}

/**
 * Subscribe to realtime news inserts. Returns an unsubscribe function.
 */
export function subscribeToNews(onInsert: (item: CryptoNewsItem) => void): () => void {
  try {
    const channel = supabase
      .channel("crypto_news_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crypto_news" },
        (payload) => {
          const row = payload.new as RawNewsRow;
          if (row && row.id) onInsert(mapRow(row));
        },
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.log("[crypto-news] removeChannel error", e);
      }
    };
  } catch (e) {
    console.log("[crypto-news] subscribeToNews failed", e);
    return () => {};
  }
}

// ---------- WALLETS ----------

export type Blockchain = "solana" | "ethereum" | "base" | "bitcoin";

export interface UserWalletRow {
  id: string;
  blockchain: Blockchain;
  address: string;
  label: string | null;
  created_at: string;
}

export interface UserWalletWithBalance extends UserWalletRow {
  balanceUsd: number;
  topHolding?: { symbol?: string; usdValue: number } | null;
  tokenCount: number;
}

export interface PortfolioStats {
  totalUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  walletCount: number;
  tokenCount: number;
  topHolding: { symbol?: string; usdValue: number } | null;
  wallets: UserWalletWithBalance[];
}

export async function addUserWallet(input: {
  blockchain: Blockchain;
  address: string;
  label?: string;
}): Promise<UserWalletRow> {
  const trimmed = input.address.trim();
  if (input.blockchain === "solana" && !isValidSolanaAddress(trimmed)) {
    throw new Error("Invalid Solana address");
  }
  if (input.blockchain !== "solana" && trimmed.length < 8) {
    throw new Error("Invalid wallet address");
  }
  const { data, error } = await supabase.rpc("add_user_wallet", {
    p_blockchain: input.blockchain,
    p_address: trimmed,
    p_label: input.label?.trim() ?? null,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as UserWalletRow;
  return row;
}

export async function getUserWalletsSummary(): Promise<UserWalletRow[]> {
  try {
    const { data, error } = await supabase.rpc("get_user_wallets_summary");
    if (error) throw error;
    return (data ?? []) as UserWalletRow[];
  } catch (e) {
    console.log("[crypto-news] getUserWalletsSummary failed", e);
    return [];
  }
}

export async function getWalletHoldings(address: string): Promise<WalletTokenHolding[]> {
  return fetchWalletTokens(address);
}

export async function getWalletTransactions(
  address: string,
  limit: number = 25,
): Promise<WalletTransaction[]> {
  return fetchWalletTransactions(address, limit);
}

/**
 * Aggregate live balances across all of the signed-in user's wallets.
 * Solana wallets are priced via Jupiter; non-Solana wallets are reported
 * with zero balances until additional providers are wired in.
 */
export async function getPortfolioStats(): Promise<PortfolioStats> {
  const wallets = await getUserWalletsSummary();
  const enriched: UserWalletWithBalance[] = await Promise.all(
    wallets.map(async (w) => {
      try {
        if (w.blockchain !== "solana" || !isValidSolanaAddress(w.address)) {
          return { ...w, balanceUsd: 0, tokenCount: 0, topHolding: null };
        }
        const portfolio = await fetchWalletPortfolio(w.address);
        const top = (portfolio.tokens ?? [])
          .slice()
          .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))[0];
        return {
          ...w,
          balanceUsd: portfolio.balance.usd,
          tokenCount: portfolio.tokens.length,
          topHolding: top
            ? { symbol: top.symbol, usdValue: top.usdValue ?? 0 }
            : null,
        };
      } catch (e) {
        console.log("[crypto-news] portfolio enrich failed", w.address, e);
        return { ...w, balanceUsd: 0, tokenCount: 0, topHolding: null };
      }
    }),
  );

  const totalUsd = enriched.reduce((acc, w) => acc + (w.balanceUsd ?? 0), 0);
  const tokenCount = enriched.reduce((acc, w) => acc + w.tokenCount, 0);
  const topHolding = enriched.reduce<{ symbol?: string; usdValue: number } | null>(
    (best, w) => {
      if (!w.topHolding) return best;
      if (!best || w.topHolding.usdValue > best.usdValue) return w.topHolding;
      return best;
    },
    null,
  );
  // P&L is reported as 0 until cost-basis ingestion is wired in (Moralis/Solscan).
  return {
    totalUsd,
    unrealizedPnlUsd: 0,
    unrealizedPnlPct: 0,
    walletCount: enriched.length,
    tokenCount,
    topHolding,
    wallets: enriched,
  };
}

// ---------- LIVE ENGAGEMENT (likes / reposts / comments / save) ----------

export interface NewsEngagement {
  likeCount: number;
  repostCount: number;
  commentCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  savedByMe: boolean;
}

export interface NewsComment {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  body: string;
  created_at: string;
}

export async function getNewsFeedWithEngagement(
  params: NewsFeedParams = {},
): Promise<(CryptoNewsItem & { engagementExt: NewsEngagement })[]> {
  const { category = "all", limit = 30, before = null } = params;
  try {
    const { data, error } = await supabase.rpc("get_news_feed_with_engagement", {
      p_category: category,
      p_limit: limit,
      p_before: before,
    });
    if (error) throw error;
    type Row = {
      id: string;
      source: string;
      source_url: string | null;
      title: string;
      body: string | null;
      image_url: string | null;
      category: string;
      sentiment: string | null;
      coin_mentions: string[] | null;
      published_at: string;
      like_count: number;
      repost_count: number;
      comment_count: number;
      liked_by_me: boolean;
      reposted_by_me: boolean;
      saved_by_me: boolean;
    };
    return (data ?? []).map((r: Row) => ({
      id: r.id,
      source: r.source,
      source_url: r.source_url,
      title: r.title,
      description: r.body,
      image_url: r.image_url,
      category: (r.category ?? "trending") as NewsCategory,
      sentiment: (r.sentiment ?? null) as NewsSentiment | null,
      coin_mentions: r.coin_mentions ?? [],
      engagement: { likes: r.like_count, shares: r.repost_count, comments: r.comment_count },
      published_at: r.published_at,
      saved: r.saved_by_me,
      engagementExt: {
        likeCount: r.like_count,
        repostCount: r.repost_count,
        commentCount: r.comment_count,
        likedByMe: r.liked_by_me,
        repostedByMe: r.reposted_by_me,
        savedByMe: r.saved_by_me,
      },
    }));
  } catch (e) {
    console.log("[crypto-news] getNewsFeedWithEngagement failed", e);
    return [];
  }
}

export async function toggleLikeNewsPost(postId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_like_news_post", { p_post_id: postId });
  if (error) throw error;
  return Boolean(data);
}

export async function toggleRepostNewsPost(postId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_repost_news_post", { p_post_id: postId });
  if (error) throw error;
  return Boolean(data);
}

export async function toggleSaveNewsPost(postId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_save_news_post", { p_post_id: postId });
  if (error) throw error;
  return Boolean(data);
}

export async function addNewsComment(postId: string, body: string): Promise<NewsComment | null> {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc("add_news_comment", {
    p_post_id: postId,
    p_body: trimmed,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; user_id: string; body: string; created_at: string } | null;
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    username: "",
    avatar_url: null,
    body: row.body,
    created_at: row.created_at,
  };
}

export async function getNewsComments(postId: string, limit: number = 50): Promise<NewsComment[]> {
  try {
    const { data, error } = await supabase.rpc("get_news_comments", {
      p_post_id: postId,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as NewsComment[];
  } catch (e) {
    console.log("[crypto-news] getNewsComments failed", e);
    return [];
  }
}

export async function createWalletAlert(input: {
  walletId?: string | null;
  tokenAddress?: string | null;
  rule: "price_above" | "price_below" | "tx_in" | "tx_out" | "balance_change";
  threshold?: number | null;
}): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("create_wallet_alert", {
    p_wallet_id: input.walletId ?? null,
    p_token_address: input.tokenAddress ?? null,
    p_rule: input.rule,
    p_threshold: input.threshold ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { id: (row as { id: string }).id };
}
