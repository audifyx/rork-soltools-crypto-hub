/**
 * Unified RPC wrappers for the 41 platform features migration
 * (supabase/migrations/2026_05_12_full_platform_features.sql).
 * Keeps UI files lean by hiding raw supabase.rpc/from calls.
 */
import { supabase } from "@/lib/supabase";

/* ============================== STORIES =============================== */

export interface StoryRow {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  duration_seconds: number | null;
  created_at: string;
  expires_at: string;
  view_count: number | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  verified?: boolean | null;
}

export async function listActiveStories(): Promise<StoryRow[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("id,author_id,media_url,media_type,caption,created_at,expires_at,view_count")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) {
    console.log("[stories] list failed", error.message);
    return [];
  }
  const raw = (data ?? []) as {
    id: string;
    author_id: string;
    media_url: string;
    media_type: "image" | "video";
    caption: string | null;
    created_at: string;
    expires_at: string;
    view_count: number | null;
  }[];
  const authorIds = Array.from(new Set(raw.map((r) => r.author_id)));
  const profileMap = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null; avatar_color: string | null; verified: boolean | null }>();
  if (authorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url,avatar_color,verified")
      .in("id", authorIds);
    for (const p of (profs ?? []) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null; avatar_color: string | null; verified: boolean | null }[]) {
      profileMap.set(p.id, p);
    }
  }
  return raw.map((r) => {
    const p = profileMap.get(r.author_id);
    return {
      id: r.id,
      user_id: r.author_id,
      media_url: r.media_url,
      media_type: r.media_type,
      caption: r.caption,
      duration_seconds: 5,
      created_at: r.created_at,
      expires_at: r.expires_at,
      view_count: r.view_count,
      username: p?.username ?? null,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      avatar_color: p?.avatar_color ?? null,
      verified: p?.verified ?? false,
    };
  });
}

export async function viewStory(storyId: string): Promise<void> {
  const { error } = await supabase.rpc("view_story", { p_story_id: storyId });
  if (error) console.log("[stories] view failed", error.message);
}

export async function createStory(input: {
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string | null;
  durationSeconds?: number | null;
}): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("stories")
    .insert({
      author_id: uid,
      media_url: input.mediaUrl,
      media_type: input.mediaType,
      caption: input.caption ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.log("[stories] create failed", error.message);
    return null;
  }
  return (data?.id as string) ?? null;
}

/* ============================== EVENTS ================================ */

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  is_virtual: boolean;
  url: string | null;
  category: string | null;
  rsvp_count: number;
  going_count: number;
  host_user_id: string;
  community_id: string | null;
  my_status?: "going" | "interested" | "no" | null;
}

export async function listUpcomingEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", new Date(Date.now() - 12 * 3600_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(80);
  if (error) {
    console.log("[events] list failed", error.message);
    return [];
  }
  return (data ?? []) as EventRow[];
}

export async function rsvpEvent(eventId: string, status: "going" | "interested" | "no"): Promise<void> {
  const { error } = await supabase.rpc("rsvp_event", { p_event_id: eventId, p_status: status });
  if (error) throw error;
}

/* ============================ COMMUNITIES ============================= */

export interface CommunityCategoryRow {
  slug: string;
  label: string;
  icon: string | null;
  sort_order: number | null;
}

export async function listCommunityCategories(): Promise<CommunityCategoryRow[]> {
  const { data, error } = await supabase
    .from("community_categories")
    .select("slug,label,icon,sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    console.log("[communities] categories failed", error.message);
    return [];
  }
  return (data ?? []) as CommunityCategoryRow[];
}

/* ============================== STREAKS =============================== */

export interface StreakRow {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  total_active_days: number;
}

export async function getStreak(userId: string): Promise<StreakRow | null> {
  const { data, error } = await supabase
    .from("user_streaks")
    .select("user_id,current_streak,longest_streak,last_active_date,total_active_days")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.log("[streaks] get failed", error.message);
    return null;
  }
  return (data as StreakRow) ?? null;
}

export async function bumpStreak(userId: string): Promise<void> {
  const { error } = await supabase.rpc("bump_streak", { p_user: userId });
  if (error) console.log("[streaks] bump failed", error.message);
}

