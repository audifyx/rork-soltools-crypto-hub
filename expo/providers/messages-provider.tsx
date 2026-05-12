import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import { normalizeMediaUrl } from "@/lib/media";
import { scheduleLocalNotification, setAppBadgeCount } from "@/lib/push-notifications";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export interface DMUser {
  userId?: string;
  handle: string;
  name: string;
  color: string;
  verified?: boolean;
  online?: boolean;
  lastSeenAt?: number | null;
  bio?: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}

export interface DMReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface DMReplyContext {
  id: string;
  fromHandle: string;
  text: string;
  type: DMMessage["type"];
}

export interface DMMessage {
  id: string;
  conversationId: string;
  fromHandle: string;
  fromUserId?: string;
  text: string;
  createdAt: number;
  type: "text" | "ticker" | "tip" | "system" | "image";
  ticker?: string;
  imageUrl?: string;
  tipAmount?: number;
  tipToken?: string;
  read: boolean;
  deliveredAt?: number | null;
  readAt?: number | null;
  editedAt?: number | null;
  deletedAt?: number | null;
  replyTo?: DMReplyContext | null;
  reactions?: DMReaction[];
}

export interface Conversation {
  id: string;
  user: DMUser;
  lastMessage: string;
  lastAt: number;
  unread: number;
  pinned: boolean;
  muted: boolean;
  request: boolean;
}

interface ConversationRow {
  id: string;
  other_user_id: string | null;
  other_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  avatar_color: string | null;
  verified: boolean | null;
  bio: string | null;
  is_online: boolean | null;
  last_seen_at?: string | null;
  last_message: string | null;
  last_at: string | null;
  unread_count: number | null;
  pinned: boolean | null;
  muted: boolean | null;
  request: boolean | null;
}

interface MessageReactionRow {
  emoji: string;
  count: number | null;
  mine: boolean | null;
}

interface MessageReplyRow {
  id: string;
  sender_id: string | null;
  body: string | null;
  message_type: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  message_type: string | null;
  ticker: string | null;
  image_url: string | null;
  created_at: string;
  read?: boolean | null;
  delivered_at?: string | null;
  read_at?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to?: MessageReplyRow | null;
  reactions?: MessageReactionRow[] | null;
}

interface ProfileSuggestionRow {
  user_id?: string | null;
  id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  avatar_color?: string | null;
  verified?: boolean | null;
  bio?: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
  followers_count?: number | null;
}

const FALLBACK_COLORS = ["#38D7FF", "#55F5B2", "#F4C65B", "#FF5C8A", "#A78BFA", "#FF9F43"] as const;

function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function toMs(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : Date.now();
  return Number.isFinite(t) ? t : Date.now();
}

function cleanHandle(username: string | null | undefined, fallbackId: string | null | undefined): string {
  const clean = username?.replace(/^@/, "").trim();
  return clean ? `@${clean}` : `@${(fallbackId ?? "user").slice(0, 8)}`;
}

function normalizeMessageType(value: string | null | undefined): DMMessage["type"] {
  if (value === "ticker" || value === "tip" || value === "system" || value === "image") return value;
  return "text";
}

function userFromConversationRow(row: ConversationRow): DMUser {
  const userId = row.other_user_id ?? undefined;
  const handle = cleanHandle(row.other_username, row.other_user_id);
  return {
    userId,
    handle,
    name: row.display_name ?? row.other_username ?? handle,
    color: row.avatar_color ?? hashColor(userId ?? handle),
    verified: !!row.verified,
    online: !!row.is_online,
    lastSeenAt: row.last_seen_at ? toMs(row.last_seen_at) : null,
    bio: row.bio ?? undefined,
    avatarUrl: normalizeMediaUrl(row.avatar_url),
    bannerUrl: normalizeMediaUrl(row.banner_url ?? null),
  };
}

