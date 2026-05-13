import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Hash,
  Info,
  Lock,
  NotebookPen,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  ListRenderItem,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { getSelfChat } from "@/lib/api/platform";
import { navigateBack } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const ACCENT = Colors.mint;
const BG = "#05070D";
const CARD = "rgba(11,15,26,0.92)";
const CARD_SOFT = "rgba(63,169,255,0.10)";
const BORDER = "rgba(63,169,255,0.18)";
const NOTE_BUBBLE = "rgba(63,169,255,0.14)";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

const QUICK_TAGS = ["#alpha", "#todo", "#idea", "#watchlist", "#thread"] as const;

interface NoteRow {
  id: string;
  body: string;
  ticker: string | null;
  image_url: string | null;
  message_type: string | null;
  created_at: string;
  pinned_in_chat: boolean | null;
}

interface NoteItem {
  id: string;
  body: string;
  ticker: string | null;
  imageUrl: string | null;
  createdAt: number;
  pinned: boolean;
  done: boolean;
}

function parseTodo(body: string): { done: boolean; clean: string } {
  if (/^\s*\[x\]\s*/i.test(body)) return { done: true, clean: body.replace(/^\s*\[x\]\s*/i, "") };
  if (/^\s*\[ ?\]\s*/i.test(body)) return { done: false, clean: body.replace(/^\s*\[ ?\]\s*/i, "") };
  return { done: false, clean: body };
}

