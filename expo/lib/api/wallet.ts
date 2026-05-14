import { getTokenOverview } from "@/lib/api/birdeye";
import { getPrice, rpcCall } from "@/lib/api/jupiter";
import { SOL_MINT } from "@/lib/api/market";

export interface WalletBalance {
  sol: number;
  usd: number;
  tokens?: WalletTokenHolding[];
}

export interface WalletTokenHolding {
  mint: string;
  symbol?: string;
  name?: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  usdValue?: number;
  logo?: string;
}

export interface WalletTransaction {
  signature: string;
  blockTime: number;
  type?: string;
  description?: string;
  fee?: number;
  status?: "success" | "failed";
}

export interface WalletStats {
  totalTxs: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  totalFeesSol: number;
  totalFeesUsd: number;
  firstSeen: number;
  lastSeen: number;
  activeDays: number;
  avgTxPerDay: number;
}

export interface WalletPortfolio {
  address: string;
  balance: WalletBalance;
  tokens: WalletTokenHolding[];
  transactions: WalletTransaction[];
  stats: WalletStats;
  solPrice: number;
}

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface RpcTokenAccount {
  pubkey: string;
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: {
            amount: string;
            decimals: number;
            uiAmount: number | null;
          };
        };
      };
    };
  };
}

interface RpcTokenAccountsResponse {
  value: RpcTokenAccount[];
}

interface RpcSignaturesItem {
  signature: string;
  blockTime?: number | null;
  err: unknown | null;
  memo?: string | null;
  slot: number;
}

/** Validate a Solana base58 wallet address. */
export function isValidSolanaAddress(addr: string): boolean {
  if (!addr) return false;
  const trimmed = addr.trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
}

async function fetchTokenAccounts(address: string): Promise<RpcTokenAccount[]> {
  const callFor = async (programId: string): Promise<RpcTokenAccount[]> => {
    try {
      const res = await rpcCall<RpcTokenAccountsResponse>(
        "getTokenAccountsByOwner",
        [
          address,
          { programId },
          { encoding: "jsonParsed" },
        ],
      );
      return res?.value ?? [];
    } catch (e) {
      console.log("[wallet] getTokenAccountsByOwner", programId, "error", e);
      return [];
    }
  };
  const [v1, v2] = await Promise.all([
    callFor(TOKEN_PROGRAM_ID),
    callFor(TOKEN_2022_PROGRAM_ID),
  ]);
  return [...v1, ...v2];
}

async function fetchSolBalance(address: string): Promise<number> {
  try {
    const res = await rpcCall<{ value: number } | number>(
      "getBalance",
      [address, { commitment: "confirmed" }],
    );
    const lamports =
      typeof res === "number"
        ? res
        : typeof res?.value === "number"
        ? res.value
        : 0;
    return lamports / 1e9;
  } catch (e) {
    console.log("[wallet] getBalance error", e);
    return 0;
  }
}

async function fetchSignatures(
  address: string,
  limit: number,
  before?: string,
): Promise<WalletTransaction[]> {
  try {
    const opts: Record<string, unknown> = { limit };
    if (before) opts.before = before;
    const res = await rpcCall<RpcSignaturesItem[]>(
      "getSignaturesForAddress",
      [address, opts],
    );
    return (res ?? []).map((s) => ({
      signature: s.signature,
      blockTime: Number(s.blockTime ?? 0),
      status: s.err ? ("failed" as const) : ("success" as const),
      description: s.memo ?? undefined,
    }));
  } catch (e) {
    console.log("[wallet] getSignaturesForAddress error", e);
    return [];
  }
}

/**
 * Find the wallet's earliest signature by paginating backwards from the
 * most recent transaction using the `before` cursor. Caps at MAX_PAGES so we
 * don't hammer the RPC on hyper-active wallets — each page is 1000 sigs.
 */
async function fetchEarliestSignature(
  address: string,
  newestSignature: string,
): Promise<WalletTransaction | null> {
  const PAGE = 1000;
  const MAX_PAGES = 25;
  let cursor: string | undefined = newestSignature;
  let oldest: WalletTransaction | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchSignatures(address, PAGE, cursor);
    if (batch.length === 0) break;
    const last = batch[batch.length - 1];
    oldest = last;
    if (batch.length < PAGE) break;
    cursor = last.signature;
  }
  return oldest;
}

/**
 * Returns the wallet's lifetime activity summary: the very first transaction
 * ever made, the most recent, and the total signature count derived from
 * pagination.
 */
