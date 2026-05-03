export type LaunchVenue = "pumpfun" | "pumpswap" | "raydium" | "meteora" | "jupiter" | "other";

export type LaunchStatus = "live" | "presale" | "graduated" | "scheduled" | "pending" | "approved" | "rejected";

export interface LaunchToken {
  id: string;
  name: string;
  ticker: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  contract: string;
  venue: LaunchVenue;
  status: LaunchStatus;
  /** Admin approval state for direct token listings before they become public/featured. */
  approvalStatus?: "pending" | "approved" | "rejected" | "live";
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  tags: string[];
  featured: boolean;
  hot: boolean;
  verified: boolean;
  createdAt: number;
  submittedBy: "user" | "system";
  /** Auth user id of the submitter, when this token came from pump_v5_submissions. */
  ownerId?: string | null;
  price?: number | null;
  change24hPct?: number | null;
  liquidityUsd?: number | null;
  marketCapUsd?: number | null;
  volume24hUsd?: number | null;
  holders?: number | null;
  upvotes: number;
  watchers: number;
}

export interface LaunchpadStats {
  listedTokens: number;
  volume24hUsd: number;
  totalLiquidityUsd: number;
  featuredCount: number;
}

export type LaunchTab = "all" | "featured" | "mine";
export type LaunchSort = "newest" | "trending" | "gainers" | "losers" | "liquidity" | "marketcap" | "volume" | "og";
export type LaunchVenueFilter = LaunchVenue | "all";
