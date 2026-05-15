import { normalizeMediaUrl } from "@/lib/media";
import { supabase } from "@/lib/supabase";

export interface UserPostSummary {
  id: string;
  text: string;
  imageUrl: string | null;
  ticker: string | null;
  tokenAddress: string | null;
  changePct: number | null;
  likes: number;
  reposts: number;
  comments: number;
  createdAt: string;
  communityId: string | null;
}

interface CommunityPostRow {
  id: string;
  content: string | null;
  image_url: string | null;
  ticker: string | null;
  token_address: string | null;
  change_pct: number | null;
  likes_count: number | null;
  reposts_count: number | null;
  comments_count: number | null;
  created_at: string;
  community_id: string | null;
}

/**
 * Fetch the most recent top-level posts authored by `targetUserId` for the
 * profile feed. Includes both global feed posts and community posts so the
 * profile shows everything the user has shared. Thread replies are excluded.
 */
export async function fetchUserPosts(targetUserId: string, limit = 60): Promise<UserPostSummary[]> {
  const { data, error } = await supabase
    .from("community_posts")
    .select(
      "id,content,image_url,ticker,token_address,change_pct,likes_count,reposts_count,comments_count,created_at,community_id",
    )
    .eq("user_id", targetUserId)
    .is("parent_post_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.log("[posts] user posts fetch failed", error.message);
    return [];
  }

  return ((data ?? []) as CommunityPostRow[]).map((row): UserPostSummary => ({
    id: row.id,
    text: row.content ?? "",
    imageUrl: normalizeMediaUrl(row.image_url),
    ticker: row.ticker,
    tokenAddress: row.token_address,
    changePct: row.change_pct != null ? Number(row.change_pct) : null,
    likes: Number(row.likes_count ?? 0),
    reposts: Number(row.reposts_count ?? 0),
    comments: Number(row.comments_count ?? 0),
    createdAt: row.created_at,
    communityId: row.community_id ?? null,
  }));
}
