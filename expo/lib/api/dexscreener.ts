/**
 * DexScreener public API client. No key required.
 *
 * We use this so on-screen price / MC / liquidity / 24h change match the
 * embedded DexScreener chart exactly. The free endpoints update in near
 * real-time and tolerate aggressive polling (a few seconds).
 *
 * Docs: https://docs.dexscreener.com/api/reference
 */

import { useQuery } from "@tanstack/react-query";

const BASE = "https://api.dexscreener.com/latest/dex";

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; header?: string; openGraph?: string };
}

export interface DexTokenSnapshot {
  address: string;
  pair: DexPair | null;
  pairs: DexPair[];
  priceUsd: number | null;
  priceChange24hPct: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  pairAddress: string | null;
  imageUrl: string | null;
}

/** Pick the Solana pair with the deepest USD liquidity. */
function pickBestPair(pairs: DexPair[]): DexPair | null {
  const solana = pairs.filter((p) => p.chainId === "solana");
  const list = solana.length > 0 ? solana : pairs;
  if (list.length === 0) return null;
  return list.slice().sort(
    (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
  )[0];
}

function toSnapshot(address: string, pairs: DexPair[]): DexTokenSnapshot {
  const best = pickBestPair(pairs);
  return {
    address,
    pair: best,
    pairs,
    priceUsd: best?.priceUsd ? Number(best.priceUsd) : null,
    priceChange24hPct: typeof best?.priceChange?.h24 === "number" ? best!.priceChange!.h24! : null,
    liquidityUsd: best?.liquidity?.usd ?? null,
    marketCapUsd: best?.marketCap ?? best?.fdv ?? null,
    fdvUsd: best?.fdv ?? null,
    volume24hUsd: best?.volume?.h24 ?? null,
    pairAddress: best?.pairAddress ?? null,
    imageUrl: best?.info?.imageUrl ?? null,
  };
}

export async function fetchDexToken(address: string): Promise<DexTokenSnapshot> {
  const res = await fetch(`${BASE}/tokens/${address}`);
  if (!res.ok) {
    throw new Error(`dexscreener tokens ${res.status}`);
  }
  const json = (await res.json()) as { pairs?: DexPair[] | null };
  const pairs = Array.isArray(json.pairs) ? json.pairs : [];
  return toSnapshot(address, pairs);
}

export async function fetchDexTokenBatch(
  addresses: string[],
): Promise<Record<string, DexTokenSnapshot>> {
  // /tokens/{a,b,c} accepts up to ~30 comma-separated addresses
  const out: Record<string, DexTokenSnapshot> = {};
  if (addresses.length === 0) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 25) chunks.push(addresses.slice(i, i + 25));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`${BASE}/tokens/${chunk.join(",")}`);
        if (!res.ok) return;
        const json = (await res.json()) as { pairs?: DexPair[] | null };
        const pairs = Array.isArray(json.pairs) ? json.pairs : [];
        const grouped = new Map<string, DexPair[]>();
        chunk.forEach((a) => grouped.set(a, []));
        for (const p of pairs) {
          const a = p.baseToken?.address;
          if (!a) continue;
          if (!grouped.has(a)) grouped.set(a, []);
          grouped.get(a)!.push(p);
        }
        chunk.forEach((a) => {
          out[a] = toSnapshot(a, grouped.get(a) ?? []);
        });
      } catch (e) {
        console.log("[dexscreener] batch chunk failed", e);
      }
    }),
  );
  return out;
}

/**
 * Live token snapshot with price/MC/liquidity that matches the DexScreener
 * chart embed. Polls every 5 seconds.
 */
export function useDexToken(address?: string | null) {
  return useQuery<DexTokenSnapshot | null>({
    queryKey: ["dexscreener", "token", address ?? ""],
    enabled: !!address && address.length >= 32,
    queryFn: async () => {
      if (!address) return null;
      try {
        return await fetchDexToken(address);
      } catch (e) {
        console.log("[dexscreener] token fetch failed", e);
        return null;
      }
    },
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

/**
 * Batched live snapshots keyed by token address. Use for lists.
 */
export function useDexTokens(addresses: string[]) {
  const key = addresses.slice().sort().join(",");
  return useQuery<Record<string, DexTokenSnapshot>>({
    queryKey: ["dexscreener", "tokens", key],
    enabled: addresses.length > 0,
    queryFn: async () => {
      try {
        return await fetchDexTokenBatch(addresses);
      } catch (e) {
        console.log("[dexscreener] batch fetch failed", e);
        return {};
      }
    },
    refetchInterval: 8_000,
    staleTime: 5_000,
  });
}
