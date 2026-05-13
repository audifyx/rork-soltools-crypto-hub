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
  let cached: FypCard[] = [];
  try {
    const { data, error } = await supabase
      .from("fyp_cache")
      .select("id,kind,ref_id,score,payload,created_at")
      .eq("user_id", userId)
      .order("score", { ascending: false })
      .limit(60);
    if (error) console.log("[fyp] cache failed", error.message);
    cached = (data ?? []) as FypCard[];
  } catch (e) {
    console.log("[fyp] cache exception", e instanceof Error ? e.message : String(e));
  }
  let live: FypCard[] = [];
  try {
    live = await buildLiveFyp();
  } catch (e) {
    console.log("[fyp] live exception", e instanceof Error ? e.message : String(e));
  }
  if (live.length === 0 && cached.length === 0) return [];
  const seen = new Set(cached.map((c) => c.ref_id));
  const merged: FypCard[] = [...cached];
  for (const card of live) {
    if (seen.has(card.ref_id)) continue;
    seen.add(card.ref_id);
    merged.push(card);
  }
  // Ensure every kind has representation by sorting so the top-N covers a mix.
  merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return merged;
}

/**
 * Build For-You cards on the fly when `fyp_cache` is sparse so the tab is
 * never empty. Pulls recent reels, stories, events, and trending communities
 * and scores them by recency + engagement.
 */
