import { normalizeMediaUrl } from "@/lib/media";
import { supabase } from "@/lib/supabase";

export interface BasicProfileLookup {
  id: string | null;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  verified: boolean | null;
}

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  verified?: boolean | null;
};

function mergeProfile(existing: BasicProfileLookup | undefined, incoming: BasicProfileLookup): BasicProfileLookup {
  if (!existing) return incoming;
  return {
    id: existing.id ?? incoming.id,
    user_id: existing.user_id ?? incoming.user_id,
    username: existing.username ?? incoming.username,
    display_name: existing.display_name ?? incoming.display_name,
    avatar_url: incoming.avatar_url ?? existing.avatar_url,
    avatar_color: existing.avatar_color ?? incoming.avatar_color,
    verified: existing.verified ?? incoming.verified,
  };
}

/**
 * Loads profiles keyed by either `profiles.id` or `profiles.user_id`.
 * Community posts have existed with both key layouts, so avatar hydration must
 * check both or users with uploaded profile images can incorrectly show stock art.
 */
export async function loadBasicProfilesByAnyId(ids: string[]): Promise<Map<string, BasicProfileLookup>> {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  const map = new Map<string, BasicProfileLookup>();
  if (unique.length === 0) return map;

  const select = "id,user_id,username,display_name,avatar_url,avatar_color,verified";
  const [byId, byUserId] = await Promise.all([
    supabase.from("profiles").select(select).in("id", unique),
    supabase.from("profiles").select(select).in("user_id", unique),
  ]);

  if (byId.error) console.log("[profiles] lookup by id failed", byId.error.message);
  if (byUserId.error) console.log("[profiles] lookup by user_id failed", byUserId.error.message);

  const rows = [...((byId.data ?? []) as ProfileRow[]), ...((byUserId.data ?? []) as ProfileRow[])];
  rows.forEach((row) => {
    const normalized: BasicProfileLookup = {
      id: row.id ?? null,
      user_id: row.user_id ?? null,
      username: row.username ?? null,
      display_name: row.display_name ?? null,
      avatar_url: normalizeMediaUrl(row.avatar_url),
      avatar_color: row.avatar_color ?? null,
      verified: row.verified ?? null,
    };
    const keys = [normalized.id, normalized.user_id].filter((key): key is string => !!key);
    keys.forEach((key) => map.set(key, mergeProfile(map.get(key), normalized)));
  });

  return map;
}
