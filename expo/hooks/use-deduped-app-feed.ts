import { useMemo } from "react";

import { dedupeFeed } from "@/lib/feed-dedupe";
import { useApp, type UserPost } from "@/providers/app-provider";

type FeedPost = UserPost & { createdAt: number };

export function useDedupedAppFeed() {
  const app = useApp();

  const posts = useMemo(() => {
    return dedupeFeed(
      app.posts.map((post) => ({
        ...post,
        createdAt: post.createdAt,
      })) satisfies FeedPost[],
    );
  }, [app.posts]);

  return {
    ...app,
    posts,
  };
}
