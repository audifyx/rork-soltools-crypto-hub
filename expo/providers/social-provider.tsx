import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import Colors from "@/constants/colors";
import type { CommunityTokenCard } from "@/lib/community-token";
import { normalizeMediaUrl } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import { uploadPostImage } from "@/lib/upload";
import { useAdmin } from "@/providers/admin-provider";
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
  ownerId?: string;
  createdAt: number;
  rules: string[];
  tags: string[];
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  isPrivate?: boolean;
  holderOnly?: boolean;
  gateTokenMint?: string | null;
  gateMinimumBalance?: number | null;
}

export interface CommunityPostQuote {
  id: string;
  authorHandle: string;
  authorName: string;
  content: string;
  imageUrl?: string | null;
  ticker?: string;
  createdAt?: number;
  token?: CommunityTokenCard | null;
}

export interface CommunityPostReplyRef {
  id: string;
  authorHandle: string;
  authorName: string;
  content: string;
}

export interface CommunityPost {
  id: string;
  communityId: string;
  authorUserId?: string | null;
  authorHandle: string;
  authorName: string;
  authorColor: string;
  content: string;
  imageUrl?: string | null;
  ticker?: string;
  changePct?: number;
  createdAt: number;
  likes: number;
  comments: number;
  reposts: number;
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
  reported?: boolean;
  pinned?: boolean;
  parentPostId?: string | null;
  quotePostId?: string | null;
  quote?: CommunityPostQuote | null;
  replyTo?: CommunityPostReplyRef | null;
  token?: CommunityTokenCard | null;
}

export interface SpacePoll {
  id: string;
  q: string;
  options: string[];
  voters: Record<string, number>;
}

export interface Space {
  id: string;
  title: string;
  topic: string;
  description: string;
  hostId?: string | null;
  hostHandle: string;
  hostName: string;
  livekitRoomName: string;
  coHosts: string[];
  speakers: number;
  listeners: number;
  isLive: boolean;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduledAt?: number;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
  category: "alpha" | "whales" | "ai" | "ta" | "memes" | "launches";
  accent: [string, string];
  recording: boolean;
  raisedHands: number;
  bannerUrl?: string | null;
  viewersNow: number;
  peakListeners: number;
  totalViews: number;
  pinnedNote?: string | null;
  currentPoll?: SpacePoll | null;
}

export interface SpaceParticipant {
  id: string;
  roomId: string;
  userId?: string | null;
  identity: string;
  handle: string;
  name: string;
  avatarColor: string;
  role: "host" | "co-host" | "speaker" | "listener";
  muted: boolean;
  handRaised: boolean;
  speaking: boolean;
  joinedAt: number;
}

export interface SpaceMessage {
  id: string;
  roomId: string;
  userId: string;
  authorHandle: string;
  authorName: string;
  authorColor: string;
  body: string;
  type: "text" | "system" | "ticker" | "reaction";
  createdAt: number;
  likes: number;
  pinned: boolean;
}

export interface CreateSpaceInput {
  title: string;
  topic?: string;
  description?: string;
  category?: Space["category"];
  scheduledAt?: number | null;
  recording?: boolean;
  bannerUrl?: string | null;
}

const PALETTES: [string, string][] = [
  [Colors.orange, Colors.rose],
  [Colors.cyan, Colors.violet],
  [Colors.mint, Colors.cyan],
  [Colors.rose, Colors.neon],
  [Colors.violet, Colors.cyan],
  [Colors.cyan, Colors.mint],
  [Colors.mint, Colors.violet],
  [Colors.orange, Colors.mint],
];
const EMOJIS = ["✨", "🚀", "🦄", "🐋", "🧠", "📈", "🎨", "☀️", "🔥", "💎", "🪐", "⚡"];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function paletteFor(seed: string): [string, string] {
  return PALETTES[hashStr(seed) % PALETTES.length];
}
function emojiFor(seed: string): string {
  return EMOJIS[hashStr(seed) % EMOJIS.length];
}

const VALID_CATEGORIES: Community["category"][] = [
  "memes",
  "ai",
  "defi",
  "nft",
  "gaming",
  "infra",
  "trading",
  "alpha",
];

const VALID_SPACE_CATEGORIES: Space["category"][] = [
  "alpha",
  "whales",
  "ai",
  "ta",
  "memes",
  "launches",
];

const HIDDEN_COMMUNITY_SLUGS = new Set<string>(["soltools-feed"]);

function isVisibleCommunityRow(row: Pick<CommunityRow, "slug" | "name">): boolean {
  const slug = (row.slug ?? "").trim().toLowerCase();
  const name = row.name.trim().toLowerCase();
  return !HIDDEN_COMMUNITY_SLUGS.has(slug) && name !== "soltools feed";
}

type CommunityRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  owner_id: string | null;
  member_count: number | null;
  posts_count: number | null;
  online_count: number | null;
  category: string | null;
  icon_emoji: string | null;
  accent_a: string | null;
  accent_b: string | null;
  verified: boolean | null;
  trending: boolean | null;
  pinned_ticker: string | null;
  rules: unknown;
  tags: unknown;
  is_private: boolean | null;
  holder_only: boolean | null;
  gate_token_mint: string | null;
  gate_minimum_balance: number | null;
  avatar_url: string | null;
  banner_url: string | null;
  created_at: string | null;
};

type CommunityWithOwnerRow = CommunityRow & {
  owner_username?: string | null;
  owner_handle?: string | null;
};

type PersistedCommunityRow = Partial<CommunityRow> & {
  id?: string | null;
  slug?: string | null;
  created_at?: string | null;
};

function ownerHandleFromUsername(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().replace(/^@/, "") : "";
  return raw.length > 0 ? `@${raw}` : "";
}

function applyPersistedCommunityRow(community: Community, row: PersistedCommunityRow): void {
  if (typeof row.id === "string" && row.id.length > 0) community.id = row.id;
  if (typeof row.slug === "string" && row.slug.length > 0) community.handle = row.slug;
  if (typeof row.owner_id === "string" && row.owner_id.length > 0) community.ownerId = row.owner_id;
  if (typeof row.member_count === "number") community.members = row.member_count;
  if (typeof row.posts_count === "number") community.posts = row.posts_count;
  if (typeof row.online_count === "number") community.online = row.online_count;
  if (typeof row.created_at === "string" && row.created_at.length > 0) {
    community.createdAt = new Date(row.created_at).getTime();
  }
  if (row.avatar_url !== undefined) community.avatarUrl = normalizeMediaUrl(row.avatar_url);
  if (row.banner_url !== undefined) community.bannerUrl = normalizeMediaUrl(row.banner_url);
  if (typeof row.is_private === "boolean") community.isPrivate = row.is_private;
  if (typeof row.holder_only === "boolean") community.holderOnly = row.holder_only;
  if (typeof row.gate_token_mint === "string") community.gateTokenMint = row.gate_token_mint;
  if (typeof row.gate_minimum_balance === "number") community.gateMinimumBalance = row.gate_minimum_balance;
}

function rowToCommunity(row: CommunityRow, ownerHandle: string): Community {
  const seed = row.slug ?? row.id;
  const fallbackPalette = paletteFor(seed);
  const accent: [string, string] = [
    row.accent_a ?? fallbackPalette[0],
    row.accent_b ?? fallbackPalette[1],
  ];
  const cat = (row.category ?? "alpha").toLowerCase();
  const category: Community["category"] = (VALID_CATEGORIES as string[]).includes(cat)
    ? (cat as Community["category"])
    : "alpha";
  const rules = Array.isArray(row.rules) ? (row.rules as unknown[]).map(String) : [];
  const tags = Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [];
  return {
    id: row.id,
    name: row.name,
    handle: row.slug ?? row.id,
    description: row.description ?? "",
    category,
    members: row.member_count ?? 0,
    posts: row.posts_count ?? 0,
    online: row.online_count ?? 0,
    verified: !!row.verified,
    trending: !!row.trending,
    accent,
    iconEmoji: row.icon_emoji ?? emojiFor(seed),
    bannerSeed: seed,
    pinnedTicker: row.pinned_ticker ?? undefined,
    ownerHandle: ownerHandle,
    ownerId: row.owner_id ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    rules,
    tags,
    avatarUrl: normalizeMediaUrl(row.avatar_url),
    bannerUrl: normalizeMediaUrl(row.banner_url),
    isPrivate: !!row.is_private,
    holderOnly: !!row.holder_only,
    gateTokenMint: row.gate_token_mint ?? null,
    gateMinimumBalance: row.gate_minimum_balance ?? null,
  };
}

type PostRowRecord = Record<string, unknown>;

