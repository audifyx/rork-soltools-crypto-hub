export const BIRDEYE_HOLDER_API = 'https://public-api.birdeye.so/defi/v3/token/holder';

export function createBirdeyeHolderUrl(mint: string): string {
  return `${BIRDEYE_HOLDER_API}?address=${encodeURIComponent(mint)}`;
}

export function normalizeHolderPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
