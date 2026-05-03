import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Bell,
  Calendar,
  ChevronRight,
  Clock,
  Flame,
  Headphones,
  Mic,
  Plus,
  Radio,
  Search,
  Sparkles,
  Users as UsersIcon,
  Volume2,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
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

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { CreateSpaceInput, Space, useSocial } from "@/providers/social-provider";
import { useAuth } from "@/providers/auth-provider";

type Tab = "live" | "upcoming" | "following";

const SPACE_CATEGORIES: { key: Space["category"]; label: string }[] = [
  { key: "alpha", label: "Alpha" },
  { key: "whales", label: "Whales" },
  { key: "ai", label: "AI" },
  { key: "ta", label: "TA" },
  { key: "memes", label: "Memes" },
  { key: "launches", label: "Launches" },
];

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatScheduled(t?: number): string {
  if (!t) return "Scheduled";
  const diff = t - Date.now();
  if (diff < 0) return "Now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${Math.max(1, m)}m`;
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
  const { isAuthenticated } = useAuth();
  const {
    liveSpaces,
    upcomingSpaces,
    spaces,
    isFollowingSpace,
    toggleFollowSpace,
    createSpace,
  } = useSocial();
  const [tab, setTab] = useState<Tab>("live");
  const [composerOpen, setComposerOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  const followed = useMemo(
    () => spaces.filter((s) => isFollowingSpace(s.id)),
    [spaces, isFollowingSpace],
  );

  const rawData = useMemo<Space[]>(() => {
    if (tab === "live") return liveSpaces;
    if (tab === "upcoming") return upcomingSpaces;
    return followed;
  }, [tab, liveSpaces, upcomingSpaces, followed]);

  const data = useMemo<Space[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rawData;
    return rawData.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.topic.toLowerCase().includes(q) ||
        s.hostName.toLowerCase().includes(q),
    );
  }, [rawData, query]);

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Create or join Spaces after signing in.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign in", onPress: () => router.push("/auth") },
      ]);
      return;
    }
    setComposerOpen(true);
  };

  const onCreate = async (input: CreateSpaceInput) => {
    try {
      const id = await createSpace(input);
      setComposerOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.push({ pathname: "/space/[id]", params: { id } });
    } catch (e) {
      Alert.alert("Space failed", e instanceof Error ? e.message : "Try again.");
    }
  };

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
        toggleFollowSpace(item.id).catch(() => {});
      }}
    />
  );

  return (
    <View style={styles.root} testID="spaces-screen">
      <AppBackground variant="social" />
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="spaces-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headTitleWrap}>
            <View style={styles.eyebrowRow}>
              <Headphones color={Colors.goldBright} size={12} strokeWidth={2.8} />
              <Text style={styles.eyebrow}>LIVEKIT AUDIO</Text>
            </View>
            <Text style={styles.title}>Spaces</Text>
          </View>
          <Pressable onPress={openCreate} style={styles.startBtn} testID="start-space">
            <Plus color={Colors.ink} size={14} strokeWidth={3} />
            <Text style={styles.startText}>START</Text>
          </Pressable>
        </View>

        <View style={styles.heroWrap}>
          <LinearGradient
            colors={["rgba(244,198,91,0.28)", "rgba(221,227,236,0.10)", "rgba(0,0,0,0.04)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroLeft}>
              <View style={styles.heroPill}>
                <View style={styles.pulseDot} />
                <Text style={styles.heroPillText}>{liveSpaces.length} SPACES LIVE</Text>
              </View>
              <Text style={styles.heroTitle}>Real-time alpha rooms</Text>
              <Text style={styles.heroSub}>
                Host market calls, token launches, whale watch rooms, and AI alpha using LiveKit Spaces.
              </Text>
              <View style={styles.heroStatsRow}>
                <MiniStat label="Live" value={liveSpaces.length.toString()} />
                <MiniStat label="Scheduled" value={upcomingSpaces.length.toString()} />
                <MiniStat label="Following" value={followed.length.toString()} />
              </View>
            </View>
            <Pulser />
          </LinearGradient>
        </View>

        <View style={styles.searchWrap}>
          <Search color={Colors.muted} size={14} strokeWidth={2.6} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Spaces, hosts, topics..."
            placeholderTextColor={Colors.muted2}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <X color={Colors.muted} size={14} strokeWidth={2.6} />
            </Pressable>
          ) : null}
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
                  {t === "live" ? "Live" : t === "upcoming" ? "Scheduled" : "Following"}
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
                  <Radio color={Colors.goldBright} size={26} strokeWidth={2.4} />
                ) : tab === "upcoming" ? (
                  <Calendar color={Colors.silver} size={26} strokeWidth={2.4} />
                ) : (
                  <Bell color={Colors.goldBright} size={26} strokeWidth={2.4} />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {query.trim()
                  ? "No Spaces matched"
                  : tab === "live"
                  ? "No one is on air yet"
                  : tab === "upcoming"
                  ? "Nothing scheduled"
                  : "Follow rooms for reminders"}
              </Text>
              <Text style={styles.emptyBody}>
                {query.trim()
                  ? "Try another host, topic, or room title."
                  : "Start the first Space and pull traders into a live alpha room."}
              </Text>
              {!query.trim() ? (
                <Pressable onPress={openCreate} style={styles.emptyCta}>
                  <Plus color={Colors.ink} size={14} strokeWidth={3} />
                  <Text style={styles.emptyCtaText}>Create Space</Text>
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerWrap}>
              <Text style={styles.footerLabel}>ROOM TYPES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
                {SPACE_CATEGORIES.map((c) => (
                  <View key={c.key} style={styles.fTag}>
                    <Text style={styles.fTagText}>#{c.label.toLowerCase()}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          }
        />
      </SafeAreaView>

      <CreateSpaceModal
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreate={onCreate}
      />
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function Pulser() {
  const [scale] = useState(() => new Animated.Value(1));
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
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
      <LinearGradient colors={[`${space.accent[0]}2E`, "rgba(255,255,255,0.035)"]} style={styles.cardInner}>
        <View style={styles.cardTop}>
          <View style={[styles.topicPill, { backgroundColor: `${space.accent[0]}22`, borderColor: `${space.accent[0]}55` }]}>
            <Text style={[styles.topicText, { color: space.accent[0] }]}>{space.topic}</Text>
          </View>
          {space.isLive ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{formatLive(space.startedAt)}</Text>
            </View>
          ) : (
            <View style={styles.scheduledBadge}>
              <Clock color={Colors.silver} size={10} strokeWidth={3} />
              <Text style={styles.scheduledText}>{formatScheduled(space.scheduledAt)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{space.title}</Text>
        {space.description ? <Text style={styles.cardDesc} numberOfLines={2}>{space.description}</Text> : null}

        <View style={styles.hostRow}>
          <View style={[styles.hostAvatar, { backgroundColor: space.accent[0] }]}>
            <Text style={styles.hostInit}>{space.hostName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hostName} numberOfLines={1}>{space.hostName} <Text style={styles.hostMeta}>· {space.hostHandle}</Text></Text>
            <Text style={styles.hostCo} numberOfLines={1}>{space.category.toUpperCase()} room</Text>
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
              <Sparkles color={Colors.goldBright} size={11} strokeWidth={3} />
              <Text style={styles.footStatText}>{space.raisedHands}</Text>
            </View>
          ) : null}
          {space.isLive ? (
            <View style={[styles.joinBtn, { backgroundColor: space.accent[0] }]}>
              <Volume2 color={Colors.ink} size={11} strokeWidth={3} />
              <Text style={styles.joinText}>JOIN</Text>
              <ChevronRight color={Colors.ink} size={12} strokeWidth={3} />
            </View>
          ) : (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onFollow();
              }}
              style={[styles.followBtn, following && { backgroundColor: "rgba(244,198,91,0.16)", borderColor: Colors.goldBright }]}
              hitSlop={6}
              testID={`follow-${space.id}`}
            >
              <Bell color={following ? Colors.goldBright : Colors.text} size={11} strokeWidth={2.8} />
              <Text style={[styles.followText, following && { color: Colors.goldBright }]}>{following ? "ALERTING" : "REMIND"}</Text>
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function CreateSpaceModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: CreateSpaceInput) => Promise<void>;
}) {
  const [title, setTitle] = useState<string>("");
  const [topic, setTopic] = useState<string>("ALPHA");
  const [description, setDescription] = useState<string>("");
  const [category, setCategory] = useState<Space["category"]>("alpha");
  const [schedule, setSchedule] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onCreate({
      title,
      topic,
      description,
      category,
      scheduledAt: schedule ? Date.now() + 30 * 60_000 : null,
      recording: false,
    }).finally(() => setSubmitting(false));
    setTitle("");
    setDescription("");
    setTopic("ALPHA");
    setCategory("alpha");
    setSchedule(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <Pressable style={styles.modalShade} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View>
              <Text style={styles.sheetEyebrow}>CREATE LIVEKIT SPACE</Text>
              <Text style={styles.sheetTitle}>Start an audio room</Text>
            </View>
            <Pressable onPress={onClose} style={styles.sheetClose}>
              <X color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Market open alpha, AI runners, whale watch..."
            placeholderTextColor={Colors.muted2}
            style={styles.sheetInput}
            maxLength={120}
          />

          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Topic</Text>
              <TextInput
                value={topic}
                onChangeText={(v) => setTopic(v.toUpperCase())}
                placeholder="ALPHA"
                placeholderTextColor={Colors.muted2}
                style={styles.sheetInput}
                maxLength={28}
                autoCapitalize="characters"
              />
            </View>
            <Pressable
              onPress={() => setSchedule((v) => !v)}
              style={[styles.scheduleToggle, schedule && styles.scheduleToggleActive]}
            >
              <Calendar color={schedule ? Colors.ink : Colors.text} size={15} strokeWidth={2.8} />
              <Text style={[styles.scheduleText, schedule && { color: Colors.ink }]}>30m</Text>
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {SPACE_CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <Pressable key={c.key} onPress={() => setCategory(c.key)} style={[styles.categoryChip, active && styles.categoryChipActive]}>
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.inputLabel}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Tell traders what the room is about."
            placeholderTextColor={Colors.muted2}
            style={[styles.sheetInput, styles.sheetTextArea]}
            multiline
            maxLength={500}
          />

          <Pressable onPress={submit} disabled={submitting} style={styles.createBtn} testID="create-space-submit">
            <Flame color={Colors.ink} size={16} strokeWidth={3} />
            <Text style={styles.createBtnText}>{submitting ? "CREATING..." : schedule ? "SCHEDULE SPACE" : "GO LIVE"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 4, flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  headTitleWrap: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: Colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.9, marginTop: 2 },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.goldBright },
  startText: { color: Colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  heroWrap: { paddingHorizontal: 18, marginTop: 14 },
  hero: { flexDirection: "row", alignItems: "center", padding: 18, borderRadius: 24, borderWidth: 1, borderColor: "rgba(244,198,91,0.30)", overflow: "hidden" },
  heroLeft: { flex: 1 },
  heroPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(244,198,91,0.42)" },
  pulseDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.goldBright },
  heroPillText: { color: Colors.goldBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { color: Colors.text, fontSize: 21, fontWeight: "900", letterSpacing: -0.55, marginTop: 10 },
  heroSub: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 5 },
  heroStatsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  miniStat: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  miniValue: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  miniLabel: { color: Colors.muted, fontSize: 9, fontWeight: "800", marginTop: 1 },
  pulserWrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  pulserOuter: { position: "absolute", width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(244,198,91,0.22)" },
  pulserInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.goldBright, alignItems: "center", justifyContent: "center" },
  searchWrap: { marginHorizontal: 18, marginTop: 14, height: 42, borderRadius: 15, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", paddingVertical: 0 },
  tabsWrap: { flexDirection: "row", gap: 6, marginTop: 12, marginHorizontal: 18, padding: 4, backgroundColor: Colors.card, borderRadius: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 11 },
  tabActive: { backgroundColor: "rgba(255,255,255,0.07)" },
  tabLiveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.goldBright },
  tabText: { color: Colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  tabCount: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", minWidth: 20, alignItems: "center" },
  tabCountText: { color: Colors.text, fontSize: 9, fontWeight: "900" },
  listContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 140 },
  gap: { height: 12 },
  card: { borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: Colors.card },
  cardInner: { padding: 16 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topicPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  topicText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(244,198,91,0.14)", borderWidth: 1, borderColor: "rgba(244,198,91,0.38)" },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.goldBright },
  liveText: { color: Colors.goldBright, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  scheduledBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(221,227,236,0.12)", borderWidth: 1, borderColor: "rgba(221,227,236,0.25)" },
  scheduledText: { color: Colors.silver, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  cardTitle: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.35, marginTop: 12 },
  cardDesc: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 4 },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  hostAvatar: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  hostInit: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  hostName: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  hostMeta: { color: Colors.muted, fontWeight: "700" },
  hostCo: { color: Colors.muted, fontSize: 10, fontWeight: "800", marginTop: 2 },
  recBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(247,242,231,0.14)" },
  recDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.rose },
  recText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  footStat: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)" },
  footStatText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  joinBtn: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  joinText: { color: Colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  followBtn: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  followText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  empty: { paddingHorizontal: 32, paddingVertical: 52, alignItems: "center" },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: "rgba(244,198,91,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 6, lineHeight: 17 },
  emptyCta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.goldBright },
  emptyCtaText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  footerWrap: { marginTop: 22 },
  footerLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginBottom: 8 },
  tagsRow: { gap: 6 },
  fTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  fTagText: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, backgroundColor: "rgba(12,11,9,0.98)", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: "rgba(244,198,91,0.22)" },
  sheetHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 14 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  sheetEyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  sheetTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5, marginTop: 3 },
  sheetClose: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.card },
  inputLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 7, marginTop: 10 },
  sheetInput: { minHeight: 46, borderRadius: 15, paddingHorizontal: 12, color: Colors.text, fontSize: 13, fontWeight: "800", backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  sheetTextArea: { minHeight: 82, paddingTop: 12, textAlignVertical: "top" },
  twoCol: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  scheduleToggle: { width: 78, height: 46, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  scheduleToggleActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  scheduleText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  categoryRow: { gap: 8, paddingRight: 16 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  categoryChipActive: { backgroundColor: "rgba(244,198,91,0.16)", borderColor: Colors.goldBright },
  categoryChipText: { color: Colors.muted, fontSize: 12, fontWeight: "900" },
  categoryChipTextActive: { color: Colors.goldBright },
  createBtn: { marginTop: 16, height: 50, borderRadius: 16, backgroundColor: Colors.goldBright, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  createBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
});
