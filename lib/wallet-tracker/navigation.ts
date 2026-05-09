export type WalletTrackedToken = {
  mint: string;
  symbol: string;
  name?: string;
  image?: string;
  price?: number;
  marketCap?: number;
};

export function createTokenDetailsRoute(mint: string): string {
  return `/discover/token/${mint}`;
}

export function createWalletDetailsRoute(wallet: string): string {
  return `/wallet/${wallet}`;
}

export function normalizeWalletAddress(wallet: string): string {
  return wallet.trim();
}
