import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardCopy,
  Coins,
  CornerUpLeft,
  Hash,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Phone,
  Pin,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  UserX,
  Video,
  Wallet,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
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
import { uploadDMImage } from "@/lib/upload";
import { useAuth } from "@/providers/auth-provider";
import { DMMessage, DMReaction, DMReplyContext, useDmPeerProfile, useDmThreadMessages, useDmTyping, useMessages } from "@/providers/messages-provider";
import { useQueryClient } from "@tanstack/react-query";

const QUICK_TICKERS = ["$SOL", "$BONK", "$WIF", "$JUP", "$AGNT", "$PYTH"];
const QUICK_REACTIONS = ["❤️", "😂", "🔥", "🚀", "💯", "😮", "👀", "💎"] as const;
// Dark room palette. Names kept for minimal diff.
const IOS_BLUE = "#3FA9FF";
const IOS_BG = "#05070D";
const IOS_CARD = "#111827";
const IOS_CARD_SOFT = "#1A2236";
const IOS_TEXT = "#FFFFFF";
const IOS_SECONDARY = "#94A3B8";
const IOS_SEPARATOR = "rgba(255,255,255,0.08)";
const IOS_GREEN = "#34D399";
const IOS_RED = "#FF453A";
const HEADER_BG = "rgba(8,11,20,0.92)";
const COMPOSER_BG = "rgba(8,11,20,0.96)";

