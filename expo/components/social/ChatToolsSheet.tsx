import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  Bookmark,
  Clock,
  Hourglass,
  Pin,
  Search as SearchIcon,
  Timer,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Colors from "@/constants/colors";
import {
  listPinnedMessages,
  searchDmMessages,
  setDisappearing,
  type DmSearchHit,
  type PinnedMessageRow,
} from "@/lib/api/platform";
import { hapticSelect } from "@/lib/haptics";

type Pane = "menu" | "search" | "pinned" | "disappear";

const TIMER_OPTIONS: { seconds: number; label: string }[] = [
  { seconds: 0, label: "Off" },
  { seconds: 60, label: "1 minute" },
  { seconds: 5 * 60, label: "5 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 24 * 3600, label: "24 hours" },
  { seconds: 7 * 24 * 3600, label: "7 days" },
];

interface Props {
  open: boolean;
  conversationId: string | null;
  onClose: () => void;
}

export default function ChatToolsSheet({ open, conversationId, onClose }: Props) {
  const [pane, setPane] = useState<Pane>("menu");
  const [query, setQuery] = useState<string>("");

  const queryClient = useQueryClient();

  const pinnedQuery = useQuery<PinnedMessageRow[]>({
    queryKey: ["dm", "pinned", conversationId ?? "none"],
    enabled: open && pane === "pinned" && !!conversationId,
    queryFn: () => (conversationId ? listPinnedMessages(conversationId) : Promise.resolve([])),
    staleTime: 10_000,
  });

  const searchQuery = useQuery<DmSearchHit[]>({
    queryKey: ["dm", "search", conversationId ?? "none", query.trim()],
    enabled: open && pane === "search" && !!conversationId && query.trim().length > 1,
    queryFn: () =>
      conversationId ? searchDmMessages(conversationId, query.trim()) : Promise.resolve([]),
    staleTime: 5_000,
  });

  const close = () => {
    setPane("menu");
    setQuery("");
    onClose();
  };

  const setTimer = async (seconds: number) => {
    if (!conversationId) return;
    hapticSelect().catch(() => {});
    try {
      await setDisappearing(conversationId, seconds);
      queryClient.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
      Alert.alert(
        "Disappearing messages",
        seconds === 0
          ? "Disappearing is off."
          : `New messages will disappear after ${humanSeconds(seconds)}.`,
      );
      setPane("menu");
    } catch (e) {
      Alert.alert("Couldn't update", e instanceof Error ? e.message : "Try again.");
    }
  };

  const menuItems: { id: Pane; label: string; sub: string; Icon: typeof Pin; tint: string }[] = [
    { id: "search", label: "Search in chat", sub: "Find any past message", Icon: SearchIcon, tint: Colors.mint },
    { id: "pinned", label: "Pinned messages", sub: "Quick-access alpha & links", Icon: Pin, tint: "#FF8C28" },
    { id: "disappear", label: "Disappearing messages", sub: "Auto-delete on a timer", Icon: Hourglass, tint: Colors.violet },
  ];

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.head}>
            {pane !== "menu" ? (
              <Pressable onPress={() => setPane("menu")} style={styles.iconBtn} testID="chat-tools-back">
                <Text style={styles.backText}>‹</Text>
              </Pressable>
            ) : (
              <View style={styles.iconBtn} />
            )}
            <Text style={styles.headTitle}>
              {pane === "search"
                ? "Search in chat"
                : pane === "pinned"
                  ? "Pinned messages"
                  : pane === "disappear"
                    ? "Disappearing messages"
                    : "Chat tools"}
            </Text>
            <Pressable onPress={close} style={styles.iconBtn} testID="chat-tools-close">
              <X color={Colors.text} size={16} strokeWidth={2.6} />
            </Pressable>
          </View>

          {pane === "menu" ? (
            <View style={styles.menuList}>
              {menuItems.map((it) => {
                const Icon = it.Icon;
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => {
                      hapticSelect().catch(() => {});
                      setPane(it.id);
                    }}
                    style={styles.menuRow}
                    testID={`chat-tools-${it.id}`}
                  >
                    <View style={[styles.menuIcon, { backgroundColor: `${it.tint}22`, borderColor: `${it.tint}55` }]}>
                      <Icon color={it.tint} size={18} strokeWidth={2.6} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuLabel}>{it.label}</Text>
                      <Text style={styles.menuSub}>{it.sub}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {pane === "search" ? (
            <View style={styles.paneBody}>
              <View style={styles.searchInputWrap}>
                <SearchIcon color={Colors.muted} size={15} strokeWidth={2.4} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search messages…"
                  placeholderTextColor={Colors.muted}
                  style={styles.searchInput}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={10}>
                    <X color={Colors.muted} size={14} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>
              <FlatList
                data={searchQuery.data ?? []}
                keyExtractor={(h) => h.id}
                contentContainerStyle={styles.resultsList}
                renderItem={({ item }) => (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultDate}>{new Date(item.created_at).toLocaleString()}</Text>
                    <Text style={styles.resultText}>{item.body ?? "(media)"}</Text>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyPane}>
                    {searchQuery.isFetching ? (
                      <ActivityIndicator color={Colors.goldBright} />
                    ) : (
                      <Text style={styles.emptyText}>
                        {query.trim().length <= 1 ? "Type to search this chat" : "No matches"}
                      </Text>
                    )}
                  </View>
                }
              />
            </View>
          ) : null}

          {pane === "pinned" ? (
            <View style={styles.paneBody}>
              <FlatList
                data={pinnedQuery.data ?? []}
                keyExtractor={(p) => p.id}
                contentContainerStyle={styles.resultsList}
                renderItem={({ item }) => (
                  <View style={styles.pinnedRow}>
                    <View style={styles.pinIcon}>
                      <Bookmark color="#FF8C28" size={13} strokeWidth={2.6} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultDate}>{new Date(item.created_at).toLocaleString()}</Text>
                      <Text style={styles.resultText} numberOfLines={4}>
                        {item.body ?? (item.ticker ? `$${item.ticker}` : "(media)")}
                      </Text>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyPane}>
                    {pinnedQuery.isFetching ? (
                      <ActivityIndicator color={Colors.goldBright} />
                    ) : (
                      <Text style={styles.emptyText}>
                        Long-press any message and tap pin to keep it here.
                      </Text>
                    )}
                  </View>
                }
              />
            </View>
          ) : null}

          {pane === "disappear" ? (
            <View style={styles.paneBody}>
              <Text style={styles.disappearHint}>
                Once a message is read, the countdown starts. Off keeps everything in this chat.
              </Text>
              <View style={styles.timerList}>
                {TIMER_OPTIONS.map((t) => (
                  <Pressable
                    key={t.seconds}
                    onPress={() => setTimer(t.seconds)}
                    style={styles.timerRow}
                    testID={`disappear-${t.seconds}`}
                  >
                    <View style={styles.timerIcon}>
                      {t.seconds === 0 ? (
                        <X color={Colors.muted} size={15} strokeWidth={2.6} />
                      ) : (
                        <Timer color={Colors.violet} size={15} strokeWidth={2.6} />
                      )}
                    </View>
                    <Text style={styles.timerLabel}>{t.label}</Text>
                    <View style={styles.timerArrow}>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <Pressable onPress={close} style={styles.cancel} testID="chat-tools-cancel">
            <LinearGradient
              colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.02)"]}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.cancelText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function humanSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 24 * 3600) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    height: "78%",
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingTop: 10,
  },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.20)", marginBottom: 8 },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  backText: { color: Colors.text, fontSize: 20, fontWeight: "900", lineHeight: 22 },
  headTitle: { flex: 1, textAlign: "center", color: Colors.text, fontSize: 15, fontWeight: "900" },
  menuList: { paddingHorizontal: 14, paddingTop: 8, gap: 8 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  menuIcon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  menuLabel: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  menuSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  chevron: { color: Colors.muted, fontSize: 22, fontWeight: "700" },
  paneBody: { flex: 1, paddingHorizontal: 14, paddingTop: 6 },
  searchInputWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "700", padding: 0 },
  resultsList: { paddingVertical: 10, gap: 8 },
  resultRow: { padding: 12, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  resultDate: { color: Colors.muted, fontSize: 10, fontWeight: "800", marginBottom: 4 },
  resultText: { color: Colors.text, fontSize: 13, fontWeight: "700", lineHeight: 17 },
  pinnedRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,140,40,0.18)" },
  pinIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(255,140,40,0.18)", borderWidth: 1, borderColor: "rgba(255,140,40,0.4)", alignItems: "center", justifyContent: "center" },
  emptyPane: { paddingVertical: 36, alignItems: "center" },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center", paddingHorizontal: 20, lineHeight: 18 },
  disappearHint: { color: Colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, paddingHorizontal: 4, paddingBottom: 10 },
  timerList: { gap: 6 },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  timerIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(91,141,239,0.14)", borderWidth: 1, borderColor: "rgba(91,141,239,0.36)", alignItems: "center", justifyContent: "center" },
  timerLabel: { color: Colors.text, fontSize: 14, fontWeight: "800", flex: 1 },
  timerArrow: { width: 22, alignItems: "flex-end" },
  cancel: { margin: 14, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  cancelText: { color: Colors.text, fontSize: 14, fontWeight: "900" },
});
