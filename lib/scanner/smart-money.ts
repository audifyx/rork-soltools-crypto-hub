export function calculateWhaleConviction(size = 0, frequency = 0): number {
  return Math.round(size * 0.6 + frequency * 0.4);
}
