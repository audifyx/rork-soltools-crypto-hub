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
  ChevronRight,
  Coins,
  Hash,
  Image as ImageIcon,
  MoreHorizontal,
  Phone,
  Pin,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  Video,
  Wallet,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { DMMessage, useMessages } from "@/providers/messages-provider";

const QUICK_TICKERS = ["$SOL", "$BONK", "$WIF", "$JUP", "$AGNT", "$PYTH"];

function formatTime(t: number): string {
  const d = new Date(t);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
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
  const {
    getConversation,
    getMessages,
    sendMessage,
    markRead,
    togglePin,
    toggleMute,
    deleteConversation,
  } = useMessages();

  const conv = id ? getConversation(id) : undefined;
  const messages = useMemo<DMMessage[]>(() => (id ? getMessages(id) : []), [id, getMessages]);

  const [text, setText] = useState<string>("");
  const [picker, setPicker] = useState<boolean>(false);
  const [menu, setMenu] = useState<boolean>(false);
  const listRef = useRef<FlatList<ListRow>>(null);

  useEffect(() => {
    if (id) markRead(id);
  }, [id, markRead]);

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
      await sendMessage(id, t, override?.ticker, override?.imageUrl);
      setText("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
    },
    [id, conv, text, sendMessage],
  );

  const onPickImage = useCallback(async () => {
    if (!id || !conv) return;
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
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      await onSend({ text: "Photo", imageUrl: result.assets[0].uri });
    } catch (e) {
      console.log("[dm] image pick failed", e);
      Alert.alert("Image failed", "Could not attach that image. Try another one.");
    }
  }, [id, conv, onSend]);

  const onStartCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push("/spaces");
  }, [router]);

  if (!conv) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.notFound}>
            <Text style={styles.notFoundTitle}>Conversation not found</Text>
            <Pressable onPress={() => router.back()} style={styles.notFoundBtn}>
              <Text style={styles.notFoundBtnText}>Go back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
    return <Bubble msg={m} mine={mine} accent={conv.user.color} />;
  };

  return (
    <View style={styles.root} testID="dm-thread">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <LinearGradient
        colors={[`${conv.user.color}14`, "transparent", Colors.ink]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="dm-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
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
                <Text style={styles.headAvatarInit}>
                  {conv.user.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              {conv.user.online ? <View style={styles.headOnline} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.headNameRow}>
                <Text style={styles.headName} numberOfLines={1}>
                  {conv.user.name}
                </Text>
                {conv.user.verified ? (
                  <BadgeCheck color={Colors.cyan} size={14} strokeWidth={2.8} />
                ) : null}
                {conv.muted ? (
                  <BellOff color={Colors.muted} size={11} strokeWidth={2.4} />
                ) : null}
                {conv.pinned ? (
                  <Pin color={Colors.orange} size={11} strokeWidth={2.8} />
                ) : null}
              </View>
              <Text style={styles.headStatus} numberOfLines={1}>
                {conv.user.online ? "online · active now" : `last seen ${formatTime(conv.lastAt)}`}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={onStartCall}
            style={styles.iconBtn}
            testID="dm-start-space"
          >
            <Phone color={Colors.text} size={16} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setMenu(true);
            }}
            style={styles.iconBtn}
            testID="dm-menu"
          >
            <MoreHorizontal color={Colors.text} size={16} strokeWidth={2.4} />
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
            ListHeaderComponent={
              <ProfileBlurb
                name={conv.user.name}
                handle={conv.user.handle}
                color={conv.user.color}
                bio={conv.user.bio}
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
                    <Hash color={Colors.cyan} size={11} strokeWidth={2.8} />
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
              style={[styles.composerBtn, picker && { backgroundColor: `${Colors.cyan}26` }]}
              testID="ticker-toggle"
            >
              <Hash color={picker ? Colors.cyan : Colors.muted} size={16} strokeWidth={2.6} />
            </Pressable>
            <Pressable style={styles.composerBtn} onPress={onPickImage} testID="dm-image-attach">
              <ImageIcon color={Colors.muted} size={16} strokeWidth={2.4} />
            </Pressable>
            <View style={styles.inputWrap}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={`Message ${conv.user.name}...`}
                placeholderTextColor={Colors.muted}
                style={styles.input}
                multiline
                testID="dm-input"
              />
            </View>
            <Pressable
              onPress={() => onSend()}
              style={[
                styles.sendBtn,
                { backgroundColor: text.trim().length > 0 ? Colors.cyan : "rgba(255,255,255,0.06)" },
              ]}
              disabled={text.trim().length === 0}
              testID="dm-send"
            >
              <Send
                color={text.trim().length > 0 ? Colors.ink : Colors.muted}
                size={16}
                strokeWidth={2.6}
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

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
        onDelete={() => {
          setMenu(false);
          Alert.alert(
            "Delete conversation?",
            `This removes your chat with ${conv.user.name}. You can start a new one any time.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  await deleteConversation(conv.id);
                  router.back();
                },
              },
            ],
          );
        }}
      />
    </View>
  );
}

function ProfileBlurb({
  name,
  handle,
  color,
  bio,
  onProfile,
}: {
  name: string;
  handle: string;
  color: string;
  bio?: string;
  onProfile: () => void;
}) {
  return (
    <Pressable onPress={onProfile} style={styles.blurb} testID="dm-blurb">
      <LinearGradient
        colors={[`${color}33`, `${color}08`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.blurbInner}
      >
        <View style={[styles.blurbAvatar, { backgroundColor: color }]}>
          <Text style={styles.blurbInit}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.blurbName}>{name}</Text>
        <Text style={styles.blurbHandle}>{handle}</Text>
        {bio ? <Text style={styles.blurbBio}>{bio}</Text> : null}
        <View style={styles.blurbCta}>
          <Text style={styles.blurbCtaText}>View profile</Text>
          <ChevronRight color={Colors.text} size={12} strokeWidth={2.6} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function Bubble({
  msg,
  mine,
  accent,
}: {
  msg: DMMessage;
  mine: boolean;
  accent: string;
}) {
  if (msg.type === "tip") {
    return (
      <View style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}>
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
      </View>
    );
  }

  if (msg.type === "image" && msg.imageUrl) {
    return (
      <View style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}>
        <View
          style={[
            styles.imageBubble,
            mine ? { borderColor: Colors.cyan } : { borderColor: `${accent}55` },
          ]}
        >
          <ExpoImage source={{ uri: msg.imageUrl }} style={styles.messageImage} contentFit="cover" />
        </View>
        {msg.text && msg.text !== "Photo" ? (
          <View style={[styles.bubble, mine ? { backgroundColor: Colors.cyan } : { backgroundColor: Colors.card }]}>
            <Text style={[styles.bubbleText, { color: mine ? Colors.ink : Colors.text }]}>{msg.text}</Text>
          </View>
        ) : null}
        <Text style={styles.bubbleTime}>{formatTime(msg.createdAt)}</Text>
      </View>
    );
  }

  if (msg.type === "ticker" && msg.ticker) {
    return (
      <View style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}>
        <View
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: Colors.cyan }
              : { backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
          ]}
        >
          <View
            style={[
              styles.tickerCard,
              { backgroundColor: mine ? "rgba(0,0,0,0.18)" : `${accent}14` },
            ]}
          >
            <Coins color={mine ? Colors.ink : accent} size={13} strokeWidth={2.8} />
            <Text style={[styles.tickerText, { color: mine ? Colors.ink : accent }]}>
              {msg.ticker}
            </Text>
            <View style={styles.tickerChange}>
              <TrendingUp color={Colors.mint} size={10} strokeWidth={3} />
              <Text style={styles.tickerChangeText}>+{(Math.random() * 12 + 2).toFixed(1)}%</Text>
            </View>
          </View>
          <Text style={[styles.bubbleText, { color: mine ? Colors.ink : Colors.text }]}>
            {msg.text}
          </Text>
        </View>
        <Text style={[styles.bubbleTime, mine && { color: Colors.muted }]}>
          {formatTime(msg.createdAt)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: Colors.cyan, borderBottomRightRadius: 6 }
            : {
                backgroundColor: Colors.card,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
                borderBottomLeftRadius: 6,
              },
        ]}
      >
        <Text style={[styles.bubbleText, { color: mine ? Colors.ink : Colors.text }]}>
          {msg.text}
        </Text>
      </View>
      <Text style={styles.bubbleTime}>{formatTime(msg.createdAt)}</Text>
    </View>
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
  onDelete,
}: {
  open: boolean;
  pinned: boolean;
  muted: boolean;
  onClose: () => void;
  onPin: () => void;
  onMute: () => void;
  onProfile: () => void;
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
            icon={<UserCheck color={Colors.text} size={16} strokeWidth={2.4} />}
            label="View profile"
            onPress={onProfile}
          />
          <MenuItem
            icon={<Pin color={pinned ? Colors.orange : Colors.text} size={16} strokeWidth={2.4} />}
            label={pinned ? "Unpin chat" : "Pin chat"}
            onPress={onPin}
          />
          <MenuItem
            icon={<BellOff color={muted ? Colors.cyan : Colors.text} size={16} strokeWidth={2.4} />}
            label={muted ? "Unmute" : "Mute notifications"}
            onPress={onMute}
          />
          <MenuItem
            icon={<Video color={Colors.text} size={16} strokeWidth={2.4} />}
            label="Schedule a Space"
            onPress={onClose}
          />
          <View style={styles.menuSep} />
          <MenuItem
            icon={<Trash2 color={Colors.rose} size={16} strokeWidth={2.4} />}
            label="Delete conversation"
            tone={Colors.rose}
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
      <ChevronRight color={Colors.muted} size={14} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  headInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
  },
  headAvatarWrap: { position: "relative" },
  headAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headAvatarInit: { color: Colors.ink, fontSize: 15, fontWeight: "900" },
  headOnline: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.mint,
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  headNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  headName: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, flexShrink: 1 },
  headStatus: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },

  listContent: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 16 },

  blurb: {
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 18,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.card,
  },
  blurbInner: { padding: 18, alignItems: "center" },
  blurbAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  blurbInit: { color: Colors.ink, fontSize: 28, fontWeight: "900" },
  blurbName: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 12, letterSpacing: -0.4 },
  blurbHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  blurbBio: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
    opacity: 0.86,
    lineHeight: 17,
  },
  blurbCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  blurbCtaText: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },

  daySep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 12,
  },
  dayLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  dayText: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },

  bubbleWrap: { marginBottom: 8, maxWidth: "82%" },
  bubbleLeft: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubbleRight: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleText: { fontSize: 14, lineHeight: 19, fontWeight: "500" },
  bubbleTime: { color: Colors.muted, fontSize: 9, fontWeight: "800", marginTop: 3, marginHorizontal: 6 },

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
  tipAmount: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 2 },
  tipNote: { color: Colors.text, fontSize: 11, fontWeight: "600", opacity: 0.8, marginTop: 2 },

  imageBubble: {
    width: 230,
    height: 170,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1.5,
    backgroundColor: Colors.card,
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
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },

  tickerStrip: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(11,8,24,0.7)",
  },
  tickerRow: { paddingHorizontal: 14, gap: 6 },
  tickerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.3)",
  },
  tickerChipText: { color: Colors.cyan, fontSize: 11, fontWeight: "900" },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 18 : 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(7,17,19,0.9)",
  },
  composerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    minHeight: 38,
    maxHeight: 110,
    justifyContent: "center",
  },
  input: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
    minHeight: Platform.OS === "ios" ? 18 : 26,
    maxHeight: 90,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  notFound: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  notFoundTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  notFoundBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: Colors.cyan,
    borderRadius: 12,
  },
  notFoundBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  menuSheet: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    paddingBottom: Platform.OS === "ios" ? 32 : 22,
  },
  modalHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "800" },
  menuSep: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 4 },
});