function formatTime(t: number): string {
  const d = new Date(t);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatRelative(t: number): string {
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLastSeen(online: boolean | undefined, lastSeenAt: number | null | undefined): string {
  if (online) return "Active now";
  if (!lastSeenAt) return "offline";
  const diff = Math.max(0, Date.now() - lastSeenAt);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Active just now";
  if (min < 60) return `Active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Active ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Last seen ${day}d ago`;
  return `Last seen ${new Date(lastSeenAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatDayLabel(t: number): string {
  const d = new Date(t);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

interface ListRow {
  kind: "msg" | "day";
  id: string;
  msg?: DMMessage;
  label?: string;
}

export default function DMThreadScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const {
    hydrated,
    getConversation,
    getMessages,
    sendMessage,
    markRead,
    togglePin,
    toggleMute,
    deleteConversation,
    deleteConversationForEveryone,
    deleteMessage,
    blockUser,
    setTyping,
    reactToMessage,
    editMessage,
  } = useMessages();
  const [uploading, setUploading] = useState<boolean>(false);
  const typingQuery = useDmTyping(id, !!id);
  const otherTyping = (typingQuery.data ?? []).length > 0;
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef<boolean>(false);

  const conv = id ? getConversation(id) : undefined;
  const peerProfile = useDmPeerProfile(conv?.user.userId);
  const peerBanner = peerProfile.data?.bannerUrl ?? conv?.user.bannerUrl ?? null;
  const peerAvatar = peerProfile.data?.avatarUrl ?? conv?.user.avatarUrl ?? null;
  const peerBio = peerProfile.data?.bio ?? conv?.user.bio ?? undefined;
  const threadQ = useDmThreadMessages(id, conv?.user);
  const fallbackMessages = useMemo<DMMessage[]>(() => (id ? getMessages(id) : []), [id, getMessages]);
  const messages = useMemo<DMMessage[]>(() => {
    const fromThread = threadQ.data ?? [];
    return fromThread.length > 0 ? fromThread : fallbackMessages;
  }, [threadQ.data, fallbackMessages]);

  const [text, setText] = useState<string>("");
  const [picker, setPicker] = useState<boolean>(false);
  const [menu, setMenu] = useState<boolean>(false);
  const [actionMsg, setActionMsg] = useState<DMMessage | null>(null);
  const [replyTo, setReplyTo] = useState<DMReplyContext | null>(null);
  const [editing, setEditing] = useState<DMMessage | null>(null);
  const [editText, setEditText] = useState<string>("");
  const listRef = useRef<FlatList<ListRow>>(null);

  useEffect(() => {
    if (id) markRead(id);
  }, [id, markRead]);

  // If we landed here on a freshly-created conversation that the list query
  // hasn't picked up yet, force a refetch so the screen can populate.
  useEffect(() => {
    if (!id || !userId) return;
    if (conv) return;
    queryClient.refetchQueries({ queryKey: ["messages", "conversations", userId] }).catch(() => {});
  }, [conv, id, queryClient, userId]);

  // Clear typing state on unmount.
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (id && isTypingRef.current) {
        setTyping(id, false).catch(() => {});
        isTypingRef.current = false;
      }
    };
  }, [id, setTyping]);

  const onTextChange = useCallback(
    (next: string) => {
      setText(next);
      if (!id) return;
      if (next.trim().length === 0) {
        if (isTypingRef.current) {
          setTyping(id, false).catch(() => {});
          isTypingRef.current = false;
        }
        if (typingTimerRef.current) {
          clearTimeout(typingTimerRef.current);
          typingTimerRef.current = null;
        }
        return;
      }
      if (!isTypingRef.current) {
        setTyping(id, true).catch(() => {});
        isTypingRef.current = true;
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        if (isTypingRef.current && id) {
          setTyping(id, false).catch(() => {});
          isTypingRef.current = false;
        }
      }, 3500);
    },
    [id, setTyping],
  );

  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [];
    let lastDay = "";
    for (const m of messages) {
      const day = formatDayLabel(m.createdAt);
      if (day !== lastDay) {
        out.push({ kind: "day", id: `day-${day}-${m.id}`, label: day });
        lastDay = day;
      }
      out.push({ kind: "msg", id: m.id, msg: m });
    }
    return out;
  }, [messages]);

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [rows.length]);

  const onSend = useCallback(
    async (override?: { text: string; ticker?: string; imageUrl?: string }) => {
      if (!id || !conv) return;
      const t = override?.text ?? text;
      if (!t.trim() && !override?.imageUrl) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (isTypingRef.current) {
        setTyping(id, false).catch(() => {});
        isTypingRef.current = false;
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      const replyId = replyTo?.id;
      await sendMessage(id, t, override?.ticker, override?.imageUrl, replyId);
      setText("");
      setReplyTo(null);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
    },
    [id, conv, text, sendMessage, setTyping, replyTo],
  );

  const onReact = useCallback(
    async (m: DMMessage, emoji: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        await reactToMessage(m.id, emoji);
      } catch (e) {
        Alert.alert("Reaction failed", e instanceof Error ? e.message : "Try again.");
      }
    },
    [reactToMessage],
  );

  const onCopy = useCallback(async (m: DMMessage) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      await Clipboard.setStringAsync(m.text ?? "");
    } catch {}
  }, []);

  const onReply = useCallback((m: DMMessage) => {
    Haptics.selectionAsync().catch(() => {});
    setReplyTo({ id: m.id, fromHandle: m.fromHandle, text: m.text, type: m.type });
  }, []);

  const onEditStart = useCallback((m: DMMessage) => {
    setEditing(m);
    setEditText(m.text);
  }, []);

  const onEditSave = useCallback(async () => {
    if (!editing) return;
    const next = editText.trim();
    if (!next || next === editing.text) {
      setEditing(null);
      return;
    }
    try {
      await editMessage(editing.id, next);
      setEditing(null);
    } catch (e) {
      Alert.alert("Edit failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [editing, editText, editMessage]);

  const onPickImage = useCallback(async () => {
    if (!id || !conv) return;
    if (!userId) {
      Alert.alert("Sign in", "Sign in to send photos.");
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo access to attach images to DMs.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 0.85,
        base64: Platform.OS !== "web",
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const asset = result.assets[0];
      setUploading(true);
      const publicUrl = await uploadDMImage(
        userId,
        id,
        asset.uri,
        asset.base64 ?? null,
        asset.fileName ?? null,
        asset.mimeType ?? null,
      );
      await onSend({ text: "Photo", imageUrl: publicUrl });
    } catch (e) {
      console.log("[dm] image send failed", e);
      Alert.alert("Image failed", e instanceof Error ? e.message : "Could not send that image. Try another one.");
    } finally {
      setUploading(false);
    }
  }, [id, conv, onSend, userId]);

  const onStartCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push("/spaces");
  }, [router]);

  if (!conv) {
    const stillLoading = !hydrated || !!peerProfile.isLoading;
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe}>
          <View style={styles.notFound}>
            {stillLoading ? (
              <>
                <ActivityIndicator color={IOS_BLUE} />
                <Text style={[styles.notFoundTitle, { marginTop: 12 }]}>Opening chat…</Text>
              </>
            ) : (
              <>
                <Text style={styles.notFoundTitle}>Conversation not found</Text>
                <Pressable onPress={() => navigateBack(router, "/messages")} style={styles.notFoundBtn}>
                  <Text style={styles.notFoundBtnText}>Go back</Text>
                </Pressable>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const onDeleteMessage = useCallback(
    (m: DMMessage) => {
      if (m.fromHandle !== "@you") return;
      if (m.id.startsWith("temp-")) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert(
        "Delete message?",
        "This deletes the message for everyone in the chat. This can't be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete for everyone",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteMessage(m.id);
              } catch (e) {
                Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again.");
              }
            },
          },
        ],
      );
    },
    [deleteMessage],
  );

  const onBubbleLongPress = useCallback((m: DMMessage) => {
    if (m.id.startsWith("temp-")) return;
    if (m.deletedAt) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActionMsg(m);
  }, []);

  const renderRow: ListRenderItem<ListRow> = ({ item }) => {
    if (item.kind === "day") {
      return (
        <View style={styles.daySep}>
          <View style={styles.dayLine} />
          <Text style={styles.dayText}>{item.label}</Text>
          <View style={styles.dayLine} />
        </View>
      );
    }
    const m = item.msg!;
    const mine = m.fromHandle === "@you";
    return (
      <Bubble
        msg={m}
        mine={mine}
        accent={conv.user.color}
        onLongPress={() => onBubbleLongPress(m)}
        onReactionPress={(emoji) => onReact(m, emoji)}
      />
    );
  };

  return (
    <View style={styles.root} testID="dm-thread">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateBack(router, "/messages")}
            style={styles.iconBtn}
            testID="dm-back"
          >
            <ArrowLeft color={IOS_BLUE} size={22} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/u/[handle]",
                params: { handle: conv.user.handle.replace("@", "") },
              })
            }
            style={styles.headInfo}
            testID="dm-open-profile"
          >
            <View style={styles.headAvatarWrap}>
              <View style={[styles.headAvatar, { backgroundColor: conv.user.color }]}>
                {peerAvatar ? (
                  <ExpoImage source={{ uri: peerAvatar }} style={styles.headAvatarImg} contentFit="cover" />
                ) : (
                  <Text style={styles.headAvatarInit}>
                    {conv.user.name.slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              {conv.user.online ? <View style={styles.headOnline} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.headNameRow}>
                <Text style={styles.headName} numberOfLines={1}>
                  {conv.user.name}
                </Text>
                {conv.user.verified ? (
                  <BadgeCheck color={IOS_BLUE} size={14} strokeWidth={2.8} />
                ) : null}
                {conv.muted ? (
                  <BellOff color={IOS_SECONDARY} size={11} strokeWidth={2.4} />
                ) : null}
                {conv.pinned ? (
                  <Pin color="#FF9500" size={11} strokeWidth={2.8} />
                ) : null}
              </View>
              {otherTyping ? (
                <View style={styles.typingHeadRow}>
                  <TypingDots color={IOS_BLUE} />
                  <Text style={styles.headStatusTyping}>typing…</Text>
                </View>
              ) : (
                <Text style={styles.headStatus} numberOfLines={1}>
                  {formatLastSeen(conv.user.online, conv.user.lastSeenAt)}
                </Text>
              )}
            </View>
          </Pressable>
          <Pressable
            onPress={onStartCall}
            style={styles.iconBtn}
            testID="dm-start-space"
          >
            <Phone color={IOS_BLUE} size={18} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setMenu(true);
            }}
            style={styles.iconBtn}
            testID="dm-menu"
          >
            <MoreHorizontal color={IOS_BLUE} size={20} strokeWidth={2.4} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={renderRow}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              otherTyping ? (
                <View style={styles.typingBubbleWrap} testID="dm-typing-bubble">
                  <View style={styles.typingBubble}>
                    <TypingDots color={IOS_SECONDARY} />
                  </View>
                </View>
              ) : null
            }
            ListHeaderComponent={
              <ProfileBlurb
                name={conv.user.name}
                handle={conv.user.handle}
                color={conv.user.color}
                bio={peerBio}
                avatarUrl={peerAvatar}
                bannerUrl={peerBanner}
                onProfile={() =>
                  router.push({
                    pathname: "/u/[handle]",
                    params: { handle: conv.user.handle.replace("@", "") },
                  })
                }
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: `${conv.user.color}1A` }]}>
                  <Sparkles color={conv.user.color} size={22} strokeWidth={2.4} />
                </View>
                <Text style={styles.emptyTitle}>Say hi to {conv.user.name}</Text>
                <Text style={styles.emptyBody}>
                  Drop a chart, tip a token, or just gm. Messages are private.
                </Text>
              </View>
            }
          />

          {replyTo ? (
            <View style={styles.replyBanner} testID="reply-banner">
              <View style={styles.replyBar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyBannerTitle}>
                  Replying to {replyTo.fromHandle === "@you" ? "yourself" : replyTo.fromHandle}
                </Text>
                <Text style={styles.replyBannerBody} numberOfLines={1}>
                  {replyTo.text || "Photo"}
                </Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={10} style={styles.replyClose}>
                <X color={IOS_SECONDARY} size={14} strokeWidth={2.4} />
              </Pressable>
            </View>
          ) : null}

          {picker ? (
            <View style={styles.tickerStrip}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tickerRow}
              >
                {QUICK_TICKERS.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setText((prev) => (prev.length > 0 ? `${prev} ${t} ` : `${t} `));
                      setPicker(false);
                    }}
                    style={styles.tickerChip}
                    testID={`pick-${t}`}
                  >
                    <Hash color={IOS_BLUE} size={11} strokeWidth={2.8} />
                    <Text style={styles.tickerChipText}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.composer}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setPicker((p) => !p);
              }}
              style={[styles.composerBtn, picker && { backgroundColor: "#D8ECFF" }]}
              testID="ticker-toggle"
            >
              <Hash color={picker ? IOS_BLUE : IOS_SECONDARY} size={18} strokeWidth={2.6} />
            </Pressable>
            <Pressable
              style={[styles.composerBtn, uploading && { opacity: 0.55 }]}
              onPress={onPickImage}
              disabled={uploading}
              testID="dm-image-attach"
            >
              <ImageIcon color={uploading ? IOS_BLUE : IOS_SECONDARY} size={18} strokeWidth={2.4} />
            </Pressable>
            <View style={styles.inputWrap}>
              <TextInput
                value={text}
                onChangeText={onTextChange}
                placeholder={`Message ${conv.user.name}...`}
                placeholderTextColor={IOS_SECONDARY}
                style={styles.input}
                multiline
                testID="dm-input"
              />
            </View>
            <Pressable
              onPress={() => onSend()}
              style={[
                styles.sendBtn,
                { backgroundColor: text.trim().length > 0 ? IOS_BLUE : "#D1D1D6" },
              ]}
              disabled={text.trim().length === 0}
              testID="dm-send"
            >
              <Send
                color={"#FFFFFF"}
                size={16}
                strokeWidth={2.6}
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <BubbleActions
        msg={actionMsg}
        onClose={() => setActionMsg(null)}
        onReact={(emoji) => {
          if (actionMsg) onReact(actionMsg, emoji);
          setActionMsg(null);
        }}
        onReply={() => {
          if (actionMsg) onReply(actionMsg);
          setActionMsg(null);
        }}
        onCopy={() => {
          if (actionMsg) onCopy(actionMsg);
          setActionMsg(null);
        }}
        onEdit={() => {
          if (actionMsg) onEditStart(actionMsg);
          setActionMsg(null);
        }}
        onDelete={() => {
          if (actionMsg) onDeleteMessage(actionMsg);
          setActionMsg(null);
        }}
      />

      <EditModal
        open={!!editing}
        text={editText}
        onChangeText={setEditText}
        onClose={() => setEditing(null)}
        onSave={onEditSave}
      />

      <ActionMenu
        open={menu}
        pinned={conv.pinned}
        muted={conv.muted}
        onClose={() => setMenu(false)}
        onPin={async () => {
          await togglePin(conv.id);
          setMenu(false);
        }}
        onMute={async () => {
          await toggleMute(conv.id);
          setMenu(false);
        }}
        onProfile={() => {
          setMenu(false);
          router.push({
            pathname: "/u/[handle]",
            params: { handle: conv.user.handle.replace("@", "") },
          });
        }}
        onBlock={() => {
          setMenu(false);
          const targetId = conv.user.userId;
          if (!targetId) {
            Alert.alert("Can't block", "Missing user info for this conversation.");
            return;
          }
          Alert.alert(
            `Block ${conv.user.name}?`,
            "They won't be able to message you, follow you, or see your activity. Your chat history will be hidden for both sides.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Block",
                style: "destructive",
                onPress: async () => {
                  try {
                    await blockUser(targetId);
                    navigateBack(router, "/messages");
                  } catch (e) {
                    Alert.alert("Block failed", e instanceof Error ? e.message : "Try again.");
                  }
                },
              },
            ],
          );
        }}
        onDelete={() => {
          setMenu(false);
          Alert.alert(
            "Delete conversation?",
            `Choose how to remove your chat with ${conv.user.name}.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete for me",
                onPress: async () => {
                  try {
                    await deleteConversation(conv.id);
                    navigateBack(router, "/messages");
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
                    await deleteConversationForEveryone(conv.id);
                    navigateBack(router, "/messages");
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

function TypingDots({ color }: { color: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const make = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(220),
        ]),
      );
    const anims = [make(a, 0), make(b, 140), make(c, 280)];
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, [a, b, c]);
  const dotStyle = (val: Animated.Value) => ({
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
  });
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, dotStyle(a)]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, dotStyle(b)]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, dotStyle(c)]} />
    </View>
  );
}