function displayNameFrom(username: string, displayName: unknown): string {
  return ((displayName as string | null) ?? username) || "User";
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function tokenFromRow(row: PostRowRecord): CommunityTokenCard | null {
  const address = (row.token_address as string | null) ?? null;
  if (!address) return null;
  const metadataRaw = row.token_metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
      ? (metadataRaw as Record<string, unknown>)
      : {};
  return {
    address,
    chain: "solana",
    symbol: (row.token_symbol as string | null) ?? (row.ticker as string | null) ?? "TOKEN",
    name: (row.token_name as string | null) ?? "Unknown Solana token",
    logoUrl: normalizeMediaUrl(row.token_logo_url),
    priceUsd: numberFrom(row.token_price_usd),
    change24h: numberFrom(row.token_change_24h),
    marketCapUsd: numberFrom(row.token_market_cap_usd),
    liquidityUsd: numberFrom(row.token_liquidity_usd),
    volume24hUsd: numberFrom(row.token_volume_24h_usd),
    pairAddress: (row.token_pair_address as string | null) ?? null,
    decimals: numberFrom(row.token_decimals),
    holderCount: numberFrom(row.token_holder_count),
    metadata,
    scannedAt: row.token_scanned_at ? new Date(row.token_scanned_at as string).getTime() : Date.now(),
  };
}

function tokenInsertFields(token?: CommunityTokenCard | null): Record<string, unknown> {
  if (!token) return {};
  return {
    token_address: token.address,
    token_symbol: token.symbol,
    token_name: token.name,
    token_logo_url: normalizeMediaUrl(token.logoUrl),
    token_price_usd: token.priceUsd ?? null,
    token_change_24h: token.change24h ?? null,
    token_market_cap_usd: token.marketCapUsd ?? null,
    token_liquidity_usd: token.liquidityUsd ?? null,
    token_volume_24h_usd: token.volume24hUsd ?? null,
    token_pair_address: token.pairAddress ?? null,
    token_decimals: token.decimals ?? null,
    token_holder_count: token.holderCount ?? null,
    token_metadata: token.metadata ?? {},
    token_scanned_at: new Date(token.scannedAt).toISOString(),
  };
}

const COMMUNITY_POST_SELECT = "id,user_id,community_id,content,image_url,ticker,change_pct,likes_count,comments_count,reposts_count,parent_post_id,quote_post_id,created_at,token_address,token_symbol,token_name,token_logo_url,token_price_usd,token_change_24h,token_market_cap_usd,token_liquidity_usd,token_volume_24h_usd,token_pair_address,token_decimals,token_holder_count,token_metadata,token_scanned_at";

function communityPostFromRow(row: PostRowRecord, fallbackCommunityId: string): CommunityPost {
  const postId = String(row.id);
  const username = (row.username as string | null) ?? "";
  const quoteUsername = (row.quote_author_username as string | null) ?? "";
  const quoteId = (row.quote_post_id as string | null) ?? null;
  const parentUsername = (row.parent_author_username as string | null) ?? "";
  const parentId = (row.parent_post_id as string | null) ?? null;
  const quoteContent = (row.quote_content as string | null) ?? "";
  const parentContent = (row.parent_content as string | null) ?? "";
  return {
    id: postId,
    communityId: (row.community_id as string | null) ?? fallbackCommunityId,
    authorUserId: (row.user_id as string | null) ?? null,
    authorHandle: username ? `@${username}` : "",
    authorName: displayNameFrom(username, row.display_name),
    authorColor: (row.avatar_color as string | null) ?? Colors.mint,
    content: (row.content as string | null) ?? "",
    imageUrl: normalizeMediaUrl(row.image_url),
    ticker: (row.ticker as string | null) ?? undefined,
    changePct: row.change_pct != null ? Number(row.change_pct) : undefined,
    token: tokenFromRow(row),
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
    likes: Number(row.likes_count ?? 0),
    comments: Number(row.comments_count ?? 0),
    reposts: Number(row.reposts_count ?? 0),
    liked: !!row.liked,
    reposted: !!row.reposted,
    bookmarked: !!row.bookmarked,
    reported: !!row.reported,
    pinned: !!row.pinned,
    parentPostId: parentId,
    quotePostId: quoteId,
    quote: quoteId
      ? {
          id: quoteId,
          authorHandle: quoteUsername ? `@${quoteUsername}` : "",
          authorName: displayNameFrom(quoteUsername, row.quote_author_display_name),
          content: quoteContent,
          imageUrl: normalizeMediaUrl(row.quote_image_url),
          ticker: (row.quote_ticker as string | null) ?? undefined,
          createdAt: row.quote_created_at
            ? new Date(row.quote_created_at as string).getTime()
            : undefined,
          token: null,
        }
      : null,
    replyTo: parentId
      ? {
          id: parentId,
          authorHandle: parentUsername ? `@${parentUsername}` : "",
          authorName: displayNameFrom(parentUsername, row.parent_author_display_name),
          content: parentContent,
        }
      : null,
  };
}

type SpaceRow = {
  id: string;
  name: string;
  topic: string | null;
  description: string | null;
  host_id: string | null;
  community_id: string | null;
  livekit_room_name?: string | null;
  status?: string | null;
  is_active: boolean | null;
  started_at: string | null;
  ended_at: string | null;
  scheduled_at: string | null;
  category: string | null;
  accent_a: string | null;
  accent_b: string | null;
  recording: boolean | null;
  raised_hands: number | null;
  listeners_count: number | null;
  speakers_count: number | null;
  created_at: string | null;
  banner_url?: string | null;
  viewers_now?: number | null;
  peak_listeners?: number | null;
  total_views?: number | null;
  pinned_note?: string | null;
  current_poll?: unknown;
};

type SpaceParticipantRow = {
  id: string;
  room_id: string;
  user_id: string | null;
  identity: string;
  display_name?: string | null;
  role: string | null;
  muted?: boolean | null;
  hand_raised?: boolean | null;
  speaking?: boolean | null;
  joined_at: string | null;
};

type SpaceMessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  body: string | null;
  message_type: string | null;
  created_at: string | null;
  likes_count?: number | null;
  pinned?: boolean | null;
};

type ProfileMiniRow = {
  id: string | null;
  user_id?: string | null;
  username: string | null;
  display_name: string | null;
  avatar_color?: string | null;
};

function rowToSpace(row: SpaceRow, hostHandle: string, hostName: string): Space {
  const seed = row.id;
  const fallbackPalette = paletteFor(seed);
  const accent: [string, string] = [
    row.accent_a ?? fallbackPalette[0],
    row.accent_b ?? fallbackPalette[1],
  ];
  const cat = (row.category ?? "alpha").toLowerCase();
  const category: Space["category"] = (VALID_SPACE_CATEGORIES as string[]).includes(cat)
    ? (cat as Space["category"])
    : "alpha";
  const statusRaw = (row.status ?? "scheduled").toLowerCase();
  const status: Space["status"] =
    statusRaw === "live" || statusRaw === "ended" || statusRaw === "cancelled" ? statusRaw : "scheduled";
  const isLive = (status === "live" || !!row.is_active) && !!row.started_at && !row.ended_at;
  return {
    id: row.id,
    title: row.name,
    topic: (row.topic ?? "GENERAL").toUpperCase(),
    description: row.description ?? "",
    hostId: row.host_id,
    hostHandle,
    hostName,
    livekitRoomName: row.livekit_room_name ?? `space-${row.id.replace(/-/g, "")}`,
    coHosts: [],
    speakers: row.speakers_count ?? 0,
    listeners: row.listeners_count ?? 0,
    isLive,
    status,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).getTime() : undefined,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : undefined,
    endedAt: row.ended_at ? new Date(row.ended_at).getTime() : undefined,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    category,
    accent,
    recording: !!row.recording,
    raisedHands: row.raised_hands ?? 0,
    bannerUrl: normalizeMediaUrl(row.banner_url ?? null),
    viewersNow: row.viewers_now ?? 0,
    peakListeners: row.peak_listeners ?? 0,
    totalViews: row.total_views ?? 0,
    pinnedNote: row.pinned_note ?? null,
    currentPoll: parsePoll(row.current_poll),
  };
}

function parsePoll(value: unknown): SpacePoll | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.q !== "string" || !Array.isArray(v.options)) return null;
  const options = v.options.filter((o): o is string => typeof o === "string");
  const votersRaw = (v.voters && typeof v.voters === "object") ? (v.voters as Record<string, unknown>) : {};
  const voters: Record<string, number> = {};
  for (const [k, val] of Object.entries(votersRaw)) {
    const n = typeof val === "number" ? val : Number(val);
    if (Number.isFinite(n)) voters[k] = n;
  }
  return {
    id: typeof v.id === "string" ? v.id : `${Date.now()}`,
    q: v.q,
    options,
    voters,
  };
}

function participantRole(value: unknown): SpaceParticipant["role"] {
  const raw = typeof value === "string" ? value.toLowerCase() : "listener";
  return raw === "host" || raw === "co-host" || raw === "speaker" ? raw : "listener";
}

function messageType(value: unknown): SpaceMessage["type"] {
  const raw = typeof value === "string" ? value.toLowerCase() : "text";
  return raw === "system" || raw === "ticker" || raw === "reaction" ? raw : "text";
}

function buildProfileMap(rows: ProfileMiniRow[] | null | undefined): Map<string, ProfileMiniRow> {
  const map = new Map<string, ProfileMiniRow>();
  for (const row of rows ?? []) {
    if (row.id) map.set(row.id, row);
    if (row.user_id) map.set(row.user_id, row);
  }
  return map;
}

function handleFromProfile(profile: ProfileMiniRow | undefined): string {
  const username = profile?.username?.trim() ?? "";
  return username ? `@${username.replace(/^@/, "")}` : "@soltools";
}

function nameFromProfile(profile: ProfileMiniRow | undefined, fallback: string): string {
  return (profile?.display_name?.trim() || profile?.username?.trim() || fallback) ?? fallback;
}

function isMissingSpaceRpcError(error: unknown): boolean {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "PGRST202" || message.includes("Could not find the function") || message.includes("schema cache");
}

