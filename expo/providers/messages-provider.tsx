import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useState } from "react";

import Colors from "@/constants/colors";
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
  type: "text" | "ticker" | "tip" | "system";
  ticker?: string;
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

const SEED_USERS: DMUser[] = [
  { handle: "@cryptoking", name: "CryptoKing", color: Colors.mint, verified: true, online: true, bio: "Hunting solana memecoins · NFA" },
  { handle: "@frogwhisperer", name: "Frog", color: Colors.rose, online: true, bio: "$WIF maxi · long the frog" },
  { handle: "@whaletracker", name: "WhaleTracker", color: Colors.cyan, verified: true, online: false, bio: "Smart-money cluster scanner" },
  { handle: "@neuralnode", name: "Neural", color: Colors.violet, online: true, bio: "AI agents + onchain ML" },
  { handle: "@chartmaster", name: "ChartMaster", color: Colors.orange, verified: true, bio: "TA, lo-fi, slow scalps" },
  { handle: "@snipergpt", name: "SniperGPT", color: Colors.cyan, verified: true, online: true, bio: "Auto-buy stack engineer" },
  { handle: "@floorhunter", name: "FloorHunter", color: Colors.neon, bio: "NFT floors and PFP meta" },
  { handle: "@earlybird", name: "EarlyBird", color: Colors.orange, online: true, bio: "gm.chat founder" },
];

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function seedConversations(): { conversations: Conversation[]; messages: DMMessage[] } {
  const now = Date.now();
  const items: { user: DMUser; mins: number; preview: string; unread: number; pinned: boolean; request: boolean; thread: { from: "me" | "them"; text: string; mins: number; type?: DMMessage["type"]; ticker?: string; tipAmount?: number; tipToken?: string }[] }[] = [
    {
      user: SEED_USERS[0],
      mins: 4,
      preview: "yo check the $BONK chart",
      unread: 2,
      pinned: true,
      request: false,
      thread: [
        { from: "them", text: "gm 🌅", mins: 240 },
        { from: "me", text: "gm legend", mins: 230 },
        { from: "them", text: "you in $BONK?", mins: 60 },
        { from: "me", text: "yeh small bag", mins: 55 },
        { from: "them", text: "yo check the $BONK chart", mins: 4, type: "ticker", ticker: "$BONK" },
        { from: "them", text: "breakout incoming imo", mins: 3 },
      ],
    },
    {
      user: SEED_USERS[2],
      mins: 22,
      preview: "cluster of 4 wallets just bought $SOL",
      unread: 1,
      pinned: true,
      request: false,
      thread: [
        { from: "them", text: "tracking your wallet for the alerts pls confirm", mins: 200 },
        { from: "me", text: "confirmed 🐋", mins: 190 },
        { from: "them", text: "cluster of 4 wallets just bought $SOL", mins: 22, type: "ticker", ticker: "$SOL" },
      ],
    },
    {
      user: SEED_USERS[3],
      mins: 60,
      preview: "tipped you 0.05 SOL for the alpha",
      unread: 0,
      pinned: false,
      request: false,
      thread: [
        { from: "them", text: "your $AGNT call printed", mins: 90 },
        { from: "me", text: "told ya 🧠", mins: 80 },
        { from: "them", text: "tipped you 0.05 SOL for the alpha", mins: 60, type: "tip", tipAmount: 0.05, tipToken: "SOL" },
      ],
    },
    {
      user: SEED_USERS[1],
      mins: 180,
      preview: "raid the spaces in 30",
      unread: 0,
      pinned: false,
      request: false,
      thread: [
        { from: "them", text: "raid the spaces in 30", mins: 180 },
      ],
    },
    {
      user: SEED_USERS[4],
      mins: 60 * 24,
      preview: "TA setup on the 4h is juicy",
      unread: 0,
      pinned: false,
      request: false,
      thread: [
        { from: "them", text: "TA setup on the 4h is juicy", mins: 60 * 24 },
      ],
    },
    {
      user: SEED_USERS[5],
      mins: 60 * 48,
      preview: "wanna co-host a space tomorrow?",
      unread: 1,
      pinned: false,
      request: true,
      thread: [
        { from: "them", text: "wanna co-host a space tomorrow?", mins: 60 * 48 },
      ],
    },
    {
      user: SEED_USERS[6],
      mins: 60 * 72,
      preview: "got a free mint allowlist for you",
      unread: 0,
      pinned: false,
      request: true,
      thread: [
        { from: "them", text: "got a free mint allowlist for you", mins: 60 * 72 },
      ],
    },
  ];

  const conversations: Conversation[] = [];
  const messages: DMMessage[] = [];

  for (const it of items) {
    const id = `c-${it.user.handle.replace("@", "")}`;
    conversations.push({
      id,
      user: it.user,
      lastMessage: it.preview,
      lastAt: now - it.mins * 60 * 1000,
      unread: it.unread,
      pinned: it.pinned,
      muted: false,
      request: it.request,
    });
    for (const t of it.thread) {
      messages.push({
        id: makeId(),
        conversationId: id,
        fromHandle: t.from === "me" ? "@you" : it.user.handle,
        text: t.text,
        createdAt: now - t.mins * 60 * 1000,
        type: t.type ?? "text",
        ticker: t.ticker,
        tipAmount: t.tipAmount,
        tipToken: t.tipToken,
        read: t.from === "me" ? true : it.unread === 0,
      });
    }
  }

  return { conversations, messages };
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
      if (c && m && c.length > 0) {
        setConversations(c);
        setMessages(m);
      } else {
        const seed = seedConversations();
        setConversations(seed.conversations);
        setMessages(seed.messages);
        await Promise.all([saveJson(convoKey, seed.conversations), saveJson(msgKey, seed.messages)]);
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
    (handle: string) => SEED_USERS.find((u) => u.handle === handle),
    [],
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
    async (id: string, text: string, ticker?: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      const msg: DMMessage = {
        id: makeId(),
        conversationId: id,
        fromHandle: "@you",
        text: trimmed,
        createdAt: Date.now(),
        type: ticker ? "ticker" : "text",
        ticker,
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

  const suggestedUsers = useMemo<DMUser[]>(
    () =>
      SEED_USERS.filter(
        (u) => !conversations.some((c) => c.user.handle === u.handle),
      ),
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
      knownUsers: SEED_USERS,
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
    ],
  );
});
