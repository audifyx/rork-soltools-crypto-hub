export function uniqueProfileMetrics(metrics: string[]): string[] {
  return [...new Set(metrics.filter(Boolean))];
}

export function compactWalletAddress(wallet: string): string {
  if (wallet.length < 12) {
    return wallet;
  }

  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}
