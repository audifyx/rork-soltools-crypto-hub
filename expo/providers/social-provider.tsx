import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useState } from "react";

import Colors from "@/constants/colors";
import { useAuth } from "@/providers/auth-provider";

export interface Community {
  id: string;
  name: string;
  handle: string;
  description: string;
  category: "memes" | "ai" | "defi" | "nft" | "gaming" | "infra" | "trading" | "alpha";
  members: number;
  posts: number;
  online: number;
  verified: boolean;
  trending: boolean;
  accent: [string, string];
  iconEmoji: string;
  bannerSeed: string;
  pinnedTicker?: string;
  ownerHandle: string;
  createdAt: number;
  rules: string[];
  tags: string[];
}

export interface CommunityPost {
  id: string;
  communityId: string;
  authorHandle: string;
  authorName: string;
  authorColor: string;
  content: string;
  ticker?: string;
  changePct?: number;
  createdAt: number;
  likes: number;
  comments: number;
  liked: boolean;
  pinned?: boolean;
}

export interface Space {
  id: string;
  title: string;
  topic: string;
  description: string;
  hostHandle: string;
  hostName: string;
  coHosts: string[];
  speakers: number;
  listeners: number;
  isLive: boolean;
  scheduledAt?: number;
  startedAt?: number;
  category: "alpha" | "whales" | "ai" | "ta" | "memes" | "launches";
  accent: [string, string];
  recording: boolean;
  raisedHands: number;
}

const CATEGORY_ACCENTS: Record<Community["category"], [string, string]> = {
  memes: [Colors.orange, Colors.rose],
  ai: [Colors.cyan, Colors.violet],
  defi: [Colors.mint, Colors.cyan],
  nft: [Colors.rose, Colors.neon],
  gaming: [Colors.violet, Colors.cyan],
  infra: [Colors.mint, "#7B5BFF"],
  trading: [Colors.orange, Colors.mint],
  alpha: [Colors.cyan, Colors.mint],
};