function formatTime(t: number): string {
  const d = new Date(t);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDayLabel(t: number): string {
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

interface ListRow {
  kind: "note" | "day";
  id: string;
  note?: NoteItem;
  label?: string;
}

export default function NotesToSelfScreen() {
  const router = useRouter();
  const { user, userId, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState<string>("");
  const [tagBar, setTagBar] = useState<boolean>(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const isEditing = !!editingNoteId;
  const listRef = useRef<FlatList<ListRow>>(null);

  const convQ = useQuery<string | null>({
    queryKey: ["notes-to-self", "conv", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => normalizeUuid(await getSelfChat()),
  });
  const convId = normalizeUuid(convQ.data);
  const hasValidConvId = !!convId;

  const messagesQ = useQuery<NoteItem[]>({
    queryKey: ["notes-to-self", "messages", convId ?? "none"],
    enabled: hasValidConvId,
    staleTime: 4_000,
    refetchInterval: hasValidConvId ? 15_000 : false,
    queryFn: async () => {
      const safeConvId = normalizeUuid(convId);
      if (!safeConvId) return [];
      const { data, error } = await supabase
        .from("dm_messages")
        .select("id,body,ticker,image_url,message_type,created_at,pinned_in_chat")
        .eq("conversation_id", safeConvId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) {
        console.log("[notes] load failed", error.message);
        throw new Error(error.message);
      }
      return ((data ?? []) as NoteRow[]).map((row) => {
        const todo = parseTodo(row.body ?? "");
        return {
          id: row.id,
          body: todo.clean,
          ticker: row.ticker,
          imageUrl: row.image_url,
          createdAt: new Date(row.created_at).getTime(),
          pinned: !!row.pinned_in_chat,
          done: todo.done,
        };
      });
    },
  });

  useEffect(() => {
    const safeConvId = normalizeUuid(convId);
    if (!safeConvId) return;
    const channel = supabase
      .channel(`notes-${safeConvId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${safeConvId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notes-to-self", "messages", safeConvId] }).catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [convId, queryClient]);

  const notes = messagesQ.data ?? [];

  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [];
    let lastDay = "";
    for (const n of notes) {
      const day = formatDayLabel(n.createdAt);
      if (day !== lastDay) {
        out.push({ kind: "day", id: `day-${day}-${n.id}`, label: day });
        lastDay = day;
      }
      out.push({ kind: "note", id: n.id, note: n });
    }
    return out;
  }, [notes]);

  const pinned = useMemo<NoteItem[]>(() => notes.filter((n) => n.pinned).slice(-3), [notes]);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(t);
  }, [rows.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const safeConvId = normalizeUuid(convId);
      if (!safeConvId) throw new Error("Notes are still opening. Try again in a second.");
      const trimmed = body.trim();
      if (!trimmed) return null;
      const senderId = normalizeUuid(userId);
      if (!senderId) throw new Error("Sign in to save notes.");
      // Notes-to-self bypasses the send_dm_message RPC because that RPC has a
      // server-side bug that mishandles an empty array literal as a uuid.
      // Direct insert is safe here: RLS only allows the owner to write to
      // their own self-chat conversation.
      const { data, error } = await supabase
        .from("dm_messages")
        .insert({
          conversation_id: safeConvId,
          sender_id: senderId,
          body: trimmed,
          message_type: "text",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return (data?.id as string) ?? null;
    },
    onSuccess: () => {
      const safeConvId = normalizeUuid(convId);
      if (!safeConvId) return;
      queryClient.invalidateQueries({ queryKey: ["notes-to-self", "messages", safeConvId] }).catch(() => {});
    },
  });

  const cancelEdit = useCallback(() => {
    setEditingNoteId(null);
    setText("");
  }, []);

  const onSend = useCallback(async () => {
    const value = text.trim();
    if (!value || !hasValidConvId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (editingNoteId) {
      const editId = editingNoteId;
      const safeConvId = normalizeUuid(convId);
      setText("");
      setEditingNoteId(null);
      try {
        const { error } = await supabase.rpc("edit_dm_message", {
          p_message_id: editId,
          p_body: value,
        });
        if (error) throw new Error(error.message);
        if (safeConvId) {
          queryClient
            .invalidateQueries({ queryKey: ["notes-to-self", "messages", safeConvId] })
            .catch(() => {});
        }
      } catch (e) {
        setText(value);
        setEditingNoteId(editId);
        Alert.alert("Couldn’t update note", e instanceof Error ? e.message : "Try again.");
      }
      return;
    }
    setText("");
    try {
      await sendMutation.mutateAsync(value);
    } catch (e) {
      setText(value);
      Alert.alert("Couldn’t save note", e instanceof Error ? e.message : "Try again.");
    }
  }, [text, hasValidConvId, sendMutation, editingNoteId, convId, queryClient]);

  const toggleTodo = useCallback(
    async (note: NoteItem) => {
      const safeConvId = normalizeUuid(convId);
      if (!safeConvId || !note.body.length) return;
      Haptics.selectionAsync().catch(() => {});
      const nextBody = note.done ? note.body : `[x] ${note.body}`;
      const { error } = await supabase.rpc("edit_dm_message", {
        p_message_id: note.id,
        p_body: nextBody,
      }).then((r) => ({ error: r.error })).catch((e: unknown) => ({ error: e as Error }));
      if (error) {
        console.log("[notes] toggle failed", error instanceof Error ? error.message : error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["notes-to-self", "messages", safeConvId] }).catch(() => {});
    },
    [convId, queryClient],
  );

  const togglePin = useCallback(
    async (note: NoteItem) => {
      const safeConvId = normalizeUuid(convId);
      if (!safeConvId) return;
      Haptics.selectionAsync().catch(() => {});
      const { error } = await supabase.rpc("toggle_pin_in_chat", { p_message_id: note.id });
      if (error) {
        console.log("[notes] pin failed", error.message);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["notes-to-self", "messages", safeConvId] }).catch(() => {});
    },
    [convId, queryClient],
  );

  const startEdit = useCallback((note: NoteItem) => {
    setEditingNoteId(note.id);
    setText(note.body);
    setTagBar(false);
  }, []);

  const confirmDelete = useCallback(
    (note: NoteItem) => {
      const safeConvId = normalizeUuid(convId);
      if (!safeConvId) return;
      Alert.alert(
        "Delete note?",
        "This can’t be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const { error } = await supabase.rpc("delete_dm_message", { p_message_id: note.id });
                if (error) throw new Error(error.message);
                if (editingNoteId === note.id) {
                  setEditingNoteId(null);
                  setText("");
                }
                queryClient
                  .invalidateQueries({ queryKey: ["notes-to-self", "messages", safeConvId] })
                  .catch(() => {});
              } catch (e) {
                Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again.");
              }
            },
          },
        ],
      );
    },
    [convId, queryClient, editingNoteId],
  );

  const onLongPress = useCallback(
    (note: NoteItem) => {
      const safeConvId = normalizeUuid(convId);
      if (!safeConvId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert(
        "Note actions",
        note.body.slice(0, 80) || "Manage this note",
        [
          { text: "Edit", onPress: () => startEdit(note) },
          { text: note.pinned ? "Unpin" : "Pin to top", onPress: () => togglePin(note) },
          { text: note.done ? "Mark as not done" : "Mark as done", onPress: () => toggleTodo(note) },
          { text: "Delete", style: "destructive", onPress: () => confirmDelete(note) },
          { text: "Cancel", style: "cancel" },
        ],
      );
    },
    [convId, toggleTodo, togglePin, startEdit, confirmDelete],
  );

  const goBack = useCallback(() => {
    navigateBack(router, "/messages");
  }, [router]);

  if (!isAuthenticated) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe}>
          <Header onBack={goBack} subtitle="Sign in required" />
          <View style={styles.center}>
            <View style={styles.lockBubble}>
              <Lock color={ACCENT} size={28} strokeWidth={2.2} />
            </View>
            <Text style={styles.emptyTitle}>Sign in to keep private notes</Text>
            <Text style={styles.emptyBody}>
              Notes to self are end-to-end yours — links, alpha, screenshots, ideas. Sign in to start your private space.
            </Text>
            <Pressable
              onPress={() => router.push("/auth?mode=signin")}
              style={styles.primaryBtn}
              testID="notes-signin"
            >
              <Text style={styles.primaryBtnText}>Sign in</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="notes-to-self">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <LinearGradient
        colors={["rgba(63,169,255,0.20)", "rgba(63,169,255,0.04)", "transparent"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 0.9 }}
        style={styles.bgGlow}
        pointerEvents="none"
      />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <Header
          onBack={goBack}
          subtitle={
            convQ.isLoading
              ? "Opening your private space…"
              : notes.length === 0
                ? "Private · only you can see"
                : `${notes.length} note${notes.length === 1 ? "" : "s"} · only you`
          }
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.hintBanner} testID="notes-hint">
            <View style={styles.hintIcon}>
              <Info color={ACCENT} size={12} strokeWidth={2.6} />
            </View>
            <Text style={styles.hintText} numberOfLines={2}>
              Press and hold any note to edit, delete, pin, or mark done.
            </Text>
          </View>

          {pinned.length > 0 ? (
            <View style={styles.pinnedStrip}>
              <View style={styles.pinnedHeader}>
                <Sparkles color={ACCENT} size={11} strokeWidth={2.6} />
                <Text style={styles.pinnedLabel}>Pinned</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pinnedRow}>
                {pinned.map((p) => (
                  <Pressable
                    key={`pin-${p.id}`}
                    onLongPress={() => onLongPress(p)}
                    delayLongPress={250}
                    style={styles.pinnedCard}
                    testID={`pinned-${p.id}`}
                  >
                    <Text style={styles.pinnedCardText} numberOfLines={3}>
                      {p.body || "Photo"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {convQ.isError || (convQ.isFetched && !hasValidConvId) ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>
                Couldn’t open your private notes. Pull to retry.
              </Text>
              <Pressable
                onPress={() => convQ.refetch()}
                style={styles.errorRetry}
                testID="notes-retry"
              >
                <Text style={styles.errorRetryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={renderRow(onLongPress, toggleTodo)}
            ListEmptyComponent={
              convQ.isLoading || messagesQ.isLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator color={ACCENT} />
                </View>
              ) : (
                <EmptyState username={user?.email?.split("@")[0] ?? "you"} />
              )
            }
          />

          {isEditing ? (
            <View style={styles.editBar} testID="notes-edit-bar">
              <View style={styles.editBarIcon}>
                <Pencil color={ACCENT} size={12} strokeWidth={2.6} />
              </View>
              <Text style={styles.editBarText}>Editing note</Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  cancelEdit();
                }}
                style={styles.editBarCancel}
                testID="notes-edit-cancel"
              >
                <X color={Colors.text} size={12} strokeWidth={2.6} />
                <Text style={styles.editBarCancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}

          {tagBar ? (
            <View style={styles.tagStrip}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
                {QUICK_TAGS.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setText((prev) => (prev.length > 0 ? `${prev} ${t} ` : `${t} `));
                      setTagBar(false);
                    }}
                    style={styles.tagChip}
                    testID={`tag-${t}`}
                  >
                    <Text style={styles.tagChipText}>{t}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setText((prev) => (prev.length > 0 ? `[ ] ${prev}` : "[ ] "));
                    setTagBar(false);
                  }}
                  style={[styles.tagChip, styles.tagChipAccent]}
                  testID="tag-todo"
                >
                  <Text style={[styles.tagChipText, { color: "#FFFFFF" }]}>[ ] todo</Text>
                </Pressable>
              </ScrollView>
            </View>
          ) : null}

          <View style={[styles.composer, isEditing && styles.composerEditing]}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTagBar((p) => !p);
              }}
              style={[styles.composerBtn, tagBar && styles.composerBtnActive]}
              testID="notes-tag-toggle"
            >
              <Hash color={tagBar ? ACCENT : Colors.muted} size={17} strokeWidth={2.6} />
            </Pressable>
            <View style={styles.inputWrap}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={isEditing ? "Edit your note…" : "Capture a thought…"}
                placeholderTextColor={Colors.muted2}
                style={styles.input}
                multiline
                testID="notes-input"
              />
            </View>
            <Pressable
              onPress={onSend}
              style={[
                styles.sendBtn,
                { backgroundColor: text.trim().length > 0 && hasValidConvId ? ACCENT : "rgba(63,169,255,0.25)" },
              ]}
              disabled={text.trim().length === 0 || !hasValidConvId}
              testID="notes-send"
            >
              <Send color="#FFFFFF" size={15} strokeWidth={2.8} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function renderRow(
  onLongPress: (n: NoteItem) => void,
  onToggleTodo: (n: NoteItem) => void,
): ListRenderItem<ListRow> {
  return ({ item }) => {
    if (item.kind === "day") {
      return (
        <View style={styles.daySep}>
          <View style={styles.dayLine} />
          <Text style={styles.dayText}>{item.label}</Text>
          <View style={styles.dayLine} />
        </View>
      );
    }
    const n = item.note!;
    const isTodo = /^\[[ x]\]/i.test(n.body) || n.done;
    return (
      <Pressable
        onLongPress={() => onLongPress(n)}
        delayLongPress={260}
        style={styles.noteWrap}
        testID={`note-${n.id}`}
      >
        <View style={[styles.noteBubble, n.pinned && styles.noteBubblePinned]}>
          {n.imageUrl ? (
            <ExpoImage source={{ uri: n.imageUrl }} style={styles.noteImage} contentFit="cover" />
          ) : null}
          <View style={styles.noteRow}>
            {isTodo ? (
              <Pressable
                onPress={() => onToggleTodo(n)}
                hitSlop={10}
                style={styles.todoCheck}
                testID={`note-todo-${n.id}`}
              >
                {n.done ? (
                  <CheckCircle2 color={ACCENT} size={18} strokeWidth={2.4} />
                ) : (
                  <Circle color={Colors.muted} size={18} strokeWidth={2.2} />
                )}
              </Pressable>
            ) : null}
            <Text style={[styles.noteText, n.done && styles.noteTextDone]}>
              {n.body || (n.imageUrl ? "Photo" : "")}
            </Text>
          </View>
          {n.ticker ? (
            <View style={styles.tickerPill}>
              <Text style={styles.tickerPillText}>{n.ticker}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.noteMeta}>
          {n.pinned ? <Sparkles color={ACCENT} size={10} strokeWidth={2.6} /> : null}
          <Text style={styles.noteTime}>{formatTime(n.createdAt)}</Text>
        </View>
      </Pressable>
    );
  };
}

function Header({ onBack, subtitle }: { onBack: () => void; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.iconBtn} testID="notes-back">
        <ArrowLeft color={ACCENT} size={22} strokeWidth={2.4} />
      </Pressable>
      <View style={styles.headTextWrap}>
        <View style={styles.headTitleRow}>
          <View style={styles.headIcon}>
            <NotebookPen color={ACCENT} size={14} strokeWidth={2.6} />
          </View>
          <Text style={styles.headTitle}>Notes to self</Text>
        </View>
        <Text style={styles.headSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.iconBtn} />
    </View>
  );
}

function EmptyState({ username }: { username: string }) {
  return (
    <View style={styles.emptyState}>
      <LinearGradient
        colors={["rgba(63,169,255,0.20)", "rgba(63,169,255,0.04)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.emptyHero}
      >
        <NotebookPen color={ACCENT} size={28} strokeWidth={2.2} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>Welcome back, @{username}</Text>
      <Text style={styles.emptyBody}>
        This is your private space. Drop alpha, lists, links, or todos. Nothing here is shared with anyone.
      </Text>
      <View style={styles.emptyHints}>
        <View style={styles.emptyHintRow}>
          <Hash color={ACCENT} size={12} strokeWidth={2.6} />
          <Text style={styles.emptyHintText}>Tap # for quick tags or todo</Text>
        </View>
        <View style={styles.emptyHintRow}>
          <Sparkles color={ACCENT} size={12} strokeWidth={2.6} />
          <Text style={styles.emptyHintText}>Long-press notes to edit, delete, pin, or complete them.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  bgGlow: { ...StyleSheet.absoluteFillObject, opacity: 0.6 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    backgroundColor: "rgba(5,7,13,0.92)",
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headTextWrap: { flex: 1 },
  headTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(63,169,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headTitle: { color: Colors.text, fontSize: 17, fontWeight: "700" },
  headSubtitle: { color: Colors.muted, fontSize: 11.5, marginTop: 1 },
  pinnedStrip: { paddingTop: 10, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  pinnedHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, marginBottom: 6 },
  pinnedLabel: { color: ACCENT, fontSize: 10.5, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase" },
  pinnedRow: { paddingHorizontal: 14, gap: 8 },
  pinnedCard: {
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    width: 180,
    minHeight: 56,
  },
  pinnedCardText: { color: Colors.text, fontSize: 12.5, lineHeight: 17 },
  listContent: { padding: 14, paddingBottom: 32, flexGrow: 1 },
  daySep: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  dayText: { color: Colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.6 },
  noteWrap: { alignSelf: "flex-start", maxWidth: "92%", marginBottom: 10 },
  noteBubble: {
    backgroundColor: NOTE_BUBBLE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteBubblePinned: { borderColor: ACCENT, backgroundColor: "rgba(63,169,255,0.22)" },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  todoCheck: { paddingTop: 1 },
  noteText: { color: Colors.text, fontSize: 14.5, lineHeight: 20, flex: 1 },
  noteTextDone: { color: Colors.muted, textDecorationLine: "line-through" },
  noteImage: { width: 220, height: 160, borderRadius: 12, marginBottom: 8 },
  tickerPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(63,169,255,0.22)",
  },
  tickerPillText: { color: ACCENT, fontSize: 11, fontWeight: "700" },
  noteMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, paddingHorizontal: 4 },
  noteTime: { color: Colors.muted2, fontSize: 10.5 },
  tagStrip: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, backgroundColor: "rgba(5,7,13,0.95)" },
  tagRow: { paddingHorizontal: 12, gap: 8 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tagChipAccent: { backgroundColor: ACCENT, borderColor: ACCENT },
  tagChipText: { color: ACCENT, fontSize: 12.5, fontWeight: "600" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    backgroundColor: "rgba(5,7,13,0.96)",
  },
  composerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  composerBtnActive: { backgroundColor: "rgba(63,169,255,0.20)" },
  inputWrap: {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
    maxHeight: 140,
  },
  input: { color: Colors.text, fontSize: 14.5, lineHeight: 19, padding: 0, margin: 0 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  lockBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(63,169,255,0.16)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyState: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 60, gap: 12 },
  emptyHero: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyBody: { color: Colors.muted, fontSize: 13.5, lineHeight: 19, textAlign: "center", maxWidth: 280 },
  emptyHints: { marginTop: 12, gap: 8, alignItems: "flex-start" },
  emptyHintRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  emptyHintText: { color: Colors.muted, fontSize: 12.5 },
  primaryBtn: { marginTop: 6, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, backgroundColor: ACCENT },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "700" },
  errorBanner: {
    margin: 14,
    padding: 12,
    backgroundColor: "rgba(255,69,58,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,69,58,0.30)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorBannerText: { flex: 1, color: "#FFB4B0", fontSize: 12.5 },
  errorRetry: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.10)" },
  errorRetryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  hintBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  hintIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(63,169,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: { flex: 1, color: Colors.muted, fontSize: 11.5, lineHeight: 16 },
  editBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(63,169,255,0.14)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  editBarIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(63,169,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  editBarText: { flex: 1, color: Colors.text, fontSize: 12.5, fontWeight: "600" },
  editBarCancel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  editBarCancelText: { color: Colors.text, fontSize: 11.5, fontWeight: "600" },
  composerEditing: { borderTopColor: ACCENT, backgroundColor: "rgba(63,169,255,0.06)" },
});

void Trash2;
