import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Headphones, Mic, Radio, Users as UsersIcon, Volume2 } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";

interface VoiceRoom {
  id: string;
  title: string;
  subtitle: string;
  hostName: string;
  speakers: number;
  listeners: number;
  isLive: boolean;
  accent: [string, string];
  topic: string;
}

const SAMPLE_ROOMS: VoiceRoom[] = [
  {
    id: "alpha-call",
    title: "Live Alpha · Solana memes",
    subtitle: "calls every 10 min",
    hostName: "@cryptoking",
    speakers: 6,
    listeners: 142,
    isLive: true,
    accent: [Colors.rose, Colors.orange],
    topic: "MEMES",
  },
  {
    id: "whale-watch",
    title: "Whale Watch Hour",
    subtitle: "tracking $50k+ moves",
    hostName: "@whaletracker",
    speakers: 3,
    listeners: 87,
    isLive: true,
    accent: [Colors.cyan, Colors.violet],
    topic: "WHALES",
  },
  {
    id: "ai-sniper",
    title: "AI Sniper Lounge",
    subtitle: "auto-buy strategy",
    hostName: "@snipergpt",
    speakers: 4,
    listeners: 64,
    isLive: true,
    accent: [Colors.mint, Colors.cyan],
    topic: "AI",
  },
  {
    id: "chill",
    title: "Chill Chart Vibes",
    subtitle: "TA & lo-fi beats",
    hostName: "@chartmaster",
    speakers: 2,
    listeners: 41,
    isLive: false,
    accent: [Colors.violet, Colors.rose],
    topic: "TA",
  },
];

export default function VoiceRoomsRail() {
  const router = useRouter();
  const rooms = useMemo<VoiceRoom[]>(() => SAMPLE_ROOMS, []);

  return (
    <View style={styles.wrap} testID="voice-rooms-rail">
      <View style={styles.header}>
        <View style={styles.headLeft}>
          <View style={styles.iconBox}>
            <Headphones color={Colors.violet} size={14} strokeWidth={2.6} />
          </View>
          <Text style={styles.title}>Voice rooms</Text>
          <View style={styles.live}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{rooms.filter((r) => r.isLive).length} LIVE</Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            router.push("/spaces");
          }}
          hitSlop={8}
        >
          <Text style={styles.see}>See all</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {rooms.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push({ pathname: "/space/[id]", params: { id: r.id === "alpha-call" ? "live-alpha" : r.id === "chill" ? "chart-vibes" : r.id } });
            }}
            style={[styles.card, { shadowColor: r.accent[0] }]}
            testID={`voice-room-${r.id}`}
          >
            <LinearGradient
              colors={[`${r.accent[0]}38`, `${r.accent[1]}10`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardInner}
            >
              <View style={styles.cardTop}>
                <View style={[styles.topicPill, { backgroundColor: `${r.accent[0]}26`, borderColor: `${r.accent[0]}66` }]}>
                  <Text style={[styles.topicText, { color: r.accent[0] }]}>{r.topic}</Text>
                </View>
                {r.isLive ? (
                  <View style={styles.livePulse}>
                    <Radio color={Colors.rose} size={10} strokeWidth={3} />
                    <Text style={styles.livePulseText}>LIVE</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.cardTitle} numberOfLines={2}>
                {r.title}
              </Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {r.subtitle} · {r.hostName}
              </Text>

              <View style={styles.cardFoot}>
                <View style={styles.statChip}>
                  <Mic color={r.accent[0]} size={10} strokeWidth={3} />
                  <Text style={styles.statText}>{r.speakers}</Text>
                </View>
                <View style={styles.statChip}>
                  <UsersIcon color={Colors.muted} size={10} strokeWidth={3} />
                  <Text style={styles.statText}>{r.listeners}</Text>
                </View>
                <View style={[styles.joinBtn, { backgroundColor: r.accent[0] }]}>
                  <Volume2 color={Colors.ink} size={10} strokeWidth={3} />
                  <Text style={styles.joinText}>JOIN</Text>
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 },
  header: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "rgba(184,140,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  live: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,93,143,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.rose,
  },
  liveText: {
    color: Colors.rose,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  see: { color: Colors.violet, fontSize: 12, fontWeight: "800" },
  row: {
    paddingHorizontal: 14,
    gap: 12,
  },
  card: {
    width: 230,
    borderRadius: 22,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,12,16,0.85)",
  },
  cardInner: {
    padding: 14,
    minHeight: 132,
    justifyContent: "space-between",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topicPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  topicText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  livePulse: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,93,143,0.18)",
  },
  livePulseText: {
    color: Colors.rose,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
    marginTop: 10,
  },
  cardSub: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginLeft: "auto",
  },
  joinText: {
    color: Colors.ink,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});
