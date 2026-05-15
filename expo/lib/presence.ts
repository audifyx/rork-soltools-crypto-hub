/**
 * Shared presence helpers for online / offline / last-seen status.
 *
 * Treats a user as "online" only when the server flag is true AND the
 * last heartbeat is fresh. This avoids the common stuck-online case where
 * an app was killed before the offline write landed.
 */
export const ONLINE_FRESH_MS = 90_000; // 90s — heartbeat runs every 45s

export function isFreshOnline(
  online: boolean | undefined | null,
  lastSeenAt: number | null | undefined,
): boolean {
  if (!online) return false;
  if (!lastSeenAt) return true;
  return Date.now() - lastSeenAt < ONLINE_FRESH_MS;
}

/** Inline status label used inside lists ("Active now" / "5m ago" / null). */
export function presenceLabel(
  online: boolean | undefined | null,
  lastSeenAt: number | null | undefined,
): string | null {
  if (isFreshOnline(online, lastSeenAt)) return "Active now";
  if (!lastSeenAt) return null;
  const diff = Math.max(0, Date.now() - lastSeenAt);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Active just now";
  if (min < 60) return `Active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Active ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Last seen ${day}d ago`;
  return null;
}

/** Verbose status string used in DM headers ("Active now" / "offline" / etc). */
export function formatLastSeen(
  online: boolean | undefined | null,
  lastSeenAt: number | null | undefined,
): string {
  if (isFreshOnline(online, lastSeenAt)) return "Active now";
  if (!lastSeenAt) return "offline";
  const diff = Math.max(0, Date.now() - lastSeenAt);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Active just now";
  if (min < 60) return `Active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Active ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Last seen ${day}d ago`;
  return `Last seen ${new Date(lastSeenAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function lastSeenToMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}
