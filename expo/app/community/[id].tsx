import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  Calendar,
  Hash,
  Image as ImageIcon,
  MessageCircle,
  Pin,
  Send,
  Settings as SettingsIcon,
  Share2,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  ListRenderItem,
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
import { useApp } from "@/providers/app-provider";
import { CommunityPost, useSocial } from "@/providers/social-provider";

function fmtCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function timeAgo(t: number): string {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

type Tab = "feed" | "rules" | "members";

export default function CommunityDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getCommunity,
    isJoined,
    toggleJoin,
    postsByCommunity,
    addCommunityPost,
    togglePostLike,
    spaces,
  } = useSocial();
  const { profile } = useApp();
  const [tab, setTab] = useState<Tab>("feed");
  const [composer, setComposer] = useState<string>("");

  const community = useMemo(() => (id ? getCommunity(id) : undefined), [id, getCommunity]);
  const posts = useMemo(() => (id ? postsByCommunity(id) : []), [id, postsByCommunity]);
  const linkedSpaces = useMemo(
    () => spaces.filter((s) => s.isLive).slice(0, 3),
    [spaces],
  );

  const onSend = useCallback(async () => {
    const text = composer.trim();
    if (!community || text.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await addCommunityPost({
      communityId: community.id,
      content: text,
      authorHandle: profile.handle || "@you",
      authorName: profile.displayName || "You",
      authorColor: profile.avatarColor,
    });
    setComposer("");
  }, [composer, community, addCommunityPost, profile]);

  if (!community) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.notFound}>
            <Text style={styles.notFoundTitle}>Community not found</Text>
            <Pressable onPress={() => router.back()} style={styles.notFoundBtn}>
              <Text style={styles.notFoundBtnText}>Go back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const joined = isJoined(community.id);

  const renderPost: ListRenderItem<CommunityPost> = ({ item }) => (
    <PostRow post={item} onLike={() => togglePostLike(item.id)} />
  );

  return (
    <View style={styles.root} testID="community-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <FlatList
        data={tab === "feed" ? posts : []}
        keyExtractor={(p) => p.id}
        renderItem={renderPost}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListHeaderComponent={
          <View>
            <View style={styles.bannerWrap}>
              <LinearGradient
                colors={[community.accent[0], community.accent[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={["rgba(3,7,8,0)", "rgba(3,7,8,0.85)", Colors.ink]}
                style={StyleSheet.absoluteFill}
              />
              <SafeAreaView edges={["top"]} style={styles.bannerSafe}>
                <View style={styles.bannerBar}>
                  <Pressable
                    onPress={() => router.back()}
                    style={styles.bannerIcon}
                    testID="community-back"
                  >
                    <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
                  </Pressable>
                  <View style={styles.bannerActions}>
                    <Pressable style={styles.bannerIcon}>
                      <Share2 color={Colors.text} size={16} strokeWidth={2.4} />
                    </Pressable>
                    <Pressable style={styles.bannerIcon}>
                      <Bell color={Colors.text} size={16} strokeWidth={2.4} />
                    </Pressable>
                    <Pressable style={styles.bannerIcon}>
                      <SettingsIcon color={Colors.text} size={16} strokeWidth={2.4} />
                    </Pressable>
                  </View>
                </View>
              </SafeAreaView>
            </View>

            <View style={styles.headInfo}>
              <View style={styles.headTopRow}>
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: `${community.accent[0]}28`,
                      borderColor: community.accent[0],
                    },
                  ]}
                >
                  <Text style={styles.avatarEmoji}>{community.iconEmoji}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    toggleJoin(community.id);
                  }}
                  style={[
                    styles.joinBtn,
                    joined
                      ? styles.joinBtnOn
                      : { backgroundColor: community.accent[0] },
                  ]}
                  testID="community-join"
                >
                  <Text
                    style={[
                      styles.joinText,
                      { color: joined ? Colors.text : Colors.ink },
                    ]}
                  >
                    {joined ? "JOINED" : "JOIN"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {community.name}
                </Text>
                {community.verified ? (
                  <BadgeCheck color={Colors.cyan} size={18} strokeWidth={2.6} />
                ) : null}
              </View>
              <Text style={styles.handle}>#{community.handle}</Text>
              <Text style={styles.desc}>{community.description}</Text>

              <View style={styles.statRow}>
                <Stat icon={Users} label="MEMBERS" value={fmtCount(community.members)} />
                <Stat
                  icon={Hash}
                  label="POSTS"
                  value={fmtCount(community.posts)}
                  tone={Colors.cyan}
                />
                <Stat
                  icon={Sparkles}
                  label="ONLINE"
                  value={fmtCount(community.online)}
                  tone={Colors.mint}
                  pulse
                />
              </View>

              {community.pinnedTicker ? (
                <Pressable style={styles.tickerCta} testID="community-ticker">
                  <View
                    style={[
                      styles.tickerIcon,
                      { backgroundColor: `${community.accent[0]}22` },
                    ]}
                  >
                    <Wallet color={community.accent[0]} size={14} strokeWidth={2.6} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tickerLabel}>FEATURED TOKEN</Text>
                    <Text style={styles.tickerValue}>{community.pinnedTicker}</Text>
                  </View>
                  <View
                    style={[
                      styles.tickerChange,
                      { backgroundColor: "rgba(85,245,178,0.16)" },
                    ]}
                  >
                    <TrendingUp color={Colors.mint} size={11} strokeWidth={3} />
                    <Text style={[styles.tickerChangeText, { color: Colors.mint }]}>
                      +12.4%
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              {linkedSpaces.length > 0 ? (
                <View style={styles.spacesWrap}>
                  <View style={styles.spacesHead}>
                    <View style={styles.liveDot} />
                    <Text style={styles.spacesTitle}>Live spaces</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.spacesRow}
                  >
                    {linkedSpaces.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => router.push({ pathname: "/space/[id]", params: { id: s.id } })}
                        style={styles.spaceChip}
                        testID={`community-space-${s.id}`}
                      >
                        <View style={[styles.spaceDot, { backgroundColor: s.accent[0] }]} />
                        <Text style={styles.spaceTitle} numberOfLines={1}>
                          {s.title}
                        </Text>
                        <Text style={styles.spaceListeners}>· {s.listeners}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.tabsRow}>
                {(["feed", "rules", "members"] as Tab[]).map((t) => {
                  const active = tab === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setTab(t);
                      }}
                      style={[styles.tabBtn, active && styles.tabBtnActive]}
                      testID={`tab-${t}`}
                    >
                      <Text
                        style={[styles.tabText, active && { color: Colors.text }]}
                      >
                        {t === "feed" ? "Feed" : t === "rules" ? "Rules" : "Members"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {tab === "feed" ? (
                <View style={styles.composer}>
                  <View
                    style={[
                      styles.composerAvatar,
                      { backgroundColor: profile.avatarColor },
                    ]}
                  >
                    <Text style={styles.composerInit}>
                      {(profile.displayName || "Y").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <TextInput
                    value={composer}
                    onChangeText={setComposer}
                    placeholder={`Post to ${community.name}...`}
                    placeholderTextColor={Colors.muted}
                    style={styles.composerInput}
                    multiline
                  />
                  <Pressable
                    onPress={onSend}
                    style={[
                      styles.sendBtn,
                      composer.trim().length === 0 && { opacity: 0.4 },
                    ]}
                    disabled={composer.trim().length === 0}
                    testID="community-send"
                  >
                    <Send color={Colors.ink} size={14} strokeWidth={2.8} />
                  </Pressable>
                </View>
              ) : null}
            </View>

            {tab === "rules" ? (
              <View style={styles.rulesWrap}>
                <View style={styles.rulesHead}>
                  <Shield color={Colors.cyan} size={14} strokeWidth={2.6} />
                  <Text style={styles.rulesTitle}>Community rules</Text>
                </View>
                {community.rules.map((r, i) => (
                  <View key={r} style={styles.ruleRow}>
                    <View style={styles.ruleNum}>
                      <Text style={styles.ruleNumText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.ruleText}>{r}</Text>
                  </View>
                ))}
                <View style={styles.metaCard}>
                  <Calendar color={Colors.muted} size={12} strokeWidth={2.4} />
                  <Text style={styles.metaText}>
                    Founded by {community.ownerHandle} ·{" "}
                    {Math.floor((Date.now() - community.createdAt) / (1000 * 60 * 60 * 24))}d ago
                  </Text>
                </View>
              </View>
            ) : null}

            {tab === "members" ? (
              <View style={styles.membersWrap}>
                <Text style={styles.membersIntro}>
                  {fmtCount(community.online)} active right now
                </Text>
                <View style={styles.memberGrid}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <View key={`m${i}`} style={styles.memberCell}>
                      <View
                        style={[
                          styles.memberAvatar,
                          {
                            backgroundColor:
                              i % 3 === 0
                                ? Colors.mint
                                : i % 3 === 1
                                ? Colors.violet
                                : Colors.cyan,
                          },
                        ]}
                      >
                        <Text style={styles.memberInit}>
                          {String.fromCharCode(65 + i)}
                        </Text>
                      </View>
                      <Text style={styles.memberName} numberOfLines={1}>
                        @user{i}
                      </Text>
                      <View style={styles.memberOnline} />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          tab === "feed" ? (
            <View style={styles.emptyFeed}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: `${community.accent[0]}1A` },
                ]}
              >
                <MessageCircle color={community.accent[0]} size={24} strokeWidth={2.4} />
              </View>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyBody}>
                Be the first to start the conversation in {community.name}.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  pulse,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
  tone?: string;
  pulse?: boolean;
}) {
  const c = tone ?? Colors.text;
  return (
    <View style={styles.statBox}>
      <View style={styles.statIconRow}>
        <Icon color={c} size={11} strokeWidth={2.8} />
        <Text style={[styles.statLabel, { color: Colors.muted }]}>{label}</Text>
        {pulse ? <View style={styles.statPulse} /> : null}
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function PostRow({ post, onLike }: { post: CommunityPost; onLike: () => void }) {
  return (
    <View style={styles.post} testID={`post-${post.id}`}>
      {post.pinned ? (
        <View style={styles.pinnedTag}>
          <Pin color={Colors.orange} size={10} strokeWidth={2.8} />
          <Text style={styles.pinnedText}>PINNED</Text>
        </View>
      ) : null}
      <View style={styles.postHead}>
        <View style={[styles.postAvatar, { backgroundColor: post.authorColor }]}>
          <Text style={styles.postInit}>
            {post.authorName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postName} numberOfLines={1}>
            {post.authorName}
          </Text>
          <Text style={styles.postMeta}>
            {post.authorHandle} · {timeAgo(post.createdAt)}
          </Text>
        </View>
        {post.ticker ? (
          <View style={styles.postTicker}>
            <Text style={styles.postTickerText}>{post.ticker}</Text>
            {post.changePct != null ? (
              <Text
                style={[
                  styles.postChange,
                  {
                    color: post.changePct >= 0 ? Colors.mint : Colors.rose,
                  },
                ]}
              >
                {post.changePct >= 0 ? "+" : ""}
                {post.changePct.toFixed(1)}%
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <Text style={styles.postBody}>{post.content}</Text>
      <View style={styles.postFoot}>
        <Pressable
          onPress={onLike}
          style={styles.postAction}
          hitSlop={6}
          testID={`like-${post.id}`}
        >
          <Sparkles
            color={post.liked ? Colors.rose : Colors.muted}
            size={13}
            strokeWidth={2.6}
          />
          <Text
            style={[
              styles.postActionText,
              post.liked && { color: Colors.rose },
            ]}
          >
            {post.likes}
          </Text>
        </Pressable>
        <View style={styles.postAction}>
          <MessageCircle color={Colors.muted} size={13} strokeWidth={2.6} />
          <Text style={styles.postActionText}>{post.comments}</Text>
        </View>
        <View style={styles.postAction}>
          <ImageIcon color={Colors.muted} size={13} strokeWidth={2.6} />
          <Text style={styles.postActionText}>0</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  listContent: { paddingBottom: 140 },

  bannerWrap: { height: 200, overflow: "hidden" },
  bannerSafe: { paddingHorizontal: 18, paddingTop: 6 },
  bannerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bannerActions: { flexDirection: "row", gap: 8 },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  headInfo: { paddingHorizontal: 18, marginTop: -42 },
  headTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  avatarEmoji: { fontSize: 40 },
  joinBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  joinBtnOn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  joinText: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  name: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.6 },
  handle: { color: Colors.muted, fontSize: 13, fontWeight: "800", marginTop: 2 },
  desc: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 10,
    opacity: 0.86,
  },

  statRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  statBox: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statIconRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  statValue: { color: Colors.text, fontSize: 17, fontWeight: "900", marginTop: 6, letterSpacing: -0.4 },
  statPulse: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.mint, marginLeft: "auto" },

  tickerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginTop: 14,
  },
  tickerIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tickerLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  tickerValue: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 2 },
  tickerChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  tickerChangeText: { fontSize: 11, fontWeight: "900" },

  spacesWrap: { marginTop: 14 },
  spacesHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  spacesTitle: { color: Colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.rose },
  spacesRow: { gap: 8 },
  spaceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    maxWidth: 220,
  },
  spaceDot: { width: 6, height: 6, borderRadius: 4 },
  spaceTitle: { color: Colors.text, fontSize: 11, fontWeight: "800", flexShrink: 1 },
  spaceListeners: { color: Colors.muted, fontSize: 10, fontWeight: "800" },

  tabsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 18,
    padding: 4,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: "rgba(255,255,255,0.06)" },
  tabText: { color: Colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginTop: 14,
    marginBottom: 14,
  },
  composerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInit: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  composerInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
    minHeight: Platform.OS === "ios" ? 32 : 36,
    maxHeight: 100,
    padding: 0,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },

  sep: { height: 1, marginHorizontal: 18, backgroundColor: "rgba(255,255,255,0.04)" },
  post: { paddingHorizontal: 18, paddingVertical: 14 },
  pinnedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,184,76,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.4)",
    marginBottom: 8,
  },
  pinnedText: { color: Colors.orange, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  postInit: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  postName: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  postMeta: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  postTicker: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "flex-end",
  },
  postTickerText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  postChange: { fontSize: 10, fontWeight: "900", marginTop: 1 },
  postBody: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    marginTop: 10,
  },
  postFoot: { flexDirection: "row", gap: 18, marginTop: 12 },
  postAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  postActionText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  rulesWrap: { paddingHorizontal: 18, marginTop: 14 },
  rulesHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  rulesTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  ruleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 8,
  },
  ruleNum: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  ruleNumText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  ruleText: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  metaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginTop: 10,
  },
  metaText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

  membersWrap: { paddingHorizontal: 18, marginTop: 14 },
  membersIntro: { color: Colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 12 },
  memberGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  memberCell: { width: "22%", alignItems: "center" },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInit: { color: Colors.ink, fontSize: 18, fontWeight: "900" },
  memberName: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
    maxWidth: "100%",
  },
  memberOnline: {
    width: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: Colors.mint,
    marginTop: 3,
  },

  emptyFeed: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    alignItems: "center",
  },
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
