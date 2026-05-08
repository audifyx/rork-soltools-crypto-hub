import { supabase } from "@/lib/supabase";
import type { CryptoNewsItem, NewsComment } from "@/lib/api/crypto-news";

export interface NewsSocialCounts {
  external_id: string;
  like_count: number;
  repost_count: number;
  comment_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
}

export interface NewsRepostFeedItem {
  external_id: string;
  reposted_by: string;
  username: string | null;
  avatar_url: string | null;
  quote_text: string | null;
  reposted_at: string;
  source: string;
  source_url: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  category: CryptoNewsItem["category"];
  sentiment: CryptoNewsItem["sentiment"];
  coin_mentions: string[];
  published_at: string;
  like_count: number;
  repost_count: number;
  comment_count: number;
}

export async function upsertNewsSocialItems(items: CryptoNewsItem[]): Promise<void> {
  if (!items.length) return;
  try {
    await supabase.rpc("upsert_news_social_items", {
      p_items: items.map((it) => ({
        id: it.id,
        source: it.source,
        source_url: it.source_url ?? null,
        title: it.title,
        description: it.description ?? null,
        image_url: it.image_url ?? null,
        category: it.category,
        sentiment: it.sentiment ?? null,
        coin_mentions: it.coin_mentions ?? [],
        published_at: it.published_at,
      })),
    });
  } catch (e) {
    console.log("[news-social] upsert failed", e);
  }
}

export async function hydrateNewsSocialCounts(items: CryptoNewsItem[]): Promise<CryptoNewsItem[]> {
  if (!items.length) return items;
  try {
    const { data, error } = await supabase.rpc("get_news_social_counts", {
      p_ids: items.map((it) => it.id),
    });
    if (error) throw error;
    const counts = new Map<string, NewsSocialCounts>(
      ((data ?? []) as NewsSocialCounts[]).map((row) => [row.external_id, row]),
    );
    return items.map((it) => {
      const c = counts.get(it.id);
      if (!c) return it;
      return {
        ...it,
        engagement: {
          likes: c.like_count ?? 0,
          shares: c.repost_count ?? 0,
          comments: c.comment_count ?? 0,
        },
      };
    });
  } catch (e) {
    console.log("[news-social] hydrate counts failed", e);
    return items;
  }
}

export async function toggleSocialNewsLike(newsId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_news_like", { p_external_id: newsId });
  if (error) throw error;
  return Boolean(data);
}

export async function toggleSocialNewsRepost(newsId: string, quoteText?: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_news_repost", {
    p_external_id: newsId,
    p_quote_text: quoteText ?? null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function addSocialNewsComment(newsId: string, body: string): Promise<NewsComment | null> {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc("add_news_social_comment", {
    p_external_id: newsId,
    p_body: trimmed,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; user_id: string; body: string; created_at: string }
    | null;
  return row
    ? { id: row.id, user_id: row.user_id, username: "", avatar_url: null, body: row.body, created_at: row.created_at }
    : null;
}

export async function getSocialNewsComments(newsId: string, limit: number = 50): Promise<NewsComment[]> {
  try {
    const { data, error } = await supabase.rpc("get_news_social_comments", {
      p_external_id: newsId,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as NewsComment[];
  } catch (e) {
    console.log("[news-social] comments failed", e);
    return [];
  }
}

export async function getNewsRepostFeed(limit: number = 30): Promise<NewsRepostFeedItem[]> {
  try {
    const { data, error } = await supabase.rpc("get_news_repost_feed", { p_limit: limit });
    if (error) throw error;
    return (data ?? []) as NewsRepostFeedItem[];
  } catch (e) {
    console.log("[news-social] repost feed failed", e);
    return [];
  }
}