function ProfileBlurb({
  name,
  handle,
  color,
  bio,
  avatarUrl,
  bannerUrl,
  onProfile,
}: {
  name: string;
  handle: string;
  color: string;
  bio?: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  onProfile: () => void;
}) {
  return (
    <Pressable onPress={onProfile} style={styles.blurb} testID="dm-blurb">
      <View style={styles.blurbBannerWrap}>
        {bannerUrl ? (
          <ExpoImage source={{ uri: bannerUrl }} style={styles.blurbBannerImg} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[`${color}55`, `${color}18`, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={["transparent", "rgba(5,7,13,0.85)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={styles.blurbInner}>
        <View style={[styles.blurbAvatar, { backgroundColor: color }]}>
          {avatarUrl ? (
            <ExpoImage source={{ uri: avatarUrl }} style={styles.blurbAvatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.blurbInit}>{name.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <Text style={styles.blurbName}>{name}</Text>
        <Text style={styles.blurbHandle}>{handle}</Text>
        {bio ? <Text style={styles.blurbBio}>{bio}</Text> : null}
        <View style={styles.blurbCta}>
          <Text style={styles.blurbCtaText}>View profile</Text>
          <ChevronRight color={IOS_BLUE} size={12} strokeWidth={2.6} />
        </View>
      </View>
    </Pressable>
  );
}

function ReplyContextRow({ reply, mine }: { reply: DMReplyContext; mine: boolean }) {
  return (
    <View style={[styles.replyContextRow, mine ? styles.replyContextRight : styles.replyContextLeft]}>
      <View style={[styles.replyContextBar, { backgroundColor: mine ? "rgba(255,255,255,0.55)" : IOS_BLUE }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.replyContextWho} numberOfLines={1}>
          {reply.fromHandle === "@you" ? "You" : reply.fromHandle}
        </Text>
        <Text style={styles.replyContextText} numberOfLines={1}>
          {reply.text || (reply.type === "image" ? "Photo" : "")}
        </Text>
      </View>
    </View>
  );
}

function ReactionsRow({
  reactions,
  mine,
  onPress,
}: {
  reactions: DMReaction[];
  mine: boolean;
  onPress: (emoji: string) => void;
}) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <View style={[styles.reactionsRow, mine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onPress(r.emoji)}
          style={[styles.reactionChip, r.mine && styles.reactionChipMine]}
          testID={`react-${r.emoji}`}
        >
          <Text style={styles.reactionEmoji}>{r.emoji}</Text>
          {r.count > 1 ? <Text style={styles.reactionCount}>{r.count}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function Bubble({
  msg,
  mine,
  accent,
  onLongPress,
  onReactionPress,
}: {
  msg: DMMessage;
  mine: boolean;
  accent: string;
  onLongPress?: () => void;
  onReactionPress: (emoji: string) => void;
}) {
  void accent;

  if (msg.deletedAt) {
    return (
      <View style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}>
        <View style={[styles.bubble, styles.deletedBubble]}>
          <Text style={styles.deletedText}>Message deleted</Text>
        </View>
        <Text style={styles.bubbleTime}>{formatTime(msg.createdAt)}</Text>
      </View>
    );
  }
  const reply = msg.replyTo ?? null;
  const reactions = msg.reactions ?? [];

  if (msg.type === "tip") {
    return (
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}
      >
        {reply ? <ReplyContextRow reply={reply} mine={mine} /> : null}
        <LinearGradient
          colors={["rgba(85,245,178,0.36)", "rgba(85,245,178,0.06)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tipBubble}
        >
          <View style={styles.tipIconWrap}>
            <Wallet color={Colors.mint} size={14} strokeWidth={2.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipLabel}>TIP RECEIVED</Text>
            <Text style={styles.tipAmount}>
              {msg.tipAmount} {msg.tipToken}
            </Text>
            <Text style={styles.tipNote}>{msg.text}</Text>
          </View>
        </LinearGradient>
        <Text style={styles.bubbleTime}>{formatTime(msg.createdAt)}</Text>
        <ReactionsRow reactions={reactions} mine={mine} onPress={onReactionPress} />
      </Pressable>
    );
  }

  if (msg.type === "image" && msg.imageUrl) {
    return (
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}
      >
        {reply ? <ReplyContextRow reply={reply} mine={mine} /> : null}
        <View
          style={[
            styles.imageBubble,
            mine ? { borderColor: IOS_BLUE } : { borderColor: IOS_CARD },
          ]}
        >
          <ExpoImage source={{ uri: msg.imageUrl }} style={styles.messageImage} contentFit="cover" />
        </View>
        {msg.text && msg.text !== "Photo" ? (
          <View style={[styles.bubble, mine ? { backgroundColor: IOS_BLUE } : { backgroundColor: IOS_CARD_SOFT }]}>
            <Text style={[styles.bubbleText, { color: "#FFFFFF" }]}>{msg.text}</Text>
          </View>
        ) : null}
        <Text style={styles.bubbleTime}>{formatTime(msg.createdAt)}</Text>
        <ReactionsRow reactions={reactions} mine={mine} onPress={onReactionPress} />
      </Pressable>
    );
  }

  if (msg.type === "ticker" && msg.ticker) {
    return (
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}
      >
        {reply ? <ReplyContextRow reply={reply} mine={mine} /> : null}
        <View
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: IOS_BLUE, borderBottomRightRadius: 6 }
              : { backgroundColor: IOS_CARD_SOFT, borderBottomLeftRadius: 6 },
          ]}
        >
          <View
            style={[
              styles.tickerCard,
              { backgroundColor: mine ? "rgba(255,255,255,0.22)" : "rgba(63,169,255,0.18)" },
            ]}
          >
            <Coins color={mine ? "#FFFFFF" : IOS_BLUE} size={13} strokeWidth={2.8} />
            <Text style={[styles.tickerText, { color: mine ? "#FFFFFF" : IOS_BLUE }]}>
              {msg.ticker}
            </Text>
            <View style={styles.tickerChange}>
              <TrendingUp color={Colors.mint} size={10} strokeWidth={3} />
              <Text style={styles.tickerChangeText}>+{(Math.random() * 12 + 2).toFixed(1)}%</Text>
            </View>
          </View>
          <Text style={[styles.bubbleText, { color: "#FFFFFF" }]}>
            {msg.text}
          </Text>
        </View>
        <Text style={[styles.bubbleTime, mine && { color: IOS_SECONDARY }]}>
          {formatTime(msg.createdAt)}
          {msg.editedAt ? " · edited" : ""}
        </Text>
        <ReactionsRow reactions={reactions} mine={mine} onPress={onReactionPress} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}
    >
      {reply ? <ReplyContextRow reply={reply} mine={mine} /> : null}
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: IOS_BLUE, borderBottomRightRadius: 6 }
            : {
                backgroundColor: IOS_CARD_SOFT,
                borderBottomLeftRadius: 6,
              },
        ]}
      >
        <Text style={[styles.bubbleText, { color: "#FFFFFF" }]}>
          {msg.text}
        </Text>
      </View>
      <View style={styles.bubbleMeta}>
        <Text style={styles.bubbleTime}>
          {formatTime(msg.createdAt)}
          {msg.editedAt ? " · edited" : ""}
        </Text>
        {mine ? (
          <View style={styles.statusRow}>
            {msg.readAt ? (
              <>
                <CheckCheck color={IOS_BLUE} size={12} strokeWidth={2.6} />
                <Text style={[styles.statusText, { color: IOS_BLUE }]}>Seen</Text>
              </>
            ) : msg.deliveredAt ? (
              <>
                <CheckCheck color={IOS_SECONDARY} size={12} strokeWidth={2.6} />
                <Text style={styles.statusText}>Delivered</Text>
              </>
            ) : (
              <>
                <Check color={IOS_SECONDARY} size={12} strokeWidth={2.6} />
                <Text style={styles.statusText}>Sent</Text>
              </>
            )}
          </View>
        ) : null}
      </View>
      <ReactionsRow reactions={reactions} mine={mine} onPress={onReactionPress} />
    </Pressable>
  );
}

function BubbleActions({
  msg,
  onClose,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDelete,
}: {
  msg: DMMessage | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  const open = !!msg;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);
  if (!msg) {
    return <Modal visible={false} transparent onRequestClose={onClose}><View /></Modal>;
  }
  const mine = msg.fromHandle === "@you";
  const canEdit = mine && msg.type === "text";
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.menuSheet,
            {
              transform: [
                { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) },
              ],
            },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.reactPickerRow}>
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onReact(emoji)}
                style={styles.reactPickerChip}
                testID={`quick-react-${emoji}`}
              >
                <Text style={styles.reactPickerEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.menuSep} />
          <MenuItem
            icon={<CornerUpLeft color={IOS_TEXT} size={16} strokeWidth={2.4} />}
            label="Reply"
            onPress={onReply}
          />
          <MenuItem
            icon={<ClipboardCopy color={IOS_TEXT} size={16} strokeWidth={2.4} />}
            label="Copy text"
            onPress={onCopy}
          />
          {canEdit ? (
            <MenuItem
              icon={<Pencil color={IOS_TEXT} size={16} strokeWidth={2.4} />}
              label="Edit message"
              onPress={onEdit}
            />
          ) : null}
          {mine ? (
            <>
              <View style={styles.menuSep} />
              <MenuItem
                icon={<Trash2 color={IOS_RED} size={16} strokeWidth={2.4} />}
                label="Delete for everyone"
                tone={IOS_RED}
                onPress={onDelete}
              />
            </>
          ) : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function EditModal({
  open,
  text,
  onChangeText,
  onClose,
  onSave,
}: {
  open: boolean;
  text: string;
  onChangeText: (s: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Pressable style={styles.editCard} onPress={() => {}}>
          <View style={styles.editHead}>
            <Pencil color={IOS_BLUE} size={14} strokeWidth={2.6} />
            <Text style={styles.editTitle}>Edit message</Text>
          </View>
          <TextInput
            value={text}
            onChangeText={onChangeText}
            multiline
            style={styles.editInput}
            placeholderTextColor={IOS_SECONDARY}
            autoFocus
            testID="edit-input"
          />
          <View style={styles.editActions}>
            <Pressable onPress={onClose} style={[styles.editBtn, styles.editBtnGhost]}>
              <Text style={styles.editBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onSave} style={[styles.editBtn, styles.editBtnPrimary]} testID="edit-save">
              <Check color={"#FFFFFF"} size={14} strokeWidth={2.6} />
              <Text style={styles.editBtnPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionMenu({
  open,
  pinned,
  muted,
  onClose,
  onPin,
  onMute,
  onProfile,
  onBlock,
  onDelete,
}: {
  open: boolean;
  pinned: boolean;
  muted: boolean;
  onClose: () => void;
  onPin: () => void;
  onMute: () => void;
  onProfile: () => void;
  onBlock: () => void;
  onDelete: () => void;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.menuSheet,
            {
              transform: [
                {
                  translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }),
                },
              ],
            },
          ]}
        >
          <View style={styles.modalHandle} />
          <MenuItem
            icon={<UserCheck color={IOS_TEXT} size={16} strokeWidth={2.4} />}
            label="View profile"
            onPress={onProfile}
          />
          <MenuItem
            icon={<Pin color={pinned ? "#FF9500" : IOS_TEXT} size={16} strokeWidth={2.4} />}
            label={pinned ? "Unpin chat" : "Pin chat"}
            onPress={onPin}
          />
          <MenuItem
            icon={<BellOff color={muted ? IOS_BLUE : IOS_TEXT} size={16} strokeWidth={2.4} />}
            label={muted ? "Unmute" : "Mute notifications"}
            onPress={onMute}
          />
          <MenuItem
            icon={<Video color={IOS_TEXT} size={16} strokeWidth={2.4} />}
            label="Schedule a Space"
            onPress={onClose}
          />
          <View style={styles.menuSep} />
          <MenuItem
            icon={<UserX color={IOS_RED} size={16} strokeWidth={2.4} />}
            label="Block user"
            tone={IOS_RED}
            onPress={onBlock}
          />
          <MenuItem
            icon={<Trash2 color={IOS_RED} size={16} strokeWidth={2.4} />}
            label="Delete conversation"
            tone={IOS_RED}
            onPress={onDelete}
          />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function MenuItem({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <View style={styles.menuIconWrap}>{icon}</View>
      <Text style={[styles.menuLabel, tone ? { color: tone } : null]}>{label}</Text>
      <ChevronRight color={IOS_SECONDARY} size={14} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: IOS_BG },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: HEADER_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: IOS_SEPARATOR,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headInfo: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  headAvatarWrap: { position: "relative" },
  headAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headAvatarInit: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  headAvatarImg: { width: "100%", height: "100%", borderRadius: 17 },
  headOnline: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: IOS_GREEN,
    borderWidth: 2,
    borderColor: IOS_BG,
  },
  headNameRow: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 190 },
  headName: { color: IOS_TEXT, fontSize: 12, fontWeight: "700", letterSpacing: -0.1, flexShrink: 1 },
  headStatus: { color: IOS_SECONDARY, fontSize: 10, fontWeight: "500", marginTop: -1 },
  headStatusTyping: { color: IOS_BLUE, fontSize: 10, fontWeight: "700", marginTop: -1, letterSpacing: 0.1 },
  typingHeadRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  typingBubbleWrap: { alignSelf: "flex-start", marginTop: 2, marginBottom: 6, marginLeft: 2 },
  typingBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: IOS_CARD_SOFT,
    flexDirection: "row",
    alignItems: "center",
  },
  typingDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 2 },

  listContent: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 14 },

  blurb: {
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 18,
    marginTop: 4,
    backgroundColor: IOS_CARD,
    borderWidth: 1,
    borderColor: IOS_SEPARATOR,
  },
  blurbBannerWrap: { height: 110, width: "100%", backgroundColor: IOS_CARD_SOFT, position: "relative", overflow: "hidden" },
  blurbBannerImg: { width: "100%", height: "100%" },
  blurbInner: { paddingHorizontal: 18, paddingBottom: 18, paddingTop: 0, alignItems: "center", backgroundColor: IOS_CARD, marginTop: -42 },
  blurbAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: IOS_CARD,
    overflow: "hidden",
  },
  blurbAvatarImg: { width: "100%", height: "100%" },
  blurbInit: { color: "#FFFFFF", fontSize: 30, fontWeight: "800" },
  blurbName: { color: IOS_TEXT, fontSize: 20, fontWeight: "700", marginTop: 12, letterSpacing: -0.4 },
  blurbHandle: { color: IOS_SECONDARY, fontSize: 13, fontWeight: "500", marginTop: 2 },
  blurbBio: {
    color: IOS_SECONDARY,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  blurbCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(63,169,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.32)",
  },
  blurbCtaText: { color: IOS_BLUE, fontSize: 13, fontWeight: "700" },

  daySep: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginVertical: 12,
  },
  dayLine: { display: "none" },
  dayText: { color: IOS_SECONDARY, fontSize: 12, fontWeight: "600" },

  bubbleWrap: { marginBottom: 7, maxWidth: "78%" },
  bubbleLeft: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubbleRight: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 19,
  },
  bubbleText: { fontSize: 16, lineHeight: 21, fontWeight: "400" },
  bubbleTime: { color: IOS_SECONDARY, fontSize: 10, fontWeight: "500", marginHorizontal: 6 },
  bubbleMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  statusText: { color: IOS_SECONDARY, fontSize: 10, fontWeight: "500", letterSpacing: 0.1 },

  tipBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
    minWidth: 220,
  },
  tipIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  tipLabel: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  tipAmount: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 2 },
  tipNote: { color: "#FFFFFF", fontSize: 11, fontWeight: "600", opacity: 0.85, marginTop: 2 },

  imageBubble: {
    width: 230,
    height: 170,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: IOS_CARD_SOFT,
    marginBottom: 4,
  },
  messageImage: { width: "100%", height: "100%" },

  tickerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  tickerText: { fontSize: 11, fontWeight: "900" },
  tickerChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  tickerChangeText: { color: Colors.mint, fontSize: 10, fontWeight: "900" },

  empty: { paddingVertical: 60, alignItems: "center", paddingHorizontal: 20 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { color: IOS_TEXT, fontSize: 17, fontWeight: "700" },
  emptyBody: {
    color: IOS_SECONDARY,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },

  tickerStrip: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: IOS_SEPARATOR,
    backgroundColor: COMPOSER_BG,
  },
  tickerRow: { paddingHorizontal: 14, gap: 6 },
  tickerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: IOS_CARD_SOFT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IOS_SEPARATOR,
  },
  tickerChipText: { color: IOS_BLUE, fontSize: 12, fontWeight: "700" },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 18 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: IOS_SEPARATOR,
    backgroundColor: COMPOSER_BG,
  },
  composerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    backgroundColor: IOS_CARD_SOFT,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IOS_SEPARATOR,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    minHeight: 38,
    maxHeight: 110,
    justifyContent: "center",
  },
  input: {
    color: IOS_TEXT,
    fontSize: 16,
    fontWeight: "400",
    padding: 0,
    minHeight: Platform.OS === "ios" ? 18 : 26,
    maxHeight: 90,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  notFound: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  notFoundTitle: { color: IOS_TEXT, fontSize: 18, fontWeight: "700" },
  notFoundBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: IOS_BLUE,
    borderRadius: 12,
  },
  notFoundBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", justifyContent: "flex-end" },
  menuSheet: {
    backgroundColor: IOS_CARD,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: IOS_SEPARATOR,
    padding: 14,
    paddingBottom: Platform.OS === "ios" ? 32 : 22,
  },
  menuItemDark: {},
  modalHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  menuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: IOS_CARD_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, color: IOS_TEXT, fontSize: 16, fontWeight: "500" },
  menuSep: { height: StyleSheet.hairlineWidth, backgroundColor: IOS_SEPARATOR, marginVertical: 4 },

  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: IOS_CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IOS_SEPARATOR,
  },
  replyBar: { width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: IOS_BLUE },
  replyBannerTitle: { color: IOS_BLUE, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  replyBannerBody: { color: IOS_TEXT, fontSize: 12, fontWeight: "500", marginTop: 1 },
  replyClose: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: IOS_CARD_SOFT },

  replyContextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 4,
    maxWidth: "100%",
  },
  replyContextLeft: { alignSelf: "flex-start" },
  replyContextRight: { alignSelf: "flex-end" },
  replyContextBar: { width: 2.5, alignSelf: "stretch", borderRadius: 2 },
  replyContextWho: { color: IOS_SECONDARY, fontSize: 10, fontWeight: "800" },
  replyContextText: { color: IOS_TEXT, fontSize: 11, fontWeight: "500", marginTop: 1, maxWidth: 220 },

  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    maxWidth: "100%",
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: IOS_CARD_SOFT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IOS_SEPARATOR,
  },
  reactionChipMine: {
    backgroundColor: "rgba(63,169,255,0.18)",
    borderColor: "rgba(63,169,255,0.5)",
  },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { color: IOS_TEXT, fontSize: 10, fontWeight: "700" },

  reactPickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 6,
    marginBottom: 4,
  },
  reactPickerChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: IOS_CARD_SOFT,
  },
  reactPickerEmoji: { fontSize: 18 },

  deletedBubble: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IOS_SEPARATOR,
    borderStyle: "dashed",
  },
  deletedText: { color: IOS_SECONDARY, fontSize: 13, fontStyle: "italic", fontWeight: "500" },

  editCard: {
    marginHorizontal: 24,
    marginTop: "auto",
    marginBottom: "auto",
    backgroundColor: IOS_CARD,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IOS_SEPARATOR,
    padding: 16,
  },
  editHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  editTitle: { color: IOS_TEXT, fontSize: 14, fontWeight: "800" },
  editInput: {
    color: IOS_TEXT,
    fontSize: 15,
    fontWeight: "500",
    backgroundColor: IOS_CARD_SOFT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: "top",
  },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  editBtnGhost: { backgroundColor: IOS_CARD_SOFT },
  editBtnGhostText: { color: IOS_TEXT, fontSize: 13, fontWeight: "700" },
  editBtnPrimary: { backgroundColor: IOS_BLUE },
  editBtnPrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
});