async function buildLiveFyp(): Promise<FypCard[]> {
  const now = Date.now();
  const cards: FypCard[] = [];

  const settled = await Promise.allSettled([
    supabase
      .from("reels")
      .select("id,author_id,video_url,thumbnail_url,caption,like_count,view_count,comment_count,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("stories")
      .select("id,author_id,media_url,media_type,caption,created_at,expires_at,view_count")
      .gt("expires_at", new Date().toISOString())
      .order("view_count", { ascending: false })
      .limit(12),
    supabase
      .from("events")
      .select("id,host_id,title,description,cover_url,starts_at,rsvp_count")
      .gte("starts_at", new Date(now - 6 * 3600_000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(10),
    supabase
      .from("communities")
      .select("*")
      .order("trending_score", { ascending: false })
      .limit(8),
  ]);

  const pickRows = <T,>(idx: number, label: string): T[] => {
    const r = settled[idx];
    if (r.status === "rejected") {
      console.log(`[fyp] ${label} rejected`, r.reason instanceof Error ? r.reason.message : String(r.reason));
      return [];
    }
    const { data, error } = r.value as { data: unknown; error: { message: string } | null };
    if (error) {
      console.log(`[fyp] ${label} error`, error.message);
      return [];
    }
    return (data ?? []) as T[];
  };

  const reels = pickRows<{
    id: string; author_id: string; video_url: string; thumbnail_url: string | null;
    caption: string | null; like_count: number; view_count: number; comment_count: number; created_at: string;
  }>(0, "reels");
  const stories = pickRows<{
    id: string; author_id: string; media_url: string; media_type: "image" | "video";
    caption: string | null; created_at: string; view_count: number | null;
  }>(1, "stories");
  const events = pickRows<{
    id: string; host_id: string; title: string; description: string | null;
    cover_url: string | null; starts_at: string; rsvp_count: number;
  }>(2, "events");
  const communities = pickRows<{
    id: string;
    name?: string | null;
    title?: string | null;
    description: string | null;
    avatar_url?: string | null;
    icon_url?: string | null;
    members_count?: number | null;
    member_count?: number | null;
    trending_score?: number | null;
  }>(3, "communities");

  const authorIds = Array.from(new Set([
    ...reels.map((r) => r.author_id),
    ...stories.map((s) => s.author_id),
    ...events.map((e) => e.host_id),
  ].filter(Boolean)));
  const profMap = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null }>();
  if (authorIds.length > 0) {
    try {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", authorIds);
      for (const p of (profs ?? []) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]) {
        profMap.set(p.id, p);
      }
    } catch (e) {
      console.log("[fyp] profiles fetch failed", e instanceof Error ? e.message : String(e));
    }
  }

  for (const r of reels) {
    const ageH = Math.max(1, (now - new Date(r.created_at).getTime()) / 3600_000);
    const score = (r.like_count * 3 + r.comment_count * 5 + r.view_count) / Math.pow(ageH + 2, 0.6);
    const p = profMap.get(r.author_id);
    cards.push({
      id: `live-reel-${r.id}`,
      kind: "reel",
      ref_id: r.id,
      score,
      created_at: r.created_at,
      payload: {
        title: r.caption ?? "Trending reel",
        caption: r.caption,
        media_url: r.video_url,
        thumbnail_url: r.thumbnail_url,
        avatar_url: p?.avatar_url ?? null,
        username: p?.username ?? null,
        display_name: p?.display_name ?? null,
        likes: r.like_count,
        comments: r.comment_count,
        reason: "Popular this week",
      },
    });
  }

  for (const s of stories) {
    const ageH = Math.max(0.5, (now - new Date(s.created_at).getTime()) / 3600_000);
    const score = ((s.view_count ?? 0) + 8) / Math.pow(ageH + 1, 0.5);
    const p = profMap.get(s.author_id);
    cards.push({
      id: `live-story-${s.id}`,
      kind: "story",
      ref_id: s.id,
      score,
      created_at: s.created_at,
      payload: {
        title: s.caption ?? `${p?.display_name ?? p?.username ?? "Friend"}'s story`,
        caption: s.caption,
        media_url: s.media_url,
        thumbnail_url: s.media_type === "image" ? s.media_url : null,
        avatar_url: p?.avatar_url ?? null,
        username: p?.username ?? null,
        display_name: p?.display_name ?? null,
        reason: "New story",
      },
    });
  }

  for (const e of events) {
    const startMs = new Date(e.starts_at).getTime();
    const hoursUntil = Math.max(1, (startMs - now) / 3600_000);
    const score = (e.rsvp_count + 12) / Math.pow(hoursUntil + 2, 0.4);
    const p = profMap.get(e.host_id);
    cards.push({
      id: `live-event-${e.id}`,
      kind: "event",
      ref_id: e.id,
      score,
      created_at: e.starts_at,
      payload: {
        title: e.title,
        body: e.description,
        thumbnail_url: e.cover_url,
        avatar_url: p?.avatar_url ?? null,
        username: p?.username ?? null,
        display_name: p?.display_name ?? null,
        starts_at: e.starts_at,
        reason: "Upcoming event",
      },
    });
  }

  for (const c of communities) {
    const name = c.name ?? c.title ?? "Community";
    const avatar = c.avatar_url ?? c.icon_url ?? null;
    const members = c.members_count ?? c.member_count ?? 0;
    cards.push({
      id: `live-community-${c.id}`,
      kind: "community",
      ref_id: c.id,
      score: (c.trending_score ?? 0) + (members ?? 0) * 0.05,
      created_at: new Date().toISOString(),
      payload: {
        title: name,
        body: c.description,
        thumbnail_url: avatar,
        avatar_url: avatar,
        members_count: members ?? 0,
        reason: "Trending community",
      },
    });
  }

  cards.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return cards.slice(0, 40);
}

/* =========================== HASHTAGS ================================ */

export interface TrendingHashtagRow {
  tag: string;
  post_count: number;
  trending_score: number;
}

export async function listTrendingHashtags(limit: number = 12): Promise<TrendingHashtagRow[]> {
  try {
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
  } catch (e) {
    console.log("[hashtags] exception", e instanceof Error ? e.message : String(e));
    return [];
  }
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
  let rows: { suggested_user_id: string; mutual_count: number; reason: string | null; score: number }[] = [];
  try {
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
    rows = (data ?? []) as typeof rows;
  } catch (e) {
    console.log("[suggested] exception", e instanceof Error ? e.message : String(e));
    return [];
  }
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

/**
 * Rich catalog of interests grouped by category. We keep this in code so the
 * quiz always renders even if the DB seed is sparse. user_interests still
 * persist by slug in Supabase.
 */
export const INTEREST_CATALOG: InterestTopicRow[] = [
  { category: "Crypto", slug: "solana", label: "Solana", emoji: "\u{1FA90}" },
  { category: "Crypto", slug: "memecoins", label: "Memecoins", emoji: "\u{1F436}" },
  { category: "Crypto", slug: "defi", label: "DeFi", emoji: "\u{1F4B1}" },
  { category: "Crypto", slug: "nfts", label: "NFTs", emoji: "\u{1F5BC}\uFE0F" },
  { category: "Crypto", slug: "trading", label: "Trading", emoji: "\u{1F4C8}" },
  { category: "Crypto", slug: "airdrops", label: "Airdrops", emoji: "\u{1FA82}" },
  { category: "Crypto", slug: "onchain-data", label: "On-chain data", emoji: "\u{1F4CA}" },
  { category: "Crypto", slug: "kols", label: "KOLs", emoji: "\u{1F3AF}" },

  { category: "Markets", slug: "alpha", label: "Alpha calls", emoji: "\u{26A1}" },
  { category: "Markets", slug: "newcoins", label: "New launches", emoji: "\u{1F195}" },
  { category: "Markets", slug: "runners", label: "Runners", emoji: "\u{1F3C3}" },
  { category: "Markets", slug: "whales", label: "Whale moves", emoji: "\u{1F40B}" },
  { category: "Markets", slug: "narratives", label: "Narratives", emoji: "\u{1F9E0}" },

  { category: "Culture", slug: "memes", label: "Memes", emoji: "\u{1F606}" },
  { category: "Culture", slug: "art", label: "Art", emoji: "\u{1F3A8}" },
  { category: "Culture", slug: "music", label: "Music", emoji: "\u{1F3B5}" },
  { category: "Culture", slug: "fashion", label: "Fashion", emoji: "\u{1F457}" },
  { category: "Culture", slug: "film", label: "Film & TV", emoji: "\u{1F3AC}" },
  { category: "Culture", slug: "sports", label: "Sports", emoji: "\u{26BD}" },

  { category: "Tech", slug: "ai", label: "AI", emoji: "\u{1F916}" },
  { category: "Tech", slug: "startups", label: "Startups", emoji: "\u{1F680}" },
  { category: "Tech", slug: "founders", label: "Founders", emoji: "\u{1F9D1}\u200D\u{1F4BB}" },
  { category: "Tech", slug: "dev", label: "Dev", emoji: "\u{1F4BB}" },
  { category: "Tech", slug: "design", label: "Design", emoji: "\u{1F3A8}" },
  { category: "Tech", slug: "gaming", label: "Gaming", emoji: "\u{1F3AE}" },

  { category: "Lifestyle", slug: "fitness", label: "Fitness", emoji: "\u{1F3CB}\uFE0F" },
  { category: "Lifestyle", slug: "food", label: "Food", emoji: "\u{1F35C}" },
  { category: "Lifestyle", slug: "travel", label: "Travel", emoji: "\u{2708}\uFE0F" },
  { category: "Lifestyle", slug: "mindset", label: "Mindset", emoji: "\u{1F9D8}" },
  { category: "Lifestyle", slug: "finance", label: "Personal finance", emoji: "\u{1F4B0}" },

  { category: "News", slug: "news", label: "World news", emoji: "\u{1F4F0}" },
  { category: "News", slug: "politics", label: "Politics", emoji: "\u{1F3DB}\uFE0F" },
  { category: "News", slug: "science", label: "Science", emoji: "\u{1F52C}" },
  { category: "News", slug: "space", label: "Space", emoji: "\u{1F680}" },
];

export async function listInterestTopics(): Promise<InterestTopicRow[]> {
  // DB schema diverged from the typed columns we use in code (emoji/category),
  // so we ship the canonical catalog from code. Still attempt a remote pull
  // for any extra topics curators add later — but ignore failures.
  try {
    const { data } = await supabase.from("interest_topics").select("slug,label");
    const remote = (data ?? []) as { slug: string; label: string }[];
    const known = new Set(INTEREST_CATALOG.map((t) => t.slug));
    const extras: InterestTopicRow[] = remote
      .filter((r) => !known.has(r.slug))
      .map((r) => ({ slug: r.slug, label: r.label, emoji: null, category: "More" }));
    return [...INTEREST_CATALOG, ...extras];
  } catch {
    return INTEREST_CATALOG;
  }
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
  // Ensure topic rows exist first (FK target). The code catalog can include
  // slugs that aren't seeded in the `interest_topics` table.
  if (slugs.length > 0) {
    const catalog = new Map(INTEREST_CATALOG.map((t) => [t.slug, t]));
    const topicRows = slugs.map((s) => {
      const t = catalog.get(s);
      return { slug: s, label: t?.label ?? s };
    });
    const { error: upsertErr } = await supabase
      .from("interest_topics")
      .upsert(topicRows, { onConflict: "slug" });
    if (upsertErr) console.log("[interests] topic upsert failed", upsertErr.message);
  }
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