/* ============================ ACHIEVEMENTS ============================ */

export interface AchievementRow {
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  xp_reward: number | null;
  rarity: string | null;
}

export interface UserAchievementRow extends AchievementRow {
  awarded_at: string | null;
  progress: number | null;
}

export async function listAchievements(userId: string | null | undefined): Promise<UserAchievementRow[]> {
  const { data: defs, error: defErr } = await supabase
    .from("achievements")
    .select("slug,title,description,icon,category,xp_reward,rarity")
    .order("xp_reward", { ascending: false })
    .limit(120);
  if (defErr) {
    console.log("[achievements] defs failed", defErr.message);
    return [];
  }
  const ownedMap = new Map<string, { awarded_at: string | null; progress: number | null }>();
  if (userId) {
    const { data: owned } = await supabase
      .from("user_achievements")
      .select("achievement_slug,awarded_at,progress")
      .eq("user_id", userId);
    for (const row of (owned ?? []) as { achievement_slug: string; awarded_at: string | null; progress: number | null }[]) {
      ownedMap.set(row.achievement_slug, { awarded_at: row.awarded_at, progress: row.progress });
    }
  }
  return ((defs ?? []) as AchievementRow[]).map((d) => ({
    ...d,
    awarded_at: ownedMap.get(d.slug)?.awarded_at ?? null,
    progress: ownedMap.get(d.slug)?.progress ?? 0,
  }));
}

/* ============================== RECAP ================================= */

export interface WeeklyRecapRow {
  id: string;
  week_start: string;
  posts_count: number | null;
  followers_gained: number | null;
  top_post_id: string | null;
  views_count: number | null;
  reactions_count: number | null;
  highlight_text: string | null;
}

export async function getLatestRecap(userId: string): Promise<WeeklyRecapRow | null> {
  const { data, error } = await supabase
    .from("weekly_recaps")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.log("[recap] failed", error.message);
    return null;
  }
  return (data as WeeklyRecapRow) ?? null;
}

/* =============================== FYP ================================== */

export interface FypCard {
  id: string;
  kind: "post" | "reel" | "story" | "community" | "event";
  ref_id: string;
  score: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export async function listFyp(userId: string): Promise<FypCard[]> {
  const { data, error } = await supabase
    .from("fyp_cache")
    .select("id,kind,ref_id,score,payload,created_at")
    .eq("user_id", userId)
    .order("score", { ascending: false })
    .limit(60);
  if (error) {
    console.log("[fyp] failed", error.message);
    return [];
  }
  return (data ?? []) as FypCard[];
}

/* =========================== HASHTAGS ================================ */

export interface TrendingHashtagRow {
  tag: string;
  post_count: number;
  trending_score: number;
}

export async function listTrendingHashtags(limit: number = 12): Promise<TrendingHashtagRow[]> {
  const { data, error } = await supabase
    .from("hashtags")
    .select("tag,post_count,trending_score")
    .order("trending_score", { ascending: false })
    .limit(limit);
  if (error) {
    console.log("[hashtags] trending failed", error.message);
    return [];
  }
  return (data ?? []) as TrendingHashtagRow[];
}

/* ====================== SUGGESTED FOLLOWS ============================ */

export interface SuggestedFollowRow {
  suggested_user_id: string;
  mutual_count: number;
  reason: string | null;
  score: number;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean | null;
}

export async function listSuggestedFollows(userId: string, limit: number = 12): Promise<SuggestedFollowRow[]> {
  const { data, error } = await supabase
    .from("suggested_follows")
    .select("suggested_user_id,mutual_count,reason,score")
    .eq("user_id", userId)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) {
    console.log("[suggested] failed", error.message);
    return [];
  }
  const rows = (data ?? []) as { suggested_user_id: string; mutual_count: number; reason: string | null; score: number }[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.suggested_user_id);
  const { data: profs } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url,verified")
    .in("id", ids);
  const profMap = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null; verified: boolean | null }>();
  for (const p of (profs ?? []) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null; verified: boolean | null }[]) {
    profMap.set(p.id, p);
  }
  return rows.map((r) => {
    const p = profMap.get(r.suggested_user_id);
    return {
      suggested_user_id: r.suggested_user_id,
      mutual_count: r.mutual_count,
      reason: r.reason,
      score: r.score,
      username: p?.username ?? null,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      verified: p?.verified ?? false,
    };
  });
}

