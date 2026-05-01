import { useQuery } from "@tanstack/react-query";

import { getPrice, JupiterPrice } from "@/lib/api/jupiter";
import { getTokenOverview, getTrending, TokenOverview } from "@/lib/api/birdeye";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
export const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

export function useJupiterPrices(mints: string[]) {
  return useQuery<Record<string, JupiterPrice>>({
    queryKey: ["jupiter", "prices", mints.join(",")],
    queryFn: async () => {
      try {
        const res = await getPrice(mints);
        return res ?? {};
      } catch (e) {
        console.log("[market] price fetch failed", e);
        return {};
      }
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useTrendingTokens(limit: number = 20) {
  return useQuery<TokenOverview[]>({
    queryKey: ["birdeye", "trending", limit],
    queryFn: async () => {
      try {
        return await getTrending(limit);
      } catch (e) {
        console.log("[market] trending fetch failed", e);
        return [];
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useTokenOverview(address?: string | null) {
  return useQuery<TokenOverview | null>({
    queryKey: ["birdeye", "overview", address ?? ""],
    enabled: !!address && address.length >= 32,
    queryFn: async () => {
      if (!address) return null;
      try {
        return await getTokenOverview(address);
      } catch (e) {
        console.log("[market] overview fetch failed", e);
        return null;
      }
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
