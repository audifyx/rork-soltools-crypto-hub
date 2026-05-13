/**
 * Publicly known Solana KOL wallets.
 *
 * These addresses are widely circulated on kolscan.io, subglow.io, GMGN,
 * BlockBeats and other public on-chain analytics sources. They are used as a
 * client-side seed that augments whatever `get_kol_profiles` returns from
 * Supabase so the KOL Scan feed has a meaningful set of traders even before
 * the server-side directory is populated.
 *
 * Sources (public):
 *   - https://kolscan.io
 *   - https://subglow.io/copy-trading
 *   - https://kol.quest/gmgn-sol
 *   - https://www.thealphaclub.io
 *   - https://en.theblockbeats.news/news/54727 (Ansem)
 */
import type { KOLProfile } from "@/lib/api/kol";

export interface KOLSeed {
  id: string;
  name: string;
  x_handle: string;
  wallet_address: string;
  bio: string;
  verified: boolean;
  follower_count: number;
}

export const KOL_SEED_PROFILES: KOLSeed[] = [
  {
    id: "seed-ansem",
    name: "Ansem",
    x_handle: "blknoiz06",
    wallet_address: "AVAZvHLR2PcWpDf8BXY4rVxNHYRBytycHkcB5z5QNXYm",
    bio: "The Solana Guy. Early WIF, BILLY, BODEN.",
    verified: true,
    follower_count: 620000,
  },
  {
    id: "seed-cented",
    name: "Cented",
    x_handle: "Cented7",
    wallet_address: "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o",
    bio: "Top pump.fun trader. Consistently #1 on kolscan.",
    verified: true,
    follower_count: 410000,
  },
  {
    id: "seed-euris",
    name: "Euris",
    x_handle: "iameuris",
    wallet_address: "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj",
    bio: "Memecoin sniper. Sub-second entries.",
    verified: true,
    follower_count: 185000,
  },
  {
    id: "seed-cupsey",
    name: "Cupsey",
    x_handle: "cupseyy",
    wallet_address: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f",
    bio: "High-velocity Solana trader. Pump.fun OG.",
    verified: true,
    follower_count: 240000,
  },
  {
    id: "seed-orange",
    name: "Orange",
    x_handle: "OrangeSBS",
    wallet_address: "2X4H5Y9C4Fy6Pf3wpq8Q4gMvLcWvfrrwDv2bdR8AAwQv",
    bio: "Memecoin trader. Pump.fun whale.",
    verified: true,
    follower_count: 165000,
  },
  {
    id: "seed-mitch",
    name: "Mitch",
    x_handle: "idrawline",
    wallet_address: "4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t",
    bio: "Chart guy. Solana memecoin swing trader.",
    verified: true,
    follower_count: 152000,
  },
  {
    id: "seed-pow",
    name: "Pow",
    x_handle: "traderpow",
    wallet_address: "8zFZHuSRuDpuAR7J6FzwyF3vKNx4CVW3DFHJerQhc7Zd",
    bio: "Power trader. Macro + Solana memes.",
    verified: true,
    follower_count: 220000,
  },
  {
    id: "seed-gake",
    name: "Gake",
    x_handle: "GakeFlex",
    wallet_address: "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm",
    bio: "Pump.fun insider. High win-rate sniper.",
    verified: true,
    follower_count: 95000,
  },
  {
    id: "seed-casino",
    name: "Casino",
    x_handle: "CryptoGodJohn",
    wallet_address: "8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR",
    bio: "House always wins. Solana degen.",
    verified: true,
    follower_count: 130000,
  },
  {
    id: "seed-theo",
    name: "theo",
    x_handle: "0xTheo_",
    wallet_address: "Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt",
    bio: "Volume monster. Top 5 kolscan trader.",
    verified: true,
    follower_count: 78000,
  },
  {
    id: "seed-doji",
    name: "Doji",
    x_handle: "DojiCapital",
    wallet_address: "5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg",
    bio: "Scalper. High frequency Solana trader.",
    verified: true,
    follower_count: 64000,
  },
  {
    id: "seed-trenchman",
    name: "Trenchman",
    x_handle: "trenchmanjames",
    wallet_address: "Hw5UKBU5k3YudnGwaykj5E8cYUidNMPuEewRRar5Xoc7",
    bio: "In the trenches. Pump.fun warrior.",
    verified: true,
    follower_count: 58000,
  },
  {
    id: "seed-jijo",
    name: "Jijo",
    x_handle: "Jijo_Sol",
    wallet_address: "4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk",
    bio: "Solana swing trader. 70%+ win rate.",
    verified: true,
    follower_count: 42000,
  },
  {
    id: "seed-waiter",
    name: "Waiter",
    x_handle: "Waiter0x",
    wallet_address: "G4cXn58CGz5ehfqzwAj5jH4uMaqRfo3MMxmJYJ7HQGQp",
    bio: "Serving fresh tokens daily.",
    verified: true,
    follower_count: 38000,
  },
  {
    id: "seed-smokez",
    name: "Smokez",
    x_handle: "smokeyxbt",
    wallet_address: "5t9xByGqxKkqMjMNUYU3SmFvxNFTpYANuoH8gW8U8Qz1",
    bio: "Smoke signals. Memecoin alpha.",
    verified: true,
    follower_count: 51000,
  },
];

/**
 * Convert a seed entry into the full KOLProfile shape expected by the UI.
 * Stats are intentionally zeroed — the on-chain layer will hydrate real
 * activity, holdings, and PnL when the screens load.
 */
export function seedToProfile(s: KOLSeed): KOLProfile {
  return {
    id: s.id,
    name: s.name,
    x_handle: s.x_handle,
    wallet_address: s.wallet_address,
    blockchain: "solana",
    avatar_url: `https://unavatar.io/twitter/${s.x_handle}`,
    bio: s.bio,
    follower_count: s.follower_count,
    total_pnl_usd: 0,
    win_rate: 0,
    verified: s.verified,
    is_followed: false,
  };
}

export function allSeedProfiles(): KOLProfile[] {
  return KOL_SEED_PROFILES.map(seedToProfile);
}
