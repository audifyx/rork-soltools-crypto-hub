export const HELIUS_API_BASE = 'https://api.helius.xyz';
export const BIRDEYE_API_BASE = 'https://public-api.birdeye.so';

export function createHeliusUrl(path: string, apiKey?: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;

  if (!apiKey) {
    return `${HELIUS_API_BASE}${clean}`;
  }

  return `${HELIUS_API_BASE}${clean}?api-key=${apiKey}`;
}

export function createBirdeyeHeaders(apiKey?: string): Record<string, string> {
  return {
    'x-api-key': apiKey || '',
    accept: 'application/json',
  };
}
