export const HELIUS_TX_BASE = 'https://api.helius.xyz/v0';

export function createHeliusTransactionsUrl(address: string, apiKey?: string): string {
  const encoded = encodeURIComponent(address);

  if (!apiKey) {
    return `${HELIUS_TX_BASE}/addresses/${encoded}/transactions`;
  }

  return `${HELIUS_TX_BASE}/addresses/${encoded}/transactions?api-key=${apiKey}`;
}

export function isValidSolanaAddress(value: string): boolean {
  return value.length >= 32 && value.length <= 48;
}
