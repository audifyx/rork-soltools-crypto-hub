import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  BellOff,
  ChevronRight,
  Coins,
  Inbox,
  Pencil,
  Pin,
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
import { navigateBack } from "@/lib/navigation";
import { Conversation, DMUser, useMessageableUsersSearch, useMessages } from "@/providers/messages-provider";

type Tab = "inbox" | "requests";

const IOS_BLUE = "#007AFF";
const IOS_BG = "#F2F2F7";
const IOS_CARD = "#FFFFFF";
const IOS_TEXT = "#111111";
const IOS_SECONDARY = "#6B6B70";
const IOS_SEPARATOR = "#D9D9DE";

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
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/home")}
            style={styles.navTextButton}
            testID="messages-back"
          >
            <ArrowLeft color={IOS_BLUE} size={18} strokeWidth={2.4} />
            <Text style={styles.navText}>Home</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setComposeOpen(true);
            }}
            style={styles.circleCompose}
            testID="compose-dm"
          >
            <Pencil color={IOS_BLUE} size={19} strokeWidth={2.3} />
          </Pressable>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Messages</Text>
          {totalUnread > 0 ? (
            <View style={styles.titleBadge}>
              <Text style={styles.titleBadgeText}>{totalUnread}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.searchWrap}>
          <Search color={Colors.muted} size={15} strokeWidth={2.4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
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

        <View style={styles.filterWrap}>
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
                style={[styles.filterChip, active && styles.filterChipActive]}
                testID={`messages-tab-${t}`}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {t === "inbox" ? "Inbox" : "Requests"}
                </Text>
                {count > 0 ? (
                  <View style={[styles.filterCount, active && styles.filterCountActive]}>
                    <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text>
                  </View>
                ) : null}
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
                  <Sparkles color={IOS_BLUE} size={13} strokeWidth={2.6} />
                  <Text style={styles.suggestionsTitle}>Pinned</Text>
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
                      <LinearGradient colors={[u.color, `${u.color}99`]} style={styles.suggestAvatar}>
                        <Text style={styles.suggestInit}>
                          {u.name.slice(0, 1).toUpperCase()}
                        </Text>
                        {u.online ? <View style={styles.onlineRing} /> : null}
                      </LinearGradient>
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
                  <Inbox color={IOS_BLUE} size={28} strokeWidth={2.4} />
                ) : (
                  <UserPlus color={IOS_BLUE} size={28} strokeWidth={2.4} />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {tab === "inbox" ? "No messages yet" : "No pending requests"}
              </Text>
              <Text style={styles.emptyBody}>
                {tab === "inbox"
                  ? "Tap the compose button to message a trader, founder, or whale on SolTools."
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
            <BadgeCheck color={IOS_BLUE} size={13} strokeWidth={2.8} />
          ) : null}
          <Text style={styles.rowHandle} numberOfLines={1}>
            {conv.user.handle}
          </Text>
        </View>
        <Text
          style={[
            styles.rowLast,
            conv.unread > 0 && styles.rowLastUnread,
          ]}
          numberOfLines={1}
        >
          {conv.lastMessage || "iMessage"}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        {conv.pinned ? (
          <Pin color={Colors.orange} size={11} strokeWidth={2.8} />
        ) : null}
        {conv.muted ? (
          <BellOff color={Colors.muted} size={11} strokeWidth={2.4} />
        ) : null}
        <Text style={[styles.rowTimeEnd, conv.unread > 0 && styles.rowTimeUnread]}>{timeAgo(conv.lastAt)}</Text>
        <View style={styles.endMetaRow}>
          {conv.pinned ? (
            <Pin color={IOS_SECONDARY} size={11} strokeWidth={2.4} />
          ) : null}
          {conv.muted ? (
            <BellOff color={IOS_SECONDARY} size={11} strokeWidth={2.2} />
          ) : null}
          {conv.unread > 0 ? <View style={styles.unreadDot} /> : null}
          <ChevronRight color="#C7C7CC" size={16} strokeWidth={2.1} />
        </View>
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
  const search = useMessageableUsersSearch(q);

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
    const remote = search.data ?? [];
    // Merge remote + locally known users, dedup by userId/handle.
    const merged: DMUser[] = [...remote, ...knownUsers];
    const seen = new Set<string>();
    const out: DMUser[] = [];
    for (const u of merged) {
      const key = u.userId ?? u.handle;
      if (seen.has(key)) continue;
      seen.add(key);
      if (term.length === 0) {
        out.push(u);
      } else if (
        u.handle.toLowerCase().includes(term) ||
        u.name.toLowerCase().includes(term)
      ) {
        out.push(u);
      }
    }
    return out;
  }, [q, knownUsers, search.data]);

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
                <X color={IOS_BLUE} size={16} strokeWidth={2.4} />
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
                          <BadgeCheck color={IOS_BLUE} size={12} strokeWidth={2.8} />
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
                      <Coins color={IOS_SECONDARY} size={14} strokeWidth={2.4} />
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
  root: { flex: 1, backgroundColor: IOS_BG, overflow: "hidden" },
  safe: { flex: 1 },
  navBar: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navTextButton: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 8 },
  navText: { color: IOS_BLUE, fontSize: 17, fontWeight: "400" },
  circleCompose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    paddingHorizontal: 20,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  title: { color: IOS_TEXT, fontSize: 34, fontWeight: "800", letterSpacing: -1.2 },
  titleBadge: {
    minWidth: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: IOS_BLUE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    marginTop: 5,
  },
  titleBadgeText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
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
    marginHorizontal: 20,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 9 : 7,
    borderRadius: 11,
    backgroundColor: "#E3E3E8",
  },
  searchInput: { flex: 1, color: IOS_TEXT, fontSize: 17, fontWeight: "400", padding: 0 },

  filterWrap: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    marginHorizontal: 20,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#E5E5EA",
  },
  filterChipActive: { backgroundColor: IOS_BLUE },
  filterText: { color: IOS_SECONDARY, fontSize: 15, fontWeight: "600" },
  filterTextActive: { color: "#FFFFFF" },
  filterCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.09)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.24)" },
  filterCountText: { color: IOS_SECONDARY, fontSize: 11, fontWeight: "700" },
  filterCountTextActive: { color: "#FFFFFF" },

  listContent: { paddingTop: 10, paddingBottom: 140 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 88, backgroundColor: IOS_SEPARATOR },

  suggestionsWrap: { marginTop: 16, marginBottom: 8 },
  suggestionsHead: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  suggestionsTitle: { color: IOS_SECONDARY, fontSize: 13, fontWeight: "700" },
  suggestionsRow: { paddingHorizontal: 16, gap: 14 },
  suggestCard: {
    width: 76,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  suggestAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestInit: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  onlineRing: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.mint,
    borderWidth: 2,
    borderColor: IOS_BG,
  },
  suggestName: { color: IOS_TEXT, fontSize: 12, fontWeight: "600", marginTop: 7 },
  suggestHandle: { color: IOS_SECONDARY, fontSize: 11, fontWeight: "400", marginTop: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 20,
    paddingRight: 10,
    paddingVertical: 10,
    backgroundColor: IOS_CARD,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInit: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  onlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.mint,
    borderWidth: 2,
    borderColor: IOS_CARD,
  },
  rowMid: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowName: { color: IOS_TEXT, fontSize: 17, fontWeight: "600", letterSpacing: -0.2, flexShrink: 1 },
  rowHandle: { color: IOS_SECONDARY, fontSize: 13, fontWeight: "400", maxWidth: 82 },
  rowDot: { color: IOS_SECONDARY, fontSize: 13, fontWeight: "400" },
  rowTime: { color: IOS_SECONDARY, fontSize: 13, fontWeight: "400" },
  rowLast: { color: IOS_SECONDARY, fontSize: 15, fontWeight: "400", marginTop: 2 },
  rowLastUnread: { color: IOS_TEXT, fontWeight: "600" },
  rowEnd: { alignItems: "flex-end", gap: 5, minWidth: 42 },
  rowTimeEnd: { color: IOS_SECONDARY, fontSize: 13, fontWeight: "400" },
  rowTimeUnread: { color: IOS_BLUE, fontWeight: "600" },
  endMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: IOS_BLUE,
  },

  empty: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#E5E5EA",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { color: IOS_TEXT, fontSize: 18, fontWeight: "700" },
  emptyBody: {
    color: IOS_SECONDARY,
    fontSize: 14,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.22)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    height: "82%",
    backgroundColor: IOS_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C7C7CC",
    marginBottom: 14,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: { color: IOS_TEXT, fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  iconBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E5E5EA",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    borderRadius: 11,
    backgroundColor: "#E3E3E8",
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    color: IOS_TEXT,
    fontSize: 17,
    fontWeight: "400",
    padding: 0,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  modalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modalAvatarInit: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  modalNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  modalName: { color: IOS_TEXT, fontSize: 16, fontWeight: "600" },
  modalSub: { color: IOS_SECONDARY, fontSize: 13, fontWeight: "400", marginTop: 2 },
  modalSep: { height: StyleSheet.hairlineWidth, backgroundColor: IOS_SEPARATOR, marginLeft: 56 },
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

