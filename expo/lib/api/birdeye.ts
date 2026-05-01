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

export async function getTokenOverview(address: string): Promise<TokenOverview> {
  return call<TokenOverview>("birdeye-token", { address });
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
  const res = await call<{ data: TokenOverview[] }>("birdeye-trending", body);
  return res.data ?? [];
}

export async function getTokenSecurity(address: string): Promise<{
  riskScore: number;
  isHoneypot: boolean;
  buyTax?: number;
  sellTax?: number;
  lpLocked?: boolean;
  topHoldersPct?: number;
}> {
  return call("birdeye-security", { address });
}
