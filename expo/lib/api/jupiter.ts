import { supabase } from "@/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

const QUOTE_FN =
  process.env.EXPO_PUBLIC_JUPITER_QUOTE_FUNCTION ??
  `${SUPABASE_URL}/functions/v1/jupiter-quote`;
const ORDER_FN =
  process.env.EXPO_PUBLIC_JUPITER_ORDER_FUNCTION ??
  `${SUPABASE_URL}/functions/v1/jupiter-order`;
const TOKENS_FN =
  process.env.EXPO_PUBLIC_JUPITER_TOKENS_FUNCTION ??
  `${SUPABASE_URL}/functions/v1/jupiter-tokens`;
const PRICE_FN =
  process.env.EXPO_PUBLIC_JUPITER_PRICE_FUNCTION ??
  `${SUPABASE_URL}/functions/v1/jupiter-price`;
const RPC_PROXY_FN =
  process.env.EXPO_PUBLIC_RPC_PROXY_FUNCTION ??
  `${SUPABASE_URL}/functions/v1/rpc-proxy`;

export type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: unknown[];
};

export type JupiterToken = {
  address: string;
  chainId?: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
};

export type JupiterPrice = {
  id: string;
  mintSymbol?: string;
  vsToken?: string;
  vsTokenSymbol?: string;
  price: number;
};

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
    headers["Authorization"] = `Bearer ${token}`;
  } catch (e) {
    console.log("[jupiter] auth header fallback", e);
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return headers;
}

async function callEdge<T>(url: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  console.log("[jupiter] POST", url, body);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log("[jupiter] error", res.status, text);
    throw new Error(`Edge function ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string | number;
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
}): Promise<JupiterQuote> {
  return callEdge<JupiterQuote>(QUOTE_FN, params);
}

export async function buildSwapOrder(params: {
  quote: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
}): Promise<{ swapTransaction: string; lastValidBlockHeight?: number }> {
  return callEdge(ORDER_FN, params);
}

export async function getTokens(query?: string): Promise<JupiterToken[]> {
  return callEdge<JupiterToken[]>(TOKENS_FN, { query: query ?? "" });
}

export async function getPrice(ids: string[]): Promise<Record<string, JupiterPrice>> {
  const res = await callEdge<{ data: Record<string, JupiterPrice> }>(PRICE_FN, {
    ids,
  });
  return res.data ?? {};
}

export async function rpcCall<T = unknown>(
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const res = await callEdge<{ result: T; error?: { message: string } }>(
    RPC_PROXY_FN,
    {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    },
  );
  if (res.error) throw new Error(res.error.message);
  return res.result;
}

export const JUPITER_READY: boolean =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
