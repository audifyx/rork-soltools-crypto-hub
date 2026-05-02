import { supabase } from "@/lib/supabase";

export type ProfilePatch = Record<string, string | number | boolean | null | unknown[]>;

/**
 * Fetches the signed-in user's profile whether the database keys rows by
 * `user_id` or by `id`. Older migrations in this project used both patterns.
 */
export async function fetchOwnProfileRow<T>(userId: string, select: string): Promise<T | null> {
  const byUser = await supabase
    .from("profiles")
    .select(select)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!byUser.error && byUser.data) return byUser.data as T;

  const byId = await supabase
    .from("profiles")
    .select(select)
    .eq("id", userId)
    .limit(1)
    .maybeSingle();
  if (!byId.error) return (byId.data as T | null) ?? null;

  throw byUser.error ?? byId.error;
}

/**
 * Saves only the provided profile fields and supports both profile key layouts.
 */
export async function saveOwnProfilePatch(userId: string, patch: ProfilePatch): Promise<void> {
  const updateByUser = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!updateByUser.error && updateByUser.data) return;

  const updateById = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!updateById.error && updateById.data) return;

  const upsertByUser = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (!upsertByUser.error) return;

  const upsertById = await supabase
    .from("profiles")
    .upsert({ id: userId, user_id: userId, ...patch }, { onConflict: "id" });
  if (upsertById.error) throw upsertById.error;
}
