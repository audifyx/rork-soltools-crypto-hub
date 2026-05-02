import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/providers/auth-provider";

export interface LobbyMember {
  id: string;
  handle: string;
  speaking: boolean;
  muted: boolean;
  isHost: boolean;
}

export interface LobbyMessage {
  id: string;
  lobbyId: string;
  fromHandle: string;
  text: string;
  createdAt: number;
  type: "text" | "ticker" | "wallet" | "system";
  ticker?: string;
  wallet?: string;
}

export interface LobbyWatch {
  id: string;
  type: "token" | "wallet";
  label: string;
  address: string;
}

export interface Lobby {
  id: string;
  name: string;
  topic: string;
  hostHandle: string;
  hostName: string;
  isPrivate: boolean;
  createdAt: number;
  members: LobbyMember[];
  messages: LobbyMessage[];
  watch: LobbyWatch[];
  tags: string[];
}

const KEY_LOBBIES = "soltools.lobbies.v1";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const SEED: Lobby[] = [
  {
    id: "lb-alpha-pit",
    name: "Alpha Pit",
    topic: "Live snipes, fresh pairs, real talk.",
    hostHandle: "@solhunter",
    hostName: "SolHunter",
    isPrivate: false,
    createdAt: Date.now() - 1000 * 60 * 24,
    tags: ["alpha", "snipes", "live"],
    members: [
      { id: "m1", handle: "@solhunter", speaking: true, muted: false, isHost: true },
      { id: "m2", handle: "@degen0xx", speaking: false, muted: false, isHost: false },
      { id: "m3", handle: "@chartwizard", speaking: false, muted: true, isHost: false },
    ],
    messages: [
      { id: "s1", lobbyId: "lb-alpha-pit", fromHandle: "system", type: "system", text: "Lobby opened.", createdAt: Date.now() - 600_000 },
    ],
    watch: [],
  },
  {
    id: "lb-meme-floor",
    name: "Meme Floor",
    topic: "Memecoin scanners + hot mints.",
    hostHandle: "@memequeen",
    hostName: "Meme Queen",
    isPrivate: false,
    createdAt: Date.now() - 1000 * 60 * 90,
    tags: ["memes", "pump.fun"],
    members: [
      { id: "m1", handle: "@memequeen", speaking: false, muted: false, isHost: true },
      { id: "m2", handle: "@apefarm", speaking: false, muted: false, isHost: false },
    ],
    messages: [],
    watch: [],
  },
  {
    id: "lb-whale-watch",
    name: "Whale Watch",
    topic: "Tracking smart-money rotations.",
    hostHandle: "@bigflows",
    hostName: "BigFlows",
    isPrivate: false,
    createdAt: Date.now() - 1000 * 60 * 30,
    tags: ["whales", "smart-money"],
    members: [
      { id: "m1", handle: "@bigflows", speaking: true, muted: false, isHost: true },
      { id: "m2", handle: "@onchain", speaking: false, muted: false, isHost: false },
      { id: "m3", handle: "@rotator", speaking: false, muted: false, isHost: false },
      { id: "m4", handle: "@flippa", speaking: false, muted: true, isHost: false },
    ],
    messages: [],
    watch: [],
  },
];

