/**
 * Canonical market-cap override for bridged / wrapped major coins on Solana.
 *
 * DexScreener and Pump.fun report MC = priceUsd * (wrapped supply on Solana),
 * which is wildly wrong for assets like Zcash, Bitcoin, Ethereum, etc. that
 * have a tiny Wormhole / Portal supply on Solana but billions of MC at the
 * source chain. This helper detects those cases and replaces the MC with the
 * real cross-chain market cap from CoinGecko.
 *
 * It is intentionally conservative: only triggers when the symbol matches a
 * curated allowlist AND either the mint is in our known-bridged registry or
 * the token name contains a strong wrapped/bridged hint. This avoids
 * overriding MC for unrelated memecoins that happen to share a symbol.
 */
type BridgedEntry = {
  symbol: string;
  coingeckoId: string;
  /** Optional: known bridged SPL mint addresses (Wormhole / Portal / Sollet). */
  mints?: string[];
  /** Lowercase substrings that are strong evidence of a bridged token. */
  nameContains?: string[];
};

const BRIDGED_REGISTRY: BridgedEntry[] = [
  { symbol: "ZEC", coingeckoId: "zcash", nameContains: ["zcash"] },
  { symbol: "BTC", coingeckoId: "bitcoin", nameContains: ["bitcoin"] },
  { symbol: "WBTC", coingeckoId: "wrapped-bitcoin", nameContains: ["bitcoin"] },
  { symbol: "ETH", coingeckoId: "ethereum", nameContains: ["ethereum", "ether"] },
  { symbol: "WETH", coingeckoId: "weth", nameContains: ["ethereum", "ether"] },
  { symbol: "LTC", coingeckoId: "litecoin", nameContains: ["litecoin"] },
  { symbol: "BCH", coingeckoId: "bitcoin-cash", nameContains: ["bitcoin cash"] },
  { symbol: "DOGE", coingeckoId: "dogecoin", nameContains: ["dogecoin"] },
  { symbol: "ADA", coingeckoId: "cardano", nameContains: ["cardano"] },
  { symbol: "DOT", coingeckoId: "polkadot", nameContains: ["polkadot"] },
  { symbol: "AVAX", coingeckoId: "avalanche-2", nameContains: ["avalanche"] },
  { symbol: "MATIC", coingeckoId: "matic-network", nameContains: ["matic", "polygon"] },
  { symbol: "POL", coingeckoId: "matic-network", nameContains: ["polygon"] },
  { symbol: "SUI", coingeckoId: "sui", nameContains: ["sui"] },
  { symbol: "APT", coingeckoId: "aptos", nameContains: ["aptos"] },
  { symbol: "XRP", coingeckoId: "ripple", nameContains: ["xrp", "ripple"] },
  { symbol: "TRX", coingeckoId: "tron", nameContains: ["tron"] },
  { symbol: "ATOM", coingeckoId: "cosmos", nameContains: ["cosmos"] },
  { symbol: "LINK", coingeckoId: "chainlink", nameContains: ["chainlink"] },
  { symbol: "UNI", coingeckoId: "uniswap", nameContains: ["uniswap"] },
  { symbol: "AAVE", coingeckoId: "aave", nameContains: ["aave"] },
  { symbol: "BNB", coingeckoId: "binancecoin", nameContains: ["bnb", "binance"] },
  { symbol: "TON", coingeckoId: "the-open-network", nameContains: ["toncoin", "ton"] },
  { symbol: "XMR", coingeckoId: "monero", nameContains: ["monero"] },
  { symbol: "FIL", coingeckoId: "filecoin", nameContains: ["filecoin"] },
  { symbol: "NEAR", coingeckoId: "near", nameContains: ["near"] },
  { symbol: "ARB", coingeckoId: "arbitrum", nameContains: ["arbitrum"] },
  { symbol: "OP", coingeckoId: "optimism", nameContains: ["optimism"] },
  { symbol: "INJ", coingeckoId: "injective-protocol", nameContains: ["injective"] },
  { symbol: "SEI", coingeckoId: "sei-network", nameContains: ["sei"] },
  { symbol: "TIA", coingeckoId: "celestia", nameContains: ["celestia"] },
  { symbol: "RNDR", coingeckoId: "render-token", nameContains: ["render"] },
  { symbol: "RENDER", coingeckoId: "render-token", nameContains: ["render"] },
  { symbol: "HBAR", coingeckoId: "hedera-hashgraph", nameContains: ["hedera"] },
  { symbol: "ICP", coingeckoId: "internet-computer", nameContains: ["internet computer"] },
  { symbol: "ALGO", coingeckoId: "algorand", nameContains: ["algorand"] },
  { symbol: "VET", coingeckoId: "vechain", nameContains: ["vechain"] },
  { symbol: "FTM", coingeckoId: "fantom", nameContains: ["fantom"] },
  { symbol: "S", coingeckoId: "sonic-3", nameContains: ["sonic"] },
];

