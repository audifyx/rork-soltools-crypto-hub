/**
 * Custom fallback art for tokens that don't ship with their own banner/logo.
 * Banners use a single permanent stock asset so missing metadata never renders
 * as a generic gradient block.
 */

export const SOLTOOLS_DEFAULT_BANNER =
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/o23za4or0jutesw13rqqp.jpg";

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

/** Resolve a banner URL: returns metadata banner first, else the permanent stock banner. */
export function getTokenBanner(explicit: string | null | undefined, _seed?: string): string {
  const clean = explicit?.trim();
  return clean && clean.length > 0 ? clean : SOLTOOLS_DEFAULT_BANNER;
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
