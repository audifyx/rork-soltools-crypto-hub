export function getCreatedAtCursor<T extends { created_at?: string | null; createdAt?: string | number | null }>(
  rows: T[],
): string | null {
  const last = rows[rows.length - 1];
  if (!last) return null;

  if (typeof last.created_at === "string") return last.created_at;
  if (last.createdAt) return new Date(last.createdAt).toISOString();

  return null;
}

export function hasFullNextPage<T>(rows: T[], limit: number): boolean {
  return rows.length >= limit;
}
