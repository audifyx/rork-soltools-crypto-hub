/**
 * On-chain KOL activity fetcher.
 *
 * The KOL backend stores six tracked wallet addresses but ships with an empty
 * `kol_transactions` / `kol_holdings` table because the server-side sync is a
 * stub that always returns zero. To make the KOL Scan feed actually live, we
 * fetch the data straight from Solana RPC and Jupiter price for any tracked
 * wallet — no database round-trip required.
 *
 * Strategy:
 *  - `getSignaturesForAddress` -> recent N signatures for the wallet.
 *  - `getTransaction` (jsonParsed) for each -> SPL & SOL balance deltas.
 *  - From the deltas we infer BUY / SELL / SWAP and the in/out token & amount.
 *  - Jupiter price API maps mints -> USD to fill the swap notional.
 *  - Birdeye/Jupiter token list resolves a symbol when one is missing.
 */
import { getPrice, rpcCall, getTokens } from "@/lib/api/jupiter";

export const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const STABLE_MINTS = new Set([USDC_MINT, USDT_MINT]);

export type OnchainTxType = "BUY" | "SELL" | "SWAP";

export interface OnchainSwap {
  signature: string;
  blockTime: number;
  err: boolean;
  symbolIn: string | null;
  symbolOut: string | null;
  mintIn: string | null;
  mintOut: string | null;
  amountIn: number | null;
  amountOut: number | null;
  usdValue: number | null;
  type: OnchainTxType;
}

interface RpcSignature {
  signature: string;
  blockTime: number | null;
  err: unknown | null;
  slot: number;
}

interface ParsedTokenBal {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { uiAmount: number | null; decimals: number; amount?: string };
}

interface ParsedAccountKey { pubkey: string; signer: boolean }

interface ParsedTx {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: ParsedTokenBal[];
    postTokenBalances?: ParsedTokenBal[];
  } | null;
  transaction?: {
    message?: {
      accountKeys?: Array<ParsedAccountKey | string>;
    };
  };
}

const SYMBOL_CACHE = new Map<string, string | null>();

async function lookupSymbol(mint: string): Promise<string | null> {
  if (mint === SOL_MINT_ADDRESS) return "SOL";
  if (mint === USDC_MINT) return "USDC";
  if (mint === USDT_MINT) return "USDT";
  if (SYMBOL_CACHE.has(mint)) return SYMBOL_CACHE.get(mint) ?? null;
  try {
    const rows = await getTokens(mint);
    const sym = rows[0]?.symbol ?? null;
    SYMBOL_CACHE.set(mint, sym);
    return sym;
  } catch {
    SYMBOL_CACHE.set(mint, null);
    return null;
  }
}

function pubkeyAt(keys: ParsedTx["transaction"] extends infer T ? T : never, idx: number): string | null {
  // helper kept for type-narrowing simplicity
  return null;
}

function getAccountKey(parsed: ParsedTx, idx: number): string | null {
  const keys = parsed.transaction?.message?.accountKeys ?? [];
  const k = keys[idx];
  if (!k) return null;
  if (typeof k === "string") return k;
  return k.pubkey ?? null;
}

interface Delta { mint: string; delta: number }

/**
 * Compute the SPL + SOL balance deltas attributable to a particular wallet
 * inside a single transaction. Positive = received, negative = sent.
 */