const SEED_COMMUNITIES: Community[] = [
  {
    id: "sol-degens",
    name: "Sol Degens",
    handle: "soldegens",
    description: "The home of Solana memecoin hunters. Share alpha, post charts, ape responsibly.",
    category: "memes",
    members: 18432,
    posts: 9214,
    online: 412,
    verified: true,
    trending: true,
    accent: CATEGORY_ACCENTS.memes,
    iconEmoji: "🦄",
    bannerSeed: "deg",
    pinnedTicker: "$BONK",
    ownerHandle: "@cryptoking",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 90,
    rules: ["No pump groups", "Tag NFA on calls", "Be kind to new degens"],
    tags: ["memes", "solana", "degens"],
  },
  {
    id: "ai-alpha",
    name: "AI Alpha Lab",
    handle: "aialpha",
    description: "Workshop for AI agent tokens, signal bots, and on-chain ML. Build > shill.",
    category: "ai",
    members: 6204,
    posts: 2871,
    online: 188,
    verified: true,
    trending: true,
    accent: CATEGORY_ACCENTS.ai,
    iconEmoji: "🧠",
    bannerSeed: "ai",
    pinnedTicker: "$AGNT",
    ownerHandle: "@snipergpt",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 60,
    rules: ["Show your work", "Cite models", "No vaporware"],
    tags: ["ai", "agents", "automation"],
  },
  {
    id: "whale-room",
    name: "Whale Watch HQ",
    handle: "whaleroom",
    description: "Tracking smart money, whale wallets, and cluster buys in real time.",
    category: "trading",
    members: 9821,
    posts: 5403,
    online: 264,
    verified: true,
    trending: false,
    accent: CATEGORY_ACCENTS.trading,
    iconEmoji: "🐋",
    bannerSeed: "whale",
    pinnedTicker: "$SOL",
    ownerHandle: "@whaletracker",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 120,
    rules: ["Source your screenshots", "No screenshot edits", "Whale > opinion"],
    tags: ["whales", "wallets", "smart-money"],
  },
  {
    id: "defi-lab",
    name: "DeFi Lab",
    handle: "defilab",
    description: "Yields, vaults, perps, and protocol deep dives. Long-form welcomed.",
    category: "defi",
    members: 4810,
    posts: 1922,
    online: 92,
    verified: false,
    trending: false,
    accent: CATEGORY_ACCENTS.defi,
    iconEmoji: "🧪",
    bannerSeed: "defi",
    ownerHandle: "@chartmaster",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 200,
    rules: ["Disclose positions", "TVL > vibes"],
    tags: ["defi", "yields", "perps"],
  },
  {
    id: "launchpad-ops",
    name: "Launchpad Ops",
    handle: "launchpad",
    description: "Founders launching tokens, coordinating LPs, and reviewing each other's pitches.",
    category: "alpha",
    members: 2143,
    posts: 884,
    online: 41,
    verified: true,
    trending: true,
    accent: CATEGORY_ACCENTS.alpha,
    iconEmoji: "🚀",
    bannerSeed: "launch",
    ownerHandle: "@founder",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
    rules: ["No paid shills", "Audited contracts only"],
    tags: ["launches", "founders", "ido"],
  },
  {
    id: "nft-floor",
    name: "Floor Watchers",
    handle: "floors",
    description: "Solana NFT floors, mint schedules, and PFP meta. Charts welcome.",
    category: "nft",
    members: 3420,
    posts: 1290,
    online: 58,
    verified: false,
    trending: false,
    accent: CATEGORY_ACCENTS.nft,
    iconEmoji: "🎨",
    bannerSeed: "nft",
    ownerHandle: "@pfpwhale",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 150,
    rules: ["No mint shills"],
    tags: ["nft", "floors", "mints"],
  },
  {
    id: "gm-chat",
    name: "gm.chat",
    handle: "gm",
    description: "The morning-coffee community. Drop your gm, your bag, your goals.",
    category: "alpha",
    members: 24102,
    posts: 18421,
    online: 612,
    verified: false,
    trending: true,
    accent: [Colors.orange, Colors.mint],
    iconEmoji: "☀️",
    bannerSeed: "gm",
    ownerHandle: "@earlybird",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 365,
    rules: ["Always say gm"],
    tags: ["lifestyle", "daily"],
  },
  {
    id: "ta-school",
    name: "TA School",
    handle: "ta",
    description: "Technical analysis, chart breakdowns, and live setups. Bias-aware.",
    category: "trading",
    members: 5230,
    posts: 2104,
    online: 110,
    verified: true,
    trending: false,
    accent: [Colors.cyan, Colors.orange],
    iconEmoji: "📈",
    bannerSeed: "ta",
    ownerHandle: "@chartmaster",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 180,
    rules: ["Mark your invalidation", "No wojak charts (jk, post them)"],
    tags: ["ta", "charts", "trading"],
  },
];

const SEED_POSTS: CommunityPost[] = [
  {
    id: "p1",
    communityId: "sol-degens",
    authorHandle: "@cryptoking",
    authorName: "CryptoKing",
    authorColor: Colors.mint,
    content: "Pinned: rules for the new wave of degens entering this week. Read the FAQ before posting calls.",
    createdAt: Date.now() - 1000 * 60 * 30,
    likes: 412,
    comments: 38,
    liked: false,
    pinned: true,
  },
  {
    id: "p2",
    communityId: "sol-degens",
    authorHandle: "@frogwhisperer",
    authorName: "Frog",
    authorColor: Colors.rose,
    content: "Just sniped $WIF on the dip. Holding through the noise. NFA.",
    ticker: "$WIF",
    changePct: 18.4,
    createdAt: Date.now() - 1000 * 60 * 12,
    likes: 86,
    comments: 14,
    liked: false,
  },
  {
    id: "p3",
    communityId: "ai-alpha",
    authorHandle: "@snipergpt",
    authorName: "SniperGPT",
    authorColor: Colors.cyan,
    content: "Open-sourced our whale-detection prompt. Pull request welcome. Spaces tonight at 9pm UTC.",
    createdAt: Date.now() - 1000 * 60 * 60,
    likes: 204,
    comments: 22,
    liked: false,
    pinned: true,
  },
  {
    id: "p4",
    communityId: "ai-alpha",
    authorHandle: "@neuralnode",
    authorName: "Neural",
    authorColor: Colors.violet,
    content: "Backtested $AGNT signal — 71% win rate over 30d. Sharing notebook in the wiki.",
    ticker: "$AGNT",
    changePct: 6.2,
    createdAt: Date.now() - 1000 * 60 * 90,
    likes: 142,
    comments: 9,
    liked: false,
  },
  {
    id: "p5",
    communityId: "whale-room",
    authorHandle: "@whaletracker",
    authorName: "WhaleTracker",
    authorColor: Colors.cyan,
    content: "Cluster of 4 wallets just bought $SOL on the dip. ~$2.1M flow in last 30 min.",
    ticker: "$SOL",
    changePct: 3.1,
    createdAt: Date.now() - 1000 * 60 * 6,
    likes: 318,
    comments: 41,
    liked: false,
  },
];