async function fetchLifetimeActivity(address: string): Promise<{
  firstTx: WalletTransaction | null;
  lastTx: WalletTransaction | null;
  totalCount: number;
}> {
  const PAGE = 1000;
  const MAX_PAGES = 25;
  const newest = await fetchSignatures(address, 1);
  const lastTx = newest[0] ?? null;
  if (!lastTx) return { firstTx: null, lastTx: null, totalCount: 0 };

  let cursor: string | undefined = lastTx.signature;
  let firstTx: WalletTransaction = lastTx;
  let count = 1;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await fetchSignatures(address, PAGE, cursor);
    if (batch.length === 0) break;
    count += batch.length;
    firstTx = batch[batch.length - 1];
    if (batch.length < PAGE) break;
    cursor = firstTx.signature;
  }
  return { firstTx, lastTx, totalCount: count };
}

async function priceMap(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  try {
    const data = await getPrice(mints);
    const out: Record<string, number> = {};
    Object.entries(data).forEach(([mint, p]) => {
      const price = Number((p as { price?: number })?.price ?? 0);
      if (price > 0) out[mint] = price;
    });
    return out;
  } catch (e) {
    console.log("[wallet] price fetch fallback", e);
    return {};
  }
}

function aggregateAccounts(accounts: RpcTokenAccount[]): WalletTokenHolding[] {
  const map = new Map<string, WalletTokenHolding>();
  accounts.forEach((a) => {
    const info = a.account?.data?.parsed?.info;
    if (!info) return;
    const ui = Number(info.tokenAmount?.uiAmount ?? 0);
    if (ui <= 0) return;
    const mint = info.mint;
    const amount = Number(info.tokenAmount?.amount ?? 0);
    const decimals = Number(info.tokenAmount?.decimals ?? 0);
    const existing = map.get(mint);
    if (existing) {
      existing.uiAmount += ui;
      existing.amount += amount;
    } else {
      map.set(mint, { mint, uiAmount: ui, amount, decimals });
    }
  });
  return Array.from(map.values()).sort((a, b) => b.uiAmount - a.uiAmount);
}

export async function fetchWalletBalance(address: string): Promise<WalletBalance> {
  if (!isValidSolanaAddress(address)) return { sol: 0, usd: 0 };
  const [sol, accounts] = await Promise.all([
    fetchSolBalance(address),
    fetchTokenAccounts(address),
  ]);
  const tokens = aggregateAccounts(accounts);
  const mintsToPrice = [SOL_MINT, ...tokens.map((t) => t.mint)];
  const prices = await priceMap(mintsToPrice);
  const solPrice = prices[SOL_MINT] ?? 0;
  let usd = sol * solPrice;
  tokens.forEach((t) => {
    const p = prices[t.mint];
    if (p && p > 0) {
      t.usdValue = t.uiAmount * p;
      usd += t.usdValue;
    }
  });
  return { sol, usd, tokens };
}

export async function fetchWalletTokens(
  address: string,
): Promise<WalletTokenHolding[]> {
  const b = await fetchWalletBalance(address);
  return b.tokens ?? [];
}

export async function fetchWalletTransactions(
  address: string,
  limit: number = 20,
): Promise<WalletTransaction[]> {
  if (!isValidSolanaAddress(address)) return [];
  return fetchSignatures(address, limit);
}

/**
 * Fetch fee + status detail for the recent N signatures.
 * Uses getTransaction in parallel with a hard cap to avoid blasting RPC.
 */
