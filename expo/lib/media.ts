/**
 * Normalizes user-provided/public media URLs before rendering or storing in app state.
 * Empty strings from SQL/RPCs should behave like missing images.
 */
export function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}
