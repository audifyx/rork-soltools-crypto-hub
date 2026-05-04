import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { MessageCircle, Plus, RefreshCcw, Sparkles, X } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import ReelCard from "@/components/ReelCard";
import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import {
  addReelComment,
  fetchReelsFeed,
  getReelComments,
  likeReel,
  shareReel,
  unlikeReel,
  type Reel,
  type ReelComment,
} from "@/lib/api/reels";
import { useAuth } from "@/providers/auth-provider";

const EMPTY_REELS: Reel[] = [];

export default function ReelsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { height } = useWindowDimensions();
  const { userId, isAuthenticated } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [commentReel, setCommentReel] = useState<Reel | null>(null);

  const reelHeight = Math.max(620, height);

  const feedQuery = useQuery<Reel[]>({
    queryKey: ["reels", "feed", userId ?? "guest"],
    queryFn: () => fetchReelsFeed(userId, 40),
    staleTime: 20_000,
    refetchInterval: 45_000,
  });

  const reels = feedQuery.data ?? EMPTY_REELS;
  const visibleId = activeId ?? reels[0]?.id ?? null;

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 72 }), []);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<Reel>[] }) => {
    const first = viewableItems.find((item) => item.isViewable && item.item?.id);
    if (first?.item?.id) setActiveId(first.item.id);
  }).current;

  const requireAuth = useCallback((action: string): boolean => {
    if (isAuthenticated && userId) return true;
    Alert.alert("Sign in", `Sign in to ${action} reels on SolTools.`, [
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
        message: `${reel.caption || "SolTools reel"}${url ? `\n${url}` : ""}`,
        url,
        title: "SolTools Reel",
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

  const onRefresh = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    feedQuery.refetch().catch(() => {});
  }, [feedQuery]);

  const renderItem: ListRenderItem<Reel> = useCallback(({ item }) => (
    <ReelCard
      reel={item}
      active={item.id === visibleId}
      height={reelHeight}
      onLike={onLike}
      onComment={setCommentReel}
      onShare={onShare}
      onOpenAuthor={onOpenAuthor}
      onOpenToken={onOpenToken}
    />
  ), [onLike, onOpenAuthor, onOpenToken, onShare, reelHeight, visibleId]);

  return (
    <View style={styles.root} testID="reels-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <FlatList
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

      <SafeAreaView pointerEvents="box-none" edges={["top"]} style={styles.overlayTop}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>SOLTOOLS SHORTS</Text>
            <Text style={styles.title}>Reels</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={onRefresh} style={styles.iconBtn} testID="refresh-reels">
              <RefreshCcw color={Colors.text} size={17} strokeWidth={2.5} />
            </Pressable>
            <Pressable onPress={() => router.push("/upload-reel")} style={styles.uploadBtn} testID="upload-reel-btn">
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
      </SafeAreaView>

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
            renderItem={({ item }) => (
              <View style={styles.commentRow}>
                <View style={[styles.commentAvatar, { backgroundColor: item.author.avatarColor }]}>
                  <Text style={styles.commentAvatarText}>{item.author.displayName.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.commentBody}>
                  <Text style={styles.commentAuthor}>{item.author.handle}</Text>
                  <Text style={styles.commentText}>{item.body}</Text>
                </View>
              </View>
            )}
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
  overlayTop: { position: "absolute", top: 0, left: 0, right: 0 },
  header: {
    marginHorizontal: 14,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    pointerEvents: "box-none",
  },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -1.1, marginTop: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
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
  commentRow: { flexDirection: "row", gap: 10, paddingVertical: 12 },
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
