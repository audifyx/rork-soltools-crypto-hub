import { fetchDexToken, getNewSolanaPairs, type DexPair } from "@/lib/api/dexscreener";
import { fetchPumpFunToken, pumpFunVolume24h } from "@/lib/api/pumpfun";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function call<T>(path: string, body: unknown): Promise<T> {
  const url = `${SUPABASE_URL}/functions/v1/${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  try {
    const { data } = await supabase.auth.getSession();
    headers["Authorization"] = `Bearer ${data.session?.access_token ?? SUPABASE_ANON_KEY}`;
  } catch {
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  console.log("[birdeye] POST", url, body);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${path} ${res.status}: ${t}`);
  }
  return (await res.json()) as T;
}

export type TokenOverview = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price: number;
  priceChange1h?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  liquidity?: number;
  marketCap?: number;
  volume24hUSD?: number;
  holder?: number;
  rank?: number;
  logoURI?: string;
};

export type TrendingTimeframe = "1h" | "24h" | "7d";
export type TrendingSortBy = "rank" | "volume24hUSD" | "liquidity" | "priceChangePercent";
export type TrendingSortType = "asc" | "desc";

export type TrendingOpts = {
  limit?: number;
  sort_by?: TrendingSortBy;
  sort_type?: TrendingSortType;
  timeframe?: TrendingTimeframe;
};

type JupiterTokenSearchRow = {
  id?: string;
  address?: string;
  mint?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  icon?: string;
  logoURI?: string;
  holderCount?: number;
  mcap?: number;
  liquidity?: number;
};

async function fetchJupiterToken(address: string): Promise<JupiterTokenSearchRow | null> {
  const url = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as JupiterTokenSearchRow[];
  return Array.isArray(json) ? json[0] ?? null : null;
}

function pairToOverview(pair: DexPair, fallbackAddress: string, rank?: number): TokenOverview {
  return {
    address: pair.baseToken?.address ?? fallbackAddress,
    symbol: pair.baseToken?.symbol ?? "TOKEN",
    name: pair.baseToken?.name ?? pair.baseToken?.symbol ?? "Unknown token",
    decimals: 0,
    price: pair.priceUsd ? Number(pair.priceUsd) : 0,
    priceChange1h: pair.priceChange?.h1,
    priceChange24h: pair.priceChange?.h24,
    liquidity: pair.liquidity?.usd,
    marketCap: pair.marketCap ?? pair.fdv,
    volume24hUSD: pair.volume?.h24,
    logoURI: pair.info?.imageUrl,
    rank,
  };
}

async function fallbackTokenOverview(address: string): Promise<TokenOverview> {
  const [dexResult, pumpResult, jupResult] = await Promise.allSettled([
    fetchDexToken(address),
    fetchPumpFunToken(address),
    fetchJupiterToken(address),
  ]);
  const dex = dexResult.status === "fulfilled" ? dexResult.value : null;
  const pump = pumpResult.status === "fulfilled" ? pumpResult.value : null;
  const jup = jupResult.status === "fulfilled" ? jupResult.value : null;
  const pair = dex?.pair ?? null;

  return {
    address,
    symbol: pump?.symbol ?? jup?.symbol ?? pair?.baseToken?.symbol ?? "TOKEN",
    name: pump?.name ?? jup?.name ?? pair?.baseToken?.name ?? "Unknown token",
    decimals: Number(pump?.decimals ?? jup?.decimals ?? 0),
    price: pump?.usdPrice ?? dex?.priceUsd ?? 0,
    priceChange1h: pump?.stats1h?.priceChange ?? dex?.priceChange1hPct ?? undefined,
    priceChange24h: pump?.stats24h?.priceChange ?? dex?.priceChange24hPct ?? undefined,
    liquidity: pump?.liquidity ?? dex?.liquidityUsd ?? jup?.liquidity ?? undefined,
    marketCap: pump?.mcap ?? pump?.fdv ?? dex?.marketCapUsd ?? jup?.mcap ?? undefined,
    volume24hUSD: pumpFunVolume24h(pump) ?? dex?.volume24hUsd ?? undefined,
    holder: pump?.holderCount ?? jup?.holderCount,
    logoURI: pump?.icon ?? pump?.image_uri ?? jup?.icon ?? jup?.logoURI ?? dex?.imageUrl ?? undefined,
  };
}

export async function getTokenOverview(address: string): Promise<TokenOverview> {
  try {
    return await call<TokenOverview>("birdeye-token", { address });
  } catch (e) {
    console.log("[birdeye] token fallback", e instanceof Error ? e.message : e);
    return fallbackTokenOverview(address);
  }
}

export async function getTrending(
  optsOrLimit: TrendingOpts | number = 20,
): Promise<TokenOverview[]> {
  const opts: TrendingOpts =
    typeof optsOrLimit === "number" ? { limit: optsOrLimit } : optsOrLimit;
  const body = {
    limit: opts.limit ?? 20,
    sort_by: opts.sort_by ?? "rank",
    sort_type: opts.sort_type ?? "desc",
    timeframe: opts.timeframe ?? "24h",
  } as const;
  try {
    const res = await call<{ data: TokenOverview[] }>("birdeye-trending", body);
    return res.data ?? [];
  } catch (e) {
    console.log("[birdeye] trending fallback", e instanceof Error ? e.message : e);
    const pairs = await getNewSolanaPairs(body.limit);
    return pairs.map((pair, index) => pairToOverview(pair, pair.baseToken?.address ?? "", index + 1));
  }
}

export async function getTokenSecurity(address: string): Promise<{
  riskScore: number;
  isHoneypot: boolean;
  buyTax?: number;
  sellTax?: number;
  lpLocked?: boolean;
  topHoldersPct?: number;
}> {
  try {
    return await call("birdeye-security", { address });
  } catch (e) {
    console.log("[birdeye] security fallback", e instanceof Error ? e.message : e);
    return { riskScore: 50, isHoneypot: false };
  }
}
