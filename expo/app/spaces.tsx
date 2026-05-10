import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Headphones,
  Mic,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Users as UsersIcon,
  Volume2,
  X,
  Zap,
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
import { navigateBack } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";
import { CreateSpaceInput, Space, useSocial } from "@/providers/social-provider";

type Tab = "onair" | "scheduled" | "following" | "all";
type CategoryFilter = "all" | Space["category"];

const SPACE_CATEGORIES: { key: Space["category"]; label: string; tone: string }[] = [
  { key: "alpha", label: "Alpha", tone: Colors.goldBright },
  { key: "whales", label: "Whales", tone: Colors.silver },
  { key: "ai", label: "AI", tone: Colors.mint },
  { key: "ta", label: "TA", tone: Colors.cyan },
  { key: "memes", label: "Memes", tone: Colors.orange },
  { key: "launches", label: "Launches", tone: Colors.platinum },
];

const TABS: { key: Tab; label: string }[] = [
  { key: "onair", label: "On air" },
  { key: "scheduled", label: "Soon" },
  { key: "following", label: "Alerts" },
  { key: "all", label: "All" },
];

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function liveDuration(startedAt?: number): string {
  if (!startedAt) return "LIVE";
  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  if (minutes < 60) return `${minutes}m live`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function scheduleLabel(scheduledAt?: number): string {
  if (!scheduledAt) return "Scheduled";
  const minutes = Math.floor((scheduledAt - Date.now()) / 60000);
  if (minutes <= 0) return "Ready";
  if (minutes < 60) return `in ${minutes}m`;
  if (minutes < 1440) return `in ${Math.floor(minutes / 60)}h`;
  return `in ${Math.floor(minutes / 1440)}d`;
}

function categoryTone(category: Space["category"]): string {
  return SPACE_CATEGORIES.find((c) => c.key === category)?.tone ?? Colors.goldBright;
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

  const [tab, setTab] = useState<Tab>("onair");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState<string>("");
  const [composerOpen, setComposerOpen] = useState<boolean>(false);

  const activeSpaces = useMemo(
    () => spaces.filter((s) => s.status !== "ended" && s.status !== "cancelled"),
    [spaces],
  );

  const followedSpaces = useMemo(
    () => activeSpaces.filter((s) => isFollowingSpace(s.id)),
    [activeSpaces, isFollowingSpace],
  );

  const heroSpace = useMemo<Space | undefined>(
    () => liveSpaces[0] ?? upcomingSpaces[0] ?? activeSpaces[0],
    [liveSpaces, upcomingSpaces, activeSpaces],
  );

  const tabSource = useMemo<Space[]>(() => {
    if (tab === "onair") return liveSpaces;
    if (tab === "scheduled") return upcomingSpaces;
    if (tab === "following") return followedSpaces;
    return activeSpaces;
  }, [tab, liveSpaces, upcomingSpaces, followedSpaces, activeSpaces]);

  const filtered = useMemo<Space[]>(() => {
    const q = query.trim().toLowerCase();
    return tabSource
      .filter((s) => category === "all" || s.category === category)
      .filter((s) => {
        if (!q) return true;
        return [s.title, s.description, s.topic, s.hostName, s.hostHandle, s.category]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt);
      });
  }, [tabSource, category, query]);

  const openCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Create, join, and host Spaces after signing in.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign in", onPress: () => router.push("/auth") },
      ]);
      return;
    }
    setComposerOpen(true);
  };

  const openSpace = (space: Space) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push({ pathname: "/space/[id]", params: { id: space.id } });
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
    <SpaceCapsule
      space={item}
      following={isFollowingSpace(item.id)}
      onPress={() => openSpace(item)}
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
          <Pressable onPress={() => navigateBack(router, "/(tabs)/home")} style={styles.iconBtn} testID="spaces-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <View style={styles.kickerRow}>
              <Radio color={Colors.goldBright} size={12} strokeWidth={3} />
              <Text style={styles.kicker}>LIVEKIT SPACES</Text>
            </View>
            <Text style={styles.title}>Signal Rooms</Text>
          </View>
          <Pressable onPress={openCreate} style={styles.startBtn} testID="start-space">
            <Plus color={Colors.ink} size={15} strokeWidth={3} />
            <Text style={styles.startText}>HOST</Text>
          </Pressable>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          ListHeaderComponent={
            <View>
              <HeroPanel
                space={heroSpace}
                liveCount={liveSpaces.length}
                scheduledCount={upcomingSpaces.length}
                alertCount={followedSpaces.length}
                onPress={() => heroSpace && openSpace(heroSpace)}
                onCreate={openCreate}
              />

              <View style={styles.searchShell}>
                <Search color={Colors.muted} size={15} strokeWidth={2.7} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search hosts, topics, rooms..."
                  placeholderTextColor={Colors.muted2}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={10}>
                    <X color={Colors.muted} size={15} strokeWidth={2.7} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.tabRail}>
                {TABS.map((t) => {
                  const active = tab === t.key;
                  const count =
                    t.key === "onair"
                      ? liveSpaces.length
                      : t.key === "scheduled"
                        ? upcomingSpaces.length
                        : t.key === "following"
                          ? followedSpaces.length
                          : activeSpaces.length;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setTab(t.key);
                      }}
                      style={[styles.tabPill, active && styles.tabPillActive]}
                      testID={`spaces-tab-${t.key}`}
                    >
                      {t.key === "onair" ? <View style={[styles.tabDot, active && styles.tabDotActive]} /> : null}
                      <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                      <Text style={[styles.tabNumber, active && styles.tabNumberActive]}>{count}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
                <CategoryChip
                  label="All rooms"
                  active={category === "all"}
                  tone={Colors.goldBright}
                  onPress={() => setCategory("all")}
                />
                {SPACE_CATEGORIES.map((c) => (
                  <CategoryChip
                    key={c.key}
                    label={c.label}
                    active={category === c.key}
                    tone={c.tone}
                    onPress={() => setCategory(c.key)}
                  />
                ))}
              </ScrollView>

              <View style={styles.sectionHead}>
                <View>
                  <Text style={styles.sectionEyebrow}>ROOM DIRECTORY</Text>
                  <Text style={styles.sectionTitle}>{filtered.length} matching Spaces</Text>
                </View>
                <View style={styles.safeBadge}>
                  <ShieldCheck color={Colors.goldBright} size={12} strokeWidth={2.8} />
                  <Text style={styles.safeBadgeText}>Host controlled</Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyOrb}>
                <Headphones color={Colors.goldBright} size={28} strokeWidth={2.6} />
              </View>
              <Text style={styles.emptyTitle}>{query ? "No Space matched" : "No rooms in this lane"}</Text>
              <Text style={styles.emptyBody}>
                {query ? "Try another ticker, host, or topic." : "Start the next alpha call and bring the room online."}
              </Text>
              {!query ? (
                <Pressable onPress={openCreate} style={styles.emptyBtn}>
                  <Plus color={Colors.ink} size={14} strokeWidth={3} />
                  <Text style={styles.emptyBtnText}>Create Space</Text>
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={<View style={styles.footerSpacer} />}
        />
      </SafeAreaView>

      <CreateSpaceModal visible={composerOpen} onClose={() => setComposerOpen(false)} onCreate={onCreate} />
    </View>
  );
}

