import { getTokenOverview } from "@/lib/api/birdeye";
import { fetchDexToken } from "@/lib/api/dexscreener";
import { getTokens, rpcCall } from "@/lib/api/jupiter";
import { fetchPumpFunToken, pumpFunVolume24h } from "@/lib/api/pumpfun";
import { supabase } from "@/lib/supabase";

const BASE58_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

export type CommunityTokenCard = {
  address: string;
  chain: "solana";
  symbol: string;
  name: string;
  logoUrl?: string | null;
  priceUsd?: number | null;
  change24h?: number | null;
  marketCapUsd?: number | null;
  liquidityUsd?: number | null;
  volume24hUsd?: number | null;
  pairAddress?: string | null;
  decimals?: number | null;
  holderCount?: number | null;
  metadata?: Record<string, unknown>;
  scannedAt: number;
};

type HeliusAsset = {
  id?: string;
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      image?: string;
    };
    links?: {
      image?: string;
    };
  };
  token_info?: {
    decimals?: number;
    symbol?: string;
    supply?: string;
    price_info?: {
      price_per_token?: number;
    };
  };
  authorities?: unknown[];
  ownership?: unknown;
  grouping?: unknown[];
};

type TokenSupplyResponse = {
  value?: {
    amount?: string;
    decimals?: number;
    uiAmountString?: string;
  };
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function usefulText(value: string | null | undefined, blocked: string[] = []): string | null {
  const text = value?.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (blocked.some((b) => lower === b.toLowerCase())) return null;
  return text;
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = usefulText(value);
    if (text) return text;
  }
  return null;
}

function cleanAddress(value: string): string {
  return value.trim().replace(/[.,;:)\]}]+$/g, "");
}

export function isSolanaAddress(value: string | null | undefined): boolean {
  const address = cleanAddress(value ?? "");
  return address.length >= 32 && address.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
}

export function extractSolanaAddresses(text: string): string[] {
  const matches = text.match(BASE58_RE) ?? [];
  return Array.from(new Set(matches.map(cleanAddress).filter(isSolanaAddress))).slice(0, 4);
}

export function extractFirstSolanaAddress(text: string): string | null {
  return extractSolanaAddresses(text)[0] ?? null;
}

async function fetchHeliusAsset(address: string): Promise<HeliusAsset | null> {
  try {
    return await rpcCall<HeliusAsset>("getAsset", {
      id: address,
      displayOptions: {
        showFungible: true,
        showInscription: true,
      },
    });
  } catch (e) {
    console.log("[community-token] helius asset fallback", e instanceof Error ? e.message : e);
    return null;
  }
}

async function fetchTokenSupply(address: string): Promise<TokenSupplyResponse | null> {
  try {
    return await rpcCall<TokenSupplyResponse>("getTokenSupply", [address]);
  } catch {
    return null;
  }
}

async function persistTokenScan(token: CommunityTokenCard): Promise<void> {
  try {
    const { error } = await supabase.rpc("upsert_community_token_scan", {
      p_token_address: token.address,
      p_symbol: token.symbol,
      p_name: token.name,
      p_logo_url: token.logoUrl ?? null,
      p_price_usd: token.priceUsd ?? null,
      p_change_24h: token.change24h ?? null,
      p_market_cap_usd: token.marketCapUsd ?? null,
      p_liquidity_usd: token.liquidityUsd ?? null,
      p_volume_24h_usd: token.volume24hUsd ?? null,
      p_pair_address: token.pairAddress ?? null,
      p_decimals: token.decimals ?? null,
      p_holder_count: token.holderCount ?? null,
      p_metadata: token.metadata ?? {},
    });
    if (error) throw error;
  } catch (e) {
    console.log("[community-token] persist scan failed", e instanceof Error ? e.message : e);
  }
}

/**
 * Scans a Solana mint using Birdeye, DexScreener, Pump.fun, Helius-compatible DAS/RPC, and Jupiter fallbacks.
 */
