import { LaunchToken, LaunchVenue } from "@/types/launchpad";

const JUP_LITE = "https://lite-api.jup.ag";

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
  return {
    id: t.id,
    name: t.name || t.symbol || "Unknown",
    ticker: (t.symbol || "").toUpperCase(),
    description: "",
    logoUrl: t.icon ?? null,
    bannerUrl: null,
    contract: t.id,
    venue: mapVenue(t.launchpad),
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
export async function fetchNewPairs(): Promise<LaunchToken[]> {
  const items = await fetchList("/tokens/v2/recent");
  return items.slice(0, 60).map((t) => toLaunchToken(t, { hot: false }));
}

/**
 * Top traded tokens in the last 24h. We mark these as hot.
 */
export async function fetchTopTraded(): Promise<LaunchToken[]> {
  const items = await fetchList("/tokens/v2/toptraded/24h");
  return items.slice(0, 40).map((t) => toLaunchToken(t, { hot: true }));
}

/**
 * Top organic-score tokens. Marked as featured.
 */
export async function fetchTopOrganic(): Promise<LaunchToken[]> {
  const items = await fetchList("/tokens/v2/toporganicscore/24h");
  return items.slice(0, 30).map((t) => toLaunchToken(t, { featured: true }));
}

export async function fetchLivePairs(): Promise<LaunchToken[]> {
  const [newp, top, organic] = await Promise.all([
    fetchNewPairs(),
    fetchTopTraded(),
    fetchTopOrganic(),
  ]);
  const map = new Map<string, LaunchToken>();
  // Order matters: organic + top first (richer data), then new pairs fill in
  [...organic, ...top, ...newp].forEach((t) => {
    if (!t.contract) return;
    const existing = map.get(t.contract);
    if (existing) {
      map.set(t.contract, {
        ...existing,
        hot: existing.hot || t.hot,
        featured: existing.featured || t.featured,
      });
    } else {
      map.set(t.contract, t);
    }
  });
  return Array.from(map.values());
}
