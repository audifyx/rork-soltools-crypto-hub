import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import Colors from "@/constants/colors";
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
  created_at: string | null;
};

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
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    rules,
    tags,
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

  const [followingSpaces, setFollowingSpaces] = useState<string[]>([]);
  const [guestJoined, setGuestJoined] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [f, gj] = await Promise.all([
        loadJson<string[]>(followKey, []),
        loadJson<string[]>(KEY_JOINED_GUEST, []),
      ]);
      if (!alive) return;
      setFollowingSpaces(f);
      setGuestJoined(gj);
    })();
    return () => {
      alive = false;
    };
  }, [followKey]);

  const communitiesQ = useQuery<Community[]>({
    queryKey: ["social", "communities"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("communities")
          .select(
            "id,name,slug,description,owner_id,member_count,posts_count,online_count,category,icon_emoji,accent_a,accent_b,verified,trending,pinned_ticker,rules,tags,is_private,created_at",
          )
          .order("member_count", { ascending: false })
          .limit(200);
        if (error) throw error;
        const rows = (data ?? []) as CommunityRow[];
        const ownerIds = Array.from(
          new Set(rows.map((r) => r.owner_id).filter((v): v is string => !!v)),
        );
        let ownerHandles = new Map<string, string>();
        if (ownerIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,username")
            .in("id", ownerIds);
          ownerHandles = new Map(
            (profs ?? []).map((p) => [
              p.id as string,
              p.username ? `@${p.username as string}` : "",
            ]),
          );
        }
        return rows.map((r) =>
          rowToCommunity(r, r.owner_id ? ownerHandles.get(r.owner_id) ?? "" : ""),
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

  const communities = communitiesQ.data ?? [];
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
        const { data, error } = await supabase
          .from("community_posts")
          .select(
            "id,user_id,community_id,content,ticker,change_pct,likes_count,comments_count,created_at",
          )
          .eq("community_id", id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        const rows = data ?? [];
        const userIds = Array.from(
          new Set(rows.map((r) => r.user_id as string).filter(Boolean)),
        );
        let userMap = new Map<string, { handle: string; name: string; color: string }>();
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,username,display_name,avatar_color")
            .in("id", userIds);
          userMap = new Map(
            (profs ?? []).map((p) => [
              p.id as string,
              {
                handle: p.username ? `@${p.username as string}` : "",
                name:
                  ((p.display_name as string | null) ?? (p.username as string | null) ?? "User") ||
                  "User",
                color: (p.avatar_color as string | null) ?? Colors.mint,
              },
            ]),
          );
        }
        return rows.map((r): CommunityPost => {
          const u = userMap.get(r.user_id as string);
          return {
            id: r.id as string,
            communityId: (r.community_id as string) ?? id,
            authorHandle: u?.handle ?? "",
            authorName: u?.name ?? "User",
            authorColor: u?.color ?? Colors.mint,
            content: (r.content as string) ?? "",
            ticker: (r.ticker as string) ?? undefined,
            changePct: r.change_pct != null ? Number(r.change_pct) : undefined,
            createdAt: r.created_at ? new Date(r.created_at as string).getTime() : Date.now(),
            likes: Number(r.likes_count ?? 0),
            comments: Number(r.comments_count ?? 0),
            liked: false,
          };
        });
      } catch (e) {
        console.log("[social] postsByCommunity failed", e);
        return [];
      }
    },
    [],
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

  const joinedCommunities = useMemo(
    () => communities.filter((c) => joined.includes(c.id)),
    [communities, joined],
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