export async function scanCommunityToken(
  rawAddress: string,
  opts: { persist?: boolean } = {},
): Promise<CommunityTokenCard> {
  const address = cleanAddress(rawAddress);
  if (!isSolanaAddress(address)) throw new Error("Invalid Solana token address.");

  const [overviewRes, dexRes, pumpRes, assetRes, supplyRes, jupRes] = await Promise.allSettled([
    getTokenOverview(address),
    fetchDexToken(address),
    fetchPumpFunToken(address),
    fetchHeliusAsset(address),
    fetchTokenSupply(address),
    getTokens(address),
  ]);

  const overview = overviewRes.status === "fulfilled" ? overviewRes.value : null;
  const dex = dexRes.status === "fulfilled" ? dexRes.value : null;
  const pump = pumpRes.status === "fulfilled" ? pumpRes.value : null;
  const asset = assetRes.status === "fulfilled" ? assetRes.value : null;
  const supply = supplyRes.status === "fulfilled" ? supplyRes.value : null;
  const jup = jupRes.status === "fulfilled" ? jupRes.value[0] ?? null : null;
  const assetMeta = asset?.content?.metadata;
  const tokenInfo = asset?.token_info;
  const pumpVolume24h = pumpFunVolume24h(pump);
  const pumpDescription = usefulText(pump?.description);
  const pumpSocials = [
    pump?.twitter ? { type: "twitter", url: pump.twitter } : null,
    pump?.telegram ? { type: "telegram", url: pump.telegram } : null,
  ].filter((item): item is { type: string; url: string } => !!item?.url);
  const pumpWebsites = [pump?.website].filter((url): url is string => !!usefulText(url));

  const token: CommunityTokenCard = {
    address,
    chain: "solana",
    symbol:
      firstText(
        pump?.symbol,
        tokenInfo?.symbol,
        assetMeta?.symbol,
        jup?.symbol,
        dex?.pair?.baseToken?.symbol,
        usefulText(overview?.symbol, ["TOKEN"]),
      ) ?? "TOKEN",
    name:
      firstText(
        pump?.name,
        assetMeta?.name,
        jup?.name,
        dex?.pair?.baseToken?.name,
        usefulText(overview?.name, ["Unknown token", "Unknown Solana token"]),
      ) ?? "Unknown Solana token",
    logoUrl:
      pump?.icon ??
      pump?.image_uri ??
      overview?.logoURI ??
      asset?.content?.links?.image ??
      assetMeta?.image ??
      jup?.logoURI ??
      dex?.imageUrl ??
      null,
    priceUsd:
      asNumber(pump?.usdPrice) ??
      asNumber(overview?.price) ??
      asNumber(tokenInfo?.price_info?.price_per_token) ??
      dex?.priceUsd ??
      null,
    change24h: asNumber(pump?.stats24h?.priceChange) ?? asNumber(overview?.priceChange24h) ?? dex?.priceChange24hPct ?? null,
    marketCapUsd: asNumber(pump?.mcap) ?? asNumber(pump?.fdv) ?? asNumber(overview?.marketCap) ?? dex?.marketCapUsd ?? null,
    liquidityUsd: asNumber(pump?.liquidity) ?? asNumber(overview?.liquidity) ?? dex?.liquidityUsd ?? null,
    volume24hUsd: pumpVolume24h ?? asNumber(overview?.volume24hUSD) ?? dex?.volume24hUsd ?? null,
    pairAddress: dex?.pairAddress ?? pump?.graduatedPool ?? null,
    decimals:
      asNumber(pump?.decimals) ??
      asNumber(overview?.decimals) ??
      asNumber(tokenInfo?.decimals) ??
      asNumber(supply?.value?.decimals) ??
      asNumber(jup?.decimals) ??
      null,
    holderCount: asNumber(pump?.holderCount) ?? asNumber(overview?.holder) ?? null,
    metadata: {
      chain: "solana",
      ca: address,
      description: pumpDescription ?? assetMeta?.description ?? null,
      supply: pump?.totalSupply ?? tokenInfo?.supply ?? supply?.value?.uiAmountString ?? supply?.value?.amount ?? null,
      circulatingSupply: pump?.circSupply ?? null,
      tokenProgram: pump?.tokenProgram ?? null,
      launchpad: pump?.launchpad ?? dex?.dexId ?? null,
      graduatedPool: pump?.graduatedPool ?? null,
      graduatedAt: pump?.graduatedAt ?? null,
      createdAt: pump?.createdAt ?? pump?.firstPool?.createdAt ?? null,
      dexId: dex?.dexId ?? null,
      pairCreatedAt: dex?.pairCreatedAt ?? null,
      websites: Array.from(new Set([...(dex?.websites ?? []), ...pumpWebsites])),
      socials: [...(dex?.socials ?? []), ...pumpSocials],
      audit: pump?.audit ?? null,
      organicScore: pump?.organicScore ?? null,
      organicScoreLabel: pump?.organicScoreLabel ?? null,
      tags: pump?.tags ?? [],
      sources: {
        pumpfun: pump != null,
        helius: asset != null,
        birdeye: overview != null,
        dexscreener: dex?.pair != null,
        jupiter: jup != null,
      },
    },
    scannedAt: Date.now(),
  };

  if (opts.persist) await persistTokenScan(token);
  return token;
}
