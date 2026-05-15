import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import {
  ArrowLeft,
  BadgeCheck,
  Heart,
  MessageCircle,
  Quote,
  Repeat2,
  Send,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { withDefaultAvatar } from "@/lib/brand-media";
import { hapticMedium, hapticSelect } from "@/lib/haptics";
import { normalizeMediaUrl } from "@/lib/media";
import { navigateBack } from "@/lib/navigation";
import { patchPostEverywhere } from "@/lib/post-sync";
import { createShareLink } from "@/lib/share-links";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";
import {
  type CommunityPost,
  useSocial,
} from "@/providers/social-provider";

interface FullPost {
  id: string;
  communityId: string | null;
  authorUserId: string | null;
  authorUsername: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorAvatarColor: string;
  authorVerified: boolean;
  content: string;
  imageUrl: string | null;
  ticker: string | null;
  changePct: number | null;
  likes: number;
  comments: number;
  reposts: number;
  createdAt: number;
  liked: boolean;
  reposted: boolean;
}

async function fetchPostById(postId: string, viewerId: string | null): Promise<FullPost | null> {
  const { data, error } = await supabase
    .from("community_posts")
    .select(
      "id,user_id,community_id,content,image_url,ticker,change_pct,likes_count,comments_count,reposts_count,created_at",
    )
    .eq("id", postId)
    .maybeSingle();
  if (error) {
    console.log("[post-detail] fetch failed", error.message);
    return null;
  }
  if (!data) return null;

  let author: Record<string, unknown> | null = null;
  if (data.user_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id,user_id,username,display_name,avatar_url,avatar_color,verified")
      .or(`id.eq.${data.user_id},user_id.eq.${data.user_id}`)
      .maybeSingle();
    author = (prof as Record<string, unknown> | null) ?? null;
  }

  let liked = false;
  let reposted = false;
  if (viewerId) {
    const [likeRes, repostRes] = await Promise.all([
      supabase
        .from("community_post_likes")
        .select("post_id")
        .eq("user_id", viewerId)
        .eq("post_id", postId)
        .maybeSingle(),
      supabase
        .from("community_post_reposts")
        .select("post_id")
        .eq("user_id", viewerId)
        .eq("post_id", postId)
        .maybeSingle(),
    ]);
    liked = !!likeRes.data;
    reposted = !!repostRes.data;
  }

  const authorName =
    (author?.display_name as string | undefined) ||
    (author?.username as string | undefined) ||
    "Trader";

  return {
    id: data.id as string,
    communityId: (data.community_id as string | null) ?? null,
    authorUserId: (data.user_id as string | null) ?? null,
    authorUsername: (author?.username as string | null) ?? null,
    authorName,
    authorAvatarUrl: normalizeMediaUrl(author?.avatar_url),
    authorAvatarColor: (author?.avatar_color as string | undefined) ?? Colors.mint,
    authorVerified: !!author?.verified,
    content: (data.content as string | null) ?? "",
    imageUrl: normalizeMediaUrl(data.image_url),
    ticker: (data.ticker as string | null) ?? null,
    changePct: data.change_pct != null ? Number(data.change_pct) : null,
    likes: Number(data.likes_count ?? 0),
    comments: Number(data.comments_count ?? 0),
    reposts: Number(data.reposts_count ?? 0),
    createdAt: data.created_at ? new Date(data.created_at as string).getTime() : Date.now(),
    liked,
    reposted,
  };
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function PostDetailScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = (id ?? "").toString();
  const { userId, isAuthenticated } = useAuth();
  const { profile } = useApp();
  const {
    usePostReplies,
    addPostReply,
    togglePostLike,
    togglePostRepost,
    quotePost,
    deleteCommunityPost,
  } = useSocial();

  const postQ = useQuery<FullPost | null>({
    queryKey: ["post-detail", postId, userId ?? "guest"],
    enabled: !!postId,
    staleTime: 15_000,
    queryFn: () => fetchPostById(postId, userId),
  });

  const repliesQuery = usePostReplies(postId);
  const replies = repliesQuery.data ?? [];

  const [draft, setDraft] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [quoteTarget, setQuoteTarget] = useState<CommunityPost | null>(null);
  const [quoteText, setQuoteText] = useState<string>("");
  const [quoting, setQuoting] = useState<boolean>(false);

  const post = postQ.data ?? null;

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || !post) return;
    if (!isAuthenticated) {
      Alert.alert("Sign in", "Sign in to reply.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign in", onPress: () => router.push("/auth") },
      ]);
      return;
    }
    setSending(true);
    hapticMedium();
    try {
      const targetPost: CommunityPost = {
        id: post.id,
        communityId: post.communityId ?? "",
        authorUserId: post.authorUserId,
        authorHandle: post.authorUsername ? `@${post.authorUsername}` : "",
        authorName: post.authorName,
        authorColor: post.authorAvatarColor,
        content: post.content,
        imageUrl: post.imageUrl,
        ticker: post.ticker ?? undefined,
        changePct: post.changePct ?? undefined,
        token: null,
        createdAt: post.createdAt,
        likes: post.likes,
        comments: post.comments,
        reposts: post.reposts,
        liked: post.liked,
        reposted: post.reposted,
        bookmarked: false,
      };
      await addPostReply({
        post: targetPost,
        content: text,
        authorHandle: profile.handle || "@you",
        authorName: profile.displayName || "You",
        authorColor: profile.avatarColor,
      });
      setDraft("");
      qc.setQueryData<FullPost | null>(
        ["post-detail", postId, userId ?? "guest"],
        (prev) => (prev ? { ...prev, comments: prev.comments + 1 } : prev),
      );
    } catch (e) {
      Alert.alert("Reply failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSending(false);
    }
  }, [
    draft,
    post,
    isAuthenticated,
    addPostReply,
    profile.handle,
    profile.displayName,
    profile.avatarColor,
    router,
    qc,
    postId,
    userId,
  ]);

  // Keep the post-detail query in sync with shared cache patches by re-reading
  // any in-memory updates from the broadcast patcher.
  React.useEffect(() => {
    if (!post) return;
    qc.setQueryData<FullPost | null>(
      ["post-detail", postId, userId ?? "guest"],
      (prev) => prev,
    );
  }, [post, qc, postId, userId]);

  const onLike = useCallback(async () => {
    if (!post) return;
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    hapticSelect();
    try {
      await togglePostLike(post.id);
    } catch (e) {
      console.log("[post-detail] like failed", e);
    }
  }, [post, isAuthenticated, router, togglePostLike]);

  const onRepost = useCallback(async () => {
    if (!post) return;
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    hapticSelect();
    try {
      await togglePostRepost(post.id);
    } catch (e) {
      console.log("[post-detail] repost failed", e);
    }
  }, [post, isAuthenticated, router, togglePostRepost]);

  const onShare = useCallback(async () => {
    if (!post) return;
    hapticSelect();
    const author = post.authorUsername ? `@${post.authorUsername}` : post.authorName;
    const link = await createShareLink("post", post.id, { author, communityId: post.communityId });
    const url = link.url;
    const body = `${post.content || "Check this post"}\n\n— ${author}\n${url}`;
    try {
      await Share.share({ message: body, url, title: "Share post" });
    } catch (e) {
      console.log("[post-detail] share failed", e);
      try {
        await Clipboard.setStringAsync(url);
        Alert.alert("Link copied", "Post link copied to clipboard.");
      } catch {}
    }
  }, [post]);

  const onOpenAuthor = useCallback(() => {
    if (!post?.authorUsername) return;
    router.push({ pathname: "/u/[handle]", params: { handle: post.authorUsername } });
  }, [post, router]);

  const ListHeader = useMemo(() => {
    if (!post) return null;
    const positive = (post.changePct ?? 0) >= 0;
    const accent = positive ? Colors.mint : Colors.rose;
    return (
      <View style={styles.postWrap}>
        <Pressable onPress={onOpenAuthor} style={styles.authorRow} hitSlop={6}>
          <View style={styles.avatar}>
            <ExpoImage
              source={{ uri: withDefaultAvatar(post.authorAvatarUrl) }}
              style={styles.fillImg}
              contentFit="cover"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {post.authorName}
              </Text>
              {post.authorVerified ? (
                <BadgeCheck color={Colors.cyan} size={14} strokeWidth={2.6} />
              ) : null}
            </View>
            <Text style={styles.handle} numberOfLines={1}>
              {post.authorUsername ? `@${post.authorUsername}` : ""}
              {post.authorUsername ? " · " : ""}
              {timeAgo(post.createdAt)}
            </Text>
          </View>
        </Pressable>
        {post.content ? <Text style={styles.content}>{post.content}</Text> : null}
        {post.imageUrl ? (
          <View style={styles.imageWrap}>
            <ExpoImage
              source={{ uri: post.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          </View>
        ) : null}
        {post.ticker ? (
          <View style={[styles.tickerEmbed, { borderColor: `${accent}55` }]}>
            <View style={[styles.tickerDot, { backgroundColor: accent }]} />
            <Text style={styles.tickerSym}>${post.ticker.replace("$", "")}</Text>
            {post.changePct != null ? (
              <Text style={[styles.tickerChange, { color: accent }]}>
                {positive ? "+" : ""}
                {post.changePct.toFixed(1)}%
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            <Text style={styles.statsNum}>{fmt(post.likes)}</Text> likes
          </Text>
          <Text style={styles.statsText}>
            <Text style={styles.statsNum}>{fmt(post.reposts)}</Text> reposts
          </Text>
          <Text style={styles.statsText}>
            <Text style={styles.statsNum}>{fmt(post.comments)}</Text> comments
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.action} onPress={onLike} hitSlop={6} testID="post-like">
            <Heart
              color={post.liked ? Colors.rose : Colors.muted}
              size={18}
              strokeWidth={2.4}
              fill={post.liked ? Colors.rose : "transparent"}
            />
            <Text style={[styles.actionLabel, post.liked && { color: Colors.rose }]}>Like</Text>
          </Pressable>
          <View style={styles.action}>
            <MessageCircle color={Colors.muted} size={18} strokeWidth={2.4} />
            <Text style={styles.actionLabel}>Reply</Text>
          </View>
          <Pressable style={styles.action} onPress={onRepost} hitSlop={6} testID="post-repost">
            <Repeat2
              color={post.reposted ? Colors.mint : Colors.muted}
              size={18}
              strokeWidth={2.4}
            />
            <Text style={[styles.actionLabel, post.reposted && { color: Colors.mint }]}>Repost</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={onShare} hitSlop={6} testID="post-share">
            <Share2 color={Colors.muted} size={16} strokeWidth={2.4} />
            <Text style={styles.actionLabel}>Share</Text>
          </Pressable>
        </View>

        <View style={styles.commentsHeader}>
          <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.8} />
          <Text style={styles.commentsHeaderText}>
            COMMENTS {replies.length > 0 ? `· ${replies.length}` : ""}
          </Text>
        </View>
      </View>
    );
  }, [post, onLike, onRepost, onShare, onOpenAuthor, replies.length]);

  return (
    <View style={styles.root} testID="post-detail-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <AppBackground variant="feed" />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/home")}
            style={styles.backBtn}
            hitSlop={8}
            testID="post-back"
          >
            <ArrowLeft color={Colors.text} size={22} strokeWidth={2.6} />
          </Pressable>
          <Text style={styles.topTitle}>Post</Text>
          <View style={{ width: 38 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          {postQ.isLoading && !post ? (
            <View style={styles.center}>
              <ActivityIndicator color={Colors.goldBright} />
            </View>
          ) : !post ? (
            <View style={styles.center}>
              <Text style={styles.missingTitle}>Post unavailable</Text>
              <Text style={styles.missingBody}>
                It may have been deleted or you don&apos;t have access.
              </Text>
            </View>
          ) : (
            <FlatList
              data={replies}
              keyExtractor={(c) => c.id}
              ListHeaderComponent={ListHeader}
              renderItem={({ item }) => (
                <CommentRow
                  reply={item}
                  canDelete={!!userId && item.authorUserId === userId}
                  onLike={async () => {
                    if (!isAuthenticated) {
                      router.push("/auth");
                      return;
                    }
                    hapticSelect();
                    try {
                      await togglePostLike(item.id);
                    } catch (e) {
                      console.log("[post-detail] comment like failed", e);
                    }
                  }}
                  onRepost={async () => {
                    if (!isAuthenticated) {
                      router.push("/auth");
                      return;
                    }
                    hapticSelect();
                    try {
                      await togglePostRepost(item.id);
                    } catch (e) {
                      console.log("[post-detail] comment repost failed", e);
                    }
                  }}
                  onQuote={() => {
                    if (!isAuthenticated) {
                      router.push("/auth");
                      return;
                    }
                    hapticSelect();
                    setQuoteTarget(item);
                    setQuoteText("");
                  }}
                  onShare={async () => {
                    hapticSelect();
                    const link = await createShareLink("post", item.id, { author: item.authorHandle || item.authorName, parentPostId: post.id });
                    const url = link.url;
                    const body = `${item.content || "Check this reply"}\n\n— ${item.authorHandle || item.authorName}\n${url}`;
                    try {
                      await Share.share({ message: body, url, title: "Share reply" });
                    } catch {
                      try {
                        await Clipboard.setStringAsync(url);
                        Alert.alert("Link copied", "Reply link copied to clipboard.");
                      } catch {}
                    }
                  }}
                  onReply={() => {
                    router.push({ pathname: "/post/[id]", params: { id: item.id } });
                  }}
                  onDelete={async () => {
                    try {
                      await deleteCommunityPost(item);
                      qc.setQueryData<FullPost | null>(
                        ["post-detail", postId, userId ?? "guest"],
                        (prev) => (prev ? { ...prev, comments: Math.max(0, prev.comments - 1) } : prev),
                      );
                    } catch (e) {
                      Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again.");
                    }
                  }}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
              contentContainerStyle={{ paddingBottom: 28 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.empty}>
                  <MessageCircle color={Colors.muted} size={28} strokeWidth={2.4} />
                  <Text style={styles.emptyTitle}>No comments yet</Text>
                  <Text style={styles.emptyBody}>Be the first to reply.</Text>
                </View>
              }
            />
          )}

          {quoteTarget ? (
            <View style={styles.quoteOverlay}>
              <View style={styles.quoteSheet}>
                <View style={styles.quoteSheetHeader}>
                  <View style={styles.quoteSheetTitleRow}>
                    <Quote color={Colors.goldBright} size={14} strokeWidth={2.8} />
                    <Text style={styles.quoteSheetTitle}>Quote reply</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setQuoteTarget(null);
                      setQuoteText("");
                    }}
                    hitSlop={10}
                    style={styles.quoteCloseBtn}
                    testID="quote-close"
                  >
                    <X color={Colors.text} size={16} strokeWidth={2.6} />
                  </Pressable>
                </View>
                <TextInput
                  value={quoteText}
                  onChangeText={setQuoteText}
                  placeholder="Add a comment…"
                  placeholderTextColor={Colors.muted}
                  style={styles.quoteInput}
                  multiline
                  maxLength={500}
                  testID="quote-input"
                  autoFocus
                />
                <View style={styles.quotePreview}>
                  <Text style={styles.quotePreviewName} numberOfLines={1}>
                    {quoteTarget.authorName}{" "}
                    <Text style={styles.quotePreviewHandle}>{quoteTarget.authorHandle}</Text>
                  </Text>
                  <Text style={styles.quotePreviewText} numberOfLines={3}>
                    {quoteTarget.content || ""}
                  </Text>
                </View>
                <Pressable
                  onPress={async () => {
                    const text = quoteText.trim();
                    if (!quoteTarget || quoting) return;
                    setQuoting(true);
                    hapticMedium();
                    try {
                      await quotePost({
                        post: quoteTarget,
                        content: text,
                        authorHandle: profile.handle || "@you",
                        authorName: profile.displayName || "You",
                        authorColor: profile.avatarColor,
                      });
                      setQuoteTarget(null);
                      setQuoteText("");
                    } catch (e) {
                      Alert.alert("Quote failed", e instanceof Error ? e.message : "Try again.");
                    } finally {
                      setQuoting(false);
                    }
                  }}
                  disabled={quoting}
                  style={[styles.quotePostBtn, quoting && { opacity: 0.5 }]}
                  testID="quote-submit"
                >
                  <LinearGradient
                    colors={[Colors.goldBright, Colors.mint]}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.quotePostBtnText}>{quoting ? "Posting…" : "Post quote"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.composerBar}>
            <View style={styles.composerAvatar}>
              <ExpoImage
                source={{ uri: withDefaultAvatar(profile.avatarUrl) }}
                style={styles.fillImg}
                contentFit="cover"
              />
            </View>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a reply…"
              placeholderTextColor={Colors.muted}
              style={styles.input}
              multiline
              maxLength={500}
              testID="post-reply-input"
            />
            <Pressable
              onPress={onSend}
              disabled={sending || draft.trim().length === 0}
              style={[
                styles.sendBtn,
                (sending || draft.trim().length === 0) && { opacity: 0.4 },
              ]}
              hitSlop={6}
              testID="post-reply-send"
            >
              <LinearGradient
                colors={[Colors.goldBright, Colors.mint]}
                style={StyleSheet.absoluteFill}
              />
              <Send color={Colors.ink} size={16} strokeWidth={2.8} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function CommentRow({
  reply,
  canDelete,
  onLike,
  onRepost,
  onQuote,
  onShare,
  onReply,
  onDelete,
}: {
  reply: CommunityPost;
  canDelete: boolean;
  onLike: () => void;
  onRepost: () => void;
  onQuote: () => void;
  onShare: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const handle = reply.authorHandle?.replace(/^@/, "") ?? "";
  const confirmDelete = useCallback(() => {
    hapticSelect();
    Alert.alert("Delete comment?", "This will remove your comment.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  }, [onDelete]);
  return (
    <Pressable
      style={styles.comment}
      onPress={() => router.push({ pathname: "/post/[id]", params: { id: reply.id } })}
      onLongPress={canDelete ? confirmDelete : undefined}
      testID={`comment-${reply.id}`}
    >
      <Pressable
        onPress={() => {
          if (handle) router.push({ pathname: "/u/[handle]", params: { handle } });
        }}
        hitSlop={6}
      >
        <View style={styles.commentAvatar}>
          <ExpoImage
            source={{ uri: withDefaultAvatar(reply.authorAvatarUrl) }}
            style={styles.fillImg}
            contentFit="cover"
          />
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentName} numberOfLines={1}>
            {reply.authorName}
          </Text>
          {reply.authorHandle ? (
            <Text style={styles.commentHandle} numberOfLines={1}>
              {reply.authorHandle}
            </Text>
          ) : null}
          <Text style={styles.commentDot}>·</Text>
          <Text style={styles.commentTime}>{timeAgo(reply.createdAt)}</Text>
        </View>
        {reply.content ? <Text style={styles.commentText}>{reply.content}</Text> : null}

        <View style={styles.commentActions}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onReply();
            }}
            hitSlop={8}
            style={styles.commentAction}
            testID={`comment-reply-${reply.id}`}
          >
            <MessageCircle color={Colors.muted} size={14} strokeWidth={2.4} />
            {reply.comments > 0 ? (
              <Text style={styles.commentActionLabel}>{fmt(reply.comments)}</Text>
            ) : null}
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onRepost();
            }}
            hitSlop={8}
            style={styles.commentAction}
            testID={`comment-repost-${reply.id}`}
          >
            <Repeat2
              color={reply.reposted ? Colors.mint : Colors.muted}
              size={14}
              strokeWidth={2.4}
            />
            {reply.reposts > 0 ? (
              <Text
                style={[
                  styles.commentActionLabel,
                  reply.reposted && { color: Colors.mint },
                ]}
              >
                {fmt(reply.reposts)}
              </Text>
            ) : null}
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onQuote();
            }}
            hitSlop={8}
            style={styles.commentAction}
            testID={`comment-quote-${reply.id}`}
          >
            <Quote color={Colors.muted} size={14} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onLike();
            }}
            hitSlop={8}
            style={styles.commentAction}
            testID={`comment-like-${reply.id}`}
          >
            <Heart
              color={reply.liked ? Colors.rose : Colors.muted}
              size={14}
              strokeWidth={2.4}
              fill={reply.liked ? Colors.rose : "transparent"}
            />
            {reply.likes > 0 ? (
              <Text
                style={[
                  styles.commentActionLabel,
                  reply.liked && { color: Colors.rose },
                ]}
              >
                {fmt(reply.likes)}
              </Text>
            ) : null}
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onShare();
            }}
            hitSlop={8}
            style={styles.commentAction}
            testID={`comment-share-${reply.id}`}
          >
            <Share2 color={Colors.muted} size={13} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
      {canDelete ? (
        <Pressable
          onPress={confirmDelete}
          hitSlop={10}
          style={styles.commentDeleteBtn}
          testID={`comment-delete-${reply.id}`}
        >
          <Trash2 color={Colors.muted} size={14} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  topBar: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  missingTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  missingBody: { color: Colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center" },

  postWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  fillImg: { width: "100%", height: "100%" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 },
  handle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  content: { color: Colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500", marginTop: 12 },
  imageWrap: {
    marginTop: 12,
    borderRadius: 18,
    overflow: "hidden",
    aspectRatio: 16 / 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tickerEmbed: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  tickerDot: { width: 8, height: 8, borderRadius: 4 },
  tickerSym: { color: Colors.text, fontSize: 14, fontWeight: "900", flex: 1 },
  tickerChange: { fontSize: 12, fontWeight: "900" },

  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 14,
    paddingBottom: 10,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  statsText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  statsNum: { color: Colors.text, fontWeight: "900" },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  action: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 6 },
  actionLabel: { color: Colors.muted, fontSize: 12, fontWeight: "800" },

  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 14,
    paddingBottom: 6,
  },
  commentsHeaderText: { color: Colors.goldBright, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.04)", marginHorizontal: 16 },
  comment: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  commentName: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  commentHandle: { color: Colors.muted, fontSize: 11, fontWeight: "600" },
  commentDot: { color: Colors.muted, fontSize: 11 },
  commentTime: { color: Colors.muted, fontSize: 11, fontWeight: "600" },
  commentText: { color: Colors.text, fontSize: 14, lineHeight: 19, fontWeight: "500", marginTop: 3 },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 8,
    paddingRight: 6,
  },
  commentAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  commentActionLabel: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  quoteOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  quoteSheet: {
    backgroundColor: Colors.ink,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 24 : 18,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 12,
  },
  quoteSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quoteSheetTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  quoteSheetTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  quoteCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  quoteInput: {
    minHeight: 60,
    maxHeight: 140,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  quotePreview: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.02)",
    gap: 4,
  },
  quotePreviewName: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  quotePreviewHandle: { color: Colors.muted, fontSize: 11, fontWeight: "600" },
  quotePreviewText: { color: Colors.muted, fontSize: 12, fontWeight: "500", lineHeight: 17 },
  quotePostBtn: {
    height: 44,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  quotePostBtnText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
  commentDeleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  empty: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
    gap: 8,
  },
  emptyTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", marginTop: 6 },
  emptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

  composerBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 14 : 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(3,7,8,0.92)",
  },
  composerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  composerAvatarText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
