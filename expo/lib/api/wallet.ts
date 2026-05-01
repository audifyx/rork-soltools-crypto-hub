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
): Promise<WalletTransaction[]> {
  try {
    const res = await rpcCall<RpcSignaturesItem[]>(
      "getSignaturesForAddress",
      [address, { limit }],
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

export async function fetchWalletPortfolio(address: string): Promise<{
  balance: WalletBalance;
  tokens: WalletTokenHolding[];
  transactions: WalletTransaction[];
}> {
  if (!isValidSolanaAddress(address)) {
    return { balance: { sol: 0, usd: 0 }, tokens: [], transactions: [] };
  }
  const [balance, transactions] = await Promise.all([
    fetchWalletBalance(address),
    fetchWalletTransactions(address, 25),
  ]);
  return {
    balance,
    tokens: balance.tokens ?? [],
    transactions,
  };
}