const SEED_SPACES: Space[] = [
  {
    id: "live-alpha",
    title: "Live Alpha · Solana memes",
    topic: "MEMES",
    description: "Calls every 10 min. Speakers rotate. Bring charts.",
    hostHandle: "@cryptoking",
    hostName: "CryptoKing",
    coHosts: ["@frogwhisperer"],
    speakers: 6,
    listeners: 142,
    isLive: true,
    startedAt: Date.now() - 1000 * 60 * 22,
    category: "alpha",
    accent: [Colors.rose, Colors.orange],
    recording: true,
    raisedHands: 12,
  },
  {
    id: "whale-watch",
    title: "Whale Watch Hour",
    topic: "WHALES",
    description: "Tracking $50k+ moves with on-chain proof.",
    hostHandle: "@whaletracker",
    hostName: "WhaleTracker",
    coHosts: [],
    speakers: 3,
    listeners: 87,
    isLive: true,
    startedAt: Date.now() - 1000 * 60 * 8,
    category: "whales",
    accent: [Colors.cyan, Colors.violet],
    recording: false,
    raisedHands: 4,
  },
  {
    id: "ai-sniper",
    title: "AI Sniper Lounge",
    topic: "AI",
    description: "Walking through the auto-buy strategy stack live.",
    hostHandle: "@snipergpt",
    hostName: "SniperGPT",
    coHosts: ["@neuralnode"],
    speakers: 4,
    listeners: 64,
    isLive: true,
    startedAt: Date.now() - 1000 * 60 * 14,
    category: "ai",
    accent: [Colors.mint, Colors.cyan],
    recording: true,
    raisedHands: 7,
  },
  {
    id: "chart-vibes",
    title: "Chill Chart Vibes",
    topic: "TA",
    description: "TA, lo-fi beats, and slow scalps.",
    hostHandle: "@chartmaster",
    hostName: "ChartMaster",
    coHosts: [],
    speakers: 2,
    listeners: 41,
    isLive: false,
    scheduledAt: Date.now() + 1000 * 60 * 60 * 3,
    category: "ta",
    accent: [Colors.violet, Colors.rose],
    recording: false,
    raisedHands: 0,
  },
  {
    id: "launches-tonight",
    title: "Launches Tonight",
    topic: "LAUNCHES",
    description: "Founders pitch in 90s. Listeners vote.",
    hostHandle: "@founder",
    hostName: "Founder",
    coHosts: [],
    speakers: 0,
    listeners: 0,
    isLive: false,
    scheduledAt: Date.now() + 1000 * 60 * 60 * 8,
    category: "launches",
    accent: [Colors.mint, Colors.cyan],
    recording: false,
    raisedHands: 0,
  },
];

const KEY_JOINED = "soltools.social.joined.v1";
const KEY_FOLLOW_SPACES = "soltools.social.followspaces.v1";
const KEY_USER_POSTS = "soltools.social.userposts.v1";

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveJson<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.log("[social] persist failed", key, e);
  }
}

