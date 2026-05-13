import { supabase } from "@/lib/supabase";

export type TeamStatusRole =
  | "owner"
  | "superadmin"
  | "admin"
  | "moderator"
  | "team"
  | "support"
  | null;

export interface TeamStatus {
  isTeam: boolean;
  role: TeamStatusRole;
  permissions: Record<string, unknown>;
}

const TEAM_ROLES: ReadonlyArray<NonNullable<TeamStatusRole>> = [
  "owner",
  "superadmin",
  "admin",
  "moderator",
  "team",
  "support",
];

/**
 * Resolves the current signed-in user's admin/team role via the
 * `get_my_admin_role()` SECURITY DEFINER RPC. Bypasses RLS so a freshly
 * promoted moderator can unlock the Team Dashboard without restarting.
 *
 * Call on app load and after login. The result also drives the
 * AdminProvider (`useAdmin()`), which is the preferred way to read this
 * state inside React components.
 */
export const checkTeamStatus = async (): Promise<TeamStatus> => {
  const { data, error } = await supabase.rpc("get_my_admin_role");

  if (error) {
    console.log("[checkTeamStatus] Failed to fetch admin role:", error.message);
    return { isTeam: false, role: null, permissions: {} };
  }

  const adminRole = Array.isArray(data) ? data[0] : null;
  const rawRole = (adminRole?.role ?? null) as TeamStatusRole;
  const role: TeamStatusRole =
    rawRole && TEAM_ROLES.includes(rawRole as NonNullable<TeamStatusRole>)
      ? rawRole
      : null;
  const permissions: Record<string, unknown> =
    adminRole?.permissions && typeof adminRole.permissions === "object"
      ? (adminRole.permissions as Record<string, unknown>)
      : {};
  const isTeam = !!role;

  return { isTeam, role, permissions };
};

export default checkTeamStatus;
