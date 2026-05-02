import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  Bookmark,
  Calendar,
  Camera,
  Flag,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageCircle,
  MoreVertical,
  Pin,
  Trash2,
  Quote,
  Repeat2,
  Search,
  Send,
  Share2,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  ListRenderItem,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { uploadCommunityMedia } from "@/lib/upload";
import { useApp } from "@/providers/app-provider";
import { useAdmin } from "@/providers/admin-provider";
import { useAuth } from "@/providers/auth-provider";
import { CommunityPost, useSocial } from "@/providers/social-provider";

interface CommunityMember {
  id: string;
  handle: string;
  name: string;
  color: string;
}

const MEMBER_COLORS = [Colors.mint, Colors.violet, Colors.cyan, Colors.rose, Colors.orange];
function memberColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length];
}

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

type Tab = "recent" | "media" | "bookmarks" | "about";

type ComposerImage = {
  uri: string;
  base64?: string | null;
};

export default function CommunityDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getCommunity,
    isJoined,
    toggleJoin,
    postsByCommunity,
    usePostsForCommunity,
    usePostReplies,
    addCommunityPost,
    addPostReply,
    quotePost,
    deleteCommunityPost,
    reportCommunityPost,
    toggleCommunityPostPin,
    togglePostLike,
    togglePostRepost,
    togglePostBookmark,
    updateCommunityMedia,
  } = useSocial();
  const { profile } = useApp();
  const { role } = useAdmin();
  const canModeratePosts = role === "superadmin" || role === "admin" || role === "moderator";
  const { isAuthenticated, userId } = useAuth();
  const [tab, setTab] = useState<Tab>("recent");
  const [composer, setComposer] = useState<string>("");
  const [composerImage, setComposerImage] = useState<ComposerImage | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [notifyOn, setNotifyOn] = useState<boolean>(true);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<"avatar" | "banner" | null>(null);
  const [activePost, setActivePost] = useState<CommunityPost | null>(null);
  const [interactionMode, setInteractionMode] = useState<"thread" | "reply" | "quote" | null>(null);
  const [interactionText, setInteractionText] = useState<string>("");

  const community = useMemo(() => (id ? getCommunity(id) : undefined), [id, getCommunity]);
  const postsQuery = usePostsForCommunity(community?.id);
  const repliesQuery = usePostReplies(activePost?.id);
  const replies = repliesQuery.data ?? [];
  const posts = useMemo(
    () => postsQuery.data ?? (community?.id ? postsByCommunity(community.id) : []),
    [community?.id, postsByCommunity, postsQuery.data],
  );
  const mediaPosts = useMemo(
    () => posts.filter((p) => p.imageUrl || p.ticker || p.pinned),
    [posts],
  );
  const bookmarkedPosts = useMemo(
    () => posts.filter((p) => p.bookmarked),
    [posts],
  );
  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = useCallback(
    (post: CommunityPost) => {
      if (query.length === 0) return true;
      return [post.content, post.authorName, post.authorHandle, post.ticker ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    },
    [query],
  );
  const canEditMedia = useMemo(() => {
    if (!community || !isAuthenticated || !userId) return false;
    if (community.ownerId === userId) return true;
    const ownerHandle = community.ownerHandle.replace(/^@/, "").toLowerCase();
    const myHandle = profile.handle.replace(/^@/, "").toLowerCase();
    return ownerHandle.length > 0 && myHandle.length > 0 && ownerHandle === myHandle;
  }, [community, isAuthenticated, profile.handle, userId]);

  const membersQ = useQuery<CommunityMember[]>({
    queryKey: ["community", "members", community?.id ?? ""],
    enabled: !!community?.id,
    queryFn: async () => {
      if (!community?.id) return [];
      try {
        const { data, error } = await supabase
          .from("community_members")
          .select("user_id")
          .eq("community_id", community.id)
          .limit(60);
        if (error) throw error;
        const userIds = (data ?? [])
          .map((r) => r.user_id as string)
          .filter((v): v is string => !!v);
        if (userIds.length === 0) return [];
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,user_id,username,display_name,avatar_color")
          .or(`id.in.(${userIds.join(",")}),user_id.in.(${userIds.join(",")})`);
        return (profs ?? []).map((p): CommunityMember => {
          const username = (p.username as string | null) ?? "";
          const display = (p.display_name as string | null) ?? username ?? "User";
          return {
            id: ((p.user_id as string | null) ?? (p.id as string)) || username,
            handle: username ? `@${username}` : "",
            name: display || "User",
            color: (p.avatar_color as string | null) ?? memberColorFor(((p.user_id as string | null) ?? (p.id as string)) || username),
          };
        });
      } catch (e) {
        console.log("[community] members fetch failed", e);
        return [];
      }
    },
    staleTime: 30_000,
  });
  const members = membersQ.data ?? [];

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);

  const ensureSignedIn = useCallback((message: string): boolean => {
    if (isAuthenticated) return true;
    Alert.alert("Sign in", message);
    return false;
  }, [isAuthenticated]);

  const viewer = useMemo(
    () => ({
      authorHandle: profile.handle || "@you",
      authorName: profile.displayName || "You",
      authorColor: profile.avatarColor,
    }),
    [profile.avatarColor, profile.displayName, profile.handle],
  );

  const onSend = useCallback(async () => {
    const text = composer.trim();
    if (!community || (text.length === 0 && !composerImage)) return;
    if (!ensureSignedIn("Sign in to post in this community.")) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await addCommunityPost({
        communityId: community.id,
        content: text,
        imageUri: composerImage?.uri ?? null,
        imageBase64: composerImage?.base64 ?? null,
        ...viewer,
      });
      setComposer("");
      setComposerImage(null);
      setTab("recent");
    } catch (e) {
      Alert.alert("Failed to post", e instanceof Error ? e.message : "Try again.");
    }
  }, [composer, community, composerImage, ensureSignedIn, addCommunityPost, viewer]);

  const shareLink = useMemo(
    () =>
      community
        ? `https://soltools.app/community/${community.handle ?? community.id}`
        : "",
    [community],
  );

  const onShareVia = useCallback(async () => {
    setMenuOpen(false);
    if (!community) return;
    try {
      await Share.share({
        message: `Join the ${community.name} community on SolTools — ${shareLink}`,
        url: shareLink,
      });
    } catch (e) {
      console.log("[community] share failed", e);
    }
  }, [community, shareLink]);

  const onCopyLink = useCallback(async () => {
    setMenuOpen(false);
    try {
      await Clipboard.setStringAsync(shareLink);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast("Link copied");
    } catch (e) {
      console.log("[community] copy failed", e);
    }
  }, [shareLink, showToast]);

  const onInvite = useCallback(async () => {
    setMenuOpen(false);
    if (!community) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await Share.share({
        message: `Join ${community.name} on SolTools: ${shareLink}`,
        url: shareLink,
      });
    } catch (e) {
      console.log("[community] invite failed", e);
    }
  }, [community, shareLink]);

  const onToggleNotify = useCallback(() => {
    const next = !notifyOn;
    setNotifyOn(next);
    Haptics.selectionAsync().catch(() => {});
    showToast(next ? "Community alerts on" : "Community alerts off");
  }, [notifyOn, showToast]);

  const onOpenHighlights = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (mediaPosts.length > 0) {
      setTab("media");
      showToast("Showing community highlights");
      return;
    }
    setTab("about");
    showToast("Showing community details");
  }, [mediaPosts.length, showToast]);

  const onPickPostImage = useCallback(async () => {
    if (!ensureSignedIn("Sign in to add media to posts.")) return;
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo access to attach images to posts.");
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.86,
        allowsEditing: false,
        base64: true,
      });
      if (res.canceled || !res.assets[0]?.uri) return;
      const asset = res.assets[0];
      setComposerImage({ uri: asset.uri, base64: asset.base64 ?? null });
      Haptics.selectionAsync().catch(() => {});
    } catch (e) {
      console.log("[community] post media pick failed", e);
      Alert.alert("Image failed", e instanceof Error ? e.message : "Try another photo.");
    }
  }, [ensureSignedIn]);

  const onPickCommunityMedia = useCallback(
    async (kind: "avatar" | "banner") => {
      if (!community) return;
      if (!isAuthenticated) {
        Alert.alert("Sign in", "Sign in to update community images.");
        return;
      }
      if (!canEditMedia) {
        Alert.alert("Owner only", "Only the community owner can change these images.");
        return;
      }
      try {
        if (Platform.OS !== "web") {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert("Permission needed", "Allow photo access to update community images.");
            return;
          }
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.85,
          allowsEditing: true,
          aspect: kind === "avatar" ? [1, 1] : [3, 1],
          base64: true,
        });
        if (res.canceled || !res.assets[0]?.uri) return;
        const asset = res.assets[0];
        setUploadingKind(kind);
        const url = await uploadCommunityMedia(
          community.id || community.handle,
          kind,
          asset.uri,
          asset.base64 ?? null,
          asset.fileName ?? null,
          asset.mimeType ?? null,
        );
        await updateCommunityMedia(
          community.id,
          kind === "avatar" ? { avatarUrl: url } : { bannerUrl: url },
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        showToast(kind === "avatar" ? "Community image updated" : "Community banner updated");
      } catch (e) {
        console.log("[community] media upload failed", e);
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
      } finally {
        setUploadingKind(null);
      }
    },
    [canEditMedia, community, isAuthenticated, showToast, updateCommunityMedia],
  );

  const onRemoveCommunityMedia = useCallback(
    async (kind: "avatar" | "banner") => {
      if (!community || !canEditMedia) return;
      await updateCommunityMedia(
        community.id,
        kind === "avatar" ? { avatarUrl: null } : { bannerUrl: null },
      );
      showToast(kind === "avatar" ? "Community image removed" : "Community banner removed");
    },
    [canEditMedia, community, showToast, updateCommunityMedia],
  );

  const closeInteraction = useCallback(() => {
    setActivePost(null);
    setInteractionMode(null);
    setInteractionText("");
  }, []);

  const openThread = useCallback((post: CommunityPost) => {
    Haptics.selectionAsync().catch(() => {});
    setActivePost(post);
    setInteractionMode("thread");
    setInteractionText("");
  }, []);

  const openReply = useCallback((post: CommunityPost) => {
    if (!ensureSignedIn("Sign in to reply to posts.")) return;
    Haptics.selectionAsync().catch(() => {});
    setActivePost(post);
    setInteractionMode("reply");
    setInteractionText("");
  }, [ensureSignedIn]);

  const openQuote = useCallback((post: CommunityPost) => {
    if (!ensureSignedIn("Sign in to quote posts.")) return;
    Haptics.selectionAsync().catch(() => {});
    setActivePost(post);
    setInteractionMode("quote");
    setInteractionText("");
  }, [ensureSignedIn]);

  const onToggleLike = useCallback(async (post: CommunityPost) => {
    if (!ensureSignedIn("Sign in to like posts.")) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await togglePostLike(post.id);
    } catch (e) {
      Alert.alert("Like failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [ensureSignedIn, togglePostLike]);

  const onToggleRepost = useCallback(async (post: CommunityPost) => {
    if (!ensureSignedIn("Sign in to repost.")) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await togglePostRepost(post.id);
      showToast(post.reposted ? "Repost removed" : "Reposted");
    } catch (e) {
      Alert.alert("Repost failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [ensureSignedIn, showToast, togglePostRepost]);

  const onToggleBookmark = useCallback(async (post: CommunityPost) => {
    if (!ensureSignedIn("Sign in to bookmark posts.")) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await togglePostBookmark(post.id);
      showToast(post.bookmarked ? "Bookmark removed" : "Bookmarked");
    } catch (e) {
      Alert.alert("Bookmark failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [ensureSignedIn, showToast, togglePostBookmark]);

  const onReportPost = useCallback((post: CommunityPost) => {
    if (!ensureSignedIn("Sign in to report posts.")) return;
    if (post.reported) {
      showToast("Already reported");
      return;
    }
    Alert.alert("Report post?", "Moderators will review this for spam, scams, or abuse.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await reportCommunityPost(post, "reported from community screen");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              showToast("Reported to moderators");
            } catch (e) {
              Alert.alert("Report failed", e instanceof Error ? e.message : "Try again.");
            }
          })();
        },
      },
    ]);
  }, [ensureSignedIn, reportCommunityPost, showToast]);

  const onTogglePin = useCallback(async (post: CommunityPost) => {
    try {
      await toggleCommunityPostPin(post);
      showToast(post.pinned ? "Post unpinned" : "Post pinned");
    } catch (e) {
      Alert.alert("Pin failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [showToast, toggleCommunityPostPin]);

  const canDeletePost = useCallback(
    (post: CommunityPost): boolean => isAuthenticated && (canModeratePosts || post.authorUserId === userId),
    [canModeratePosts, isAuthenticated, userId],
  );

  const onSharePost = useCallback(async (post: CommunityPost) => {
    try {
      await Share.share({
        message: `${post.authorName} in ${community?.name ?? "SolTools"}: ${post.content}\n${shareLink}?post=${post.id}`,
        url: `${shareLink}?post=${post.id}`,
      });
    } catch (e) {
      console.log("[community] post share failed", e);
    }
  }, [community?.name, shareLink]);

  const onDeletePost = useCallback(
    (post: CommunityPost) => {
      if (!canDeletePost(post)) {
        Alert.alert("Not allowed", "You can only delete your own posts.");
        return;
      }
      Alert.alert(
        "Delete post?",
        canModeratePosts && post.authorUserId !== userId
          ? "This admin action permanently removes the post for everyone."
          : "This permanently removes your post from the community.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              void (async () => {
                try {
                  await deleteCommunityPost(post);
                  if (activePost?.id === post.id) closeInteraction();
                  showToast("Post deleted");
                } catch (e) {
                  Alert.alert("Delete failed", e instanceof Error ? e.message : "Try again.");
                }
              })();
            },
          },
        ],
      );
    },
    [activePost?.id, canDeletePost, canModeratePosts, closeInteraction, deleteCommunityPost, showToast, userId],
  );

  const submitInteraction = useCallback(async () => {
    const text = interactionText.trim();
    if (!activePost || text.length === 0) return;
    if (!ensureSignedIn(interactionMode === "quote" ? "Sign in to quote posts." : "Sign in to reply.")) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (interactionMode === "quote") {
        await quotePost({ post: activePost, content: text, ...viewer });
        showToast("Quote posted");
        closeInteraction();
        return;
      }
      await addPostReply({ post: activePost, content: text, ...viewer });
      setInteractionText("");
      setInteractionMode("thread");
      showToast("Reply sent");
    } catch (e) {
      Alert.alert(
        interactionMode === "quote" ? "Quote failed" : "Reply failed",
        e instanceof Error ? e.message : "Try again.",
      );
    }
  }, [activePost, addPostReply, closeInteraction, ensureSignedIn, interactionMode, interactionText, quotePost, showToast, viewer]);

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
    <PostRow
      post={item}
      onLike={() => void onToggleLike(item)}
      onComment={() => openThread(item)}
      onReply={() => openReply(item)}
      onRepost={() => void onToggleRepost(item)}
      onQuote={() => openQuote(item)}
      onBookmark={() => void onToggleBookmark(item)}
      onShare={() => void onSharePost(item)}
      onReport={() => onReportPost(item)}
      canPin={canModeratePosts}
      onPin={() => void onTogglePin(item)}
      canDelete={canDeletePost(item)}
      onDelete={() => onDeletePost(item)}
    />
  );

  const dataForTab: CommunityPost[] =
    tab === "recent"
      ? posts.filter(matchesSearch)
      : tab === "media"
        ? mediaPosts.filter(matchesSearch)
        : tab === "bookmarks"
          ? bookmarkedPosts.filter(matchesSearch)
          : [];

  return (
    <View style={styles.root} testID="community-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <FlatList
        data={dataForTab}
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
              {community.bannerUrl ? (
                <Image
                  source={{ uri: community.bannerUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : null}
              <View style={styles.bannerScrim} />
              {community.bannerUrl ? null : (
                <View style={styles.bannerEmojiWrap}>
                  <Text style={styles.bannerEmoji}>{community.iconEmoji}</Text>
                </View>
              )}
              <SafeAreaView edges={["top"]} style={styles.bannerSafe}>
                <View style={styles.bannerBar}>
                  <Pressable
                    onPress={() => router.back()}
                    style={styles.bannerIcon}
                    testID="community-back"
                  >
                    <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
                  </Pressable>
                  <View style={styles.bannerActions}>
                    <Pressable
                      style={[styles.bannerIcon, searchOpen && styles.bannerIconActive]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSearchOpen((v) => !v);
                        setTab("recent");
                      }}
                      testID="community-search"
                    >
                      <Search color={searchOpen ? Colors.mint : Colors.text} size={18} strokeWidth={2.4} />
                    </Pressable>
                    <Pressable
                      style={styles.bannerIcon}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setMenuOpen(true);
                      }}
                      testID="community-more"
                    >
                      <MoreVertical color={Colors.text} size={18} strokeWidth={2.4} />
                    </Pressable>
                  </View>
                </View>
              </SafeAreaView>
              {canEditMedia ? (
                <Pressable
                  onPress={() => onPickCommunityMedia("banner")}
                  disabled={uploadingKind !== null}
                  style={styles.editBannerBtn}
                  testID="community-edit-banner"
                >
                  {uploadingKind === "banner" ? (
                    <ActivityIndicator color={Colors.text} size="small" />
                  ) : (
                    <Camera color={Colors.text} size={14} strokeWidth={2.8} />
                  )}
                  <Text style={styles.editBannerText}>
                    {community.bannerUrl ? "Change banner" : "Add banner"}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.headInfo}>
              <View style={styles.headAvatarRow}>
                <Pressable
                  onPress={() => onPickCommunityMedia("avatar")}
                  disabled={!canEditMedia || uploadingKind !== null}
                  style={styles.headAvatar}
                  testID="community-edit-avatar"
                >
                  <LinearGradient
                    colors={[community.accent[0], community.accent[1]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {community.avatarUrl ? (
                    <Image
                      source={{ uri: community.avatarUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.headAvatarEmoji}>{community.iconEmoji}</Text>
                  )}
                  {canEditMedia ? (
                    <View style={styles.avatarCameraBadge}>
                      {uploadingKind === "avatar" ? (
                        <ActivityIndicator color={Colors.text} size="small" />
                      ) : (
                        <Camera color={Colors.text} size={12} strokeWidth={3} />
                      )}
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    toggleJoin(community.id);
                    showToast(joined ? "Left community" : "Joined community");
                  }}
                  style={[
                    styles.joinPrimary,
                    joined && styles.joinPrimaryActive,
                  ]}
                  testID="community-join-primary"
                >
                  <UserPlus
                    color={joined ? Colors.mint : Colors.ink}
                    size={14}
                    strokeWidth={3}
                  />
                  <Text
                    style={[
                      styles.joinPrimaryText,
                      joined && { color: Colors.mint },
                    ]}
                  >
                    {joined ? "Joined" : "Join community"}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {community.name}
                </Text>
                {community.verified ? (
                  <BadgeCheck color={Colors.cyan} size={20} strokeWidth={2.6} />
                ) : null}
              </View>

              <View style={styles.memberRow}>
                <Pressable
                  style={styles.memberStack}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTab("about");
                    showToast(`${fmtCount(community.members)} community members`);
                  }}
                  testID="community-members"
                >
                  {(members.length > 0 ? members.slice(0, 3) : placeholderMembers()).map(
                    (m, i) => (
                      <View
                        key={`${m.id}-${i}`}
                        style={[
                          styles.stackAvatar,
                          {
                            backgroundColor: m.color,
                            marginLeft: i === 0 ? 0 : -10,
                            zIndex: 10 - i,
                          },
                        ]}
                      >
                        <Text style={styles.stackInit}>
                          {m.name.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    ),
                  )}
                </Pressable>
                <Text style={styles.memberCount}>
                  {fmtCount(community.members)} Members
                </Text>
                <View style={styles.headIcons}>
                  <Pressable
                    style={styles.headCircle}
                    onPress={onOpenHighlights}
                    testID="community-ai"
                  >
                    <Sparkles color={tab === "media" || tab === "about" ? Colors.mint : Colors.text} size={16} strokeWidth={2.4} />
                  </Pressable>
                  <Pressable
                    style={[styles.headCircle, notifyOn && styles.headCircleActive]}
                    onPress={onToggleNotify}
                    testID="community-bell"
                  >
                    <Bell color={notifyOn ? Colors.mint : Colors.text} size={16} strokeWidth={2.4} />
                    {notifyOn ? <View style={styles.bellDot} /> : null}
                  </Pressable>
                  <Pressable
                    style={styles.headCircle}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      toggleJoin(community.id);
                      showToast(joined ? "Left community" : "Joined community");
                    }}
                    testID="community-join"
                  >
                    <UserPlus
                      color={joined ? Colors.mint : Colors.text}
                      size={16}
                      strokeWidth={2.4}
                    />
                  </Pressable>
                </View>
              </View>

              <Text style={styles.desc} numberOfLines={3}>
                {community.description ||
                  `${community.name} is the official community on SolTools.`}
              </Text>
            </View>

            {searchOpen ? (
              <View style={styles.searchBox}>
                <Search color={Colors.muted} size={15} strokeWidth={2.4} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search posts, tickers, members..."
                  placeholderTextColor={Colors.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="community-search-input"
                />
                {searchQuery.length > 0 ? (
                  <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                    <X color={Colors.muted} size={15} strokeWidth={2.6} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={styles.tabsRow}>
              <TabBtn
                label="Most Recent"
                active={tab === "recent"}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setTab("recent");
                }}
              />
              <TabBtn
                label="Media"
                active={tab === "media"}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setTab("media");
                }}
              />
              <TabBtn
                label="Saved"
                active={tab === "bookmarks"}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setTab("bookmarks");
                }}
              />
              <TabBtn
                label="About"
                active={tab === "about"}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setTab("about");
                }}
              />
            </View>

            {tab === "recent" ? (
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
                <View style={styles.composerMain}>
                  <TextInput
                    value={composer}
                    onChangeText={setComposer}
                    placeholder={`Post to ${community.name}...`}
                    placeholderTextColor={Colors.muted}
                    style={styles.composerInput}
                    multiline
                  />
                  {composerImage ? (
                    <View style={styles.composerImageWrap}>
                      <Image source={{ uri: composerImage.uri }} style={styles.composerImage} contentFit="cover" />
                      <Pressable onPress={() => setComposerImage(null)} style={styles.removeComposerImage} hitSlop={8}>
                        <X color={Colors.text} size={12} strokeWidth={3} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  onPress={onPickPostImage}
                  style={styles.attachBtn}
                  testID="community-attach-image"
                >
                  <ImageIcon color={composerImage ? Colors.mint : Colors.muted} size={15} strokeWidth={2.6} />
                </Pressable>
                <Pressable
                  onPress={onSend}
                  style={[
                    styles.sendBtn,
                    composer.trim().length === 0 && !composerImage && { opacity: 0.4 },
                  ]}
                  disabled={composer.trim().length === 0 && !composerImage}
                  testID="community-send"
                >
                  <Send color={Colors.ink} size={14} strokeWidth={2.8} />
                </Pressable>
              </View>
            ) : null}

            {tab === "about" ? (
              <View style={styles.aboutWrap}>
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutLabel}>About</Text>
                  <Text style={styles.aboutBody}>
                    {community.description || `Welcome to ${community.name}.`}
                  </Text>
                </View>
                <View style={styles.aboutGrid}>
                  <AboutStat
                    icon={Users}
                    value={fmtCount(community.members)}
                    label="Members"
                  />
                  <AboutStat
                    icon={Sparkles}
                    value={fmtCount(community.online)}
                    label="Online"
                    tint={Colors.mint}
                  />
                  <AboutStat
                    icon={MessageCircle}
                    value={fmtCount(community.posts)}
                    label="Posts"
                    tint={Colors.cyan}
                  />
                </View>
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutLabel}>Rules</Text>
                  {community.rules.length === 0 ? (
                    <Text style={styles.aboutBody}>Be respectful. No spam. Have fun.</Text>
                  ) : (
                    community.rules.map((r, i) => (
                      <View key={r} style={styles.ruleRow}>
                        <View style={styles.ruleNum}>
                          <Text style={styles.ruleNumText}>{i + 1}</Text>
                        </View>
                        <Text style={styles.ruleText}>{r}</Text>
                      </View>
                    ))
                  )}
                </View>
                <View style={styles.metaCard}>
                  <Calendar color={Colors.muted} size={12} strokeWidth={2.4} />
                  <Text style={styles.metaText}>
                    Founded by {community.ownerHandle || "@administration"} ·{" "}
                    {Math.max(
                      0,
                      Math.floor((Date.now() - community.createdAt) / (1000 * 60 * 60 * 24)),
                    )}
                    d ago
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          tab === "about" ? null : (
            <View style={styles.emptyFeed}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: `${community.accent[0]}1A` },
                ]}
              >
                {tab === "media" ? (
                  <ImageIcon color={community.accent[0]} size={24} strokeWidth={2.4} />
                ) : tab === "bookmarks" ? (
                  <Bookmark color={community.accent[0]} size={24} strokeWidth={2.4} />
                ) : (
                  <MessageCircle color={community.accent[0]} size={24} strokeWidth={2.4} />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {tab === "media" ? "No media yet" : tab === "bookmarks" ? "No saved posts" : "No posts yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {query.length > 0
                  ? "No posts matched your search."
                  : tab === "media"
                    ? `Media posts will appear here.`
                    : tab === "bookmarks"
                      ? `Bookmarked posts from ${community.name} will appear here.`
                      : `Be the first to start the conversation in ${community.name}.`}
              </Text>
            </View>
          )
        }
      />

      {/* Three-dot share menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View />
        </Pressable>
        <SafeAreaView edges={["top"]} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={styles.menuCard} pointerEvents="auto">
            {canEditMedia ? (
              <>
                <MenuItem
                  label={community.bannerUrl ? "Change banner" : "Add banner"}
                  icon={Camera}
                  onPress={() => {
                    setMenuOpen(false);
                    void onPickCommunityMedia("banner");
                  }}
                  testID="menu-banner"
                />
                <View style={styles.menuDivider} />
                <MenuItem
                  label={community.avatarUrl ? "Change image" : "Add image"}
                  icon={ImageIcon}
                  onPress={() => {
                    setMenuOpen(false);
                    void onPickCommunityMedia("avatar");
                  }}
                  testID="menu-avatar"
                />
                {community.bannerUrl ? (
                  <>
                    <View style={styles.menuDivider} />
                    <MenuItem
                      label="Remove banner"
                      icon={X}
                      onPress={() => {
                        setMenuOpen(false);
                        void onRemoveCommunityMedia("banner");
                      }}
                      testID="menu-remove-banner"
                    />
                  </>
                ) : null}
                {community.avatarUrl ? (
                  <>
                    <View style={styles.menuDivider} />
                    <MenuItem
                      label="Remove image"
                      icon={X}
                      onPress={() => {
                        setMenuOpen(false);
                        void onRemoveCommunityMedia("avatar");
                      }}
                      testID="menu-remove-avatar"
                    />
                  </>
                ) : null}
                <View style={styles.menuDivider} />
              </>
            ) : null}
            <MenuItem
              label="Share via..."
              icon={Share2}
              onPress={onShareVia}
              testID="menu-share"
            />
            <View style={styles.menuDivider} />
            <MenuItem
              label="Copy Link"
              icon={LinkIcon}
              onPress={onCopyLink}
              testID="menu-copy"
            />
            <View style={styles.menuDivider} />
            <MenuItem
              label="Invite members"
              icon={UserPlus}
              onPress={onInvite}
              testID="menu-invite"
            />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={!!activePost}
        transparent
        animationType="slide"
        onRequestClose={closeInteraction}
      >
        <View style={styles.threadBackdrop}>
          <SafeAreaView edges={["top", "bottom"]} style={styles.threadSheet}>
            <View style={styles.threadHeader}>
              <Pressable onPress={closeInteraction} style={styles.threadClose} hitSlop={8}>
                <X color={Colors.text} size={18} strokeWidth={2.6} />
              </Pressable>
              <Text style={styles.threadTitle}>
                {interactionMode === "quote" ? "Quote post" : interactionMode === "reply" ? "Reply" : "Thread"}
              </Text>
              <View style={styles.threadClose} />
            </View>

            {activePost ? (
              <FlatList
                data={interactionMode === "quote" ? [] : replies}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => (
                  <PostRow
                    post={item}
                    compact
                    onLike={() => void onToggleLike(item)}
                    onComment={() => openThread(item)}
                    onReply={() => openReply(item)}
                    onRepost={() => void onToggleRepost(item)}
                    onQuote={() => openQuote(item)}
                    onBookmark={() => void onToggleBookmark(item)}
                    onShare={() => void onSharePost(item)}
                    onReport={() => onReportPost(item)}
                    canPin={canModeratePosts}
                    onPin={() => void onTogglePin(item)}
                    canDelete={canDeletePost(item)}
                    onDelete={() => onDeletePost(item)}
                  />
                )}
                ListHeaderComponent={
                  <View>
                    <PostRow
                      post={activePost}
                      onLike={() => void onToggleLike(activePost)}
                      onComment={() => openThread(activePost)}
                      onReply={() => openReply(activePost)}
                      onRepost={() => void onToggleRepost(activePost)}
                      onQuote={() => openQuote(activePost)}
                      onBookmark={() => void onToggleBookmark(activePost)}
                      onShare={() => void onSharePost(activePost)}
                      onReport={() => onReportPost(activePost)}
                      canPin={canModeratePosts}
                      onPin={() => void onTogglePin(activePost)}
                      canDelete={canDeletePost(activePost)}
                      onDelete={() => onDeletePost(activePost)}
                    />
                    {interactionMode === "quote" ? (
                      <View style={styles.quoteComposerHint}>
                        <Quote color={Colors.mint} size={15} strokeWidth={2.6} />
                        <Text style={styles.quoteComposerText}>Add your take above the quoted post.</Text>
                      </View>
                    ) : null}
                    {interactionMode !== "quote" && repliesQuery.isLoading ? (
                      <ActivityIndicator color={Colors.mint} style={{ marginVertical: 18 }} />
                    ) : null}
                  </View>
                }
                ListEmptyComponent={
                  interactionMode === "quote" || repliesQuery.isLoading ? null : (
                    <View style={styles.threadEmpty}>
                      <MessageCircle color={Colors.muted} size={22} strokeWidth={2.4} />
                      <Text style={styles.threadEmptyText}>No replies yet. Start the thread.</Text>
                    </View>
                  )
                }
                contentContainerStyle={styles.threadList}
                showsVerticalScrollIndicator={false}
              />
            ) : null}

            {activePost ? (
              <View style={styles.threadComposer}>
                <View style={[styles.composerAvatar, { backgroundColor: profile.avatarColor }]}>
                  <Text style={styles.composerInit}>{(profile.displayName || "Y").slice(0, 1).toUpperCase()}</Text>
                </View>
                <TextInput
                  value={interactionText}
                  onChangeText={setInteractionText}
                  placeholder={interactionMode === "quote" ? "Add a quote..." : `Reply to ${activePost.authorName}...`}
                  placeholderTextColor={Colors.muted}
                  style={styles.threadInput}
                  multiline
                  autoFocus={interactionMode === "reply" || interactionMode === "quote"}
                  testID="community-interaction-input"
                />
                <Pressable
                  onPress={submitInteraction}
                  disabled={interactionText.trim().length === 0}
                  style={[styles.sendBtn, interactionText.trim().length === 0 && { opacity: 0.42 }]}
                  testID="community-interaction-send"
                >
                  <Send color={Colors.ink} size={14} strokeWidth={2.8} />
                </Pressable>
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>

      {toast ? (
        <Animated.View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
          <Pressable onPress={() => setToast(null)} hitSlop={8}>
            <X color={Colors.text} size={14} strokeWidth={2.6} />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

function placeholderMembers(): CommunityMember[] {
  return [
    { id: "p1", handle: "", name: "A", color: Colors.violet },
    { id: "p2", handle: "", name: "B", color: Colors.cyan },
    { id: "p3", handle: "", name: "C", color: Colors.mint },
  ];
}

function TabBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tabBtn} testID={`tab-${label}`}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {active ? <View style={styles.tabUnderline} /> : null}
    </Pressable>
  );
}

function MenuItem({
  label,
  icon: Icon,
  onPress,
  testID,
}: {
  label: string;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuItem} testID={testID}>
      <Text style={styles.menuItemText}>{label}</Text>
      <Icon color={Colors.text} size={18} strokeWidth={2.2} />
    </Pressable>
  );
}

function AboutStat({
  icon: Icon,
  value,
  label,
  tint,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  value: string;
  label: string;
  tint?: string;
}) {
  const c = tint ?? Colors.text;
  return (
    <View style={styles.aboutStat}>
      <Icon color={c} size={14} strokeWidth={2.6} />
      <Text style={[styles.aboutStatValue, { color: c }]}>{value}</Text>
      <Text style={styles.aboutStatLabel}>{label}</Text>
    </View>
  );
}

function PostRow({
  post,
  compact = false,
  onLike,
  onComment,
  onReply,
  onRepost,
  onQuote,
  onBookmark,
  onShare,
  onReport,
  canPin = false,
  onPin,
  canDelete = false,
  onDelete,
}: {
  post: CommunityPost;
  compact?: boolean;
  onLike: () => void;
  onComment: () => void;
  onReply: () => void;
  onRepost: () => void;
  onQuote: () => void;
  onBookmark: () => void;
  onShare: () => void;
  onReport?: () => void;
  canPin?: boolean;
  onPin?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const quote = post.quote;
  return (
    <View style={[styles.post, compact && styles.postCompact]} testID={`post-${post.id}`}>
      {post.pinned ? (
        <View style={styles.pinnedTag}>
          <Pin color={Colors.orange} size={10} strokeWidth={2.8} />
          <Text style={styles.pinnedText}>PINNED</Text>
        </View>
      ) : null}
      {post.replyTo ? (
        <Text style={styles.replyingTo}>
          Replying to {post.replyTo.authorHandle || post.replyTo.authorName}
        </Text>
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
        {canPin ? (
          <Pressable
            onPress={onPin}
            style={[styles.deletePostBtn, styles.pinPostBtn]}
            hitSlop={8}
            testID={`pin-post-${post.id}`}
          >
            <Pin color={post.pinned ? Colors.orange : Colors.muted} size={14} strokeWidth={2.6} />
          </Pressable>
        ) : null}
        {canDelete ? (
          <Pressable
            onPress={onDelete}
            style={styles.deletePostBtn}
            hitSlop={8}
            testID={`delete-post-${post.id}`}
          >
            <Trash2 color={Colors.rose} size={14} strokeWidth={2.6} />
          </Pressable>
        ) : null}
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
      {post.content.length > 0 ? <Text style={styles.postBody}>{post.content}</Text> : null}
      {post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={styles.postImage} contentFit="cover" />
      ) : null}
      {quote ? (
        <View style={styles.quoteCard}>
          <View style={styles.quoteTop}>
            <Quote color={Colors.mint} size={13} strokeWidth={2.6} />
            <Text style={styles.quoteAuthor} numberOfLines={1}>
              {quote.authorName} {quote.authorHandle ? `· ${quote.authorHandle}` : ""}
            </Text>
            {quote.createdAt ? <Text style={styles.quoteTime}>· {timeAgo(quote.createdAt)}</Text> : null}
          </View>
          {quote.content ? <Text style={styles.quoteBody} numberOfLines={4}>{quote.content}</Text> : null}
          {quote.imageUrl ? <Image source={{ uri: quote.imageUrl }} style={styles.quoteImage} contentFit="cover" /> : null}
          {quote.ticker ? <Text style={styles.quoteTicker}>{quote.ticker}</Text> : null}
        </View>
      ) : null}
      <View style={styles.postFoot}>
        <Pressable
          onPress={onComment}
          style={styles.postAction}
          hitSlop={6}
          testID={`comment-${post.id}`}
        >
          <MessageCircle color={Colors.muted} size={14} strokeWidth={2.5} />
          <Text style={styles.postActionText}>{fmtCount(post.comments)}</Text>
        </Pressable>
        <Pressable
          onPress={onRepost}
          style={styles.postAction}
          hitSlop={6}
          testID={`repost-${post.id}`}
        >
          <Repeat2 color={post.reposted ? Colors.mint : Colors.muted} size={14} strokeWidth={2.5} />
          <Text style={[styles.postActionText, post.reposted && { color: Colors.mint }]}>
            {fmtCount(post.reposts)}
          </Text>
        </Pressable>
        <Pressable
          onPress={onLike}
          style={styles.postAction}
          hitSlop={6}
          testID={`like-${post.id}`}
        >
          <Heart
            color={post.liked ? Colors.rose : Colors.muted}
            fill={post.liked ? Colors.rose : "transparent"}
            size={14}
            strokeWidth={2.5}
          />
          <Text style={[styles.postActionText, post.liked && { color: Colors.rose }]}>
            {fmtCount(post.likes)}
          </Text>
        </Pressable>
        <Pressable onPress={onReply} style={styles.iconAction} hitSlop={6} testID={`reply-${post.id}`}>
          <Send color={Colors.muted} size={13} strokeWidth={2.5} />
        </Pressable>
        <Pressable onPress={onQuote} style={styles.iconAction} hitSlop={6} testID={`quote-${post.id}`}>
          <Quote color={Colors.muted} size={14} strokeWidth={2.5} />
        </Pressable>
        <Pressable onPress={onBookmark} style={styles.iconAction} hitSlop={6} testID={`bookmark-${post.id}`}>
          <Bookmark
            color={post.bookmarked ? Colors.orange : Colors.muted}
            fill={post.bookmarked ? Colors.orange : "transparent"}
            size={14}
            strokeWidth={2.5}
          />
        </Pressable>
        {onReport ? (
          <Pressable onPress={onReport} style={styles.iconAction} hitSlop={6} testID={`report-post-${post.id}`}>
            <Flag color={post.reported ? Colors.rose : Colors.muted} size={14} strokeWidth={2.5} />
          </Pressable>
        ) : null}
        <Pressable onPress={onShare} style={styles.iconAction} hitSlop={6} testID={`share-post-${post.id}`}>
          <Share2 color={Colors.muted} size={14} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  listContent: { paddingBottom: 140 },

  bannerWrap: { height: 240, overflow: "hidden" },
  headAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: -34,
    marginBottom: 8,
  },
  headAvatar: {
    width: 72,
    height: 72,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.ink,
  },
  headAvatarEmoji: { fontSize: 36 },
  avatarCameraBadge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  joinPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.mint,
    marginLeft: "auto",
  },
  joinPrimaryActive: {
    backgroundColor: "rgba(85,245,178,0.14)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
  },
  joinPrimaryText: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  bannerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  bannerEmojiWrap: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerEmoji: { fontSize: 110, opacity: 0.7 },
  bannerSafe: { paddingHorizontal: 14, paddingTop: 6 },
  bannerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bannerActions: { flexDirection: "row", gap: 10 },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerIconActive: {
    borderColor: "rgba(85,245,178,0.55)",
    backgroundColor: "rgba(85,245,178,0.12)",
  },
  editBannerBtn: {
    position: "absolute",
    left: 18,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  editBannerText: { color: Colors.text, fontSize: 12, fontWeight: "900" },

  headInfo: { paddingHorizontal: 18, marginTop: 14 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  memberStack: { flexDirection: "row", alignItems: "center" },
  stackAvatar: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  stackInit: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  memberCount: { color: Colors.muted, fontSize: 13, fontWeight: "700", flex: 1 },
  headIcons: { flexDirection: "row", gap: 8 },
  headCircle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headCircleActive: {
    borderColor: "rgba(85,245,178,0.5)",
    backgroundColor: "rgba(85,245,178,0.08)",
  },
  bellDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: Colors.mint,
  },

  desc: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    marginTop: 14,
    opacity: 0.85,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    padding: 0,
  },

  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 0,
    marginTop: 22,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: { color: Colors.muted, fontSize: 14, fontWeight: "700" },
  tabTextActive: { color: Colors.text, fontWeight: "900" },
  tabUnderline: {
    position: "absolute",
    left: "20%",
    right: "20%",
    bottom: -1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#3D7DFF",
  },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginTop: 14,
    marginHorizontal: 18,
  },
  composerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInit: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  composerMain: {
    flex: 1,
    gap: 8,
  },
  composerInput: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
    minHeight: Platform.OS === "ios" ? 32 : 36,
    maxHeight: 100,
    padding: 0,
  },
  composerImageWrap: {
    width: 116,
    height: 92,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  composerImage: { width: "100%", height: "100%" },
  removeComposerImage: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
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
  postCompact: { paddingHorizontal: 14, paddingVertical: 12 },
  replyingTo: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 8,
  },
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
  deletePostBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,75,110,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,75,110,0.18)",
  },
  pinPostBtn: {
    backgroundColor: "rgba(255,184,76,0.08)",
    borderColor: "rgba(255,184,76,0.18)",
  },
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
  postImage: {
    width: "100%",
    height: 190,
    borderRadius: 18,
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  quoteCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
  },
  quoteTop: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 7 },
  quoteAuthor: { color: Colors.text, fontSize: 11, fontWeight: "900", flexShrink: 1 },
  quoteTime: { color: Colors.muted, fontSize: 10, fontWeight: "700" },
  quoteBody: { color: Colors.text, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  quoteImage: {
    width: "100%",
    height: 112,
    borderRadius: 12,
    marginTop: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  quoteTicker: {
    alignSelf: "flex-start",
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 8,
  },
  postFoot: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" },
  postAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  iconAction: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  postActionText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  threadBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  threadSheet: {
    height: "88%",
    backgroundColor: Colors.ink,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  threadHeader: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  threadClose: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  threadTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  threadList: { paddingBottom: 110 },
  threadEmpty: { alignItems: "center", gap: 8, paddingVertical: 30 },
  threadEmptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  threadComposer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: "rgba(9,14,16,0.98)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  threadInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    minHeight: 34,
    maxHeight: 110,
    padding: 0,
  },
  quoteComposerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(85,245,178,0.08)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
  },
  quoteComposerText: { color: Colors.text, fontSize: 12, fontWeight: "800" },

  aboutWrap: { paddingHorizontal: 18, marginTop: 14, gap: 10 },
  aboutCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  aboutLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  aboutBody: { color: Colors.text, fontSize: 13, fontWeight: "500", lineHeight: 19 },
  aboutGrid: { flexDirection: "row", gap: 10 },
  aboutStat: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "flex-start",
    gap: 4,
  },
  aboutStatValue: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  aboutStatLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  ruleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 8 },
  ruleNum: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  ruleNumText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  ruleText: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "500", lineHeight: 19 },
  metaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  metaText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

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

  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  menuCard: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 56,
    right: 14,
    width: 240,
    borderRadius: 16,
    backgroundColor: "#0E1416",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemText: { color: Colors.text, fontSize: 15, fontWeight: "600" },
  menuDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)" },

  toast: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(20,28,30,0.95)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  toastText: { color: Colors.text, fontSize: 13, fontWeight: "700" },
});
