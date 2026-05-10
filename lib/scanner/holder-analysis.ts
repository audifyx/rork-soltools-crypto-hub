export function calculateHolderConcentration(topHolderPercent = 0): string {
  if (topHolderPercent >= 40) {
    return 'high';
  }

  if (topHolderPercent >= 20) {
    return 'medium';
  }

  return 'low';
}
