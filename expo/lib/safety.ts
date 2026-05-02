/**
 * Token safety / rug filter.
 *
 * Centralized rules used by every public token feed (launchpad, home rails,
 * discover, trending). Anything failing these checks is hidden from users:
 *
 *   1. Market cap must be at least MIN_MARKET_CAP_USD (10k).
 *   2. Some real liquidity must exist (>= MIN_LIQUIDITY_USD).
 *   3. Mint + freeze authorities should be revoked when audit data exists.
 *   4. Dev/insider concentration must be under MAX_DEV_BALANCE_PCT.
 *   5. Tokens flagged as honeypot / scam / unsafe / rug are dropped.
 *   6. Pump.fun bonding-curve tokens that never migrated to Raydium /
 *      Pumpswap / Meteora are hidden — only graduated, surviving devs.
 *   7. Severe price collapse (-90% in 24h) is treated as a likely rug.
 *
 * The shape is intentionally permissive so any token-like object passes
 * through (Jupiter v2, DexScreener pair, internal LaunchToken, etc.).
 */

export const MIN_MARKET_CAP_USD = 10_000;
export const MIN_LIQUIDITY_USD = 5_000;
export const MAX_DEV_BALANCE_PCT = 5;
export const RUG_DRAWDOWN_PCT = -90;

const SCAM_TAGS = new Set([
  "scam",
  "honeypot",
  "rug",
  "rugged",
  "blacklist",
  "unsafe",
  "fake",
  "spam",
]);

export interface SafetySignals {
  marketCapUsd?: number | null;
  liquidityUsd?: number | null;
  priceChange24hPct?: number | null;
  venue?: string | null;
  launchpad?: string | null;
  status?: string | null;
  tags?: string[] | null;
  labels?: string[] | null;
  audit?: {
    mintAuthorityDisabled?: boolean | null;
    freezeAuthorityDisabled?: boolean | null;
    devBalancePercentage?: number | null;
    topHoldersPercentage?: number | null;
  } | null;
  organicScoreLabel?: "low" | "medium" | "high" | null;
  isHoneypot?: boolean | null;
  /** true when the token never graduated off pump.fun bonding curve */
  bondingCurve?: boolean | null;
}

/**
 * True when the launchpad/venue indicates the token never migrated.
 * Pump.fun tokens that never graduate to Raydium/Pumpswap remain on the
 * bonding curve and are 99% rugs — we hide them.
 */
function looksUnmigrated(s: SafetySignals): boolean {
  if (s.bondingCurve === true) return true;
  const lp = (s.launchpad ?? "").toLowerCase();
  const venue = (s.venue ?? "").toLowerCase();
  const status = (s.status ?? "").toLowerCase();
  if (status.includes("bonding") || status.includes("curve")) return true;
  // Pump.fun *itself* (not pumpswap) means it hasn't migrated yet.
  if (lp === "pumpfun" || lp === "pump.fun") return true;
  if (venue === "pumpfun") return true;
  return false;
}

function hasScamTag(s: SafetySignals): boolean {
  const all = [...(s.tags ?? []), ...(s.labels ?? [])].map((t) =>
    String(t).toLowerCase(),
  );
  return all.some((t) => SCAM_TAGS.has(t));
}

/**
 * Returns true when the token passes every safety rule and is safe to
 * surface to users. Defaults are conservative: missing data = fail.
 */
export function isSafeToken(s: SafetySignals): boolean {
  if (s.isHoneypot === true) return false;
  if (hasScamTag(s)) return false;

  if ((s.marketCapUsd ?? 0) < MIN_MARKET_CAP_USD) return false;
  if ((s.liquidityUsd ?? 0) < MIN_LIQUIDITY_USD) return false;

  if (looksUnmigrated(s)) return false;

  // 24h drawdown screen — anything that has already collapsed is a rug.
  const ch = s.priceChange24hPct;
  if (typeof ch === "number" && ch <= RUG_DRAWDOWN_PCT) return false;

  const audit = s.audit;
  if (audit) {
    if (audit.mintAuthorityDisabled === false) return false;
    if (audit.freezeAuthorityDisabled === false) return false;
    if (
      typeof audit.devBalancePercentage === "number" &&
      audit.devBalancePercentage > MAX_DEV_BALANCE_PCT
    )
      return false;
  }

  if (s.organicScoreLabel === "low") return false;

  return true;
}

/** Convenience: filter an array using {@link isSafeToken}. */
export function filterSafeTokens<T extends SafetySignals>(items: T[]): T[] {
  return items.filter((t) => isSafeToken(t));
}