export const [LobbiesProvider, useLobbies] = createContextHook(() => {
  const { userId, email } = useAuth();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY_LOBBIES);
        if (!alive) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Lobby[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLobbies(parsed);
            setHydrated(true);
            return;
          }
        }
        setLobbies(SEED);
        setHydrated(true);
      } catch (e) {
        console.log("[lobbies] hydrate error", e);
        setLobbies(SEED);
        setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback(async (next: Lobby[]) => {
    try {
      await AsyncStorage.setItem(KEY_LOBBIES, JSON.stringify(next));
    } catch (e) {
      console.log("[lobbies] persist error", e);
    }
  }, []);

  const handleSelf = useMemo<string>(() => {
    if (email) return `@${email.split("@")[0].toLowerCase()}`;
    if (userId) return `@${userId.slice(0, 6).toLowerCase()}`;
    return "@you";
  }, [email, userId]);

  const createLobby = useCallback(
    (input: { name: string; topic: string; isPrivate?: boolean; tags?: string[] }) => {
      const lb: Lobby = {
        id: `lb-${makeId()}`,
        name: input.name.trim() || "Untitled lobby",
        topic: input.topic.trim() || "",
        hostHandle: handleSelf,
        hostName: handleSelf.replace("@", ""),
        isPrivate: !!input.isPrivate,
        createdAt: Date.now(),
        tags: input.tags ?? [],
        members: [
          { id: makeId(), handle: handleSelf, speaking: false, muted: true, isHost: true },
        ],
        messages: [
          {
            id: makeId(),
            lobbyId: "",
            fromHandle: "system",
            text: `${handleSelf} opened the lobby.`,
            createdAt: Date.now(),
            type: "system",
          },
        ],
        watch: [],
      };
      lb.messages = lb.messages.map((m) => ({ ...m, lobbyId: lb.id }));
      setLobbies((prev) => {
        const next = [lb, ...prev];
        persist(next).catch(() => {});
        return next;
      });
      return lb.id;
    },
    [handleSelf, persist],
  );

  const updateLobby = useCallback(
    (id: string, fn: (lb: Lobby) => Lobby) => {
      setLobbies((prev) => {
        const next = prev.map((l) => (l.id === id ? fn(l) : l));
        persist(next).catch(() => {});
        return next;
      });
    },
    [persist],
  );

  const joinLobby = useCallback(
    (id: string) => {
      updateLobby(id, (lb) => {
        if (lb.members.some((m) => m.handle === handleSelf)) return lb;
        return {
          ...lb,
          members: [
            ...lb.members,
            { id: makeId(), handle: handleSelf, speaking: false, muted: true, isHost: false },
          ],
          messages: [
            ...lb.messages,
            {
              id: makeId(),
              lobbyId: lb.id,
              fromHandle: "system",
              text: `${handleSelf} joined.`,
              createdAt: Date.now(),
              type: "system",
            },
          ],
        };
      });
    },
    [handleSelf, updateLobby],
  );

  const leaveLobby = useCallback(
    (id: string) => {
      updateLobby(id, (lb) => ({
        ...lb,
        members: lb.members.filter((m) => m.handle !== handleSelf),
        messages: [
          ...lb.messages,
          {
            id: makeId(),
            lobbyId: lb.id,
            fromHandle: "system",
            text: `${handleSelf} left.`,
            createdAt: Date.now(),
            type: "system",
          },
        ],
      }));
    },
    [handleSelf, updateLobby],
  );

  const sendMessage = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      updateLobby(id, (lb) => ({
        ...lb,
        messages: [
          ...lb.messages,
          {
            id: makeId(),
            lobbyId: lb.id,
            fromHandle: handleSelf,
            text: trimmed,
            createdAt: Date.now(),
            type: trimmed.startsWith("$") ? "ticker" : "text",
            ticker: trimmed.startsWith("$") ? trimmed.slice(1).split(/\s/)[0].toUpperCase() : undefined,
          },
        ],
      }));
    },
    [handleSelf, updateLobby],
  );

  const toggleMute = useCallback(
    (id: string) => {
      updateLobby(id, (lb) => ({
        ...lb,
        members: lb.members.map((m) =>
          m.handle === handleSelf ? { ...m, muted: !m.muted, speaking: m.muted ? false : m.speaking } : m,
        ),
      }));
    },
    [handleSelf, updateLobby],
  );

  const addWatch = useCallback(
    (id: string, item: Omit<LobbyWatch, "id">) => {
      updateLobby(id, (lb) => {
        if (lb.watch.some((w) => w.address === item.address)) return lb;
        return {
          ...lb,
          watch: [...lb.watch, { ...item, id: makeId() }],
          messages: [
            ...lb.messages,
            {
              id: makeId(),
              lobbyId: lb.id,
              fromHandle: handleSelf,
              text: `Tracking ${item.type === "wallet" ? "wallet" : "token"} ${item.label}`,
              createdAt: Date.now(),
              type: item.type === "wallet" ? "wallet" : "ticker",
              ticker: item.type === "token" ? item.label : undefined,
              wallet: item.type === "wallet" ? item.address : undefined,
            },
          ],
        };
      });
    },
    [handleSelf, updateLobby],
  );

  const removeWatch = useCallback(
    (id: string, watchId: string) => {
      updateLobby(id, (lb) => ({ ...lb, watch: lb.watch.filter((w) => w.id !== watchId) }));
    },
    [updateLobby],
  );

  const getLobby = useCallback((id: string): Lobby | undefined => lobbies.find((l) => l.id === id), [lobbies]);

  return useMemo(
    () => ({
      lobbies,
      hydrated,
      handleSelf,
      createLobby,
      joinLobby,
      leaveLobby,
      sendMessage,
      toggleMute,
      addWatch,
      removeWatch,
      getLobby,
    }),
    [lobbies, hydrated, handleSelf, createLobby, joinLobby, leaveLobby, sendMessage, toggleMute, addWatch, removeWatch, getLobby],
  );
});
