import { normalizeMediaUrl } from "@/lib/media";
import { supabase } from "@/lib/supabase";

export interface BookmarkedPost {
  id: string;
  content: string;
  imageUrl: string | null;
  ticker: string | null;
  tokenAddress: string | null;
  changePct: number | null;
  likes: number;
  reposts: number;
  comments: number;
  createdAt: string;
  bookmarkedAt: string;
  communityId: string | null;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorAvatarColor: string | null;
  authorVerified: boolean;
}

interface BookmarkRow {
  created_at: string;
  post: {
    id: string;
    user_id: string;
    community_id: string | null;
    content: string | null;
    image_url: string | null;
    ticker: string | null;
    token_address: string | null;
    change_pct: number | null;
    likes_count: number | null;
    reposts_count: number | null;
    comments_count: number | null;
    created_at: string;
  } | null;
}

/**
 * List every post the current user has bookmarked. Joins `community_posts`
 * via the implicit FK, then enriches with author profile fields in a single
 * follow-up query so the UI can render usernames/avatars.
 */
export async function listMyBookmarkedPosts(limit = 200): Promise<BookmarkedPost[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("community_post_bookmarks")
    .select(
      "created_at, post:community_posts(id,user_id,community_id,content,image_url,ticker,token_address,change_pct,likes_count,reposts_count,comments_count,created_at)",
    )
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.log("[bookmarks] list failed", error.message);
    return [];
  }

  const rows = ((data ?? []) as unknown as BookmarkRow[]).filter((r) => r.post != null);
  if (rows.length === 0) return [];

  const authorIds = Array.from(new Set(rows.map((r) => r.post!.user_id)));
  const profileMap = new Map<
    string,
    {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      avatar_color: string | null;
      verified: boolean | null;
    }
  >();

  if (authorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url,avatar_color,verified")
      .in("id", authorIds);
    for (const p of (profs ?? []) as {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      avatar_color: string | null;
      verified: boolean | null;
    }[]) {
      profileMap.set(p.id, p);
    }
  }

  return rows.map((r): BookmarkedPost => {
    const post = r.post!;
    const author = profileMap.get(post.user_id);
    return {
      id: post.id,
      content: post.content ?? "",
      imageUrl: normalizeMediaUrl(post.image_url),
      ticker: post.ticker,
      tokenAddress: post.token_address,
      changePct: post.change_pct != null ? Number(post.change_pct) : null,
      likes: Number(post.likes_count ?? 0),
      reposts: Number(post.reposts_count ?? 0),
      comments: Number(post.comments_count ?? 0),
      createdAt: post.created_at,
      bookmarkedAt: r.created_at,
      communityId: post.community_id,
      authorId: post.user_id,
      authorUsername: author?.username ?? null,
      authorDisplayName: author?.display_name ?? null,
      authorAvatarUrl: author?.avatar_url ?? null,
      authorAvatarColor: author?.avatar_color ?? null,
      authorVerified: !!author?.verified,
    };
  });
}

/**
 * Remove a single bookmark via the same RPC the post action bar uses, so
 * counters and engagement caches stay consistent.
 */
export async function removeBookmark(postId: string): Promise<void> {
  const { error } = await supabase.rpc("toggle_post_bookmark", { target_post_id: postId });
  if (error) {
    console.log("[bookmarks] remove failed", error.message);
    throw new Error(error.message || "Could not remove bookmark.");
  }
}
