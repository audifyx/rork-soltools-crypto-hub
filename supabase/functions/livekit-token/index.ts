import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.15.1";

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

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? Deno.env.get("EXPO_PUBLIC_LIVEKIT_URL") ?? "";
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY") ?? "";
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

    if (!supabaseUrl || !serviceKey) return json({ error: "Missing Supabase env" }, 500);
    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      return json({ error: "Missing LiveKit env" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Json;
    const requestedRoom = cleanString(body.room ?? body.roomName ?? body.room_name);
    const requestedIdentity = cleanString(body.identity ?? body.participantIdentity, userData.user.id);
    const requestedName = cleanString(body.name ?? body.participantName, requestedIdentity);

    if (!requestedRoom) return json({ error: "room is required" }, 400);
    if (requestedIdentity !== userData.user.id) return json({ error: "identity must match authenticated user" }, 403);

    const { data: roomRow, error: roomError } = await supabase
      .from("livekit_rooms")
      .select("id,host_id,livekit_room_name,is_active,status,ended_at")
      .or(`id.eq.${requestedRoom},livekit_room_name.eq.${requestedRoom}`)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!roomRow) return json({ error: "Space not found" }, 404);
    if (roomRow.ended_at || roomRow.status === "ended" || roomRow.status === "cancelled") {
      return json({ error: "Space is closed" }, 410);
    }
    if (!roomRow.is_active && roomRow.host_id !== userData.user.id) {
      return json({ error: "Space is not live yet" }, 403);
    }

    const roomId = String(roomRow.id);
    const livekitRoomName = String(roomRow.livekit_room_name || requestedRoom);

    await supabase.rpc("join_space", { target_room_id: roomId });

    const { data: participant } = await supabase
      .from("livekit_participants")
      .select("role,muted,display_name")
      .eq("room_id", roomId)
      .eq("user_id", userData.user.id)
      .is("left_at", null)
      .maybeSingle();

    const role = String(participant?.role ?? (roomRow.host_id === userData.user.id ? "host" : "listener"));
    const canPublish = role === "host" || role === "co-host" || role === "speaker";
    const tokenName = cleanString(participant?.display_name, requestedName);

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: userData.user.id,
      name: tokenName,
      ttl: 60 * 60 * 6,
      metadata: JSON.stringify({ roomId, role }),
    });
    accessToken.addGrant({
      roomJoin: true,
      room: livekitRoomName,
      canSubscribe: true,
      canPublish,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });
    const token = await accessToken.toJwt();

    return json({
      success: true,
      token,
      accessToken: token,
      url: livekitUrl,
      serverUrl: livekitUrl,
      livekitUrl,
      room: livekitRoomName,
      roomId,
      identity: userData.user.id,
      name: tokenName,
      role,
      canPublish,
    });
  } catch (error) {
    console.error("[livekit-token]", error instanceof Error ? error.message : error);
    return json({ error: "LiveKit token failed" }, 500);
  }
});
