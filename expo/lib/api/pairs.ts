import { getTrending, type TokenOverview } from "@/lib/api/birdeye";
import { getNewSolanaPairs, searchSolanaPairs, type DexPair } from "@/lib/api/dexscreener";
import { OG_MEME_TOKEN_SEARCH_TERMS } from "@/lib/alpha-runners";
import { isSafeToken } from "@/lib/safety";
import { LaunchToken, LaunchVenue } from "@/types/launchpad";

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
  if (v.includes("pumpswap")) return "pumpswap";
  if (v.includes("pump.fun") || v === "pumpfun" || v === "pump") return "pumpfun";
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

function dexPairToLaunchToken(pair: DexPair): LaunchToken | null {
  const address = pair.baseToken?.address;
  if (!address) return null;
  const volume = pair.volume?.h24 ?? null;
  const marketCap = pair.marketCap ?? pair.fdv ?? null;
  const venue = mapVenue(pair.dexId);
  return {
    id: address,
    name: pair.baseToken?.name ?? pair.baseToken?.symbol ?? "Unknown",
    ticker: (pair.baseToken?.symbol ?? "TOKEN").toUpperCase(),
    description: "Live Solana market pair from DexScreener.",
    logoUrl: pair.info?.imageUrl ?? null,
    bannerUrl: pair.info?.header ?? null,
    contract: address,
    venue,
    status: "live",
    tags: [pair.dexId, ...(pair.labels ?? [])].filter(Boolean),
    featured: false,
    hot: (volume ?? 0) >= MIN_RETAIN_VOLUME_USD,
    verified: (pair.liquidity?.usd ?? 0) >= 100_000,
    createdAt: pair.pairCreatedAt ?? Date.now(),
    submittedBy: "system",
    price: pair.priceUsd ? Number(pair.priceUsd) : null,
    change24hPct: pair.priceChange?.h24 ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    marketCapUsd: marketCap,
    volume24hUsd: volume,
    holders: null,
    upvotes: Math.round(((pair.txns?.h24?.buys ?? 0) + (pair.txns?.h24?.sells ?? 0)) / 10),
    watchers: 0,
  };
}

function overviewToLaunchToken(t: TokenOverview): LaunchToken | null {
  if (!t.address) return null;
  return {
    id: t.address,
    name: t.name || t.symbol || "Unknown",
    ticker: (t.symbol || "TOKEN").toUpperCase(),
    description: "Live Solana volume signal from Birdeye.",
    logoUrl: t.logoURI ?? null,
    bannerUrl: null,
    contract: t.address,
    venue: "other",
    status: "live",
    tags: ["birdeye", "volume"],
    featured: false,
    hot: (t.volume24hUSD ?? 0) >= MIN_RETAIN_VOLUME_USD,
    verified: typeof t.rank === "number" && t.rank <= 250,
    createdAt: Date.now(),
    submittedBy: "system",
    price: t.price || null,
    change24hPct: t.priceChange24h ?? null,
    liquidityUsd: t.liquidity ?? null,
    marketCapUsd: t.marketCap ?? null,
    volume24hUsd: t.volume24hUSD ?? null,
    holders: t.holder ?? null,
    upvotes: Math.max(0, Math.round(1000 - (t.rank ?? 1000))),
    watchers: 0,
  };
}

function mergeToken(existing: LaunchToken, incoming: LaunchToken): LaunchToken {
  return {
    ...existing,
    name: existing.name || incoming.name,
    ticker: existing.ticker || incoming.ticker,
    description: existing.description || incoming.description,
    logoUrl: existing.logoUrl ?? incoming.logoUrl,
    bannerUrl: existing.bannerUrl ?? incoming.bannerUrl,
    venue: existing.venue === "other" ? incoming.venue : existing.venue,
    tags: Array.from(new Set([...existing.tags, ...incoming.tags])).slice(0, 12),
    hot: existing.hot || incoming.hot,
    featured: false,
    verified: existing.verified || incoming.verified,
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    price: incoming.price ?? existing.price ?? null,
    change24hPct: incoming.change24hPct ?? existing.change24hPct ?? null,
    liquidityUsd: incoming.liquidityUsd ?? existing.liquidityUsd ?? null,
    marketCapUsd: incoming.marketCapUsd ?? existing.marketCapUsd ?? null,
    volume24hUsd: Math.max(existing.volume24hUsd ?? 0, incoming.volume24hUsd ?? 0) || null,
    holders: incoming.holders ?? existing.holders ?? null,
    upvotes: Math.max(existing.upvotes, incoming.upvotes),
    watchers: Math.max(existing.watchers, incoming.watchers),
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
    .slice(0, 120)
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
  const [newp, top, organic, birdeyeVolume, dexFresh, dexRunnerSearches] = await Promise.all([
    fetchNewPairs(),
    fetchTopTraded(),
    fetchTopOrganic(),
    (async () => {
      try {
        return await getTrending({
          limit: 80,
          sort_by: "volume24hUSD",
          sort_type: "desc",
          timeframe: "24h",
        });
      } catch (e) {
        console.log("[pairs] birdeye volume feed failed", e);
        return [] as TokenOverview[];
      }
    })(),
    (async () => {
      try {
        return await getNewSolanaPairs(80);
      } catch (e) {
        console.log("[pairs] dexscreener fresh feed failed", e);
        return [] as DexPair[];
      }
    })(),
    (async () => {
      const terms = [
        "utility",
        "depin",
        "rwa",
        "ai agent",
        "charity",
        "donation",
        ...OG_MEME_TOKEN_SEARCH_TERMS,
      ];
      const results = await Promise.all(
        terms.map(async (term) => {
          try {
            return await searchSolanaPairs(term, 12);
          } catch (e) {
            console.log("[pairs] dexscreener search failed", term, e);
            return [] as DexPair[];
          }
        }),
      );
      return results.flat();
    })(),
  ]);
  const map = new Map<string, LaunchToken>();
  const birdTokens = birdeyeVolume
    .map(overviewToLaunchToken)
    .filter((t): t is LaunchToken => t != null);
  const dexTokens = [...dexFresh, ...dexRunnerSearches]
    .map(dexPairToLaunchToken)
    .filter((t): t is LaunchToken => t != null);

  // Retain high-volume daily runners from Jupiter + Birdeye + DexScreener, then
  // layer in newest Pump/Jupiter/Dex pairs so fresh charity/utility launches can appear.
  const retained = [...top, ...organic, ...birdTokens, ...dexTokens].filter(
    (t) => (t.volume24hUsd ?? 0) >= MIN_RETAIN_VOLUME_USD,
  );
  [...retained, ...newp, ...dexTokens].forEach((t) => {
    if (!t.contract) return;
    const safe = isSafeToken({
      marketCapUsd: t.marketCapUsd,
      liquidityUsd: t.liquidityUsd,
      priceChange24hPct: t.change24hPct,
      venue: t.venue,
      tags: t.tags,
    });
    if (!safe) return;
    const existing = map.get(t.contract);
    map.set(t.contract, existing ? mergeToken(existing, t) : { ...t, featured: false });
  });
  return Array.from(map.values());
}
