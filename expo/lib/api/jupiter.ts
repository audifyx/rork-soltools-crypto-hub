import { fetchPumpFunToken } from "@/lib/api/pumpfun";
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
const JUPITER_PRICE_DIRECT = "https://lite-api.jup.ag/price/v3";
const JUPITER_TOKENS_DIRECT = "https://lite-api.jup.ag/tokens/v2/search";
const JUPITER_QUOTE_DIRECT = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_DIRECT = "https://lite-api.jup.ag/swap/v1/swap";
const RPC_DIRECT =
  process.env.EXPO_PUBLIC_ALCHEMY_SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

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

async function directQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string | number;
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
}): Promise<JupiterQuote> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    slippageBps: String(params.slippageBps ?? 50),
  });
  if (params.onlyDirectRoutes != null) qs.set("onlyDirectRoutes", String(params.onlyDirectRoutes));
  const res = await fetch(`${JUPITER_QUOTE_DIRECT}?${qs.toString()}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Jupiter quote ${res.status}: ${text}`);
  return JSON.parse(text) as JupiterQuote;
}

async function directSwapOrder(params: {
  quote: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
}): Promise<{ swapTransaction: string; lastValidBlockHeight?: number }> {
  const res = await fetch(JUPITER_SWAP_DIRECT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: params.quote,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jupiter swap ${res.status}: ${text}`);
  return JSON.parse(text) as { swapTransaction: string; lastValidBlockHeight?: number };
}

function looksLikeSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

async function pumpFunTokenSearch(query: string): Promise<JupiterToken[]> {
  if (!looksLikeSolanaAddress(query)) return [];
  const token = await fetchPumpFunToken(query);
  if (!token) return [];
  const address = token.id ?? token.mint ?? query;
  return [{
    address,
    decimals: Number(token.decimals ?? 0),
    name: token.name ?? token.symbol ?? "Unknown token",
    symbol: token.symbol ?? "TOKEN",
    logoURI: token.icon ?? token.image_uri,
    tags: [token.launchpad, ...(token.tags ?? [])].filter((tag): tag is string => !!tag),
  }];
}

async function directTokens(query?: string): Promise<JupiterToken[]> {
  const q = (query ?? "").trim() || "SOL,JUP,USDC,BONK";
  const res = await fetch(`${JUPITER_TOKENS_DIRECT}?query=${encodeURIComponent(q)}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Jupiter tokens ${res.status}: ${text}`);
  const rows = JSON.parse(text) as Array<{
    id?: string;
    address?: string;
    decimals?: number;
    name?: string;
    symbol?: string;
    icon?: string;
    logoURI?: string;
    tags?: string[];
  }>;
  return rows.map((row): JupiterToken => ({
    address: row.address ?? row.id ?? "",
    decimals: Number(row.decimals ?? 0),
    name: row.name ?? row.symbol ?? "Unknown token",
    symbol: row.symbol ?? "TOKEN",
    logoURI: row.logoURI ?? row.icon,
    tags: row.tags,
  })).filter((row) => row.address.length > 0);
}

async function directPrice(ids: string[]): Promise<Record<string, JupiterPrice>> {
  if (ids.length === 0) return {};
  const res = await fetch(`${JUPITER_PRICE_DIRECT}?ids=${encodeURIComponent(ids.join(","))}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Jupiter price ${res.status}: ${text}`);
  const rows = JSON.parse(text) as Record<string, { usdPrice?: number; price?: number }>;
  const out: Record<string, JupiterPrice> = {};
  Object.entries(rows).forEach(([id, row]) => {
    out[id] = { id, price: Number(row.usdPrice ?? row.price ?? 0) };
  });
  return out;
}

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string | number;
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
}): Promise<JupiterQuote> {
  try {
    return await callEdge<JupiterQuote>(QUOTE_FN, params);
  } catch (e) {
    console.log("[jupiter] quote direct fallback", e instanceof Error ? e.message : e);
    return directQuote(params);
  }
}

export async function buildSwapOrder(params: {
  quote: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
}): Promise<{ swapTransaction: string; lastValidBlockHeight?: number }> {
  try {
    return await callEdge(ORDER_FN, params);
  } catch (e) {
    console.log("[jupiter] order direct fallback", e instanceof Error ? e.message : e);
    return directSwapOrder(params);
  }
}

export async function getTokens(query?: string): Promise<JupiterToken[]> {
  const q = (query ?? "").trim();
  try {
    const edgeRows = await callEdge<JupiterToken[]>(TOKENS_FN, { query: q });
    if (Array.isArray(edgeRows) && edgeRows.length > 0) return edgeRows;
  } catch (e) {
    console.log("[jupiter] tokens direct fallback", e instanceof Error ? e.message : e);
  }

  try {
    const directRows = await directTokens(q);
    if (directRows.length > 0) return directRows;
  } catch (e) {
    console.log("[jupiter] tokens pump.fun fallback", e instanceof Error ? e.message : e);
  }

  return pumpFunTokenSearch(q);
}

export async function getPrice(ids: string[]): Promise<Record<string, JupiterPrice>> {
  try {
    const res = await callEdge<{ data: Record<string, JupiterPrice> }>(PRICE_FN, {
      ids,
    });
    return res.data ?? {};
  } catch (e) {
    console.log("[jupiter] price direct fallback", e instanceof Error ? e.message : e);
    return directPrice(ids);
  }
}

export async function rpcCall<T = unknown>(
  method: string,
  params: unknown[] | Record<string, unknown> = [],
): Promise<T> {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  };
  try {
    const res = await callEdge<{ result: T; error?: { message: string } }>(
      RPC_PROXY_FN,
      payload,
    );
    if (res.error) throw new Error(res.error.message);
    return res.result;
  } catch (e) {
    console.log("[jupiter] rpc direct fallback", e instanceof Error ? e.message : e);
    const res = await fetch(RPC_DIRECT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { result: T; error?: { message: string } };
    if (!res.ok || json.error) throw new Error(json.error?.message ?? `RPC ${res.status}`);
    return json.result;
  }
}

export const JUPITER_READY: boolean =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