async function enrichTransactions(
  txs: WalletTransaction[],
  cap: number = 20,
): Promise<WalletTransaction[]> {
  const target = txs.slice(0, cap);
  const enriched = await Promise.all(
    target.map(async (t) => {
      try {
        const res = await rpcCall<{
          meta?: { fee?: number; err?: unknown } | null;
          transaction?: { message?: { instructions?: unknown[] } };
        } | null>("getTransaction", [
          t.signature,
          { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
        ]);
        const fee = Number(res?.meta?.fee ?? 0) / 1e9;
        return { ...t, fee };
      } catch (e) {
        console.log("[wallet] getTransaction error", e);
        return t;
      }
    }),
  );
  // Append any signatures we did not enrich.
  const tail = txs.slice(cap);
  return [...enriched, ...tail];
}

function computeStats(
  txs: WalletTransaction[],
  solPrice: number,
  override?: { totalTxs?: number; firstSeen?: number; lastSeen?: number },
): WalletStats {
  const successCount = txs.filter((t) => t.status !== "failed").length;
  const failedCount = txs.length - successCount;
  // If we have a real lifetime count from pagination, use it. Otherwise fall
  // back to the recent slice length so the UI is never empty.
  const totalTxs = override?.totalTxs ?? txs.length;
  const sampleSize = txs.length;
  const successRate = sampleSize > 0 ? (successCount / sampleSize) * 100 : 0;
  const totalFeesSol = txs.reduce((acc, t) => acc + (t.fee ?? 0), 0);
  const totalFeesUsd = totalFeesSol * solPrice;
  const times = txs.map((t) => t.blockTime).filter((t) => t > 0);
  const sampleFirst = times.length ? Math.min(...times) : 0;
  const sampleLast = times.length ? Math.max(...times) : 0;
  const firstSeen = override?.firstSeen && override.firstSeen > 0 ? override.firstSeen : sampleFirst;
  const lastSeen = override?.lastSeen && override.lastSeen > 0 ? override.lastSeen : sampleLast;
  const activeDays =
    firstSeen && lastSeen
      ? Math.max(1, Math.round((lastSeen - firstSeen) / 86400))
      : 0;
  const avgTxPerDay = activeDays > 0 ? totalTxs / activeDays : totalTxs;
  return {
    totalTxs,
    successCount,
    failedCount,
    successRate,
    totalFeesSol,
    totalFeesUsd,
    firstSeen,
    lastSeen,
    activeDays,
    avgTxPerDay,
  };
}

/**
 * Best-effort metadata enrichment for the top N holdings using Birdeye.
 * Adds symbol/name/logo and updates usdValue with overview price when missing.
 */
async function enrichHoldingsMeta(
  holdings: WalletTokenHolding[],
  cap: number = 12,
): Promise<WalletTokenHolding[]> {
  const top = holdings.slice(0, cap);
  const rest = holdings.slice(cap);
  const enriched = await Promise.all(
    top.map(async (h) => {
      try {
        const o = await getTokenOverview(h.mint);
        const price = Number(o?.price ?? 0);
        const next: WalletTokenHolding = {
          ...h,
          symbol: o?.symbol ?? h.symbol,
          name: o?.name ?? h.name,
          logo: o?.logoURI ?? h.logo,
        };
        if ((next.usdValue ?? 0) <= 0 && price > 0) {
          next.usdValue = h.uiAmount * price;
        }
        return next;
      } catch (e) {
        console.log("[wallet] meta enrich error", h.mint, e);
        return h;
      }
    }),
  );
  return [...enriched, ...rest];
}

/**
 * Public helper: enrich an arbitrary list of holdings with Birdeye/Jupiter/
 * Pump/Dex metadata and price. Used by the KOL portfolio path so every
 * holding (including Token-2022 mints) ends up with symbol, name, logo, and
 * a USD value.
 */
export async function enrichHoldings(
  holdings: WalletTokenHolding[],
  cap: number = 40,
): Promise<WalletTokenHolding[]> {
  return enrichHoldingsMeta(holdings, cap);
}

export async function fetchWalletPortfolio(
  address: string,
): Promise<WalletPortfolio> {
  const empty: WalletPortfolio = {
    address,
    balance: { sol: 0, usd: 0 },
    tokens: [],
    transactions: [],
    stats: {
      totalTxs: 0,
      successCount: 0,
      failedCount: 0,
      successRate: 0,
      totalFeesSol: 0,
      totalFeesUsd: 0,
      firstSeen: 0,
      lastSeen: 0,
      activeDays: 0,
      avgTxPerDay: 0,
    },
    solPrice: 0,
  };
  if (!isValidSolanaAddress(address)) return empty;

  const [balance, baseTxs, solPriceMap, lifetime] = await Promise.all([
    fetchWalletBalance(address),
    fetchWalletTransactions(address, 50),
    priceMap([SOL_MINT]),
    fetchLifetimeActivity(address),
  ]);
  const solPrice = solPriceMap[SOL_MINT] ?? 0;

  const [enrichedTxs, enrichedTokens] = await Promise.all([
    enrichTransactions(baseTxs, 20),
    enrichHoldingsMeta(balance.tokens ?? [], 40),
  ]);

  // Recompute portfolio USD with enriched values.
  let usd = balance.sol * solPrice;
  enrichedTokens.forEach((t) => {
    if (t.usdValue && t.usdValue > 0) usd += t.usdValue;
  });
  const finalBalance: WalletBalance = {
    sol: balance.sol,
    usd,
    tokens: enrichedTokens,
  };

  const stats = computeStats(enrichedTxs, solPrice, {
    totalTxs: lifetime.totalCount || enrichedTxs.length,
    firstSeen: lifetime.firstTx?.blockTime ?? 0,
    lastSeen: lifetime.lastTx?.blockTime ?? 0,
  });

  return {
    address,
    balance: finalBalance,
    tokens: enrichedTokens,
    transactions: enrichedTxs,
    stats,
    solPrice,
  };
}
