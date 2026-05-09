import { normalizeMediaUrl } from "@/lib/media";
import { supabase } from "@/lib/supabase";

export type ProfileActivityType = "post" | "like" | "repost" | "comment";

export interface ProfileActivityItem {
  id: string;
  activityType: ProfileActivityType;
  activityAt: string;
  authorUserId: string | null;
  content: string;
  imageUrl: string | null;
  ticker: string | null;
  tokenAddress: string | null;
  likes: number;
  reposts: number;
  comments: number;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  activity_type?: string | null;
  activity_at?: string | null;
  author_user_id?: string | null;
  content?: string | null;
  image_url?: string | null;
  ticker?: string | null;
  token_address?: string | null;
  likes_count?: number | null;
  reposts_count?: number | null;
  comments_count?: number | null;
  created_at?: string | null;
}

function normalizeType(value: unknown): ProfileActivityType {
  return value === "like" || value === "repost" || value === "comment"
    ? value
    : "post";
}

function mapRow(row: ActivityRow): ProfileActivityItem {
  return {
    id: row.id,
    activityType: normalizeType(row.activity_type),
    activityAt: row.activity_at ?? row.created_at ?? new Date().toISOString(),
    authorUserId: row.author_user_id ?? null,
    content: row.content ?? "",
    imageUrl: normalizeMediaUrl(row.image_url),
    ticker: row.ticker ?? null,
    tokenAddress: row.token_address ?? null,
    likes: Number(row.likes_count ?? 0),
    reposts: Number(row.reposts_count ?? 0),
    comments: Number(row.comments_count ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

async function fetchRpc(
  rpc: string,
  userId: string,
  limit = 80,
): Promise<ProfileActivityItem[]> {
  const { data, error } = await supabase.rpc(rpc, {
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    console.log(`[profile-activity] ${rpc} failed`, error.message);
    return [];
  }

  return ((data ?? []) as ActivityRow[]).map(mapRow);
}

export function fetchProfilePosts(userId: string, limit?: number) {
  return fetchRpc("list_profile_post_activity", userId, limit);
}

export function fetchProfileLikes(userId: string, limit?: number) {
  return fetchRpc("list_profile_liked_posts", userId, limit);
}

export function fetchProfileReposts(userId: string, limit?: number) {
  return fetchRpc("list_profile_reposted_posts", userId, limit);
}
