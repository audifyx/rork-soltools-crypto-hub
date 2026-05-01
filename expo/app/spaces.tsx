import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Bell,
  Calendar,
  Headphones,
  Mic,
  Plus,
  Radio,
  Sparkles,
  Users as UsersIcon,
  Volume2,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  ListRenderItem,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Space, useSocial } from "@/providers/social-provider";

type Tab = "live" | "upcoming" | "following";

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatScheduled(t?: number): string {
  if (!t) return "Scheduled";
  const diff = t - Date.now();
  if (diff < 0) return "Now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d`;
}

function formatLive(startedAt?: number): string {
  if (!startedAt) return "LIVE";
  const m = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  if (m < 60) return `${m}m live`;
  const h = Math.floor(m / 60);
  return `${h}h live`;
}

export default function SpacesScreen() {
  const router = useRouter();
  const { liveSpaces, upcomingSpaces, spaces, isFollowingSpace, toggleFollowSpace } = useSocial();
  const [tab, setTab] = useState<Tab>("live");

  const followed = useMemo(
    () => spaces.filter((s) => isFollowingSpace(s.id)),
    [spaces, isFollowingSpace],
  );

  const data = useMemo<Space[]>(() => {
    if (tab === "live") return liveSpaces;
    if (tab === "upcoming") return upcomingSpaces;
    return followed;
  }, [tab, liveSpaces, upcomingSpaces, followed]);

  const renderItem: ListRenderItem<Space> = ({ item }) => (
    <SpaceCard
      space={item}
      following={isFollowingSpace(item.id)}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push({ pathname: "/space/[id]", params: { id: item.id } });
      }}
      onFollow={() => {
        Haptics.selectionAsync().catch(() => {});
        toggleFollowSpace(item.id);
      }}
    />
  );

  return (
    <View style={styles.root} testID="spaces-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="spaces-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headTitleWrap}>
            <View style={styles.eyebrowRow}>
              <Headphones color={Colors.violet} size={12} strokeWidth={2.8} />
              <Text style={styles.eyebrow}>LIVE AUDIO</Text>
            </View>
            <Text style={styles.title}>Spaces</Text>
          </View>
          <Pressable
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})}
            style={styles.startBtn}
            testID="start-space"
          >
            <Mic color={Colors.ink} size={13} strokeWidth={3} />
            <Text style={styles.startText}>START</Text>
          </Pressable>
        </View>

        <View style={styles.heroWrap}>
          <LinearGradient
            colors={["rgba(184,140,255,0.32)", "rgba(56,215,255,0.12)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroLeft}>
              <View style={styles.heroPill}>
                <View style={styles.pulseDot} />
                <Text style={styles.heroPillText}>{liveSpaces.length} ROOMS LIVE</Text>
              </View>
              <Text style={styles.heroTitle}>Audio is the new alpha</Text>
              <Text style={styles.heroSub}>
                Drop into rooms with traders, founders, and whales. Raise hand to speak.
              </Text>
            </View>
            <Pulser />
          </LinearGradient>
        </View>

        <View style={styles.tabsWrap}>
          {(["live", "upcoming", "following"] as Tab[]).map((t) => {
            const active = tab === t;
            const count = t === "live" ? liveSpaces.length : t === "upcoming" ? upcomingSpaces.length : followed.length;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setTab(t);
                }}
                style={[styles.tab, active && styles.tabActive]}
                testID={`spaces-tab-${t}`}
              >
                {t === "live" && active ? <View style={styles.tabLiveDot} /> : null}
                <Text style={[styles.tabText, active && { color: Colors.text }]}>
                  {t === "live" ? "Live" : t === "upcoming" ? "Upcoming" : "Following"}
                </Text>
                <View style={styles.tabCount}>
                  <Text style={styles.tabCountText}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <FlatList
          data={data}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                {tab === "live" ? (
                  <Radio color={Colors.rose} size={26} strokeWidth={2.4} />
                ) : tab === "upcoming" ? (
                  <Calendar color={Colors.cyan} size={26} strokeWidth={2.4} />
                ) : (
                  <Bell color={Colors.violet} size={26} strokeWidth={2.4} />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {tab === "live"
                  ? "Quiet on the airwaves"
                  : tab === "upcoming"
                  ? "Nothing scheduled yet"
                  : "Follow rooms to get pinged"}
              </Text>
              <Text style={styles.emptyBody}>
                {tab === "live"
                  ? "Be the first to start a room and pull listeners in."
                  : tab === "upcoming"
                  ? "Schedule a room from the start button to set a time."
                  : "Tap follow on any room to be notified when it goes live."}
              </Text>
            </View>
          }
          ListFooterComponent={
            tab === "live" && data.length > 0 ? (
              <View style={styles.footerWrap}>
                <Text style={styles.footerLabel}>HOSTED BY YOUR COMMUNITIES</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tagsRow}
                >
                  {["Memes", "AI", "Whales", "Launches", "DeFi", "TA"].map((t) => (
                    <View key={t} style={styles.fTag}>
                      <Text style={styles.fTagText}>#{t.toLowerCase()}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </View>
  );
}

function Pulser() {
  const [scale] = useState(() => new Animated.Value(1));
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.18,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <View style={styles.pulserWrap} pointerEvents="none">
      <Animated.View style={[styles.pulserOuter, { transform: [{ scale }] }]} />
      <View style={styles.pulserInner}>
        <Volume2 color={Colors.ink} size={20} strokeWidth={2.8} />
      </View>
    </View>
  );
}

function SpaceCard({
  space,
  following,
  onPress,
  onFollow,
}: {
  space: Space;
  following: boolean;
  onPress: () => void;
  onFollow: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`space-${space.id}`}>
      <LinearGradient
        colors={[`${space.accent[0]}3A`, `${space.accent[1]}10`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardInner}
      >
        <View style={styles.cardTop}>
          <View
            style={[
              styles.topicPill,
              { backgroundColor: `${space.accent[0]}26`, borderColor: `${space.accent[0]}66` },
            ]}
          >
            <Text style={[styles.topicText, { color: space.accent[0] }]}>{space.topic}</Text>
          </View>
          {space.isLive ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{formatLive(space.startedAt)}</Text>
            </View>
          ) : (
            <View style={styles.scheduledBadge}>
              <Calendar color={Colors.cyan} size={10} strokeWidth={3} />
              <Text style={styles.scheduledText}>{formatScheduled(space.scheduledAt)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {space.title}
        </Text>
        <Text style={styles.cardDesc} numberOfLines={2}>
          {space.description}
        </Text>

        <View style={styles.hostRow}>
          <View style={[styles.hostAvatar, { backgroundColor: space.accent[0] }]}>
            <Text style={styles.hostInit}>
              {space.hostName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hostName} numberOfLines={1}>
              {space.hostName} <Text style={styles.hostMeta}>· host</Text>
            </Text>
            {space.coHosts.length > 0 ? (
              <Text style={styles.hostCo} numberOfLines={1}>
                with {space.coHosts.join(", ")}
              </Text>
            ) : null}
          </View>
          {space.recording ? (
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>REC</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardFoot}>
          <View style={styles.footStat}>
            <Mic color={space.accent[0]} size={11} strokeWidth={3} />
            <Text style={styles.footStatText}>{space.speakers}</Text>
          </View>
          <View style={styles.footStat}>
            <UsersIcon color={Colors.muted} size={11} strokeWidth={3} />
            <Text style={styles.footStatText}>{fmtCount(space.listeners)}</Text>
          </View>
          {space.raisedHands > 0 ? (
            <View style={styles.footStat}>
              <Sparkles color={Colors.orange} size={11} strokeWidth={3} />
              <Text style={styles.footStatText}>{space.raisedHands} hands</Text>
            </View>
          ) : null}

          {space.isLive ? (
            <View style={[styles.joinBtn, { backgroundColor: space.accent[0] }]}>
              <Volume2 color={Colors.ink} size={11} strokeWidth={3} />
              <Text style={styles.joinText}>JOIN</Text>
            </View>
          ) : (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onFollow();
              }}
              style={[
                styles.followBtn,
                following && { backgroundColor: "rgba(85,245,178,0.16)", borderColor: Colors.mint },
              ]}
              hitSlop={6}
              testID={`follow-${space.id}`}
            >
              <Bell
                color={following ? Colors.mint : Colors.text}
                size={11}
                strokeWidth={2.8}
              />
              <Text
                style={[
                  styles.followText,
                  following && { color: Colors.mint },
                ]}
              >
                {following ? "ALERTING" : "REMIND ME"}
              </Text>
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
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
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.violet, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8, marginTop: 2 },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.rose,
  },
  startText: { color: Colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  heroWrap: { paddingHorizontal: 18, marginTop: 14 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(184,140,255,0.32)",
    overflow: "hidden",
  },
  heroLeft: { flex: 1 },
  heroPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
  },
  pulseDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.rose },
  heroPillText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 10,
  },
  heroSub: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 4 },

  pulserWrap: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  pulserOuter: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(184,140,255,0.25)",
  },
  pulserInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },

  tabsWrap: {
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
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
  tabLiveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.rose },
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

  listContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 140 },
  gap: { height: 12 },

  card: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: Colors.card,
  },
  cardInner: { padding: 16 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topicPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  topicText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,93,143,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
  },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.rose },
  liveText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  scheduledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.4)",
  },
  scheduledText: { color: Colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },

  cardTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 12,
  },
  cardDesc: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 4 },

  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  hostAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  hostInit: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  hostName: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  hostMeta: { color: Colors.muted, fontWeight: "700" },
  hostCo: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  recBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,93,143,0.14)",
  },
  recDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.rose },
  recText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },

  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  footStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  footStatText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  joinBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  joinText: { color: Colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  followBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  followText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },

  empty: { paddingHorizontal: 32, paddingVertical: 60, alignItems: "center" },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "rgba(184,140,255,0.14)",
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

  footerWrap: { marginTop: 22 },
  footerLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginBottom: 8 },
  tagsRow: { gap: 6 },
  fTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  fTagText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
});
