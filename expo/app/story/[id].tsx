import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Eye, Heart, MessageCircle, Send, Trash2, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import {
  addStoryComment,
  deleteStoryComment,
  getStoryEngagement,
  listActiveStories,
  listStoryComments,
  type StoryCommentRow,
  type StoryRow,
  toggleStoryLike,
  viewStory,
} from "@/lib/api/platform";
import { hapticSelect } from "@/lib/haptics";
import { useAuth } from "@/providers/auth-provider";

const STORY_DURATION = 5000;

export default function StoryViewerScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId: authUserId } = useAuth();
  const params = useLocalSearchParams<{ id?: string; userId?: string }>();
  const startId = typeof params.id === "string" ? params.id : null;
  const userId = typeof params.userId === "string" ? params.userId : null;

  const storiesQuery = useQuery<StoryRow[]>({
    queryKey: ["stories", "viewer", userId ?? "all"],
    queryFn: async () => {
      const all = await listActiveStories();
      return userId ? all.filter((s) => s.user_id === userId) : all;
    },
    staleTime: 15_000,
  });

  const stories = useMemo<StoryRow[]>(() => storiesQuery.data ?? [], [storiesQuery.data]);
  const startIndex = useMemo<number>(() => {
    const idx = stories.findIndex((s) => s.id === startId);
    return idx >= 0 ? idx : 0;
  }, [stories, startId]);

  const [index, setIndex] = useState<number>(0);
  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex]);

  const current = stories[index];

  const [commentsOpen, setCommentsOpen] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);

  const engagementQuery = useQuery({
    queryKey: ["stories", "engagement", current?.id ?? ""],
    queryFn: () => getStoryEngagement(current!.id),
    enabled: !!current?.id,
    staleTime: 5_000,
  });

  const commentsQuery = useQuery<StoryCommentRow[]>({
    queryKey: ["stories", "comments", current?.id ?? ""],
    queryFn: () => listStoryComments(current!.id),
    enabled: !!current?.id && commentsOpen,
    staleTime: 5_000,
  });

  const liked = engagementQuery.data?.liked ?? false;
  const likeCount = engagementQuery.data?.likes_count ?? current?.likes_count ?? 0;
  const commentCount = engagementQuery.data?.comments_count ?? current?.comments_count ?? 0;
  const viewCount = engagementQuery.data?.view_count ?? current?.view_count ?? 0;

  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!current) return;
    if (paused) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) {
        if (index < stories.length - 1) setIndex(index + 1);
        else router.back();
      }
    });
    void viewStory(current.id).catch(() => {});
    return () => {
      animation.stop();
    };
  }, [current, index, paused, progress, router, stories.length]);

  const goNext = useCallback(() => {
    hapticSelect();
    if (index < stories.length - 1) setIndex(index + 1);
    else router.back();
  }, [index, stories.length, router]);

  const goPrev = useCallback(() => {
    hapticSelect();
    if (index > 0) setIndex(index - 1);
  }, [index]);

  const likeMutation = useMutation({
    mutationFn: () => toggleStoryLike(current!.id),
    onMutate: async () => {
      hapticSelect();
      if (!current) return;
      const key = ["stories", "engagement", current.id];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<{ liked: boolean; likes_count: number; comments_count: number; view_count: number }>(key);
      if (prev) {
        queryClient.setQueryData(key, {
          ...prev,
          liked: !prev.liked,
          likes_count: prev.liked ? Math.max(0, prev.likes_count - 1) : prev.likes_count + 1,
        });
      }
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev && ctx.key) queryClient.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      if (current) {
        void queryClient.invalidateQueries({ queryKey: ["stories", "engagement", current.id] });
      }
    },
  });

  const openComments = useCallback(() => {
    hapticSelect();
    setPaused(true);
    setCommentsOpen(true);
  }, []);

  const closeComments = useCallback(() => {
    setCommentsOpen(false);
    setPaused(false);
  }, []);

  if (!current) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" />
        <Text style={styles.emptyText}>No stories</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="story-close-empty">
          <X color={Colors.text} size={18} strokeWidth={2.5} />
        </Pressable>
      </View>
    );
  }

  const isOwner = !!authUserId && authUserId === current.user_id;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <StatusBar style="light" />
      <ExpoImage
        source={{ uri: current.media_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={120}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.7)", "transparent", "rgba(0,0,0,0.85)"]}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.35, 1]}
      />

      <SafeAreaView edges={["top"]} style={styles.topWrap} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {stories.map((s, i) => {
            const isPast = i < index;
            const isCurrent = i === index;
            return (
              <View key={s.id} style={styles.progressSeg}>
                {isPast ? <View style={[styles.progressFill, styles.progressFillFull]} /> : null}
                {isCurrent ? (
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.avatar, { backgroundColor: current.avatar_color ?? Colors.mint }]}>
              {current.avatar_url ? (
                <ExpoImage source={{ uri: current.avatar_url }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarInit}>{(current.display_name ?? "U").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {current.display_name ?? current.username ?? "User"}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{current.username ?? "user"}
              </Text>
            </View>
          </View>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="story-close">
            <X color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
        </View>
      </SafeAreaView>

      <Pressable style={styles.leftTap} onPress={goPrev} testID="story-prev" />
      <Pressable style={styles.rightTap} onPress={goNext} testID="story-next" />

      <SafeAreaView edges={["bottom"]} style={styles.bottomWrap} pointerEvents="box-none">
        {current.caption ? (
          <Text style={styles.caption} numberOfLines={3}>
            {current.caption}
          </Text>
        ) : null}
        <View style={styles.bottomBar}>
          <Pressable
            style={styles.viewerPill}
            onPress={isOwner ? openComments : undefined}
            testID="story-views"
          >
            <Eye color={Colors.text} size={12} strokeWidth={2.6} />
            <Text style={styles.viewerText}>{viewCount}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            style={styles.iconRound}
            testID="story-react"
            onPress={() => likeMutation.mutate()}
          >
            <Heart
              color={liked ? Colors.rose : Colors.text}
              size={20}
              strokeWidth={2.5}
              fill={liked ? Colors.rose : "transparent"}
            />
            {likeCount > 0 ? <Text style={styles.iconCount}>{likeCount}</Text> : null}
          </Pressable>
          <Pressable style={styles.iconRound} testID="story-reply" onPress={openComments}>
            <MessageCircle color={Colors.text} size={20} strokeWidth={2.5} />
            {commentCount > 0 ? <Text style={styles.iconCount}>{commentCount}</Text> : null}
          </Pressable>
        </View>
      </SafeAreaView>

      <CommentsSheet
        visible={commentsOpen}
        onClose={closeComments}
        storyId={current.id}
        comments={commentsQuery.data ?? []}
        loading={commentsQuery.isLoading}
        currentUserId={authUserId}
      />
    </View>
  );
}

function CommentsSheet({
  visible,
  onClose,
  storyId,
  comments,
  loading,
  currentUserId,
}: {
  visible: boolean;
  onClose: () => void;
  storyId: string;
  comments: StoryCommentRow[];
  loading: boolean;
  currentUserId: string | null;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState<string>("");

  const addMutation = useMutation({
    mutationFn: (body: string) => addStoryComment(storyId, body),
    onSuccess: async () => {
      setText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stories", "comments", storyId] }),
        queryClient.invalidateQueries({ queryKey: ["stories", "engagement", storyId] }),
      ]);
    },
    onError: (e: unknown) => {
      Alert.alert("Could not post", e instanceof Error ? e.message : "Try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStoryComment(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stories", "comments", storyId] }),
        queryClient.invalidateQueries({ queryKey: ["stories", "engagement", storyId] }),
      ]);
    },
    onError: (e: unknown) => {
      Alert.alert("Could not delete", e instanceof Error ? e.message : "Try again.");
    },
  });

  const onSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMutation.mutate(trimmed);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetGrabber} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Comments</Text>
            <Pressable onPress={onClose} style={styles.sheetClose} testID="story-comments-close">
              <X color={Colors.text} size={16} strokeWidth={2.6} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.sheetLoading}>
              <ActivityIndicator color={Colors.mint} />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.sheetEmpty}>
              <MessageCircle color={Colors.muted} size={22} strokeWidth={2.2} />
              <Text style={styles.sheetEmptyText}>No comments yet</Text>
              <Text style={styles.sheetEmptyBody}>Be the first to reply.</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={[styles.commentAvatar, { backgroundColor: item.avatar_color ?? Colors.mint }]}>
                    {item.avatar_url ? (
                      <ExpoImage source={{ uri: item.avatar_url }} style={styles.commentAvatarImg} contentFit="cover" />
                    ) : (
                      <Text style={styles.commentAvatarInit}>
                        {(item.display_name ?? item.username ?? "U").slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.commentName} numberOfLines={1}>
                      {item.display_name ?? item.username ?? "User"}
                    </Text>
                    <Text style={styles.commentBody}>{item.body}</Text>
                  </View>
                  {currentUserId === item.user_id ? (
                    <Pressable
                      onPress={() =>
                        Alert.alert("Delete comment?", undefined, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
                        ])
                      }
                      style={styles.commentDelete}
                      testID={`story-comment-delete-${item.id}`}
                    >
                      <Trash2 color={Colors.muted} size={14} strokeWidth={2.4} />
                    </Pressable>
                  ) : null}
                </View>
              )}
            />
          )}

          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a comment…"
              placeholderTextColor={Colors.muted}
              style={styles.composerInput}
              maxLength={500}
              multiline
              editable={!!currentUserId}
            />
            <Pressable
              onPress={onSend}
              disabled={!text.trim() || addMutation.isPending || !currentUserId}
              style={[
                styles.composerSend,
                (!text.trim() || addMutation.isPending || !currentUserId) && styles.composerSendDisabled,
              ]}
              testID="story-comment-send"
            >
              {addMutation.isPending ? (
                <ActivityIndicator color={Colors.ink} />
              ) : (
                <Send color={Colors.ink} size={16} strokeWidth={2.8} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  empty: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  topWrap: { paddingHorizontal: 12, paddingTop: Platform.OS === "android" ? 6 : 0 },
  progressRow: { flexDirection: "row", gap: 4, paddingTop: 8 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#FFFFFF" },
  progressFillFull: { width: "100%" },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 12, gap: 10 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInit: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  handle: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  leftTap: { position: "absolute", left: 0, top: 100, bottom: 100, width: "30%" },
  rightTap: { position: "absolute", right: 0, top: 100, bottom: 100, width: "30%" },
  bottomWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  caption: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 6,
    marginBottom: 10,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowRadius: 8,
  },
  bottomBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 12 },
  viewerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  viewerText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  iconRound: {
    minWidth: 44,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  iconCount: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  // Comments sheet
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    maxHeight: "78%",
    minHeight: "55%",
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  sheetGrabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)", alignSelf: "center", marginBottom: 8 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 8 },
  sheetTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetLoading: { paddingVertical: 32, alignItems: "center" },
  sheetEmpty: { paddingVertical: 32, alignItems: "center", gap: 6, paddingHorizontal: 32 },
  sheetEmptyText: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  sheetEmptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  list: { paddingHorizontal: 14, paddingBottom: 8, gap: 12 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  commentAvatarImg: { width: "100%", height: "100%" },
  commentAvatarInit: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  commentName: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  commentBody: { color: Colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2, lineHeight: 18 },
  commentDelete: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  composerInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    backgroundColor: Colors.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 40,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  composerSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  composerSendDisabled: { opacity: 0.45 },
});
