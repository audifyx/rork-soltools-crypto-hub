const PUMPFUN_FRONTEND_V3 = "https://frontend-api-v3.pump.fun";

export type PumpFunToken = {
  id?: string;
  mint?: string;
  address?: string;
  name?: string;
  symbol?: string;
  icon?: string;
  image_uri?: string;
  description?: string;
  decimals?: number;
  twitter?: string;
  telegram?: string;
  website?: string;
  dev?: string;
  circSupply?: number;
  totalSupply?: number;
  tokenProgram?: string;
  launchpad?: string;
  graduatedPool?: string;
  graduatedAt?: string;
  holderCount?: number;
  fdv?: number;
  mcap?: number;
  usdPrice?: number;
  liquidity?: number;
  stats5m?: PumpFunStats;
  stats1h?: PumpFunStats;
  stats6h?: PumpFunStats;
  stats24h?: PumpFunStats;
  firstPool?: { id?: string; createdAt?: string };
  audit?: Record<string, unknown>;
  organicScore?: number;
  organicScoreLabel?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  created_timestamp?: number;
  last_trade_timestamp?: number;
  raydium_pool?: string;
  complete?: boolean;
};

export type PumpFunStats = {
  priceChange?: number;
  holderChange?: number;
  liquidityChange?: number;
  volumeChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  numBuys?: number;
  numSells?: number;
  numTraders?: number;
};

function asPumpFunToken(value: unknown): PumpFunToken | null {
  if (!value || typeof value !== "object") return null;
  const token = value as PumpFunToken;
  const mint = token.id ?? token.mint ?? token.address;
  if (!mint || typeof mint !== "string") return null;
  return token;
}

/** Fetches Pump.fun / PumpSwap metadata for mints that Jupiter/Birdeye may not index yet. */
export async function fetchPumpFunToken(address: string): Promise<PumpFunToken | null> {
  const mint = address.trim();
  if (!mint) return null;
  try {
    const res = await fetch(`${PUMPFUN_FRONTEND_V3}/coins/${encodeURIComponent(mint)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const row = Array.isArray(json) ? json[0] : json;
    return asPumpFunToken(row);
  } catch (e) {
    console.log("[pumpfun] token fetch failed", e instanceof Error ? e.message : e);
    return null;
  }
}

export function pumpFunVolume24h(token: PumpFunToken | null | undefined): number | null {
  const stats = token?.stats24h;
  if (!stats) return null;
  const volume = (stats.buyVolume ?? 0) + (stats.sellVolume ?? 0);
  return Number.isFinite(volume) && volume > 0 ? volume : null;
}

function normalizePumpFunList(json: unknown): PumpFunToken[] {
  const raw = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: unknown[] })?.data)
      ? (json as { data: unknown[] }).data
      : Array.isArray((json as { coins?: unknown[] })?.coins)
        ? (json as { coins: unknown[] }).coins
        : [];
  return raw.map(asPumpFunToken).filter((token): token is PumpFunToken => token != null);
}

async function fetchPumpFunListUrl(url: string): Promise<PumpFunToken[]> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    return normalizePumpFunList(await res.json());
  } catch (e) {
    console.log("[pumpfun] list fetch failed", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Fetches multiple Pump.fun/PumpSwap discovery pages so Discover can show
 * hundreds of fresh launches, migrations, and current runners instead of the
 * small DexScreener profile cap.
 */
export async function fetchPumpFunDiscoveryTokens(limit: number = 300): Promise<PumpFunToken[]> {
  const pageSize = 50;
  const offsets = Array.from({ length: Math.ceil(Math.min(limit, 500) / pageSize) }, (_, i) => i * pageSize);
  const queries = [
    ...offsets.map((offset) =>
      `${PUMPFUN_FRONTEND_V3}/coins?offset=${offset}&limit=${pageSize}&sort=created_timestamp&order=DESC&includeNsfw=false`,
    ),
    ...offsets.slice(0, 4).map((offset) =>
      `${PUMPFUN_FRONTEND_V3}/coins?offset=${offset}&limit=${pageSize}&sort=last_trade_timestamp&order=DESC&includeNsfw=false`,
    ),
    ...offsets.slice(0, 4).map((offset) =>
      `${PUMPFUN_FRONTEND_V3}/coins?offset=${offset}&limit=${pageSize}&sort=market_cap&order=DESC&includeNsfw=false`,
    ),
  ];

  const rows = (await Promise.all(queries.map(fetchPumpFunListUrl))).flat();
  const map = new Map<string, PumpFunToken>();
  rows.forEach((token) => {
    const key = token.id ?? token.mint ?? token.address;
    if (!key) return;
    const existing = map.get(key);
    map.set(key, existing ? { ...existing, ...token } : token);
  });
  return Array.from(map.values()).slice(0, limit);
}
