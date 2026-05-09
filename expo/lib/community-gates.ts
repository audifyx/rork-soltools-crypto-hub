import { SOLTOOLS_TOKEN_MINT } from "@/lib/badge-system";

export interface TokenGateRequirement {
  enabled: boolean;
  tokenMint: string;
  minimumBalance: number;
  holderOnly?: boolean;
}

export interface CommunityAccessResult {
  allowed: boolean;
  reason?: string;
}

export function validateCommunityAccess(
  userBalance: number,
  requirement?: TokenGateRequirement | null,
): CommunityAccessResult {
  if (!requirement?.enabled) {
    return { allowed: true };
  }

  if (userBalance >= requirement.minimumBalance) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Requires ${requirement.minimumBalance.toLocaleString()} SOLTOOLS`,
  };
}

export const DEFAULT_HOLDER_COMMUNITY_GATE: TokenGateRequirement = {
  enabled: true,
  tokenMint: SOLTOOLS_TOKEN_MINT,
  minimumBalance: 1000000,
  holderOnly: true,
};
