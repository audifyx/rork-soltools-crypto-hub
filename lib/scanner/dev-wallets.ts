export function calculateDevRiskScore(rugs = 0, successful = 0): number {
  return Math.max(0, 100 - rugs * 15 + successful * 5);
}
