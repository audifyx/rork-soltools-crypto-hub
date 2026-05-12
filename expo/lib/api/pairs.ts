import { getTrending, type TokenOverview } from "@/lib/api/birdeye";
import { fetchLaunchpadPairs, getNewSolanaPairs, searchSolanaPairs, type DexPair } from "@/lib/api/dexscreener";
import { fetchPumpFunDiscoveryTokens, pumpFunVolume24h, type PumpFunToken } from "@/lib/api/pumpfun";
import { OG_MEME_TOKEN_SEARCH_TERMS } from "@/lib/alpha-runners";
import { isSafeToken } from "@/lib/safety";
import { LaunchToken, LaunchVenue } from "@/types/launchpad";

const JUP_LITE = "https://lite-api.jup.ag";

/**
 * Tokens with at least this much 24h volume (USD) are retained on the launchpad
 * across daily refresh cycles. Anything below drops off as new pairs come in.
 */
export const MIN_RETAIN_VOLUME_USD = 75_000;
const PUMPFUN_DISCOVERY_LIMIT = 700;

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
  if (v.includes("moonshot")) return "moonshot";
  if (v.includes("fomo")) return "fomo";
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

function pumpFunToLaunchToken(t: PumpFunToken): LaunchToken | null {
  const address = t.id ?? t.mint ?? t.address;
  if (!address) return null;
  const volume = pumpFunVolume24h(t);
  const created = t.createdAt
    ? new Date(t.createdAt).getTime()
    : typeof t.created_timestamp === "number"
      ? t.created_timestamp * (t.created_timestamp < 10_000_000_000 ? 1000 : 1)
      : Date.now();
  const migrated = !!(t.graduatedPool ?? t.raydium_pool ?? t.complete);
  return {
    id: address,
    name: t.name || t.symbol || "Pump.fun token",
    ticker: (t.symbol || "PUMP").replace("$", "").toUpperCase(),
    description: t.description ?? (migrated ? "Fresh Pump.fun migration." : "Fresh Pump.fun launch."),
    logoUrl: t.icon ?? t.image_uri ?? null,
    bannerUrl: null,
    contract: address,
    venue: migrated ? "pumpswap" : mapVenue(t.launchpad ?? "pumpfun"),
    status: migrated ? "graduated" : "live",
    tags: ["pump.fun", migrated ? "migrated" : "fresh", ...(t.tags ?? [])].filter(Boolean),
    featured: false,
    hot: (volume ?? 0) >= MIN_RETAIN_VOLUME_USD || (t.liquidity ?? 0) >= 25_000,
    verified: t.organicScoreLabel === "high",
    createdAt: created,
    submittedBy: "system",
    price: t.usdPrice ?? null,
    change24hPct: t.stats24h?.priceChange ?? null,
    liquidityUsd: t.liquidity ?? null,
    marketCapUsd: t.mcap ?? t.fdv ?? null,
    volume24hUsd: volume,
    holders: t.holderCount ?? null,
    upvotes: Math.max(0, Math.round((t.organicScore ?? 0) * 10 + ((t.stats24h?.numBuys ?? 0) + (t.stats24h?.numSells ?? 0)) / 10)),
    watchers: 0,
  };
}

function dexPairToLaunchToken(pair: DexPair, venueOverride?: LaunchVenue): LaunchToken | null {
  const address = pair.baseToken?.address;
  if (!address) return null;
  const volume = pair.volume?.h24 ?? null;
  const marketCap = pair.marketCap ?? pair.fdv ?? null;
  const labelVenue = (pair.labels ?? [])
    .map((l) => mapVenue(l))
    .find((v) => v !== "other");
  const venue = venueOverride ?? labelVenue ?? mapVenue(pair.dexId);
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
    tags: [pair.dexId, ...(pair.labels ?? []), venue].filter(Boolean),
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
    volume24hUsd: lt.volume24hUsd,
    holders: lt.holders,
    priceUsd: lt.price,
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
    .slice(0, 180)
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
  const [newp, top, organic, pumpFunDiscovery, birdeyeVolume, dexFresh, dexRunnerSearches, moonshotPairs, fomoPairs] = await Promise.all([
    fetchNewPairs(),
    fetchTopTraded(),
    fetchTopOrganic(),
    (async () => {
      try {
        return await fetchPumpFunDiscoveryTokens(PUMPFUN_DISCOVERY_LIMIT);
      } catch (e) {
        console.log("[pairs] pump.fun discovery feed failed", e);
        return [] as PumpFunToken[];
      }
    })(),
    (async () => {
      try {
        return await getTrending({
          limit: 200,
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
        return await getNewSolanaPairs(220);
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
    (async () => {
      try {
        return await fetchLaunchpadPairs("moonshot", 80);
      } catch (e) {
        console.log("[pairs] moonshot launchpad feed failed", e);
        return [] as DexPair[];
      }
    })(),
    (async () => {
      try {
        return await fetchLaunchpadPairs("fomo", 80);
      } catch (e) {
        console.log("[pairs] fomo launchpad feed failed", e);
        return [] as DexPair[];
      }
    })(),
  ]);
  const map = new Map<string, LaunchToken>();
  const birdTokens = birdeyeVolume
    .map(overviewToLaunchToken)
    .filter((t): t is LaunchToken => t != null);
  const pumpTokens = pumpFunDiscovery
    .map(pumpFunToLaunchToken)
    .filter((t): t is LaunchToken => t != null);
  const dexTokens = [...dexFresh, ...dexRunnerSearches]
    .map((p) => dexPairToLaunchToken(p))
    .filter((t): t is LaunchToken => t != null);
  const moonshotTokens = moonshotPairs
    .map((p) => dexPairToLaunchToken(p, "moonshot"))
    .filter((t): t is LaunchToken => t != null);
  const fomoTokens = fomoPairs
    .map((p) => dexPairToLaunchToken(p, "fomo"))
    .filter((t): t is LaunchToken => t != null);

  // Retain daily runners from Jupiter + Birdeye + DexScreener, then layer in
  // the full Pump.fun discovery set. Pump.fun's feed is often missing liquidity
  // and holder fields for very fresh mints, so we only drop obvious dead/scam
  // rows there instead of applying the stricter cross-market safety gate.
  const retained = [...top, ...organic, ...birdTokens, ...dexTokens, ...pumpTokens, ...moonshotTokens, ...fomoTokens].filter(
    (t) => (t.volume24hUsd ?? 0) >= MIN_RETAIN_VOLUME_USD,
  );
  [...retained, ...newp, ...pumpTokens, ...dexTokens, ...moonshotTokens, ...fomoTokens].forEach((t) => {
    if (!t.contract) return;
    const isPumpSource = t.tags.includes("pump.fun");
    const isLaunchpadSource = t.venue === "moonshot" || t.venue === "fomo";
    const safe = isPumpSource || isLaunchpadSource
      ? (t.marketCapUsd ?? 0) >= 1_000 && (t.change24hPct ?? -100) > -80
      : isSafeToken({
          marketCapUsd: t.marketCapUsd,
          liquidityUsd: t.liquidityUsd,
          volume24hUsd: t.volume24hUsd,
          holders: t.holders,
          priceUsd: t.price,
          priceChange24hPct: t.change24hPct,
          venue: t.venue,
          tags: t.tags,
        });
    if (!safe) return;
    const existing = map.get(t.contract);
    map.set(t.contract, existing ? mergeToken(existing, t) : { ...t, featured: false });
  });
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}
