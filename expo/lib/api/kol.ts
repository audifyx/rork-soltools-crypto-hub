/**
 * KOL Scan API layer.
 *
 * The KOL profile rows live in Supabase, but the `kol_transactions` and
 * `kol_holdings` tables ship empty (the server-side `sync_kol_transactions`
 * RPC is currently a stub that always returns zero). We therefore use
 * Supabase only to enumerate the tracked KOL wallets and fetch the live
 * activity / holdings straight from Solana RPC + Jupiter price.
 *
 * RPCs used:
 *   - get_kol_profiles(p_limit)
 *   - search_kol_profiles(p_query, p_limit)
 *   - get_kol_portfolio(p_kol_id)
 *   - toggle_follow_kol(p_kol_id)
 *   - get_user_followed_kols()
 */
import {
  enrichHoldings,
  fetchWalletBalance,
  type WalletTokenHolding,
} from "@/lib/api/wallet";
import { getPrice } from "@/lib/api/jupiter";
import {
  fetchOnchainSwaps,
  shortMint,
  SOL_MINT_ADDRESS,
  type OnchainSwap,
} from "@/lib/api/kol-onchain";
import { supabase } from "@/lib/supabase";

export type KOLBlockchain = "solana" | "ethereum" | "base" | "bitcoin";
export type KOLTxType = "BUY" | "SELL" | "SWAP";

export interface KOLProfile {
  id: string;
  name: string;
  x_handle: string | null;
  wallet_address: string;
  blockchain: KOLBlockchain;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
  total_pnl_usd: number;
  win_rate: number;
  verified: boolean;
  is_followed: boolean;
}

export interface KOLTransaction {
  id: string;
  kol_id: string;
  kol_name: string;
  kol_handle: string | null;
  kol_avatar: string | null;
  tx_hash: string;
  blockchain: KOLBlockchain;
  tx_type: KOLTxType;
  symbol_in: string | null;
  symbol_out: string | null;
  token_in_address: string | null;
  token_out_address: string | null;
  amount_in: number | null;
  amount_out: number | null;
  usd_value: number | null;
  slippage_pct: number | null;
  occurred_at: string;
}

export interface KOLHolding {
  id: string;
  kol_id: string;
  token_address: string;
  symbol: string;
  name: string | null;
  logo_url: string | null;
  balance: number;
  avg_buy_price: number | null;
  current_price: number | null;
  value_usd: number;
  pnl_usd: number;
  pnl_pct: number;
  updated_at: string;
}

export interface KOLPortfolio {
  kol_id: string;
  name: string;
  x_handle: string | null;
  wallet_address: string;
  blockchain: KOLBlockchain;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
  verified: boolean;
  is_followed: boolean;
  total_value_usd: number;
  total_pnl_usd: number;
  total_pnl_pct: number;
  win_rate: number;
  token_count: number;
  tx_count: number;
  top_holding_symbol: string | null;
  top_holding_value_usd: number | null;
}

interface RawProfile {
  id: string;
  name: string;
  x_handle: string | null;
  wallet_address: string;
  blockchain?: string | null;
  // both shapes have shown up in the wild; accept either name.
  avatar_url?: string | null;
  image_url?: string | null;
  bio?: string | null;
  follower_count?: number | string | null;
  followers_count?: number | string | null;
  total_pnl_usd?: number | string | null;
  win_rate?: number | string | null;
  verified?: boolean | null;
  is_followed?: boolean | null;
}

interface RawPortfolio extends RawProfile {
  kol_id: string;
  total_value_usd?: number | string | null;
  total_pnl_pct?: number | string | null;
  token_count?: number | string | null;
  tx_count?: number | string | null;
  top_holding_symbol?: string | null;
  top_holding_value_usd?: number | string | null;
}

function toNum(n: number | string | null | undefined): number {
  if (n == null) return 0;
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v : 0;
}

function mapProfile(r: RawProfile): KOLProfile {
  return {
    id: r.id,
    name: r.name,
    x_handle: r.x_handle ?? null,
    wallet_address: r.wallet_address,
    blockchain: ((r.blockchain ?? "solana") as KOLBlockchain),
    avatar_url: r.avatar_url ?? r.image_url ?? null,
    bio: r.bio ?? null,
    follower_count: toNum(r.follower_count ?? r.followers_count),
    total_pnl_usd: toNum(r.total_pnl_usd),
    win_rate: toNum(r.win_rate),
    verified: Boolean(r.verified),
    is_followed: Boolean(r.is_followed),
  };
}

