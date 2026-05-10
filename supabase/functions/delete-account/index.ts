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
    const tables = [
      "posts",
      "comments",
      "post_likes",
      "post_reposts",
      "follows",
      "notifications",
      "dm_participants",
      "community_members",
      "watchlist",
      "alerts",
      "tracked_wallets",
      "user_badges",
      "profiles",
    ];
    await Promise.all(
      tables.map(async (t) => {
        try {
          // Common ownership column names
          await admin.from(t).delete().eq("user_id", userId);
        } catch {
          /* ignore */
        }
      }),
    );
    try {
      await admin.from("follows").delete().eq("follower_id", userId);
    } catch {
      /* ignore */
    }
    try {
      await admin.from("follows").delete().eq("following_id", userId);
    } catch {
      /* ignore */
    }

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
