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
}

/**
 * Fetch the most recent posts authored by `targetUserId` for display in a
 * profile feed. Excludes thread replies and community-scoped posts so the
 * profile only shows top-level activity.
 */
export async function fetchUserPosts(targetUserId: string, limit = 60): Promise<UserPostSummary[]> {
  const { data, error } = await supabase
    .from("community_posts")
    .select(
      "id,content,image_url,ticker,token_address,change_pct,likes_count,reposts_count,comments_count,created_at",
    )
    .eq("user_id", targetUserId)
    .is("community_id", null)
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
  }));
}