function userFromProfileRow(row: ProfileSuggestionRow): DMUser | null {
  const userId = row.user_id ?? row.id ?? null;
  if (!userId) return null;
  const handle = cleanHandle(row.username, userId);
  return {
    userId,
    handle,
    name: row.display_name ?? row.username ?? handle,
    color: row.avatar_color ?? hashColor(userId),
    verified: !!row.verified,
    online: !!row.is_online,
    lastSeenAt: row.last_seen_at ? toMs(row.last_seen_at) : null,
    bio: row.bio ?? undefined,
    avatarUrl: normalizeMediaUrl(row.avatar_url ?? null),
    bannerUrl: normalizeMediaUrl(row.banner_url ?? null),
  };
}

function conversationFromRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    user: userFromConversationRow(row),
    lastMessage: row.last_message ?? "",
    lastAt: toMs(row.last_at),
    unread: Number(row.unread_count ?? 0),
    pinned: !!row.pinned,
    muted: !!row.muted,
    request: !!row.request,
  };
}

function messageFromRow(row: MessageRow, currentUserId: string | null, user?: DMUser): DMMessage {
  const mine = row.sender_id === currentUserId;
  const type = normalizeMessageType(row.message_type);
  const deliveredAt = row.delivered_at ? toMs(row.delivered_at) : null;
  const readAt = row.read_at ? toMs(row.read_at) : null;
  const editedAt = row.edited_at ? toMs(row.edited_at) : null;
  const deletedAt = row.deleted_at ? toMs(row.deleted_at) : null;
  const replyRow = row.reply_to ?? null;
  const replyTo: DMReplyContext | null = replyRow
    ? {
        id: replyRow.id,
        fromHandle:
          replyRow.sender_id && replyRow.sender_id === currentUserId
            ? "@you"
            : user?.handle ?? `@${(replyRow.sender_id ?? "user").slice(0, 8)}`,
        text: replyRow.body ?? "",
        type: normalizeMessageType(replyRow.message_type),
      }
    : null;
  const reactions: DMReaction[] = (row.reactions ?? [])
    .filter((r) => !!r && typeof r.emoji === "string")
    .map((r) => ({ emoji: r.emoji, count: Number(r.count ?? 0), mine: !!r.mine }));
  return {
    id: row.id,
    conversationId: row.conversation_id,
    fromHandle: mine ? "@you" : user?.handle ?? `@${row.sender_id.slice(0, 8)}`,
    fromUserId: row.sender_id,
    text: deletedAt ? "Message deleted" : row.body ?? (type === "image" ? "Photo" : ""),
    createdAt: toMs(row.created_at),
    type: deletedAt ? "system" : type,
    ticker: row.ticker ?? undefined,
    imageUrl: deletedAt ? undefined : row.image_url ?? undefined,
    read: !!row.read || !!readAt || mine,
    deliveredAt,
    readAt,
    editedAt,
    deletedAt,
    replyTo,
    reactions,
  };
}

async function safeRpc<T>(name: string, params?: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.rpc(name, params ?? {});
  if (error) {
    console.log(`[messages] ${name} failed`, error.message);
    return null;
  }
  return data as T;
}

/**
 * Fetches messages for a single conversation thread. Used by the DM screen
 * so a thread loads instantly without waiting on the aggregate inbox query.
 */
