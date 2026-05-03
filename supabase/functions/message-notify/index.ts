import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Json = Record<string, unknown>;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return json({ error: "Missing Supabase env" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Json;
    const conversationId = String(body.conversationId ?? "");
    const messageId = String(body.messageId ?? "");
    if (!conversationId || !messageId) return json({ error: "conversationId and messageId required" }, 400);

    const { data: participant } = await supabase
      .from("dm_participants")
      .select("conversation_id,user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!participant) return json({ error: "Forbidden" }, 403);

    const { data: recipients, error } = await supabase
      .from("dm_participants")
      .select("user_id, muted, hidden_at")
      .eq("conversation_id", conversationId)
      .neq("user_id", userData.user.id)
      .is("hidden_at", null);
    if (error) throw error;

    // Push provider wiring can attach here later. For now this edge function is
    // the secure server-side fanout point and returns eligible recipients.
    return json({ ok: true, recipients: (recipients ?? []).filter((r) => !r.muted).map((r) => r.user_id) });
  } catch (error) {
    console.error("[message-notify]", error instanceof Error ? error.message : error);
    return json({ error: "Message notify failed" }, 500);
  }
});