// In-memory cache keyed by KOL id so on-chain fetches can resolve a wallet
// without an extra round-trip.
const PROFILE_CACHE = new Map<string, KOLProfile>();

function cacheProfiles(profiles: KOLProfile[]): void {
  profiles.forEach((p) => PROFILE_CACHE.set(p.id, p));
}

async function ensureAllProfiles(): Promise<KOLProfile[]> {
  if (PROFILE_CACHE.size > 0) return Array.from(PROFILE_CACHE.values());
  const list = await getKOLProfiles(100, 0);
  return list;
}

async function profileById(kolId: string): Promise<KOLProfile | null> {
  const cached = PROFILE_CACHE.get(kolId);
  if (cached) return cached;
  await ensureAllProfiles();
  return PROFILE_CACHE.get(kolId) ?? null;
}

export async function getKOLProfiles(limit: number = 30, offset: number = 0): Promise<KOLProfile[]> {
  try {
    const { data, error } = await supabase.rpc("get_kol_profiles", { p_limit: limit + offset });
    if (error) throw error;
    const all = (data ?? []).map((r: RawProfile) => mapProfile(r));
    cacheProfiles(all);
    return all.slice(offset, offset + limit);
  } catch (e) {
    console.log("[kol] getKOLProfiles failed", e);
    return [];
  }
}

export async function searchKOLProfiles(query: string, limit: number = 30): Promise<KOLProfile[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const { data, error } = await supabase.rpc("search_kol_profiles", {
      p_query: q,
      p_limit: limit,
    });
    if (error) throw error;
    const out = (data ?? []).map((r: RawProfile) => mapProfile(r));
    cacheProfiles(out);
    return out;
  } catch (e) {
    console.log("[kol] searchKOLProfiles failed", e);
    return [];
  }
}

