import { isSafeToken } from "@/lib/safety";
import type { LaunchToken } from "@/types/launchpad";

export const ALPHA_MIN_24H_VOLUME_USD = 1_000_000;
export const ALPHA_MAX_MARKET_CAP_USD = 50_000_000;
export const NEW_CHARITY_WINDOW_MS = 1000 * 60 * 60 * 24 * 120;

export const OG_MEME_TOKEN_SEARCH_TERMS = [
  "buttcoin",
  "troll",
  "wojak",
  "useless",
  "pengu",
  "pudgy penguins",
  "popcat",
  "dogwifhat",
  "bonk",
  "mew",
  "ponke",
  "fwog",
  "michi",
  "retardio",
  "goatseus",
  "fartcoin",
] as const;

const OG_MEME_TOKEN_TERMS = new Set([
  "buttcoin",
  "butt",
  "troll",
  "wojak",
  "useless",
  "pengu",
  "pudgy",
  "popcat",
  "wif",
  "dogwifhat",
  "bonk",
  "mew",
  "ponke",
  "fwog",
  "michi",
  "retardio",
  "mother",
  "boden",
  "mumu",
  "goat",
  "goatseus",
  "fartcoin",
  "fart",
]);

const OG_MEME_TOKEN_PHRASES = [
  "pudgy penguins",
  "dog wif hat",
  "dogwifhat",
  "goatseus maximus",
] as const;

const BLOCKED_LARGE_CAP_TERMS = new Set([
  "fartcoin",
  "fart",
  "troll",
  "sol",
  "usdc",
  "usdt",
  "jup",
  "jupiter",
  "bonk",
  "wif",
  "pyth",
  "jito",
  "jto",
  "ray",
  "orca",
]);

function normalizeTokenTerm(input: string): string {
  return input.replace(/^\$+/, "").trim().toLowerCase();
}

function normalizedTicker(token: LaunchToken): string {
  return normalizeTokenTerm(token.ticker);
}

function tokenHaystack(token: LaunchToken): string {
  return [token.name, token.ticker, token.description ?? "", token.venue, ...(token.tags ?? [])]
    .join(" ")
    .toLowerCase();
}

function looksBlockedLargeCap(token: LaunchToken): boolean {
  const ticker = normalizedTicker(token);
  const words = [ticker, ...token.name.toLowerCase().split(/[^a-z0-9]+/)].filter(Boolean);
  return words.some((word) => BLOCKED_LARGE_CAP_TERMS.has(word));
}

function hasLiveMarket(token: LaunchToken): boolean {
  return (token.marketCapUsd ?? 0) > 0 || (token.liquidityUsd ?? 0) > 0 || (token.volume24hUsd ?? 0) > 0;
}

function hasSafeLiveMarket(token: LaunchToken): boolean {
  return isSafeToken({
    marketCapUsd: token.marketCapUsd,
    liquidityUsd: token.liquidityUsd,
    volume24hUsd: token.volume24hUsd,
    holders: token.holders,
    priceUsd: token.price,
    priceChange24hPct: token.change24hPct,
    venue: token.venue,
    tags: token.tags,
  });
}

/** Returns true for established culture/meme coins from the OG Solana watch set. */
export function isOgMemeToken(token: LaunchToken): boolean {
  if (!hasLiveMarket(token) || !hasSafeLiveMarket(token)) return false;

  const ticker = normalizedTicker(token);
  const name = token.name.toLowerCase();
  const words = [
    ticker,
    ...token.name.toLowerCase().split(/[^a-z0-9]+/),
    ...(token.tags ?? []).map((tag) => normalizeTokenTerm(tag)),
  ].filter(Boolean);

  if (words.some((word) => OG_MEME_TOKEN_TERMS.has(word))) return true;
  return OG_MEME_TOKEN_PHRASES.some((phrase) => name.includes(phrase));
}

export function compareOgMemeTokens(a: LaunchToken, b: LaunchToken): number {
  const volumeDiff = (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0);
  if (volumeDiff !== 0) return volumeDiff;

  const marketCapDiff = (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0);
  if (marketCapDiff !== 0) return marketCapDiff;

  return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
}

