import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import Colors from "@/constants/colors";
import { normalizeMediaUrl } from "@/lib/media";
import { supabase } from "@/lib/supabase";
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
}

export interface CommunityPost {
  id: string;
  communityId: string;
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
  };
}

type SpaceRow = {
  id: string;
  name: string;
  topic: string | null;
  description: string | null;
  host_id: string | null;
  community_id: string | null;
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
  const isLive = !!row.is_active && !!row.started_at && !row.ended_at;
  return {
    id: row.id,
    title: row.name,
    topic: (row.topic ?? "GENERAL").toUpperCase(),
    description: row.description ?? "",
    hostHandle,
    hostName,
    coHosts: [],
    speakers: row.speakers_count ?? 0,
    listeners: row.listeners_count ?? 0,
    isLive,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).getTime() : undefined,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : undefined,
    category,
    accent,
    recording: !!row.recording,
    raisedHands: row.raised_hands ?? 0,
  };
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
            "id,name,slug,description,owner_id,member_count,posts_count,online_count,category,icon_emoji,accent_a,accent_b,verified,trending,pinned_ticker,rules,tags,is_private,avatar_url,banner_url,created_at",
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
        return rows.map((r) =>
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
        return rows.map((r) =>
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
            "id,name,topic,description,host_id,community_id,is_active,started_at,ended_at,scheduled_at,category,accent_a,accent_b,recording,raised_hands,listeners_count,speakers_count,created_at",
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
            .select("id,username,display_name")
            .in("id", hostIds);
          hostMap = new Map(
            (profs ?? []).map((p) => [
              p.id as string,
              {
                handle: p.username ? `@${p.username as string}` : "",
                name:
                  ((p.display_name as string | null) ?? (p.username as string | null) ?? "") || "Host",
              },
            ]),
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
  });

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
      const next = prev.includes(id) ? prev.filter((j) => j !== id) : [id, ...prev];
      qc.setQueryData(["social", "memberships", userId ?? "guest"], next);
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      const prev = (ctx as { prev?: string[] } | undefined)?.prev;
      if (prev) qc.setQueryData(["social", "memberships", userId ?? "guest"], prev);
    },
    onSuccess: (next) => {
      qc.setQueryData(["social", "memberships", userId ?? "guest"], next);
      qc.invalidateQueries({ queryKey: ["social", "communities"] });
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
  const getSpace = useCallback((id: string) => spaces.find((s) => s.id === id), [spaces]);

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
          const postId = String(r.id);
          const username = (r.username as string | null) ?? "";
          const display =
            ((r.display_name as string | null) ?? username) || "User";
          return {
            id: postId,
            communityId: (r.community_id as string) ?? id,
            authorHandle: username ? `@${username}` : "",
            authorName: display,
            authorColor: (r.avatar_color as string | null) ?? Colors.mint,
            content: (r.content as string) ?? "",
            imageUrl: normalizeMediaUrl(r.image_url) ?? imageByPost.get(postId) ?? null,
            ticker: (r.ticker as string) ?? undefined,
            changePct: r.change_pct != null ? Number(r.change_pct) : undefined,
            createdAt: r.created_at
              ? new Date(r.created_at as string).getTime()
              : Date.now(),
            likes: Number(r.likes_count ?? 0),
            comments: Number(r.comments_count ?? 0),
            liked: !!r.liked,
            pinned: !!r.pinned,
          };
        });
      } catch (e) {
        console.log("[social] postsByCommunity RPC failed, trying direct", e);
        try {
          const { data: directRows, error: directError } = await supabase
            .from("community_posts")
            .select("id,user_id,community_id,content,image_url,ticker,change_pct,likes_count,comments_count,created_at")
            .eq("community_id", id)
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
          let likedSet = new Set<string>();
          if (isAuthenticated && userId && rows.length > 0) {
            const ids = rows.map((r) => String(r.id));
            const { data: likes } = await supabase
              .from("post_likes")
              .select("post_id")
              .eq("user_id", userId)
              .in("post_id", ids);
            likedSet = new Set((likes ?? []).map((r) => String(r.post_id)));
          }
          return rows.map((r): CommunityPost => {
            const postId = String(r.id);
            const author = authorMap.get(String(r.user_id)) ?? {};
            const username = (author.username as string | null) ?? "";
            const display = ((author.display_name as string | null) ?? username) || "User";
            return {
              id: postId,
              communityId: (r.community_id as string) ?? id,
              authorHandle: username ? `@${username}` : "",
              authorName: display,
              authorColor: (author.avatar_color as string | null) ?? Colors.mint,
              content: (r.content as string) ?? "",
              imageUrl: normalizeMediaUrl(r.image_url),
              ticker: (r.ticker as string) ?? undefined,
              changePct: r.change_pct != null ? Number(r.change_pct) : undefined,
              createdAt: r.created_at ? new Date(r.created_at as string).getTime() : Date.now(),
              likes: Number(r.likes_count ?? 0),
              comments: Number(r.comments_count ?? 0),
              liked: likedSet.has(postId),
            };
          });
        } catch (fallbackError) {
          console.log("[social] postsByCommunity direct failed", fallbackError);
          return [];
        }
      }
    },
    [isAuthenticated, userId],
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

  const addCommunityPost = useCallback(
    async (input: {
      communityId: string;
      content: string;
      authorHandle: string;
      authorName: string;
      authorColor: string;
      ticker?: string;
    }) => {
      if (!isAuthenticated || !userId) {
        console.log("[social] addCommunityPost requires auth");
        return;
      }
      try {
        const { data, error } = await supabase
          .from("community_posts")
          .insert({
            user_id: userId,
            community_id: input.communityId,
            content: input.content,
            ticker: input.ticker ?? null,
          })
          .select(
            "id,user_id,community_id,content,ticker,change_pct,likes_count,comments_count,created_at",
          )
          .single();
        if (error) throw error;
        const post: CommunityPost = {
          id: data.id as string,
          communityId: input.communityId,
          authorHandle: input.authorHandle,
          authorName: input.authorName,
          authorColor: input.authorColor,
          content: (data.content as string) ?? input.content,
          ticker: (data.ticker as string) ?? input.ticker,
          changePct: data.change_pct != null ? Number(data.change_pct) : undefined,
          createdAt: data.created_at
            ? new Date(data.created_at as string).getTime()
            : Date.now(),
          likes: 0,
          comments: 0,
          liked: false,
          imageUrl: null,
        };
        qc.setQueryData<CommunityPost[]>(
          ["social", "community-posts", input.communityId],
          (prev) => [post, ...(prev ?? [])],
        );
        qc.invalidateQueries({ queryKey: ["social", "communities"] });
      } catch (e) {
        console.log("[social] addCommunityPost failed", e);
      }
    },
    [isAuthenticated, userId, qc],
  );

  const togglePostLike = useCallback(
    async (id: string) => {
      try {
        const { data } = await supabase.rpc("toggle_post_like", { target_post_id: id });
        const row = Array.isArray(data)
          ? (data[0] as { liked: boolean; likes_count: number } | undefined)
          : undefined;
        // Patch any cached community lists that contain this post.
        const all = qc.getQueriesData<CommunityPost[]>({
          queryKey: ["social", "community-posts"],
        });
        for (const [key, list] of all) {
          if (!list) continue;
          const next = list.map((p) =>
            p.id === id
              ? {
                  ...p,
                  liked: row ? !!row.liked : !p.liked,
                  likes: row ? Number(row.likes_count ?? p.likes) : p.likes + (p.liked ? -1 : 1),
                }
              : p,
          );
          qc.setQueryData(key, next);
        }
      } catch (e) {
        console.log("[social] togglePostLike failed", e);
      }
    },
    [qc],
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
            p_is_private: !!input.isPrivate,
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
                is_private: !!input.isPrivate,
                avatar_url: normalizeMediaUrl(community.avatarUrl),
                banner_url: normalizeMediaUrl(community.bannerUrl),
              })
              .select(
                "id,name,slug,description,owner_id,member_count,posts_count,online_count,category,icon_emoji,accent_a,accent_b,verified,trending,pinned_ticker,rules,tags,is_private,avatar_url,banner_url,created_at",
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
      addCommunityPost,
      togglePostLike,
      spaces,
      liveSpaces,
      upcomingSpaces,
      isFollowingSpace: isFollowing,
      toggleFollowSpace,
      getSpace,
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
      addCommunityPost,
      togglePostLike,
      spaces,
      liveSpaces,
      upcomingSpaces,
      isFollowing,
      toggleFollowSpace,
      getSpace,
      communitiesQ.isLoading,
      spacesQ.isLoading,
    ],
  );
});
