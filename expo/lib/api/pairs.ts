import { LaunchToken, LaunchVenue } from "@/types/launchpad";
import { isSafeToken } from "@/lib/safety";

const JUP_LITE = "https://lite-api.jup.ag";

/**
 * Tokens with at least this much 24h volume (USD) are retained on the launchpad
 * across daily refresh cycles. Anything below drops off as new pairs come in.
 */
export const MIN_RETAIN_VOLUME_USD = 300_000;

type JupTokenV2 = {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  circSupply?: number;
  totalSupply?: number;
  launchpad?: string;
  fdv?: number;
  mcap?: number;
  usdPrice?: number;
  liquidity?: number;
  holderCount?: number;
  organicScore?: number;
  organicScoreLabel?: "low" | "medium" | "high";
  tags?: string[];
  createdAt?: string;
  stats24h?: {
    priceChange?: number;
    buyVolume?: number;
    sellVolume?: number;
    numBuys?: number;
    numSells?: number;
  };
  stats1h?: { priceChange?: number };
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    devBalancePercentage?: number;
  };
};

function mapVenue(launchpad?: string): LaunchVenue {
  const v = (launchpad ?? "").toLowerCase();
  if (v.includes("pump")) return "pumpfun";
  if (v.includes("raydium")) return "raydium";
  if (v.includes("meteora")) return "meteora";
  if (v.includes("jupiter")) return "jupiter";
  return "other";
}

function toLaunchToken(t: JupTokenV2, opts: { hot?: boolean; featured?: boolean }): LaunchToken {
  const change = t.stats24h?.priceChange;
  const vol = (t.stats24h?.buyVolume ?? 0) + (t.stats24h?.sellVolume ?? 0);
  const created = t.createdAt ? new Date(t.createdAt).getTime() : Date.now();
  const venue = mapVenue(t.launchpad);
  return {
    id: t.id,
    name: t.name || t.symbol || "Unknown",
    ticker: (t.symbol || "").toUpperCase(),
    description: "",
    logoUrl: t.icon ?? null,
    bannerUrl: null,
    contract: t.id,
    venue,
    status: "live",
    tags: t.tags ?? [],
    featured: !!opts.featured,
    hot: !!opts.hot || (vol > 50_000),
    verified: t.organicScoreLabel === "high",
    createdAt: created,
    submittedBy: "system",
    price: t.usdPrice ?? null,
    change24hPct: typeof change === "number" ? change : null,
    liquidityUsd: t.liquidity ?? null,
    marketCapUsd: t.mcap ?? null,
    volume24hUsd: vol > 0 ? vol : null,
    holders: t.holderCount ?? null,
    upvotes: Math.max(0, Math.round((t.organicScore ?? 0) * 10)),
    watchers: 0,
  };
}

async function fetchList(path: string): Promise<JupTokenV2[]> {
  try {
    const res = await fetch(`${JUP_LITE}${path}`);
    if (!res.ok) {
      console.log("[pairs] fetch failed", path, res.status);
      return [];
    }
    const json = (await res.json()) as JupTokenV2[];
    return Array.isArray(json) ? json : [];
  } catch (e) {
    console.log("[pairs] fetch error", path, e);
    return [];
  }
}

/**
 * Live new pairs from Jupiter's public Lite API. No key required.
 */
function safeFromJupiter(t: JupTokenV2, lt: LaunchToken): boolean {
  return isSafeToken({
    marketCapUsd: lt.marketCapUsd,
    liquidityUsd: lt.liquidityUsd,
    priceChange24hPct: lt.change24hPct,
    venue: lt.venue,
    launchpad: t.launchpad,
    tags: t.tags,
    audit: t.audit,
    organicScoreLabel: t.organicScoreLabel,
  });
}

export async function fetchNewPairs(): Promise<LaunchToken[]> {
  const items = await fetchList("/tokens/v2/recent");
  return items
    .map((t) => ({ t, lt: toLaunchToken(t, { hot: false }) }))
    .filter(({ t, lt }) => safeFromJupiter(t, lt))
    .slice(0, 60)
    .map(({ lt }) => lt);
}

/**
 * Top traded tokens in the last 24h. We mark these as hot.
 */
export async function fetchTopTraded(): Promise<LaunchToken[]> {
  const items = await fetchList("/tokens/v2/toptraded/24h");
  return items
    .map((t) => ({ t, lt: toLaunchToken(t, { hot: true }) }))
    .filter(({ t, lt }) => safeFromJupiter(t, lt))
    .slice(0, 40)
    .map(({ lt }) => lt);
}

/**
 * Top organic-score tokens. Used for ranking signal only — featured flag is
 * NEVER set automatically; that is reserved for admin-curated tokens.
 */
export async function fetchTopOrganic(): Promise<LaunchToken[]> {
  const items = await fetchList("/tokens/v2/toporganicscore/24h");
  return items
    .map((t) => ({ t, lt: toLaunchToken(t, {}) }))
    .filter(({ t, lt }) => safeFromJupiter(t, lt))
    .slice(0, 30)
    .map(({ lt }) => lt);
}

/**
 * Live launchpad feed: today's brand-new pairs + every token still doing
 * MIN_RETAIN_VOLUME_USD or more in 24h volume. Refreshes 24/7 — anything
 * that drops below the threshold falls off the list automatically.
 * Featured flag is intentionally never set here.
 */
export async function fetchLivePairs(): Promise<LaunchToken[]> {
  const [newp, top, organic] = await Promise.all([
    fetchNewPairs(),
    fetchTopTraded(),
    fetchTopOrganic(),
  ]);
  const map = new Map<string, LaunchToken>();
  // High-volume retained pool (300k+ daily vol) + top organic, then today's new pairs
  const retained = [...top, ...organic].filter(
    (t) => (t.volume24hUsd ?? 0) >= MIN_RETAIN_VOLUME_USD,
  );
  [...retained, ...newp].forEach((t) => {
    if (!t.contract) return;
    const existing = map.get(t.contract);
    if (existing) {
      map.set(t.contract, {
        ...existing,
        hot: existing.hot || t.hot,
        // never auto-promote to featured
        featured: false,
      });
    } else {
      map.set(t.contract, { ...t, featured: false });
    }
  });
  return Array.from(map.values());
}
