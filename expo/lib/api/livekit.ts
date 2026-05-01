import { supabase } from "@/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const LIVEKIT_URL: string = process.env.EXPO_PUBLIC_LIVEKIT_URL ?? "";

export type LiveKitToken = {
  token: string;
  url: string;
  room: string;
  identity: string;
};

export async function getLiveKitToken(params: {
  room: string;
  identity: string;
  name?: string;
}): Promise<LiveKitToken> {
  const url = `${SUPABASE_URL}/functions/v1/livekit-token`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  try {
    const { data } = await supabase.auth.getSession();
    headers["Authorization"] = `Bearer ${data.session?.access_token ?? SUPABASE_ANON_KEY}`;
  } catch {
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  console.log("[livekit] requesting token", params);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`livekit-token ${res.status}: ${t}`);
  }
  const json = (await res.json()) as Partial<LiveKitToken>;
  return {
    token: json.token ?? "",
    url: json.url ?? LIVEKIT_URL,
    room: json.room ?? params.room,
    identity: json.identity ?? params.identity,
  };
}
