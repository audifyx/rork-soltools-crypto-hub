/**
 * Real all-time-high lookup for Solana tokens.
 *
 * Strategy:
 * 1. Pull daily OHLCV from GeckoTerminal for the pool (no API key required).
 * 2. Walk every daily candle, take max(high) and remember the candle timestamp.
 * 3. Cross-check the latest day candles for a more recent intraday peak via
 *    the 4-hour series — GeckoTerminal returns up to 1000 candles, so the
 *    combo covers ~3 years of daily history plus ~5 months of 4h granularity.
 *
 * Returning `null` means we couldn't resolve a price history (fresh pair,
 * upstream outage, etc.) and the caller should fall back to local tracking.
 */

const GT_BASE = "https://api.geckoterminal.com/api/v2";

export type AthResult = {
  priceUsd: number;
  recordedAt: number;
  source: "geckoterminal";
};

type OhlcvResponse = {
  data?: {
    attributes?: {
      // Each entry: [unixSeconds, open, high, low, close, volumeUsd]
      ohlcv_list?: (number | string)[][];
    };
  };
};

async function fetchOhlcv(
  pairAddress: string,
  timeframe: "day" | "hour",
  aggregate: number,
  limit: number,
): Promise<number[][]> {
  const url = `${GT_BASE}/networks/solana/pools/${pairAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.log("[token-ath] gt ohlcv", res.status, timeframe, aggregate);
      return [];
    }
    const json = (await res.json()) as OhlcvResponse;
    const list = json?.data?.attributes?.ohlcv_list ?? [];
    return list.map((row) => row.map((v) => Number(v)));
  } catch (e) {
    console.log("[token-ath] gt ohlcv error", e instanceof Error ? e.message : e);
    return [];
  }
}

function maxHighFromCandles(rows: number[][]): { high: number; ts: number } | null {
  let best: { high: number; ts: number } | null = null;
  for (const row of rows) {
    const ts = Number(row?.[0] ?? 0);
    const high = Number(row?.[2] ?? 0);
    if (!Number.isFinite(high) || high <= 0) continue;
    if (!best || high > best.high) {
      best = { high, ts: ts > 0 ? ts * 1000 : Date.now() };
    }
  }
  return best;
}

/**
 * Resolves the all-time high USD price for a Solana pool. We combine the
 * daily and 4-hour series so the result captures both legacy peaks and
 * very recent intraday wicks.
 */
export async function fetchTokenAth(pairAddress: string): Promise<AthResult | null> {
  if (!pairAddress) return null;
  const [daily, fourHour] = await Promise.all([
    fetchOhlcv(pairAddress, "day", 1, 1000),
    fetchOhlcv(pairAddress, "hour", 4, 1000),
  ]);
  const bestDaily = maxHighFromCandles(daily);
  const bestIntraday = maxHighFromCandles(fourHour);
  const best =
    bestDaily && bestIntraday
      ? bestDaily.high >= bestIntraday.high
        ? bestDaily
        : bestIntraday
      : bestDaily ?? bestIntraday;
  if (!best) return null;
  return { priceUsd: best.high, recordedAt: best.ts, source: "geckoterminal" };
}
