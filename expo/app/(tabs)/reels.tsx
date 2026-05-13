import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Compass, Globe2, MessageCircle, Plus, RefreshCcw, Sparkles, Trash2, UserCheck, Users, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItem,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ViewToken,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import ReelCard from "@/components/ReelCard";
import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import {
  addReelComment,
  deleteReel,
  deleteReelComment,
  fetchReelsFeed,
  getReelComments,
  likeReel,
  shareReel,
  unlikeReel,
  type Reel,
  type ReelComment,
} from "@/lib/api/reels";
import { useAuth } from "@/providers/auth-provider";
import { useFollowList } from "@/providers/profile-provider";

const EMPTY_REELS: Reel[] = [];

type ReelsTab = "all" | "following" | "followers";

const FEED_TABS: { key: ReelsTab; label: string; Icon: typeof Compass }[] = [
  { key: "all", label: "All", Icon: Globe2 },
  { key: "following", label: "Following", Icon: UserCheck },
  { key: "followers", label: "Followers", Icon: Users },
];

export default function ReelsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusId = typeof params.focus === "string" ? params.focus : null;
  const queryClient = useQueryClient();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { userId, isAuthenticated } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Reel>>(null);
  const focusedRef = useRef<string | null>(null);
  const [commentReel, setCommentReel] = useState<Reel | null>(null);
  const [feedTab, setFeedTab] = useState<ReelsTab>("all");
  const [muted, setMuted] = useState<boolean>(true);

  const followingQuery = useFollowList(userId, "following");
  const followersQuery = useFollowList(userId, "followers");
  const followingIds = useMemo<Set<string>>(
    () => new Set((followingQuery.data ?? []).map((p) => p.user_id)),
    [followingQuery.data],
  );
  const followerIds = useMemo<Set<string>>(
    () => new Set((followersQuery.data ?? []).map((p) => p.user_id)),
    [followersQuery.data],
  );

  // Header (eyebrow + title + actions) ~70, tabs row ~46, progress ~12, paddings ~16
  const HEADER_BLOCK = 70 + 46 + 12 + 16;
  // Floating tab bar: height 74 + bottom inset (ios 22 / android 14) + margin 12
  const TAB_BAR_BLOCK = 74 + (Platform.OS === "ios" ? 22 : 14) + 12;
  const reelHeight = Math.max(360, height - insets.top - HEADER_BLOCK - TAB_BAR_BLOCK);

  const feedQuery = useQuery<Reel[]>({
    queryKey: ["reels", "feed", userId ?? "guest"],
    queryFn: () => fetchReelsFeed(userId, 40),
    staleTime: 20_000,
    refetchInterval: 45_000,
  });

  const allReels = feedQuery.data ?? EMPTY_REELS;
  const reels = useMemo<Reel[]>(() => {
    if (feedTab === "following") {
      if (!userId) return [];
      return allReels.filter((r) => followingIds.has(r.userId));
    }
    if (feedTab === "followers") {
      if (!userId) return [];
      return allReels.filter((r) => followerIds.has(r.userId));
    }
    return allReels;
  }, [allReels, feedTab, followerIds, followingIds, userId]);
  const visibleId = activeId ?? reels[0]?.id ?? null;
  const activeIndex = useMemo<number>(() => {
    if (!visibleId) return 0;
    const idx = reels.findIndex((r) => r.id === visibleId);
    return idx >= 0 ? idx : 0;
  }, [reels, visibleId]);

  useEffect(() => {
    if (!focusId || focusedRef.current === focusId) return;
    const idx = reels.findIndex((r) => r.id === focusId);
    if (idx < 0) return;
    focusedRef.current = focusId;
    setActiveId(focusId);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
      } catch (e) {
        console.log("[reels] focus scroll failed", e instanceof Error ? e.message : String(e));
      }
    });
  }, [focusId, reels]);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 72 }), []);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<Reel>[] }) => {
    const first = viewableItems.find((item) => item.isViewable && item.item?.id);
    if (first?.item?.id) setActiveId(first.item.id);
  }).current;

  const requireAuth = useCallback((action: string): boolean => {
    if (isAuthenticated && userId) return true;
    Alert.alert("Sign in", `Sign in to ${action} reels on Crypto Community App.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign in", onPress: () => router.push("/auth") },
    ]);
    return false;
  }, [isAuthenticated, router, userId]);

  const patchReel = useCallback((id: string, patcher: (reel: Reel) => Reel) => {
    queryClient.setQueryData<Reel[]>(["reels", "feed", userId ?? "guest"], (prev) =>
      (prev ?? []).map((reel) => (reel.id === id ? patcher(reel) : reel)),
    );
  }, [queryClient, userId]);

  const onLike = useCallback(async (reel: Reel) => {
    if (!requireAuth("like")) return;
    const nextLiked = !reel.likedByViewer;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    patchReel(reel.id, (current) => ({
      ...current,
      likedByViewer: nextLiked,
      likesCount: Math.max(0, current.likesCount + (nextLiked ? 1 : -1)),
    }));
    try {
      if (!userId) return;
      if (nextLiked) await likeReel(reel.id, userId);
      else await unlikeReel(reel.id, userId);
    } catch (e) {
      console.log("[reels] like failed", e);
      patchReel(reel.id, (current) => ({
        ...current,
        likedByViewer: reel.likedByViewer,
        likesCount: reel.likesCount,
      }));
    }
  }, [patchReel, requireAuth, userId]);

  const onShare = useCallback(async (reel: Reel) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const url = typeof reel.videoUrl === "string" ? reel.videoUrl : "";
      await Share.share({
        message: `${reel.caption || "Crypto Community App reel"}${url ? `\n${url}` : ""}`,
        url,
        title: "Crypto Community App Reel",
      });
      patchReel(reel.id, (current) => ({ ...current, sharesCount: current.sharesCount + 1 }));
      await shareReel(reel.id, userId, Platform.OS);
    } catch (e) {
      console.log("[reels] share failed", e);
    }
  }, [patchReel, userId]);

  const onOpenAuthor = useCallback((reel: Reel) => {
    const raw = typeof reel.author?.handle === "string" ? reel.author.handle : "";
    const handle = raw.replace(/^@/, "");
    if (!handle) return;
    router.push({ pathname: "/u/[handle]", params: { handle } });
  }, [router]);

  const onOpenToken = useCallback((reel: Reel) => {
    if (reel.tokenAddress) {
      router.push({ pathname: "/tool/token-lookup", params: { q: reel.tokenAddress } });
      return;
    }
    router.push({ pathname: "/(tabs)/discover", params: { q: reel.ticker ?? "" } });
  }, [router]);

  const onDelete = useCallback(async (reel: Reel) => {
    if (!userId || reel.userId !== userId) return;
    const previous = queryClient.getQueryData<Reel[]>(["reels", "feed", userId ?? "guest"]);
    queryClient.setQueryData<Reel[]>(["reels", "feed", userId ?? "guest"], (prev) =>
      (prev ?? []).filter((r) => r.id !== reel.id),
    );
    try {
      await deleteReel(reel.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await queryClient.invalidateQueries({ queryKey: ["reels", "user", reel.userId] });
    } catch (e) {
      console.log("[reels] delete failed", e);
      if (previous) queryClient.setQueryData(["reels", "feed", userId ?? "guest"], previous);
      Alert.alert("Delete failed", e instanceof Error ? e.message : "Could not delete this reel.");
    }
  }, [queryClient, userId]);

  const onRefresh = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    feedQuery.refetch().catch(() => {});
  }, [feedQuery]);

  const onToggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const renderItem: ListRenderItem<Reel> = useCallback(({ item }) => (
    <View style={styles.reelSlot}>
      <ReelCard
        reel={item}
        active={item.id === visibleId}
        height={reelHeight}
        viewerUserId={userId}
        muted={muted}
        onToggleMute={onToggleMute}
        onLike={onLike}
        onComment={setCommentReel}
        onShare={onShare}
        onOpenAuthor={onOpenAuthor}
        onOpenToken={onOpenToken}
        onDelete={onDelete}
        topInset={14}
        bottomInset={20}
        rounded
      />
    </View>
  ), [muted, onDelete, onLike, onOpenAuthor, onOpenToken, onShare, onToggleMute, reelHeight, userId, visibleId]);

  return (
    <View style={styles.root} testID="reels-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.eyebrowRow}>
              <View style={styles.liveDot} />
              <Text style={styles.eyebrow}>SOLTOOLS SHORTS</Text>
            </View>
            <Text style={styles.title}>Reels</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={onRefresh} style={styles.iconBtn} testID="refresh-reels" hitSlop={8}>
              <RefreshCcw color={Colors.text} size={16} strokeWidth={2.5} />
            </Pressable>
            <Pressable onPress={() => router.push("/upload-reel")} style={styles.uploadBtn} testID="upload-reel-btn" hitSlop={8}>
              <LinearGradient
                colors={[Colors.goldBright, Colors.silver]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.uploadGrad}
              >
                <Plus color={Colors.ink} size={18} strokeWidth={3} />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
        <View style={styles.tabsRow}>
          {FEED_TABS.map(({ key, label, Icon }) => {
            const active = feedTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setFeedTab(key);
                }}
                style={[styles.tabChip, active && styles.tabChipActive]}
                testID={`reels-tab-${key}`}
                hitSlop={6}
              >
                <Icon color={active ? Colors.ink : Colors.text} size={12} strokeWidth={2.7} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {reels.length > 0 ? (
          <View style={styles.progressTrack} pointerEvents="none">
            {reels.slice(0, Math.min(reels.length, 12)).map((r, i) => {
              const isActive = i === Math.min(activeIndex, 11);
              const isPast = i < Math.min(activeIndex, 11);
              return (
                <View
                  key={r.id}
                  style={[
                    styles.progressSeg,
                    isPast && styles.progressSegPast,
                    isActive && styles.progressSegActive,
                  ]}
                />
              );
            })}
          </View>
        ) : null}
      </SafeAreaView>

      <View style={[styles.feedWrap, { marginBottom: TAB_BAR_BLOCK }]}>
        <FlatList
          ref={listRef}
          data={reels}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={reelHeight}
          decelerationRate="fast"
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          refreshing={feedQuery.isFetching && reels.length > 0}
          onRefresh={onRefresh}
          getItemLayout={(_, index) => ({ length: reelHeight, offset: reelHeight * index, index })}
          removeClippedSubviews={Platform.OS !== "web"}
          ListEmptyComponent={
            <View style={[styles.empty, { minHeight: reelHeight }]}>
              {feedQuery.isLoading ? (
                <ActivityIndicator color={Colors.goldBright} />
              ) : (
                <>
                  <View style={styles.emptyIcon}>
                    <Sparkles color={Colors.goldBright} size={28} strokeWidth={2.8} />
                  </View>
                  <Text style={styles.emptyTitle}>No reels yet</Text>
                  <Text style={styles.emptyBody}>Upload the first short clip for token calls, chart breakdowns, and founder updates.</Text>
                  <Pressable onPress={() => router.push("/upload-reel")} style={styles.emptyBtn} testID="empty-upload-reel">
                    <Plus color={Colors.ink} size={15} strokeWidth={3} />
                    <Text style={styles.emptyBtnText}>Upload reel</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
        />
      </View>

      <CommentsSheet
        reel={commentReel}
        userId={userId}
        onClose={() => setCommentReel(null)}
        onAdded={(reelId) => patchReel(reelId, (current) => ({ ...current, commentsCount: current.commentsCount + 1 }))}
        requireAuth={requireAuth}
      />
    </View>
  );
}

function CommentsSheet({
  reel,
  userId,
  onClose,
  onAdded,
  requireAuth,
}: {
  reel: Reel | null;
  userId: string | null;
  onClose: () => void;
  onAdded: (reelId: string) => void;
  requireAuth: (action: string) => boolean;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState<string>("");
  const commentsQuery = useQuery<ReelComment[]>({
    queryKey: ["reels", "comments", reel?.id ?? "none"],
    enabled: !!reel,
    queryFn: () => getReelComments(reel?.id ?? ""),
    staleTime: 8_000,
  });
  const comments = commentsQuery.data ?? [];

  const submit = async () => {
    if (!reel || !requireAuth("comment on")) return;
    const clean = body.trim();
    if (!clean || !userId) return;
    setBody("");
    try {
      const comment = await addReelComment(reel.id, userId, clean);
      queryClient.setQueryData<ReelComment[]>(["reels", "comments", reel.id], (prev) => [...(prev ?? []), comment]);
      onAdded(reel.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.log("[reels] comment failed", e);
      Alert.alert("Comment failed", e instanceof Error ? e.message : "Try again.");
      setBody(clean);
    }
  };

  return (
    <Modal visible={!!reel} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={styles.sheetTitleRow}>
              <MessageCircle color={Colors.goldBright} size={16} strokeWidth={2.7} />
              <Text style={styles.sheetTitle}>Comments</Text>
            </View>
            <Pressable onPress={onClose} style={styles.sheetClose}>
              <X color={Colors.text} size={16} strokeWidth={2.5} />
            </Pressable>
          </View>
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.commentsList}
            ListEmptyComponent={
              <Text style={styles.noComments}>{commentsQuery.isLoading ? "Loading comments…" : "No comments yet. Start the trade thread."}</Text>
            }
            renderItem={({ item }) => {
              const ownComment = !!userId && item.userId === userId;
              const onDeleteComment = () => {
                Alert.alert("Delete comment?", undefined, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      const prev = queryClient.getQueryData<ReelComment[]>(["reels", "comments", item.reelId]);
                      queryClient.setQueryData<ReelComment[]>(
                        ["reels", "comments", item.reelId],
                        (prev ?? []).filter((c) => c.id !== item.id),
                      );
                      try {
                        await deleteReelComment(item.id);
                      } catch (e) {
                        if (prev) queryClient.setQueryData(["reels", "comments", item.reelId], prev);
                        Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again.");
                      }
                    },
                  },
                ]);
              };
              return (
                <View style={styles.commentRow}>
                  <View style={[styles.commentAvatar, { backgroundColor: item.author.avatarColor }]}>
                    <Text style={styles.commentAvatarText}>{item.author.displayName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>{item.author.handle}</Text>
                    <Text style={styles.commentText}>{item.body}</Text>
                  </View>
                  {ownComment ? (
                    <Pressable onPress={onDeleteComment} hitSlop={8} testID={`reel-comment-delete-${item.id}`} style={styles.commentDeleteBtn}>
                      <Trash2 color={Colors.muted} size={14} strokeWidth={2.4} />
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
          />
          <View style={styles.commentInputRow}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Add a comment…"
              placeholderTextColor={Colors.muted}
              style={styles.commentInput}
              multiline
              maxLength={1000}
            />
            <Pressable onPress={submit} disabled={!body.trim()} style={[styles.sendBtn, !body.trim() && styles.sendBtnDisabled]} testID="send-reel-comment">
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  headerWrap: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(244,198,91,0.14)",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  feedWrap: { flex: 1 },
  reelSlot: { paddingHorizontal: 10 },
  header: {
    marginHorizontal: 14,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.goldBright },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  tabsRow: {
    flexDirection: "row",
    gap: 7,
    marginHorizontal: 14,
    marginTop: 12,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  tabChipActive: {
    backgroundColor: Colors.goldBright,
    borderColor: "rgba(255,248,223,0.65)",
  },
  tabLabel: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
  tabLabelActive: { color: Colors.ink },
  progressTrack: {
    flexDirection: "row",
    gap: 3,
    marginHorizontal: 14,
    marginTop: 10,
    height: 2.5,
  },
  progressSeg: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 2,
  },
  progressSegPast: { backgroundColor: "rgba(244,198,91,0.55)" },
  progressSegActive: { backgroundColor: Colors.goldBright },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.46)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    overflow: "hidden",
  },
  uploadGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: "rgba(244,198,91,0.13)",
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.26)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.6 },
  emptyBody: { color: Colors.muted, textAlign: "center", fontSize: 14, lineHeight: 20, fontWeight: "700", marginTop: 8 },
  emptyBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.goldBright,
  },
  emptyBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    height: "72%",
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(244,198,91,0.22)",
    paddingTop: 10,
  },
  sheetHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.20)", marginBottom: 12 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 10 },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetTitle: { color: Colors.text, fontSize: 19, fontWeight: "900", letterSpacing: -0.4 },
  sheetClose: { width: 32, height: 32, borderRadius: 12, backgroundColor: Colors.card, alignItems: "center", justifyContent: "center" },
  commentsList: { paddingHorizontal: 18, paddingBottom: 16 },
  noComments: { color: Colors.muted, textAlign: "center", paddingVertical: 40, fontWeight: "700" },
  commentRow: { flexDirection: "row", gap: 10, paddingVertical: 12, alignItems: "flex-start" },
  commentDeleteBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  commentAvatar: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  commentAvatarText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  commentBody: { flex: 1, backgroundColor: Colors.card, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 9 },
  commentAuthor: { color: Colors.goldBright, fontSize: 11, fontWeight: "900" },
  commentText: { color: Colors.text, fontSize: 13, lineHeight: 18, fontWeight: "650", marginTop: 2 },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 14,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  commentInput: {
    flex: 1,
    maxHeight: 96,
    minHeight: 42,
    color: Colors.text,
    backgroundColor: Colors.card,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
  },
  sendBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: Colors.goldBright },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
});
