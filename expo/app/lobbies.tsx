import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ChevronRight,
  Globe,
  Headphones,
  Lock,
  Mic,
  Plus,
  Radio,
  Search,
  Sparkles,
  Users,
  Volume2,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useLobbies } from "@/providers/lobbies-provider";

export default function LobbiesScreen() {
  const router = useRouter();
  const { lobbies, createLobby, joinLobby } = useLobbies();
  const [query, setQuery] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "live" | "private">("all");
  const [creating, setCreating] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [isPrivate, setPrivate] = useState<boolean>(false);
  const [tagInput, setTagInput] = useState<string>("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lobbies.filter((l) => {
      if (filter === "private" && !l.isPrivate) return false;
      if (filter === "live" && l.members.length === 0) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.topic.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [lobbies, query, filter]);

  const totalMembers = useMemo(
    () => lobbies.reduce((acc, l) => acc + l.members.length, 0),
    [lobbies],
  );
  const liveCount = useMemo(
    () => lobbies.filter((l) => l.members.some((m) => m.speaking)).length,
    [lobbies],
  );

  const onOpen = useCallback(
    (id: string) => {
      Haptics.selectionAsync().catch(() => {});
      joinLobby(id).catch((e) => console.log("[lobbies] join failed", e));
      router.push({ pathname: "/lobby/[id]", params: { id } });
    },
    [joinLobby, router],
  );

  const onCreate = useCallback(async () => {
    if (!name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);
    const id = await createLobby({ name, topic, isPrivate, tags });
    setCreating(false);
    setName("");
    setTopic("");
    setTagInput("");
    setPrivate(false);
    router.push({ pathname: "/lobby/[id]", params: { id } });
  }, [name, topic, isPrivate, tagInput, createLobby, router]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.topCenter}>
            <View style={styles.topBadge}>
              <View style={styles.dotRose} />
              <Text style={styles.topBadgeText}>TRADING LOBBIES</Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setCreating(true);
            }}
            style={[styles.iconBtn, styles.iconBtnAccent]}
            testID="lobbies-create"
          >
            <Plus color={Colors.ink} size={18} strokeWidth={3} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={["rgba(255,93,143,0.34)", "rgba(184,140,255,0.18)", "rgba(56,215,255,0.06)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroEyebrow}>
              <Mic color={Colors.rose} size={11} strokeWidth={3} />
              <Text style={styles.heroEyebrowText}>VOICE · TEXT · CHARTS</Text>
            </View>
            <Text style={styles.heroTitle}>Trade together. Watch together. Win together.</Text>
            <Text style={styles.heroSub}>
              Live voice rooms with shared watchlists and wallet tracking. Drop in, share alpha,
              run plays.
            </Text>
            <View style={styles.heroStats}>
              <Stat label="LOBBIES" value={lobbies.length.toString()} />
              <Stat label="ONLINE" value={totalMembers.toString()} />
              <Stat label="LIVE" value={liveCount.toString()} accent={Colors.rose} />
            </View>
          </LinearGradient>

          <View style={styles.searchWrap}>
            <Search color={Colors.muted} size={16} strokeWidth={2.4} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search lobbies, topics, tags…"
              placeholderTextColor={Colors.muted}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.filterRow}>
            {(["all", "live", "private"] as const).map((f) => {
              const active = f === filter;
              return (
                <Pressable
                  key={f}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFilter(f);
                  }}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {f.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ gap: 12, marginTop: 14 }}>
            {visible.map((lb) => {
              const isLive = lb.members.some((m) => m.speaking);
              return (
                <Pressable
                  key={lb.id}
                  onPress={() => onOpen(lb.id)}
                  style={styles.lobbyCard}
                  testID={`lobby-${lb.id}`}
                >
                  <LinearGradient
                    colors={[
                      isLive ? "rgba(255,93,143,0.22)" : "rgba(184,140,255,0.16)",
                      "rgba(3,7,8,0)",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.lobbyHead}>
                    <View
                      style={[
                        styles.lobbyAvatar,
                        { backgroundColor: isLive ? Colors.rose : Colors.violet },
                      ]}
                    >
                      <Radio color={Colors.ink} size={18} strokeWidth={3} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.lobbyTitleLine}>
                        <Text style={styles.lobbyName} numberOfLines={1}>
                          {lb.name}
                        </Text>
                        {lb.isPrivate ? (
                          <Lock color={Colors.muted} size={12} strokeWidth={2.6} />
                        ) : (
                          <Globe color={Colors.muted} size={12} strokeWidth={2.6} />
                        )}
                      </View>
                      <Text style={styles.lobbyTopic} numberOfLines={1}>
                        {lb.topic || "No topic set"}
                      </Text>
                    </View>
                    {isLive ? (
                      <View style={styles.livePill}>
                        <View style={styles.dotMint} />
                        <Text style={styles.livePillText}>LIVE</Text>
                      </View>
                    ) : (
                      <ChevronRight color={Colors.muted} size={16} strokeWidth={2.6} />
                    )}
                  </View>

                  <View style={styles.lobbyMeta}>
                    <View style={styles.metaItem}>
                      <Users color={Colors.cyan} size={11} strokeWidth={2.8} />
                      <Text style={styles.metaText}>{lb.members.length}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Headphones color={Colors.mint} size={11} strokeWidth={2.8} />
                      <Text style={styles.metaText}>
                        {lb.members.filter((m) => !m.muted).length} mic
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Volume2 color={Colors.orange} size={11} strokeWidth={2.8} />
                      <Text style={styles.metaText}>
                        {lb.members.filter((m) => m.speaking).length} live
                      </Text>
                    </View>
                  </View>

                  {lb.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {lb.tags.slice(0, 4).map((t) => (
                        <View key={t} style={styles.tagChip}>
                          <Text style={styles.tagText}>#{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.facesRow}>
                    {lb.members.slice(0, 5).map((m, i) => (
                      <View
                        key={m.id}
                        style={[
                          styles.face,
                          {
                            marginLeft: i === 0 ? 0 : -10,
                            backgroundColor: m.speaking
                              ? Colors.rose
                              : m.isHost
                                ? Colors.violet
                                : Colors.cardSoft,
                            borderColor: m.speaking ? Colors.rose : Colors.line,
                          },
                        ]}
                      >
                        <Text style={styles.faceText}>
                          {m.handle.replace("@", "").slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    ))}
                    {lb.members.length > 5 && (
                      <View style={[styles.face, styles.faceMore]}>
                        <Text style={styles.faceMoreText}>+{lb.members.length - 5}</Text>
                      </View>
                    )}
                    <Text style={styles.hostText}>hosted by {lb.hostHandle}</Text>
                  </View>
                </Pressable>
              );
            })}

            {visible.length === 0 && (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Sparkles color={Colors.rose} size={22} strokeWidth={2.4} />
                </View>
                <Text style={styles.emptyTitle}>No lobbies match</Text>
                <Text style={styles.emptyBody}>Tap + to spin one up.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={creating}
        animationType="slide"
        transparent
        onRequestClose={() => setCreating(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreating(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New lobby</Text>
              <Pressable onPress={() => setCreating(false)} hitSlop={10}>
                <X color={Colors.muted} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>

            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Alpha Pit"
              placeholderTextColor={Colors.muted}
              style={styles.input}
              testID="lobby-name"
            />
            <Text style={styles.label}>Topic</Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="What are we hunting today?"
              placeholderTextColor={Colors.muted}
              style={styles.input}
            />
            <Text style={styles.label}>Tags (comma separated)</Text>
            <TextInput
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="alpha, snipes, memes"
              placeholderTextColor={Colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <View style={styles.privacyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.privacyTitle}>Private lobby</Text>
                <Text style={styles.privacyBody}>Invite-only. Off the public list.</Text>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={setPrivate}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: Colors.rose }}
                thumbColor={isPrivate ? Colors.ink : Colors.muted}
              />
            </View>

            <Pressable
              onPress={onCreate}
              style={[styles.cta, !name.trim() && styles.ctaDisabled]}
              disabled={!name.trim()}
              testID="lobby-create-confirm"
            >
              <Mic color={Colors.ink} size={15} strokeWidth={3} />
              <Text style={styles.ctaText}>Open lobby</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const color = accent ?? Colors.text;
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
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
  iconBtnAccent: { backgroundColor: Colors.rose, borderColor: Colors.rose },
  topCenter: { alignItems: "center" },
  topBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,93,143,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
  },
  topBadgeText: {
    color: Colors.rose,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  dotRose: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.rose },
  dotMint: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.mint },

  hero: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.35)",
    overflow: "hidden",
  },
  heroEyebrow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
  },
  heroEyebrowText: { color: Colors.rose, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  heroTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 12,
  },
  heroSub: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 6,
  },
  heroStats: { flexDirection: "row", gap: 18, marginTop: 16 },
  statBlock: {},
  statValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.6 },
  statLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },

  searchWrap: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "700", padding: 0 },

  filterRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  filterChipActive: { backgroundColor: Colors.rose, borderColor: Colors.rose },
  filterText: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  filterTextActive: { color: Colors.ink },

  lobbyCard: {
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(184,140,255,0.25)",
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  lobbyHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  lobbyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  lobbyTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  lobbyName: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.4 },
  lobbyTopic: { color: Colors.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.16)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
  },
  livePillText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },

  lobbyMeta: { flexDirection: "row", gap: 10, marginTop: 12 },
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
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(184,140,255,0.4)",
    backgroundColor: "rgba(184,140,255,0.08)",
  },
  tagText: { color: Colors.violet, fontSize: 10, fontWeight: "900" },
  facesRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  face: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  faceText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  faceMore: {
    marginLeft: -10,
    backgroundColor: Colors.cardSoft,
    borderColor: Colors.line,
  },
  faceMoreText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  hostText: { marginLeft: 10, color: Colors.muted, fontSize: 11, fontWeight: "700" },

  empty: {
    alignItems: "center",
    paddingVertical: 40,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,93,143,0.14)",
  },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", marginTop: 12 },
  emptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 4 },

  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    borderTopWidth: 1,
    borderColor: "rgba(255,93,143,0.4)",
    paddingBottom: 32,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6 },
  label: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
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
  privacyRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    gap: 12,
  },
  privacyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  privacyBody: { color: Colors.muted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  cta: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.rose,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
});