/** Returns live OG meme/culture tokens ranked by real market activity. */
export function getOgMemeTokens(tokens: LaunchToken[], limit: number): LaunchToken[] {
  return tokens.filter(isOgMemeToken).sort(compareOgMemeTokens).slice(0, limit);
}

const MEME_TERMS = new Set([
  "meme", "doge", "shib", "shiba", "inu", "pepe", "frog", "cat", "dog",
  "wojak", "chad", "sigma", "based", "giga", "moon", "rocket", "ape", "apes",
  "banana", "penguin", "pengu", "pudgy", "popcat", "mew", "mog", "michi",
  "ponke", "fwog", "fart", "fartcoin", "buttcoin", "butt", "retardio",
  "troll", "useless", "goatseus", "goat", "mother", "boden", "mumu",
  "wif", "dogwifhat", "bonk", "smurfcat", "chillguy", "chill", "slerf",
  "book", "books", "nub", "giga chad", "gigachad", "hippo", "moo",
]);

const CELEBRITY_TERMS = new Set([
  "trump", "melania", "elon", "musk", "kanye", "ye", "taylor", "swift",
  "bieber", "drake", "kardashian", "kim", "kylie", "jenner", "rihanna",
  "beyonce", "jayz", "snoop", "eminem", "messi", "ronaldo", "lebron",
  "jordan", "tyson", "mrbeast", "pewdiepie", "logan", "paul", "jake",
  "andrew", "tate", "ai16z", "vitalik", "saylor", "cz", "sbf", "hawk",
  "haliey", "welch", "sydney", "sweeney", "sydneysweeney", "selena",
  "shakira", "madonna", "kanyewest", "snoopdogg", "bieber", "obama",
  "biden", "putin", "kim jong", "kimjong",
]);

function wordsOf(token: LaunchToken): string[] {
  return [
    normalizedTicker(token),
    ...token.name.toLowerCase().split(/[^a-z0-9]+/),
    ...(token.tags ?? []).map((tag) => normalizeTokenTerm(tag)),
  ].filter(Boolean);
}

export function isMemeToken(token: LaunchToken): boolean {
  if (!hasLiveMarket(token) || !hasSafeLiveMarket(token)) return false;
  const words = wordsOf(token);
  if (words.some((w) => MEME_TERMS.has(w))) return true;
  const text = tokenHaystack(token);
  return /\bmeme\b|memecoin|shitcoin/.test(text);
}

export function isCelebrityToken(token: LaunchToken): boolean {
  if (!hasLiveMarket(token) || !hasSafeLiveMarket(token)) return false;
  const words = wordsOf(token);
  if (words.some((w) => CELEBRITY_TERMS.has(w))) return true;
  const name = token.name.toLowerCase();
  return [
    "kim jong",
    "andrew tate",
    "taylor swift",
    "jake paul",
    "logan paul",
    "haliey welch",
    "sydney sweeney",
  ].some((phrase) => name.includes(phrase));
}

function compareByActivity(a: LaunchToken, b: LaunchToken): number {
  const v = (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0);
  if (v !== 0) return v;
  const m = (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0);
  if (m !== 0) return m;
  return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
}

export function getMemeTokens(tokens: LaunchToken[], limit: number): LaunchToken[] {
  return tokens.filter(isMemeToken).sort(compareByActivity).slice(0, limit);
}

export function getCelebrityTokens(tokens: LaunchToken[], limit: number): LaunchToken[] {
  return tokens.filter(isCelebrityToken).sort(compareByActivity).slice(0, limit);
}

export function getUtilityTokens(tokens: LaunchToken[], limit: number): LaunchToken[] {
  return tokens
    .filter((t) => hasLiveMarket(t) && hasSafeLiveMarket(t) && isUtilityToken(t))
    .sort(compareByActivity)
    .slice(0, limit);
}

/**
 * Returns true for the Solana daily-runner profile used by AI Alpha Insights:
 * $1M+ 24h volume, small-cap market cap, and no known large-cap/major names.
 */