function computeWalletDeltas(parsed: ParsedTx, wallet: string): Delta[] {
  const deltas = new Map<string, number>();
  const meta = parsed.meta;
  if (!meta) return [];

  // SPL token deltas (sum over every token account that the wallet owns).
  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];
  const indexKey = (b: ParsedTokenBal) => `${b.accountIndex}:${b.mint}`;
  const preMap = new Map<string, ParsedTokenBal>();
  pre.forEach((b) => preMap.set(indexKey(b), b));
  const postMap = new Map<string, ParsedTokenBal>();
  post.forEach((b) => postMap.set(indexKey(b), b));
  const allKeys = new Set<string>([...preMap.keys(), ...postMap.keys()]);
  allKeys.forEach((k) => {
    const a = preMap.get(k);
    const b = postMap.get(k);
    const owner = b?.owner ?? a?.owner;
    if (owner !== wallet) return;
    const mint = (b?.mint ?? a?.mint) as string;
    const preAmt = Number(a?.uiTokenAmount?.uiAmount ?? 0) || 0;
    const postAmt = Number(b?.uiTokenAmount?.uiAmount ?? 0) || 0;
    const d = postAmt - preAmt;
    if (Math.abs(d) < 1e-9) return;
    deltas.set(mint, (deltas.get(mint) ?? 0) + d);
  });

  // Native SOL delta on the wallet's account index, net of any fee it paid.
  const keys = parsed.transaction?.message?.accountKeys ?? [];
  let walletIdx = -1;
  let walletSigner = false;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const pk = typeof k === "string" ? k : k?.pubkey;
    const signer = typeof k === "string" ? false : Boolean(k?.signer);
    if (pk === wallet) {
      walletIdx = i;
      walletSigner = signer;
      break;
    }
  }
  if (walletIdx >= 0) {
    const preLamports = Number(meta.preBalances?.[walletIdx] ?? 0) || 0;
    const postLamports = Number(meta.postBalances?.[walletIdx] ?? 0) || 0;
    let lamportsDelta = postLamports - preLamports;
    // The signer's post-balance already reflects the fee deduction; add it back
    // so we only credit the swap movement.
    if (walletSigner && typeof meta.fee === "number") {
      lamportsDelta += meta.fee;
    }
    const solDelta = lamportsDelta / 1e9;
    if (Math.abs(solDelta) > 0.0000005) {
      deltas.set(
        SOL_MINT_ADDRESS,
        (deltas.get(SOL_MINT_ADDRESS) ?? 0) + solDelta,
      );
    }
  }

  return Array.from(deltas.entries()).map(([mint, delta]) => ({ mint, delta }));
}

interface PartialSwap {
  signature: string;
  blockTime: number;
  err: boolean;
  mintIn: string | null;
  mintOut: string | null;
  amountIn: number | null;
  amountOut: number | null;
}

/**
 * Pick the dominant in/out from the wallet deltas, ignoring dust.
 * Out = largest positive delta. In = largest absolute negative delta.
 */
function buildPartialSwap(parsed: ParsedTx, signature: string, wallet: string): PartialSwap | null {
  const blockTime = Number(parsed.blockTime ?? 0) || 0;
  const err = Boolean(parsed.meta?.err);
  const deltas = computeWalletDeltas(parsed, wallet);
  if (deltas.length === 0) {
    return { signature, blockTime, err, mintIn: null, mintOut: null, amountIn: null, amountOut: null };
  }
  let inSide: Delta | null = null;
  let outSide: Delta | null = null;
  for (const d of deltas) {
    if (d.delta > 0) {
      if (!outSide || d.delta > outSide.delta) outSide = d;
    } else if (d.delta < 0) {
      if (!inSide || d.delta < inSide.delta) inSide = d;
    }
  }
  return {
    signature,
    blockTime,
    err,
    mintIn: inSide?.mint ?? null,
    mintOut: outSide?.mint ?? null,
    amountIn: inSide ? Math.abs(inSide.delta) : null,
    amountOut: outSide ? outSide.delta : null,
  };
}

function classify(mintIn: string | null, mintOut: string | null): OnchainTxType {
  const inIsBase = mintIn === SOL_MINT_ADDRESS || (mintIn ? STABLE_MINTS.has(mintIn) : false);
  const outIsBase = mintOut === SOL_MINT_ADDRESS || (mintOut ? STABLE_MINTS.has(mintOut) : false);
  if (mintIn && mintOut) {
    if (inIsBase && !outIsBase) return "BUY"; // spent SOL/stable, got token
    if (!inIsBase && outIsBase) return "SELL"; // sent token, got SOL/stable
    return "SWAP";
  }
  if (mintOut && !mintIn) return "BUY";
  if (mintIn && !mintOut) return "SELL";
  return "SWAP";
}

async function fetchSignatures(wallet: string, limit: number): Promise<RpcSignature[]> {
  try {
    const res = await rpcCall<RpcSignature[]>("getSignaturesForAddress", [wallet, { limit }]);
    return Array.isArray(res) ? res : [];
  } catch (e) {
    console.log("[kol-onchain] getSignaturesForAddress failed", wallet, e);
    return [];
  }
}