const KEY_FOLLOW_SPACES = "soltools.social.followspaces.v1";
const KEY_JOINED_GUEST = "soltools.social.joined.guest.v1";
const KEY_LOCAL_COMMUNITIES_BASE = "soltools.social.communities.local.v2";

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
  const qc = useQueryClient();
  const { role } = useAdmin();
  const canModeratePosts = role === "superadmin" || role === "admin" || role === "moderator";
  const { userId, isAuthenticated } = useAuth();
  const scope = userId ?? "guest";
  const followKey = `${KEY_FOLLOW_SPACES}.${scope}`;
  // Local-only communities (created while offline / before RPC succeeded)
  // are scoped per user so they never leak across accounts after sign-out.
  const localKey = `${KEY_LOCAL_COMMUNITIES_BASE}.${scope}`;

  const [followingSpaces, setFollowingSpaces] = useState<string[]>([]);
  const [guestJoined, setGuestJoined] = useState<string[]>([]);
  const [localCommunities, setLocalCommunities] = useState<Community[]>([]);

  useEffect(() => {
    let alive = true;
    // Reset state immediately on scope change so the previous user's local
    // communities can't briefly flash before AsyncStorage hydrates.
    setLocalCommunities([]);
    setFollowingSpaces([]);
    setGuestJoined([]);
    void (async () => {
      const [f, gj, lc] = await Promise.all([
        loadJson<string[]>(followKey, []),
        loadJson<string[]>(KEY_JOINED_GUEST, []),
        loadJson<Community[]>(localKey, []),
      ]);
      if (!alive) return;
      setFollowingSpaces(f);
      setGuestJoined(gj);
      setLocalCommunities(lc);
    })();
    return () => {
      alive = false;
    };
  }, [followKey, localKey]);

  const communitiesQ = useQuery<Community[]>({
    queryKey: ["social", "communities", userId ?? "guest"],
    queryFn: async () => {
      const loadDirect = async (): Promise<Community[]> => {
        const { data, error } = await supabase
          .from("communities")
          .select(
            "id,name,slug,description,owner_id,member_count,posts_count,online_count,category,icon_emoji,accent_a,accent_b,verified,trending,pinned_ticker,rules,tags,is_private,holder_only,gate_token_mint,gate_minimum_balance,avatar_url,banner_url,created_at",
          )
          .or(`is_private.eq.false,owner_id.eq.${userId ?? "00000000-0000-0000-0000-000000000000"}`)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        const rows = (data ?? []) as CommunityRow[];
        const ownerIds = Array.from(
          new Set(rows.map((r) => r.owner_id).filter((v): v is string => !!v)),
        );
        let ownerHandles = new Map<string, string>();
        if (ownerIds.length > 0) {
          const { data: profs, error: profilesError } = await supabase
            .from("profiles")
            .select("id,user_id,username")
            .or(`id.in.(${ownerIds.join(",")}),user_id.in.(${ownerIds.join(",")})`);
          if (profilesError) {
            console.log("[social] community owner profiles fetch failed", profilesError.message);
          }
          ownerHandles = new Map(
            (profs ?? []).flatMap((p) => {
              const handle = ownerHandleFromUsername(p.username);
              return [
                [p.id as string, handle] as [string, string],
                [p.user_id as string, handle] as [string, string],
              ];
            }),
          );
        }
        return rows
          .filter(isVisibleCommunityRow)
          .map((r) =>
            rowToCommunity(r, r.owner_id ? ownerHandles.get(r.owner_id) ?? "" : ""),
          );
      };

      try {
        return await loadDirect();
      } catch (e) {
        console.log("[social] direct communities fetch failed, trying RPC", e);
      }

      try {
        const { data, error } = await supabase.rpc("list_public_communities", {
          max_rows: 200,
        });
        if (error) throw error;
        const rows = (data ?? []) as CommunityWithOwnerRow[];
        return rows
          .filter(isVisibleCommunityRow)
          .map((r) =>
            rowToCommunity(
              r,
              ownerHandleFromUsername(r.owner_username ?? r.owner_handle ?? null),
            ),
          );
      } catch (e) {
        console.log("[social] communities fetch failed", e);
        return [];
      }
    },
    staleTime: 30_000,
  });

  const myMembershipsQ = useQuery<string[]>({
    queryKey: ["social", "memberships", userId ?? "guest"],
    queryFn: async () => {
      if (!isAuthenticated || !userId) return guestJoined;
      try {
        const { data, error } = await supabase
          .from("community_members")
          .select("community_id")
          .eq("user_id", userId);
        if (error) throw error;
        return (data ?? []).map((r) => r.community_id as string);
      } catch (e) {
        console.log("[social] memberships fetch failed", e);
        return [];
      }
    },
    staleTime: 15_000,
  });

  const spacesQ = useQuery<Space[]>({
    queryKey: ["social", "spaces"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("livekit_rooms")
          .select(
            "id,name,topic,description,host_id,community_id,livekit_room_name,status,is_active,started_at,ended_at,scheduled_at,category,accent_a,accent_b,recording,raised_hands,listeners_count,speakers_count,created_at,banner_url,viewers_now,peak_listeners,total_views,pinned_note,current_poll",
          )
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(120);
        if (error) throw error;
        const rows = (data ?? []) as SpaceRow[];
        const hostIds = Array.from(
          new Set(rows.map((r) => r.host_id).filter((v): v is string => !!v)),
        );
        let hostMap = new Map<string, { handle: string; name: string }>();
        if (hostIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,user_id,username,display_name")
            .or(`id.in.(${hostIds.join(",")}),user_id.in.(${hostIds.join(",")})`);
          const profileMap = buildProfileMap((profs ?? []) as ProfileMiniRow[]);
          hostMap = new Map(
            hostIds.map((hostId) => {
              const p = profileMap.get(hostId);
              return [
                hostId,
                {
                  handle: handleFromProfile(p),
                  name: nameFromProfile(p, "Host"),
                },
              ];
            }),
          );
        }
        return rows.map((r) => {
          const host = r.host_id ? hostMap.get(r.host_id) : undefined;
          return rowToSpace(r, host?.handle ?? "", host?.name ?? "Host");
        });
      } catch (e) {
        console.log("[social] spaces fetch failed", e);
        return [];
      }
    },
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("social-spaces-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "livekit_rooms" }, () => {
        qc.invalidateQueries({ queryKey: ["social", "spaces"] }).catch(() => {});
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "livekit_participants" }, () => {
        qc.invalidateQueries({ queryKey: ["social", "spaces"] }).catch(() => {});
        qc.invalidateQueries({ queryKey: ["space", "participants"] }).catch(() => {});
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "space_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["space", "messages"] }).catch(() => {});
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [qc]);

  const remoteCommunities = communitiesQ.data ?? [];
  const communities = useMemo<Community[]>(() => {
    if (localCommunities.length === 0) return remoteCommunities;
    const seen = new Set(remoteCommunities.map((c) => c.id));
    const fresh = localCommunities.filter((c) => !seen.has(c.id));
    return [...fresh, ...remoteCommunities];
  }, [remoteCommunities, localCommunities]);
  const spaces = spacesQ.data ?? [];
  const joined = myMembershipsQ.data ?? [];

  const isJoined = useCallback((id: string) => joined.includes(id), [joined]);
  const isFollowing = useCallback(
    (id: string) => followingSpaces.includes(id),
    [followingSpaces],
  );

  const toggleJoinMut = useMutation({
    mutationFn: async (id: string) => {
      const has = joined.includes(id);
      if (isAuthenticated && userId) {
        if (has) {
          await supabase
            .from("community_members")
            .delete()
            .eq("community_id", id)
            .eq("user_id", userId);
        } else {
          await supabase
            .from("community_members")
            .insert({ community_id: id, user_id: userId });
        }
      } else {
        const next = has ? guestJoined.filter((j) => j !== id) : [id, ...guestJoined];
        setGuestJoined(next);
        await saveJson(KEY_JOINED_GUEST, next);
      }
      return has ? joined.filter((j) => j !== id) : [id, ...joined];
    },
    onMutate: (id: string) => {
      const prev = joined;
      const wasJoined = prev.includes(id);
      const next = wasJoined ? prev.filter((j) => j !== id) : [id, ...prev];
      qc.setQueryData(["social", "memberships", userId ?? "guest"], next);
      qc.setQueriesData<Community[]>({ queryKey: ["social", "communities"] }, (list) =>
        list?.map((c) =>
          c.id === id ? { ...c, members: Math.max(0, c.members + (wasJoined ? -1 : 1)) } : c,
        ),
      );
      return { prev, wasJoined };
    },
    onError: (_e, id, ctx) => {
      const prev = (ctx as { prev?: string[]; wasJoined?: boolean } | undefined)?.prev;
      const wasJoined = (ctx as { prev?: string[]; wasJoined?: boolean } | undefined)?.wasJoined;
      if (prev) qc.setQueryData(["social", "memberships", userId ?? "guest"], prev);
      if (typeof wasJoined === "boolean") {
        qc.setQueriesData<Community[]>({ queryKey: ["social", "communities"] }, (list) =>
          list?.map((c) =>
            c.id === id ? { ...c, members: Math.max(0, c.members + (wasJoined ? 1 : -1)) } : c,
          ),
        );
      }
    },
    onSuccess: (next, id) => {
      qc.setQueryData(["social", "memberships", userId ?? "guest"], next);
      qc.invalidateQueries({ queryKey: ["social", "communities"] });
      qc.invalidateQueries({ queryKey: ["community", "members", id] });
    },
  });

  const toggleJoin = useCallback(
    (id: string) => {
      toggleJoinMut.mutate(id);
    },
    [toggleJoinMut],
  );

  const toggleFollowSpace = useCallback(
    async (id: string) => {
      const willFollow = !followingSpaces.includes(id);
      const next = willFollow
        ? [id, ...followingSpaces]
        : followingSpaces.filter((j) => j !== id);
      setFollowingSpaces(next);
      await saveJson(followKey, next);
      if (isAuthenticated && userId) {
        try {
          const { error } = await supabase.rpc("follow_space", {
            target_room_id: id,
            p_follow: willFollow,
          });
          if (error) throw error;
        } catch (e) {
          console.log("[social] follow_space failed", e);
        }
      }
    },
    [followingSpaces, followKey, isAuthenticated, userId],
  );

  const createSpace = useCallback(
    async (input: CreateSpaceInput): Promise<string> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to start a Space.");
      const title = input.title.trim();
      if (title.length < 3) throw new Error("Give your Space a stronger title.");
      const palette = paletteFor(`${title}-${Date.now()}`);
      const topic = (input.topic?.trim() || "ALPHA").slice(0, 28).toUpperCase();
      const description = (input.description?.trim() || "").slice(0, 500);
      const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null;
      const category = input.category ?? "alpha";
      let id = "";

      const { data, error } = await supabase.rpc("create_space", {
        p_name: title,
        p_topic: topic,
        p_description: description,
        p_category: category,
        p_scheduled_at: scheduledAt,
        p_recording: !!input.recording,
        p_accent_a: palette[0],
        p_accent_b: palette[1],
        p_banner_url: input.bannerUrl ?? null,
      });

      if (error) {
        const rpcMissing = isMissingSpaceRpcError(error);
        if (!rpcMissing) {
          console.log("[social] create_space rpc failed", error.message ?? error);
          throw new Error(error.message || "Could not create the Space. Try again.");
        }
        console.log("[social] create_space rpc unavailable, using direct insert fallback");
        const createdId = Crypto.randomUUID();
        const roomName = `space-${createdId.replace(/-/g, "")}`;
        const { data: inserted, error: insertError } = await supabase
          .from("livekit_rooms")
          .insert({
            id: createdId,
            name: title,
            topic,
            description,
            host_id: userId,
            livekit_room_name: roomName,
            status: scheduledAt ? "scheduled" : "live",
            is_active: !scheduledAt,
            started_at: scheduledAt ? null : new Date().toISOString(),
            scheduled_at: scheduledAt,
            category,
            recording: !!input.recording,
            accent_a: palette[0],
            accent_b: palette[1],
            banner_url: input.bannerUrl ?? null,
          })
          .select("id")
          .single();
        if (insertError) {
          console.log("[social] livekit_rooms insert failed", insertError.message);
          throw new Error(
            insertError.message?.includes("row-level security")
              ? "Spaces tables are missing permissions. Sign out and back in, then try again."
              : insertError.message || "Could not save the Space. Try again.",
          );
        }
        id = String(inserted?.id ?? createdId);
        const { error: joinError } = await supabase
          .from("livekit_participants")
          .upsert(
            {
              room_id: id,
              user_id: userId,
              identity: userId,
              display_name: "Host",
              role: "host",
              muted: false,
              hand_raised: false,
              speaking: false,
              left_at: null,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "room_id,user_id" },
          );
        if (joinError) {
          console.log("[social] host participant upsert failed", joinError.message);
        }
      } else {
        id = typeof data === "string" ? data : String(data ?? "");
      }

      if (!id) throw new Error("Space could not be created.");
      await qc.invalidateQueries({ queryKey: ["social", "spaces"] });
      return id;
    },
    [isAuthenticated, userId, qc],
  );

  const startSpace = useCallback(
    async (id: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to start this Space.");
      const { error } = await supabase.rpc("start_space", { target_room_id: id });
      if (error) {
        if (!isMissingSpaceRpcError(error)) throw error;
        const { error: updateError } = await supabase
          .from("livekit_rooms")
          .update({ status: "live", is_active: true, started_at: new Date().toISOString(), ended_at: null, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("host_id", userId);
        if (updateError) throw updateError;
      }
      await qc.invalidateQueries({ queryKey: ["social", "spaces"] });
    },
    [isAuthenticated, userId, qc],
  );

  const joinSpace = useCallback(
    async (id: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to join Spaces.");
      const { error } = await supabase.rpc("join_space", { target_room_id: id });
      if (error) {
        if (!isMissingSpaceRpcError(error)) throw error;
        const space = spaces.find((s) => s.id === id);
        await supabase
          .from("livekit_participants")
          .upsert({
            room_id: id,
            user_id: userId,
            identity: userId,
            display_name: "Trader",
            role: space?.hostId === userId ? "host" : "listener",
            muted: space?.hostId === userId ? false : true,
            hand_raised: false,
            speaking: false,
            left_at: null,
            last_seen_at: new Date().toISOString(),
          }, { onConflict: "room_id,user_id" });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["social", "spaces"] }),
        qc.invalidateQueries({ queryKey: ["space", "participants", id] }),
      ]);
    },
    [isAuthenticated, userId, qc, spaces],
  );

  const leaveSpace = useCallback(
    async (id: string): Promise<void> => {
      if (!isAuthenticated || !userId) return;
      const { error } = await supabase.rpc("leave_space", { target_room_id: id });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["social", "spaces"] }),
        qc.invalidateQueries({ queryKey: ["space", "participants", id] }),
      ]);
    },
    [isAuthenticated, userId, qc],
  );

  const setSpaceMute = useCallback(
    async (id: string, muted: boolean): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to use mic controls.");
      const { error } = await supabase.rpc("set_space_mute", {
        target_room_id: id,
        p_muted: muted,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["space", "participants", id] });
    },
    [isAuthenticated, userId, qc],
  );

  const setSpaceHand = useCallback(
    async (id: string, raised: boolean): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to raise your hand.");
      const { error } = await supabase.rpc("set_space_hand", {
        target_room_id: id,
        p_raised: raised,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["social", "spaces"] }),
        qc.invalidateQueries({ queryKey: ["space", "participants", id] }),
      ]);
    },
    [isAuthenticated, userId, qc],
  );

  const setSpaceParticipantRole = useCallback(
    async (id: string, participantId: string, role: SpaceParticipant["role"]): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Only hosts can manage the stage.");
      const { error } = await supabase.rpc("set_space_participant_role", {
        target_room_id: id,
        target_participant_id: participantId,
        p_role: role,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["social", "spaces"] }),
        qc.invalidateQueries({ queryKey: ["space", "participants", id] }),
      ]);
    },
    [isAuthenticated, userId, qc],
  );

  const removeSpaceParticipant = useCallback(
    async (id: string, participantId: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Only hosts can remove listeners.");
      const { error } = await supabase.rpc("remove_space_participant", {
        target_room_id: id,
        target_participant_id: participantId,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["social", "spaces"] }),
        qc.invalidateQueries({ queryKey: ["space", "participants", id] }),
      ]);
    },
    [isAuthenticated, userId, qc],
  );

  /**
   * Host-only: force-mute a single participant by flipping their
   * `livekit_participants.muted` flag. Clients listen to that row through
   * the realtime channel and disable their mic automatically.
   */
  const forceMuteParticipant = useCallback(
    async (id: string, participantId: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Only hosts can force-mute.");
      const { error } = await supabase.rpc("set_space_participant_mute", {
        target_room_id: id,
        target_participant_id: participantId,
        p_muted: true,
      });
      if (error) {
        if (!isMissingSpaceRpcError(error)) throw error;
        const { error: updateError } = await supabase
          .from("livekit_participants")
          .update({ muted: true })
          .eq("room_id", id)
          .eq("id", participantId);
        if (updateError) throw updateError;
      }
      await qc.invalidateQueries({ queryKey: ["space", "participants", id] });
    },
    [isAuthenticated, userId, qc],
  );

  /**
   * Host-only: mute every non-host participant in the room at once.
   */
  const muteAllInSpace = useCallback(
    async (id: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Only hosts can mute the room.");
      const { error } = await supabase.rpc("mute_all_space_participants", {
        target_room_id: id,
      });
      if (error) {
        if (!isMissingSpaceRpcError(error)) throw error;
        const { error: updateError } = await supabase
          .from("livekit_participants")
          .update({ muted: true })
          .eq("room_id", id)
          .neq("role", "host");
        if (updateError) throw updateError;
      }
      await qc.invalidateQueries({ queryKey: ["space", "participants", id] });
    },
    [isAuthenticated, userId, qc],
  );

  /**
   * Host-only: lower a single raised hand without granting stage access.
   */
  const lowerSpaceHand = useCallback(
    async (id: string, participantId: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Only hosts can lower hands.");
      const { error } = await supabase
        .from("livekit_participants")
        .update({ hand_raised: false })
        .eq("room_id", id)
        .eq("id", participantId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["space", "participants", id] });
    },
    [isAuthenticated, userId, qc],
  );

  const heartbeatSpace = useCallback(
    async (id: string): Promise<void> => {
      if (!isAuthenticated || !userId) return;
      const { error } = await supabase.rpc("heartbeat_space_participant", { target_room_id: id });
      if (error) console.log("[social] space heartbeat failed", error.message);
    },
    [isAuthenticated, userId],
  );

  const sendSpaceMessage = useCallback(
    async (id: string, body: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to chat in Spaces.");
      const clean = body.trim();
      if (!clean) return;
      const { error } = await supabase.rpc("send_space_message", {
        target_room_id: id,
        p_body: clean,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["space", "messages", id] });
    },
    [isAuthenticated, userId, qc],
  );

  const addSpaceReaction = useCallback(
    async (id: string, emoji: string = "🔥"): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to react.");
      const { error } = await supabase.rpc("add_space_reaction", {
        target_room_id: id,
        p_emoji: emoji,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["space", "reactions", id] });
    },
    [isAuthenticated, userId, qc],
  );

  const endSpace = useCallback(
    async (id: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to end this Space.");
      const { error } = await supabase.rpc("end_space", { target_room_id: id });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["social", "spaces"] });
    },
    [isAuthenticated, userId, qc],
  );

  const updateSpaceBanner = useCallback(
    async (id: string, bannerUrl: string | null): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to edit this Space.");
      const { error } = await supabase.rpc("update_space_banner", {
        target_room_id: id,
        p_banner_url: bannerUrl,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["social", "spaces"] });
    },
    [isAuthenticated, userId, qc],
  );

  const setSpacePin = useCallback(
    async (id: string, note: string | null): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to pin notes.");
      const { error } = await supabase.rpc("set_space_pin", {
        target_room_id: id,
        p_note: note,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["social", "spaces"] });
    },
    [isAuthenticated, userId, qc],
  );

  const setSpacePoll = useCallback(
    async (id: string, poll: SpacePoll | null): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to launch a poll.");
      const { error } = await supabase.rpc("set_space_poll", {
        target_room_id: id,
        p_poll: poll,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["social", "spaces"] });
    },
    [isAuthenticated, userId, qc],
  );

  const voteSpacePoll = useCallback(
    async (id: string, option: number): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to vote.");
      const { error } = await supabase.rpc("vote_space_poll", {
        target_room_id: id,
        p_option: option,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["social", "spaces"] });
    },
    [isAuthenticated, userId, qc],
  );

  const likeSpaceMessage = useCallback(
    async (messageId: string, spaceId: string): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to react.");
      const { error } = await supabase.rpc("toggle_space_message_like", {
        target_message_id: messageId,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["space", "messages", spaceId] });
      await qc.invalidateQueries({ queryKey: ["space", "liked-messages", spaceId, userId ?? "guest"] });
    },
    [isAuthenticated, userId, qc],
  );

  const pinSpaceMessage = useCallback(
    async (spaceId: string, messageId: string, pinned: boolean): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Only hosts can pin messages.");
      const { error } = await supabase.rpc("pin_space_message", {
        target_room_id: spaceId,
        target_message_id: messageId,
        p_pinned: pinned,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["space", "messages", spaceId] });
    },
    [isAuthenticated, userId, qc],
  );

  const useMyLikedMessages = (spaceId: string | undefined) =>
    useQuery<Set<string>>({
      queryKey: ["space", "liked-messages", spaceId ?? "", userId ?? "guest"],
      enabled: !!spaceId && !!userId,
      queryFn: async () => {
        if (!spaceId || !userId) return new Set();
        const { data, error } = await supabase
          .from("space_message_likes")
          .select("message_id, space_messages!inner(room_id)")
          .eq("user_id", userId)
          .eq("space_messages.room_id", spaceId);
        if (error) {
          console.log("[social] liked messages fetch failed", error.message);
          return new Set();
        }
        return new Set((data ?? []).map((r) => String((r as { message_id: string }).message_id)));
      },
      staleTime: 10_000,
    });

  const useSpaceParticipants = (id: string | undefined) =>
    useQuery<SpaceParticipant[]>({
      queryKey: ["space", "participants", id ?? ""],
      enabled: !!id,
      queryFn: async () => {
        if (!id) return [];
        try {
          const { data, error } = await supabase
            .from("livekit_participants")
            .select("id,room_id,user_id,identity,display_name,role,muted,hand_raised,speaking,joined_at")
            .eq("room_id", id)
            .is("left_at", null)
            .order("joined_at", { ascending: true })
            .limit(250);
          if (error) throw error;
          const rows = (data ?? []) as SpaceParticipantRow[];
          const userIds = Array.from(
            new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v)),
          );
          let profiles = new Map<string, ProfileMiniRow>();
          if (userIds.length > 0) {
            const { data: profileRows, error: profileError } = await supabase
              .from("profiles")
              .select("id,user_id,username,display_name,avatar_color")
              .or(`id.in.(${userIds.join(",")}),user_id.in.(${userIds.join(",")})`);
            if (profileError) console.log("[social] space participant profiles failed", profileError.message);
            profiles = buildProfileMap((profileRows ?? []) as ProfileMiniRow[]);
          }
          return rows.map((r): SpaceParticipant => {
            const profile = r.user_id ? profiles.get(r.user_id) : undefined;
            return {
              id: r.id,
              roomId: r.room_id,
              userId: r.user_id,
              identity: r.identity,
              handle: handleFromProfile(profile),
              name: nameFromProfile(profile, r.display_name ?? r.identity ?? "Listener"),
              avatarColor: profile?.avatar_color ?? paletteFor(r.identity)[0],
              role: participantRole(r.role),
              muted: r.muted ?? true,
              handRaised: r.hand_raised ?? false,
              speaking: r.speaking ?? false,
              joinedAt: r.joined_at ? new Date(r.joined_at).getTime() : Date.now(),
            };
          });
        } catch (e) {
          console.log("[social] space participants failed", e);
          return [];
        }
      },
      staleTime: 5_000,
      refetchInterval: 10_000,
    });

  const useSpaceMessages = (id: string | undefined) =>
    useQuery<SpaceMessage[]>({
      queryKey: ["space", "messages", id ?? ""],
      enabled: !!id,
      queryFn: async () => {
        if (!id) return [];
        try {
          const { data, error } = await supabase
            .from("space_messages")
            .select("id,room_id,user_id,body,message_type,created_at,likes_count,pinned")
            .eq("room_id", id)
            .order("created_at", { ascending: true })
            .limit(120);
          if (error) throw error;
          const rows = (data ?? []) as SpaceMessageRow[];
          const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
          let profiles = new Map<string, ProfileMiniRow>();
          if (userIds.length > 0) {
            const { data: profileRows, error: profileError } = await supabase
              .from("profiles")
              .select("id,user_id,username,display_name,avatar_color")
              .or(`id.in.(${userIds.join(",")}),user_id.in.(${userIds.join(",")})`);
            if (profileError) console.log("[social] space message profiles failed", profileError.message);
            profiles = buildProfileMap((profileRows ?? []) as ProfileMiniRow[]);
          }
          return rows.map((r): SpaceMessage => {
            const profile = profiles.get(r.user_id);
            return {
              id: r.id,
              roomId: r.room_id,
              userId: r.user_id,
              authorHandle: handleFromProfile(profile),
              authorName: nameFromProfile(profile, "Trader"),
              authorColor: profile?.avatar_color ?? paletteFor(r.user_id)[0],
              body: r.body ?? "",
              type: messageType(r.message_type),
              createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
              likes: r.likes_count ?? 0,
              pinned: !!r.pinned,
            };
          });
        } catch (e) {
          console.log("[social] space messages failed", e);
          return [];
        }
      },
      staleTime: 5_000,
      refetchInterval: 8_000,
    });

  const getCommunity = useCallback(
    (id: string) => communities.find((c) => c.id === id || c.handle === id),
    [communities],
  );
  const getSpace = useCallback((id: string) => spaces.find((s) => s.id === id), [spaces]);

  const loadViewerInteractions = useCallback(
    async (postIds: string[]) => {
      const empty = {
        liked: new Set<string>(),
        reposted: new Set<string>(),
        bookmarked: new Set<string>(),
        reported: new Set<string>(),
      };
      if (!isAuthenticated || !userId || postIds.length === 0) return empty;
      const [likesRes, repostsRes, bookmarksRes, reportsRes] = await Promise.all([
        supabase.from("community_post_likes").select("post_id").eq("user_id", userId).in("post_id", postIds),
        supabase.from("community_post_reposts").select("post_id").eq("user_id", userId).in("post_id", postIds),
        supabase.from("post_bookmarks").select("post_id").eq("user_id", userId).in("post_id", postIds),
        supabase.from("post_reports").select("post_id").eq("reporter_id", userId).in("post_id", postIds),
      ]);
      if (likesRes.error) console.log("[social] viewer likes enrich failed", likesRes.error.message);
      if (repostsRes.error) console.log("[social] viewer reposts enrich failed", repostsRes.error.message);
      if (bookmarksRes.error) console.log("[social] viewer bookmarks enrich failed", bookmarksRes.error.message);
      if (reportsRes.error) console.log("[social] viewer reports enrich failed", reportsRes.error.message);
      return {
        liked: new Set((likesRes.data ?? []).map((r) => String(r.post_id))),
        reposted: new Set((repostsRes.data ?? []).map((r) => String(r.post_id))),
        bookmarked: new Set((bookmarksRes.data ?? []).map((r) => String(r.post_id))),
        reported: new Set((reportsRes.data ?? []).map((r) => String(r.post_id))),
      };
    },
    [isAuthenticated, userId],
  );

  // Posts for a single community — fetch on demand, cached per id.
  const postsByCommunityQuery = useCallback(
    async (id: string): Promise<CommunityPost[]> => {
      try {
        const { data, error } = await supabase.rpc("list_community_posts", {
          target_community_id: id,
          max_rows: 100,
        });
        if (error) throw error;
        const rows = (data ?? []) as Record<string, unknown>[];
        const postIds = rows.map((r) => String(r.id)).filter(Boolean);
        let imageByPost = new Map<string, string | null>();
        if (postIds.length > 0) {
          const { data: mediaRows, error: mediaError } = await supabase
            .from("community_posts")
            .select("id,image_url")
            .in("id", postIds);
          if (mediaError) console.log("[social] post image enrich failed", mediaError.message);
          imageByPost = new Map(
            (mediaRows ?? []).map((r) => [String(r.id), normalizeMediaUrl(r.image_url)]),
          );
        }
        return rows.map((r): CommunityPost => {
          const post = communityPostFromRow(r, id);
          return {
            ...post,
            imageUrl: post.imageUrl ?? imageByPost.get(post.id) ?? null,
          };
        });
      } catch (e) {
        console.log("[social] postsByCommunity RPC failed, trying direct", e);
        try {
          const { data: directRows, error: directError } = await supabase
            .from("community_posts")
            .select(COMMUNITY_POST_SELECT)
            .eq("community_id", id)
            .is("parent_post_id", null)
            .order("created_at", { ascending: false })
            .limit(100);
          if (directError) throw directError;
          const rows = (directRows ?? []) as Record<string, unknown>[];
          const authorIds = Array.from(
            new Set(rows.map((r) => r.user_id).filter((v): v is string => typeof v === "string" && v.length > 0)),
          );
          let authorMap = new Map<string, Record<string, unknown>>();
          if (authorIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabase
              .from("profiles")
              .select("id,user_id,username,display_name,avatar_color")
              .or(`id.in.(${authorIds.join(",")}),user_id.in.(${authorIds.join(",")})`);
            if (profilesError) console.log("[social] post author enrich failed", profilesError.message);
            authorMap = new Map(
              (profiles ?? []).flatMap((p) => [
                [String(p.id), p as Record<string, unknown>],
                [String(p.user_id), p as Record<string, unknown>],
              ]),
            );
          }
          const interactions = await loadViewerInteractions(rows.map((r) => String(r.id)));
          return rows.map((r): CommunityPost => {
            const postId = String(r.id);
            const author = authorMap.get(String(r.user_id)) ?? {};
            const username = (author.username as string | null) ?? "";
            const display = ((author.display_name as string | null) ?? username) || "User";
            return {
              id: postId,
              communityId: (r.community_id as string) ?? id,
              authorUserId: (r.user_id as string | null) ?? null,
              authorHandle: username ? `@${username}` : "",
              authorName: display,
              authorColor: (author.avatar_color as string | null) ?? Colors.mint,
              content: (r.content as string) ?? "",
              imageUrl: normalizeMediaUrl(r.image_url),
              ticker: (r.ticker as string) ?? undefined,
              changePct: r.change_pct != null ? Number(r.change_pct) : undefined,
              token: tokenFromRow(r),
              createdAt: r.created_at ? new Date(r.created_at as string).getTime() : Date.now(),
              likes: Number(r.likes_count ?? 0),
              comments: Number(r.comments_count ?? 0),
              reposts: Number(r.reposts_count ?? 0),
              liked: interactions.liked.has(postId),
              reposted: interactions.reposted.has(postId),
              bookmarked: interactions.bookmarked.has(postId),
              reported: interactions.reported.has(postId),
              parentPostId: (r.parent_post_id as string | null) ?? null,
              quotePostId: (r.quote_post_id as string | null) ?? null,
              quote: null,
              replyTo: null,
            };
          });
        } catch (fallbackError) {
          console.log("[social] postsByCommunity direct failed", fallbackError);
          return [];
        }
      }
    },
    [loadViewerInteractions],
  );

  const usePostsForCommunity = (id: string | undefined) =>
    useQuery<CommunityPost[]>({
      queryKey: ["social", "community-posts", id ?? ""],
      queryFn: async () => (id ? postsByCommunityQuery(id) : []),
      enabled: !!id,
      staleTime: 15_000,
    });

  // Synchronous accessor used by existing screens — returns cached array or []
  const postsByCommunity = useCallback(
    (id: string): CommunityPost[] => {
      const cached = qc.getQueryData<CommunityPost[]>(["social", "community-posts", id]);
      if (!cached) {
        // kick off fetch the first time
        qc.prefetchQuery({
          queryKey: ["social", "community-posts", id],
          queryFn: () => postsByCommunityQuery(id),
          staleTime: 15_000,
        });
      }
      return (cached ?? []).slice().sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.createdAt - a.createdAt;
      });
    },
    [qc, postsByCommunityQuery],
  );

  const patchCachedPost = useCallback(
    (id: string, update: (post: CommunityPost) => CommunityPost) => {
      const all = qc.getQueriesData<CommunityPost[]>({ queryKey: ["social"] });
      for (const [key, list] of all) {
        if (!list || !Array.isArray(list)) continue;
        let changed = false;
        const next = list.map((p) => {
          if (p.id !== id) return p;
          changed = true;
          return update(p);
        });
        if (changed) qc.setQueryData(key, next);
      }
    },
    [qc],
  );

  const listPostRepliesQuery = useCallback(
    async (postId: string): Promise<CommunityPost[]> => {
      try {
        const { data, error } = await supabase.rpc("list_post_replies", {
          target_post_id: postId,
          max_rows: 100,
        });
        if (error) throw error;
        return ((data ?? []) as PostRowRecord[]).map((r) =>
          communityPostFromRow(r, (r.community_id as string | null) ?? ""),
        );
      } catch (e) {
        console.log("[social] listPostReplies RPC failed, trying direct", e);
        try {
          const { data: directRows, error: directError } = await supabase
            .from("community_posts")
            .select(COMMUNITY_POST_SELECT)
            .eq("parent_post_id", postId)
            .order("created_at", { ascending: true })
            .limit(100);
          if (directError) throw directError;
          const rows = (directRows ?? []) as PostRowRecord[];
          const authorIds = Array.from(
            new Set(rows.map((r) => r.user_id).filter((v): v is string => typeof v === "string" && v.length > 0)),
          );
          let authorMap = new Map<string, Record<string, unknown>>();
          if (authorIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabase
              .from("profiles")
              .select("id,user_id,username,display_name,avatar_color")
              .or(`id.in.(${authorIds.join(",")}),user_id.in.(${authorIds.join(",")})`);
            if (profilesError) console.log("[social] reply author enrich failed", profilesError.message);
            authorMap = new Map(
              (profiles ?? []).flatMap((p) => [
                [String(p.id), p as Record<string, unknown>],
                [String(p.user_id), p as Record<string, unknown>],
              ]),
            );
          }
          const interactions = await loadViewerInteractions(rows.map((r) => String(r.id)));
          return rows.map((r): CommunityPost => {
            const postId = String(r.id);
            const author = authorMap.get(String(r.user_id)) ?? {};
            return communityPostFromRow(
              {
                ...r,
                username: author.username,
                display_name: author.display_name,
                avatar_color: author.avatar_color,
                liked: interactions.liked.has(postId),
                reposted: interactions.reposted.has(postId),
                bookmarked: interactions.bookmarked.has(postId),
                reported: interactions.reported.has(postId),
              },
              (r.community_id as string | null) ?? "",
            );
          });
        } catch (fallbackError) {
          console.log("[social] listPostReplies direct failed", fallbackError);
          return [];
        }
      }
    },
    [loadViewerInteractions],
  );

  const usePostReplies = (postId: string | undefined) =>
    useQuery<CommunityPost[]>({
      queryKey: ["social", "post-replies", postId ?? ""],
      queryFn: async () => (postId ? listPostRepliesQuery(postId) : []),
      enabled: !!postId,
      staleTime: 10_000,
    });

  const addCommunityPost = useCallback(
    async (input: {
      communityId: string;
      content: string;
      authorHandle: string;
      authorName: string;
      authorColor: string;
      ticker?: string;
      imageUri?: string | null;
      imageBase64?: string | null;
      token?: CommunityTokenCard | null;
    }): Promise<CommunityPost> => {
      if (!isAuthenticated || !userId) {
        throw new Error("Sign in to post in communities.");
      }
      const text = input.content.trim();
      if (!text && !input.imageUri) throw new Error("Post cannot be empty.");

      const optimisticPost: CommunityPost = {
        id: `local-${Date.now()}`,
        communityId: input.communityId,
        authorUserId: userId,
        authorHandle: input.authorHandle,
        authorName: input.authorName,
        authorColor: input.authorColor,
        content: text,
        ticker: input.ticker ?? input.token?.symbol,
        token: input.token ?? null,
        createdAt: Date.now(),
        likes: 0,
        comments: 0,
        reposts: 0,
        liked: false,
        reposted: false,
        bookmarked: false,
        reported: false,
        imageUrl: input.imageUri ?? null,
        quote: null,
        replyTo: null,
      };

      qc.setQueryData<CommunityPost[]>(
        ["social", "community-posts", input.communityId],
        (prev) => [optimisticPost, ...(prev ?? [])],
      );
      qc.setQueriesData<Community[]>({ queryKey: ["social", "communities"] }, (prev) =>
        prev?.map((c) => (c.id === input.communityId ? { ...c, posts: c.posts + 1 } : c)),
      );

      try {
        let uploadedUrl: string | null = null;
        if (input.imageUri) {
          uploadedUrl = await uploadPostImage(userId, input.imageUri, input.imageBase64 ?? null);
        }
        const { data, error } = await supabase
          .from("community_posts")
          .insert({
            user_id: userId,
            community_id: input.communityId,
            content: text,
            image_url: uploadedUrl,
            ticker: input.ticker ?? input.token?.symbol ?? null,
            change_pct: input.token?.change24h ?? null,
            ...tokenInsertFields(input.token),
          })
          .select(COMMUNITY_POST_SELECT)
          .single();
        if (error) throw error;
        const post: CommunityPost = {
          id: String(data.id),
          communityId: (data.community_id as string | null) ?? input.communityId,
          authorUserId: (data.user_id as string | null) ?? userId,
          authorHandle: input.authorHandle,
          authorName: input.authorName,
          authorColor: input.authorColor,
          content: (data.content as string | null) ?? text,
          imageUrl: normalizeMediaUrl(data.image_url) ?? uploadedUrl,
          ticker: (data.ticker as string | null) ?? input.ticker ?? input.token?.symbol,
          changePct: data.change_pct != null ? Number(data.change_pct) : input.token?.change24h ?? undefined,
          token: tokenFromRow(data as PostRowRecord) ?? input.token ?? null,
          createdAt: data.created_at
            ? new Date(data.created_at as string).getTime()
            : optimisticPost.createdAt,
          likes: Number(data.likes_count ?? 0),
          comments: Number(data.comments_count ?? 0),
          reposts: Number(data.reposts_count ?? 0),
          liked: false,
          reposted: false,
          bookmarked: false,
          reported: false,
          parentPostId: (data.parent_post_id as string | null) ?? null,
          quotePostId: (data.quote_post_id as string | null) ?? null,
          quote: null,
          replyTo: null,
        };
        qc.setQueryData<CommunityPost[]>(
          ["social", "community-posts", input.communityId],
          (prev) => (prev ?? []).map((p) => (p.id === optimisticPost.id ? post : p)),
        );
        qc.invalidateQueries({ queryKey: ["social", "communities"] });
        return post;
      } catch (e) {
        qc.setQueryData<CommunityPost[]>(["social", "community-posts", input.communityId], (prev) =>
          (prev ?? []).filter((p) => p.id !== optimisticPost.id),
        );
        qc.setQueriesData<Community[]>({ queryKey: ["social", "communities"] }, (prev) =>
          prev?.map((c) =>
            c.id === input.communityId ? { ...c, posts: Math.max(0, c.posts - 1) } : c,
          ),
        );
        console.log("[social] addCommunityPost failed", e);
        throw e instanceof Error ? e : new Error("Could not post to this community.");
      }
    },
    [isAuthenticated, userId, qc],
  );

  const togglePostLike = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !userId) {
        throw new Error("Sign in to like posts.");
      }
      patchCachedPost(id, (p) => ({
        ...p,
        liked: !p.liked,
        likes: Math.max(0, p.likes + (p.liked ? -1 : 1)),
      }));
      try {
        const { data, error } = await supabase.rpc("toggle_post_like", { target_post_id: id });
        if (error) throw error;
        const row = Array.isArray(data)
          ? (data[0] as { liked: boolean; likes_count: number } | undefined)
          : undefined;
        if (row) {
          patchCachedPost(id, (p) => ({
            ...p,
            liked: !!row.liked,
            likes: Number(row.likes_count ?? p.likes),
          }));
        }
      } catch (e) {
        patchCachedPost(id, (p) => ({
          ...p,
          liked: !p.liked,
          likes: Math.max(0, p.likes + (p.liked ? -1 : 1)),
        }));
        console.log("[social] togglePostLike failed", e);
        throw e instanceof Error ? e : new Error("Could not update like.");
      }
    },
    [isAuthenticated, patchCachedPost, userId],
  );

  const togglePostRepost = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to repost.");
      patchCachedPost(id, (p) => ({
        ...p,
        reposted: !p.reposted,
        reposts: Math.max(0, p.reposts + (p.reposted ? -1 : 1)),
      }));
      try {
        const { data, error } = await supabase.rpc("toggle_post_repost", { target_post_id: id });
        if (error) throw error;
        const row = Array.isArray(data)
          ? (data[0] as { reposted: boolean; reposts_count: number } | undefined)
          : undefined;
        if (row) {
          patchCachedPost(id, (p) => ({
            ...p,
            reposted: !!row.reposted,
            reposts: Number(row.reposts_count ?? p.reposts),
          }));
        }
      } catch (e) {
        patchCachedPost(id, (p) => ({
          ...p,
          reposted: !p.reposted,
          reposts: Math.max(0, p.reposts + (p.reposted ? -1 : 1)),
        }));
        console.log("[social] togglePostRepost failed", e);
        throw e instanceof Error ? e : new Error("Could not repost.");
      }
    },
    [isAuthenticated, patchCachedPost, userId],
  );

  const togglePostBookmark = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to bookmark posts.");
      patchCachedPost(id, (p) => ({ ...p, bookmarked: !p.bookmarked }));
      try {
        const { data, error } = await supabase.rpc("toggle_post_bookmark", { target_post_id: id });
        if (error) throw error;
        const row = Array.isArray(data) ? (data[0] as { bookmarked: boolean } | undefined) : undefined;
        if (row) patchCachedPost(id, (p) => ({ ...p, bookmarked: !!row.bookmarked }));
      } catch (e) {
        patchCachedPost(id, (p) => ({ ...p, bookmarked: !p.bookmarked }));
        console.log("[social] togglePostBookmark failed", e);
        throw e instanceof Error ? e : new Error("Could not bookmark post.");
      }
    },
    [isAuthenticated, patchCachedPost, userId],
  );

  const addPostReply = useCallback(
    async (input: {
      post: CommunityPost;
      content: string;
      authorHandle: string;
      authorName: string;
      authorColor: string;
    }): Promise<CommunityPost> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to reply.");
      const text = input.content.trim();
      if (!text) throw new Error("Reply cannot be empty.");
      const optimistic: CommunityPost = {
        id: `local-reply-${Date.now()}`,
        communityId: input.post.communityId,
        authorUserId: userId,
        authorHandle: input.authorHandle,
        authorName: input.authorName,
        authorColor: input.authorColor,
        content: text,
        createdAt: Date.now(),
        likes: 0,
        comments: 0,
        reposts: 0,
        liked: false,
        reposted: false,
        bookmarked: false,
        parentPostId: input.post.id,
        quotePostId: null,
        quote: null,
        replyTo: {
          id: input.post.id,
          authorHandle: input.post.authorHandle,
          authorName: input.post.authorName,
          content: input.post.content,
        },
      };
      qc.setQueryData<CommunityPost[]>(["social", "post-replies", input.post.id], (prev) => [
        ...(prev ?? []),
        optimistic,
      ]);
      patchCachedPost(input.post.id, (p) => ({ ...p, comments: p.comments + 1 }));
      try {
        const { data, error } = await supabase.rpc("create_post_reply", {
          target_post_id: input.post.id,
          p_content: text,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
        const reply: CommunityPost = {
          ...optimistic,
          id: String(row?.id ?? optimistic.id),
          createdAt: row?.created_at ? new Date(row.created_at as string).getTime() : optimistic.createdAt,
          parentPostId: (row?.parent_post_id as string | null) ?? input.post.id,
        };
        qc.setQueryData<CommunityPost[]>(["social", "post-replies", input.post.id], (prev) =>
          (prev ?? []).map((p) => (p.id === optimistic.id ? reply : p)),
        );
        if (row?.comments_count != null) {
          patchCachedPost(input.post.id, (p) => ({ ...p, comments: Number(row.comments_count ?? p.comments) }));
        }
        qc.invalidateQueries({ queryKey: ["social", "community-posts", input.post.communityId] });
        return reply;
      } catch (e) {
        qc.setQueryData<CommunityPost[]>(["social", "post-replies", input.post.id], (prev) =>
          (prev ?? []).filter((p) => p.id !== optimistic.id),
        );
        patchCachedPost(input.post.id, (p) => ({ ...p, comments: Math.max(0, p.comments - 1) }));
        console.log("[social] addPostReply failed", e);
        throw e instanceof Error ? e : new Error("Could not send reply.");
      }
    },
    [isAuthenticated, patchCachedPost, qc, userId],
  );

  const quotePost = useCallback(
    async (input: {
      post: CommunityPost;
      content: string;
      authorHandle: string;
      authorName: string;
      authorColor: string;
    }): Promise<CommunityPost> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to quote posts.");
      const text = input.content.trim();
      if (!text) throw new Error("Quote cannot be empty.");
      const optimistic: CommunityPost = {
        id: `local-quote-${Date.now()}`,
        communityId: input.post.communityId,
        authorUserId: userId,
        authorHandle: input.authorHandle,
        authorName: input.authorName,
        authorColor: input.authorColor,
        content: text,
        createdAt: Date.now(),
        likes: 0,
        comments: 0,
        reposts: 0,
        liked: false,
        reposted: false,
        bookmarked: false,
        parentPostId: null,
        quotePostId: input.post.id,
        quote: {
          id: input.post.id,
          authorHandle: input.post.authorHandle,
          authorName: input.post.authorName,
          content: input.post.content,
          imageUrl: input.post.imageUrl,
          ticker: input.post.ticker,
          createdAt: input.post.createdAt,
          token: input.post.token ?? null,
        },
        replyTo: null,
      };
      qc.setQueryData<CommunityPost[]>(["social", "community-posts", input.post.communityId], (prev) => [
        optimistic,
        ...(prev ?? []),
      ]);
      patchCachedPost(input.post.id, (p) => ({ ...p, reposts: p.reposts + 1 }));
      try {
        const { data, error } = await supabase.rpc("quote_community_post", {
          target_post_id: input.post.id,
          p_content: text,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
        const quote: CommunityPost = {
          ...optimistic,
          id: String(row?.id ?? optimistic.id),
          createdAt: row?.created_at ? new Date(row.created_at as string).getTime() : optimistic.createdAt,
          quotePostId: (row?.quote_post_id as string | null) ?? input.post.id,
        };
        qc.setQueryData<CommunityPost[]>(["social", "community-posts", input.post.communityId], (prev) =>
          (prev ?? []).map((p) => (p.id === optimistic.id ? quote : p)),
        );
        if (row?.reposts_count != null) {
          patchCachedPost(input.post.id, (p) => ({ ...p, reposts: Number(row.reposts_count ?? p.reposts) }));
        }
        qc.invalidateQueries({ queryKey: ["social", "communities"] });
        return quote;
      } catch (e) {
        qc.setQueryData<CommunityPost[]>(["social", "community-posts", input.post.communityId], (prev) =>
          (prev ?? []).filter((p) => p.id !== optimistic.id),
        );
        patchCachedPost(input.post.id, (p) => ({ ...p, reposts: Math.max(0, p.reposts - 1) }));
        console.log("[social] quotePost failed", e);
        throw e instanceof Error ? e : new Error("Could not quote post.");
      }
    },
    [isAuthenticated, patchCachedPost, qc, userId],
  );

  const reportCommunityPost = useCallback(
    async (post: CommunityPost, reason = "reported from app"): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to report posts.");
      if (post.reported) throw new Error("You already reported this post.");
      patchCachedPost(post.id, (p) => ({ ...p, reported: true }));
      try {
        const { error } = await supabase.rpc("report_community_post", {
          target_post_id: post.id,
          p_reason: reason,
        });
        if (error) throw error;
      } catch (e) {
        patchCachedPost(post.id, (p) => ({ ...p, reported: false }));
        console.log("[social] reportCommunityPost failed", e);
        throw e instanceof Error ? e : new Error("Could not report post.");
      }
    },
    [isAuthenticated, patchCachedPost, userId],
  );

  const toggleCommunityPostPin = useCallback(
    async (post: CommunityPost): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to pin posts.");
      if (!canModeratePosts) throw new Error("Only moderators can pin posts.");
      patchCachedPost(post.id, (p) => ({ ...p, pinned: !p.pinned }));
      try {
        const { data, error } = await supabase.rpc("toggle_community_post_pin", {
          target_post_id: post.id,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? (data[0] as { pinned: boolean } | undefined) : undefined;
        if (row) patchCachedPost(post.id, (p) => ({ ...p, pinned: !!row.pinned }));
        qc.invalidateQueries({ queryKey: ["social", "community-posts", post.communityId] });
      } catch (e) {
        patchCachedPost(post.id, (p) => ({ ...p, pinned: !p.pinned }));
        console.log("[social] toggleCommunityPostPin failed", e);
        throw e instanceof Error ? e : new Error("Could not pin post.");
      }
    },
    [canModeratePosts, isAuthenticated, patchCachedPost, qc, userId],
  );

  const deleteCommunityPost = useCallback(
    async (post: CommunityPost): Promise<void> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to delete posts.");
      const ownsPost = post.authorUserId === userId;
      if (!ownsPost && !canModeratePosts) throw new Error("You can only delete your own posts.");

      const postSnapshots = qc.getQueriesData<CommunityPost[]>({ queryKey: ["social", "community-posts"] });
      const replySnapshots = qc.getQueriesData<CommunityPost[]>({ queryKey: ["social", "post-replies"] });
      const snapshots = [...postSnapshots, ...replySnapshots];

      for (const [key, list] of snapshots) {
        if (!list || !Array.isArray(list)) continue;
        qc.setQueryData(
          key,
          list.filter((p) => p.id !== post.id && p.parentPostId !== post.id),
        );
      }

      if (!post.parentPostId) {
        qc.setQueriesData<Community[]>({ queryKey: ["social", "communities"] }, (prev) =>
          prev?.map((c) =>
            c.id === post.communityId ? { ...c, posts: Math.max(0, c.posts - 1) } : c,
          ),
        );
      }
      if (post.parentPostId) {
        patchCachedPost(post.parentPostId, (p) => ({
          ...p,
          comments: Math.max(0, p.comments - 1),
        }));
      }
      if (post.quotePostId) {
        patchCachedPost(post.quotePostId, (p) => ({
          ...p,
          reposts: Math.max(0, p.reposts - 1),
        }));
      }

      try {
        const rpcRes = await supabase.rpc("delete_community_post", {
          target_post_id: post.id,
        });
        if (rpcRes.error) {
          const msg = rpcRes.error.message ?? "";
          const missingRpc = /could not find the function|function .* does not exist|schema cache/i.test(msg);
          if (!missingRpc) throw rpcRes.error;
          const ownsPostFallback = post.authorUserId === userId;
          if (!ownsPostFallback) {
            throw new Error("You can only delete your own posts.");
          }
          const { error: delErr, data: delData } = await supabase
            .from("community_posts")
            .delete()
            .eq("id", post.id)
            .eq("user_id", userId)
            .select("id");
          if (delErr) throw delErr;
          if (!delData || delData.length === 0) {
            throw new Error("Post not found or you do not have permission to delete it.");
          }
        }
        qc.invalidateQueries({ queryKey: ["social", "community-posts", post.communityId] });
        if (post.parentPostId) {
          qc.invalidateQueries({ queryKey: ["social", "post-replies", post.parentPostId] });
        }
        qc.invalidateQueries({ queryKey: ["social", "communities"] });
      } catch (e) {
        for (const [key, list] of snapshots) {
          qc.setQueryData(key, list);
        }
        qc.invalidateQueries({ queryKey: ["social", "communities"] });
        console.log("[social] deleteCommunityPost failed", e);
        throw e instanceof Error ? e : new Error("Could not delete post.");
      }
    },
    [canModeratePosts, isAuthenticated, patchCachedPost, qc, userId],
  );

  const createCommunity = useCallback(
    async (input: {
      name: string;
      handle: string;
      description: string;
      category: Community["category"];
      iconEmoji: string;
      accent: [string, string];
      tags: string[];
      rules: string[];
      isPrivate?: boolean;
      holderOnly?: boolean;
      gateTokenMint?: string | null;
      gateMinimumBalance?: number | null;
      ownerHandle?: string;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
    }): Promise<Community> => {
      const slug = input.handle.replace(/^@/, "").toLowerCase();
      const id = `local-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      const community: Community = {
        id,
        name: input.name.trim(),
        handle: slug,
        description: input.description.trim(),
        category: input.category,
        members: 1,
        posts: 0,
        online: 1,
        verified: false,
        trending: false,
        accent: input.accent,
        iconEmoji: input.iconEmoji,
        bannerSeed: slug || id,
        ownerHandle: input.ownerHandle ?? "",
        ownerId: userId ?? undefined,
        createdAt: Date.now(),
        rules: input.rules.filter((r) => r.trim().length > 0),
        tags: input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
        avatarUrl: normalizeMediaUrl(input.avatarUrl),
        bannerUrl: normalizeMediaUrl(input.bannerUrl),
        isPrivate: !!input.isPrivate || !!input.holderOnly,
        holderOnly: !!input.holderOnly,
        gateTokenMint: input.gateTokenMint ?? null,
        gateMinimumBalance: input.gateMinimumBalance ?? null,
      };

      let persistedRemotely = false;

      if (isAuthenticated && userId) {
        try {
          const { data, error } = await supabase.rpc("create_community", {
            p_name: community.name,
            p_slug: community.handle,
            p_description: community.description,
            p_category: community.category,
            p_icon_emoji: community.iconEmoji,
            p_accent_a: community.accent[0],
            p_accent_b: community.accent[1],
            p_rules: community.rules,
            p_tags: community.tags,
            p_is_private: !!input.isPrivate || !!input.holderOnly,
            p_holder_only: !!input.holderOnly,
            p_gate_token_mint: input.gateTokenMint ?? null,
            p_gate_minimum_balance: input.gateMinimumBalance ?? null,
            p_avatar_url: normalizeMediaUrl(community.avatarUrl),
            p_banner_url: normalizeMediaUrl(community.bannerUrl),
          });
          if (error) throw error;
          const row = Array.isArray(data)
            ? ((data[0] ?? null) as PersistedCommunityRow | null)
            : ((data ?? null) as PersistedCommunityRow | null);
          if (!row?.id) throw new Error("create_community returned no id");
          applyPersistedCommunityRow(community, row);
          persistedRemotely = true;
        } catch (e) {
          console.log("[social] create_community RPC failed, falling back", e);
          try {
            const { data: inserted, error: insertError } = await supabase
              .from("communities")
              .insert({
                name: community.name,
                slug: community.handle,
                description: community.description,
                owner_id: userId,
                category: community.category,
                icon_emoji: community.iconEmoji,
                accent_a: community.accent[0],
                accent_b: community.accent[1],
                rules: community.rules,
                tags: community.tags,
                is_private: !!input.isPrivate || !!input.holderOnly,
                holder_only: !!input.holderOnly,
                gate_token_mint: input.gateTokenMint ?? null,
                gate_minimum_balance: input.gateMinimumBalance ?? null,
                avatar_url: normalizeMediaUrl(community.avatarUrl),
                banner_url: normalizeMediaUrl(community.bannerUrl),
              })
              .select(
                "id,name,slug,description,owner_id,member_count,posts_count,online_count,category,icon_emoji,accent_a,accent_b,verified,trending,pinned_ticker,rules,tags,is_private,holder_only,gate_token_mint,gate_minimum_balance,avatar_url,banner_url,created_at",
              )
              .single();
            if (insertError) throw insertError;
            if (!inserted?.id) throw new Error("communities insert returned no id");
            applyPersistedCommunityRow(community, inserted as PersistedCommunityRow);
            const { error: memberError } = await supabase
              .from("community_members")
              .insert({ community_id: community.id, user_id: userId, role: "owner" });
            if (memberError) console.log("[social] owner auto-join failed", memberError.message);
            persistedRemotely = true;
          } catch (e2) {
            console.log("[social] createCommunity fallback insert failed", e2);
            throw e2;
          }
        }
      }

      if (persistedRemotely) {
        const nextLocal = localCommunities.filter(
          (c) => c.id !== community.id && c.handle !== community.handle,
        );
        if (nextLocal.length !== localCommunities.length) {
          setLocalCommunities(nextLocal);
          await saveJson(localKey, nextLocal);
        }
        qc.setQueryData<Community[]>(["social", "communities", userId ?? "guest"], (prev) => {
          const existing = prev ?? [];
          const without = existing.filter(
            (c) => c.id !== community.id && c.handle !== community.handle,
          );
          return [community, ...without];
        });
      } else {
        const next = [community, ...localCommunities];
        setLocalCommunities(next);
        await saveJson(localKey, next);
      }

      const nextJoined = joined.includes(community.id) ? joined : [community.id, ...joined];
      qc.setQueryData(["social", "memberships", userId ?? "guest"], nextJoined);
      if (!isAuthenticated) {
        const gj = guestJoined.includes(community.id)
          ? guestJoined
          : [community.id, ...guestJoined];
        setGuestJoined(gj);
        await saveJson(KEY_JOINED_GUEST, gj);
      }

      qc.invalidateQueries({ queryKey: ["social", "communities"] });
      return community;
    },
    [isAuthenticated, userId, localCommunities, joined, guestJoined, qc, localKey],
  );

  const joinedCommunities = useMemo(
    () => communities.filter((c) => joined.includes(c.id)),
    [communities, joined],
  );

  const updateCommunityMedia = useCallback(
    async (communityId: string, patch: { avatarUrl?: string | null; bannerUrl?: string | null }) => {
      try {
        const update: Record<string, string | null> = {};
        if (patch.avatarUrl !== undefined) update.avatar_url = normalizeMediaUrl(patch.avatarUrl);
        if (patch.bannerUrl !== undefined) update.banner_url = normalizeMediaUrl(patch.bannerUrl);
        if (Object.keys(update).length === 0) return;
        if (isAuthenticated && userId && !communityId.startsWith("local-")) {
          const { error } = await supabase
            .from("communities")
            .update(update)
            .eq("id", communityId);
          if (error) throw error;
        }
        const applyPatch = (c: Community): Community =>
          c.id === communityId
            ? {
                ...c,
                avatarUrl: patch.avatarUrl !== undefined ? normalizeMediaUrl(patch.avatarUrl) : c.avatarUrl,
                bannerUrl: patch.bannerUrl !== undefined ? normalizeMediaUrl(patch.bannerUrl) : c.bannerUrl,
              }
            : c;
        const next = localCommunities.map(applyPatch);
        setLocalCommunities(next);
        await saveJson(localKey, next);
        qc.setQueriesData<Community[]>({ queryKey: ["social", "communities"] }, (prev) =>
          prev ? prev.map(applyPatch) : prev,
        );
        qc.invalidateQueries({ queryKey: ["social", "communities"] });
      } catch (e) {
        console.log("[social] updateCommunityMedia failed", e);
        throw e;
      }
    },
    [isAuthenticated, userId, localCommunities, qc, localKey],
  );

  const trendingCommunities = useMemo(
    () =>
      communities
        .filter((c) => c.trending)
        .sort((a, b) => b.online - a.online || b.members - a.members),
    [communities],
  );

  const liveSpaces = useMemo(() => spaces.filter((s) => s.isLive), [spaces]);
  const upcomingSpaces = useMemo(
    () =>
      spaces
        .filter((s) => !s.isLive)
        .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0)),
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
      createCommunity,
      updateCommunityMedia,
      postsByCommunity,
      usePostsForCommunity,
      usePostReplies,
      addCommunityPost,
      addPostReply,
      quotePost,
      deleteCommunityPost,
      reportCommunityPost,
      toggleCommunityPostPin,
      togglePostLike,
      togglePostRepost,
      togglePostBookmark,
      spaces,
      liveSpaces,
      upcomingSpaces,
      isFollowingSpace: isFollowing,
      toggleFollowSpace,
      getSpace,
      createSpace,
      startSpace,
      joinSpace,
      leaveSpace,
      setSpaceMute,
      setSpaceHand,
      setSpaceParticipantRole,
      removeSpaceParticipant,
      forceMuteParticipant,
      muteAllInSpace,
      lowerSpaceHand,
      heartbeatSpace,
      sendSpaceMessage,
      addSpaceReaction,
      endSpace,
      updateSpaceBanner,
      setSpacePin,
      setSpacePoll,
      voteSpacePoll,
      likeSpaceMessage,
      pinSpaceMessage,
      useSpaceParticipants,
      useSpaceMessages,
      useMyLikedMessages,
      isLoading: communitiesQ.isLoading || spacesQ.isLoading,
    }),
    [
      communities,
      joinedCommunities,
      trendingCommunities,
      isJoined,
      toggleJoin,
      getCommunity,
      createCommunity,
      updateCommunityMedia,
      postsByCommunity,
      usePostsForCommunity,
      usePostReplies,
      addCommunityPost,
      addPostReply,
      quotePost,
      deleteCommunityPost,
      reportCommunityPost,
      toggleCommunityPostPin,
      togglePostLike,
      togglePostRepost,
      togglePostBookmark,
      spaces,
      liveSpaces,
      upcomingSpaces,
      isFollowing,
      toggleFollowSpace,
      getSpace,
      createSpace,
      startSpace,
      joinSpace,
      leaveSpace,
      setSpaceMute,
      setSpaceHand,
      setSpaceParticipantRole,
      removeSpaceParticipant,
      forceMuteParticipant,
      muteAllInSpace,
      lowerSpaceHand,
      heartbeatSpace,
      sendSpaceMessage,
      addSpaceReaction,
      endSpace,
      updateSpaceBanner,
      setSpacePin,
      setSpacePoll,
      voteSpacePoll,
      likeSpaceMessage,
      pinSpaceMessage,
      useSpaceParticipants,
      useSpaceMessages,
      communitiesQ.isLoading,
      spacesQ.isLoading,
    ],
  );
});
