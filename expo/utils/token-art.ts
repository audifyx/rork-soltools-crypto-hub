/**
 * Custom fallback art for tokens that don't ship with their own banner/logo.
 * Picks a deterministic image based on token id/ticker so the same token
 * always shows the same character.
 */

export const SOLTOOLS_DEFAULT_BANNER =
  "https://r2-pub.rork.com/generated-images/8e1f2cdd-6aaa-4037-9e16-5544c98650a5.png";

const FALLBACK_BANNERS: readonly string[] = [
  "https://r2-pub.rork.com/generated-images/a00cc23b-17fc-4f04-a912-6e7b42ae424d.png", // pepe
  "https://r2-pub.rork.com/generated-images/d8c599ea-ec58-44a6-95a1-61f5fd69104b.png", // doge
  "https://r2-pub.rork.com/generated-images/376d5a4b-3a08-4061-b6d6-d2310dbdd8f4.png", // gigachad
  "https://r2-pub.rork.com/generated-images/b6599ae0-8e87-459b-8699-8924cbad5a69.png", // wojak
  "https://r2-pub.rork.com/generated-images/59f1a9b6-bbaf-44a5-9944-98fc579f3c50.png", // shiba astronaut
  "https://r2-pub.rork.com/generated-images/da7b5fcb-1002-4244-ab73-32ddad56ee42.png", // popcat
  "https://r2-pub.rork.com/generated-images/196caae5-ea14-4738-9a91-576b5044ae40.png", // bull vs bear
] as const;

const FALLBACK_LOGOS: readonly string[] = [
  "https://r2-pub.rork.com/generated-images/15db468b-0bef-4090-8922-8026e8557e00.png", // pepe
  "https://r2-pub.rork.com/generated-images/1488cb0a-fd2b-4d7f-9e29-a81253327b0f.png", // doge
  "https://r2-pub.rork.com/generated-images/db09063b-f1e8-4dd0-acca-0a63b6fe7df2.png", // gigachad
  "https://r2-pub.rork.com/generated-images/aaec8137-30bf-4c25-a004-b6d3034fbe02.png", // wojak
  "https://r2-pub.rork.com/generated-images/0ccc07bd-af33-4a35-8623-e0d6c9cb40a8.png", // shiba
  "https://r2-pub.rork.com/generated-images/ab0bec54-15cd-4c19-8271-83931d5b3a90.png", // popcat
  "https://r2-pub.rork.com/generated-images/41744e3c-8283-404e-a824-de652db1fa54.png", // bull
] as const;

/** FNV-1a — small, fast, deterministic hash. */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Resolve a banner URL: returns the explicit url, else a deterministic fallback. */
export function getTokenBanner(
  explicit: string | null | undefined,
  seed: string,
): string {
  if (explicit && explicit.length > 0) return explicit;
  if (!seed) return FALLBACK_BANNERS[0];
  return FALLBACK_BANNERS[hashString(seed) % FALLBACK_BANNERS.length];
}

/** Resolve a logo URL: returns the explicit url, else a deterministic fallback. */
export function getTokenLogo(
  explicit: string | null | undefined,
  seed: string,
): string {
  if (explicit && explicit.length > 0) return explicit;
  if (!seed) return FALLBACK_LOGOS[0];
  return FALLBACK_LOGOS[hashString(seed) % FALLBACK_LOGOS.length];
}
