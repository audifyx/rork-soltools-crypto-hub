import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  BellOff,
  CheckCheck,
  ChevronRight,
  Coins,
  Hand,
  Inbox,
  Mail,
  Pencil,
  Pin,
  PinOff,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
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

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { Conversation, DMUser, useMessageableUsersSearch, useMessages } from "@/providers/messages-provider";

type Tab = "inbox" | "requests";
type SmartFilter = "all" | "unread" | "verified" | "pinned";

const ACCENT = Colors.mint;
const ACCENT_SOFT = "rgba(63,169,255,0.14)";
const CARD_BORDER = "rgba(255,255,255,0.08)";
const CARD_FILL = "rgba(11,15,26,0.86)";

const SCAM_PATTERNS: RegExp[] = [
  /\b(airdrop|claim|free\s*mint|wallet\s*connect|verify\s*wallet|seed\s*phrase|private\s*key)\b/i,
  /\b(2x|3x|10x|guaranteed)\b.*\b(profit|return|gains)\b/i,
  /\bt\.me\/[A-Za-z0-9_]+/i,
  /\b(bit\.ly|tinyurl|cutt\.ly|t\.co)\b/i,
  /\b(drain|drainer|metamask\s*support|trustwallet\s*support)\b/i,
];

function isLikelyScam(conv: Conversation): boolean {
  const text = `${conv.lastMessage} ${conv.user.bio ?? ""}`;
  if (!text.trim()) return false;
  return SCAM_PATTERNS.some((re) => re.test(text));
}

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

function presenceLabel(online: boolean | undefined, lastSeenAt: number | null | undefined): string | null {
  if (online) return "Active now";
  if (!lastSeenAt) return null;
  const diff = Math.max(0, Date.now() - lastSeenAt);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Active just now";
  if (min < 60) return `Active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Active ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Last seen ${day}d ago`;
  return null;
}

