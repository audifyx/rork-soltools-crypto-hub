/**
 * KOL Scan API layer.
 *
 * Backed by Supabase RPCs (see migration 20260505_kol_scan.sql):
 *   - get_kol_profiles
 *   - search_kol_profiles
 *   - get_kol_recent_transactions
 *   - toggle_follow_kol
 *   - get_user_followed_kols
 */
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

interface RawProfile {
  id: string;
  name: string;
  x_handle: string | null;
  wallet_address: string;
  blockchain: string;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number | string | null;
  total_pnl_usd: number | string | null;
  win_rate: number | string | null;
  verified: boolean | null;
  is_followed: boolean | null;
}

interface RawTx {
  id: string;
  kol_id: string;
  kol_name: string;
  kol_handle: string | null;
  kol_avatar: string | null;
  tx_hash: string;
  blockchain: string;
  tx_type: string;
  symbol_in: string | null;
  symbol_out: string | null;
  token_in_address: string | null;
  token_out_address: string | null;
  amount_in: number | string | null;
  amount_out: number | string | null;
  usd_value: number | string | null;
  slippage_pct: number | string | null;
  occurred_at: string;
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
    blockchain: (r.blockchain as KOLBlockchain) ?? "solana",
    avatar_url: r.avatar_url ?? null,
    bio: r.bio ?? null,
    follower_count: toNum(r.follower_count),
    total_pnl_usd: toNum(r.total_pnl_usd),
    win_rate: toNum(r.win_rate),
    verified: Boolean(r.verified),
    is_followed: Boolean(r.is_followed),
  };
}

function mapTx(r: RawTx): KOLTransaction {
  const t = (r.tx_type ?? "SWAP").toUpperCase() as KOLTxType;
  return {
    id: r.id,
    kol_id: r.kol_id,
    kol_name: r.kol_name,
    kol_handle: r.kol_handle ?? null,
    kol_avatar: r.kol_avatar ?? null,
    tx_hash: r.tx_hash,
    blockchain: (r.blockchain as KOLBlockchain) ?? "solana",
    tx_type: t,
    symbol_in: r.symbol_in ?? null,
    symbol_out: r.symbol_out ?? null,
    token_in_address: r.token_in_address ?? null,
    token_out_address: r.token_out_address ?? null,
    amount_in: r.amount_in == null ? null : toNum(r.amount_in),
    amount_out: r.amount_out == null ? null : toNum(r.amount_out),
    usd_value: r.usd_value == null ? null : toNum(r.usd_value),
    slippage_pct: r.slippage_pct == null ? null : toNum(r.slippage_pct),
    occurred_at: r.occurred_at,
  };
}

export async function getKOLProfiles(limit: number = 30, offset: number = 0): Promise<KOLProfile[]> {
  try {
    const { data, error } = await supabase.rpc("get_kol_profiles", {
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;
    return (data ?? []).map((r: RawProfile) => mapProfile(r));
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
    return (data ?? []).map((r: RawProfile) => mapProfile(r));
  } catch (e) {
    console.log("[kol] searchKOLProfiles failed", e);
    return [];
  }
}

export async function getKOLRecentTransactions(params: {
  kolId?: string | null;
  txType?: KOLTxType | null;
  limit?: number;
  before?: string | null;
} = {}): Promise<KOLTransaction[]> {
  try {
    const { data, error } = await supabase.rpc("get_kol_recent_transactions", {
      p_kol_id: params.kolId ?? null,
      p_tx_type: params.txType ?? null,
      p_limit: params.limit ?? 50,
      p_before: params.before ?? null,
    });
    if (error) throw error;
    return (data ?? []).map((r: RawTx) => mapTx(r));
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

export async function getUserFollowedKOLs(limit: number = 100): Promise<KOLProfile[]> {
  try {
    const { data, error } = await supabase.rpc("get_user_followed_kols", { p_limit: limit });
    if (error) throw error;
    return (data ?? []).map((r: RawProfile) => mapProfile(r));
  } catch (e) {
    console.log("[kol] getUserFollowedKOLs failed", e);
    return [];
  }
}

/** Subscribe to realtime KOL transactions inserts. Returns an unsubscribe fn. */
export function subscribeToKOLTransactions(onInsert: (tx: KOLTransaction) => void): () => void {
  try {
    const channel = supabase
      .channel("kol_transactions_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kol_transactions" },
        (payload) => {
          const row = payload.new as RawTx & { kol_name?: string };
          if (row && row.id) {
            onInsert(
              mapTx({
                ...row,
                kol_name: row.kol_name ?? "",
                kol_handle: null,
                kol_avatar: null,
              }),
            );
          }
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
