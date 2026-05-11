import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { supabase, SUPABASE_READY } from "@/lib/supabase";
import { useApp } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";

export type LobbyRole = "host" | "speaker" | "listener";
export type LobbyStatus = "live" | "scheduled" | "ended";

export interface LobbyMember {
  id: string;
  userId?: string | null;
  handle: string;
  displayName?: string | null;
  speaking: boolean;
  muted: boolean;
  isHost: boolean;
  raisedHand: boolean;
  role: LobbyRole;
  joinedAt?: number;
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
  addedByHandle?: string | null;
  createdAt?: number;
}

export interface Lobby {
  id: string;
  name: string;
  topic: string;
  hostHandle: string;
  hostName: string;
  hostId?: string | null;
  isPrivate: boolean;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  members: LobbyMember[];
  messages: LobbyMessage[];
  watch: LobbyWatch[];
  tags: string[];
  reactionsCount: number;
  handCount: number;
  livekitRoom: string;
  status: LobbyStatus;
}

const KEY_LOBBIES = "soltools.lobbies.v2";
const QK = ["voice-lobbies"] as const;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asDateMs(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = new Date(value).getTime();
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function jsonRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function tagsFrom(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? (JSON.parse(value) as unknown[])
      : typeof value === "string" && value.trim().length > 0
        ? value.split(",")
        : [];
  return raw
    .map((tag) => String(tag).trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function handleFromProfile(handle: string | null | undefined, userId: string | null): string {
  const clean = handle?.replace(/^@/, "").replace(/[^a-z0-9_\-.]/gi, "").trim().toLowerCase();
  if (clean) return `@${clean}`;
  if (userId) return `@${userId.slice(0, 6).toLowerCase()}`;
  return "@you";
}

function validRole(value: unknown): LobbyRole {
  return value === "host" || value === "speaker" || value === "listener" ? value : "listener";
}

function validStatus(value: unknown): LobbyStatus {
  return value === "scheduled" || value === "ended" || value === "live" ? value : "live";
}

function validMessageType(value: unknown): LobbyMessage["type"] {
  return value === "ticker" || value === "wallet" || value === "system" || value === "text" ? value : "text";
}

function validWatchType(value: unknown): LobbyWatch["type"] {
  return value === "wallet" ? "wallet" : "token";
}

function normalizeMember(input: unknown, fallbackHandle: string): LobbyMember | null {
  if (!isRecord(input)) return null;
  const role = validRole(input.role);
  const userId = asString(input.user_id ?? input.userId, "");
  const handle = asString(input.handle, userId ? `@${userId.slice(0, 6)}` : fallbackHandle);
  return {
    id: asString(input.id, userId || makeId()),
    userId: userId || null,
    handle,
    displayName: asString(input.display_name ?? input.displayName, handle.replace("@", "")),
    speaking: asBool(input.speaking, false),
    muted: asBool(input.mic_muted ?? input.muted, true),
    isHost: role === "host" || asBool(input.isHost, false),
    raisedHand: asBool(input.raised_hand ?? input.raisedHand, false),
    role,
    joinedAt: asDateMs(input.joined_at ?? input.joinedAt, Date.now()),
  };
}

function normalizeMessage(input: unknown, fallbackLobbyId: string): LobbyMessage | null {
  if (!isRecord(input)) return null;
  const text = asString(input.content ?? input.text, "");
  if (!text) return null;
  const type = validMessageType(input.kind ?? input.type);
  return {
    id: asString(input.id, makeId()),
    lobbyId: asString(input.lobby_id ?? input.lobbyId, fallbackLobbyId),
    fromHandle: asString(input.from_handle ?? input.fromHandle, "system"),
    text,
    createdAt: asDateMs(input.created_at ?? input.createdAt, Date.now()),
    type,
    ticker: asString(input.ticker, "") || undefined,
    wallet: asString(input.wallet_address ?? input.wallet, "") || undefined,
  };
}

function normalizeWatch(input: unknown): LobbyWatch | null {
  if (!isRecord(input)) return null;
  const address = asString(input.address, "").trim();
  if (!address) return null;
  return {
    id: asString(input.id, makeId()),
    type: validWatchType(input.type),
    label: asString(input.label, address.slice(0, 8)),
    address,
    addedByHandle: asString(input.added_by_handle ?? input.addedByHandle, "") || null,
    createdAt: asDateMs(input.created_at ?? input.createdAt, Date.now()),
  };
}

function normalizeLobby(input: unknown): Lobby | null {
  if (!isRecord(input)) return null;
  const id = asString(input.id, "");
  if (!id) return null;
  const hostHandle = asString(input.host_handle ?? input.hostHandle, "@host");
  const members = jsonRecords(input.members)
    .map((m) => normalizeMember(m, hostHandle))
    .filter((m): m is LobbyMember => m !== null);
  const messages = jsonRecords(input.messages)
    .map((m) => normalizeMessage(m, id))
    .filter((m): m is LobbyMessage => m !== null);
  const watch = jsonRecords(input.watchlist ?? input.watch)
    .map(normalizeWatch)
    .filter((w): w is LobbyWatch => w !== null);
  return {
    id,
    name: asString(input.name, "Untitled lobby"),
    topic: asString(input.topic, ""),
    hostHandle,
    hostName: asString(input.host_name ?? input.hostName, hostHandle.replace("@", "")),
    hostId: asString(input.host_id ?? input.hostId, "") || null,
    isPrivate: asBool(input.is_private ?? input.isPrivate, false),
    createdAt: asDateMs(input.created_at ?? input.createdAt, Date.now()),
    startedAt: input.started_at || input.startedAt ? asDateMs(input.started_at ?? input.startedAt) : undefined,
    endedAt: input.ended_at || input.endedAt ? asDateMs(input.ended_at ?? input.endedAt) : undefined,
    members,
    messages,
    watch,
    tags: tagsFrom(input.tags),
    reactionsCount: asNumber(input.reactions_count ?? input.reactionsCount, 0),
    handCount: asNumber(input.raised_hands_count ?? input.handCount, members.filter((m) => m.raisedHand).length),
    livekitRoom: asString(input.livekit_room ?? input.livekitRoom, `voice-${id}`),
    status: validStatus(input.status),
  };
}

const SEED: Lobby[] = [
  {
    id: "lb-alpha-pit",
    name: "Alpha Pit",
    topic: "Live snipes, fresh pairs, real talk.",
    hostHandle: "@solhunter",
    hostName: "SolHunter",
    hostId: null,
    isPrivate: false,
    createdAt: Date.now() - 1000 * 60 * 24,
    startedAt: Date.now() - 1000 * 60 * 24,
    tags: ["alpha", "snipes", "live"],
    reactionsCount: 18,
    handCount: 1,
    livekitRoom: "lb-alpha-pit",
    status: "live",
    members: [
      { id: "m1", handle: "@solhunter", speaking: true, muted: false, isHost: true, raisedHand: false, role: "host" },
      { id: "m2", handle: "@degen0xx", speaking: false, muted: false, isHost: false, raisedHand: true, role: "speaker" },
      { id: "m3", handle: "@chartwizard", speaking: false, muted: true, isHost: false, raisedHand: false, role: "listener" },
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
    hostId: null,
    isPrivate: false,
    createdAt: Date.now() - 1000 * 60 * 90,
    startedAt: Date.now() - 1000 * 60 * 90,
    tags: ["memes", "pump.fun"],
    reactionsCount: 9,
    handCount: 0,
    livekitRoom: "lb-meme-floor",
    status: "live",
    members: [
      { id: "m1", handle: "@memequeen", speaking: false, muted: false, isHost: true, raisedHand: false, role: "host" },
      { id: "m2", handle: "@apefarm", speaking: false, muted: false, isHost: false, raisedHand: false, role: "speaker" },
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
    hostId: null,
    isPrivate: false,
    createdAt: Date.now() - 1000 * 60 * 30,
    startedAt: Date.now() - 1000 * 60 * 30,
    tags: ["whales", "smart-money"],
    reactionsCount: 31,
    handCount: 2,
    livekitRoom: "lb-whale-watch",
    status: "live",
    members: [
      { id: "m1", handle: "@bigflows", speaking: true, muted: false, isHost: true, raisedHand: false, role: "host" },
      { id: "m2", handle: "@onchain", speaking: false, muted: false, isHost: false, raisedHand: true, role: "speaker" },
      { id: "m3", handle: "@rotator", speaking: false, muted: false, isHost: false, raisedHand: true, role: "listener" },
      { id: "m4", handle: "@flippa", speaking: false, muted: true, isHost: false, raisedHand: false, role: "listener" },
    ],
    messages: [],
    watch: [],
  },
];

async function loadLocalLobbies(): Promise<Lobby[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_LOBBIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLobby).filter((l): l is Lobby => l !== null);
  } catch (e) {
    console.log("[lobbies] hydrate error", e);
    return [];
  }
}

async function saveLocalLobbies(next: Lobby[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_LOBBIES, JSON.stringify(next));
  } catch (e) {
    console.log("[lobbies] persist error", e);
  }
}

function rpcId(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return rpcId(data[0]);
  if (isRecord(data)) return asString(data.id ?? data.lobby_id ?? data.create_voice_lobby, "") || null;
  return null;
}

export const [LobbiesProvider, useLobbies] = createContextHook(() => {
  const qc = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const { profile } = useApp();

  const handleSelf = useMemo<string>(() => handleFromProfile(profile.handle, userId), [profile.handle, userId]);

  const lobbiesQ = useQuery<Lobby[]>({
    queryKey: QK,
    queryFn: async () => {
      const local = await loadLocalLobbies();
      if (SUPABASE_READY) {
        try {
          const { data, error } = await supabase.rpc("list_voice_lobbies", { max_rows: 80 });
          if (error) throw error;
          const remote = Array.isArray(data)
            ? data.map(normalizeLobby).filter((l): l is Lobby => l !== null)
            : [];
          if (remote.length > 0) {
            await saveLocalLobbies(remote);
            return remote;
          }
        } catch (e) {
          console.log("[lobbies] remote fetch fallback", e instanceof Error ? e.message : e);
        }
      }
      return local.length > 0 ? local : SEED;
    },
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  const lobbies = lobbiesQ.data ?? SEED;

  const persistQuery = useCallback(
    (next: Lobby[]) => {
      qc.setQueryData(QK, next);
      saveLocalLobbies(next).catch(() => {});
    },
    [qc],
  );

  useEffect(() => {
    if (!SUPABASE_READY) return;
    const channel = supabase
      .channel("voice-lobbies-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_lobbies" }, () => {
        qc.invalidateQueries({ queryKey: QK });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_lobby_members" }, () => {
        qc.invalidateQueries({ queryKey: QK });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_lobby_messages" }, () => {
        qc.invalidateQueries({ queryKey: QK });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_lobby_watchlist" }, () => {
        qc.invalidateQueries({ queryKey: QK });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [qc]);

  const updateLocalLobby = useCallback(
    (id: string, fn: (lb: Lobby) => Lobby) => {
      const next = lobbies.map((l) => (l.id === id ? fn(l) : l));
      persistQuery(next);
    },
    [lobbies, persistQuery],
  );

  const createLobby = useCallback(
    async (input: { name: string; topic: string; isPrivate?: boolean; tags?: string[] }): Promise<string> => {
      const cleanName = input.name.trim() || "Untitled lobby";
      const cleanTopic = input.topic.trim();
      const tags = (input.tags ?? []).map((t) => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 8);
      if (SUPABASE_READY && isAuthenticated && userId) {
        try {
          const { data, error } = await supabase.rpc("create_voice_lobby", {
            p_name: cleanName,
            p_topic: cleanTopic,
            p_is_private: !!input.isPrivate,
            p_tags: tags,
          });
          if (error) throw error;
          const id = rpcId(data);
          await qc.invalidateQueries({ queryKey: QK });
          if (id) return id;
        } catch (e) {
          console.log("[lobbies] create remote fallback", e instanceof Error ? e.message : e);
        }
      }

      const id = `lb-${makeId()}`;
      const lb: Lobby = {
        id,
        name: cleanName,
        topic: cleanTopic,
        hostHandle: handleSelf,
        hostName: handleSelf.replace("@", ""),
        hostId: userId,
        isPrivate: !!input.isPrivate,
        createdAt: Date.now(),
        startedAt: Date.now(),
        tags,
        members: [{ id: makeId(), userId, handle: handleSelf, speaking: false, muted: true, isHost: true, raisedHand: false, role: "host", joinedAt: Date.now() }],
        messages: [{ id: makeId(), lobbyId: id, fromHandle: "system", text: `${handleSelf} opened the lobby.`, createdAt: Date.now(), type: "system" }],
        watch: [],
        reactionsCount: 0,
        handCount: 0,
        livekitRoom: id,
        status: "live",
      };
      persistQuery([lb, ...lobbies]);
      return id;
    },
    [SUPABASE_READY, isAuthenticated, userId, handleSelf, lobbies, persistQuery, qc],
  );

  const joinLobby = useCallback(
    async (id: string): Promise<void> => {
      if (SUPABASE_READY && isAuthenticated) {
        try {
          const { error } = await supabase.rpc("join_voice_lobby", { target_lobby_id: id });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: QK });
          return;
        } catch (e) {
          console.log("[lobbies] join remote fallback", e instanceof Error ? e.message : e);
        }
      }
      updateLocalLobby(id, (lb) => {
        if (lb.members.some((m) => m.handle === handleSelf)) return lb;
        return {
          ...lb,
          members: [...lb.members, { id: makeId(), userId, handle: handleSelf, speaking: false, muted: true, isHost: false, raisedHand: false, role: "listener", joinedAt: Date.now() }],
          messages: [...lb.messages, { id: makeId(), lobbyId: lb.id, fromHandle: "system", text: `${handleSelf} joined.`, createdAt: Date.now(), type: "system" }],
        };
      });
    },
    [SUPABASE_READY, isAuthenticated, userId, handleSelf, updateLocalLobby, qc],
  );

  const leaveLobby = useCallback(
    async (id: string): Promise<void> => {
      if (SUPABASE_READY && isAuthenticated) {
        try {
          const { error } = await supabase.rpc("leave_voice_lobby", { target_lobby_id: id });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: QK });
          return;
        } catch (e) {
          console.log("[lobbies] leave remote fallback", e instanceof Error ? e.message : e);
        }
      }
      updateLocalLobby(id, (lb) => ({
        ...lb,
        handCount: Math.max(0, lb.handCount - (lb.members.some((m) => m.handle === handleSelf && m.raisedHand) ? 1 : 0)),
        members: lb.members.filter((m) => m.handle !== handleSelf),
        messages: [...lb.messages, { id: makeId(), lobbyId: lb.id, fromHandle: "system", text: `${handleSelf} left.`, createdAt: Date.now(), type: "system" }],
      }));
    },
    [SUPABASE_READY, isAuthenticated, handleSelf, updateLocalLobby, qc],
  );

  const sendMessage = useCallback(
    async (id: string, text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (SUPABASE_READY && isAuthenticated) {
        try {
          const { error } = await supabase.rpc("send_voice_lobby_message", { target_lobby_id: id, p_text: trimmed });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: QK });
          return;
        } catch (e) {
          console.log("[lobbies] message remote fallback", e instanceof Error ? e.message : e);
        }
      }
      updateLocalLobby(id, (lb) => ({
        ...lb,
        messages: [...lb.messages, { id: makeId(), lobbyId: lb.id, fromHandle: handleSelf, text: trimmed, createdAt: Date.now(), type: trimmed.startsWith("$") ? "ticker" : "text", ticker: trimmed.startsWith("$") ? trimmed.slice(1).split(/\s/)[0].toUpperCase() : undefined }],
      }));
    },
    [SUPABASE_READY, isAuthenticated, handleSelf, updateLocalLobby, qc],
  );

  const ensureMember = useCallback(
    (lb: Lobby): Lobby => {
      if (lb.members.some((m) => m.handle === handleSelf)) return lb;
      return {
        ...lb,
        members: [
          ...lb.members,
          {
            id: makeId(),
            userId,
            handle: handleSelf,
            speaking: false,
            muted: true,
            isHost: false,
            raisedHand: false,
            role: "listener",
            joinedAt: Date.now(),
          },
        ],
      };
    },
    [handleSelf, userId],
  );

  const toggleMute = useCallback(
    async (id: string): Promise<void> => {
      const lobby = lobbies.find((l) => l.id === id);
      const me = lobby?.members.find((m) => m.handle === handleSelf);
      const nextMuted = !(me?.muted ?? true);
      updateLocalLobby(id, (lb) => {
        const ensured = ensureMember(lb);
        return {
          ...ensured,
          members: ensured.members.map((m) =>
            m.handle === handleSelf ? { ...m, muted: nextMuted, speaking: !nextMuted } : m,
          ),
        };
      });
      if (SUPABASE_READY && isAuthenticated) {
        try {
          const { error } = await supabase.rpc("set_voice_lobby_mute", { target_lobby_id: id, p_muted: nextMuted });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: QK });
        } catch (e) {
          console.log("[lobbies] mute remote fallback", e instanceof Error ? e.message : e);
        }
      }
    },
    [SUPABASE_READY, isAuthenticated, lobbies, handleSelf, updateLocalLobby, ensureMember, qc],
  );

  const toggleHand = useCallback(
    async (id: string): Promise<void> => {
      const lobby = lobbies.find((l) => l.id === id);
      const me = lobby?.members.find((m) => m.handle === handleSelf);
      const nextRaised = !(me?.raisedHand ?? false);
      updateLocalLobby(id, (lb) => {
        const ensured = ensureMember(lb);
        return {
          ...ensured,
          handCount: Math.max(0, ensured.handCount + (nextRaised ? 1 : -1)),
          members: ensured.members.map((m) =>
            m.handle === handleSelf ? { ...m, raisedHand: nextRaised } : m,
          ),
        };
      });
      if (SUPABASE_READY && isAuthenticated) {
        try {
          const { error } = await supabase.rpc("set_voice_lobby_hand", { target_lobby_id: id, p_raised: nextRaised });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: QK });
        } catch (e) {
          console.log("[lobbies] hand remote fallback", e instanceof Error ? e.message : e);
        }
      }
    },
    [SUPABASE_READY, isAuthenticated, lobbies, handleSelf, updateLocalLobby, ensureMember, qc],
  );

  const addReaction = useCallback(
    async (id: string, emoji = "🔥"): Promise<void> => {
      updateLocalLobby(id, (lb) => ({ ...lb, reactionsCount: lb.reactionsCount + 1 }));
      if (SUPABASE_READY && isAuthenticated) {
        try {
          const { error } = await supabase.rpc("add_voice_lobby_reaction", { target_lobby_id: id, p_emoji: emoji });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: QK });
        } catch (e) {
          console.log("[lobbies] reaction remote fallback", e instanceof Error ? e.message : e);
        }
      }
    },
    [SUPABASE_READY, isAuthenticated, updateLocalLobby, qc],
  );

  const addWatch = useCallback(
    async (id: string, item: Omit<LobbyWatch, "id">): Promise<void> => {
      const cleanItem = {
        type: item.type,
        label: item.label.trim() || item.address.slice(0, 8),
        address: item.address.trim(),
      } as Omit<LobbyWatch, "id">;
      if (!cleanItem.address) return;
      if (SUPABASE_READY && isAuthenticated) {
        try {
          const { error } = await supabase.rpc("add_voice_lobby_watch", {
            target_lobby_id: id,
            p_type: cleanItem.type,
            p_label: cleanItem.label,
            p_address: cleanItem.address,
          });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: QK });
          return;
        } catch (e) {
          console.log("[lobbies] watch remote fallback", e instanceof Error ? e.message : e);
        }
      }
      updateLocalLobby(id, (lb) => {
        if (lb.watch.some((w) => w.address === cleanItem.address)) return lb;
        return {
          ...lb,
          watch: [...lb.watch, { ...cleanItem, id: makeId(), addedByHandle: handleSelf, createdAt: Date.now() }],
          messages: [...lb.messages, { id: makeId(), lobbyId: lb.id, fromHandle: handleSelf, text: `Tracking ${cleanItem.type === "wallet" ? "wallet" : "token"} ${cleanItem.label}`, createdAt: Date.now(), type: cleanItem.type === "wallet" ? "wallet" : "ticker", ticker: cleanItem.type === "token" ? cleanItem.label : undefined, wallet: cleanItem.type === "wallet" ? cleanItem.address : undefined }],
        };
      });
    },
    [SUPABASE_READY, isAuthenticated, handleSelf, updateLocalLobby, qc],
  );

  const removeWatch = useCallback(
    async (id: string, watchId: string): Promise<void> => {
      if (SUPABASE_READY && isAuthenticated) {
        try {
          const { error } = await supabase.rpc("remove_voice_lobby_watch", { target_lobby_id: id, target_watch_id: watchId });
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: QK });
          return;
        } catch (e) {
          console.log("[lobbies] remove watch remote fallback", e instanceof Error ? e.message : e);
        }
      }
      updateLocalLobby(id, (lb) => ({ ...lb, watch: lb.watch.filter((w) => w.id !== watchId) }));
    },
    [SUPABASE_READY, isAuthenticated, updateLocalLobby, qc],
  );

  const getLobby = useCallback((id: string): Lobby | undefined => lobbies.find((l) => l.id === id), [lobbies]);

  return useMemo(
    () => ({
      lobbies,
      hydrated: !lobbiesQ.isLoading,
      handleSelf,
      createLobby,
      joinLobby,
      leaveLobby,
      sendMessage,
      toggleMute,
      toggleHand,
      addReaction,
      addWatch,
      removeWatch,
      getLobby,
    }),
    [lobbies, lobbiesQ.isLoading, handleSelf, createLobby, joinLobby, leaveLobby, sendMessage, toggleMute, toggleHand, addReaction, addWatch, removeWatch, getLobby],
  );
});
