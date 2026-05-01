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
  priceChange24h?: number;
  liquidity?: number;
  marketCap?: number;
  holder?: number;
  logoURI?: string;
};

export async function getTokenOverview(address: string): Promise<TokenOverview> {
  return call<TokenOverview>("birdeye-token", { address });
}

export async function getTrending(limit: number = 20): Promise<TokenOverview[]> {
  const res = await call<{ data: TokenOverview[] }>("birdeye-trending", { limit });
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