export async function hideFypCard(userId: string, cardId: string, refId: string): Promise<void> {
  await supabase.from("fyp_cache").delete().eq("user_id", userId).eq("id", cardId).catch(() => {});
  await supabase
    .from("feed_signals")
    .insert({ user_id: userId, post_id: refId, signal: "hide", weight: 2.0 })
    .catch(() => {});
}

/* =========================== INTEREST QUIZ ============================ */

export interface InterestTopicRow {
  slug: string;
  label: string;
  emoji: string | null;
  category: string | null;
}

export async function listInterestTopics(): Promise<InterestTopicRow[]> {
  const { data, error } = await supabase
    .from("interest_topics")
    .select("slug,label,emoji,category")
    .order("category", { ascending: true });
  if (error) {
    console.log("[interests] failed", error.message);
    return [];
  }
  return (data ?? []) as InterestTopicRow[];
}

export async function getMyInterests(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_interests")
    .select("topic_slug")
    .eq("user_id", userId);
  if (error) {
    console.log("[interests] mine failed", error.message);
    return [];
  }
  return ((data ?? []) as { topic_slug: string }[]).map((r) => r.topic_slug);
}

export async function setMyInterests(userId: string, slugs: string[]): Promise<void> {
  await supabase.from("user_interests").delete().eq("user_id", userId);
  if (slugs.length === 0) return;
  const rows = slugs.map((s) => ({ user_id: userId, topic_slug: s }));
  const { error } = await supabase.from("user_interests").insert(rows);
  if (error) throw error;
}

/* =========================== DM EXTRAS ================================ */

export interface PinnedMessageRow {
  id: string;
  body: string | null;
  message_type: string | null;
  created_at: string;
  sender_id: string;
  ticker: string | null;
}

export async function listPinnedMessages(conversationId: string): Promise<PinnedMessageRow[]> {
  const { data, error } = await supabase.rpc("list_pinned_messages", {
    p_conversation_id: conversationId,
  });
  if (error) {
    console.log("[dm] pinned list failed", error.message);
    return [];
  }
  return (data ?? []) as PinnedMessageRow[];
}

export async function togglePinInChat(messageId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_pin_in_chat", { p_message_id: messageId });
  if (error) {
    console.log("[dm] pin toggle failed", error.message);
    return false;
  }
  return !!data;
}

export interface DmSearchHit {
  id: string;
  body: string | null;
  sender_id: string;
  created_at: string;
}

export async function searchDmMessages(conversationId: string, query: string): Promise<DmSearchHit[]> {
  const term = query.trim();
  if (!term) return [];
  const { data, error } = await supabase.rpc("search_dm_messages", {
    p_conversation_id: conversationId,
    p_query: term,
  });
  if (error) {
    console.log("[dm] search failed", error.message);
    return [];
  }
  return (data ?? []) as DmSearchHit[];
}

export async function setDisappearing(conversationId: string, seconds: number): Promise<void> {
  const { error } = await supabase.rpc("set_dm_disappearing", {
    p_conversation_id: conversationId,
    p_seconds: seconds,
  });
  if (error) throw error;
}

export async function setDmFolder(
  conversationId: string,
  folder: "primary" | "general" | "requests" | "archive" | "spam" | string,
): Promise<void> {
  const { error } = await supabase.rpc("set_dm_folder", {
    p_conversation_id: conversationId,
    p_folder: folder,
  });
  if (error) throw error;
}

export async function getSelfChat(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_self_chat");
  if (error) {
    console.log("[dm] self chat failed", error.message);
    throw new Error(error.message);
  }
  return (data as string) ?? null;
}

export async function reportScreenshot(conversationId: string): Promise<void> {
  await supabase.rpc("report_screenshot", { p_conversation_id: conversationId }).catch(() => {});
}
