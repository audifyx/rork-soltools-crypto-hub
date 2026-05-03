import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/providers/auth-provider";

export interface DMUser {
  handle: string;
  name: string;
  color: string;
  verified?: boolean;
  online?: boolean;
  bio?: string;
}

export interface DMMessage {
  id: string;
  conversationId: string;
  fromHandle: string;
  text: string;
  createdAt: number;
  type: "text" | "ticker" | "tip" | "system" | "image";
  ticker?: string;
  imageUrl?: string;
  tipAmount?: number;
  tipToken?: string;
  read: boolean;
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

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const KEY_CONVOS = "soltools.dm.convos.v1";
const KEY_MSGS = "soltools.dm.messages.v1";

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveJson<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.log("[messages] persist failed", key, e);
  }
}

export const [MessagesProvider, useMessages] = createContextHook(() => {
  const { userId } = useAuth();
  const scope = userId ?? "guest";
  const convoKey = `${KEY_CONVOS}.${scope}`;
  const msgKey = `${KEY_MSGS}.${scope}`;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [c, m] = await Promise.all([
        loadJson<Conversation[] | null>(convoKey, null),
        loadJson<DMMessage[] | null>(msgKey, null),
      ]);
      if (!alive) return;
      if (c && m) {
        setConversations(c);
        setMessages(m);
      }
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, [convoKey, msgKey]);

  const persist = useCallback(
    async (c: Conversation[], m: DMMessage[]) => {
      await Promise.all([saveJson(convoKey, c), saveJson(msgKey, m)]);
    },
    [convoKey, msgKey],
  );

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

  const totalUnread = useMemo(
    () => inbox.reduce((sum, c) => sum + c.unread, 0),
    [inbox],
  );

  const getConversation = useCallback(
    (id: string) => conversations.find((c) => c.id === id),
    [conversations],
  );

  const getMessages = useCallback(
    (id: string) =>
      messages
        .filter((m) => m.conversationId === id)
        .sort((a, b) => a.createdAt - b.createdAt),
    [messages],
  );

  const findUser = useCallback(
    (handle: string) =>
      conversations.find((c) => c.user.handle === handle)?.user,
    [conversations],
  );

  const ensureConversationWith = useCallback(
    async (user: DMUser): Promise<string> => {
      const existing = conversations.find((c) => c.user.handle === user.handle);
      if (existing) return existing.id;
      const id = `c-${user.handle.replace("@", "")}-${Date.now()}`;
      const fresh: Conversation = {
        id,
        user,
        lastMessage: "",
        lastAt: Date.now(),
        unread: 0,
        pinned: false,
        muted: false,
        request: false,
      };
      const next = [fresh, ...conversations];
      setConversations(next);
      await persist(next, messages);
      return id;
    },
    [conversations, messages, persist],
  );

  const sendMessage = useCallback(
    async (id: string, text: string, ticker?: string, imageUrl?: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 && !imageUrl) return;
      const msg: DMMessage = {
        id: makeId(),
        conversationId: id,
        fromHandle: "@you",
        text: trimmed || (imageUrl ? "Photo" : ""),
        createdAt: Date.now(),
        type: imageUrl ? "image" : ticker ? "ticker" : "text",
        ticker,
        imageUrl,
        read: true,
      };
      const nextMsgs = [...messages, msg];
      const nextConvos = conversations.map((c) =>
        c.id === id ? { ...c, lastMessage: trimmed, lastAt: msg.createdAt } : c,
      );
      setMessages(nextMsgs);
      setConversations(nextConvos);
      await persist(nextConvos, nextMsgs);
    },
    [messages, conversations, persist],
  );

  const markRead = useCallback(
    async (id: string) => {
      const target = conversations.find((c) => c.id === id);
      if (!target || target.unread === 0) return;
      const nextConvos = conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c));
      const nextMsgs = messages.map((m) =>
        m.conversationId === id ? { ...m, read: true } : m,
      );
      setConversations(nextConvos);
      setMessages(nextMsgs);
      await persist(nextConvos, nextMsgs);
    },
    [conversations, messages, persist],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const next = conversations.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c));
      setConversations(next);
      await persist(next, messages);
    },
    [conversations, messages, persist],
  );

  const toggleMute = useCallback(
    async (id: string) => {
      const next = conversations.map((c) => (c.id === id ? { ...c, muted: !c.muted } : c));
      setConversations(next);
      await persist(next, messages);
    },
    [conversations, messages, persist],
  );

  const acceptRequest = useCallback(
    async (id: string) => {
      const next = conversations.map((c) => (c.id === id ? { ...c, request: false } : c));
      setConversations(next);
      await persist(next, messages);
    },
    [conversations, messages, persist],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const nextConvos = conversations.filter((c) => c.id !== id);
      const nextMsgs = messages.filter((m) => m.conversationId !== id);
      setConversations(nextConvos);
      setMessages(nextMsgs);
      await persist(nextConvos, nextMsgs);
    },
    [conversations, messages, persist],
  );

  const suggestedUsers = useMemo<DMUser[]>(() => [], []);
  const knownUsers = useMemo<DMUser[]>(
    () => conversations.map((c) => c.user),
    [conversations],
  );

  return useMemo(
    () => ({
      hydrated,
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
      findUser,
      suggestedUsers,
      knownUsers,
    }),
    [
      hydrated,
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
      findUser,
      suggestedUsers,
      knownUsers,
    ],
  );
});