export function isDailyAlphaRunner(token: LaunchToken): boolean {
  const volume = token.volume24hUsd ?? 0;
  const marketCap = token.marketCapUsd ?? 0;
  const change = token.change24hPct;

  if (!hasSafeLiveMarket(token)) return false;
  if (looksBlockedLargeCap(token)) return false;
  if (volume < ALPHA_MIN_24H_VOLUME_USD) return false;
  if (marketCap <= 0 || marketCap > ALPHA_MAX_MARKET_CAP_USD) return false;
  if (typeof change === "number" && change < 0) return false;

  return true;
}

export function getTokenLaunchYear(token: LaunchToken): number | null {
  if (!Number.isFinite(token.createdAt) || token.createdAt <= 0) return null;
  return new Date(token.createdAt).getUTCFullYear();
}

export function isRunnerFromYear(token: LaunchToken, year: number): boolean {
  return getTokenLaunchYear(token) === year && isDailyAlphaRunner(token);
}

export function isUtilityToken(token: LaunchToken): boolean {
  const text = tokenHaystack(token);
  if (/\bmeme\b|doge|shib|wif|bonk|pepe|frog|cat|dog|fart|troll|trump|wojak|inu/.test(text)) {
    return false;
  }
  return /\butility\b|\bdepin\b|\brwa\b|oracle|infra|protocol|network|wallet|payments?|payfi|trading|terminal|analytics|data|compute|storage|privacy|security|identity|launchpad|staking|yield|lend|perp|dex|swap|bridge|bot|agent|ai agent|tool|sdk|api/.test(text);
}

export function isUtilityRunner(token: LaunchToken): boolean {
  return isDailyAlphaRunner(token) && isUtilityToken(token);
}

export function isNewCharityCoin(token: LaunchToken): boolean {
  const text = tokenHaystack(token);
  const looksCharity = /charity|donat(e|ion|ions)|giving|relief|non\s?profit|foundation|philanthropy|fundraiser|aid\b|rescue|humanitarian|cause|impact|water|cancer|children|animals|shelter/.test(text);
  const isFresh = Date.now() - token.createdAt <= NEW_CHARITY_WINDOW_MS;
  const hasMarket = (token.volume24hUsd ?? 0) >= 25_000 || (token.liquidityUsd ?? 0) >= 10_000;
  return looksCharity && (isFresh || hasMarket);
}

/** Ranks alpha runners by today's volume first, then momentum and liquidity. */
export function compareDailyAlphaRunners(a: LaunchToken, b: LaunchToken): number {
  const volumeDiff = (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0);
  if (volumeDiff !== 0) return volumeDiff;

  const changeDiff = (b.change24hPct ?? 0) - (a.change24hPct ?? 0);
  if (changeDiff !== 0) return changeDiff;

  return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
}

/** Returns the highest-volume small-cap runners for today's AI alpha surfaces. */
export function getDailyAlphaRunners(tokens: LaunchToken[], limit: number): LaunchToken[] {
  return tokens.filter(isDailyAlphaRunner).sort(compareDailyAlphaRunners).slice(0, limit);
}

/** Converts live volume, momentum, liquidity, and turnover into a 60-99 confidence score. */
export function getAlphaRunnerScore(token: LaunchToken): number {
  const volume = token.volume24hUsd ?? 0;
  const marketCap = token.marketCapUsd ?? 0;
  const change = Math.max(0, token.change24hPct ?? 0);
  const liquidity = token.liquidityUsd ?? 0;

  const volumeScore = Math.min(35, (volume / ALPHA_MIN_24H_VOLUME_USD) * 10);
  const momentumScore = Math.min(20, change * 0.35);
  const turnoverScore = marketCap > 0 ? Math.min(25, (volume / marketCap) * 25) : 0;
  const liquidityScore = Math.min(12, (liquidity / 100_000) * 4);

  return Math.max(
    60,
    Math.min(99, Math.round(35 + volumeScore + momentumScore + turnoverScore + liquidityScore)),
  );
}
