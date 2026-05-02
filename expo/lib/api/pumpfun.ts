const PUMPFUN_FRONTEND_V3 = "https://frontend-api-v3.pump.fun";

export type PumpFunToken = {
  id?: string;
  mint?: string;
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
  const mint = token.id ?? token.mint;
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