async function fetchParsed(signature: string): Promise<ParsedTx | null> {
  try {
    return await rpcCall<ParsedTx | null>("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    ]);
  } catch (e) {
    console.log("[kol-onchain] getTransaction failed", signature, e);
    return null;
  }
}

async function priceUsd(mints: string[]): Promise<Record<string, number>> {
  const unique = Array.from(new Set(mints.filter((m): m is string => Boolean(m))));
  if (unique.length === 0) return {};
  try {
    const map = await getPrice(unique);
    const out: Record<string, number> = {};
    Object.entries(map).forEach(([mint, p]) => {
      const price = Number((p as { price?: number }).price ?? 0);
      if (price > 0) out[mint] = price;
    });
    return out;
  } catch (e) {
    console.log("[kol-onchain] price fetch failed", e);
    return {};
  }
}

/**
 * Fetch enriched on-chain swaps for one wallet. Limits parsing concurrency
 * so we don't hammer the RPC: only the first `parsedLimit` signatures are
 * decoded, additional signatures fall back to a placeholder swap entry.
 */
export async function fetchOnchainSwaps(
  wallet: string,
  options: { limit?: number; parsedLimit?: number } = {},
): Promise<OnchainSwap[]> {
  const limit = Math.min(40, Math.max(1, options.limit ?? 20));
  const parsedLimit = Math.min(limit, options.parsedLimit ?? Math.min(20, limit));

  const sigs = await fetchSignatures(wallet, limit);
  if (sigs.length === 0) return [];

  const head = sigs.slice(0, parsedLimit);
  const tail = sigs.slice(parsedLimit);

  const parsed = await Promise.all(
    head.map(async (s) => {
      const tx = await fetchParsed(s.signature);
      if (!tx) {
        return {
          signature: s.signature,
          blockTime: Number(s.blockTime ?? 0) || 0,
          err: Boolean(s.err),
          mintIn: null,
          mintOut: null,
          amountIn: null,
          amountOut: null,
        } as PartialSwap;
      }
      const partial = buildPartialSwap(tx, s.signature, wallet);
      return (
        partial ?? ({
          signature: s.signature,
          blockTime: Number(tx.blockTime ?? s.blockTime ?? 0) || 0,
          err: Boolean(tx.meta?.err ?? s.err),
          mintIn: null,
          mintOut: null,
          amountIn: null,
          amountOut: null,
        } as PartialSwap)
      );
    }),
  );

  const tailSwaps: PartialSwap[] = tail.map((s) => ({
    signature: s.signature,
    blockTime: Number(s.blockTime ?? 0) || 0,
    err: Boolean(s.err),
    mintIn: null,
    mintOut: null,
    amountIn: null,
    amountOut: null,
  }));

  const all = [...parsed, ...tailSwaps];

  const mintsToPrice: string[] = [];
  all.forEach((p) => {
    if (p.mintIn) mintsToPrice.push(p.mintIn);
    if (p.mintOut) mintsToPrice.push(p.mintOut);
  });
  const prices = await priceUsd(mintsToPrice);

  // Resolve symbols for the unique mints encountered (cached). Keep this
  // bounded so we don't fan out too many requests per fetch.
  const uniqueMints = Array.from(
    new Set(
      all.flatMap((p) => [p.mintIn, p.mintOut].filter((m): m is string => Boolean(m))),
    ),
  ).slice(0, 24);
  const symbols = await Promise.all(uniqueMints.map(async (m) => [m, await lookupSymbol(m)] as const));
  const symbolMap = new Map<string, string>();
  symbols.forEach(([m, s]) => {
    if (s) symbolMap.set(m, s);
  });

  const out: OnchainSwap[] = all.map((p) => {
    const symbolIn = p.mintIn ? symbolMap.get(p.mintIn) ?? shortMint(p.mintIn) : null;
    const symbolOut = p.mintOut ? symbolMap.get(p.mintOut) ?? shortMint(p.mintOut) : null;
    const usdInPart = p.mintIn && p.amountIn != null ? p.amountIn * (prices[p.mintIn] ?? 0) : 0;
    const usdOutPart = p.mintOut && p.amountOut != null ? p.amountOut * (prices[p.mintOut] ?? 0) : 0;
    const usdValue = Math.max(usdInPart, usdOutPart) || null;
    const type = classify(p.mintIn, p.mintOut);
    return {
      signature: p.signature,
      blockTime: p.blockTime,
      err: p.err,
      mintIn: p.mintIn,
      mintOut: p.mintOut,
      amountIn: p.amountIn,
      amountOut: p.amountOut,
      symbolIn,
      symbolOut,
      usdValue,
      type,
    };
  });

  // sort newest first
  out.sort((a, b) => b.blockTime - a.blockTime);
  return out;
}

export function shortMint(mint: string): string {
  if (!mint) return "";
  if (mint.length <= 8) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}
