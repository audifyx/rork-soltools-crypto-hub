import type { QueryClient } from "@tanstack/react-query";

/**
 * Shape any feed/list/detail can expose so the shared patcher can
 * update likes/reposts/comments/bookmark state in one place.
 */
export interface PatchablePost {
  id: string;
  likes?: number;
  reposts?: number;
  comments?: number;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
}

export interface PostPatch {
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
  likesDelta?: number;
  repostsDelta?: number;
  commentsDelta?: number;
  likes?: number;
  reposts?: number;
  comments?: number;
}

function applyPatch<T extends PatchablePost>(post: T, patch: PostPatch): T {
  const next: T = { ...post };
  if (patch.liked !== undefined) next.liked = patch.liked;
  if (patch.reposted !== undefined) next.reposted = patch.reposted;
  if (patch.bookmarked !== undefined) next.bookmarked = patch.bookmarked;
  if (patch.likes !== undefined) next.likes = patch.likes;
  if (patch.reposts !== undefined) next.reposts = patch.reposts;
  if (patch.comments !== undefined) next.comments = patch.comments;
  if (patch.likesDelta && next.likes !== undefined) {
    next.likes = Math.max(0, (next.likes ?? 0) + patch.likesDelta);
  }
  if (patch.repostsDelta && next.reposts !== undefined) {
    next.reposts = Math.max(0, (next.reposts ?? 0) + patch.repostsDelta);
  }
  if (patch.commentsDelta && next.comments !== undefined) {
    next.comments = Math.max(0, (next.comments ?? 0) + patch.commentsDelta);
  }
  return next;
}

/**
 * Walk every cached query and return the first matching post snapshot for
 * `postId`. Used by toggle handlers so optimistic state mirrors whatever the
 * UI is actually rendering (community feeds, live feed, FYP, detail, etc.).
 */
export function findPostEverywhere(
  qc: import("@tanstack/react-query").QueryClient,
  postId: string,
): PatchablePost | null {
  const entries = qc.getQueryCache().getAll();
  for (const entry of entries) {
    const data = entry.state.data;
    if (data == null) continue;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (looksLikePost(item) && item.id === postId) return item;
      }
      continue;
    }
    if (looksLikePost(data) && (data as PatchablePost).id === postId) {
      return data as PatchablePost;
    }
    if (typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (Array.isArray(record.pages)) {
        for (const page of record.pages as unknown[]) {
          if (Array.isArray(page)) {
            for (const item of page) {
              if (looksLikePost(item) && item.id === postId) return item;
            }
          } else if (page && typeof page === "object") {
            const items = (page as Record<string, unknown>).items;
            if (Array.isArray(items)) {
              for (const item of items) {
                if (looksLikePost(item) && item.id === postId) return item;
              }
            }
          }
        }
      }
      if (Array.isArray(record.items)) {
        for (const item of record.items as unknown[]) {
          if (looksLikePost(item) && item.id === postId) return item;
        }
      }
    }
  }
  return null;
}

function looksLikePost(value: unknown): value is PatchablePost {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return false;
  return (
    "likes" in v ||
    "reposts" in v ||
    "comments" in v ||
    "liked" in v ||
    "reposted" in v ||
    "bookmarked" in v
  );
}

/**
 * Walk every cached query in the React Query client and update any object
 * whose `id` matches `postId` and that looks like a post (has likes/reposts/
 * comments/liked fields). This keeps community feeds, home feed, following
 * feed, FYP, post detail, profile activity, posts-feed and replies in sync
 * without each surface needing custom plumbing.
 */
export function patchPostEverywhere(
  qc: QueryClient,
  postId: string,
  patch: PostPatch,
): void {
  const entries = qc.getQueryCache().getAll();
  for (const entry of entries) {
    const data = entry.state.data;
    if (data == null) continue;
    const queryKey = entry.queryKey;

    if (Array.isArray(data)) {
      let changed = false;
      const next = data.map((item) => {
        if (looksLikePost(item) && item.id === postId) {
          changed = true;
          return applyPatch(item, patch);
        }
        return item;
      });
      if (changed) qc.setQueryData(queryKey, next);
      continue;
    }

    if (looksLikePost(data) && data.id === postId) {
      qc.setQueryData(queryKey, applyPatch(data, patch));
      continue;
    }

    // Handle nested page shapes (infinite queries) and {items,pages} containers.
    if (typeof data === "object") {
      const record = data as Record<string, unknown>;
      let changed = false;
      const nextRecord: Record<string, unknown> = { ...record };

      if (Array.isArray(record.pages)) {
        const pages = record.pages as unknown[];
        const nextPages = pages.map((page) => {
          if (Array.isArray(page)) {
            let pageChanged = false;
            const mapped = page.map((item) => {
              if (looksLikePost(item) && item.id === postId) {
                pageChanged = true;
                return applyPatch(item, patch);
              }
              return item;
            });
            if (pageChanged) {
              changed = true;
              return mapped;
            }
            return page;
          }
          if (page && typeof page === "object") {
            const pageRecord = page as Record<string, unknown>;
            if (Array.isArray(pageRecord.items)) {
              let pageChanged = false;
              const mapped = (pageRecord.items as unknown[]).map((item) => {
                if (looksLikePost(item) && item.id === postId) {
                  pageChanged = true;
                  return applyPatch(item, patch);
                }
                return item;
              });
              if (pageChanged) {
                changed = true;
                return { ...pageRecord, items: mapped };
              }
            }
          }
          return page;
        });
        if (changed) nextRecord.pages = nextPages;
      }

      if (Array.isArray(record.items)) {
        let pageChanged = false;
        const mapped = (record.items as unknown[]).map((item) => {
          if (looksLikePost(item) && item.id === postId) {
            pageChanged = true;
            return applyPatch(item, patch);
          }
          return item;
        });
        if (pageChanged) {
          changed = true;
          nextRecord.items = mapped;
        }
      }

      if (changed) qc.setQueryData(queryKey, nextRecord);
    }
  }
}