export default function MessagesScreen() {
  const router = useRouter();
  const {
    inbox,
    requests,
    totalUnread,
    suggestedUsers,
    ensureConversationWith,
    deleteConversation,
    deleteConversationForEveryone,
    togglePin,
    toggleMute,
    markRead,
  } = useMessages();
  const [tab, setTab] = useState<Tab>("inbox");
  const [smart, setSmart] = useState<SmartFilter>("all");
  const [query, setQuery] = useState<string>("");
  const [composeOpen, setComposeOpen] = useState<boolean>(false);

  const dataSource = tab === "inbox" ? inbox : requests;

  const filtered = useMemo<Conversation[]>(() => {
    const q = query.trim().toLowerCase();
    let list = dataSource;
    if (tab === "inbox") {
      if (smart === "unread") list = list.filter((c) => c.unread > 0);
      else if (smart === "verified") list = list.filter((c) => c.user.verified);
      else if (smart === "pinned") list = list.filter((c) => c.pinned);
    }
    if (q.length === 0) return list;
    return list.filter(
      (c) =>
        c.user.handle.toLowerCase().includes(q) ||
        c.user.name.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q),
    );
  }, [dataSource, query, smart, tab]);

  const unreadCount = useMemo<number>(() => inbox.filter((c) => c.unread > 0).length, [inbox]);
  const verifiedCount = useMemo<number>(() => inbox.filter((c) => c.user.verified).length, [inbox]);
  const pinnedCount = useMemo<number>(() => inbox.filter((c) => c.pinned).length, [inbox]);
  const flaggedCount = useMemo<number>(() => requests.filter(isLikelyScam).length, [requests]);

  const openConvo = async (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/dm/[id]", params: { id } });
  };

  const openSelfChat = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push("/notes-to-self");
  }, [router]);

  const onMarkAllRead = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const targets = inbox.filter((c) => c.unread > 0);
    if (targets.length === 0) return;
    await Promise.all(targets.map((c) => markRead(c.id).catch(() => {})));
  }, [inbox, markRead]);

  const [actionSheet, setActionSheet] = useState<Conversation | null>(null);
  const [hintDismissed, setHintDismissed] = useState<boolean>(false);

  const onLongPressConvo = (conv: Conversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActionSheet(conv);
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

  const onSwipePin = useCallback(
    async (conv: Conversation) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      try {
        await togglePin(conv.id);
      } catch (e) {
        Alert.alert("Pin failed", e instanceof Error ? e.message : "Try again.");
      }
    },
    [togglePin],
  );

  const onSwipeMute = useCallback(
    async (conv: Conversation) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      try {
        await toggleMute(conv.id);
      } catch (e) {
        Alert.alert("Mute failed", e instanceof Error ? e.message : "Try again.");
      }
    },
    [toggleMute],
  );

  const onSwipeArchive = useCallback(
    async (conv: Conversation) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      try {
        await deleteConversation(conv.id);
      } catch (e) {
        Alert.alert("Archive failed", e instanceof Error ? e.message : "Try again.");
      }
    },
    [deleteConversation],
  );

  const renderItem: ListRenderItem<Conversation> = ({ item }) => (
    <View style={styles.rowOuter}>
      <ConversationRow
        conv={item}
        scam={tab === "requests" && isLikelyScam(item)}
        onPress={() => openConvo(item.id)}
        onLongPress={() => onLongPressConvo(item)}
      />
    </View>
  );

  const smartChips: { id: SmartFilter; label: string; count: number; Icon: typeof Inbox }[] = [
    { id: "all", label: "All", count: inbox.length, Icon: Inbox },
    { id: "unread", label: "Unread", count: unreadCount, Icon: Mail },
    { id: "verified", label: "Verified", count: verifiedCount, Icon: BadgeCheck },
    { id: "pinned", label: "Pinned", count: pinnedCount, Icon: Pin },
  ];

  return (
    <View style={styles.root} testID="messages-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/home")}
            style={styles.backCircle}
            hitSlop={10}
            testID="messages-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Messages</Text>
            {totalUnread > 0 ? (
              <View style={styles.titleBadge}>
                <Text style={styles.titleBadgeText}>{totalUnread}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.navRight}>
            {tab === "inbox" && unreadCount > 0 ? (
              <Pressable
                onPress={onMarkAllRead}
                style={styles.markAllBtn}
                hitSlop={6}
                testID="mark-all-read"
              >
                <CheckCheck color={ACCENT} size={14} strokeWidth={2.6} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setComposeOpen(true);
              }}
              style={styles.circleCompose}
              testID="compose-dm"
            >
              <Pencil color={Colors.ink} size={17} strokeWidth={2.7} />
            </Pressable>
          </View>
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
                {t === "requests" && flaggedCount > 0 ? (
                  <View style={styles.flagDot}>
                    <ShieldAlert color={Colors.text} size={9} strokeWidth={2.8} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {tab === "inbox" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.smartRow}
          >
            {smartChips.map((s) => {
              const active = smart === s.id;
              const Icon = s.Icon;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSmart(s.id);
                  }}
                  style={({ pressed }) => [
                    styles.smartChip,
                    active && styles.smartChipActive,
                    pressed && styles.smartChipPressed,
                  ]}
                  testID={`smart-${s.id}`}
                >
                  <Icon
                    color={active ? ACCENT : Colors.muted}
                    size={13}
                    strokeWidth={2.6}
                    fill={active && s.id === "pinned" ? ACCENT : "transparent"}
                  />
                  <Text style={[styles.smartText, active && styles.smartTextActive]} numberOfLines={1}>
                    {s.label}
                  </Text>
                  {s.count > 0 ? (
                    <View style={[styles.smartCountBadge, active && styles.smartCountBadgeActive]}>
                      <Text style={[styles.smartCountText, active && styles.smartCountTextActive]}>
                        {s.count > 99 ? "99+" : s.count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {tab === "inbox" ? (
          <Pressable onPress={openSelfChat} style={styles.selfChatPin} testID="open-self-chat">
            <LinearGradient
              colors={["rgba(63,169,255,0.16)", "rgba(91,141,239,0.08)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.selfChatIcon}>
              <Sparkles color={ACCENT} size={14} strokeWidth={2.6} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.selfChatTitle}>Notes to self</Text>
              <Text style={styles.selfChatBody}>Private space for alpha, links, screenshots.</Text>
            </View>
            <ChevronRight color={Colors.muted} size={15} strokeWidth={2.4} />
          </Pressable>
        ) : null}

        {tab === "requests" && flaggedCount > 0 ? (
          <View style={styles.scamBanner}>
            <ShieldAlert color={Colors.orange} size={13} strokeWidth={2.6} />
            <Text style={styles.scamBannerText}>
              {flaggedCount} request{flaggedCount === 1 ? "" : "s"} flagged as likely scam
            </Text>
          </View>
        ) : null}

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            tab === "inbox" && smart === "all" && suggestedUsers.length > 0 ? (
              <View style={styles.suggestionsWrap}>
                <View style={styles.suggestionsHead}>
                  <Sparkles color={ACCENT} size={13} strokeWidth={2.6} />
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
                        {u.avatarUrl ? (
                          <ExpoImage source={{ uri: u.avatarUrl }} style={styles.suggestAvatarImg} contentFit="cover" />
                        ) : (
                          <Text style={styles.suggestInit}>
                            {u.name.slice(0, 1).toUpperCase()}
                          </Text>
                        )}
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
                  <Inbox color={ACCENT} size={28} strokeWidth={2.4} />
                ) : (
                  <UserPlus color={ACCENT} size={28} strokeWidth={2.4} />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {tab === "inbox"
                  ? smart === "all"
                    ? "No messages yet"
                    : `No ${smart} messages`
                  : "No pending requests"}
              </Text>
              <Text style={styles.emptyBody}>
                {tab === "inbox"
                  ? "Tap the compose button to message a trader, founder, or whale on Crypto Community App."
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

      <ActionSheet
        conv={actionSheet}
        onClose={() => setActionSheet(null)}
        onPin={async (c) => {
          setActionSheet(null);
          await onSwipePin(c);
        }}
        onMute={async (c) => {
          setActionSheet(null);
          await onSwipeMute(c);
        }}
        onArchive={async (c) => {
          setActionSheet(null);
          await onSwipeArchive(c);
        }}
        onMarkRead={async (c) => {
          setActionSheet(null);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          try {
            await markRead(c.id);
          } catch {}
        }}
        onDelete={(c) => {
          setActionSheet(null);
          Alert.alert(
            "Delete conversation?",
            `Choose how to remove your chat with ${c.user.name}.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete for me",
                onPress: async () => {
                  try {
                    await deleteConversation(c.id);
                  } catch (e) {
                    Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again.");
                  }
                },
              },
              {
                text: "Delete for everyone",
                style: "destructive",
                onPress: async () => {
                  try {
                    await deleteConversationForEveryone(c.id);
                  } catch (e) {
                    Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again.");
                  }
                },
              },
            ],
          );
        }}
      />
    </View>
  );
}

interface ActionSheetProps {
  conv: Conversation | null;
  onClose: () => void;
  onPin: (c: Conversation) => void;
  onMute: (c: Conversation) => void;
  onArchive: (c: Conversation) => void;
  onMarkRead: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}

function ActionSheet({ conv, onClose, onPin, onMute, onArchive, onMarkRead, onDelete }: ActionSheetProps) {
  const slide = useRef(new Animated.Value(0)).current;
  const open = conv !== null;

  React.useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  if (!conv) return null;

  const items: { id: string; label: string; Icon: typeof Pin; color?: string; destructive?: boolean; onPress: () => void }[] = [
    {
      id: "pin",
      label: conv.pinned ? "Unpin conversation" : "Pin conversation",
      Icon: conv.pinned ? PinOff : Pin,
      color: Colors.orange,
      onPress: () => onPin(conv),
    },
    {
      id: "mute",
      label: conv.muted ? "Unmute notifications" : "Mute notifications",
      Icon: BellOff,
      color: "#5B8DEF",
      onPress: () => onMute(conv),
    },
    ...(conv.unread > 0
      ? [
          {
            id: "read",
            label: "Mark as read",
            Icon: CheckCheck,
            color: ACCENT,
            onPress: () => onMarkRead(conv),
          },
        ]
      : []),
    {
      id: "archive",
      label: "Archive",
      Icon: Archive,
      color: "#9CA3AF",
      onPress: () => onArchive(conv),
    },
    {
      id: "delete",
      label: "Delete conversation",
      Icon: X,
      color: "#E63946",
      destructive: true,
      onPress: () => onDelete(conv),
    },
  ];

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.actionSheet,
            {
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [500, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.actionHead}>
              <View style={[styles.actionAvatar, { backgroundColor: conv.user.color }]}>
                {conv.user.avatarUrl ? (
                  <ExpoImage source={{ uri: conv.user.avatarUrl }} style={styles.actionAvatarImg} contentFit="cover" />
                ) : (
                  <Text style={styles.actionAvatarInit}>{conv.user.name.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.actionNameRow}>
                  <Text style={styles.actionName} numberOfLines={1}>{conv.user.name}</Text>
                  {conv.user.verified ? <BadgeCheck color={ACCENT} size={14} strokeWidth={2.8} /> : null}
                </View>
                <Text style={styles.actionHandle} numberOfLines={1}>{conv.user.handle}</Text>
              </View>
            </View>
            <View style={styles.actionList}>
              {items.map((it, idx) => {
                const Icon = it.Icon;
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      it.onPress();
                    }}
                    style={({ pressed }) => [
                      styles.actionItem,
                      idx !== items.length - 1 && styles.actionItemDivider,
                      pressed && styles.actionItemPressed,
                    ]}
                    testID={`action-${it.id}`}
                  >
                    <View style={[styles.actionIconWrap, { backgroundColor: `${it.color}26`, borderColor: `${it.color}55` }]}>
                      <Icon color={it.color} size={18} strokeWidth={2.6} />
                    </View>
                    <Text style={[styles.actionLabelText, it.destructive && styles.actionLabelDestructive]}>{it.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={onClose} style={styles.actionCancel} testID="action-cancel">
              <Text style={styles.actionCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function ConversationRow({
  conv,
  scam,
  onPress,
  onLongPress,
}: {
  conv: Conversation;
  scam?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const presence = presenceLabel(conv.user.online, conv.user.lastSeenAt);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={320} style={styles.row} testID={`convo-${conv.id}`}>
      <View style={[styles.avatarWrap]}>
        <View style={[styles.avatar, { backgroundColor: conv.user.color }]}>
          {conv.user.avatarUrl ? (
            <ExpoImage source={{ uri: conv.user.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarInit}>
              {conv.user.name.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
        {conv.user.online ? <View style={styles.onlineDot} /> : null}
        {conv.user.verified ? (
          <View style={styles.walletBadge}>
            <ShieldCheck color={ACCENT} size={10} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <View style={styles.rowMid}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {conv.user.name}
          </Text>
          {conv.user.verified ? (
            <BadgeCheck color={ACCENT} size={13} strokeWidth={2.8} />
          ) : null}
          <Text style={styles.rowHandle} numberOfLines={1}>
            {conv.user.handle}
          </Text>
        </View>
        <View style={styles.rowLastWrap}>
          {scam ? (
            <View style={styles.scamPill}>
              <ShieldAlert color={Colors.orange} size={9} strokeWidth={2.8} />
              <Text style={styles.scamPillText}>SCAM</Text>
            </View>
          ) : null}
          <Text
            style={[
              styles.rowLast,
              conv.unread > 0 && styles.rowLastUnread,
              scam && styles.rowLastScam,
            ]}
            numberOfLines={1}
          >
            {conv.lastMessage || "iMessage"}
          </Text>
        </View>
        {presence ? (
          <View style={styles.presenceRow}>
            {conv.user.online ? <View style={styles.presenceDot} /> : null}
            <Text style={[styles.presenceText, conv.user.online && styles.presenceTextOnline]}>
              {presence}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.rowTimeEnd, conv.unread > 0 && styles.rowTimeUnread]}>{timeAgo(conv.lastAt)}</Text>
        <View style={styles.endMetaRow}>
          {conv.pinned ? (
            <Pin color={Colors.orange} size={11} strokeWidth={2.8} />
          ) : null}
          {conv.muted ? (
            <BellOff color={Colors.muted} size={11} strokeWidth={2.2} />
          ) : null}
          {conv.unread > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{conv.unread > 99 ? "99+" : conv.unread}</Text>
            </View>
          ) : (
            <ChevronRight color="#C7C7CC" size={16} strokeWidth={2.1} />
          )}
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
                      {item.avatarUrl ? (
                        <ExpoImage source={{ uri: item.avatarUrl }} style={styles.modalAvatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.modalAvatarInit}>
                          {item.name.slice(0, 1).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.modalNameRow}>
                        <Text style={styles.modalName}>{item.name}</Text>
                        {item.verified ? (
                          <BadgeCheck color={ACCENT} size={12} strokeWidth={2.8} />
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
  navBar: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backCircle: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: CARD_BORDER,
  },
  navRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  markAllBtn: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: ACCENT_SOFT,
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.35)",
  },
  markAllText: { color: ACCENT, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  circleCompose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.8 },
  titleBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  titleBadgeText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },

  searchWrap: {
    marginHorizontal: 14,
    marginTop: 4,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 9 : 7,
    borderRadius: 17,
    backgroundColor: CARD_FILL,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: "700", padding: 0 },

  filterWrap: { flexDirection: "row", gap: 6, marginTop: 10, marginHorizontal: 14, padding: 4, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: CARD_BORDER },
  filterChip: { flex: 1, height: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 13, borderRadius: 10 },
  filterChipActive: { backgroundColor: ACCENT },
  filterText: { color: Colors.muted, fontSize: 13, fontWeight: "900" },
  filterTextActive: { color: Colors.ink },
  filterCount: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  filterCountActive: { backgroundColor: "rgba(0,0,0,0.18)" },
  filterCountText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  filterCountTextActive: { color: Colors.ink },
  flagDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },

  smartRow: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, gap: 6, flexDirection: "row" },
  smartChip: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  smartChipActive: {
    backgroundColor: ACCENT_SOFT,
    borderColor: "rgba(63,169,255,0.55)",
  },
  smartChipPressed: {
    opacity: 0.85,
  },
  smartCountBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  smartCountBadgeActive: {
    backgroundColor: ACCENT,
  },
  smartCountText: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.2 },
  smartCountTextActive: { color: Colors.ink },
  smartText: { color: Colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.1 },
  smartTextActive: { color: ACCENT },

  longPressHint: {
    marginTop: 10,
    marginHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 13,
    backgroundColor: ACCENT_SOFT,
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.30)",
  },
  longPressHintIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(63,169,255,0.18)",
  },
  longPressHintText: { flex: 1, color: Colors.text, fontSize: 12, fontWeight: "700", letterSpacing: 0.1 },
  longPressHintBold: { color: ACCENT, fontWeight: "900" },
  scamBanner: {
    marginTop: 10,
    marginHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(30,136,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(30,136,255,0.35)",
  },
  scamBannerText: { color: Colors.orange, fontSize: 12, fontWeight: "800" },

  listContent: { paddingTop: 12, paddingBottom: 140, flexGrow: 1 },
  sep: { height: 8 },

  suggestionsWrap: { marginTop: 8, marginBottom: 10 },
  suggestionsHead: { paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  suggestionsTitle: { color: Colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.4, textTransform: "uppercase" },
  suggestionsRow: { paddingHorizontal: 18, gap: 12 },
  suggestCard: { width: 82, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", borderRadius: 20, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: CARD_BORDER },
  suggestAvatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  suggestAvatarImg: { width: "100%", height: "100%" },
  suggestInit: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  onlineRing: { position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.mint, borderWidth: 2, borderColor: Colors.ink },
  suggestName: { color: Colors.text, fontSize: 12, fontWeight: "800", marginTop: 7, maxWidth: 70 },
  suggestHandle: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 1, maxWidth: 70 },

  rowOuter: { marginHorizontal: 14 },
  selfChatPin: {
    marginHorizontal: 18,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.34)",
    backgroundColor: Colors.card,
  },
  selfChatIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "rgba(63,169,255,0.16)", borderWidth: 1, borderColor: "rgba(63,169,255,0.42)",
    alignItems: "center", justifyContent: "center",
  },
  selfChatTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  selfChatBody: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  actionSheet: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  actionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 14,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  actionAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  actionAvatarImg: { width: "100%", height: "100%" },
  actionAvatarInit: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  actionNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionName: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  actionHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  actionList: { paddingTop: 6 },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  actionItemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)" },
  actionItemPressed: { opacity: 0.6 },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  actionLabelText: { color: Colors.text, fontSize: 15, fontWeight: "800", letterSpacing: -0.1 },
  actionLabelDestructive: { color: "#FF6B6B" },
  actionCancel: {
    marginTop: 12,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  actionCancelText: { color: Colors.text, fontSize: 15, fontWeight: "900" },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 22, backgroundColor: CARD_FILL, borderWidth: 1, borderColor: CARD_BORDER },
  avatarWrap: { position: "relative" },
  avatar: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInit: { color: "#FFFFFF", fontSize: 21, fontWeight: "900" },
  onlineDot: { position: "absolute", bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.mint, borderWidth: 2, borderColor: Colors.card },
  walletBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.ink,
    borderWidth: 1.5,
    borderColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowName: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.2, flexShrink: 1 },
  rowHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", maxWidth: 82 },
  rowLastWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  rowLast: { color: Colors.muted, fontSize: 14, fontWeight: "600", flex: 1 },
  rowLastUnread: { color: Colors.text, fontWeight: "800" },
  rowLastScam: { color: Colors.orange },
  scamPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(30,136,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(30,136,255,0.45)",
  },
  scamPillText: { color: Colors.orange, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  rowEnd: { alignItems: "flex-end", justifyContent: "center", gap: 6, minWidth: 44 },
  rowTimeEnd: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  rowTimeUnread: { color: ACCENT, fontWeight: "900" },
  endMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  presenceRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  presenceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.mint },
  presenceText: { color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.1 },
  presenceTextOnline: { color: Colors.mint },

  empty: { marginHorizontal: 18, marginTop: 28, paddingHorizontal: 28, paddingVertical: 44, alignItems: "center", borderRadius: 28, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: CARD_BORDER },
  emptyIcon: { width: 64, height: 64, borderRadius: 18, backgroundColor: ACCENT_SOFT, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 14, fontWeight: "600", textAlign: "center", marginTop: 6, lineHeight: 17 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.66)", justifyContent: "flex-end" },
  modalSheet: { height: "82%", backgroundColor: Colors.panel, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 10, borderWidth: 1, borderColor: CARD_BORDER },
  modalHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)", marginBottom: 14 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  iconBtnSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  modalSearch: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 10 : 8, borderRadius: 17, backgroundColor: CARD_FILL, borderWidth: 1, borderColor: CARD_BORDER, marginBottom: 12 },
  modalSearchInput: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: "700", padding: 0 },
  modalRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  modalAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  modalAvatarImg: { width: "100%", height: "100%" },
  modalAvatarInit: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  modalNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  modalName: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  modalSub: { color: Colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  modalSep: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.06)", marginLeft: 60 },
  existingPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(85,245,178,0.16)", borderWidth: 1, borderColor: "rgba(85,245,178,0.4)" },
  existingText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
});