export const [SocialProvider, useSocial] = createContextHook(() => {
  const { userId } = useAuth();
  const scope = userId ?? "guest";
  const joinedKey = `${KEY_JOINED}.${scope}`;
  const followKey = `${KEY_FOLLOW_SPACES}.${scope}`;
  const userPostsKey = `${KEY_USER_POSTS}.${scope}`;

  const [joined, setJoined] = useState<string[]>([]);
  const [followingSpaces, setFollowingSpaces] = useState<string[]>([]);
  const [userPosts, setUserPosts] = useState<CommunityPost[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [j, f, p] = await Promise.all([
        loadJson<string[]>(joinedKey, []),
        loadJson<string[]>(followKey, []),
        loadJson<CommunityPost[]>(userPostsKey, []),
      ]);
      if (!alive) return;
      setJoined(j);
      setFollowingSpaces(f);
      setUserPosts(p);
    })();
    return () => {
      alive = false;
    };
  }, [joinedKey, followKey, userPostsKey]);

  const communities = useMemo<Community[]>(() => SEED_COMMUNITIES, []);
  const spaces = useMemo<Space[]>(() => SEED_SPACES, []);

  const allPosts = useMemo<CommunityPost[]>(
    () => [...userPosts, ...SEED_POSTS].sort((a, b) => b.createdAt - a.createdAt),
    [userPosts],
  );

  const isJoined = useCallback((id: string) => joined.includes(id), [joined]);
  const isFollowing = useCallback(
    (id: string) => followingSpaces.includes(id),
    [followingSpaces],
  );

  const toggleJoin = useCallback(
    async (id: string) => {
      const next = joined.includes(id) ? joined.filter((j) => j !== id) : [id, ...joined];
      setJoined(next);
      await saveJson(joinedKey, next);
    },
    [joined, joinedKey],
  );

  const toggleFollowSpace = useCallback(
    async (id: string) => {
      const next = followingSpaces.includes(id)
        ? followingSpaces.filter((j) => j !== id)
        : [id, ...followingSpaces];
      setFollowingSpaces(next);
      await saveJson(followKey, next);
    },
    [followingSpaces, followKey],
  );

  const getCommunity = useCallback(
    (id: string) => communities.find((c) => c.id === id || c.handle === id),
    [communities],
  );
  const getSpace = useCallback(
    (id: string) => spaces.find((s) => s.id === id),
    [spaces],
  );

  const postsByCommunity = useCallback(
    (id: string) =>
      allPosts.filter((p) => p.communityId === id).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.createdAt - a.createdAt;
      }),
    [allPosts],
  );

  const addCommunityPost = useCallback(
    async (input: {
      communityId: string;
      content: string;
      authorHandle: string;
      authorName: string;
      authorColor: string;
      ticker?: string;
    }) => {
      const post: CommunityPost = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        communityId: input.communityId,
        authorHandle: input.authorHandle,
        authorName: input.authorName,
        authorColor: input.authorColor,
        content: input.content,
        ticker: input.ticker,
        createdAt: Date.now(),
        likes: 0,
        comments: 0,
        liked: false,
      };
      const next = [post, ...userPosts];
      setUserPosts(next);
      await saveJson(userPostsKey, next);
    },
    [userPosts, userPostsKey],
  );

  const togglePostLike = useCallback(
    async (id: string) => {
      const next = userPosts.map((p) =>
        p.id === id ? { ...p, liked: !p.liked, likes: Math.max(0, p.likes + (p.liked ? -1 : 1)) } : p,
      );
      setUserPosts(next);
      await saveJson(userPostsKey, next);
    },
    [userPosts, userPostsKey],
  );

  const joinedCommunities = useMemo(
    () => communities.filter((c) => joined.includes(c.id)),
    [communities, joined],
  );

  const trendingCommunities = useMemo(
    () => communities.filter((c) => c.trending).sort((a, b) => b.online - a.online),
    [communities],
  );

  const liveSpaces = useMemo(() => spaces.filter((s) => s.isLive), [spaces]);
  const upcomingSpaces = useMemo(
    () => spaces.filter((s) => !s.isLive).sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0)),
    [spaces],
  );

  return useMemo(
    () => ({
      communities,
      joinedCommunities,
      trendingCommunities,
      isJoined,
      toggleJoin,
      getCommunity,
      postsByCommunity,
      addCommunityPost,
      togglePostLike,
      spaces,
      liveSpaces,
      upcomingSpaces,
      isFollowingSpace: isFollowing,
      toggleFollowSpace,
      getSpace,
    }),
    [
      communities,
      joinedCommunities,
      trendingCommunities,
      isJoined,
      toggleJoin,
      getCommunity,
      postsByCommunity,
      addCommunityPost,
      togglePostLike,
      spaces,
      liveSpaces,
      upcomingSpaces,
      isFollowing,
      toggleFollowSpace,
      getSpace,
    ],
  );
});
