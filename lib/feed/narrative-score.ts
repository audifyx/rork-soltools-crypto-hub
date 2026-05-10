export function calculateNarrativeScore(mentions = 0, whales = 0, kols = 0): number {
  const mentionScore = mentions * 0.5;
  const whaleScore = whales * 2;
  const kolScore = kols * 3;

  return Math.round(mentionScore + whaleScore + kolScore);
}