export function useDmThreadMessages(conversationId: string | undefined, peer?: DMUser) {
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const query = useQuery<DMMessage[]>({
    queryKey: ["messages", "thread", conversationId ?? "none", userId ?? "guest"],
    enabled: !!conversationId && isAuthenticated && !!userId,
    staleTime: 2_000,
    refetchOnMount: "always",
    refetchInterval: 8_000,
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase.rpc("list_dm_messages", {
        p_conversation_ids: [conversationId],
      });
      if (error) {
        console.log("[messages] thread fetch failed", error.message);
        return [];
      }
      return ((data ?? []) as MessageRow[])
        .map((row) => messageFromRow(row, userId, peer))
        .sort((a, b) => a.createdAt - b.createdAt);
    },
  });

  useEffect(() => {
    if (!conversationId || !isAuthenticated || !userId) return;
    const channel = supabase
      .channel(`dm-thread-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient
            .invalidateQueries({ queryKey: ["messages", "thread", conversationId, userId] })
            .catch(() => {});
          queryClient
            .invalidateQueries({ queryKey: ["messages", "conversations", userId] })
            .catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [conversationId, isAuthenticated, queryClient, userId]);

  return query;
}

export function useMessageableUsersSearch(query: string) {
  const term = query.trim();
  return useQuery<DMUser[]>({
    queryKey: ["messages", "search-users", term],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_messageable_users", {
        q: term,
        max_rows: 80,
      });
      if (error) {
        console.log("[messages] search users failed", error.message);
        return [];
      }
      return ((data ?? []) as ProfileSuggestionRow[])
        .map(userFromProfileRow)
        .filter((u): u is DMUser => !!u);
    },
  });
}

export const [MessagesProvider, useMessages] = createContextHook(() => {
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();

  const conversationsQuery = useQuery<Conversation[]>({
    queryKey: ["messages", "conversations", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    refetchInterval: 30_000,
    staleTime: 8_000,
    queryFn: async () => {
      const rows = await safeRpc<ConversationRow[]>("list_dm_conversations");
      return (rows ?? []).map(conversationFromRow);
    },
  });

  const conversations = conversationsQuery.data ?? [];
  const previousUnreadRef = useRef<Record<string, number>>({});
  const conversationIds = useMemo<string[]>(() => conversations.map((c) => c.id), [conversations]);
  const userByConversation = useMemo<Record<string, DMUser>>(
    () => Object.fromEntries(conversations.map((c) => [c.id, c.user] as const)),
    [conversations],
  );

  const messagesQuery = useQuery<DMMessage[]>({
    queryKey: ["messages", "threads", userId ?? "guest", conversationIds.join(",")],
    enabled: isAuthenticated && !!userId && conversationIds.length > 0,
    staleTime: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_dm_messages", {
        p_conversation_ids: conversationIds,
      });
      if (error) {
        console.log("[messages] thread fetch failed", error.message);
        return [];
      }
      return ((data ?? []) as MessageRow[]).map((row) => messageFromRow(row, userId, userByConversation[row.conversation_id]));
    },
  });

  const suggestedQuery = useQuery<DMUser[]>({
    queryKey: ["messages", "suggested-users", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    staleTime: 20_000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_messageable_users", {
        q: "",
        max_rows: 120,
      });
      if (error) {
        console.log("[messages] list_messageable_users failed", error.message);
        // Fallback to direct profiles read so the picker still shows something
        // when the RPC isn't deployed yet.
        const fallback = await supabase
          .from("profiles")
          .select("id,user_id,username,display_name,avatar_url,avatar_color,verified,bio,is_online,followers_count")
          .not("user_id", "eq", userId)
          .order("followers_count", { ascending: false })
          .limit(60);
        if (fallback.error) {
          console.log("[messages] fallback profiles failed", fallback.error.message);
          return [];
        }
        return ((fallback.data ?? []) as ProfileSuggestionRow[])
          .map(userFromProfileRow)
          .filter((u): u is DMUser => !!u);
      }
      return ((data ?? []) as ProfileSuggestionRow[])
        .map(userFromProfileRow)
        .filter((u): u is DMUser => !!u);
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const channel = supabase
      .channel(`dm-feed-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["notifications"] }).catch(() => {});
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_participants" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [isAuthenticated, queryClient, userId]);

  useEffect(() => {
    if (!isAuthenticated || conversations.length === 0) return;
    const previous = previousUnreadRef.current;
    const next: Record<string, number> = {};
    conversations.forEach((conversation) => {
      next[conversation.id] = conversation.unread;
      const hadUnread = previous[conversation.id] ?? 0;
      if (conversation.unread > hadUnread && !conversation.muted && AppState.currentState !== "active") {
        scheduleLocalNotification({
          title: conversation.user.name,
          body: conversation.lastMessage || "Sent you a message",
          data: { conversationId: conversation.id, route: `/dm/${conversation.id}` },
        }).catch((error: unknown) => {
          console.log("[messages] local notification skipped", error instanceof Error ? error.message : error);
        });
      }
    });
    previousUnreadRef.current = next;
  }, [conversations, isAuthenticated]);

  const inbox = useMemo<Conversation[]>(
    () =>
      conversations
        .filter((c) => !c.request)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.lastAt - a.lastAt;
        }),
    [conversations],
  );

  const requests = useMemo<Conversation[]>(
    () => conversations.filter((c) => c.request).sort((a, b) => b.lastAt - a.lastAt),
    [conversations],
  );

  const totalUnread = useMemo<number>(() => inbox.reduce((sum, c) => sum + c.unread, 0), [inbox]);

  useEffect(() => {
    setAppBadgeCount(totalUnread).catch(() => {});
  }, [totalUnread]);

  const getConversation = useCallback(
    (id: string) => conversations.find((c) => c.id === id),
    [conversations],
  );

  const getMessages = useCallback(
    (id: string) =>
      (messagesQuery.data ?? [])
        .filter((m) => m.conversationId === id)
        .sort((a, b) => a.createdAt - b.createdAt),
    [messagesQuery.data],
  );

  const findUser = useCallback(
    (handle: string) => conversations.find((c) => c.user.handle === handle)?.user,
    [conversations],
  );

  const ensureConversationWith = useCallback(
    async (user: DMUser): Promise<string> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to send messages.");
      const existing = conversations.find((c) => c.user.userId === user.userId || c.user.handle === user.handle);
      if (existing) return existing.id;
      if (!user.userId) throw new Error("This user profile is missing a messaging id.");
      const id = await safeRpc<string>("get_or_create_dm", { other_user_id: user.userId });
      if (!id) throw new Error("Could not start this conversation.");
      await queryClient.refetchQueries({ queryKey: ["messages", "conversations", userId] });
      return id;
    },
    [conversations, isAuthenticated, queryClient, userId],
  );

  const sendMutation = useMutation({
    mutationFn: async (input: { id: string; text: string; ticker?: string; imageUrl?: string; replyToId?: string }) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to send messages.");
      const trimmed = input.text.trim();
      if (trimmed.length === 0 && !input.imageUrl) return null;
      const messageId = await safeRpc<string>("send_dm_message", {
        p_conversation_id: input.id,
        p_body: trimmed || (input.imageUrl ? "Photo" : ""),
        p_ticker: input.ticker ?? null,
        p_image_url: input.imageUrl ?? null,
        p_reply_to_id: input.replyToId ?? null,
      });
      if (!messageId) throw new Error("Message failed to send.");
      return messageId;
    },
    onMutate: async (input) => {
      // Optimistic append so the bubble appears instantly even if the network is slow.
      const threadKey = ["messages", "thread", input.id, userId ?? "guest"] as const;
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previous = queryClient.getQueryData<DMMessage[]>(threadKey) ?? [];
      const trimmed = input.text.trim();
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const optimistic: DMMessage = {
        id: tempId,
        conversationId: input.id,
        fromHandle: "@you",
        fromUserId: userId ?? undefined,
        text: trimmed || (input.imageUrl ? "Photo" : ""),
        createdAt: Date.now(),
        type: input.imageUrl ? "image" : input.ticker ? "ticker" : "text",
        ticker: input.ticker,
        imageUrl: input.imageUrl,
        read: true,
        deliveredAt: null,
        readAt: null,
        editedAt: null,
        deletedAt: null,
        replyTo: null,
        reactions: [],
      };
      queryClient.setQueryData<DMMessage[]>(threadKey, [...previous, optimistic]);
      return { previous, threadKey };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.threadKey) {
        queryClient.setQueryData(ctx.threadKey, ctx.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
    },
  });

  const sendMessage = useCallback(
    async (id: string, text: string, ticker?: string, imageUrl?: string, replyToId?: string) => {
      await sendMutation.mutateAsync({ id, text, ticker, imageUrl, replyToId });
    },
    [sendMutation],
  );

  const setTyping = useCallback(
    async (conversationId: string, typing: boolean) => {
      if (!isAuthenticated || !userId) return;
      try {
        await supabase.rpc("set_dm_typing", {
          p_conversation_id: conversationId,
          p_typing: typing,
        });
      } catch (e) {
        console.log("[messages] set_dm_typing failed", e instanceof Error ? e.message : e);
      }
    },
    [isAuthenticated, userId],
  );

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to react.");
      const { error } = await supabase.rpc("toggle_dm_reaction", {
        p_message_id: messageId,
        p_emoji: emoji,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
    },
    [isAuthenticated, queryClient, userId],
  );

  const editMessage = useCallback(
    async (messageId: string, body: string) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to edit.");
      const trimmed = body.trim();
      if (!trimmed) return;
      const { error } = await supabase.rpc("edit_dm_message", {
        p_message_id: messageId,
        p_body: trimmed,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
    },
    [isAuthenticated, queryClient, userId],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to delete.");
      const { error } = await supabase.rpc("delete_dm_message", {
        p_message_id: messageId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
    },
    [isAuthenticated, queryClient, userId],
  );

  const blockUser = useCallback(
    async (otherUserId: string, reason: string = "user_blocked") => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to block.");
      const { error } = await supabase.rpc("block_dm_user", {
        p_blocked_id: otherUserId,
        p_reason: reason,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
    },
    [isAuthenticated, queryClient, userId],
  );

  const unblockUser = useCallback(
    async (otherUserId: string) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to unblock.");
      const { error } = await supabase.rpc("unblock_dm_user", {
        p_blocked_id: otherUserId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
    },
    [isAuthenticated, queryClient, userId],
  );

  const markRead = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !userId) return;
      queryClient.setQueryData<Conversation[]>(["messages", "conversations", userId], (prev) =>
        (prev ?? []).map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
      );
      await safeRpc<boolean>("mark_dm_read", { p_conversation_id: id });
      queryClient.invalidateQueries({ queryKey: ["messages", "conversations", userId] }).catch(() => {});
    },
    [isAuthenticated, queryClient, userId],
  );

  const updateParticipantFlag = useCallback(
    async (id: string, patch: { pinned?: boolean; muted?: boolean; request?: boolean; hidden_at?: string | null }) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to update messages.");
      // Optimistic update so the row reflects the change immediately even if the RPC is slow.
      queryClient.setQueryData<Conversation[]>(["messages", "conversations", userId], (prev) =>
        (prev ?? []).map((c) =>
          c.id === id
            ? {
                ...c,
                pinned: patch.pinned ?? c.pinned,
                muted: patch.muted ?? c.muted,
                request: patch.request ?? c.request,
              }
            : c,
        ),
      );
      const rpcParams: Record<string, unknown> = {
        p_conversation_id: id,
        p_pinned: patch.pinned ?? null,
        p_muted: patch.muted ?? null,
        p_request: patch.request ?? null,
        p_hidden_at: patch.hidden_at === undefined ? null : patch.hidden_at,
        p_clear_hidden: patch.hidden_at === null,
      };
      const { error: rpcError } = await supabase.rpc("set_dm_participant_flag", rpcParams);
      if (rpcError) {
        // Fallback to direct table update for older databases without the RPC deployed yet.
        const { error } = await supabase
          .from("dm_participants")
          .update(patch)
          .eq("conversation_id", id)
          .eq("user_id", userId);
        if (error) {
          await queryClient.invalidateQueries({ queryKey: ["messages"] });
          throw error;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    [isAuthenticated, queryClient, userId],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const target = conversations.find((c) => c.id === id);
      await updateParticipantFlag(id, { pinned: !(target?.pinned ?? false) });
    },
    [conversations, updateParticipantFlag],
  );

  const toggleMute = useCallback(
    async (id: string) => {
      const target = conversations.find((c) => c.id === id);
      await updateParticipantFlag(id, { muted: !(target?.muted ?? false) });
    },
    [conversations, updateParticipantFlag],
  );

  const acceptRequest = useCallback(
    async (id: string) => {
      await updateParticipantFlag(id, { request: false });
    },
    [updateParticipantFlag],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await updateParticipantFlag(id, { hidden_at: new Date().toISOString() });
    },
    [updateParticipantFlag],
  );

  const deleteConversationForEveryone = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to delete.");
      const { error } = await supabase.rpc("delete_dm_for_everyone", {
        p_conversation_id: id,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    [isAuthenticated, queryClient, userId],
  );

  const suggestedUsers = useMemo<DMUser[]>(() => {
    const existingIds = new Set(conversations.map((c) => c.user.userId).filter(Boolean));
    return (suggestedQuery.data ?? []).filter((u) => !existingIds.has(u.userId));
  }, [conversations, suggestedQuery.data]);

  const knownUsers = useMemo<DMUser[]>(() => {
    const merged = [...conversations.map((c) => c.user), ...suggestedUsers];
    const seen = new Set<string>();
    return merged.filter((u) => {
      const key = u.userId ?? u.handle;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [conversations, suggestedUsers]);

  return useMemo(
    () => ({
      hydrated: !conversationsQuery.isLoading,
      conversations,
      inbox,
      requests,
      totalUnread,
      getConversation,
      getMessages,
      ensureConversationWith,
      sendMessage,
      markRead,
      togglePin,
      toggleMute,
      acceptRequest,
      deleteConversation,
      deleteConversationForEveryone,
      findUser,
      suggestedUsers,
      knownUsers,
      setTyping,
      reactToMessage,
      editMessage,
      deleteMessage,
      blockUser,
      unblockUser,
    }),
    [
      conversationsQuery.isLoading,
      conversations,
      inbox,
      requests,
      totalUnread,
      getConversation,
      getMessages,
      ensureConversationWith,
      sendMessage,
      markRead,
      togglePin,
      toggleMute,
      acceptRequest,
      deleteConversation,
      deleteConversationForEveryone,
      findUser,
      suggestedUsers,
      knownUsers,
      setTyping,
      reactToMessage,
      editMessage,
      deleteMessage,
      blockUser,
      unblockUser,
    ],
  );
});

/** Fetches profile media (avatar + banner) for a DM peer. */
export function useDmPeerProfile(userId: string | null | undefined) {
  return useQuery<{ avatarUrl: string | null; bannerUrl: string | null; bio: string | null } | null>({
    queryKey: ["messages", "peer-profile", userId ?? "none"],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url,banner_url,bio")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.log("[messages] peer profile failed", error.message);
        return null;
      }
      return {
        avatarUrl: normalizeMediaUrl((data?.avatar_url as string | null) ?? null),
        bannerUrl: normalizeMediaUrl((data?.banner_url as string | null) ?? null),
        bio: (data?.bio as string | null) ?? null,
      };
    },
  });
}

/* ------------------------------- BLOCKING -------------------------------- */

export interface BlockedUserRow {
  blocked_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  verified: boolean | null;
  bio: string | null;
  reason: string | null;
  created_at: string;
}

/** Returns the list of users the caller has blocked. */
export function useBlockedUsers() {
  const { userId, isAuthenticated } = useAuth();
  return useQuery<BlockedUserRow[]>({
    queryKey: ["messages", "blocked", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_blocked_users");
      if (error) {
        console.log("[messages] list_blocked_users failed", error.message);
        return [];
      }
      return (data ?? []) as BlockedUserRow[];
    },
  });
}

/** Reads typing presence for a single conversation. Polls every 3s while focused. */
export function useDmTyping(conversationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["messages", "typing", conversationId ?? "none"],
    enabled: !!conversationId && enabled,
    refetchInterval: 3_000,
    staleTime: 1_500,
    queryFn: async () => {
      if (!conversationId) return [] as { user_id: string; username: string | null }[];
      const { data, error } = await supabase.rpc("list_dm_typing", {
        p_conversation_id: conversationId,
      });
      if (error) {
        console.log("[messages] list_dm_typing failed", error.message);
        return [];
      }
      return (data ?? []) as { user_id: string; username: string | null }[];
    },
  });
}