function swapToKolTx(swap: OnchainSwap, kol: KOLProfile): KOLTransaction {
  const occurred = new Date((swap.blockTime || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  return {
    id: swap.signature,
    kol_id: kol.id,
    kol_name: kol.name,
    kol_handle: kol.x_handle ?? null,
    kol_avatar: kol.avatar_url ?? null,
    tx_hash: swap.signature,
    blockchain: kol.blockchain,
    tx_type: swap.type,
    symbol_in: swap.symbolIn,
    symbol_out: swap.symbolOut,
    token_in_address: swap.mintIn,
    token_out_address: swap.mintOut,
    amount_in: swap.amountIn,
    amount_out: swap.amountOut,
    usd_value: swap.usdValue,
    slippage_pct: null,
    occurred_at: occurred,
  };
}

export async function getKOLRecentTransactions(params: {
  kolId?: string | null;
  txType?: KOLTxType | null;
  limit?: number;
  before?: string | null;
} = {}): Promise<KOLTransaction[]> {
  try {
    const limit = Math.min(50, Math.max(5, params.limit ?? 25));
    const txType = params.txType ?? null;
    const beforeMs = params.before ? new Date(params.before).getTime() : Number.POSITIVE_INFINITY;

    const profiles = params.kolId
      ? await (async () => {
          const p = await profileById(params.kolId as string);
          return p ? [p] : [];
        })()
      : await ensureAllProfiles();

    if (profiles.length === 0) return [];

    const perWalletParsed = params.kolId ? 18 : 6;
    const perWalletLimit = params.kolId ? Math.max(limit, 24) : 12;

    const swapsByKol = await Promise.all(
      profiles.map(async (kol) => {
        const swaps = await fetchOnchainSwaps(kol.wallet_address, {
          limit: perWalletLimit,
          parsedLimit: perWalletParsed,
        });
        return swaps
          .map((s) => swapToKolTx(s, kol))
          .filter((tx) => {
            if (!Number.isFinite(beforeMs)) return true;
            return new Date(tx.occurred_at).getTime() < beforeMs;
          });
      }),
    );

    const merged = swapsByKol.flat().sort((a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );

    const filtered = txType ? merged.filter((tx) => tx.tx_type === txType) : merged;
    return filtered.slice(0, limit);
  } catch (e) {
    console.log("[kol] getKOLRecentTransactions failed", e);
    return [];
  }
}

export async function toggleFollowKOL(kolId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_follow_kol", { p_kol_id: kolId });
  if (error) throw error;
  return Boolean(data);
}

export async function getUserFollowedKOLs(): Promise<KOLProfile[]> {
  try {
    const { data, error } = await supabase.rpc("get_user_followed_kols");
    if (error) throw error;
    const out = (data ?? []).map((r: RawProfile) => mapProfile(r));
    cacheProfiles(out);
    return out;
  } catch (e) {
    console.log("[kol] getUserFollowedKOLs failed", e);
    return [];
  }
}

/**
 * Subscribe to realtime KOL transactions inserts. The server-side ingestion
 * is currently inert, so this listener mostly stays idle in production —
 * screens should rely on react-query polling for the live experience.
 */
export function subscribeToKOLTransactions(onInsert: (tx: KOLTransaction) => void): () => void {
  try {
    const channel = supabase
      .channel("kol_transactions_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kol_transactions" },
        (payload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          if (!row || typeof row.id !== "string") return;
          onInsert({
            id: String(row.id),
            kol_id: String(row.kol_id ?? ""),
            kol_name: String(row.kol_name ?? ""),
            kol_handle: (row.kol_handle as string | null) ?? null,
            kol_avatar: (row.kol_avatar as string | null) ?? null,
            tx_hash: String(row.tx_hash ?? ""),
            blockchain: ((row.blockchain as string) ?? "solana") as KOLBlockchain,
            tx_type: (((row.tx_type as string) ?? "SWAP").toUpperCase() as KOLTxType),
            symbol_in: (row.symbol_in as string | null) ?? null,
            symbol_out: (row.symbol_out as string | null) ?? null,
            token_in_address: (row.token_in_address as string | null) ?? null,
            token_out_address: (row.token_out_address as string | null) ?? null,
            amount_in: row.amount_in == null ? null : toNum(row.amount_in as number | string),
            amount_out: row.amount_out == null ? null : toNum(row.amount_out as number | string),
            usd_value: row.usd_value == null ? null : toNum(row.usd_value as number | string),
            slippage_pct: row.slippage_pct == null ? null : toNum(row.slippage_pct as number | string),
            occurred_at: String(row.occurred_at ?? new Date().toISOString()),
          });
        },
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.log("[kol] removeChannel error", e);
      }
    };
  } catch (e) {
    console.log("[kol] subscribeToKOLTransactions failed", e);
    return () => {};
  }
}

export function explorerUrlForTx(blockchain: KOLBlockchain, txHash: string): string {
  switch (blockchain) {
    case "solana":
      return `https://solscan.io/tx/${txHash}`;
    case "ethereum":
      return `https://etherscan.io/tx/${txHash}`;
    case "base":
      return `https://basescan.org/tx/${txHash}`;
    case "bitcoin":
      return `https://mempool.space/tx/${txHash}`;
    default:
      return `https://solscan.io/tx/${txHash}`;
  }
}

export function truncateAddress(addr: string, head: number = 4, tail: number = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function holdingFromToken(kol: KOLProfile, t: WalletTokenHolding): KOLHolding {
  const balance = Number(t.uiAmount ?? 0) || 0;
  const value = Number(t.usdValue ?? 0) || 0;
  const price = balance > 0 && value > 0 ? value / balance : 0;
  return {
    id: `${kol.id}:${t.mint}`,
    kol_id: kol.id,
    token_address: t.mint,
    symbol: t.symbol ?? shortMint(t.mint),
    name: t.name ?? null,
    logo_url: t.logo ?? null,
    balance,
    avg_buy_price: null,
    current_price: price > 0 ? price : null,
    value_usd: value,
    pnl_usd: 0,
    pnl_pct: 0,
    updated_at: new Date().toISOString(),
  };
}

async function solUsdPrice(): Promise<number> {
  try {
    const map = await getPrice([SOL_MINT_ADDRESS]);
    const row = map[SOL_MINT_ADDRESS] as { price?: number } | undefined;
    return Number(row?.price ?? 0) || 0;
  } catch (e) {
    console.log("[kol] solUsdPrice failed", e);
    return 0;
  }
}

export async function getKOLHoldings(kolId: string): Promise<KOLHolding[]> {
  try {
    const kol = await profileById(kolId);
    if (!kol) return [];

    const [balance, solPrice] = await Promise.all([
      fetchWalletBalance(kol.wallet_address),
      solUsdPrice(),
    ]);

    // Hydrate every token with metadata + price (Birdeye → Jupiter → Pump → Dex).
    const enriched = await enrichHoldings(balance.tokens ?? [], 40);

    const out: KOLHolding[] = [];
    if (balance.sol > 0) {
      const solValue = balance.sol * solPrice;
      out.push({
        id: `${kol.id}:SOL`,
        kol_id: kol.id,
        token_address: SOL_MINT_ADDRESS,
        symbol: "SOL",
        name: "Solana",
        logo_url: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
        balance: balance.sol,
        avg_buy_price: null,
        current_price: solPrice > 0 ? solPrice : null,
        value_usd: solValue,
        pnl_usd: 0,
        pnl_pct: 0,
        updated_at: new Date().toISOString(),
      });
    }
    enriched.forEach((t) => {
      if ((t.uiAmount ?? 0) <= 0) return;
      out.push(holdingFromToken(kol, t));
    });
    return out.sort((a, b) => b.value_usd - a.value_usd);
  } catch (e) {
    console.log("[kol] getKOLHoldings failed", e);
    return [];
  }
}

export async function getKOLPortfolio(kolId: string): Promise<KOLPortfolio | null> {
  try {
    let portfolio: KOLPortfolio | null = null;
    try {
      const { data, error } = await supabase.rpc("get_kol_portfolio", { p_kol_id: kolId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        const r = row as RawPortfolio;
        portfolio = {
          kol_id: r.kol_id,
          name: r.name,
          x_handle: r.x_handle ?? null,
          wallet_address: r.wallet_address,
          blockchain: ((r.blockchain ?? "solana") as KOLBlockchain),
          avatar_url: r.avatar_url ?? r.image_url ?? null,
          bio: r.bio ?? null,
          follower_count: toNum(r.follower_count ?? r.followers_count),
          verified: Boolean(r.verified),
          is_followed: Boolean(r.is_followed),
          total_value_usd: toNum(r.total_value_usd),
          total_pnl_usd: toNum(r.total_pnl_usd),
          total_pnl_pct: toNum(r.total_pnl_pct),
          win_rate: toNum(r.win_rate),
          token_count: toNum(r.token_count),
          tx_count: toNum(r.tx_count),
          top_holding_symbol: r.top_holding_symbol ?? null,
          top_holding_value_usd: r.top_holding_value_usd == null ? null : toNum(r.top_holding_value_usd),
        };
      }
    } catch (e) {
      console.log("[kol] portfolio rpc failed, falling back to cache", e);
    }

    if (!portfolio) {
      const cached = await profileById(kolId);
      if (!cached) return null;
      portfolio = {
        kol_id: cached.id,
        name: cached.name,
        x_handle: cached.x_handle,
        wallet_address: cached.wallet_address,
        blockchain: cached.blockchain,
        avatar_url: cached.avatar_url,
        bio: cached.bio,
        follower_count: cached.follower_count,
        verified: cached.verified,
        is_followed: cached.is_followed,
        total_value_usd: 0,
        total_pnl_usd: 0,
        total_pnl_pct: 0,
        win_rate: 0,
        token_count: 0,
        tx_count: 0,
        top_holding_symbol: null,
        top_holding_value_usd: null,
      };
    }

    // Hydrate live on-chain numbers so the screen always has real data even
    // when the server-side aggregator returns zeros. We pull the wallet via
    // RPC (SPL + Token-2022) then enrich every holding with Birdeye/Jupiter/
    // Pump/Dex metadata + price so portfolio_value, token_count, and the top
    // holding are always populated.
    try {
      const [balance, solPrice] = await Promise.all([
        fetchWalletBalance(portfolio.wallet_address),
        solUsdPrice(),
      ]);
      const enriched = await enrichHoldings(balance.tokens ?? [], 40);
      const heldTokens = enriched.filter((t) => (t.uiAmount ?? 0) > 0);

      const tokensUsd = heldTokens.reduce((acc, t) => acc + (Number(t.usdValue ?? 0) || 0), 0);
      const solUsd = balance.sol * solPrice;
      const totalUsd = solUsd + tokensUsd;
      const tokenCount = heldTokens.length + (balance.sol > 0 ? 1 : 0);

      let topSym: string | null = null;
      let topVal: number = 0;
      heldTokens.forEach((t) => {
        const v = Number(t.usdValue ?? 0) || 0;
        if (v > topVal) {
          topVal = v;
          topSym = t.symbol ?? shortMint(t.mint);
        }
      });
      if (solUsd > topVal) {
        topVal = solUsd;
        topSym = "SOL";
      }

      portfolio = {
        ...portfolio,
        total_value_usd: totalUsd > 0 ? totalUsd : portfolio.total_value_usd,
        token_count: tokenCount > 0 ? tokenCount : portfolio.token_count,
        top_holding_symbol: topSym ?? portfolio.top_holding_symbol,
        top_holding_value_usd: topVal > 0 ? topVal : portfolio.top_holding_value_usd,
      };
    } catch (e) {
      console.log("[kol] portfolio hydrate failed", e);
    }

    return portfolio;
  } catch (e) {
    console.log("[kol] getKOLPortfolio failed", e);
    return null;
  }
}
