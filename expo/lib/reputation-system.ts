export function calculateLevel(points: number) {
  return Math.max(1, Math.floor(points / 1000) + 1);
}

export function calculateProgress(points: number) {
  return Math.min(100, Math.floor((points % 1000) / 10));
}

export function nextLevelTarget(level: number) {
  return level * 1000;
}
