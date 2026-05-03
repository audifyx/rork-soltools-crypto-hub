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

import { isSafeToken } from "@/lib/safety";

const BASE = "https://api.dexscreener.com/latest/dex";
const TOKEN_PAIRS_BASE = "https://api.dexscreener.com/token-pairs/v1";
const TOKENS_V1_BASE = "https://api.dexscreener.com/tokens/v1";
const PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
const BOOSTS_URL = "https://api.dexscreener.com/token-boosts/latest/v1";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`dexscreener ${res.status}`);
  return (await res.json()) as T;
}

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
  txns?: {
    h24?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    m5?: { buys?: number; sells?: number };
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: { url: string }[];
    socials?: { type: string; url: string }[];
  };
  labels?: string[];
}

export interface DexTokenSnapshot {
  address: string;
  pair: DexPair | null;
  pairs: DexPair[];
  priceUsd: number | null;
  priceChange5mPct: number | null;
  priceChange1hPct: number | null;
  priceChange6hPct: number | null;
  priceChange24hPct: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume5mUsd: number | null;
  volume1hUsd: number | null;
  volume6hUsd: number | null;
  volume24hUsd: number | null;
  txns24h: { buys: number; sells: number } | null;
  txns1h: { buys: number; sells: number } | null;
  pairAddress: string | null;
  pairCreatedAt: number | null;
  dexId: string | null;
  imageUrl: string | null;
  websites: string[];
  socials: { type: string; url: string }[];
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
  const tx24 = best?.txns?.h24;
  const tx1 = best?.txns?.h1;
  return {
    address,
    pair: best,
    pairs,
    priceUsd: best?.priceUsd ? Number(best.priceUsd) : null,
    priceChange5mPct: typeof best?.priceChange?.m5 === "number" ? best!.priceChange!.m5! : null,
    priceChange1hPct: typeof best?.priceChange?.h1 === "number" ? best!.priceChange!.h1! : null,
    priceChange6hPct: typeof best?.priceChange?.h6 === "number" ? best!.priceChange!.h6! : null,
    priceChange24hPct: typeof best?.priceChange?.h24 === "number" ? best!.priceChange!.h24! : null,
    liquidityUsd: best?.liquidity?.usd ?? null,
    marketCapUsd: best?.marketCap ?? best?.fdv ?? null,
    fdvUsd: best?.fdv ?? null,
    volume5mUsd: best?.volume?.m5 ?? null,
    volume1hUsd: best?.volume?.h1 ?? null,
    volume6hUsd: best?.volume?.h6 ?? null,
    volume24hUsd: best?.volume?.h24 ?? null,
    txns24h: tx24 ? { buys: tx24.buys ?? 0, sells: tx24.sells ?? 0 } : null,
    txns1h: tx1 ? { buys: tx1.buys ?? 0, sells: tx1.sells ?? 0 } : null,
    pairAddress: best?.pairAddress ?? null,
    pairCreatedAt: best?.pairCreatedAt ?? null,
    dexId: best?.dexId ?? null,
    imageUrl: best?.info?.imageUrl ?? null,
    websites: (best?.info?.websites ?? []).map((w) => w.url).filter(Boolean),
    socials: best?.info?.socials ?? [],
  };
}

async function fetchDexPairsForToken(address: string): Promise<DexPair[]> {
  const mint = address.trim();
  const attempts: Array<() => Promise<DexPair[]>> = [
    async () => {
      const json = await fetchJson<{ pairs?: DexPair[] | null }>(`${BASE}/tokens/${encodeURIComponent(mint)}`);
      return Array.isArray(json.pairs) ? json.pairs : [];
    },
    async () => {
      const json = await fetchJson<DexPair[]>(`${TOKEN_PAIRS_BASE}/solana/${encodeURIComponent(mint)}`);
      return Array.isArray(json) ? json : [];
    },
    async () => {
      const json = await fetchJson<DexPair[]>(`${TOKENS_V1_BASE}/solana/${encodeURIComponent(mint)}`);
      return Array.isArray(json) ? json : [];
    },
    async () => {
      const json = await fetchJson<{ pairs?: DexPair[] | null }>(`${BASE}/search?q=${encodeURIComponent(mint)}`);
      const pairs = Array.isArray(json.pairs) ? json.pairs : [];
      return pairs.filter(
        (p) => p.chainId === "solana" &&
          (p.baseToken?.address === mint || p.quoteToken?.address === mint || p.pairAddress === mint),
      );
    },
  ];

  const errors: unknown[] = [];
  for (const attempt of attempts) {
    try {
      const pairs = await attempt();
      if (pairs.length > 0) return pairs;
    } catch (e) {
      errors.push(e);
    }
  }
  if (errors.length > 0) {
    console.log("[dexscreener] token fallbacks exhausted", errors[0]);
  }
  return [];
}

