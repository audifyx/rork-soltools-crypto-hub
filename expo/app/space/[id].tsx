import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Captions,
  Check,
  Copy,
  Crown,
  Hand,
  Heart,
  Link as LinkIcon,
  MessageCircle,
  Mic,
  MicOff,
  Pin,
  PhoneOff,
  Plus,
  Radio,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users as UsersIcon,
  Volume2,
  X,
  Zap,
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
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { getLiveKitToken } from "@/lib/api/livekit";
import { navigateBack } from "@/lib/navigation";
import { useApp } from "@/providers/app-provider";
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

function liveCopy(startedAt?: number): string {
  if (!startedAt) return "Live now";
  const m = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  if (m < 60) return `${m}m live`;
  return `${Math.floor(m / 60)}h ${m % 60}m live`;
}

export default function SpaceDetailScreen() {
  const router = useRouter();
  const { id: paramId } = useLocalSearchParams<{ id: string }>();
  const id = typeof paramId === "string" ? paramId : "";
  const { userId, isAuthenticated } = useAuth();
  const { profile } = useApp();
  const {
    getSpace,
    isFollowingSpace,
    toggleFollowSpace,
    joinSpace,
    leaveSpace,
    startSpace,
    setSpaceMute,
    setSpaceHand,
    setSpaceParticipantRole,
    removeSpaceParticipant,
    heartbeatSpace,
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
  const [livekitRoom, setLivekitRoom] = useState<string>("");
  const [floaters, setFloaters] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [reactionPickerOpen, setReactionPickerOpen] = useState<boolean>(false);
  const [pinnedNote, setPinnedNote] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [pinDraft, setPinDraft] = useState<string>("");
  const [poll, setPoll] = useState<{ q: string; options: { label: string; votes: number }[]; voted: number | null } | null>(null);
  const [pollModalOpen, setPollModalOpen] = useState<boolean>(false);
  const [pollQ, setPollQ] = useState<string>("");
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);
  const [peakListeners, setPeakListeners] = useState<number>(0);

  const me = useMemo(
    () => participants.find((p) => p.userId === userId || p.identity === userId),
    [participants, userId],
  );
  const speakers = useMemo(
    () => participants.filter((p) => p.role !== "listener").sort((a, b) => roleRank(a.role) - roleRank(b.role)),
    [participants],
  );
  const listeners = useMemo(() => participants.filter((p) => p.role === "listener"), [participants]);
  const raisedHands = useMemo(() => participants.filter((p) => p.handRaised), [participants]);
  const following = space ? isFollowingSpace(space.id) : false;
  const isHost = !!space?.hostId && !!userId && space.hostId === userId;
  const canSpeak = me?.role === "host" || me?.role === "co-host" || me?.role === "speaker";

  useEffect(() => {
    if (me) {
      setMuted(me.muted);
      setHand(me.handRaised);
    }
  }, [me]);

  useEffect(() => {
    requestAnimationFrame(() => chatRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  useEffect(() => {
    if (space && space.listeners > peakListeners) setPeakListeners(space.listeners);
  }, [space, peakListeners]);

  useEffect(() => {
    if (!connected || !space) return;
    heartbeatSpace(space.id).catch(() => {});
    const interval = setInterval(() => heartbeatSpace(space.id).catch(() => {}), 30_000);
    return () => clearInterval(interval);
  }, [connected, heartbeatSpace, space]);

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
      const profileHandle = profile.handle?.replace(/^@/, "").trim() || "Trader";
      const identity = userId ?? profileHandle;
      const token = await getLiveKitToken({
        room: space.livekitRoomName || space.id,
        identity,
        name: me?.name ?? profile.displayName ?? profileHandle,
      });
      setLivekitRoom(token.room);
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
  }, [space, requireAuth, isHost, startSpace, joinSpace, userId, profile.handle, profile.displayName, me?.name]);

  const onLeave = useCallback(async () => {
    if (!space) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setConnected(false);
    try {
      if (isHost && space.isLive) {
        Alert.alert("End Space?", "You are hosting. End this Space for everyone?", [
          { text: "Leave open", onPress: () => navigateBack(router, "/spaces") },
          { text: "End Space", style: "destructive", onPress: () => endSpace(space.id).finally(() => navigateBack(router, "/spaces")) },
        ]);
      } else {
        await leaveSpace(space.id);
        navigateBack(router, "/spaces");
      }
    } catch (e) {
      console.log("[space] leave failed", e);
      navigateBack(router, "/spaces");
    }
  }, [space, isHost, leaveSpace, endSpace, router]);

  const onMute = useCallback(async () => {
    if (!space || !requireAuth()) return;
    if (!canSpeak && muted) {
      Alert.alert("Speaker access needed", "Raise your hand and wait for a host to bring you on stage.");
      return;
    }
    const next = !muted;
    setMuted(next);
    Haptics.selectionAsync().catch(() => {});
    try {
      await setSpaceMute(space.id, next);
    } catch (e) {
      setMuted(!next);
      Alert.alert("Mic locked", e instanceof Error ? e.message : "Raise your hand to request speaker access.");
    }
  }, [space, requireAuth, canSpeak, muted, setSpaceMute]);

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

  const spawnFloater = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const x = Math.random() * 0.6 + 0.2;
    setFloaters((prev) => [...prev.slice(-12), { id, emoji, x }]);
    setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== id)), 2200);
  }, []);

  const onReact = useCallback(
    async (emoji: string = "🔥") => {
      if (!space || !requireAuth()) return;
      setReactionCount((v) => v + 1);
      spawnFloater(emoji);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        await addSpaceReaction(space.id, emoji);
      } catch (e) {
        console.log("[space] reaction failed", e);
      }
    },
    [space, requireAuth, addSpaceReaction, spawnFloater],
  );

  const onShare = useCallback(async () => {
    if (!space) return;
    Haptics.selectionAsync().catch(() => {});
    const url = `https://soltools.app/space/${space.id}`;
    try {
      await Share.share({ message: `🎧 ${space.title} on SolTools Spaces\n${url}`, url });
    } catch (e) {
      console.log("[space] share failed", e);
    }
  }, [space]);

  const onCopyLink = useCallback(async () => {
    if (!space) return;
    const url = `https://soltools.app/space/${space.id}`;
    await Clipboard.setStringAsync(url).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert("Copied", "Space link copied to clipboard.");
  }, [space]);

  const openPinModal = useCallback(() => {
    if (!isHost) {
      Alert.alert("Host only", "Only the host can pin a note for the Space.");
      return;
    }
    setPinDraft(pinnedNote ?? "");
    setPinModalOpen(true);
  }, [isHost, pinnedNote]);

  const savePinnedNote = useCallback(() => {
    const t = pinDraft.trim();
    setPinnedNote(t.length > 0 ? t : null);
    setPinModalOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [pinDraft]);

  const openPollModal = useCallback(() => {
    if (!isHost) {
      Alert.alert("Host only", "Only the host can launch a poll.");
      return;
    }
    setPollQ("");
    setPollOpts(["", ""]);
    setPollModalOpen(true);
  }, [isHost]);

  const launchPoll = useCallback(() => {
    const q = pollQ.trim();
    const opts = pollOpts.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!q || opts.length < 2) {
      Alert.alert("Add a question", "Polls need a question and at least 2 options.");
      return;
    }
    setPoll({ q, options: opts.map((label) => ({ label, votes: 0 })), voted: null });
    setPollModalOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [pollQ, pollOpts]);

  const votePoll = useCallback(
    (idx: number) => {
      if (!poll || poll.voted !== null) return;
      if (!requireAuth()) return;
      Haptics.selectionAsync().catch(() => {});
      setPoll((p) => {
        if (!p) return p;
        return {
          ...p,
          voted: idx,
          options: p.options.map((o, i) => (i === idx ? { ...o, votes: o.votes + 1 } : o)),
        };
      });
    },
    [poll, requireAuth],
  );

  const closePoll = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setPoll(null);
  }, []);

  const manageParticipant = useCallback(
    (participant: SpaceParticipant) => {
      if (!space || !isHost || participant.userId === userId) return;
      const makeSpeaker = participant.role === "listener";
      Alert.alert(participant.name, "Manage this participant in the Space.", [
        {
          text: makeSpeaker ? "Bring on stage" : "Move to listener",
          onPress: () =>
            setSpaceParticipantRole(space.id, participant.id, makeSpeaker ? "speaker" : "listener").catch((e: unknown) =>
              Alert.alert("Could not update role", e instanceof Error ? e.message : "Try again."),
            ),
        },
        {
          text: "Make co-host",
          onPress: () =>
            setSpaceParticipantRole(space.id, participant.id, "co-host").catch((e: unknown) =>
              Alert.alert("Could not add co-host", e instanceof Error ? e.message : "Try again."),
            ),
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            removeSpaceParticipant(space.id, participant.id).catch((e: unknown) =>
              Alert.alert("Could not remove user", e instanceof Error ? e.message : "Try again."),
            ),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [isHost, removeSpaceParticipant, setSpaceParticipantRole, space, userId],
  );

  if (!space) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.notFound}>
            <Text style={styles.notFoundTitle}>Space not found</Text>
            <Pressable onPress={() => navigateBack(router, "/spaces")} style={styles.notFoundBtn}>
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
      <LinearGradient colors={[`${space.accent[0]}24`, "rgba(2,2,2,0.20)", Colors.ink]} style={StyleSheet.absoluteFill} />
      <View style={[styles.radial, { borderColor: `${space.accent[0]}24` }]} pointerEvents="none" />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => navigateBack(router, "/spaces")} style={styles.iconBtn} testID="space-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headerMid}>
            <View style={[styles.statusBadge, !space.isLive && styles.scheduledBadge]}>
              {space.isLive ? <View style={styles.liveDot} /> : <Radio color={Colors.silver} size={10} strokeWidth={2.8} />}
              <Text style={[styles.statusText, !space.isLive && styles.scheduledText]}>{space.isLive ? "LIVE SPACE" : "SCHEDULED"}</Text>
            </View>
            <Text style={styles.roomTag}>{space.topic}</Text>
          </View>
          <Pressable onPress={onCopyLink} style={styles.iconBtn} testID="space-copy">
            <Copy color={Colors.text} size={15} strokeWidth={2.4} />
          </Pressable>
          <Pressable onPress={onShare} style={styles.iconBtn} testID="space-share">
            <Share2 color={Colors.text} size={16} strokeWidth={2.4} />
          </Pressable>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={[styles.hostAvatar, { backgroundColor: space.accent[0] }]}>
                  <Text style={styles.hostInit}>{space.hostName.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hostName}>{space.hostName || "Host"}</Text>
                  <Text style={styles.hostSub}>{space.hostHandle || "@soltools"} · host</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    toggleFollowSpace(space.id).catch(() => {});
                  }}
                  style={[styles.remindBtn, following && styles.remindBtnActive]}
                >
                  <Bell color={following ? Colors.goldBright : Colors.text} size={13} strokeWidth={2.8} />
                  <Text style={[styles.remindText, following && { color: Colors.goldBright }]}>{following ? "Alerting" : "Remind"}</Text>
                </Pressable>
              </View>

              <Text style={styles.title}>{space.title}</Text>
              {space.description ? <Text style={styles.desc}>{space.description}</Text> : null}

              <View style={styles.metaRow}>
                <MetaPill Icon={UsersIcon} text={`${space.listeners} listening`} />
                <MetaPill Icon={Mic} text={`${space.speakers} speakers`} color={space.accent[0]} />
                <MetaPill Icon={Hand} text={`${space.raisedHands} hands`} color={Colors.goldBright} />
                {peakListeners > space.listeners ? <MetaPill Icon={TrendingUp} text={`peak ${peakListeners}`} color={Colors.mint} /> : null}
                {space.recording ? <MetaPill Icon={ShieldCheck} text="recording" color={Colors.rose} /> : null}
              </View>

              <View style={styles.livekitPanel}>
                <VoiceOrb connected={connected} connecting={connecting} accent={space.accent[0]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.livekitTitle}>{connected ? "LiveKit token active" : space.isLive ? "LiveKit room ready" : scheduledCopy(space.scheduledAt)}</Text>
                  <Text style={styles.livekitBody} numberOfLines={2}>
                    {connected
                      ? `${livekitRoom || space.livekitRoomName} · ${muted ? "listening muted" : "mic open"}`
                      : voiceError ?? (space.isLive ? "Join to enter audio, chat, and react live." : isHost ? "Start this scheduled room when you are ready." : "Follow for the reminder and join when the host starts.")}
                  </Text>
                </View>
                {space.isLive || isHost ? (
                  <Pressable onPress={connectLiveKit} disabled={connecting} style={[styles.joinBtn, connected && styles.connectedBtn]} testID="space-connect-livekit">
                    <Text style={[styles.joinText, connected && { color: Colors.text }]}>{connecting ? "…" : connected ? "Joined" : space.isLive ? "Join" : "Start"}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {pinnedNote ? (
              <Pressable onPress={isHost ? openPinModal : undefined} style={[styles.pinnedCard, { borderColor: `${space.accent[0]}44` }]}> 
                <View style={[styles.pinnedIcon, { backgroundColor: `${space.accent[0]}22` }]}><Pin color={space.accent[0]} size={13} strokeWidth={3} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pinnedKicker}>PINNED BY HOST</Text>
                  <Text style={styles.pinnedText}>{pinnedNote}</Text>
                </View>
                {isHost ? <Text style={styles.pinnedEdit}>edit</Text> : null}
              </Pressable>
            ) : isHost ? (
              <Pressable onPress={openPinModal} style={styles.pinnedAdd}>
                <Pin color={Colors.muted} size={13} strokeWidth={2.6} />
                <Text style={styles.pinnedAddText}>Pin a topic, contract, or call to action</Text>
              </Pressable>
            ) : null}

            {poll ? (
              <PollCard poll={poll} accent={space.accent[0]} onVote={votePoll} onClose={isHost ? closePoll : undefined} />
            ) : isHost ? (
              <Pressable onPress={openPollModal} style={styles.pollAdd}>
                <BarChart3 color={Colors.goldBright} size={14} strokeWidth={2.8} />
                <Text style={styles.pollAddText}>Launch a quick poll</Text>
                <Plus color={Colors.goldBright} size={14} strokeWidth={3} />
              </Pressable>
            ) : null}

            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionKicker}>STAGE</Text>
                <Text style={styles.sectionTitle}>Speakers · {speakers.length}</Text>
              </View>
              {isHost ? (
                <View style={styles.hostControlsBadge}>
                  <Crown color={Colors.goldBright} size={12} strokeWidth={3} />
                  <Text style={styles.hostControlsText}>Host tools</Text>
                </View>
              ) : null}
            </View>

            {speakers.length === 0 ? (
              <EmptyBox icon={<Mic color={Colors.muted} size={20} strokeWidth={2.4} />} text="No speakers on stage yet" />
            ) : (
              <View style={styles.stageGrid}>
                {speakers.map((p) => (
                  <SpeakerTile key={p.id} p={p} accent={space.accent[0]} onPress={() => manageParticipant(p)} canManage={isHost && p.userId !== userId} />
                ))}
              </View>
            )}

            {isHost && raisedHands.length > 0 ? (
              <View style={styles.raisedPanel}>
                <View style={styles.raisedHead}>
                  <Sparkles color={Colors.goldBright} size={15} strokeWidth={3} />
                  <Text style={styles.raisedTitle}>{raisedHands.length} hand{raisedHands.length === 1 ? "" : "s"} raised</Text>
                </View>
                {raisedHands.slice(0, 5).map((p) => (
                  <Pressable key={p.id} onPress={() => manageParticipant(p)} style={styles.requestRow}>
                    <View style={[styles.requestAvatar, { backgroundColor: p.avatarColor }]}>
                      <Text style={styles.requestInit}>{p.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestName}>{p.name}</Text>
                      <Text style={styles.requestSub}>{p.handle} wants speaker access</Text>
                    </View>
                    <View style={styles.promoteMini}>
                      <UserPlus color={Colors.ink} size={14} strokeWidth={3} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionKicker}>AUDIENCE</Text>
                <Text style={styles.sectionTitle}>Listeners · {listeners.length}</Text>
              </View>
            </View>
            {listeners.length === 0 ? (
              <EmptyBox icon={<UsersIcon color={Colors.muted} size={20} strokeWidth={2.4} />} text="Be the first to drop in" />
            ) : (
              <View style={styles.listenerGrid}>
                {listeners.slice(0, 30).map((l) => (
                  <Pressable key={l.id} onPress={() => manageParticipant(l)} style={[styles.listenerAvatar, { backgroundColor: l.avatarColor }]} disabled={!isHost}>
                    <Text style={styles.listenerInit}>{l.name.slice(0, 1).toUpperCase()}</Text>
                    {l.handRaised ? <View style={styles.handDot}><Hand color={Colors.ink} size={8} strokeWidth={3} /></View> : null}
                  </Pressable>
                ))}
                {listeners.length > 30 ? (
                  <View style={styles.listenerMore}><Text style={styles.listenerMoreText}>+{listeners.length - 30}</Text></View>
                ) : null}
              </View>
            )}

            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionKicker}>LIVE CHAT</Text>
                <Text style={styles.sectionTitle}>{messages.length} messages</Text>
              </View>
            </View>
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
          </ScrollView>

          <View style={styles.bottomDock}>
            <View style={styles.chatInputWrap}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={isAuthenticated ? "Message the Space..." : "Sign in to chat..."}
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
              <ControlButton active={!muted} onPress={connected ? onMute : connectLiveKit} testID="space-mute">
                {muted ? <MicOff color={Colors.text} size={18} strokeWidth={2.6} /> : <Mic color={Colors.ink} size={18} strokeWidth={2.6} />}
              </ControlButton>
              <ControlButton active={hand} onPress={onHand} warn testID="space-hand">
                <Hand color={hand ? Colors.ink : Colors.text} size={18} strokeWidth={2.6} />
              </ControlButton>
              <ControlButton onPress={() => onReact("🔥")} onLongPress={() => setReactionPickerOpen((v) => !v)} testID="space-react">
                <Heart color={Colors.rose} size={18} strokeWidth={2.6} fill={reactionCount > 0 ? Colors.rose : "transparent"} />
                {reactionCount > 0 ? <View style={styles.reactCount}><Text style={styles.reactCountText}>{reactionCount}</Text></View> : null}
              </ControlButton>
              <ControlButton onPress={() => Alert.alert("Captions", "Caption hooks are ready for the speech-to-text service.")} testID="space-cc">
                <Captions color={Colors.text} size={18} strokeWidth={2.6} />
              </ControlButton>
              <Pressable onPress={onLeave} style={[styles.controlBtn, styles.leaveBtn]} testID="space-leave">
                <PhoneOff color={Colors.ink} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <FloatingEmojis floaters={floaters} />

      {reactionPickerOpen ? (
        <View pointerEvents="box-none" style={styles.reactionPickerWrap}>
          <View style={styles.reactionPicker}>
            {["🔥", "🚀", "💎", "👏", "❤️", "🤯"].map((e) => (
              <Pressable
                key={e}
                onPress={() => {
                  setReactionPickerOpen(false);
                  onReact(e);
                }}
                style={styles.reactionEmojiBtn}
              >
                <Text style={styles.reactionEmojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Modal visible={pinModalOpen} animationType="fade" transparent onRequestClose={() => setPinModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Pin a note</Text>
              <Pressable onPress={() => setPinModalOpen(false)} style={styles.modalClose}><X color={Colors.text} size={16} strokeWidth={2.6} /></Pressable>
            </View>
            <TextInput
              value={pinDraft}
              onChangeText={setPinDraft}
              placeholder="Topic, contract address, or call to action"
              placeholderTextColor={Colors.muted2}
              style={styles.modalInput}
              multiline
              maxLength={180}
            />
            <View style={styles.modalRow}>
              {pinnedNote ? (
                <Pressable onPress={() => { setPinnedNote(null); setPinModalOpen(false); }} style={styles.modalGhost}>
                  <Text style={styles.modalGhostText}>Remove</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={savePinnedNote} style={styles.modalPrimary}>
                <Pin color={Colors.ink} size={13} strokeWidth={3} />
                <Text style={styles.modalPrimaryText}>Pin</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={pollModalOpen} animationType="fade" transparent onRequestClose={() => setPollModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Launch a poll</Text>
              <Pressable onPress={() => setPollModalOpen(false)} style={styles.modalClose}><X color={Colors.text} size={16} strokeWidth={2.6} /></Pressable>
            </View>
            <TextInput
              value={pollQ}
              onChangeText={setPollQ}
              placeholder="Your question"
              placeholderTextColor={Colors.muted2}
              style={styles.modalInput}
              maxLength={120}
            />
            {pollOpts.map((opt, i) => (
              <View key={`opt-${i}`} style={styles.pollOptRow}>
                <TextInput
                  value={opt}
                  onChangeText={(v) => setPollOpts((prev) => prev.map((p, idx) => (idx === i ? v : p)))}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={Colors.muted2}
                  style={[styles.modalInput, { flex: 1 }]}
                  maxLength={60}
                />
                {pollOpts.length > 2 ? (
                  <Pressable onPress={() => setPollOpts((prev) => prev.filter((_, idx) => idx !== i))} style={styles.modalClose}>
                    <X color={Colors.muted} size={14} strokeWidth={2.6} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {pollOpts.length < 4 ? (
              <Pressable onPress={() => setPollOpts((p) => [...p, ""])} style={styles.pollAddOpt}>
                <Plus color={Colors.goldBright} size={13} strokeWidth={3} />
                <Text style={styles.pollAddOptText}>Add option</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={launchPoll} style={[styles.modalPrimary, { alignSelf: "stretch", justifyContent: "center" }]}>
              <BarChart3 color={Colors.ink} size={14} strokeWidth={3} />
              <Text style={styles.modalPrimaryText}>Go live</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FloatingEmojis({ floaters }: { floaters: { id: string; emoji: string; x: number }[] }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {floaters.map((f) => (
        <Floater key={f.id} emoji={f.emoji} x={f.x} />
      ))}
    </View>
  );
}

function Floater({ emoji, x }: { emoji: string; x: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 2100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -360] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 14, -10] });
  const opacity = anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const scale = anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1.4] });
  return (
    <Animated.View style={[styles.floater, { left: `${x * 100}%`, opacity, transform: [{ translateY }, { translateX }, { scale }] }]}>
      <Text style={styles.floaterText}>{emoji}</Text>
    </Animated.View>
  );
}

function PollCard({ poll, accent, onVote, onClose }: { poll: { q: string; options: { label: string; votes: number }[]; voted: number | null }; accent: string; onVote: (i: number) => void; onClose?: () => void }) {
  const total = poll.options.reduce((s, o) => s + o.votes, 0) || 1;
  const showResults = poll.voted !== null;
  return (
    <View style={[styles.pollCard, { borderColor: `${accent}44` }]}> 
      <View style={styles.pollHead}>
        <View style={[styles.pollIcon, { backgroundColor: `${accent}22` }]}><BarChart3 color={accent} size={13} strokeWidth={3} /></View>
        <Text style={styles.pollKicker}>LIVE POLL</Text>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={10}><X color={Colors.muted} size={14} strokeWidth={2.6} /></Pressable>
        ) : null}
      </View>
      <Text style={styles.pollQ}>{poll.q}</Text>
      <View style={{ gap: 8, marginTop: 10 }}>
        {poll.options.map((opt, i) => {
          const pct = Math.round((opt.votes / total) * 100);
          const isMine = poll.voted === i;
          return (
            <Pressable key={`pollopt-${i}`} onPress={() => onVote(i)} disabled={showResults} style={styles.pollOpt}>
              {showResults ? <View style={[styles.pollBar, { width: `${pct}%`, backgroundColor: isMine ? accent : "rgba(255,255,255,0.12)" }]} /> : null}
              <View style={styles.pollOptInner}>
                <Text style={[styles.pollOptText, isMine && { color: Colors.text }]} numberOfLines={1}>{opt.label}</Text>
                {showResults ? (
                  <View style={styles.pollResRow}>
                    {isMine ? <Check color={accent} size={11} strokeWidth={3} /> : null}
                    <Text style={[styles.pollPct, isMine && { color: accent }]}>{pct}%</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.pollFoot}>{showResults ? `${total} vote${total === 1 ? "" : "s"} · tap closes when host ends` : "Tap to vote"}</Text>
    </View>
  );
}

function roleRank(role: SpaceParticipant["role"]): number {
  if (role === "host") return 0;
  if (role === "co-host") return 1;
  if (role === "speaker") return 2;
  return 3;
}

function MetaPill({ Icon, text, color = Colors.muted }: { Icon: React.ComponentType<{ color: string; size: number; strokeWidth: number }>; text: string; color?: string }) {
  return (
    <View style={styles.metaPill}>
      <Icon color={color} size={11} strokeWidth={2.8} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

function VoiceOrb({ connected, connecting, accent }: { connected: boolean; connecting: boolean; accent: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!connected && !connecting) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.22, duration: 760, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 760, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [connected, connecting, pulse]);
  return (
    <View style={styles.voiceOrbWrap}>
      {(connected || connecting) ? <Animated.View style={[styles.voiceHalo, { borderColor: accent, transform: [{ scale: pulse }] }]} /> : null}
      <View style={[styles.voiceOrb, connected && { backgroundColor: accent }]}>
        {connected ? <Volume2 color={Colors.ink} size={22} strokeWidth={3} /> : <Radio color={accent} size={22} strokeWidth={3} />}
      </View>
    </View>
  );
}

function EmptyBox({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <View style={styles.emptyBox}>{icon}<Text style={styles.emptyText}>{text}</Text></View>;
}

function SpeakerTile({ p, accent, onPress, canManage }: { p: SpaceParticipant; accent: string; onPress: () => void; canManage: boolean }) {
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!p.speaking) {
      ring.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ring, { toValue: 1, duration: 820, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(ring, { toValue: 0, duration: 820, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [p.speaking, ring]);
  const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.17] });
  const opacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.72, 0] });
  return (
    <Pressable onPress={onPress} disabled={!canManage} style={styles.speakerTile}>
      <View style={styles.speakerAvatarWrap}>
        {p.speaking ? <Animated.View style={[styles.speakerRing, { borderColor: accent, transform: [{ scale }], opacity }]} /> : null}
        <View style={[styles.speakerAvatar, { backgroundColor: p.avatarColor, borderColor: p.speaking ? accent : "rgba(255,255,255,0.10)" }]}>
          <Text style={styles.speakerInit}>{p.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        {p.role === "host" || p.role === "co-host" ? (
          <View style={[styles.roleIcon, { backgroundColor: accent }]}><Crown color={Colors.ink} size={9} strokeWidth={3} /></View>
        ) : p.muted ? (
          <View style={styles.roleIcon}><MicOff color={Colors.text} size={9} strokeWidth={2.8} /></View>
        ) : null}
      </View>
      <Text style={styles.speakerName} numberOfLines={1}>{p.name}</Text>
      <Text style={styles.speakerRole} numberOfLines={1}>{p.role}</Text>
      {canManage ? <Text style={styles.manageHint}>tap manage</Text> : null}
    </Pressable>
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

function ControlButton({ children, active, warn, onPress, onLongPress, testID }: { children: React.ReactNode; active?: boolean; warn?: boolean; onPress: () => void; onLongPress?: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={220} style={[styles.controlBtn, active && { backgroundColor: warn ? Colors.goldBright : Colors.mint, borderColor: warn ? Colors.goldBright : Colors.mint }]} testID={testID}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  radial: { position: "absolute", right: -120, top: 80, width: 260, height: 260, borderRadius: 130, borderWidth: 1 },
  header: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 38, height: 38, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerMid: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(244,198,91,0.16)", borderWidth: 1, borderColor: "rgba(244,198,91,0.34)" },
  scheduledBadge: { backgroundColor: "rgba(221,227,236,0.12)", borderColor: "rgba(221,227,236,0.24)" },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.goldBright },
  statusText: { color: Colors.goldBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  scheduledText: { color: Colors.silver },
  roomTag: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  scroll: { paddingHorizontal: 18, paddingBottom: 194 },
  heroCard: { padding: 16, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  heroTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hostAvatar: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  hostInit: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  hostName: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  hostSub: { color: Colors.muted, fontSize: 11, fontWeight: "750", marginTop: 2 },
  remindBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  remindBtnActive: { backgroundColor: "rgba(244,198,91,0.14)", borderColor: Colors.goldBright },
  remindText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  title: { color: Colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.9, marginTop: 18 },
  desc: { color: Colors.muted, fontSize: 13, fontWeight: "650", lineHeight: 19, marginTop: 8 },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 14 },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.055)" },
  metaText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  livekitPanel: { marginTop: 16, padding: 13, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.30)", borderWidth: 1, borderColor: "rgba(244,198,91,0.18)", flexDirection: "row", alignItems: "center", gap: 12 },
  voiceOrbWrap: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  voiceHalo: { position: "absolute", width: 52, height: 52, borderRadius: 26, borderWidth: 1.5 },
  voiceOrb: { width: 44, height: 44, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  livekitTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  livekitBody: { color: Colors.muted, fontSize: 11, lineHeight: 15, fontWeight: "650", marginTop: 3 },
  joinBtn: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 15, backgroundColor: Colors.goldBright },
  connectedBtn: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  joinText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 22, marginBottom: 12 },
  sectionKicker: { color: Colors.muted2, fontSize: 9, fontWeight: "900", letterSpacing: 1.35 },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.25, marginTop: 2 },
  hostControlsBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(244,198,91,0.11)", borderWidth: 1, borderColor: "rgba(244,198,91,0.25)" },
  hostControlsText: { color: Colors.goldBright, fontSize: 10, fontWeight: "900" },
  emptyBox: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 24, borderRadius: 18, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  stageGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  speakerTile: { width: "33.33%", alignItems: "center", marginBottom: 18, paddingHorizontal: 4 },
  speakerAvatarWrap: { width: 70, height: 70, alignItems: "center", justifyContent: "center" },
  speakerRing: { position: "absolute", width: 70, height: 70, borderRadius: 35, borderWidth: 2 },
  speakerAvatar: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  speakerInit: { color: Colors.ink, fontSize: 22, fontWeight: "900" },
  roleIcon: { position: "absolute", bottom: 2, right: 9, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: Colors.ink },
  speakerName: { color: Colors.text, fontSize: 12, fontWeight: "900", marginTop: 8, maxWidth: 96 },
  speakerRole: { color: Colors.muted, fontSize: 10, fontWeight: "750", marginTop: 2 },
  manageHint: { color: Colors.goldBright, fontSize: 8, fontWeight: "900", marginTop: 3, letterSpacing: 0.6 },
  raisedPanel: { padding: 13, borderRadius: 22, backgroundColor: "rgba(244,198,91,0.09)", borderWidth: 1, borderColor: "rgba(244,198,91,0.22)", gap: 10 },
  raisedHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  raisedTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.24)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  requestAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  requestInit: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  requestName: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  requestSub: { color: Colors.muted, fontSize: 10, fontWeight: "750", marginTop: 2 },
  promoteMini: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.goldBright, alignItems: "center", justifyContent: "center" },
  listenerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  listenerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  listenerInit: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  handDot: { position: "absolute", right: -2, bottom: -2, width: 17, height: 17, borderRadius: 9, backgroundColor: Colors.goldBright, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: Colors.ink },
  listenerMore: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  listenerMoreText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  chatBox: { borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  chatScroll: { maxHeight: 290 },
  chatContent: { padding: 12, gap: 10 },
  chatEmpty: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  chatEmptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  chatRow: { flexDirection: "row", gap: 9 },
  chatAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  chatInit: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  chatBubble: { flex: 1, padding: 10, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.055)" },
  chatHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  chatName: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  chatTime: { color: Colors.muted2, fontSize: 10, fontWeight: "800" },
  chatText: { color: Colors.text, fontSize: 12, lineHeight: 17, fontWeight: "650", marginTop: 3 },
  bottomDock: { position: "absolute", left: 12, right: 12, bottom: 18, padding: 10, borderRadius: 27, backgroundColor: "rgba(8,7,5,0.96)", borderWidth: 1, borderColor: "rgba(244,198,91,0.20)" },
  chatInputWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 9 },
  chatInput: { flex: 1, height: 42, borderRadius: 16, paddingHorizontal: 12, color: Colors.text, fontSize: 13, fontWeight: "750", backgroundColor: "rgba(255,255,255,0.06)" },
  sendBtn: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: Colors.goldBright },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 },
  controlBtn: { flex: 1, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  leaveBtn: { backgroundColor: Colors.rose, borderColor: Colors.rose },
  reactCount: { position: "absolute", top: -2, right: 6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: Colors.rose, alignItems: "center", justifyContent: "center" },
  reactCountText: { color: Colors.ink, fontSize: 9, fontWeight: "900" },
  notFound: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  notFoundTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  notFoundBtn: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: Colors.goldBright, borderRadius: 12 },
  notFoundBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  pinnedCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, marginTop: 16 },
  pinnedIcon: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pinnedKicker: { color: Colors.muted2, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  pinnedText: { color: Colors.text, fontSize: 13, fontWeight: "800", lineHeight: 17, marginTop: 2 },
  pinnedEdit: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  pinnedAdd: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.10)", marginTop: 16 },
  pinnedAddText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  pollAdd: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(244,198,91,0.30)", marginTop: 10, backgroundColor: "rgba(244,198,91,0.05)" },
  pollAddText: { flex: 1, color: Colors.goldBright, fontSize: 12, fontWeight: "900" },
  pollCard: { padding: 14, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, marginTop: 12 },
  pollHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  pollIcon: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pollKicker: { flex: 1, color: Colors.muted2, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  pollQ: { color: Colors.text, fontSize: 15, fontWeight: "900", marginTop: 8, letterSpacing: -0.2 },
  pollOpt: { borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  pollBar: { position: "absolute", left: 0, top: 0, bottom: 0, opacity: 0.35 },
  pollOptInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 11, gap: 8 },
  pollOptText: { flex: 1, color: Colors.text, fontSize: 12, fontWeight: "800" },
  pollResRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  pollPct: { color: Colors.muted, fontSize: 11, fontWeight: "900" },
  pollFoot: { color: Colors.muted2, fontSize: 10, fontWeight: "800", marginTop: 9, letterSpacing: 0.5 },
  floater: { position: "absolute", bottom: 130 },
  floaterText: { fontSize: 30 },
  reactionPickerWrap: { position: "absolute", left: 0, right: 0, bottom: 130, alignItems: "center" },
  reactionPicker: { flexDirection: "row", gap: 4, padding: 8, borderRadius: 24, backgroundColor: "rgba(8,7,5,0.97)", borderWidth: 1, borderColor: "rgba(244,198,91,0.30)" },
  reactionEmojiBtn: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  reactionEmojiText: { fontSize: 22 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 20 },
  modalCard: { borderRadius: 24, padding: 18, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", gap: 12 },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  modalClose: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  modalInput: { color: Colors.text, fontSize: 13, fontWeight: "700", paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", minHeight: 44 },
  modalRow: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  modalPrimary: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: Colors.goldBright },
  modalPrimaryText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  modalGhost: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" },
  modalGhostText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  pollOptRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pollAddOpt: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(244,198,91,0.08)", borderWidth: 1, borderColor: "rgba(244,198,91,0.25)" },
  pollAddOptText: { color: Colors.goldBright, fontSize: 11, fontWeight: "900" },
});
