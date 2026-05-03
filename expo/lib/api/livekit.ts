import { supabase } from "@/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const LIVEKIT_URL: string = process.env.EXPO_PUBLIC_LIVEKIT_URL ?? "";

type LiveKitTokenResponse = Partial<LiveKitToken> & {
  accessToken?: string;
  jwt?: string;
  livekitToken?: string;
  serverUrl?: string;
  wsUrl?: string;
  livekitUrl?: string;
};

export type LiveKitToken = {
  token: string;
  url: string;
  room: string;
  identity: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  try {
    const { data } = await supabase.auth.getSession();
    headers.Authorization = `Bearer ${data.session?.access_token ?? SUPABASE_ANON_KEY}`;
  } catch {
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return headers;
}

function normalizeToken(json: LiveKitTokenResponse, params: { room: string; identity: string }): LiveKitToken {
  return {
    token: json.token ?? json.accessToken ?? json.jwt ?? json.livekitToken ?? "",
    url: json.url ?? json.serverUrl ?? json.wsUrl ?? json.livekitUrl ?? LIVEKIT_URL,
    room: json.room ?? params.room,
    identity: json.identity ?? params.identity,
  };
}

function previewToken(params: { room: string; identity: string }): LiveKitToken {
  const safeRoom = encodeURIComponent(params.room);
  const safeIdentity = encodeURIComponent(params.identity);
  return {
    token: `preview.${safeRoom}.${safeIdentity}.${Date.now()}`,
    url: LIVEKIT_URL,
    room: params.room,
    identity: params.identity,
  };
}

async function postToken(endpoint: "livekit-token" | "voice-token", params: {
  room: string;
  identity: string;
  name?: string;
}): Promise<LiveKitToken> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Voice backend is not configured yet.");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${endpoint} ${res.status}: ${text || "request failed"}`);
  }
  try {
    return normalizeToken(JSON.parse(text) as LiveKitTokenResponse, params);
  } catch {
    throw new Error(`${endpoint} returned an invalid token response.`);
  }
}

export async function getLiveKitToken(params: {
  room: string;
  identity: string;
  name?: string;
}): Promise<LiveKitToken> {
  const endpoints = ["livekit-token", "voice-token"] as const;
  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const token = await postToken(endpoint, params);
      if (token.token) return token;
      errors.push(`${endpoint}: empty token`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `${endpoint}: request failed`);
    }
  }

  console.log("[livekit] token fallback", errors.join(" | "));
  return previewToken(params);
}
