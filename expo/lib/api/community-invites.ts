import { supabase } from "@/lib/supabase";

export interface AcceptCommunityInviteResult {
  status: string;
  communityId: string;
}

/** Accepts a persisted community invite notification and returns the joined community id. */
export async function acceptCommunityInviteNotification(
  notificationId: string,
  fallbackCommunityId: string | null | undefined,
  userId: string | null | undefined,
): Promise<AcceptCommunityInviteResult> {
  const { data, error } = await supabase.rpc("accept_community_invite", {
    p_notification_id: notificationId,
  });

  if (!error) {
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null);
    const communityId = typeof row?.community_id === "string" ? row.community_id : fallbackCommunityId;
    if (!communityId) throw new Error("invite_missing_community");
    const status = typeof row?.status === "string" ? row.status : "joined";
    return { status, communityId };
  }

  // Backward-compatible fallback for clients pointed at a Supabase project before
  // accept_community_invite has been deployed. The notification is still RLS-scoped
  // to the invited user, so we only use the target community id already delivered to them.
  if (!fallbackCommunityId || !userId) throw error;

  const { error: insertError } = await supabase
    .from("community_members")
    .insert({ community_id: fallbackCommunityId, user_id: userId });

  if (insertError && !insertError.message.toLowerCase().includes("duplicate")) {
    throw insertError;
  }

  await supabase.rpc("mark_notification_read", { p_notification_id: notificationId }).catch(() => {});
  return { status: "joined", communityId: fallbackCommunityId };
}
