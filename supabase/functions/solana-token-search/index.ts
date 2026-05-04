import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Json = Record<string, unknown>;

type DexPair = {
  chainId?: string;
  pairAddress?: string;
  dexId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  marketCap?: number;
  fdv?: number;
  info?: { imageUrl?: string };
};

type JupiterRow = {
  id?: string;
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  icon?: string;
  logoURI?: string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADDRESS_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

type BridgedEntry = { symbol: string; coingeckoId: string; nameContains: string[] };
const BRIDGED_REGISTRY: BridgedEntry[] = [
  { symbol: "ZEC", coingeckoId: "zcash", nameContains: ["zcash"] },
  { symbol: "BTC", coingeckoId: "bitcoin", nameContains: ["bitcoin"] },
  { symbol: "WBTC", coingeckoId: "wrapped-bitcoin", nameContains: ["bitcoin"] },
  { symbol: "ETH", coingeckoId: "ethereum", nameContains: ["ethereum", "ether"] },
  { symbol: "WETH", coingeckoId: "weth", nameContains: ["ethereum", "ether"] },
  { symbol: "LTC", coingeckoId: "litecoin", nameContains: ["litecoin"] },
  { symbol: "BCH", coingeckoId: "bitcoin-cash", nameContains: ["bitcoin cash"] },
  { symbol: "DOGE", coingeckoId: "dogecoin", nameContains: ["dogecoin"] },
  { symbol: "ADA", coingeckoId: "cardano", nameContains: ["cardano"] },
  { symbol: "DOT", coingeckoId: "polkadot", nameContains: ["polkadot"] },
  { symbol: "AVAX", coingeckoId: "avalanche-2", nameContains: ["avalanche"] },
  { symbol: "MATIC", coingeckoId: "matic-network", nameContains: ["matic", "polygon"] },
  { symbol: "POL", coingeckoId: "matic-network", nameContains: ["polygon"] },
  { symbol: "SUI", coingeckoId: "sui", nameContains: ["sui"] },
  { symbol: "APT", coingeckoId: "aptos", nameContains: ["aptos"] },
  { symbol: "XRP", coingeckoId: "ripple", nameContains: ["xrp", "ripple"] },
  { symbol: "TRX", coingeckoId: "tron", nameContains: ["tron"] },
  { symbol: "ATOM", coingeckoId: "cosmos", nameContains: ["cosmos"] },
  { symbol: "LINK", coingeckoId: "chainlink", nameContains: ["chainlink"] },
  { symbol: "UNI", coingeckoId: "uniswap", nameContains: ["uniswap"] },
  { symbol: "AAVE", coingeckoId: "aave", nameContains: ["aave"] },
  { symbol: "BNB", coingeckoId: "binancecoin", nameContains: ["bnb", "binance"] },
  { symbol: "TON", coingeckoId: "the-open-network", nameContains: ["toncoin", "ton"] },
  { symbol: "XMR", coingeckoId: "monero", nameContains: ["monero"] },
  { symbol: "FIL", coingeckoId: "filecoin", nameContains: ["filecoin"] },
  { symbol: "NEAR", coingeckoId: "near", nameContains: ["near"] },
  { symbol: "ARB", coingeckoId: "arbitrum", nameContains: ["arbitrum"] },
  { symbol: "OP", coingeckoId: "optimism", nameContains: ["optimism"] },
  { symbol: "INJ", coingeckoId: "injective-protocol", nameContains: ["injective"] },
  { symbol: "SEI", coingeckoId: "sei-network", nameContains: ["sei"] },
  { symbol: "TIA", coingeckoId: "celestia", nameContains: ["celestia"] },
  { symbol: "RNDR", coingeckoId: "render-token", nameContains: ["render"] },
  { symbol: "RENDER", coingeckoId: "render-token", nameContains: ["render"] },
];

async function fetchCanonicalBridgedMarketCap(symbol: string | null, name: string | null): Promise<number | null> {
  const sym = (symbol ?? "").trim().toUpperCase();
  const lname = (name ?? "").trim().toLowerCase();
  if (!sym) return null;
  const entry = BRIDGED_REGISTRY.find(
    (e) => e.symbol === sym && e.nameContains.some((n) => lname.includes(n)),
  );
  if (!entry) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(entry.coingeckoId)}&precision=0`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id?: string; market_cap?: number }>;
    const row = Array.isArray(rows) ? rows.find((r) => r.id === entry.coingeckoId) ?? rows[0] ?? null : null;
    return typeof row?.market_cap === "number" && Number.isFinite(row.market_cap) ? row.market_cap : null;
  } catch (e) {
    console.log("[solana-token-search] bridged mc fetch failed", e instanceof Error ? e.message : e);
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractAddress(input: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(input);
    } catch {
      return input;
    }
  })();
  return decoded.match(ADDRESS_RE)?.[0] ?? null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Json;
    const query = String(body.query ?? body.address ?? "");
    const address = extractAddress(query);
    if (!address) return json({ error: "Invalid Solana token address" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    if (supabase) {
      const { data: cached } = await supabase
        .from("token_search_cache")
        .select("*")
        .eq("token_address", address)
        .gte("scanned_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .maybeSingle();
      if (cached) {
        const cachedSymbol = cached.symbol ?? "TOKEN";
        const cachedName = cached.name ?? cached.symbol ?? "Unknown token";
        const cachedCanonical = await fetchCanonicalBridgedMarketCap(cachedSymbol, cachedName);
        return json({
          address: cached.token_address,
          chain: "solana",
          symbol: cached.symbol ?? "TOKEN",
          name: cached.name ?? cached.symbol ?? "Unknown token",
          logoUrl: cached.logo_url,
          priceUsd: num(cached.price_usd),
          change24h: num(cached.change_24h),
          marketCapUsd: cachedCanonical ?? num(cached.market_cap_usd),
          liquidityUsd: num(cached.liquidity_usd),
          volume24hUsd: num(cached.volume_24h_usd),
          pairAddress: cached.pair_address,
          decimals: cached.decimals,
          holderCount: cached.holder_count,
          metadata: cached.metadata ?? {},
          scannedAt: new Date(cached.scanned_at).getTime(),
        });
      }
    }

    const [dex, jupRows] = await Promise.all([
      fetchJson<{ pairs?: DexPair[] }>(`https://api.dexscreener.com/latest/dex/tokens/${address}`),
      fetchJson<JupiterRow[]>(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(address)}`),
    ]);

    const pair = (dex?.pairs ?? []).find((p) => p.chainId === "solana" && p.baseToken?.address === address) ??
      (dex?.pairs ?? []).find((p) => p.chainId === "solana") ?? null;
    const jup = Array.isArray(jupRows) ? (jupRows.find((r) => (r.address ?? r.id) === address) ?? jupRows[0] ?? null) : null;
    const now = Date.now();
    const dexMarketCap = num(pair?.marketCap ?? pair?.fdv);
    const symbol = pair?.baseToken?.symbol ?? jup?.symbol ?? "TOKEN";
    const name = pair?.baseToken?.name ?? jup?.name ?? jup?.symbol ?? "Unknown Solana token";
    const canonicalMarketCap = await fetchCanonicalBridgedMarketCap(symbol, name);
    const result = {
      address,
      chain: "solana" as const,
      symbol,
      name,
      logoUrl: pair?.info?.imageUrl ?? jup?.logoURI ?? jup?.icon ?? null,
      priceUsd: num(pair?.priceUsd),
      change24h: num(pair?.priceChange?.h24),
      marketCapUsd: canonicalMarketCap ?? dexMarketCap,
      liquidityUsd: num(pair?.liquidity?.usd),
      volume24hUsd: num(pair?.volume?.h24),
      pairAddress: pair?.pairAddress ?? null,
      decimals: typeof jup?.decimals === "number" ? jup.decimals : null,
      holderCount: null,
      metadata: { source: "edge", dexId: pair?.dexId ?? null, bridgedMarketCap: canonicalMarketCap != null },
      scannedAt: now,
    };

    if (supabase) {
      await supabase.rpc("upsert_token_search_cache", {
        p_token_address: result.address,
        p_symbol: result.symbol,
        p_name: result.name,
        p_logo_url: result.logoUrl,
        p_price_usd: result.priceUsd,
        p_change_24h: result.change24h,
        p_market_cap_usd: result.marketCapUsd,
        p_liquidity_usd: result.liquidityUsd,
        p_volume_24h_usd: result.volume24hUsd,
        p_pair_address: result.pairAddress,
        p_decimals: result.decimals,
        p_holder_count: result.holderCount,
        p_metadata: result.metadata,
      });
    }

    return json(result);
  } catch (error) {
    console.error("[solana-token-search]", error instanceof Error ? error.message : error);
    return json({ error: "Token search failed" }, 500);
  }
});
