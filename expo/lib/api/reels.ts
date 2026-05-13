import { normalizeMediaUrl } from "@/lib/media";
import { supabase } from "@/lib/supabase";

export interface ReelAuthor {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: string;
  verified: boolean;
}

export type ReelMediaType = "video" | "image";

export interface Reel {
  id: string;
  userId: string;
  mediaType: ReelMediaType;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  ticker: string | null;
  tokenAddress: string | null;
  durationMs: number | null;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  likedByViewer: boolean;
  createdAt: string;
  author: ReelAuthor;
}

export interface ReelComment {
  id: string;
  reelId: string;
  userId: string;
  body: string;
  createdAt: string;
  author: ReelAuthor;
}

export interface CreateReelInput {
  userId: string;
  mediaType?: ReelMediaType;
  videoUrl: string;
  thumbnailUrl?: string | null;
  caption?: string;
  ticker?: string | null;
  tokenAddress?: string | null;
  durationMs?: number | null;
}

type ReelRow = {
  id: string;
  user_id: string;
  media_type: string | null;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  ticker: string | null;
  token_address: string | null;
  duration_ms: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  views_count: number | null;
  created_at: string;
};

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  verified?: boolean | null;
};

type CommentRow = {
  id: string;
  reel_id: string;
  user_id: string;
  body: string | null;
  created_at: string;
};

const FALLBACK_COLORS = ["#D8B75A", "#DDE3EC", "#F4C65B", "#AEB6C3", "#F7F2E7"] as const;

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function authorFromProfile(userId: string, profile?: ProfileRow): ReelAuthor {
  const username = profile?.username?.replace(/^@/, "").trim();
  const fallback = userId.slice(0, 8);
  const handle = username ? `@${username}` : `@${fallback}`;
  return {
    userId,
    handle,
    displayName: profile?.display_name?.trim() || username || `Trader ${fallback}`,
    avatarUrl: normalizeMediaUrl(profile?.avatar_url ?? null),
    avatarColor: profile?.avatar_color ?? colorFor(userId),
    verified: !!profile?.verified,
  };
}

async function fetchProfiles(userIds: string[]): Promise<Map<string, ProfileRow>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const map = new Map<string, ProfileRow>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,user_id,username,display_name,avatar_url,avatar_color,verified")
    .in("user_id", unique);

  if (error) {
    console.log("[reels] profile fetch failed", error.message);
    return map;
  }

  ((data ?? []) as ProfileRow[]).forEach((row) => {
    if (row.user_id) map.set(row.user_id, row);
    if (row.id) map.set(row.id, row);
  });
  return map;
}

async function fetchLikedSet(reelIds: string[], viewerId?: string | null): Promise<Set<string>> {
  if (!viewerId || reelIds.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from("reel_likes")
    .select("reel_id")
    .eq("user_id", viewerId)
    .in("reel_id", reelIds);

  if (error) {
    console.log("[reels] liked state failed", error.message);
    return new Set<string>();
  }
  return new Set(((data ?? []) as { reel_id: string }[]).map((row) => row.reel_id));
}

async function mapReelRows(rows: ReelRow[], viewerId?: string | null): Promise<Reel[]> {
  const profiles = await fetchProfiles(rows.map((row) => row.user_id));
  const liked = await fetchLikedSet(rows.map((row) => row.id), viewerId);
  return rows.map((row): Reel => ({
    id: row.id,
    userId: row.user_id,
    mediaType: (row.media_type === "image" ? "image" : "video") as ReelMediaType,
    videoUrl: normalizeMediaUrl(row.video_url) ?? row.video_url,
    thumbnailUrl: normalizeMediaUrl(row.thumbnail_url),
    caption: row.caption ?? "",
    ticker: row.ticker ?? null,
    tokenAddress: row.token_address ?? null,
    durationMs: row.duration_ms ?? null,
    likesCount: Number(row.likes_count ?? 0),
    commentsCount: Number(row.comments_count ?? 0),
    sharesCount: Number(row.shares_count ?? 0),
    viewsCount: Number(row.views_count ?? 0),
    likedByViewer: liked.has(row.id),
    createdAt: row.created_at,
    author: authorFromProfile(row.user_id, profiles.get(row.user_id)),
  }));
}

export async function fetchReelsFeed(viewerId?: string | null, limit = 30): Promise<Reel[]> {
  const { data, error } = await supabase
    .from("reels")
    .select("id,user_id,media_type,video_url,thumbnail_url,caption,ticker,token_address,duration_ms,likes_count,comments_count,shares_count,views_count,created_at")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.log("[reels] feed failed", error.message);
    return [];
  }
  return mapReelRows((data ?? []) as ReelRow[], viewerId);
}

