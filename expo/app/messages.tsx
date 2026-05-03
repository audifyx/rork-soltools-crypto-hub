import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  BellOff,
  Coins,
  Inbox,
  MessageCircle,
  Pin,
  Plus,
  Search,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  ListRenderItem,
  Modal,
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
import AppBackground from "@/components/ui/AppBackground";
import { Conversation, DMUser, useMessages } from "@/providers/messages-provider";

type Tab = "inbox" | "requests";

function timeAgo(t: number): string {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export default function MessagesScreen() {
  const router = useRouter();
  const {
    inbox,
    requests,
    totalUnread,
    suggestedUsers,
    ensureConversationWith,
  } = useMessages();
  const [tab, setTab] = useState<Tab>("inbox");
  const [query, setQuery] = useState<string>("");
  const [composeOpen, setComposeOpen] = useState<boolean>(false);

  const dataSource = tab === "inbox" ? inbox : requests;

  const filtered = useMemo<Conversation[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return dataSource;
    return dataSource.filter(
      (c) =>
        c.user.handle.toLowerCase().includes(q) ||
        c.user.name.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q),
    );
  }, [dataSource, query]);

  const openConvo = async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/dm/[id]", params: { id } });
  };

  const onStartWith = async (user: DMUser) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const id = await ensureConversationWith(user);
      setComposeOpen(false);
      setQuery("");
      router.push({ pathname: "/dm/[id]", params: { id } });
    } catch (e) {
      Alert.alert("Message failed", e instanceof Error ? e.message : "Try again.");
    }
  };

  const renderItem: ListRenderItem<Conversation> = ({ item }) => (
    <ConversationRow conv={item} onPress={() => openConvo(item.id)} />
  );

  return (
    <View style={styles.root} testID="messages-screen">
      <AppBackground variant="social" />
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="messages-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headTitleWrap}>
            <View style={styles.eyebrowRow}>
              <MessageCircle color={Colors.cyan} size={12} strokeWidth={2.8} />
              <Text style={styles.eyebrow}>DIRECT</Text>
              {totalUnread > 0 ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadPillText}>{totalUnread}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.title}>Messages</Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setComposeOpen(true);
            }}
            style={styles.composeBtn}
            testID="compose-dm"
          >
            <Plus color={Colors.ink} size={14} strokeWidth={3} />
            <Text style={styles.composeText}>NEW</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Search color={Colors.muted} size={15} strokeWidth={2.4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search messages and traders..."
            placeholderTextColor={Colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <X color={Colors.muted} size={14} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.tabsWrap}>
          {(["inbox", "requests"] as Tab[]).map((t) => {
            const active = tab === t;
            const count = t === "inbox" ? inbox.length : requests.length;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setTab(t);
                }}
                style={[styles.tab, active && styles.tabActive]}
                testID={`messages-tab-${t}`}
              >
                <Text style={[styles.tabText, active && { color: Colors.text }]}>
                  {t === "inbox" ? "Inbox" : "Requests"}
                </Text>
                <View style={styles.tabCount}>
                  <Text style={styles.tabCountText}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            tab === "inbox" && suggestedUsers.length > 0 ? (
              <View style={styles.suggestionsWrap}>
                <View style={styles.suggestionsHead}>
                  <Sparkles color={Colors.violet} size={12} strokeWidth={2.8} />
                  <Text style={styles.suggestionsTitle}>Start a conversation</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionsRow}
                >
                  {suggestedUsers.slice(0, 8).map((u) => (
                    <Pressable
                      key={u.handle}
                      onPress={() => onStartWith(u)}
                      style={styles.suggestCard}
                      testID={`suggest-${u.handle}`}
                    >
                      <View style={[styles.suggestAvatar, { backgroundColor: u.color }]}>
                        <Text style={styles.suggestInit}>
                          {u.name.slice(0, 1).toUpperCase()}
                        </Text>
                        {u.online ? <View style={styles.onlineRing} /> : null}
                      </View>
                      <Text style={styles.suggestName} numberOfLines={1}>
                        {u.name}
                      </Text>
                      <Text style={styles.suggestHandle} numberOfLines={1}>
                        {u.handle}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                {tab === "inbox" ? (
                  <Inbox color={Colors.cyan} size={28} strokeWidth={2.4} />
                ) : (
                  <UserPlus color={Colors.violet} size={28} strokeWidth={2.4} />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {tab === "inbox" ? "No messages yet" : "No pending requests"}
              </Text>
              <Text style={styles.emptyBody}>
                {tab === "inbox"
                  ? "Tap NEW to message a trader, founder, or whale on SolTools."
                  : "When traders you don't follow message you, they'll land here first."}
              </Text>
            </View>
          }
        />
      </SafeAreaView>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPickUser={onStartWith}
      />
    </View>
  );
}

function ConversationRow({ conv, onPress }: { conv: Conversation; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`convo-${conv.id}`}>
      <View style={[styles.avatarWrap]}>
        <View style={[styles.avatar, { backgroundColor: conv.user.color }]}>
          <Text style={styles.avatarInit}>
            {conv.user.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        {conv.user.online ? <View style={styles.onlineDot} /> : null}
      </View>
      <View style={styles.rowMid}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {conv.user.name}
          </Text>
          {conv.user.verified ? (
            <BadgeCheck color={Colors.cyan} size={13} strokeWidth={2.8} />
          ) : null}
          <Text style={styles.rowHandle} numberOfLines={1}>
            {conv.user.handle}
          </Text>
          <Text style={styles.rowDot}>·</Text>
          <Text style={styles.rowTime}>{timeAgo(conv.lastAt)}</Text>
        </View>
        <Text
          style={[
            styles.rowLast,
            conv.unread > 0 && { color: Colors.text, fontWeight: "800" },
          ]}
          numberOfLines={1}
        >
          {conv.lastMessage || "Say hi 👋"}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        {conv.pinned ? (
          <Pin color={Colors.orange} size={11} strokeWidth={2.8} />
        ) : null}
        {conv.muted ? (
          <BellOff color={Colors.muted} size={11} strokeWidth={2.4} />
        ) : null}
        {conv.unread > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{conv.unread}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function ComposeModal({
  open,
  onClose,
  onPickUser,
}: {
  open: boolean;
  onClose: () => void;
  onPickUser: (u: DMUser) => void;
}) {
  const { knownUsers, conversations } = useMessages();
  const [q, setQ] = useState<string>("");
  const slide = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  const filtered = useMemo<DMUser[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length === 0) return knownUsers;
    return knownUsers.filter(
      (u) =>
        u.handle.toLowerCase().includes(term) ||
        u.name.toLowerCase().includes(term),
    );
  }, [q, knownUsers]);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.modalSheet,
            {
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [600, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New message</Text>
              <Pressable onPress={onClose} style={styles.iconBtnSmall}>
                <X color={Colors.text} size={16} strokeWidth={2.4} />
              </Pressable>
            </View>
            <View style={styles.modalSearch}>
              <Search color={Colors.muted} size={14} strokeWidth={2.4} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search by handle or name..."
                placeholderTextColor={Colors.muted}
                style={styles.modalSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(u) => u.handle}
              renderItem={({ item }) => {
                const existing = conversations.some((c) => c.user.handle === item.handle);
                return (
                  <Pressable
                    onPress={() => onPickUser(item)}
                    style={styles.modalRow}
                    testID={`pick-${item.handle}`}
                  >
                    <View style={[styles.modalAvatar, { backgroundColor: item.color }]}>
                      <Text style={styles.modalAvatarInit}>
                        {item.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.modalNameRow}>
                        <Text style={styles.modalName}>{item.name}</Text>
                        {item.verified ? (
                          <BadgeCheck color={Colors.cyan} size={12} strokeWidth={2.8} />
                        ) : null}
                      </View>
                      <Text style={styles.modalSub} numberOfLines={1}>
                        {item.handle}
                        {item.bio ? ` · ${item.bio}` : ""}
                      </Text>
                    </View>
                    {existing ? (
                      <View style={styles.existingPill}>
                        <Text style={styles.existingText}>OPEN</Text>
                      </View>
                    ) : (
                      <Coins color={Colors.muted} size={14} strokeWidth={2.4} />
                    )}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.modalSep} />}
              contentContainerStyle={{ paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  headTitleWrap: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyebrow: { color: Colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  unreadPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: Colors.rose,
    minWidth: 18,
    alignItems: "center",
  },
  unreadPillText: { color: Colors.text, fontSize: 9, fontWeight: "900" },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8, marginTop: 2 },
  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.cyan,
  },
  composeText: { color: Colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  searchWrap: {
    marginHorizontal: 18,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "600", padding: 0 },

  tabsWrap: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
    marginHorizontal: 18,
    padding: 4,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: "rgba(255,255,255,0.06)" },
  tabText: { color: Colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  tabCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    minWidth: 20,
    alignItems: "center",
  },
  tabCountText: { color: Colors.text, fontSize: 9, fontWeight: "900" },

  listContent: { paddingTop: 8, paddingBottom: 140 },
  sep: { height: 1, marginHorizontal: 18, backgroundColor: "rgba(255,255,255,0.04)" },

  suggestionsWrap: { marginTop: 14, marginBottom: 6 },
  suggestionsHead: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  suggestionsTitle: { color: Colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  suggestionsRow: { paddingHorizontal: 14, gap: 10 },
  suggestCard: {
    width: 92,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  suggestAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestInit: { color: Colors.ink, fontSize: 18, fontWeight: "900" },
  onlineRing: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.mint,
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  suggestName: { color: Colors.text, fontSize: 11, fontWeight: "900", marginTop: 8 },
  suggestHandle: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInit: { color: Colors.ink, fontSize: 20, fontWeight: "900" },
  onlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.mint,
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  rowMid: { flex: 1 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowName: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, flexShrink: 1 },
  rowHandle: { color: Colors.muted, fontSize: 11, fontWeight: "700", maxWidth: 100 },
  rowDot: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  rowTime: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  rowLast: { color: Colors.muted, fontSize: 12, fontWeight: "600", marginTop: 3 },
  rowEnd: { alignItems: "flex-end", gap: 4 },
  unreadBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Colors.cyan,
    alignItems: "center",
  },
  unreadText: { color: Colors.ink, fontSize: 10, fontWeight: "900" },

  empty: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "rgba(56,215,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    height: "82%",
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 14,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  iconBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  modalAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalAvatarInit: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  modalNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  modalName: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  modalSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  modalSep: { height: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  existingPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.16)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
  },
  existingText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
});

