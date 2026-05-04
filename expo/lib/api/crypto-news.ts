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

export async function getCryptoNewsFeed(params: NewsFeedParams = {}): Promise<CryptoNewsItem[]> {
  const { category = "all", limit = 30, before = null } = params;
  try {
    const { data, error } = await supabase.rpc("get_crypto_news_feed", {
      p_category: category,
      p_limit: limit,
      p_before: before,
    });
    if (error) throw error;
    return (data ?? []).map((row: RawNewsRow) => mapRow(row));
  } catch (e) {
    console.log("[crypto-news] getCryptoNewsFeed failed", e);
    return [];
  }
}

export async function searchCryptoNews(query: string, limit: number = 30): Promise<CryptoNewsItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
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

export async function toggleSaveNews(newsId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("toggle_save_news", { p_news_id: newsId });
    if (error) throw error;
    return Boolean(data);
  } catch (e) {
    console.log("[crypto-news] toggleSaveNews failed", e);
    throw e;
  }
}

export async function getSavedCryptoNews(limit: number = 50): Promise<CryptoNewsItem[]> {
  try {
    const { data, error } = await supabase.rpc("get_saved_crypto_news", { p_limit: limit });
    if (error) throw error;
    return (data ?? []).map((row: RawNewsRow) => ({ ...mapRow(row), saved: true }));
  } catch (e) {
    console.log("[crypto-news] getSavedCryptoNews failed", e);
    return [];
  }
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
