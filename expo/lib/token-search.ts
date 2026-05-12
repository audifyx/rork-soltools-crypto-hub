import { getTokens, type JupiterToken } from "@/lib/api/jupiter";
import { scanCommunityToken, type CommunityTokenCard } from "@/lib/community-token";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_READY, SUPABASE_URL } from "@/lib/supabase";
import type { LaunchToken, LaunchVenue } from "@/types/launchpad";

const SOLANA_ADDRESS_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const DEFAULT_SEARCH_BANNER = "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/o23za4or0jutesw13rqqp.jpg";
const TOKEN_SEARCH_EDGE = `${SUPABASE_URL}/functions/v1/solana-token-search`;

function normalizeText(input: string): string {
  return input
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

function safeDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function searchFriendlyText(input: string): string {
  return safeDecode(input)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\b(ca|contract|mint|address)\b\s*[:=#-]?\s*/gi, " ")
    .replace(/[/?&#=,;()\[\]{}"'<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Removes paste noise around token searches while preserving Solana base58 casing. */
export function cleanTokenSearchQuery(input: string): string {
  const address = extractSolanaAddress(input);
  if (address) return address;
  return searchFriendlyText(input).replace(/^https?:\s*/i, "").trim();
}

/** Extracts a Solana mint from pasted text, URLs, query params, or CA-prefixed clipboard contents. */
export function extractSolanaAddress(input: string): string | null {
  const friendly = searchFriendlyText(input);
  const matches = friendly.match(SOLANA_ADDRESS_RE) ?? [];
  return matches.find((candidate) => candidate.length >= 32 && candidate.length <= 44) ?? null;
}

export function isSameTokenAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True when a token should appear for a search query, prioritizing pasted CAs. */
export function tokenMatchesSearch(token: LaunchToken, query: string): boolean {
  const q = normalizeText(cleanTokenSearchQuery(query));
  if (q.length === 0) return true;
  const pastedAddress = extractSolanaAddress(query);
  if (pastedAddress) {
    return isSameTokenAddress(token.contract, pastedAddress) || token.contract.toLowerCase().includes(pastedAddress.toLowerCase());
  }
  return (
    normalizeText(token.name).includes(q) ||
    normalizeText(token.ticker).replace(/^\$/, "").includes(q.replace(/^\$/, "")) ||
    token.contract.toLowerCase().includes(q) ||
    token.tags.some((tag) => normalizeText(tag).includes(q))
  );
}

/** Lower rank is better. Exact CA and exact ticker matches stay at the top. */
export function getTokenSearchRank(token: LaunchToken, query: string): number {
  const pastedAddress = extractSolanaAddress(query);
  if (pastedAddress) {
    if (isSameTokenAddress(token.contract, pastedAddress)) return 0;
    if (token.contract.toLowerCase().startsWith(pastedAddress.toLowerCase())) return 1;
    return 10;
  }
  const q = normalizeText(cleanTokenSearchQuery(query)).replace(/^\$/, "");
  const ticker = normalizeText(token.ticker).replace(/^\$/, "");
  const name = normalizeText(token.name);
  if (ticker === q) return 0;
  if (name === q) return 1;
  if (ticker.startsWith(q)) return 2;
  if (name.startsWith(q)) return 3;
  if (token.contract.toLowerCase().startsWith(q)) return 4;
  return 10;
}

function venueFromTags(tags: string[] | undefined): LaunchVenue {
  const haystack = (tags ?? []).join(" ").toLowerCase();
  if (haystack.includes("pumpswap")) return "pumpswap";
  if (haystack.includes("pump")) return "pumpfun";
  if (haystack.includes("raydium")) return "raydium";
  if (haystack.includes("meteora")) return "meteora";
  if (haystack.includes("jupiter")) return "jupiter";
  if (haystack.includes("moonshot")) return "moonshot";
  if (haystack.includes("fomo")) return "fomo";
  return "other";
}

/** Converts a live token-search result into the app's launch token shape. */
export function communityTokenToLaunchToken(token: CommunityTokenCard): LaunchToken {
  const address = token.address;
  const tags = ["search", "live", "solana"].filter(Boolean);
  return {
    id: address,
    name: token.name || token.symbol || "Unknown token",
    ticker: (token.symbol || "TOKEN").toUpperCase(),
    description: "Live Solana token resolved from pasted contract address.",
    logoUrl: token.logoUrl ?? null,
    bannerUrl: DEFAULT_SEARCH_BANNER,
    contract: address,
    venue: "other",
    status: "live",
    tags,
    featured: false,
    hot: false,
    verified: false,
    createdAt: token.scannedAt,
    submittedBy: "system",
    price: token.priceUsd ?? null,
    change24hPct: token.change24h ?? null,
    liquidityUsd: token.liquidityUsd ?? null,
    marketCapUsd: token.marketCapUsd ?? null,
    volume24hUsd: token.volume24hUsd ?? null,
    holders: token.holderCount ?? null,
    upvotes: 0,
    watchers: 0,
  };
}

export function jupiterTokenToLaunchToken(token: JupiterToken): LaunchToken {
  const address = token.address;
  const tags = token.tags ?? ["search"];
  return {
    id: address,
    name: token.name || token.symbol || "Unknown token",
    ticker: (token.symbol || "TOKEN").toUpperCase(),
    description: "Live Solana token found by contract address search.",
    logoUrl: token.logoURI ?? null,
    bannerUrl: DEFAULT_SEARCH_BANNER,
    contract: address,
    venue: venueFromTags(tags),
    status: "live",
    tags,
    featured: false,
    hot: false,
    verified: false,
    createdAt: Date.now(),
    submittedBy: "system",
    price: null,
    change24hPct: null,
    liquidityUsd: null,
    marketCapUsd: null,
    volume24hUsd: null,
    holders: null,
    upvotes: 0,
    watchers: 0,
  };
}

export function mergeTokenSearchResult(tokens: LaunchToken[], result: LaunchToken | null | undefined): LaunchToken[] {
  if (!result?.contract) return tokens;
  const exists = tokens.some((token) => isSameTokenAddress(token.contract, result.contract));
  return exists ? tokens : [result, ...tokens];
}

type TokenSearchEdgeRow = CommunityTokenCard & { scannedAt?: number };

async function fetchTokenSearchEdge(address: string): Promise<LaunchToken | null> {
  if (!SUPABASE_READY || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
    const res = await fetch(TOKEN_SEARCH_EDGE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: address }),
    });
    if (!res.ok) throw new Error(`edge ${res.status}`);
    const row = (await res.json()) as TokenSearchEdgeRow | null;
    if (!row?.address) return null;
    return communityTokenToLaunchToken({ ...row, chain: "solana", scannedAt: row.scannedAt ?? Date.now() });
  } catch (e) {
    console.log("[token-search] edge fallback", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Resolves a pasted CA into a displayable token even when it is not in cached feeds yet. */
export async function fetchLaunchTokenForSearchQuery(query: string): Promise<LaunchToken | null> {
  const address = extractSolanaAddress(query);
  if (!address) return null;
  const edgeToken = await fetchTokenSearchEdge(address);
  if (edgeToken) return edgeToken;
  try {
    const scanned = await scanCommunityToken(address, { persist: false });
    return communityTokenToLaunchToken(scanned);
  } catch (scanError) {
    console.log("[token-search] community scan fallback", scanError instanceof Error ? scanError.message : scanError);
  }
  const rows = await getTokens(address);
  const exact = rows.find((row) => isSameTokenAddress(row.address, address)) ?? rows[0];
  return exact ? jupiterTokenToLaunchToken(exact) : null;
}