export async function fetchDexToken(address: string): Promise<DexTokenSnapshot> {
  const mint = address.trim();
  const pairs = await fetchDexPairsForToken(mint);
  return toSnapshot(mint, pairs);
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
        const encoded = chunk.map((a) => encodeURIComponent(a)).join(",");
        let pairs: DexPair[] = [];
        try {
          const json = await fetchJson<{ pairs?: DexPair[] | null }>(`${BASE}/tokens/${encoded}`);
          pairs = Array.isArray(json.pairs) ? json.pairs : [];
        } catch {
          const json = await fetchJson<DexPair[]>(`${TOKENS_V1_BASE}/solana/${encoded}`);
          pairs = Array.isArray(json) ? json : [];
        }
        const grouped = new Map<string, DexPair[]>();
        chunk.forEach((a) => grouped.set(a, []));
        for (const p of pairs) {
          const candidates = [p.baseToken?.address, p.quoteToken?.address].filter((a): a is string => !!a);
          for (const a of candidates) {
            if (!grouped.has(a)) grouped.set(a, []);
            grouped.get(a)!.push(p);
          }
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

interface DexProfileEntry {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
}

/**
 * Fetches the freshest Solana pairs from DexScreener: combines the latest
 * token profiles + boosts feeds, then enriches with /tokens to get price,
 * liquidity, MC, and pairCreatedAt. Sorted youngest pair first.
 */
export async function searchSolanaPairs(query: string, limit: number = 20): Promise<DexPair[]> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error(`dexscreener search ${res.status}`);
  }
  const json = (await res.json()) as { pairs?: DexPair[] | null };
  const pairs = Array.isArray(json.pairs) ? json.pairs : [];
  return pairs
    .filter((p) => p.chainId === "solana")
    .filter((p) =>
      isSafeToken({
        marketCapUsd: p.marketCap ?? p.fdv ?? null,
        liquidityUsd: p.liquidity?.usd ?? null,
        priceChange24hPct: p.priceChange?.h24 ?? null,
        labels: p.labels,
        launchpad: p.dexId,
      }),
    )
    .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
    .slice(0, limit);
}

export async function getNewSolanaPairs(limit: number = 20): Promise<DexPair[]> {
  const addresses = new Set<string>();
  await Promise.all(
    [PROFILES_URL, BOOSTS_URL].map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as DexProfileEntry[] | { data?: DexProfileEntry[] };
        const list = Array.isArray(json) ? json : (json.data ?? []);
        for (const e of list) {
          if (e?.chainId === "solana" && e.tokenAddress) addresses.add(e.tokenAddress);
        }
      } catch (e) {
        console.log("[dexscreener] profiles fetch failed", e);
      }
    }),
  );
  const addrList = Array.from(addresses).slice(0, 60);
  if (addrList.length === 0) return [];
  const snapshots = await fetchDexTokenBatch(addrList);
  const pairs: DexPair[] = [];
  for (const a of addrList) {
    const snap = snapshots[a];
    if (!snap?.pair || snap.pair.chainId !== "solana") continue;
    const safe = isSafeToken({
      marketCapUsd: snap.marketCapUsd,
      liquidityUsd: snap.liquidityUsd,
      priceChange24hPct: snap.priceChange24hPct,
      labels: snap.pair.labels,
      launchpad: snap.dexId,
    });
    if (!safe) continue;
    pairs.push(snap.pair);
  }
  pairs.sort((a, b) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0));
  return pairs.slice(0, limit);
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
