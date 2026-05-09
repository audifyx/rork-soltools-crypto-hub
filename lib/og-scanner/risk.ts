export type ScannerRiskLevel = 'low' | 'medium' | 'high';

export type ScannerRiskResult = {
  level: ScannerRiskLevel;
  notes: string[];
};

export function calculateScannerRisk(input: {
  liquidityUsd?: number;
  marketCap?: number;
  buyCount?: number;
  sellCount?: number;
  ageMinutes?: number;
}): ScannerRiskResult {
  const notes: string[] = [];

  const liquidity = input.liquidityUsd || 0;
  const marketCap = input.marketCap || 0;
  const buys = input.buyCount || 0;
  const sells = input.sellCount || 0;
  const ageMinutes = input.ageMinutes || 0;

  if (liquidity > 0 && liquidity < 5000) {
    notes.push('Very low liquidity');
  }

  if (marketCap > 0 && liquidity > 0 && marketCap / liquidity > 80) {
    notes.push('Liquidity thin relative to market cap');
  }

  if (sells > buys * 2 && sells > 25) {
    notes.push('Heavy sell pressure detected');
  }

  if (ageMinutes > 0 && ageMinutes < 30) {
    notes.push('Very new launch');
  }

  let level: ScannerRiskLevel = 'low';

  if (notes.length >= 3) {
    level = 'high';
  } else if (notes.length >= 1) {
    level = 'medium';
  }

  if (!notes.length) {
    notes.push('No major scanner warnings');
  }

  return {
    level,
    notes,
  };
}
