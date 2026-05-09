export type BadgeRarity = "common" | "rare" | "epic" | "legendary";

export interface UserBadge {
  id: string;
  label: string;
  color: string;
  icon?: string;
  glow?: boolean;
  priority?: number;
  rarity?: BadgeRarity;
  background?: string;
  textColor?: string;
  animated?: boolean;
}

export interface HolderTier {
  id: string;
  minBalance: number;
  badge: UserBadge;
}

export const DEFAULT_BADGES: Record<string, UserBadge> = {
  verified: {
    id: "verified",
    label: "Verified",
    color: "#55F5B2",
    icon: "check",
    glow: true,
    priority: 100,
    rarity: "rare",
    animated: true,
  },
  beta: {
    id: "beta",
    label: "BETA",
    color: "#C7FF00",
    icon: "radar",
    glow: true,
    priority: 95,
    rarity: "epic",
    background: "rgba(199,255,0,0.12)",
    animated: true,
  },
  admin: {
    id: "admin",
    label: "ADMIN",
    color: "#FF6262",
    icon: "shield",
    glow: true,
    priority: 200,
    rarity: "legendary",
  },
  team: {
    id: "team",
    label: "TEAM",
    color: "#8B5CFF",
    icon: "zap",
    glow: true,
    priority: 150,
    rarity: "epic",
  },
  mod: {
    id: "mod",
    label: "MOD",
    color: "#4DB3FF",
    icon: "hammer",
    glow: true,
    priority: 140,
    rarity: "rare",
  },
};

export const SOLTOOLS_TOKEN_MINT = "EfnZmcFKMXofKA5V5ujvjqtSorvuQD2MzJPz3dxXpump";

export const HOLDER_TIERS: HolderTier[] = [
  {
    id: "holder",
    minBalance: 1000,
    badge: {
      id: "holder",
      label: "HOLDER",
      color: "#55F5B2",
      icon: "coins",
      glow: true,
      priority: 80,
      rarity: "common",
    },
  },
  {
    id: "supporter",
    minBalance: 100000,
    badge: {
      id: "supporter",
      label: "SUPPORTER",
      color: "#6EE7FF",
      icon: "gem",
      glow: true,
      priority: 85,
      rarity: "rare",
    },
  },
  {
    id: "whale",
    minBalance: 1000000,
    badge: {
      id: "whale",
      label: "WHALE",
      color: "#FFD700",
      icon: "crown",
      glow: true,
      priority: 90,
      rarity: "legendary",
      animated: true,
    },
  },
];

export function getHolderBadge(balance: number): UserBadge | null {
  const tier = HOLDER_TIERS
    .slice()
    .sort((a, b) => b.minBalance - a.minBalance)
    .find((tier) => balance >= tier.minBalance);

  return tier?.badge ?? null;
}

export function sortBadges(badges: UserBadge[]): UserBadge[] {
  return [...badges].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export type CommunityAccessType =
  | "public"
  | "invite_only"
  | "verified_only"
  | "holder_only";

export interface CommunityGateRule {
  type: CommunityAccessType;
  tokenMint?: string;
  minimumBalance?: number;
}

export function canAccessHolderCommunity(
  walletBalance: number,
  minimumBalance: number,
) {
  return walletBalance >= minimumBalance;
}
