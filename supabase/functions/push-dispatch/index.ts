// Drains notification_dispatch_queue and sends Expo push notifications.
// Invoke via cron / scheduled function call, or manually from the client
// after producing a notification (best-effort, deduplicated by queue).
//
// Auth: service role (cron) OR an authenticated user. Authenticated users
// only get a "kick" — the function will drain up to a small batch.

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

interface QueueRow {
  queue_id: string;
  notification_id: string | null;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  tokens: string[];
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function sendExpoBatch(
  messages: { to: string; title: string; body: string; data: Record<string, unknown>; sound: "default"; channelId?: string }[],
): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`expo push http ${res.status}: ${text.slice(0, 200)}`);
  }
  const payload = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[] };
  return payload.data ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Missing Supabase env" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // accept either service role or any authenticated caller (it's just a kick)
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const isServiceRole = auth === serviceKey;
  if (!isServiceRole) {
    const { data, error } = await admin.auth.getUser(auth);
    if (error || !data.user) return json({ error: "Unauthorized" }, 401);
  }

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const batchSize = Math.max(1, Math.min(200, Number(body.limit ?? 50)));

  try {
    const { data, error } = await admin.rpc("claim_notification_dispatch_batch", { p_limit: batchSize });
    if (error) throw error;
    const rows = (data ?? []) as QueueRow[];
    if (rows.length === 0) return json({ ok: true, processed: 0 });

    const messages: { to: string; title: string; body: string; data: Record<string, unknown>; sound: "default"; channelId?: string }[] = [];
    const ownerByIndex: { queueId: string; token: string }[] = [];

    for (const row of rows) {
      if (!row.tokens || row.tokens.length === 0) {
        await admin.rpc("mark_notification_dispatch_delivered", { p_queue_id: row.queue_id, p_error: null }).catch(() => {});
        continue;
      }
      for (const token of row.tokens) {
        if (!token) continue;
        messages.push({
          to: token,
          title: row.title,
          body: row.body,
          sound: "default",
          channelId: "default",
          data: { ...row.data, queueId: row.queue_id },
        });
        ownerByIndex.push({ queueId: row.queue_id, token });
      }
    }

    let tickets: ExpoTicket[] = [];
    if (messages.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < messages.length; i += CHUNK) {
        const slice = messages.slice(i, i + CHUNK);
        try {
          const part = await sendExpoBatch(slice);
          tickets = tickets.concat(part);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          for (let j = 0; j < slice.length; j++) tickets.push({ status: "error", message: msg });
        }
      }
    }

    const successQueueIds = new Set<string>();
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const owner = ownerByIndex[i];
      if (!owner) continue;
      if (ticket.status === "ok") {
        successQueueIds.add(owner.queueId);
      } else {
        const code = ticket.details?.error ?? "";
        if (code === "DeviceNotRegistered" || code === "InvalidCredentials") {
          await admin.rpc("disable_invalid_push_token", { p_token: owner.token }).catch(() => {});
        }
        await admin
          .rpc("mark_notification_dispatch_delivered", {
            p_queue_id: owner.queueId,
            p_error: (ticket.message ?? code ?? "expo error").slice(0, 240),
          })
          .catch(() => {});
      }
    }

    for (const queueId of successQueueIds) {
      await admin.rpc("mark_notification_dispatch_delivered", { p_queue_id: queueId, p_error: null }).catch(() => {});
    }

    return json({ ok: true, processed: rows.length, pushes: messages.length, ok_pushes: successQueueIds.size });
  } catch (error) {
    console.error("[push-dispatch]", error instanceof Error ? error.message : error);
    return json({ error: "Push dispatch failed" }, 500);
  }
});
