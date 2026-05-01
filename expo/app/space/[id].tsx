import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  Captions,
  Hand,
  Heart,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  Share2,
  Users as UsersIcon,
  Volume2,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { useSocial } from "@/providers/social-provider";

interface Participant {
  id: string;
  handle: string;
  name: string;
  color: string;
  speaking: boolean;
  muted: boolean;
  role: "host" | "co-host" | "speaker" | "listener";
}

const ROLE_COLORS = [Colors.mint, Colors.violet, Colors.cyan, Colors.rose, Colors.orange];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return ROLE_COLORS[Math.abs(h) % ROLE_COLORS.length];
}

export default function SpaceDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getSpace, isFollowingSpace, toggleFollowSpace } = useSocial();
  const space = id ? getSpace(id) : undefined;

  const [muted, setMuted] = useState<boolean>(true);
  const [hand, setHand] = useState<boolean>(false);
  const [reactions, setReactions] = useState<number>(0);

  const participantsQ = useQuery<Participant[]>({
    queryKey: ["space", "participants", id ?? ""],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return [];
      try {
        const { data, error } = await supabase
          .from("livekit_participants")
          .select("id,user_id,identity,role,joined_at,left_at")
          .eq("room_id", id)
          .is("left_at", null)
          .order("joined_at", { ascending: true })
          .limit(200);
        if (error) throw error;
        const rows = data ?? [];
        const userIds = Array.from(
          new Set(rows.map((r) => r.user_id as string | null).filter((v): v is string => !!v)),
        );
        let userMap = new Map<string, { handle: string; name: string }>();
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,username,display_name")
            .in("id", userIds);
          userMap = new Map(
            (profs ?? []).map((p) => [
              p.id as string,
              {
                handle: p.username ? `@${p.username as string}` : "",
                name:
                  ((p.display_name as string | null) ?? (p.username as string | null) ?? "User") ||
                  "User",
              },
            ]),
          );
        }
        return rows.map((r): Participant => {
          const u = r.user_id ? userMap.get(r.user_id as string) : undefined;
          const role = ((r.role as string) ?? "listener").toLowerCase();
          const normalized: Participant["role"] =
            role === "host" || role === "co-host" || role === "speaker" ? role : "listener";
          return {
            id: r.id as string,
            handle: u?.handle ?? `@${(r.identity as string) || "anon"}`,
            name: u?.name ?? ((r.identity as string) || "Listener"),
            color: colorFor((r.identity as string) || (r.id as string)),
            speaking: false,
            muted: normalized === "listener",
            role: normalized,
          };
        });
      } catch (e) {
        console.log("[space] participants fetch failed", e);
        return [];
      }
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const participants = participantsQ.data ?? [];
  const speakers = participants.filter((p) => p.role !== "listener");
  const listeners = participants.filter((p) => p.role === "listener");

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

  const following = isFollowingSpace(space.id);

  const onLeave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.back();
  };

  const visibleListeners = listeners.slice(0, 12);
  const remainingListeners = Math.max(0, listeners.length - visibleListeners.length);

  return (
    <View style={styles.root} testID="space-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <LinearGradient
        colors={[`${space.accent[0]}24`, `${space.accent[1]}06`, Colors.ink]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="space-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headMid}>
            {space.isLive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : (
              <View style={[styles.liveBadge, { backgroundColor: "rgba(56,215,255,0.14)" }]}>
                <Text style={[styles.liveText, { color: Colors.cyan }]}>SCHEDULED</Text>
              </View>
            )}
            <Text style={styles.topic}>{space.topic}</Text>
          </View>
          <Pressable
            onPress={() => Haptics.selectionAsync().catch(() => {})}
            style={styles.iconBtn}
          >
            <Share2 color={Colors.text} size={16} strokeWidth={2.4} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{space.title}</Text>
          {space.description ? <Text style={styles.desc}>{space.description}</Text> : null}

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <UsersIcon color={Colors.muted} size={11} strokeWidth={2.8} />
              <Text style={styles.metaText}>{listeners.length} listening</Text>
            </View>
            <View style={styles.metaPill}>
              <Mic color={space.accent[0]} size={11} strokeWidth={2.8} />
              <Text style={styles.metaText}>{speakers.length} speakers</Text>
            </View>
            {space.recording ? (
              <View style={[styles.metaPill, { backgroundColor: "rgba(255,93,143,0.16)" }]}>
                <View style={styles.recDot} />
                <Text style={[styles.metaText, { color: Colors.rose }]}>RECORDING</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SPEAKERS · {speakers.length}</Text>
            {speakers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Mic color={Colors.muted} size={20} strokeWidth={2.4} />
                <Text style={styles.emptyText}>No speakers on stage yet</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {speakers.map((p) => (
                  <SpeakerTile key={p.id} p={p} accent={space.accent[0]} />
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>LISTENERS · {listeners.length}</Text>
            </View>
            {listeners.length === 0 ? (
              <View style={styles.emptyBox}>
                <UsersIcon color={Colors.muted} size={20} strokeWidth={2.4} />
                <Text style={styles.emptyText}>Be the first to drop in</Text>
              </View>
            ) : (
              <View style={styles.listenerGrid}>
                {visibleListeners.map((l) => (
                  <View
                    key={l.id}
                    style={[styles.listenerAvatar, { backgroundColor: l.color }]}
                  >
                    <Text style={styles.listenerInit}>
                      {l.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                ))}
                {remainingListeners > 0 ? (
                  <View style={styles.listenerMore}>
                    <Text style={styles.listenerMoreText}>+{remainingListeners}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LIVE CHAT</Text>
            <View style={styles.chatBox}>
              <View style={styles.chatEmpty}>
                <MessageCircle color={Colors.muted} size={18} strokeWidth={2.4} />
                <Text style={styles.chatEmptyText}>
                  Live chat in this room hasn&apos;t started yet.
                </Text>
              </View>
            </View>
          </View>

          {!space.isLive ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                toggleFollowSpace(space.id);
              }}
              style={[
                styles.remindCta,
                following && {
                  backgroundColor: "rgba(85,245,178,0.16)",
                  borderColor: Colors.mint,
                },
              ]}
              testID="space-remind"
            >
              <Bell
                color={following ? Colors.mint : Colors.text}
                size={16}
                strokeWidth={2.6}
              />
              <Text style={[styles.remindText, following && { color: Colors.mint }]}>
                {following ? "Reminder set" : "Remind me when live"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {space.isLive ? (
          <View style={styles.bottomBar}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setMuted((m) => !m);
              }}
              style={[
                styles.barBtn,
                !muted && { backgroundColor: Colors.mint, borderColor: Colors.mint },
              ]}
              testID="space-mute"
            >
              {muted ? (
                <MicOff color={Colors.text} size={18} strokeWidth={2.6} />
              ) : (
                <Mic color={Colors.ink} size={18} strokeWidth={2.6} />
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setHand((h) => !h);
              }}
              style={[
                styles.barBtn,
                hand && {
                  backgroundColor: "rgba(255,184,76,0.18)",
                  borderColor: Colors.orange,
                },
              ]}
              testID="space-hand"
            >
              <Hand color={hand ? Colors.orange : Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
            <ReactionBtn count={reactions} onPress={() => setReactions((r) => r + 1)} />
            <Pressable style={styles.barBtn} testID="space-cc">
              <Captions color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
            <Pressable
              onPress={onLeave}
              style={[styles.barBtn, styles.leaveBtn]}
              testID="space-leave"
            >
              <PhoneOff color={Colors.ink} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

function SpeakerTile({ p, accent }: { p: Participant; accent: string }) {
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!p.speaking) {
      ring.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ring, {
          toValue: 0,
          duration: 800,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [p.speaking, ring]);

  const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const opacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  return (
    <View style={styles.speakerTile}>
      <View style={styles.speakerAvatarWrap}>
        {p.speaking ? (
          <Animated.View
            style={[
              styles.speakerRing,
              { borderColor: accent, transform: [{ scale }], opacity },
            ]}
          />
        ) : null}
        <View
          style={[
            styles.speakerAvatar,
            { backgroundColor: p.color, borderColor: p.speaking ? accent : "transparent" },
          ]}
        >
          <Text style={styles.speakerInit}>{p.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        {p.muted ? (
          <View style={styles.muteBadge}>
            <MicOff color={Colors.text} size={9} strokeWidth={2.8} />
          </View>
        ) : p.speaking ? (
          <View style={[styles.speakingBadge, { backgroundColor: accent }]}>
            <Volume2 color={Colors.ink} size={9} strokeWidth={2.8} />
          </View>
        ) : null}
      </View>
      <Text style={styles.speakerName} numberOfLines={1}>
        {p.name}
      </Text>
      <Text style={styles.speakerRole} numberOfLines={1}>
        {p.role === "host" ? "host" : p.role === "co-host" ? "co-host" : "speaker"}
      </Text>
    </View>
  );
}

function ReactionBtn({ count, onPress }: { count: number; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.25, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Pressable onPress={press} style={styles.barBtn} testID="space-react">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart
          color={Colors.rose}
          size={18}
          strokeWidth={2.6}
          fill={count > 0 ? Colors.rose : "transparent"}
        />
      </Animated.View>
      {count > 0 ? (
        <View style={styles.reactCount}>
          <Text style={styles.reactCountText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headMid: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,93,143,0.16)",
  },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.rose },
  liveText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  topic: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  scroll: { paddingHorizontal: 18, paddingBottom: 140 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.6, marginTop: 10 },
  desc: { color: Colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 19, marginTop: 8 },

  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 14 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  metaText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  recDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.rose },

  section: { marginTop: 22 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 12,
  },

  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 22,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  speakerTile: { width: "33.33%", alignItems: "center", marginBottom: 18 },
  speakerAvatarWrap: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  speakerRing: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
  },
  speakerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  speakerInit: { color: Colors.ink, fontSize: 22, fontWeight: "900" },
  muteBadge: {
    position: "absolute",
    bottom: 0,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.ink,
  },
  speakingBadge: {
    position: "absolute",
    bottom: 0,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.ink,
  },
  speakerName: { color: Colors.text, fontSize: 12, fontWeight: "900", marginTop: 8 },
  speakerRole: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },

  listenerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  listenerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  listenerInit: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  listenerMore: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  listenerMoreText: { color: Colors.text, fontSize: 11, fontWeight: "900" },

  chatBox: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chatEmpty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  chatEmptyText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  remindCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  remindText: { color: Colors.text, fontSize: 13, fontWeight: "900" },

  bottomBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    padding: 10,
    borderRadius: 26,
    backgroundColor: "rgba(11, 8, 24, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  barBtn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  leaveBtn: { backgroundColor: Colors.rose, borderColor: Colors.rose },
  reactCount: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Colors.rose,
    alignItems: "center",
    justifyContent: "center",
  },
  reactCountText: { color: Colors.text, fontSize: 9, fontWeight: "900" },

  notFound: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  notFoundTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  notFoundBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: Colors.mint,
    borderRadius: 12,
  },
  notFoundBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