function HeroPanel({
  space,
  liveCount,
  scheduledCount,
  alertCount,
  onPress,
  onCreate,
}: {
  space?: Space;
  liveCount: number;
  scheduledCount: number;
  alertCount: number;
  onPress: () => void;
  onCreate: () => void;
}) {
  return (
    <LinearGradient
      colors={["rgba(244,198,91,0.30)", "rgba(221,227,236,0.10)", "rgba(2,2,2,0.10)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroBgRing} />
      <View style={styles.heroTop}>
        <View style={styles.onAirPill}>
          <View style={styles.livePulse} />
          <Text style={styles.onAirText}>{liveCount} ON AIR NOW</Text>
        </View>
        <WaveOrb />
      </View>
      <Text style={styles.heroTitle}>Trade rooms that feel alive.</Text>
      <Text style={styles.heroBody}>
        LiveKit-powered audio Spaces for market calls, token launches, whale watch, AI alpha, and community calls.
      </Text>
      {space ? (
        <Pressable onPress={onPress} style={styles.featuredRoom} testID="featured-space-room">
          <View style={[styles.featuredStripe, { backgroundColor: categoryTone(space.category) }]} />
          <View style={styles.featuredMid}>
            <Text style={styles.featuredLabel}>{space.isLive ? liveDuration(space.startedAt) : scheduleLabel(space.scheduledAt)}</Text>
            <Text style={styles.featuredTitle} numberOfLines={1}>{space.title}</Text>
            <Text style={styles.featuredSub} numberOfLines={1}>{space.hostName} · {space.topic}</Text>
          </View>
          <View style={styles.featuredJoin}>
            <Volume2 color={Colors.ink} size={14} strokeWidth={3} />
          </View>
        </Pressable>
      ) : (
        <Pressable onPress={onCreate} style={styles.featuredRoom}>
          <View style={[styles.featuredStripe, { backgroundColor: Colors.goldBright }]} />
          <View style={styles.featuredMid}>
            <Text style={styles.featuredLabel}>READY</Text>
            <Text style={styles.featuredTitle}>Create the first live room</Text>
            <Text style={styles.featuredSub}>Host a market call in seconds</Text>
          </View>
          <View style={styles.featuredJoin}>
            <Plus color={Colors.ink} size={14} strokeWidth={3} />
          </View>
        </Pressable>
      )}
      <View style={styles.heroStats}>
        <HeroStat label="Live" value={liveCount.toString()} />
        <HeroStat label="Scheduled" value={scheduledCount.toString()} />
        <HeroStat label="Alerts" value={alertCount.toString()} />
      </View>
    </LinearGradient>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function WaveOrb() {
  const scale = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 920, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 920, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <View style={styles.waveWrap} pointerEvents="none">
      <Animated.View style={[styles.waveHalo, { transform: [{ scale }] }]} />
      <View style={styles.waveCore}>
        <Headphones color={Colors.ink} size={18} strokeWidth={3} />
      </View>
    </View>
  );
}

function CategoryChip({ label, active, tone, onPress }: { label: string; active: boolean; tone: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.categoryChip, active && { borderColor: tone, backgroundColor: `${tone}18` }]}>
      {active ? <CheckCircle2 color={tone} size={12} strokeWidth={3} /> : null}
      <Text style={[styles.categoryText, active && { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

function SpaceCapsule({
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
  const tone = categoryTone(space.category);
  return (
    <Pressable onPress={onPress} style={styles.capsule} testID={`space-${space.id}`}>
      <LinearGradient colors={[`${tone}18`, "rgba(255,255,255,0.035)"]} style={styles.capsuleInner}>
        <View style={[styles.signalAvatar, { backgroundColor: tone }]}>
          {space.isLive ? <Radio color={Colors.ink} size={17} strokeWidth={3} /> : <Calendar color={Colors.ink} size={17} strokeWidth={3} />}
        </View>
        <View style={styles.capsuleBody}>
          <View style={styles.capsuleMetaRow}>
            <Text style={[styles.capsuleTopic, { color: tone }]}>{space.topic}</Text>
            <Text style={styles.capsuleDot}>·</Text>
            <Text style={styles.capsuleTime}>{space.isLive ? liveDuration(space.startedAt) : scheduleLabel(space.scheduledAt)}</Text>
          </View>
          <Text style={styles.capsuleTitle} numberOfLines={1}>{space.title}</Text>
          <View style={styles.capsuleSubRow}>
            <Text style={styles.hostText} numberOfLines={1}>{space.hostName || "Host"}</Text>
            <View style={styles.miniStatPill}>
              <Mic color={tone} size={10} strokeWidth={3} />
              <Text style={styles.miniStatText}>{space.speakers}</Text>
            </View>
            <View style={styles.miniStatPill}>
              <UsersIcon color={Colors.muted} size={10} strokeWidth={3} />
              <Text style={styles.miniStatText}>{fmtCount(space.listeners)}</Text>
            </View>
            {space.raisedHands > 0 ? (
              <View style={styles.miniStatPill}>
                <Sparkles color={Colors.goldBright} size={10} strokeWidth={3} />
                <Text style={styles.miniStatText}>{space.raisedHands}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {space.isLive ? (
          <View style={[styles.joinPill, { backgroundColor: tone }]}>
            <Text style={styles.joinText}>JOIN</Text>
          </View>
        ) : (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onFollow();
            }}
            style={[styles.remindPill, following && { borderColor: Colors.goldBright, backgroundColor: "rgba(244,198,91,0.14)" }]}
            testID={`follow-${space.id}`}
          >
            <Bell color={following ? Colors.goldBright : Colors.text} size={12} strokeWidth={2.8} />
          </Pressable>
        )}
      </LinearGradient>
    </Pressable>
  );
}

function CreateSpaceModal({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (input: CreateSpaceInput) => Promise<void> }) {
  const [title, setTitle] = useState<string>("");
  const [topic, setTopic] = useState<string>("ALPHA");
  const [description, setDescription] = useState<string>("");
  const [category, setCategory] = useState<Space["category"]>("alpha");
  const [schedule, setSchedule] = useState<boolean>(false);
  const [recording, setRecording] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const reset = () => {
    setTitle("");
    setTopic("ALPHA");
    setDescription("");
    setCategory("alpha");
    setSchedule(false);
    setRecording(false);
  };

  const submit = async () => {
    if (submitting) return;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      Alert.alert("Add a title", "Give your Space a short room title first.");
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        title: trimmedTitle,
        topic: topic.trim() || "ALPHA",
        description: description.trim(),
        category,
        scheduledAt: schedule ? Date.now() + 30 * 60_000 : null,
        recording,
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <Pressable style={styles.modalShade} onPress={onClose} />
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetKicker}>NEW LIVEKIT SPACE</Text>
              <Text style={styles.sheetTitle}>Build a room</Text>
            </View>
            <Pressable onPress={onClose} style={styles.sheetClose}>
              <X color={Colors.text} size={18} strokeWidth={2.8} />
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Room title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Fresh migrations, whale tape, AI runners..."
            placeholderTextColor={Colors.muted2}
            style={styles.input}
            maxLength={120}
          />

          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Topic tag</Text>
              <TextInput
                value={topic}
                onChangeText={(v) => setTopic(v.toUpperCase())}
                placeholder="ALPHA"
                placeholderTextColor={Colors.muted2}
                style={styles.input}
                maxLength={28}
                autoCapitalize="characters"
              />
            </View>
            <Pressable onPress={() => setSchedule((v) => !v)} style={[styles.optionTile, schedule && styles.optionTileActive]}>
              <Clock color={schedule ? Colors.ink : Colors.text} size={16} strokeWidth={3} />
              <Text style={[styles.optionText, schedule && styles.optionTextActive]}>30m</Text>
            </Pressable>
            <Pressable onPress={() => setRecording((v) => !v)} style={[styles.optionTile, recording && styles.optionTileActive]}>
              <ShieldCheck color={recording ? Colors.ink : Colors.text} size={16} strokeWidth={3} />
              <Text style={[styles.optionText, recording && styles.optionTextActive]}>REC</Text>
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetCategoryRail}>
            {SPACE_CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <Pressable key={c.key} onPress={() => setCategory(c.key)} style={[styles.sheetCat, active && { borderColor: c.tone, backgroundColor: `${c.tone}18` }]}>
                  <Text style={[styles.sheetCatText, active && { color: c.tone }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.inputLabel}>Room brief</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What should traders expect in this Space?"
            placeholderTextColor={Colors.muted2}
            style={[styles.input, styles.textArea]}
            multiline
            maxLength={500}
          />

          <Pressable onPress={submit} disabled={submitting} style={[styles.createBtn, submitting && styles.createBtnDisabled]} testID="create-space-submit">
            <Zap color={Colors.ink} size={16} strokeWidth={3} />
            <Text style={styles.createText}>{submitting ? "CREATING..." : schedule ? "SCHEDULE SPACE" : "GO LIVE"}</Text>
          </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 38, height: 38, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kicker: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.8, marginTop: 2 },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 15, backgroundColor: Colors.goldBright },
  startText: { color: Colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  listContent: { paddingHorizontal: 18, paddingBottom: 138 },
  gap: { height: 10 },
  hero: { marginTop: 10, borderRadius: 30, padding: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(244,198,91,0.30)" },
  heroBgRing: { position: "absolute", right: -54, top: -42, width: 168, height: 168, borderRadius: 84, borderWidth: 1, borderColor: "rgba(244,198,91,0.20)" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  onAirPill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.42)", borderWidth: 1, borderColor: "rgba(244,198,91,0.38)" },
  livePulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.goldBright },
  onAirText: { color: Colors.goldBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  waveWrap: { width: 58, height: 58, alignItems: "center", justifyContent: "center" },
  waveHalo: { position: "absolute", width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(244,198,91,0.18)" },
  waveCore: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.goldBright, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: Colors.text, fontSize: 27, fontWeight: "900", letterSpacing: -0.9, marginTop: 14, maxWidth: 260 },
  heroBody: { color: Colors.muted, fontSize: 12.5, fontWeight: "650", lineHeight: 18, marginTop: 6, maxWidth: 310 },
  featuredRoom: { marginTop: 15, minHeight: 68, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.36)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", overflow: "hidden" },
  featuredStripe: { width: 5, alignSelf: "stretch" },
  featuredMid: { flex: 1, paddingHorizontal: 12 },
  featuredLabel: { color: Colors.goldBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  featuredTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 3 },
  featuredSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  featuredJoin: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: Colors.goldBright, alignItems: "center", justifyContent: "center" },
  heroStats: { flexDirection: "row", gap: 8, marginTop: 14 },
  heroStat: { flex: 1, paddingVertical: 9, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center" },
  heroStatValue: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  heroStatLabel: { color: Colors.muted, fontSize: 9, fontWeight: "800", marginTop: 2 },
  searchShell: { height: 45, borderRadius: 18, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "800", paddingVertical: 0 },
  tabRail: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  tabPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  tabPillActive: { backgroundColor: "rgba(244,198,91,0.14)", borderColor: "rgba(244,198,91,0.40)" },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.muted2 },
  tabDotActive: { backgroundColor: Colors.goldBright },
  tabText: { color: Colors.muted, fontSize: 12, fontWeight: "900" },
  tabTextActive: { color: Colors.text },
  tabNumber: { color: Colors.muted2, fontSize: 10, fontWeight: "900" },
  tabNumberActive: { color: Colors.goldBright },
  categoryRail: { gap: 8, paddingVertical: 13 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  categoryText: { color: Colors.muted, fontSize: 12, fontWeight: "900" },
  sectionHead: { marginTop: 2, marginBottom: 12, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  sectionEyebrow: { color: Colors.muted2, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.25, marginTop: 2 },
  safeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(244,198,91,0.10)", borderWidth: 1, borderColor: "rgba(244,198,91,0.22)" },
  safeBadgeText: { color: Colors.goldBright, fontSize: 10, fontWeight: "900" },
  capsule: { borderRadius: 28, overflow: "hidden", backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.075)" },
  capsuleInner: { minHeight: 78, padding: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  signalAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  capsuleBody: { flex: 1, minWidth: 0 },
  capsuleMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  capsuleTopic: { fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  capsuleDot: { color: Colors.muted2, fontSize: 10, fontWeight: "900" },
  capsuleTime: { color: Colors.muted, fontSize: 10, fontWeight: "850" },
  capsuleTitle: { color: Colors.text, fontSize: 14.5, fontWeight: "900", letterSpacing: -0.2, marginTop: 4 },
  capsuleSubRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 },
  hostText: { color: Colors.muted, fontSize: 11, fontWeight: "800", maxWidth: 96 },
  miniStatPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.055)" },
  miniStatText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  joinPill: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
  joinText: { color: Colors.ink, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  remindPill: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  empty: { paddingHorizontal: 32, paddingVertical: 46, alignItems: "center" },
  emptyOrb: { width: 64, height: 64, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(244,198,91,0.13)", borderWidth: 1, borderColor: "rgba(244,198,91,0.22)", marginBottom: 14 },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center", lineHeight: 17, marginTop: 6 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 15, backgroundColor: Colors.goldBright },
  emptyBtnText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  footerSpacer: { height: 18 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)" },
  sheetScroll: { maxHeight: "88%", width: "100%" },
  sheetScrollContent: { paddingBottom: Platform.OS === "ios" ? 12 : 0 },
  sheet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, backgroundColor: "rgba(10,9,7,0.99)", borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: "rgba(244,198,91,0.25)" },
  sheetHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 14 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetKicker: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  sheetTitle: { color: Colors.text, fontSize: 23, fontWeight: "900", letterSpacing: -0.55, marginTop: 2 },
  sheetClose: { width: 38, height: 38, borderRadius: 14, backgroundColor: Colors.card, alignItems: "center", justifyContent: "center" },
  inputLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.15, marginBottom: 7, marginTop: 10 },
  input: { minHeight: 46, borderRadius: 16, paddingHorizontal: 12, color: Colors.text, fontSize: 13, fontWeight: "800", backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  textArea: { minHeight: 84, paddingTop: 12, textAlignVertical: "top" },
  formRow: { flexDirection: "row", gap: 9, alignItems: "flex-end" },
  optionTile: { width: 58, height: 46, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", gap: 2 },
  optionTileActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  optionText: { color: Colors.text, fontSize: 9, fontWeight: "900" },
  optionTextActive: { color: Colors.ink },
  sheetCategoryRail: { gap: 8, paddingRight: 16 },
  sheetCat: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  sheetCatText: { color: Colors.muted, fontSize: 12, fontWeight: "900" },
  createBtn: { marginTop: 16, height: 51, borderRadius: 18, backgroundColor: Colors.goldBright, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  createBtnDisabled: { opacity: 0.65 },
  createText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
});
