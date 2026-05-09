import type { QueryClient } from "@tanstack/react-query";

export const socialQueryKeys = {
  notifications: ["notifications"] as const,
  notificationUnread: ["notifications", "unread-count"] as const,
  social: ["social"] as const,
  communities: ["social", "communities"] as const,
  memberships: ["social", "memberships"] as const,
  spaces: ["social", "spaces"] as const,
  profile: ["profile"] as const,
  profileActivity: ["profile", "activity"] as const,
  posts: ["posts"] as const,
  feed: ["feed"] as const,
};

export async function invalidateSocialCore(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.social }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.profile }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.feed }),
  ]);
}

export async function invalidateSocialPostAction(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.posts }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.feed }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.profileActivity }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.notifications }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.notificationUnread }),
  ]);
}

export async function invalidateNotificationState(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.notifications }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.notificationUnread }),
  ]);
}

export async function invalidateProfileState(queryClient: QueryClient, userId?: string | null) {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.profile }),
    queryClient.invalidateQueries({ queryKey: socialQueryKeys.profileActivity }),
    userId
      ? queryClient.invalidateQueries({ queryKey: ["profile", userId] })
      : Promise.resolve(),
  ]);
}
