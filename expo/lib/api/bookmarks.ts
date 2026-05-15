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
  /** When the row was saved/liked/quoted by the current user. */
  bookmarkedAt: string;
  communityId: string | null;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorAvatarColor: string | null;
  authorVerified: boolean;
  /** Optional quote text the current user wrote when re-sharing the post. */
  quoteText?: string | null;
}

interface PostJoin {
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
}

interface BookmarkRow {
  created_at: string;
  post: PostJoin | null;
}

interface LikeRow {
  created_at: string;
  post: PostJoin | null;
}

interface RepostRow {
  created_at: string;
  quote_text: string | null;
  post: PostJoin | null;
}

async function loadAuthors(
  ids: string[],
): Promise<
  Map<
    string,
    {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      avatar_color: string | null;
      verified: boolean | null;
    }
  >
> {
  const map = new Map<
    string,
    {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      avatar_color: string | null;
      verified: boolean | null;
    }
  >();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url,avatar_color,verified")
    .in("id", ids);
  for (const p of (data ?? []) as {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    avatar_color: string | null;
    verified: boolean | null;
  }[]) {
    map.set(p.id, p);
  }
  return map;
}

function toPost(
  post: PostJoin,
  savedAt: string,
  authorMap: Map<
    string,
    {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      avatar_color: string | null;
      verified: boolean | null;
    }
  >,
  quoteText?: string | null,
): BookmarkedPost {
  const author = authorMap.get(post.user_id);
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
    bookmarkedAt: savedAt,
    communityId: post.community_id,
    authorId: post.user_id,
    authorUsername: author?.username ?? null,
    authorDisplayName: author?.display_name ?? null,
    authorAvatarUrl: author?.avatar_url ?? null,
    authorAvatarColor: author?.avatar_color ?? null,
    authorVerified: !!author?.verified,
    quoteText: quoteText ?? null,
  };
}

const POST_COLS =
  "id,user_id,community_id,content,image_url,ticker,token_address,change_pct,likes_count,reposts_count,comments_count,created_at";

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
    .select(`created_at, post:community_posts(${POST_COLS})`)
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
  const authorMap = await loadAuthors(authorIds);
  return rows.map((r) => toPost(r.post!, r.created_at, authorMap));
}

/** List posts the current user liked, most recent first. */
export async function listMyLikedPosts(limit = 200): Promise<BookmarkedPost[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("community_post_likes")
    .select(`created_at, post:community_posts(${POST_COLS})`)
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.log("[bookmarks] likes list failed", error.message);
    return [];
  }

  const rows = ((data ?? []) as unknown as LikeRow[]).filter((r) => r.post != null);
  if (rows.length === 0) return [];

  const authorIds = Array.from(new Set(rows.map((r) => r.post!.user_id)));
  const authorMap = await loadAuthors(authorIds);
  return rows.map((r) => toPost(r.post!, r.created_at, authorMap));
}

/**
 * List posts the current user quoted (reposts with quote_text not null).
 * Falls back to plain reposts if the quote_text column does not exist yet.
 */
export async function listMyQuotedPosts(limit = 200): Promise<BookmarkedPost[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];

  let rows: RepostRow[] = [];
  const { data, error } = await supabase
    .from("community_post_reposts")
    .select(`created_at, quote_text, post:community_posts(${POST_COLS})`)
    .eq("user_id", uid)
    .not("quote_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.log("[bookmarks] quotes list failed", error.message);
    const retry = await supabase
      .from("community_post_reposts")
      .select(`created_at, post:community_posts(${POST_COLS})`)
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    rows = ((retry.data ?? []) as unknown as RepostRow[]).map((r) => ({ ...r, quote_text: null }));
  } else {
    rows = (data ?? []) as unknown as RepostRow[];
  }

  rows = rows.filter((r) => r.post != null);
  if (rows.length === 0) return [];

  const authorIds = Array.from(new Set(rows.map((r) => r.post!.user_id)));
  const authorMap = await loadAuthors(authorIds);
  return rows.map((r) => toPost(r.post!, r.created_at, authorMap, r.quote_text));
}

/** Remove a like via the same RPC the post action bar uses. */
export async function removeLike(postId: string): Promise<void> {
  const { error } = await supabase.rpc("toggle_post_like", { target_post_id: postId });
  if (error) {
    console.log("[bookmarks] unlike failed", error.message);
    throw new Error(error.message || "Could not remove like.");
  }
}

/** Remove a quoted repost via the same RPC the post action bar uses. */
export async function removeQuote(postId: string): Promise<void> {
  const { error } = await supabase.rpc("toggle_post_repost", { target_post_id: postId });
  if (error) {
    console.log("[bookmarks] unquote failed", error.message);
    throw new Error(error.message || "Could not remove quote.");
  }
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
