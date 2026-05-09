import type { QueryClient, QueryKey } from "@tanstack/react-query";

export type CacheScope = "auth" | "profile" | "social" | "feed" | "notifications" | "messages";

const SCOPE_QUERY_KEYS: Record<CacheScope, QueryKey[]> = {
  auth: [["auth"], ["profile"], ["social"], ["feed"], ["notifications"], ["messages"]],
  profile: [["profile"], ["profile", "activity"]],
  social: [["social"], ["social", "communities"], ["social", "memberships"], ["social", "spaces"]],
  feed: [["feed"], ["posts"], ["social", "feed"]],
  notifications: [["notifications"], ["notifications", "unread-count"]],
  messages: [["messages"], ["threads"], ["conversations"]],
};

export async function invalidateCacheScopes(
  queryClient: QueryClient,
  scopes: CacheScope[],
) {
  const keys = scopes.flatMap((scope) => SCOPE_QUERY_KEYS[scope]);
  await Promise.allSettled(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export async function resetCacheScopes(
  queryClient: QueryClient,
  scopes: CacheScope[],
) {
  const keys = scopes.flatMap((scope) => SCOPE_QUERY_KEYS[scope]);
  await Promise.allSettled(
    keys.map((queryKey) => queryClient.resetQueries({ queryKey })),
  );
}

export async function clearSignedOutCache(queryClient: QueryClient) {
  await Promise.allSettled([
    resetCacheScopes(queryClient, ["profile", "social", "feed", "notifications", "messages"]),
    queryClient.removeQueries({ queryKey: ["profile"] }),
    queryClient.removeQueries({ queryKey: ["notifications"] }),
    queryClient.removeQueries({ queryKey: ["messages"] }),
  ]);
}

export function stableMergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  current.forEach((item) => map.set(item.id, item));
  incoming.forEach((item) => map.set(item.id, { ...map.get(item.id), ...item }));
  return Array.from(map.values());
}

export function replaceOrPrependById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const exists = items.some((item) => item.id === nextItem.id);
  if (!exists) return [nextItem, ...items];
  return items.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item));
}

export function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}
