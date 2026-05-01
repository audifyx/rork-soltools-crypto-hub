/**
 * Shared number/price formatters used across the app to keep prices,
 * market caps, liquidity, and volume readable everywhere.
 *
 * - `fmtUsd` -> `$2.1K`, `$340K`, `$1.2M`, `$4.5B` (preferred for MC/LIQ/VOL)
 * - `fmtPrice` -> human price with subscript-zero notation for sub-cent values
 *   (e.g. `$0.0₅3012` instead of `$3.0118e-6`)
 * - `fmtNum` -> compact integer count (`12.4K holders`)
 * - `fmtPct` -> signed percent (`+4.21%`)
 */

export function fmtUsd(n?: number | null): string {
  if (n == null || !isFinite(n)) return "—";
  if (n === 0) return "$0";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v < 1000) return `${sign}${fmtPrice(v)}`;
  if (v < 1_000_000) return `${sign}$${(v / 1000).toFixed(v < 10_000 ? 2 : 1)}K`;
  if (v < 1_000_000_000) return `${sign}$${(v / 1_000_000).toFixed(v < 10_000_000 ? 2 : 1)}M`;
  if (v < 1_000_000_000_000) return `${sign}$${(v / 1_000_000_000).toFixed(v < 10_000_000_000 ? 2 : 1)}B`;
  return `${sign}$${(v / 1_000_000_000_000).toFixed(2)}T`;
}

/**
 * Pretty-print sub-dollar prices without scientific notation.
 * Uses subscript-zero convention for very small numbers.
 */
export function fmtPrice(n?: number | null): string {
  if (n == null || !isFinite(n)) return "—";
  if (n === 0) return "$0";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1000) return fmtUsd(n);
  if (v >= 10) return `${sign}$${v.toFixed(2)}`;
  if (v >= 1) return `${sign}$${v.toFixed(4)}`;
  if (v >= 0.01) return `${sign}$${v.toFixed(4)}`;
  if (v >= 0.0001) return `${sign}$${v.toFixed(6)}`;
  const s = v.toFixed(20);
  const m = s.match(/^0\.(0+)(\d+)/);
  if (!m) return `${sign}$${v.toPrecision(4)}`;
  const zeros = m[1].length;
  const digits = m[2].slice(0, 4);
  const sub = String(zeros)
    .split("")
    .map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])
    .join("");
  return `${sign}$0.0${sub}${digits}`;
}

export function fmtNum(n?: number | null): string {
  if (n == null || !isFinite(n)) return "—";
  const v = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (v < 1000) return `${sign}${Math.round(v).toLocaleString()}`;
  if (v < 1_000_000) return `${sign}${(v / 1000).toFixed(v < 10_000 ? 2 : 1)}K`;
  if (v < 1_000_000_000) return `${sign}${(v / 1_000_000).toFixed(v < 10_000_000 ? 2 : 1)}M`;
  return `${sign}${(v / 1_000_000_000).toFixed(2)}B`;
}

export function fmtPct(n?: number | null, digits: number = 2): string {
  if (n == null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}
