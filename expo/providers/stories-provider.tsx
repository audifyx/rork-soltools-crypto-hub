import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { supabase } from "@/lib/supabase";
import { uploadStoryMedia } from "@/lib/upload";
import { useAuth } from "@/providers/auth-provider";

export interface Story {
  id: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  verified: boolean;
  mediaUrl: string;
  caption: string | null;
  viewsCount: number;
  createdAt: number;
  expiresAt: number;
  viewedByMe: boolean;
}

/** Stories grouped by author for the home rail. */
export interface StoryGroup {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  verified: boolean;
  stories: Story[];
  hasUnseen: boolean;
  latestAt: number;
}

export interface StoryViewer {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  verified: boolean;
  viewedAt: number;
}

type StoryRow = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  verified: boolean | null;
  media_url: string;
  caption: string | null;
  views_count: number | null;
  created_at: string;
  expires_at: string;
  viewed_by_me: boolean | null;
};

function rowToStory(r: StoryRow): Story {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    avatarColor: r.avatar_color,
    verified: !!r.verified,
    mediaUrl: r.media_url,
    caption: r.caption,
    viewsCount: Number(r.views_count ?? 0),
    createdAt: new Date(r.created_at).getTime(),
    expiresAt: new Date(r.expires_at).getTime(),
    viewedByMe: !!r.viewed_by_me,
  };
}

export const [StoriesProvider, useStories] = createContextHook(() => {
  const qc = useQueryClient();
  const { userId, isAuthenticated } = useAuth();

  const storiesQ = useQuery<Story[]>({
    queryKey: ["stories", "active", userId ?? "guest"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("list_active_stories", {
          max_rows: 200,
        });
        if (error) throw error;
        return ((data ?? []) as StoryRow[]).map(rowToStory);
      } catch (e) {
        console.log("[stories] list failed", e);
        return [];
      }
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  const stories = storiesQ.data ?? [];

  const groups = useMemo<StoryGroup[]>(() => {
    const byUser = new Map<string, StoryGroup>();
    for (const s of stories) {
      const g = byUser.get(s.userId);
      if (g) {
        g.stories.push(s);
        if (s.createdAt > g.latestAt) g.latestAt = s.createdAt;
        if (!s.viewedByMe) g.hasUnseen = true;
      } else {
        byUser.set(s.userId, {
          userId: s.userId,
          username: s.username,
          displayName: s.displayName,
          avatarUrl: s.avatarUrl,
          avatarColor: s.avatarColor,
          verified: s.verified,
          stories: [s],
          hasUnseen: !s.viewedByMe,
          latestAt: s.createdAt,
        });
      }
    }
    for (const g of byUser.values()) {
      g.stories.sort((a, b) => a.createdAt - b.createdAt);
    }
    return Array.from(byUser.values()).sort((a, b) => {
      // Self always pinned to front handled at consumer; here, unseen first.
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.latestAt - a.latestAt;
    });
  }, [stories]);

  const myGroup = useMemo<StoryGroup | undefined>(
    () => (userId ? groups.find((g) => g.userId === userId) : undefined),
    [groups, userId],
  );

  const otherGroups = useMemo<StoryGroup[]>(
    () => (userId ? groups.filter((g) => g.userId !== userId) : groups),
    [groups, userId],
  );

  const postStoryMut = useMutation({
    mutationFn: async (input: { uri: string; caption?: string }) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to post a story");
      const url = await uploadStoryMedia(userId, input.uri);
      const { data, error } = await supabase
        .from("stories")
        .insert({
          user_id: userId,
          media_url: url,
          caption: input.caption?.trim() || null,
        })
        .select(
          "id,user_id,media_url,caption,views_count,created_at,expires_at",
        )
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories", "active"] });
    },
  });

  const deleteStoryMut = useMutation({
    mutationFn: async (storyId: string) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in required");
      const { data, error } = await supabase.rpc("delete_my_story", {
        target_story_id: storyId,
      });
      if (error) throw error;
      return !!data;
    },
    onMutate: (storyId: string) => {
      const key = ["stories", "active", userId ?? "guest"];
      const prev = qc.getQueryData<Story[]>(key);
      if (prev) qc.setQueryData<Story[]>(key, prev.filter((s) => s.id !== storyId));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const key = ["stories", "active", userId ?? "guest"];
      const prev = (ctx as { prev?: Story[] } | undefined)?.prev;
      if (prev) qc.setQueryData(key, prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stories", "active"] });
    },
  });

  const recordView = useCallback(
    async (storyId: string) => {
      if (!isAuthenticated || !userId) return;
      try {
        const { data, error } = await supabase.rpc("record_story_view", {
          target_story_id: storyId,
        });
        if (error) throw error;
        const newCount = typeof data === "number" ? data : Number(data ?? 0);
        const key = ["stories", "active", userId ?? "guest"];
        const prev = qc.getQueryData<Story[]>(key);
        if (prev) {
          qc.setQueryData<Story[]>(
            key,
            prev.map((s) =>
              s.id === storyId
                ? { ...s, viewedByMe: true, viewsCount: Math.max(s.viewsCount, newCount) }
                : s,
            ),
          );
        }
      } catch (e) {
        console.log("[stories] record view failed", e);
      }
    },
    [isAuthenticated, userId, qc],
  );

  const useViewers = (storyId: string | undefined) =>
    useQuery<StoryViewer[]>({
      queryKey: ["stories", "viewers", storyId ?? ""],
      queryFn: async () => {
        if (!storyId) return [];
        try {
          const { data, error } = await supabase.rpc("list_story_viewers", {
            target_story_id: storyId,
          });
          if (error) throw error;
          return ((data ?? []) as Array<{
            user_id: string;
            username: string | null;
            display_name: string | null;
            avatar_url: string | null;
            avatar_color: string | null;
            verified: boolean | null;
            viewed_at: string;
          }>).map((r) => ({
            userId: r.user_id,
            username: r.username,
            displayName: r.display_name,
            avatarUrl: r.avatar_url,
            avatarColor: r.avatar_color,
            verified: !!r.verified,
            viewedAt: new Date(r.viewed_at).getTime(),
          }));
        } catch (e) {
          console.log("[stories] viewers fetch failed", e);
          return [];
        }
      },
      enabled: !!storyId,
      staleTime: 10_000,
    });

  return useMemo(
    () => ({
      stories,
      groups,
      myGroup,
      otherGroups,
      isLoading: storiesQ.isLoading,
      isPosting: postStoryMut.isPending,
      isDeleting: deleteStoryMut.isPending,
      postStory: postStoryMut.mutateAsync,
      deleteStory: deleteStoryMut.mutateAsync,
      recordView,
      useViewers,
      refetch: storiesQ.refetch,
    }),
    [
      stories,
      groups,
      myGroup,
      otherGroups,
      storiesQ.isLoading,
      storiesQ.refetch,
      postStoryMut.isPending,
      postStoryMut.mutateAsync,
      deleteStoryMut.isPending,
      deleteStoryMut.mutateAsync,
      recordView,
    ],
  );
});
