import type { LaunchToken } from "@/types/launchpad";

export const ALPHA_MIN_24H_VOLUME_USD = 1_000_000;
export const ALPHA_MAX_MARKET_CAP_USD = 50_000_000;

const BLOCKED_LARGE_CAP_TERMS = new Set([
  "fartcoin",
  "fart",
  "troll",
  "sol",
  "usdc",
  "usdt",
  "jup",
  "jupiter",
  "bonk",
  "wif",
  "pyth",
  "jito",
  "jto",
  "ray",
  "orca",
]);

function normalizedTicker(token: LaunchToken): string {
  return token.ticker.replace("$", "").trim().toLowerCase();
}

function looksBlockedLargeCap(token: LaunchToken): boolean {
  const ticker = normalizedTicker(token);
  const words = [ticker, ...token.name.toLowerCase().split(/[^a-z0-9]+/)].filter(Boolean);
  return words.some((word) => BLOCKED_LARGE_CAP_TERMS.has(word));
}

/**
 * Returns true for the Solana daily-runner profile used by AI Alpha Insights:
 * $1M+ 24h volume, small-cap market cap, and no known large-cap/major names.
 */
export function isDailyAlphaRunner(token: LaunchToken): boolean {
  const volume = token.volume24hUsd ?? 0;
  const marketCap = token.marketCapUsd ?? 0;
  const change = token.change24hPct;

  if (looksBlockedLargeCap(token)) return false;
  if (volume < ALPHA_MIN_24H_VOLUME_USD) return false;
  if (marketCap <= 0 || marketCap > ALPHA_MAX_MARKET_CAP_USD) return false;
  if (typeof change === "number" && change < 0) return false;

  return true;
}

/** Ranks alpha runners by today's volume first, then momentum and liquidity. */
export function compareDailyAlphaRunners(a: LaunchToken, b: LaunchToken): number {
  const volumeDiff = (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0);
  if (volumeDiff !== 0) return volumeDiff;

  const changeDiff = (b.change24hPct ?? 0) - (a.change24hPct ?? 0);
  if (changeDiff !== 0) return changeDiff;

  return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
}

/** Returns the highest-volume small-cap runners for today's AI alpha surfaces. */
export function getDailyAlphaRunners(tokens: LaunchToken[], limit: number): LaunchToken[] {
  return tokens.filter(isDailyAlphaRunner).sort(compareDailyAlphaRunners).slice(0, limit);
}

/** Converts live volume, momentum, liquidity, and turnover into a 60-99 confidence score. */
export function getAlphaRunnerScore(token: LaunchToken): number {
  const volume = token.volume24hUsd ?? 0;
  const marketCap = token.marketCapUsd ?? 0;
  const change = Math.max(0, token.change24hPct ?? 0);
  const liquidity = token.liquidityUsd ?? 0;

  const volumeScore = Math.min(35, (volume / ALPHA_MIN_24H_VOLUME_USD) * 10);
  const momentumScore = Math.min(20, change * 0.35);
  const turnoverScore = marketCap > 0 ? Math.min(25, (volume / marketCap) * 25) : 0;
  const liquidityScore = Math.min(12, (liquidity / 100_000) * 4);

  return Math.max(
    60,
    Math.min(99, Math.round(35 + volumeScore + momentumScore + turnoverScore + liquidityScore)),
  );
}