const WRAPPED_NAME_HINTS = [
  "wormhole",
  "portal",
  "sollet",
  "wrapped",
  "(portal)",
  "(wormhole)",
  "allbridge",
  "bridged",
];

type CacheEntry = { value: number | null; expiresAt: number };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

function findEntry(address: string | null | undefined, symbol: string | null | undefined, name: string | null | undefined): BridgedEntry | null {
  const sym = (symbol ?? "").trim().toUpperCase();
  const lname = (name ?? "").trim().toLowerCase();
  const addr = (address ?? "").trim();

  if (sym.length === 0) return null;

  const candidates = BRIDGED_REGISTRY.filter((entry) => entry.symbol === sym);
  if (candidates.length === 0) return null;

  for (const entry of candidates) {
    if (entry.mints?.some((mint) => mint === addr)) return entry;
    const nameHit = entry.nameContains?.some((needle) => lname.includes(needle));
    const wrappedHint = WRAPPED_NAME_HINTS.some((h) => lname.includes(h));
    if (nameHit && wrappedHint) return entry;
  }
  // For very-major assets, name hint alone is enough (e.g. "Zcash").
  for (const entry of candidates) {
    const nameHit = entry.nameContains?.some((needle) => lname.includes(needle));
    if (nameHit) return entry;
  }
  return null;
}

type CoingeckoMarketRow = { id?: string; market_cap?: number };

async function fetchCoinGeckoMarketCap(coingeckoId: string): Promise<number | null> {
  const cached = CACHE.get(coingeckoId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coingeckoId)}&precision=0`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const rows = (await res.json()) as CoingeckoMarketRow[];
    const row = Array.isArray(rows) ? rows.find((r) => r.id === coingeckoId) ?? rows[0] ?? null : null;
    const mc = typeof row?.market_cap === "number" && Number.isFinite(row.market_cap) ? row.market_cap : null;
    CACHE.set(coingeckoId, { value: mc, expiresAt: Date.now() + TTL_MS });
    return mc;
  } catch (e) {
    console.log("[bridged-marketcap] coingecko fetch failed", e instanceof Error ? e.message : e);
    CACHE.set(coingeckoId, { value: null, expiresAt: Date.now() + 60_000 });
    return null;
  }
}

export type CanonicalMcInput = {
  address: string | null | undefined;
  symbol: string | null | undefined;
  name: string | null | undefined;
};

/**
 * Returns the canonical market cap (USD) for a bridged major asset, or null
 * if this token is not a recognized bridged asset.
 */
export async function getCanonicalBridgedMarketCap(input: CanonicalMcInput): Promise<number | null> {
  const entry = findEntry(input.address, input.symbol, input.name);
  if (!entry) return null;
  return fetchCoinGeckoMarketCap(entry.coingeckoId);
}

/** True if this token is recognized as a bridged major (used for badges / hints). */
export function isBridgedMajor(input: CanonicalMcInput): boolean {
  return findEntry(input.address, input.symbol, input.name) != null;
}
