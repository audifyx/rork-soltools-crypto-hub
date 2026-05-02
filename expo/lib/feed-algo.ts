/**
 * Custom social feed ranking algorithm.
 *
 * Score is a hot-decay model inspired by Reddit/HN, tuned for trader-social
 * content. Each signal is weighted, then divided by an age polynomial so
 * fresh content surfaces while engaging older content survives longer.
 *
 *   raw      = likes + 2*reposts + 1.5*comments + 0.4*reactions
 *   freshness = 1 / (ageHours + 2)^1.5
 *   boosts   = follow(+30%) · ticker(+15%) · media(+10%) · verified(+10%)
 *   recency  = +0.6 if < 30 min, +0.3 if < 6h
 *   penalty  = older than 7d -> ×0.25
 *
 * Returns a stable numeric score; higher = surface earlier.
 */
export interface RankablePost {
  id: string;
  createdAt: number;
  likes: number;
  reposts: number;
  comments: number;
  reactions?: number;
  hasImage: boolean;
  hasTicker: boolean;
  isFollowing: boolean;
  isVerified: boolean;
}

export function computeHotScore(p: RankablePost, now: number = Date.now()): number {
  const ageMs = Math.max(0, now - p.createdAt);
  const ageHours = ageMs / 3_600_000;

  const raw =
    Math.max(0, p.likes) * 1 +
    Math.max(0, p.reposts) * 2 +
    Math.max(0, p.comments) * 1.5 +
    Math.max(0, p.reactions ?? 0) * 0.4;

  const fresh = 1 / Math.pow(ageHours + 2, 1.5);

  let mult = 1;
  if (p.isFollowing) mult *= 1.3;
  if (p.hasTicker) mult *= 1.15;
  if (p.hasImage) mult *= 1.1;
  if (p.isVerified) mult *= 1.1;

  let recencyBoost = 0;
  if (ageHours < 0.5) recencyBoost = 0.6;
  else if (ageHours < 6) recencyBoost = 0.3;

  let stalenessPenalty = 1;
  if (ageHours > 168) stalenessPenalty = 0.25;
  else if (ageHours > 72) stalenessPenalty = 0.6;

  return ((raw + 1) * fresh * mult + recencyBoost) * stalenessPenalty;
}

export type FeedSort = "for-you" | "latest" | "top" | "following" | "media";

export function rankPosts<T extends RankablePost>(posts: T[], sort: FeedSort, now: number = Date.now()): T[] {
  const arr = posts.slice();
  switch (sort) {
    case "latest":
      return arr.sort((a, b) => b.createdAt - a.createdAt);
    case "top": {
      const cutoff = now - 24 * 3_600_000;
      return arr
        .filter((p) => p.createdAt >= cutoff)
        .sort(
          (a, b) =>
            b.likes + b.reposts * 2 + b.comments * 1.5 - (a.likes + a.reposts * 2 + a.comments * 1.5),
        );
    }
    case "following":
      return arr.filter((p) => p.isFollowing).sort((a, b) => b.createdAt - a.createdAt);
    case "media":
      return arr
        .filter((p) => p.hasImage)
        .sort((a, b) => computeHotScore(b, now) - computeHotScore(a, now));
    case "for-you":
    default:
      return arr.sort((a, b) => computeHotScore(b, now) - computeHotScore(a, now));
  }
}