export async function fetchUserReels(targetUserId: string, viewerId?: string | null): Promise<Reel[]> {
  const { data, error } = await supabase
    .from("reels")
    .select("id,user_id,media_type,video_url,thumbnail_url,caption,ticker,token_address,duration_ms,likes_count,comments_count,shares_count,views_count,created_at")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.log("[reels] user reels failed", error.message);
    return [];
  }
  return mapReelRows((data ?? []) as ReelRow[], viewerId);
}

export async function createReel(input: CreateReelInput): Promise<Reel> {
  const { data, error } = await supabase
    .from("reels")
    .insert({
      user_id: input.userId,
      media_type: input.mediaType ?? "video",
      video_url: input.videoUrl.trim(),
      thumbnail_url: input.thumbnailUrl ?? null,
      caption: (input.caption ?? "").trim().slice(0, 2200),
      ticker: input.ticker?.replace("$", "").trim().toUpperCase() || null,
      token_address: input.tokenAddress?.trim() || null,
      duration_ms: input.durationMs ?? null,
      visibility: "public",
    })
    .select("id,user_id,media_type,video_url,thumbnail_url,caption,ticker,token_address,duration_ms,likes_count,comments_count,shares_count,views_count,created_at")
    .single();

  if (error) throw new Error(error.message || "Could not publish reel");
  const [reel] = await mapReelRows([data as ReelRow], input.userId);
  return reel;
}

export async function deleteReel(reelId: string): Promise<void> {
  const { error } = await supabase.from("reels").delete().eq("id", reelId);
  if (error) throw new Error(error.message || "Could not delete reel");
}

export async function likeReel(reelId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("reel_likes").upsert({ reel_id: reelId, user_id: userId }, { onConflict: "reel_id,user_id" });
  if (error) throw new Error(error.message || "Could not like reel");
}

export async function unlikeReel(reelId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("reel_likes").delete().eq("reel_id", reelId).eq("user_id", userId);
  if (error) throw new Error(error.message || "Could not unlike reel");
}

export async function addReelComment(reelId: string, userId: string, body: string): Promise<ReelComment> {
  const clean = body.trim().slice(0, 1000);
  if (!clean) throw new Error("Comment cannot be empty");
  const { data, error } = await supabase
    .from("reel_comments")
    .insert({ reel_id: reelId, user_id: userId, body: clean })
    .select("id,reel_id,user_id,body,created_at")
    .single();
  if (error) throw new Error(error.message || "Could not comment");
  const row = data as CommentRow;
  const profiles = await fetchProfiles([row.user_id]);
  return {
    id: row.id,
    reelId: row.reel_id,
    userId: row.user_id,
    body: row.body ?? "",
    createdAt: row.created_at,
    author: authorFromProfile(row.user_id, profiles.get(row.user_id)),
  };
}

export async function getReelComments(reelId: string): Promise<ReelComment[]> {
  const { data, error } = await supabase
    .from("reel_comments")
    .select("id,reel_id,user_id,body,created_at")
    .eq("reel_id", reelId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.log("[reels] comments failed", error.message);
    return [];
  }
  const rows = (data ?? []) as CommentRow[];
  const profiles = await fetchProfiles(rows.map((row) => row.user_id));
  return rows.map((row): ReelComment => ({
    id: row.id,
    reelId: row.reel_id,
    userId: row.user_id,
    body: row.body ?? "",
    createdAt: row.created_at,
    author: authorFromProfile(row.user_id, profiles.get(row.user_id)),
  }));
}

export async function deleteReelComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_own_reel_comment", { p_comment_id: commentId });
  if (error) {
    const msg = error.message ?? "";
    const missingRpc = /could not find the function|function .* does not exist|schema cache/i.test(msg);
    if (!missingRpc) throw new Error(msg || "Could not delete comment.");
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error("Sign in to delete.");
    const { error: delErr } = await supabase.from("reel_comments").delete().eq("id", commentId).eq("user_id", uid);
    if (delErr) throw new Error(delErr.message || "Could not delete comment.");
  }
}

export async function shareReel(reelId: string, userId?: string | null, channel = "native"): Promise<void> {
  const { error } = await supabase.from("reel_shares").insert({ reel_id: reelId, user_id: userId ?? null, channel });
  if (error) throw new Error(error.message || "Could not track share");
}
