export type OGScoreInput = {
  liquidityUsd?: number;
  volume24h?: number;
  buyCount?: number;
  sellCount?: number;
  ageMinutes?: number;
  priceChange24h?: number;
};

export type OGScoreResult = {
  momentumScore: number;
  ogScore: number;
  buyPressure: number;
};

export function calculateBuyPressure(buyCount = 0, sellCount = 0): number {
  const total = buyCount + sellCount;

  if (total <= 0) {
    return 0;
  }

  return buyCount / total;
}

export function calculateMomentumScore(input: OGScoreInput): number {
  const volume = input.volume24h || 0;
  const liquidity = input.liquidityUsd || 0;
  const pressure = calculateBuyPressure(input.buyCount, input.sellCount);
  const change = input.priceChange24h || 0;

  const pressureScore = pressure * 35;
  const volumeScore = Math.min(25, Math.log10(Math.max(volume, 1)) * 4);
  const liquidityScore = Math.min(20, Math.log10(Math.max(liquidity, 1)) * 3);
  const changeScore = Math.max(0, Math.min(20, change / 5));

  return Math.round(
    Math.max(0, Math.min(100, pressureScore + volumeScore + liquidityScore + changeScore))
  );
}

export function calculateOGScore(input: OGScoreInput): OGScoreResult {
  const pressure = calculateBuyPressure(input.buyCount, input.sellCount);
  const momentumScore = calculateMomentumScore(input);

  const ageMinutes = input.ageMinutes || 0;
  const ageScore = ageMinutes > 0
    ? Math.max(0, 30 - Math.min(ageMinutes / 15, 30))
    : 0;

  const ogScore = Math.round(
    Math.max(0, Math.min(100, momentumScore * 0.7 + ageScore))
  );

  return {
    momentumScore,
    ogScore,
    buyPressure: pressure,
  };
}
