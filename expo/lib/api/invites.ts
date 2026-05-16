/**
 * Invite system RPC wrappers backed by deployed Supabase functions/RPCs.
 */
import { supabase } from "@/lib/supabase";

export interface InviteCode {
  code: string;
  uses: number;
  max_uses: number | null;
  reward_credits: number;
  expires_at: string | null;
}

export interface InviteStats {
  total_invites: number;
  rank: number;
  reward_credits_earned: number;
}

export interface ReferralUser {
  user_id: string;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  verified: boolean;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  verified: boolean;
  invites_count: number;
  rank: number;
}

export async function getOrCreateInviteCode(): Promise<InviteCode | null> {
  const { data, error } = await supabase.rpc("generate_invite_code");
  if (error) {
    console.log("[invites] generate failed", error.message);
    throw new Error(error.message || "Could not load invite code");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return row as InviteCode;
}

export async function redeemInviteCode(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("redeem_invite_code", { p_code: code });
  if (error) throw new Error(error.message);
  return (data ?? null) as string | null;
}

export async function getMyInviteStats(): Promise<InviteStats> {
  const { data, error } = await supabase.rpc("my_invite_stats");
  if (error) {
    console.log("[invites] stats failed", error.message);
    return { total_invites: 0, rank: 0, reward_credits_earned: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total_invites: Number(row?.total_invites ?? 0),
    rank: Number(row?.rank ?? 0),
    reward_credits_earned: Number(row?.reward_credits_earned ?? 0),
  };
}

export async function listMyReferrals(limit: number = 50): Promise<ReferralUser[]> {
  const { data, error } = await supabase.rpc("list_my_referrals", { p_limit: limit });
  if (error) {
    console.log("[invites] list referrals failed", error.message);
    return [];
  }
  return (data ?? []) as ReferralUser[];
}

export async function topReferrers(limit: number = 25): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("top_referrers", { p_limit: limit });
  if (error) {
    console.log("[invites] leaderboard failed", error.message);
    return [];
  }
  return (data ?? []) as LeaderboardEntry[];
}
