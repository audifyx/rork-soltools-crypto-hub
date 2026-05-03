import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Bell,
  Captions,
  Flame,
  Hand,
  Heart,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  Share2,
  ShieldCheck,
  Users as UsersIcon,
  Volume2,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
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
import { SpaceMessage, SpaceParticipant, useSocial } from "@/providers/social-provider";

function shortTime(t: number): string {
  const diff = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function scheduledCopy(t?: number): string {
  if (!t) return "Scheduled";
  const m = Math.max(0, Math.floor((t - Date.now()) / 60000));
  if (m <= 0) return "Ready to start";
  if (m < 60) return `Starts in ${m}m`;
  const h = Math.floor(m / 60);
  return `Starts in ${h}h ${m % 60}m`;
}

export default function SpaceDetailScreen() {
  const router = useRouter();
  const { id: paramId } = useLocalSearchParams<{ id: string }>();
  const id = typeof paramId === "string" ? paramId : "";
  const { userId, email, isAuthenticated } = useAuth();
  const {
    getSpace,
    isFollowingSpace,
    toggleFollowSpace,
    joinSpace,
    leaveSpace,
    startSpace,
    setSpaceMute,
    setSpaceHand,
    sendSpaceMessage,
    addSpaceReaction,
    endSpace,
    useSpaceParticipants,
    useSpaceMessages,
  } = useSocial();

  const space = getSpace(id);
  const participantsQ = useSpaceParticipants(id);
  const messagesQ = useSpaceMessages(id);
  const participants = participantsQ.data ?? [];
  const messages = messagesQ.data ?? [];
  const chatRef = useRef<ScrollView | null>(null);

  const [connected, setConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(true);
  const [hand, setHand] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [reactionCount, setReactionCount] = useState<number>(0);

  const me = useMemo(
    () => participants.find((p) => p.userId === userId || p.identity === userId),
    [participants, userId],
  );
  const speakers = useMemo(() => participants.filter((p) => p.role !== "listener"), [participants]);
  const listeners = useMemo(() => participants.filter((p) => p.role === "listener"), [participants]);
  const following = space ? isFollowingSpace(space.id) : false;
  const isHost = !!space?.hostId && !!userId && space.hostId === userId;

  useEffect(() => {
    if (me) {
      setMuted(me.muted);
      setHand(me.handRaised);
    }
  }, [me]);

  useEffect(() => {
    requestAnimationFrame(() => chatRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const requireAuth = useCallback((): boolean => {
    if (isAuthenticated) return true;
    Alert.alert("Sign in required", "Join Spaces, chat, and raise your hand after signing in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign in", onPress: () => router.push("/auth") },
    ]);
    return false;
  }, [isAuthenticated, router]);

  const connectLiveKit = useCallback(async () => {
    if (!space || !requireAuth()) return;
    setConnecting(true);
    setVoiceError(null);
    try {
      if (!space.isLive && isHost) await startSpace(space.id);
      await joinSpace(space.id);
      const identity = userId ?? (email ?? "you").split("@")[0];
      await getLiveKitToken({
        room: space.livekitRoomName || space.id,
        identity,
        name: me?.name ?? (email ?? "Trader").split("@")[0],
      });
      setConnected(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "LiveKit connection unavailable.";
      console.log("[space] livekit connect failed", msg);
      setVoiceError(msg);
      Alert.alert("Could not join Space", msg);
    } finally {
      setConnecting(false);
    }
  }, [space, requireAuth, isHost, startSpace, joinSpace, userId, email, me?.name]);

  const onLeave = useCallback(async () => {
    if (!space) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setConnected(false);
    try {
      if (isHost && space.isLive) {
        Alert.alert("End Space?", "You are hosting. End this Space for everyone?", [
          { text: "Leave open", onPress: () => router.back() },
          {
            text: "End Space",
            style: "destructive",
            onPress: () => endSpace(space.id).finally(() => router.back()),
          },
        ]);
      } else {
        await leaveSpace(space.id);
        router.back();
      }
    } catch (e) {
      console.log("[space] leave failed", e);
      router.back();
    }
  }, [space, isHost, leaveSpace, endSpace, router]);

  const onMute = useCallback(async () => {
    if (!space || !requireAuth()) return;
    const next = !muted;
    setMuted(next);
    Haptics.selectionAsync().catch(() => {});
    try {
      await setSpaceMute(space.id, next);
    } catch (e) {
      setMuted(!next);
      Alert.alert("Mic locked", e instanceof Error ? e.message : "Raise your hand to request speaker access.");
    }
  }, [space, requireAuth, muted, setSpaceMute]);

  const onHand = useCallback(async () => {
    if (!space || !requireAuth()) return;
    const next = !hand;
    setHand(next);
    Haptics.selectionAsync().catch(() => {});
    try {
      await setSpaceHand(space.id, next);
    } catch (e) {
      setHand(!next);
      Alert.alert("Hand failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [space, requireAuth, hand, setSpaceHand]);

  const onSend = useCallback(async () => {
    if (!space || !message.trim() || !requireAuth()) return;
    const text = message.trim();
    setMessage("");
    Haptics.selectionAsync().catch(() => {});
    try {
      await sendSpaceMessage(space.id, text);
    } catch (e) {
      setMessage(text);
      Alert.alert("Message failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [space, message, requireAuth, sendSpaceMessage]);

  const onReact = useCallback(async () => {
    if (!space || !requireAuth()) return;
    setReactionCount((v) => v + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await addSpaceReaction(space.id, "🔥");
    } catch (e) {
      console.log("[space] reaction failed", e);
    }
  }, [space, requireAuth, addSpaceReaction]);

  if (!space) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.notFound}>
            <Text style={styles.notFoundTitle}>Space not found</Text>
            <Pressable onPress={() => router.back()} style={styles.notFoundBtn}>
              <Text style={styles.notFoundBtnText}>Go back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="space-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient colors={[`${space.accent[0]}22`, "rgba(0,0,0,0.08)", Colors.ink]} style={StyleSheet.absoluteFill} />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="space-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headMid}>
            <View style={[styles.liveBadge, !space.isLive && styles.scheduledBadge]}>
              {space.isLive ? <View style={styles.liveDot} /> : <Radio color={Colors.silver} size={10} strokeWidth={2.8} />}
              <Text style={[styles.liveText, !space.isLive && styles.scheduledText]}>
                {space.isLive ? "LIVE SPACE" : "SCHEDULED"}
              </Text>
            </View>
            <Text style={styles.topic}>{space.topic}</Text>
          </View>
          <Pressable onPress={() => Haptics.selectionAsync().catch(() => {})} style={styles.iconBtn}>
            <Share2 color={Colors.text} size={16} strokeWidth={2.4} />
          </Pressable>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{space.title}</Text>
            {space.description ? <Text style={styles.desc}>{space.description}</Text> : null}

            <View style={styles.hostLine}>
              <View style={[styles.hostAvatar, { backgroundColor: space.accent[0] }]}>
                <Text style={styles.hostInit}>{space.hostName.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.hostName}>{space.hostName}</Text>
                <Text style={styles.hostSub}>{space.hostHandle} · host</Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  toggleFollowSpace(space.id).catch(() => {});
                }}
                style={[styles.remindSmall, following && styles.remindSmallActive]}
              >
                <Bell color={following ? Colors.goldBright : Colors.text} size={13} strokeWidth={2.8} />
                <Text style={[styles.remindSmallText, following && { color: Colors.goldBright }]}>
                  {following ? "Alerting" : "Remind"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.metaRow}>
              <MetaPill Icon={UsersIcon} text={`${space.listeners} listening`} />
              <MetaPill Icon={Mic} text={`${space.speakers} speakers`} color={space.accent[0]} />
              <MetaPill Icon={Hand} text={`${space.raisedHands} hands`} color={Colors.goldBright} />
              {space.recording ? <MetaPill Icon={ShieldCheck} text="recording" color={Colors.rose} /> : null}
            </View>

            {!space.isLive ? (
              <View style={styles.scheduleCard}>
                <Text style={styles.scheduleTitle}>{scheduledCopy(space.scheduledAt)}</Text>
                <Text style={styles.scheduleBody}>
                  Follow this Space for a reminder. Hosts can start it early from this room.
                </Text>
                {isHost ? (
                  <Pressable onPress={connectLiveKit} style={styles.startLiveBtn} disabled={connecting}>
                    <Flame color={Colors.ink} size={15} strokeWidth={3} />
                    <Text style={styles.startLiveText}>{connecting ? "STARTING..." : "START LIVE"}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <VoiceStatus
                connected={connected}
                connecting={connecting}
                error={voiceError}
                accent={space.accent[0]}
                muted={muted}
                onConnect={connectLiveKit}
                onMute={onMute}
              />
            )}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SPEAKERS · {speakers.length}</Text>
              {speakers.length === 0 ? (
                <EmptyBox icon={<Mic color={Colors.muted} size={20} strokeWidth={2.4} />} text="No speakers on stage yet" />
              ) : (
                <View style={styles.grid}>
                  {speakers.map((p) => <SpeakerTile key={p.id} p={p} accent={space.accent[0]} />)}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LISTENERS · {listeners.length}</Text>
              {listeners.length === 0 ? (
                <EmptyBox icon={<UsersIcon color={Colors.muted} size={20} strokeWidth={2.4} />} text="Be the first to drop in" />
              ) : (
                <View style={styles.listenerGrid}>
                  {listeners.slice(0, 18).map((l) => (
                    <View key={l.id} style={[styles.listenerAvatar, { backgroundColor: l.avatarColor }]}>
                      <Text style={styles.listenerInit}>{l.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  ))}
                  {listeners.length > 18 ? (
                    <View style={styles.listenerMore}><Text style={styles.listenerMoreText}>+{listeners.length - 18}</Text></View>
                  ) : null}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LIVE CHAT · {messages.length}</Text>
              <View style={styles.chatBox}>
                <ScrollView ref={chatRef} nestedScrollEnabled style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
                  {messages.length === 0 ? (
                    <View style={styles.chatEmpty}>
                      <MessageCircle color={Colors.muted} size={18} strokeWidth={2.4} />
                      <Text style={styles.chatEmptyText}>No messages yet. Drop the first alpha note.</Text>
                    </View>
                  ) : (
                    messages.map((m) => <ChatBubble key={m.id} message={m} />)
                  )}
                </ScrollView>
              </View>
            </View>
          </ScrollView>

          {space.isLive ? (
            <View style={styles.bottomDock}>
              <View style={styles.chatInputWrap}>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder={connected ? "Message the Space..." : "Join to chat..."}
                  placeholderTextColor={Colors.muted2}
                  style={styles.chatInput}
                  autoCapitalize="sentences"
                  editable={isAuthenticated}
                  onSubmitEditing={onSend}
                />
                <Pressable onPress={onSend} style={styles.sendBtn} testID="space-send-message">
                  <Send color={Colors.ink} size={15} strokeWidth={3} />
                </Pressable>
              </View>
              <View style={styles.controlsRow}>
                <ControlButton active={!muted} onPress={onMute} testID="space-mute">
                  {muted ? <MicOff color={Colors.text} size={18} strokeWidth={2.6} /> : <Mic color={Colors.ink} size={18} strokeWidth={2.6} />}
                </ControlButton>
                <ControlButton active={hand} onPress={onHand} warn testID="space-hand">
                  <Hand color={hand ? Colors.ink : Colors.text} size={18} strokeWidth={2.6} />
                </ControlButton>
                <ControlButton onPress={onReact} testID="space-react">
                  <Heart color={Colors.rose} size={18} strokeWidth={2.6} fill={reactionCount > 0 ? Colors.rose : "transparent"} />
                  {reactionCount > 0 ? <View style={styles.reactCount}><Text style={styles.reactCountText}>{reactionCount}</Text></View> : null}
                </ControlButton>
                <ControlButton onPress={() => Alert.alert("Captions", "Live captions hook is ready for the speech-to-text service.")} testID="space-cc">
                  <Captions color={Colors.text} size={18} strokeWidth={2.6} />
                </ControlButton>
                <Pressable onPress={onLeave} style={[styles.controlBtn, styles.leaveBtn]} testID="space-leave">
                  <PhoneOff color={Colors.ink} size={18} strokeWidth={2.6} />
                </Pressable>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function MetaPill({ Icon, text, color = Colors.muted }: { Icon: React.ComponentType<{ color: string; size: number; strokeWidth: number }>; text: string; color?: string }) {
  return (
    <View style={styles.metaPill}>
      <Icon color={color} size={11} strokeWidth={2.8} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

function VoiceStatus({ connected, connecting, error, accent, muted, onConnect, onMute }: { connected: boolean; connecting: boolean; error: string | null; accent: string; muted: boolean; onConnect: () => void; onMute: () => void }) {
  return (
    <View style={styles.voiceCard}>
      {connected ? (
        <>
          <View style={[styles.voiceOrb, { backgroundColor: accent }]}><Volume2 color={Colors.ink} size={22} strokeWidth={3} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceTitle}>Connected to LiveKit</Text>
            <Text style={styles.voiceSub}>{muted ? "Listening muted. Raise hand or unmute if you are a speaker." : "Mic live for the Space."}</Text>
          </View>
          <Pressable onPress={onMute} style={[styles.voiceMic, !muted && { backgroundColor: Colors.goldBright }]}>
            {muted ? <MicOff color={Colors.rose} size={18} strokeWidth={2.8} /> : <Mic color={Colors.ink} size={18} strokeWidth={3} />}
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.voiceOrb}><Radio color={accent} size={22} strokeWidth={3} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceTitle}>LiveKit room ready</Text>
            <Text style={styles.voiceSub}>{error ?? "Tap join to request a LiveKit token and enter the Space."}</Text>
          </View>
          <Pressable onPress={onConnect} style={styles.connectBtn} disabled={connecting} testID="space-connect-livekit">
            <Text style={styles.connectText}>{connecting ? "…" : "Join"}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function EmptyBox({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <View style={styles.emptyBox}>{icon}<Text style={styles.emptyText}>{text}</Text></View>;
}

function SpeakerTile({ p, accent }: { p: SpaceParticipant; accent: string }) {
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!p.speaking) {
      ring.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ring, { toValue: 1, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(ring, { toValue: 0, duration: 800, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [p.speaking, ring]);
  const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const opacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  return (
    <View style={styles.speakerTile}>
      <View style={styles.speakerAvatarWrap}>
        {p.speaking ? <Animated.View style={[styles.speakerRing, { borderColor: accent, transform: [{ scale }], opacity }]} /> : null}
        <View style={[styles.speakerAvatar, { backgroundColor: p.avatarColor, borderColor: p.speaking ? accent : "transparent" }]}>
          <Text style={styles.speakerInit}>{p.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        {p.muted ? <View style={styles.muteBadge}><MicOff color={Colors.text} size={9} strokeWidth={2.8} /></View> : null}
      </View>
      <Text style={styles.speakerName} numberOfLines={1}>{p.name}</Text>
      <Text style={styles.speakerRole} numberOfLines={1}>{p.role}</Text>
    </View>
  );
}

function ChatBubble({ message }: { message: SpaceMessage }) {
  return (
    <View style={styles.chatRow}>
      <View style={[styles.chatAvatar, { backgroundColor: message.authorColor }]}>
        <Text style={styles.chatInit}>{message.authorName.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.chatBubble}>
        <View style={styles.chatHead}>
          <Text style={styles.chatName}>{message.authorName}</Text>
          <Text style={styles.chatTime}>{shortTime(message.createdAt)}</Text>
        </View>
        <Text style={styles.chatText}>{message.body}</Text>
      </View>
    </View>
  );
}

function ControlButton({ children, active, warn, onPress, testID }: { children: React.ReactNode; active?: boolean; warn?: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.controlBtn, active && { backgroundColor: warn ? Colors.goldBright : Colors.mint, borderColor: warn ? Colors.goldBright : Colors.mint }]} testID={testID}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headMid: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(244,198,91,0.16)", borderWidth: 1, borderColor: "rgba(244,198,91,0.34)" },
  scheduledBadge: { backgroundColor: "rgba(221,227,236,0.12)", borderColor: "rgba(221,227,236,0.24)" },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.goldBright },
  liveText: { color: Colors.goldBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  scheduledText: { color: Colors.silver, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  topic: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  scroll: { paddingHorizontal: 18, paddingBottom: 194 },
  title: { color: Colors.text, fontSize: 29, fontWeight: "900", letterSpacing: -0.8, marginTop: 8 },
  desc: { color: Colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 19, marginTop: 8 },
  hostLine: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, padding: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  hostAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  hostInit: { color: Colors.ink, fontSize: 15, fontWeight: "900" },
  hostName: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  hostSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  remindSmall: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  remindSmallActive: { backgroundColor: "rgba(244,198,91,0.14)", borderColor: Colors.goldBright },
  remindSmallText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 14 },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)" },
  metaText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  scheduleCard: { marginTop: 18, padding: 16, borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(244,198,91,0.20)" },
  scheduleTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  scheduleBody: { color: Colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 5 },
  startLiveBtn: { marginTop: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.goldBright },
  startLiveText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  voiceCard: { marginTop: 18, padding: 14, borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", gap: 12 },
  voiceOrb: { width: 48, height: 48, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  voiceTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  voiceSub: { color: Colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "600", marginTop: 3 },
  voiceMic: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  connectBtn: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.goldBright },
  connectText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  section: { marginTop: 22 },
  sectionLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginBottom: 12 },
  emptyBox: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 22, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  speakerTile: { width: "33.33%", alignItems: "center", marginBottom: 18 },
  speakerAvatarWrap: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  speakerRing: { position: "absolute", width: 64, height: 64, borderRadius: 32, borderWidth: 2 },
  speakerAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  speakerInit: { color: Colors.ink, fontSize: 22, fontWeight: "900" },
  muteBadge: { position: "absolute", bottom: 0, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: Colors.ink },
  speakerName: { color: Colors.text, fontSize: 12, fontWeight: "900", marginTop: 8, maxWidth: 96 },
  speakerRole: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  listenerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  listenerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  listenerInit: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  listenerMore: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  listenerMoreText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  chatBox: { borderRadius: 18, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  chatScroll: { maxHeight: 260 },
  chatContent: { padding: 12, gap: 10 },
  chatEmpty: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  chatEmptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  chatRow: { flexDirection: "row", gap: 9 },
  chatAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  chatInit: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  chatBubble: { flex: 1, padding: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)" },
  chatHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  chatName: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  chatTime: { color: Colors.muted2, fontSize: 10, fontWeight: "800" },
  chatText: { color: Colors.text, fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 3 },
  bottomDock: { position: "absolute", left: 12, right: 12, bottom: 18, padding: 10, borderRadius: 26, backgroundColor: "rgba(8,7,5,0.96)", borderWidth: 1, borderColor: "rgba(244,198,91,0.20)" },
  chatInputWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 9 },
  chatInput: { flex: 1, height: 42, borderRadius: 15, paddingHorizontal: 12, color: Colors.text, fontSize: 13, fontWeight: "700", backgroundColor: "rgba(255,255,255,0.06)" },
  sendBtn: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: Colors.goldBright },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 },
  controlBtn: { flex: 1, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  leaveBtn: { backgroundColor: Colors.rose, borderColor: Colors.rose },
  reactCount: { position: "absolute", top: -2, right: 6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: Colors.rose, alignItems: "center", justifyContent: "center" },
  reactCountText: { color: Colors.ink, fontSize: 9, fontWeight: "900" },
  notFound: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  notFoundTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  notFoundBtn: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: Colors.goldBright, borderRadius: 12 },
  notFoundBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
