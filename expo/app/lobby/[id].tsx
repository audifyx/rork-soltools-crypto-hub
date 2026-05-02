import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ChartLine,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eye,
  Hand,
  Hash,
  Heart,
  LineChart,
  Lock,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  Plus,
  Radio,
  Send,
  Share2,
  Sparkles,
  Users as UsersIcon,
  Volume2,
  Wallet,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
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
import { getLiveKitToken } from "@/lib/api/livekit";
import { useAuth } from "@/providers/auth-provider";
import {
  type LobbyMessage,
  type LobbyWatch,
  useLobbies,
} from "@/providers/lobbies-provider";

type Tab = "chat" | "watch" | "members";

export default function LobbyDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lobbyId = typeof id === "string" ? id : "";
  const {
    getLobby,
    handleSelf,
    leaveLobby,
    sendMessage,
    toggleMute,
    addWatch,
    removeWatch,
  } = useLobbies();
  const { userId, email } = useAuth();

  const lobby = lobbyId ? getLobby(lobbyId) : undefined;

  const [tab, setTab] = useState<Tab>("chat");
  const [text, setText] = useState<string>("");
  const [hand, setHand] = useState<boolean>(false);
  const [reactions, setReactions] = useState<number>(0);
  const [voiceConnected, setVoiceConnected] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState<boolean>(false);
  const [addingWatch, setAddingWatch] = useState<boolean>(false);
  const [watchType, setWatchType] = useState<"token" | "wallet">("token");
  const [watchAddress, setWatchAddress] = useState<string>("");
  const [watchLabel, setWatchLabel] = useState<string>("");

  const pulse = useRef(new Animated.Value(0)).current;
  const chatRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (tab === "chat") {
      requestAnimationFrame(() => chatRef.current?.scrollToEnd({ animated: true }));
    }
  }, [lobby?.messages.length, tab]);

  const me = useMemo(
    () => lobby?.members.find((m) => m.handle === handleSelf),
    [lobby?.members, handleSelf],
  );

  const onConnectVoice = useCallback(async () => {
    if (!lobby) return;
    setVoiceError(null);
    setVoiceLoading(true);
    try {
      const handle = (email ?? "you").split("@")[0];
      await getLiveKitToken({
        room: lobby.id,
        identity: userId ?? handle,
        name: handle,
      });
      setVoiceConnected(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.log("[lobby] voice token", e);
      setVoiceError(e instanceof Error ? e.message : "Voice unavailable");
    } finally {
      setVoiceLoading(false);
    }
  }, [lobby, userId, email]);

  const onDisconnect = useCallback(() => {
    setVoiceConnected(false);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const onLeave = useCallback(() => {
    if (!lobby) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    leaveLobby(lobby.id);
    router.back();
  }, [lobby, leaveLobby, router]);

  const onSend = useCallback(() => {
    if (!lobby || !text.trim()) return;
    Haptics.selectionAsync().catch(() => {});
    sendMessage(lobby.id, text);
    setText("");
  }, [lobby, text, sendMessage]);

  const onToggleMute = useCallback(() => {
    if (!lobby) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggleMute(lobby.id);
  }, [lobby, toggleMute]);

  const onCopyId = useCallback(async () => {
    if (!lobby) return;
    await Clipboard.setStringAsync(lobby.id);
    Haptics.selectionAsync().catch(() => {});
  }, [lobby]);

  const onAddWatch = useCallback(() => {
    if (!lobby) return;
    const addr = watchAddress.trim();
    const label =
      watchLabel.trim() || (watchType === "token" ? `$${addr.slice(0, 6).toUpperCase()}` : addr.slice(0, 6));
    if (addr.length < 4) {
      Alert.alert("Invalid", "Enter a valid address or ticker.");
      return;
    }
    addWatch(lobby.id, { type: watchType, address: addr, label });
    setAddingWatch(false);
    setWatchAddress("");
    setWatchLabel("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [lobby, watchType, watchAddress, watchLabel, addWatch]);

  const onPasteWatch = useCallback(async () => {
    try {
      const v = await Clipboard.getStringAsync();
      if (v) setWatchAddress(v.trim());
    } catch {}
  }, []);

  const onOpenWatch = useCallback(
    (w: LobbyWatch) => {
      Haptics.selectionAsync().catch(() => {});
      if (w.type === "wallet") {
        router.push({ pathname: "/tool/wallet-tracker", params: { address: w.address } });
      } else {
        router.push({ pathname: "/tool/token-lookup", params: { ca: w.address } });
      }
    },
    [router],
  );

  if (!lobby) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <View style={styles.notFound}>
            <Text style={styles.notFoundTitle}>Lobby closed</Text>
            <Pressable onPress={() => router.back()} style={styles.backSolo}>
              <Text style={styles.backSoloText}>Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const muted = me?.muted ?? true;
  const speakingCount = lobby.members.filter((m) => m.speaking).length;
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <View style={styles.topBadge}>
              {voiceConnected ? (
                <>
                  <View style={styles.dotRose} />
                  <Text style={styles.topBadgeText}>LIVE LOBBY</Text>
                </>
              ) : (
                <>
                  {lobby.isPrivate ? (
                    <Lock color={Colors.muted} size={11} strokeWidth={2.8} />
                  ) : (
                    <Radio color={Colors.muted} size={11} strokeWidth={2.8} />
                  )}
                  <Text style={[styles.topBadgeText, { color: Colors.muted }]}>
                    {lobby.isPrivate ? "PRIVATE" : "PUBLIC"}
                  </Text>
                </>
              )}
            </View>
          </View>
          <Pressable onPress={onCopyId} style={styles.iconBtn}>
            <Share2 color={Colors.text} size={16} strokeWidth={2.6} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <LinearGradient
              colors={["rgba(255,93,143,0.32)", "rgba(184,140,255,0.16)", "rgba(3,7,8,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={styles.heroTitle}>{lobby.name}</Text>
              <Text style={styles.heroTopic}>{lobby.topic}</Text>
              <View style={styles.heroMeta}>
                <View style={styles.metaItem}>
                  <UsersIcon color={Colors.cyan} size={11} strokeWidth={2.8} />
                  <Text style={styles.metaText}>{lobby.members.length}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Volume2 color={Colors.rose} size={11} strokeWidth={2.8} />
                  <Text style={styles.metaText}>{speakingCount} live</Text>
                </View>
                <View style={styles.metaItem}>
                  <Hash color={Colors.muted} size={11} strokeWidth={2.8} />
                  <Text style={styles.metaText}>{lobby.id.slice(-6)}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Voice status card */}
            <View style={styles.voiceCard}>
              {voiceConnected ? (
                <View style={styles.voiceConnected}>
                  <View style={styles.voiceDotWrap}>
                    <Animated.View
                      style={[
                        styles.voicePulse,
                        { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                      ]}
                    />
                    <View style={styles.voiceDot} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.voiceTitle}>Connected · Voice live</Text>
                    <Text style={styles.voiceSub}>
                      {muted ? "You're muted — tap mic to talk" : "Mic live — speak to the room"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onToggleMute}
                    style={[
                      styles.micBtn,
                      { backgroundColor: muted ? "rgba(255,93,143,0.16)" : Colors.mint },
                    ]}
                    testID="mic-toggle"
                  >
                    {muted ? (
                      <MicOff color={Colors.rose} size={18} strokeWidth={2.8} />
                    ) : (
                      <Mic color={Colors.ink} size={18} strokeWidth={3} />
                    )}
                  </Pressable>
                </View>
              ) : (
                <View style={styles.voiceIdle}>
                  <View style={styles.voiceIdleIcon}>
                    <Mic color={Colors.rose} size={20} strokeWidth={2.6} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.voiceTitle}>Voice room</Text>
                    <Text style={styles.voiceSub}>
                      {voiceError ?? "Tap connect to join voice via LiveKit."}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onConnectVoice}
                    style={styles.connectBtn}
                    disabled={voiceLoading}
                    testID="voice-connect"
                  >
                    <Text style={styles.connectText}>
                      {voiceLoading ? "…" : "Connect"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {voiceConnected && (
                <View style={styles.controlsRow}>
                  <ControlBtn
                    label={hand ? "Hand up" : "Raise hand"}
                    icon={<Hand color={hand ? Colors.ink : Colors.text} size={14} strokeWidth={2.8} />}
                    active={hand}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setHand((h) => !h);
                    }}
                  />
                  <ControlBtn
                    label={`React · ${reactions}`}
                    icon={<Heart color={Colors.text} size={14} strokeWidth={2.8} />}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setReactions((r) => r + 1);
                    }}
                  />
                  <ControlBtn
                    danger
                    label="Leave"
                    icon={<PhoneOff color={Colors.rose} size={14} strokeWidth={2.8} />}
                    onPress={onDisconnect}
                  />
                </View>
              )}
            </View>

            {/* Speaker grid */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Volume2 color={Colors.rose} size={13} strokeWidth={2.8} />
                <Text style={styles.sectionTitle}>On stage</Text>
                <View style={styles.countChip}>
                  <Text style={styles.countChipText}>{lobby.members.length}</Text>
                </View>
              </View>
              <View style={styles.speakerGrid}>
                {lobby.members.map((m) => (
                  <View key={m.id} style={styles.speakerTile}>
                    <View
                      style={[
                        styles.speakerAvatar,
                        {
                          borderColor: m.speaking
                            ? Colors.rose
                            : m.isHost
                              ? Colors.violet
                              : Colors.line,
                        },
                      ]}
                    >
                      <Text style={styles.speakerInitial}>
                        {m.handle.replace("@", "").slice(0, 1).toUpperCase()}
                      </Text>
                      {m.muted ? (
                        <View style={styles.speakerMute}>
                          <MicOff color={Colors.rose} size={10} strokeWidth={3} />
                        </View>
                      ) : (
                        <View style={[styles.speakerMute, styles.speakerMuteOn]}>
                          <Mic color={Colors.ink} size={10} strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.speakerName} numberOfLines={1}>
                      {m.handle}
                    </Text>
                    {m.isHost && <Text style={styles.speakerRole}>HOST</Text>}
                  </View>
                ))}
              </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabsRow}>
              <TabBtn
                active={tab === "chat"}
                onPress={() => setTab("chat")}
                Icon={MessageCircle}
                label="Chat"
                count={lobby.messages.filter((m) => m.type !== "system").length}
              />
              <TabBtn
                active={tab === "watch"}
                onPress={() => setTab("watch")}
                Icon={Eye}
                label="Watch"
                count={lobby.watch.length}
              />
              <TabBtn
                active={tab === "members"}
                onPress={() => setTab("members")}
                Icon={UsersIcon}
                label="Members"
                count={lobby.members.length}
              />
            </View>

            {tab === "chat" && (
              <View style={styles.chatBox} ref={undefined}>
                <ScrollView
                  ref={chatRef}
                  style={{ maxHeight: 360 }}
                  contentContainerStyle={{ padding: 14, gap: 8 }}
                >
                  {lobby.messages.length === 0 ? (
                    <Text style={styles.chatEmpty}>Start the conversation. Tip: prefix with $ for tickers.</Text>
                  ) : (
                    lobby.messages.map((m) => <ChatBubble key={m.id} msg={m} self={m.fromHandle === handleSelf} />)
                  )}
                </ScrollView>
                <View style={styles.chatInputBar}>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="Drop alpha…"
                    placeholderTextColor={Colors.muted}
                    style={styles.chatInput}
                    onSubmitEditing={onSend}
                    blurOnSubmit={false}
                    returnKeyType="send"
                    testID="chat-input"
                  />
                  <Pressable
                    onPress={onSend}
                    style={[styles.sendBtn, !text.trim() && { opacity: 0.4 }]}
                    disabled={!text.trim()}
                    testID="chat-send"
                  >
                    <Send color={Colors.ink} size={14} strokeWidth={3} />
                  </Pressable>
                </View>
              </View>
            )}

            {tab === "watch" && (
              <View style={styles.watchBox}>
                <View style={styles.watchHead}>
                  <Text style={styles.watchTitle}>Shared watchlist</Text>
                  <Pressable
                    onPress={() => setAddingWatch(true)}
                    style={styles.addWatchBtn}
                    testID="watch-add"
                  >
                    <Plus color={Colors.ink} size={13} strokeWidth={3} />
                    <Text style={styles.addWatchText}>Add</Text>
                  </Pressable>
                </View>
                {lobby.watch.length === 0 ? (
                  <View style={styles.watchEmpty}>
                    <View style={styles.watchEmptyIcon}>
                      <Eye color={Colors.violet} size={20} strokeWidth={2.6} />
                    </View>
                    <Text style={styles.watchEmptyTitle}>Nothing tracked yet</Text>
                    <Text style={styles.watchEmptyBody}>
                      Add tokens or wallets the room is watching together.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {lobby.watch.map((w) => (
                      <Pressable
                        key={w.id}
                        onPress={() => onOpenWatch(w)}
                        style={styles.watchRow}
                      >
                        <View
                          style={[
                            styles.watchIcon,
                            {
                              backgroundColor:
                                w.type === "wallet"
                                  ? "rgba(255,184,76,0.16)"
                                  : "rgba(85,245,178,0.16)",
                            },
                          ]}
                        >
                          {w.type === "wallet" ? (
                            <Wallet color={Colors.orange} size={14} strokeWidth={2.6} />
                          ) : (
                            <LineChart color={Colors.mint} size={14} strokeWidth={2.6} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.watchLabel}>{w.label}</Text>
                          <Text style={styles.watchSub} numberOfLines={1}>
                            {w.address.slice(0, 8)}…{w.address.slice(-6)}
                          </Text>
                        </View>
                        <ChartLine color={Colors.mint} size={14} strokeWidth={2.6} />
                        <Pressable
                          hitSlop={8}
                          onPress={() => removeWatch(lobby.id, w.id)}
                          style={styles.removeBtn}
                        >
                          <X color={Colors.muted} size={14} strokeWidth={2.6} />
                        </Pressable>
                        <ChevronRight color={Colors.muted} size={14} strokeWidth={2.6} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {tab === "members" && (
              <View style={styles.section}>
                <View style={{ gap: 8 }}>
                  {lobby.members.map((m) => (
                    <View key={m.id} style={styles.memberRow}>
                      <View
                        style={[
                          styles.memberAvatar,
                          {
                            backgroundColor: m.speaking
                              ? Colors.rose
                              : m.isHost
                                ? Colors.violet
                                : Colors.cardSoft,
                          },
                        ]}
                      >
                        <Text style={styles.memberInitial}>
                          {m.handle.replace("@", "").slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberHandle}>{m.handle}</Text>
                        <Text style={styles.memberRoleText}>
                          {m.isHost ? "Host" : m.speaking ? "Speaking" : m.muted ? "Muted" : "Listener"}
                        </Text>
                      </View>
                      {m.muted ? (
                        <MicOff color={Colors.muted} size={14} strokeWidth={2.6} />
                      ) : (
                        <Mic color={Colors.mint} size={14} strokeWidth={2.6} />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Pressable onPress={onLeave} style={styles.leaveBtn} testID="lobby-leave">
              <PhoneOff color={Colors.rose} size={14} strokeWidth={2.8} />
              <Text style={styles.leaveText}>Leave lobby</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Add watch modal */}
      <Modal
        visible={addingWatch}
        animationType="slide"
        transparent
        onRequestClose={() => setAddingWatch(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddingWatch(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Add to watchlist</Text>
              <Pressable onPress={() => setAddingWatch(false)} hitSlop={10}>
                <X color={Colors.muted} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>

            <View style={styles.typeRow}>
              {(["token", "wallet"] as const).map((t) => {
                const active = watchType === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setWatchType(t)}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                  >
                    {t === "token" ? (
                      <LineChart
                        color={active ? Colors.ink : Colors.text}
                        size={13}
                        strokeWidth={2.6}
                      />
                    ) : (
                      <Wallet
                        color={active ? Colors.ink : Colors.text}
                        size={13}
                        strokeWidth={2.6}
                      />
                    )}
                    <Text style={[styles.typeText, active && { color: Colors.ink }]}>
                      {t === "token" ? "Token" : "Wallet"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>{watchType === "token" ? "Contract" : "Wallet address"}</Text>
            <View style={styles.inputWithAction}>
              <TextInput
                value={watchAddress}
                onChangeText={setWatchAddress}
                placeholder="Paste address…"
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.modalInput, { flex: 1 }]}
              />
              <Pressable onPress={onPasteWatch} style={styles.iconAction} hitSlop={6}>
                <ClipboardPaste color={Colors.mint} size={15} strokeWidth={2.6} />
              </Pressable>
            </View>
            <Text style={styles.label}>Label (optional)</Text>
            <TextInput
              value={watchLabel}
              onChangeText={setWatchLabel}
              placeholder={watchType === "token" ? "$WIF" : "Whale wallet"}
              placeholderTextColor={Colors.muted}
              style={styles.modalInput}
            />

            <Pressable onPress={onAddWatch} style={styles.cta}>
              <Plus color={Colors.ink} size={15} strokeWidth={3} />
              <Text style={styles.ctaText}>Track for the room</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ControlBtn({
  label,
  icon,
  onPress,
  active,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.controlBtn,
        active && { backgroundColor: Colors.mint, borderColor: Colors.mint },
        danger && { backgroundColor: "rgba(255,93,143,0.16)", borderColor: "rgba(255,93,143,0.4)" },
      ]}
    >
      {icon}
      <Text
        style={[
          styles.controlBtnText,
          active && { color: Colors.ink },
          danger && { color: Colors.rose },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TabBtn({
  active,
  onPress,
  Icon,
  label,
  count,
}: {
  active: boolean;
  onPress: () => void;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  count: number;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
    >
      <Icon color={active ? Colors.ink : Colors.muted} size={13} strokeWidth={2.8} />
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
      <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
        <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
      </View>
    </Pressable>
  );
}

function ChatBubble({ msg, self }: { msg: LobbyMessage; self: boolean }) {
  if (msg.type === "system") {
    return (
      <View style={styles.systemMsg}>
        <Sparkles color={Colors.muted} size={10} strokeWidth={2.8} />
        <Text style={styles.systemText}>{msg.text}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.bubbleWrap, self && { alignSelf: "flex-end" }]}>
      {!self && <Text style={styles.bubbleHandle}>{msg.fromHandle}</Text>}
      <View style={[styles.bubble, self ? styles.bubbleSelf : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, self && { color: Colors.ink }]}>{msg.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 60 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  topBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,93,143,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
  },
  topBadgeText: { color: Colors.rose, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  dotRose: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.rose },

  hero: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.35)",
    overflow: "hidden",
  },
  heroTitle: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
  heroTopic: { color: Colors.muted, fontSize: 13, fontWeight: "600", marginTop: 6, lineHeight: 19 },
  heroMeta: { flexDirection: "row", gap: 8, marginTop: 14 },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.45)",
    borderWidth: 1,
    borderColor: Colors.line,
  },
  metaText: { color: Colors.text, fontSize: 11, fontWeight: "800" },

  voiceCard: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.3)",
    backgroundColor: Colors.card,
    padding: 16,
    gap: 12,
  },
  voiceConnected: { flexDirection: "row", alignItems: "center", gap: 12 },
  voiceIdle: { flexDirection: "row", alignItems: "center", gap: 12 },
  voiceIdleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,93,143,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
  },
  voiceTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  voiceSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  voiceDotWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.rose },
  voicePulse: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.rose,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.rose,
  },
  connectText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  controlsRow: { flexDirection: "row", gap: 8 },
  controlBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: "rgba(3,7,8,0.45)",
  },
  controlBtnText: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },

  section: { marginTop: 18 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  countChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  countChipText: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },

  speakerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  speakerTile: { width: 70, alignItems: "center" },
  speakerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: Colors.cardSoft,
    position: "relative",
  },
  speakerInitial: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  speakerMute: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,7,8,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
  },
  speakerMuteOn: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  speakerName: { color: Colors.text, fontSize: 11, fontWeight: "800", marginTop: 6, maxWidth: 70 },
  speakerRole: { color: Colors.violet, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 2 },

  tabsRow: { flexDirection: "row", gap: 6, marginTop: 18 },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  tabBtnActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  tabBtnText: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  tabBtnTextActive: { color: Colors.ink },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tabBadgeActive: { backgroundColor: "rgba(3,7,8,0.25)" },
  tabBadgeText: { color: Colors.muted, fontSize: 9, fontWeight: "900" },
  tabBadgeTextActive: { color: Colors.ink },

  chatBox: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  chatEmpty: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 30,
  },
  chatInputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  chatInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    borderRadius: 10,
    backgroundColor: "rgba(3,7,8,0.5)",
    borderWidth: 1,
    borderColor: Colors.line,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.rose,
  },

  bubbleWrap: { maxWidth: "82%" },
  bubbleHandle: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleSelf: { backgroundColor: Colors.mint, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: "rgba(255,255,255,0.06)",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: Colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  systemMsg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  systemText: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },

  watchBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(184,140,255,0.3)",
    backgroundColor: Colors.card,
  },
  watchHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  watchTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  addWatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.violet,
  },
  addWatchText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  watchEmpty: { alignItems: "center", paddingVertical: 28 },
  watchEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(184,140,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  watchEmptyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 12 },
  watchEmptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", marginTop: 4, textAlign: "center", paddingHorizontal: 30 },
  watchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: "rgba(3,7,8,0.45)",
  },
  watchIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  watchLabel: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  watchSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  removeBtn: { padding: 4 },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInitial: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  memberHandle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  memberRoleText: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  leaveBtn: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
    backgroundColor: "rgba(255,93,143,0.12)",
  },
  leaveText: { color: Colors.rose, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },

  notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 18 },
  notFoundTitle: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  backSolo: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.mint },
  backSoloText: { color: Colors.ink, fontWeight: "900", fontSize: 14 },

  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: "rgba(184,140,255,0.4)",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  typeChipActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  typeText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  label: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 6,
  },
  inputWithAction: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalInput: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  iconAction: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  cta: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.violet,
  },
  ctaText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
});
