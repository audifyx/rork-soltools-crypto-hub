export function uniqueTokenStats(stats: string[]): string[] {
  return [...new Set(stats.filter(Boolean))];
}

export function normalizeTokenSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
