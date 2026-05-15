import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Permanently deletes the authenticated user's account.
 *
 * The caller must send their user JWT in the Authorization header. We use the
 * service-role key to delete the auth user (which cascades to profile rows
 * via existing FK constraints) and best-effort cleanup of user-owned content.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return json({ error: "Missing Supabase env" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: authError } = await admin.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);

    const userId = userData.user.id;

    // Best-effort cleanup of user-owned rows. We swallow errors here so a
    // failure on a single table never blocks the auth user deletion below.
    const safeDelete = async (table: string, column: string) => {
      try {
        await admin.from(table).delete().eq(column, userId);
      } catch {
        /* ignore */
      }
    };

    const ownedByUserId = [
      "posts",
      "comments",
      "post_likes",
      "post_reposts",
      "community_posts",
      "community_post_likes",
      "community_post_reposts",
      "post_bookmarks",
      "notifications",
      "dm_participants",
      "community_members",
      "watchlist",
      "alerts",
      "tracked_wallets",
      "trading_wallets",
      "wallet_trades",
      "wallet_security_events",
      "user_badges",
      "credits",
      "credit_logs",
      "reels",
      "reel_likes",
      "reel_views",
      "reel_comments",
      "reel_shares",
      "story_comments",
      "story_likes",
      "story_comment_likes",
      "event_rsvps",
      "user_interests",
      "user_achievements",
      "user_streaks",
      "weekly_recaps",
      "fyp_cache",
      "feed_signals",
      "read_later",
      "feed_position",
      "pump_v5_submissions",
      "profiles",
      "admin_roles",
    ];

    await Promise.all([
      ...ownedByUserId.map((table) => safeDelete(table, "user_id")),
      safeDelete("stories", "author_id"),
      safeDelete("stories", "user_id"),
      safeDelete("communities", "owner_id"),
      safeDelete("events", "host_user_id"),
      safeDelete("events", "creator_id"),
      safeDelete("followers", "follower_id"),
      safeDelete("followers", "followee_id"),
      safeDelete("follows", "follower_id"),
      safeDelete("follows", "following_id"),
      safeDelete("post_reports", "reporter_id"),
      safeDelete("profiles", "id"),
    ]);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("[delete-account] auth delete failed", delErr.message);
      return json({ error: "Failed to delete account" }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("[delete-account]", error instanceof Error ? error.message : error);
    return json({ error: "Delete account failed" }, 500);
  }
});
