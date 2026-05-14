import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  Bookmark,
  Calendar,
  Trash2,
  Ban,
  UserMinus,
  Camera,
  ChartCandlestick,
  Copy,
  Flag,
  Hash,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageCircle,
  MoreVertical,
  Pin,
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
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import DexChart from "@/components/DexChart";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import {
  extractFirstSolanaAddress,
  scanCommunityToken,
  type CommunityTokenCard,
} from "@/lib/community-token";
import { verifyHolder } from "@/lib/holder-verify";
import { SOLTOOLS_TOKEN_MINT } from "@/lib/badge-system";
import { deleteOwnCommunity } from "@/lib/api/platform";
import { supabase } from "@/lib/supabase";
import { uploadCommunityMedia } from "@/lib/upload";
import { useApp } from "@/providers/app-provider";
import { useAdmin } from "@/providers/admin-provider";
import { useAuth } from "@/providers/auth-provider";
import { useProfileProvider } from "@/providers/profile-provider";
import { CommunityPost, useSocial } from "@/providers/social-provider";
import { useCommunityAccess } from "@/providers/community-access-provider";
import type { CommunityAccessType } from "@/lib/community-access";
import { KeyRound, Lock as LockIcon, Globe, UserCheck, ShieldCheck, Coins } from "lucide-react-native";

interface CommunityMember {
  id: string;
  handle: string;
  username: string | null;
  name: string;
  color: string;
  avatarUrl?: string | null;
  verified?: boolean;
  followersCount?: number;
  isFollowing?: boolean;
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

function fmtUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (value >= 1) return `${value.toFixed(2)}`;
  if (value > 0) return `${value.toPrecision(3)}`;
  return "$0";
}

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
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
  const featureQueryClient = useQueryClient();
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
  const { toggleFollow, isToggling } = useProfileProvider();
  const {
    getConfig: getAccessConfig,
    submitJoinRequest,
    approveRequest,
    rejectRequest,
    verifyPasscode,
    isRequestPending,
    markApproved,
    removeMember: removeAccessMember,
    banMember,
    unbanMember,
    isBanned,
  } = useCommunityAccess();
  const [tab, setTab] = useState<Tab>("recent");
  const [composer, setComposer] = useState<string>("");
  const [composerImage, setComposerImage] = useState<ComposerImage | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [notifyOn, setNotifyOn] = useState<boolean>(true);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [membersOpen, setMembersOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<"avatar" | "banner" | null>(null);
  const [activePost, setActivePost] = useState<CommunityPost | null>(null);
  const [interactionMode, setInteractionMode] = useState<"thread" | "reply" | "quote" | null>(null);
  const [interactionText, setInteractionText] = useState<string>("");
  const [activeChartToken, setActiveChartToken] = useState<CommunityTokenCard | null>(null);
  const [holderGateOpen, setHolderGateOpen] = useState<boolean>(false);
  const [holderGateAddress, setHolderGateAddress] = useState<string>("");
  const [holderGateScanning, setHolderGateScanning] = useState<boolean>(false);
  const [holderGateError, setHolderGateError] = useState<string | null>(null);
  const [holderGateBalance, setHolderGateBalance] = useState<number | null>(null);
  const [passcodeOpen, setPasscodeOpen] = useState<boolean>(false);
  const [passcodeInput, setPasscodeInput] = useState<string>("");
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [requestsOpen, setRequestsOpen] = useState<boolean>(false);
  const [gatePasscodeInput, setGatePasscodeInput] = useState<string>("");
  const [gatePasscodeError, setGatePasscodeError] = useState<string | null>(null);

  const community = useMemo(() => (id ? getCommunity(id) : undefined), [id, getCommunity]);
  const postsQuery = usePostsForCommunity(community?.id);
  const repliesQuery = usePostReplies(activePost?.id);
  const replies = repliesQuery.data ?? [];
  const posts = useMemo(
    () => postsQuery.data ?? (community?.id ? postsByCommunity(community.id) : []),
    [community?.id, postsByCommunity, postsQuery.data],
  );
  const mediaPosts = useMemo(
    () => posts.filter((p) => p.imageUrl || p.token || p.ticker || p.pinned),
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
      return [
        post.content,
        post.authorName,
        post.authorHandle,
        post.ticker ?? "",
        post.token?.address ?? "",
        post.token?.name ?? "",
        post.token?.symbol ?? "",
      ]
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
    queryKey: ["community", "members", community?.id ?? "", userId ?? "guest"],
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
          .select("id,user_id,username,display_name,avatar_url,avatar_color,verified,followers_count")
          .or(`id.in.(${userIds.join(",")}),user_id.in.(${userIds.join(",")})`);
        const normalizedProfiles = (profs ?? []).map((p) => ({
          row: p,
          id: ((p.user_id as string | null) ?? (p.id as string)) || ((p.username as string | null) ?? ""),
        }));
        const followees = new Set<string>();
        if (userId && normalizedProfiles.length > 0) {
          const targetIds = normalizedProfiles.map((p) => p.id).filter((target) => target && target !== userId);
          if (targetIds.length > 0) {
            const { data: followRows, error: followError } = await supabase
              .from("followers")
              .select("followee_id")
              .eq("follower_id", userId)
              .in("followee_id", targetIds);
            if (!followError) {
              (followRows ?? []).forEach((row) => {
                const followeeId = String(row.followee_id ?? "");
                if (followeeId) followees.add(followeeId);
              });
            }
          }
        }
        return normalizedProfiles.map(({ row: p, id: memberId }): CommunityMember => {
          const username = (p.username as string | null) ?? "";
          const display = (p.display_name as string | null) ?? username ?? "User";
          return {
            id: memberId,
            handle: username ? `@${username}` : "",
            username: username || null,
            name: display || "User",
            color: (p.avatar_color as string | null) ?? memberColorFor(memberId || username),
            avatarUrl: (p.avatar_url as string | null) ?? null,
            verified: !!p.verified,
            followersCount: Number(p.followers_count ?? 0),
            isFollowing: followees.has(memberId),
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

  const detectedTokenAddress = useMemo(() => extractFirstSolanaAddress(composer), [composer]);
  const tokenPreviewQ = useQuery<CommunityTokenCard | null>({
    queryKey: ["community", "token-preview", detectedTokenAddress ?? ""],
    enabled: !!detectedTokenAddress,
    queryFn: async () => (detectedTokenAddress ? scanCommunityToken(detectedTokenAddress) : null),
    staleTime: 60_000,
    retry: 1,
  });
  const tokenPreview = tokenPreviewQ.data ?? null;

  const openTokenChart = useCallback((token: CommunityTokenCard) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveChartToken(token);
  }, []);

  const copyTokenAddress = useCallback(async (address: string) => {
    try {
      await Clipboard.setStringAsync(address);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast("Token CA copied");
    } catch (e) {
      console.log("[community] token copy failed", e);
    }
  }, [showToast]);

  const onSend = useCallback(async () => {
    const text = composer.trim();
    if (!community || (text.length === 0 && !composerImage)) return;
    if (!ensureSignedIn("Sign in to post in this community.")) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      let token = tokenPreview;
      if (detectedTokenAddress && (!token || token.address !== detectedTokenAddress)) {
        token = await scanCommunityToken(detectedTokenAddress, { persist: true });
      } else if (token) {
        token = await scanCommunityToken(token.address, { persist: true }).catch(() => token);
      }
      await addCommunityPost({
        communityId: community.id,
        content: text,
        imageUri: composerImage?.uri ?? null,
        imageBase64: composerImage?.base64 ?? null,
        token,
        ...viewer,
      });
      setComposer("");
      setComposerImage(null);
      setTab("recent");
    } catch (e) {
      Alert.alert("Failed to post", e instanceof Error ? e.message : "Try again.");
    }
  }, [composer, community, composerImage, detectedTokenAddress, ensureSignedIn, addCommunityPost, tokenPreview, viewer]);

  const shareLink = useMemo(
    () =>
      community
        ? `https://ogscan.fun/community/${community.handle ?? community.id}`
        : "",
    [community],
  );

  const onShareVia = useCallback(async () => {
    setMenuOpen(false);
    if (!community) return;
    try {
      await Share.share({
        message: `Join the ${community.name} community on Crypto Community App — ${shareLink}`,
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
        message: `Join ${community.name} on Crypto Community App: ${shareLink}`,
        url: shareLink,
      });
    } catch (e) {
      console.log("[community] invite failed", e);
    }
  }, [community, shareLink]);

  const isOwner = !!community && !!userId && community.ownerId === userId;

  const deleteCommunityMut = useMutation({
    mutationFn: async (cid: string) => {
      await deleteOwnCommunity(cid);
    },
    onSuccess: () => {
      featureQueryClient.invalidateQueries({ queryKey: ["social", "communities"] });
      navigateBack(router);
    },
    onError: (e: unknown) => {
      Alert.alert("Could not delete", e instanceof Error ? e.message : "Try again.");
    },
  });

  const onDeleteCommunity = useCallback(() => {
    if (!community) return;
    setMenuOpen(false);
    Alert.alert(
      `Delete ${community.name}?`,
      "This permanently removes the community, its posts, and member list.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCommunityMut.mutate(community.id),
        },
      ],
    );
  }, [community, deleteCommunityMut, router]);

  const openMemberProfile = useCallback((member: CommunityMember) => {
    const username = (member.username ?? member.handle).replace(/^@/, "").trim();
    if (!username) return;
    setMembersOpen(false);
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/u/[handle]", params: { handle: username } });
  }, [router]);

  const onFollowMember = useCallback(async (member: CommunityMember) => {
    if (!ensureSignedIn("Sign in to follow community members.")) return;
    if (member.id === userId) return;
    // Optimistic flip happens inside toggleFollow's onMutate so the button stays
    // "pushed in" the moment it's tapped. Avoid eager invalidation here — it
    // forces a refetch that races with the optimistic update and visually
    // "unactivates" the Follow button.
    try {
      await toggleFollow(member.id);
      showToast(`${member.isFollowing ? "Unfollowed" : "Following"} ${member.handle || member.name}`);
    } catch (e) {
      Alert.alert("Follow failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [ensureSignedIn, showToast, toggleFollow, userId]);

  const accessConfig = useMemo(
    () => (community ? getAccessConfig(community.id) : null),
    [community, getAccessConfig],
  );
  const effectiveAccessType: CommunityAccessType = useMemo(() => {
    if (!community) return "public";
    // Prefer server-stored access_type so passcode/request/holder gates persist
    // across devices and cache clears. Fall back to local config + legacy flags.
    const server = community.accessType;
    if (server && server !== "public") return server;
    if (accessConfig && accessConfig.accessType !== "public") return accessConfig.accessType;
    if (community.holderOnly) return "holders";
    if (community.isPrivate) return "request";
    return "public";
  }, [accessConfig, community]);
  const pendingForMe = community && userId
    ? isRequestPending(community.id, userId)
    : false;

  const requestJoin = useCallback(
    (community_id: string) => {
      if (!ensureSignedIn("Sign in to join communities.")) return;
      const c = community;
      if (!c) return;
      const alreadyJoined = isJoined(community_id);
      if (userId && isBanned(community_id, userId)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert("Banned", "You have been banned from this community by the creator.");
        return;
      }
      if (alreadyJoined) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        toggleJoin(community_id);
        showToast("Left community");
        return;
      }
      if (effectiveAccessType === "holders") {
        Haptics.selectionAsync().catch(() => {});
        setHolderGateAddress(profile.walletAddress || "");
        setHolderGateError(null);
        setHolderGateBalance(null);
        setHolderGateOpen(true);
        return;
      }
      if (effectiveAccessType === "passcode") {
        Haptics.selectionAsync().catch(() => {});
        setPasscodeInput("");
        setPasscodeError(null);
        setPasscodeOpen(true);
        return;
      }
      if (effectiveAccessType === "request") {
        Haptics.selectionAsync().catch(() => {});
        if (!userId) return;
        if (isRequestPending(community_id, userId)) {
          showToast("Request already pending");
          return;
        }
        submitJoinRequest(community_id, {
          userId,
          handle: profile.handle || "@you",
          name: profile.displayName || "Member",
          avatarColor: profile.avatarColor,
        });
        // Server-side: insert a join request via the RPC.
        void supabase
          .rpc("join_community", { p_community_id: community_id, p_passcode: null })
          .then(({ error }) => {
            if (error) console.log("[community] request rpc failed", error.message);
          });
        showToast("Request sent — waiting for owner approval");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      toggleJoin(community_id);
      showToast("Joined community");
    },
    [
      community,
      effectiveAccessType,
      ensureSignedIn,
      isJoined,
      isRequestPending,
      profile.avatarColor,
      profile.displayName,
      profile.handle,
      profile.walletAddress,
      showToast,
      submitJoinRequest,
      toggleJoin,
      userId,
    ],
  );

  const onSubmitPasscode = useCallback(async () => {
    if (!community) return;
    const code = passcodeInput.trim();
    if (code.length === 0) {
      setPasscodeError("Enter the community passcode.");
      return;
    }
    try {
      const { data, error } = await supabase.rpc("join_community", {
        p_community_id: community.id,
        p_passcode: code,
      });
      if (error) {
        // Fall back to local verification when the server RPC isn't deployed.
        if (verifyPasscode(community.id, code)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (userId) markApproved(community.id, userId);
          if (!isJoined(community.id)) toggleJoin(community.id);
          setPasscodeOpen(false);
          setPasscodeInput("");
          showToast("Passcode accepted — joined community");
          return;
        }
        setPasscodeError("Incorrect passcode. Try again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const status = (row?.status as string | undefined) ?? "joined";
      if (status === "joined" || status === "already_member") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (userId) markApproved(community.id, userId);
        if (!isJoined(community.id)) toggleJoin(community.id);
        setPasscodeOpen(false);
        setPasscodeInput("");
        showToast("Passcode accepted — joined community");
        return;
      }
      if (status === "wrong_passcode" || status === "passcode_required") {
        setPasscodeError("Incorrect passcode. Try again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
      }
      if (status === "banned") {
        setPasscodeError("You are banned from this community.");
        return;
      }
      setPasscodeError("Could not join right now. Try again.");
    } catch (e) {
      console.log("[community] passcode join failed", e);
      setPasscodeError("Network error. Try again.");
    }
  }, [community, isJoined, markApproved, passcodeInput, showToast, toggleJoin, userId, verifyPasscode]);

  const removeFromMembersTable = useCallback(async (uid: string) => {
    if (!community) return;
    try {
      await supabase
        .from("community_members")
        .delete()
        .eq("community_id", community.id)
        .eq("user_id", uid);
    } catch (e) {
      console.log("[community] remove member db failed", e);
    }
  }, [community]);

  const onKickMember = useCallback(
    (member: CommunityMember) => {
      if (!community || !isOwner) return;
      Alert.alert(
        `Remove ${member.name}?`,
        "They will be removed from the community but can rejoin if the community is public.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              removeAccessMember(community.id, member.id);
              void removeFromMembersTable(member.id).then(() => {
                featureQueryClient.invalidateQueries({ queryKey: ["community", "members", community.id] });
              });
              showToast(`${member.name} removed`);
            },
          },
        ],
      );
    },
    [community, featureQueryClient, isOwner, removeAccessMember, removeFromMembersTable, showToast],
  );

  const onBanMember = useCallback(
    (member: CommunityMember) => {
      if (!community || !isOwner) return;
      const banned = isBanned(community.id, member.id);
      if (banned) {
        unbanMember(community.id, member.id);
        Haptics.selectionAsync().catch(() => {});
        showToast(`${member.name} unbanned`);
        return;
      }
      Alert.alert(
        `Ban ${member.name}?`,
        "They will be removed and blocked from rejoining this community.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Ban",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              banMember(community.id, member.id);
              void removeFromMembersTable(member.id).then(() => {
                featureQueryClient.invalidateQueries({ queryKey: ["community", "members", community.id] });
              });
              showToast(`${member.name} banned`);
            },
          },
        ],
      );
    },
    [banMember, community, featureQueryClient, isBanned, isOwner, removeFromMembersTable, showToast, unbanMember],
  );

  const onApproveRequest = useCallback(
    (uid: string) => {
      if (!community) return;
      approveRequest(community.id, uid);
      void supabase
        .rpc("approve_join_request", { p_community_id: community.id, p_user_id: uid })
        .then(({ error }) => {
          if (error) console.log("[community] approve rpc failed", error.message);
        });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast("Request approved");
    },
    [approveRequest, community, showToast],
  );

  const onRejectRequest = useCallback(
    (uid: string) => {
      if (!community) return;
      rejectRequest(community.id, uid);
      void supabase
        .rpc("reject_join_request", { p_community_id: community.id, p_user_id: uid })
        .then(({ error }) => {
          if (error) console.log("[community] reject rpc failed", error.message);
        });
      Haptics.selectionAsync().catch(() => {});
      showToast("Request declined");
    },
    [community, rejectRequest, showToast],
  );

  const onVerifyAndJoin = useCallback(async () => {
    if (!community) return;
    const mint = community.gateTokenMint || SOLTOOLS_TOKEN_MINT;
    const required = Math.max(1, Number(community.gateMinimumBalance ?? 1));
    setHolderGateScanning(true);
    setHolderGateError(null);
    setHolderGateBalance(null);
    try {
      const res = await verifyHolder(holderGateAddress.trim(), mint, required);
      setHolderGateBalance(res.balance);
      if (!res.ok) {
        setHolderGateError(res.reason ?? "Wallet does not meet the holder requirement.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (userId) markApproved(community.id, userId);
      try {
        await supabase.rpc("join_community_as_holder", { p_community_id: community.id });
      } catch (rpcErr) {
        console.log("[community] holder join rpc failed (will rely on local)", rpcErr);
      }
      if (!isJoined(community.id)) toggleJoin(community.id);
      setHolderGateOpen(false);
      showToast("Holder verified — joined community");
    } catch (e) {
      console.log("[community] holder verify failed", e);
      setHolderGateError(e instanceof Error ? e.message : "Wallet scan failed.");
    } finally {
      setHolderGateScanning(false);
    }
  }, [community, holderGateAddress, isJoined, markApproved, showToast, toggleJoin, userId]);

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
    (post: CommunityPost): boolean =>
      isAuthenticated &&
      (canModeratePosts || isOwner || post.authorUserId === userId),
    [canModeratePosts, isAuthenticated, isOwner, userId],
  );

  const onSharePost = useCallback(async (post: CommunityPost) => {
    try {
      await Share.share({
        message: `${post.authorName} in ${community?.name ?? "Crypto Community App"}: ${post.content}\n${shareLink}?post=${post.id}`,
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

  const onSubmitGatePasscode = useCallback(() => {
    if (!community) return;
    const ok = verifyPasscode(community.id, gatePasscodeInput);
    if (!ok) {
      setGatePasscodeError("Incorrect passcode. Try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (userId) markApproved(community.id, userId);
    if (!isJoined(community.id)) toggleJoin(community.id);
    setGatePasscodeInput("");
    setGatePasscodeError(null);
    showToast("Passcode accepted — joined community");
  }, [community, gatePasscodeInput, isJoined, markApproved, showToast, toggleJoin, userId, verifyPasscode]);

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
            <Pressable onPress={() => navigateBack(router, "/communities")} style={styles.notFoundBtn}>
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
      onTokenChart={openTokenChart}
    />
  );

  // Local approval flag is the source of truth for unlocked viewers. We do NOT
  // rely on `joined` alone because a viewer may have joined when the community
  // was still public, or via a race outside the gate flow. Owners always pass.
  const isApprovedLocally = userId
    ? accessConfig?.approvedMemberIds.includes(userId) ?? false
    : false;
  const isLocked =
    effectiveAccessType !== "public" && !canEditMedia && !isApprovedLocally && !isOwner;
  // Members + owner are the only ones who can see invite/share/copy-link
  // actions in the menu. Locked viewers should not be able to leak the
  // invite code or deep-link to outsiders.
  const canShareInvite = joined || canEditMedia;
  const dataForTab: CommunityPost[] = isLocked
    ? []
    : tab === "recent"
      ? posts.filter(matchesSearch)
      : tab === "media"
        ? mediaPosts.filter(matchesSearch)
        : tab === "bookmarks"
          ? bookmarkedPosts.filter(matchesSearch)
          : [];
  const pendingCount = accessConfig?.pendingRequests.length ?? 0;
  const joinLabel = joined
    ? "Joined"
    : pendingForMe
      ? "Pending approval"
      : effectiveAccessType === "holders"
        ? "Verify & join"
        : effectiveAccessType === "passcode"
          ? "Enter passcode"
          : effectiveAccessType === "request"
            ? "Request to join"
            : "Join community";

  // ===== HARD GATE (early return) =====
  // For non-public communities, render ONLY the gate screen. This makes it
  // impossible to interact with the join button, member list, posts, or
  // any other surface until the viewer unlocks via passcode / approval /
  // holder verification. Replaces the previous Modal-based gate which could
  // race the underlying UI on first paint and let users tap join through.
  if (isLocked) {
    return (
      <View style={styles.root} testID="community-detail">
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" />
        <View style={styles.gateScreen} testID="community-gate-screen">
          <LinearGradient
            colors={[community.accent[0], community.accent[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gateScreenBg}
          />
          <View style={styles.gateScreenScrim} />
          <SafeAreaView edges={["top", "bottom"]} style={styles.gateScreenSafe}>
            <View style={styles.gateScreenTopBar}>
              <Pressable
                onPress={() => navigateBack(router, "/communities")}
                style={styles.bannerIcon}
                testID="community-gate-back"
              >
                <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
              </Pressable>
              <Text style={styles.gateScreenTopText} numberOfLines={1}>
                {community.name}
              </Text>
              <View style={styles.bannerIcon} />
            </View>

            <ScrollView
              contentContainerStyle={styles.gateScreenBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.gateScreenAvatar}>
                {community.avatarUrl ? (
                  <Image source={{ uri: community.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Text style={styles.gateScreenAvatarEmoji}>{community.iconEmoji}</Text>
                )}
              </View>
              <View style={styles.gateScreenLockChip}>
                {effectiveAccessType === "holders" ? (
                  <Coins color={Colors.cyan} size={13} strokeWidth={2.8} />
                ) : effectiveAccessType === "passcode" ? (
                  <KeyRound color={Colors.orange} size={13} strokeWidth={2.8} />
                ) : (
                  <LockIcon color={Colors.violet} size={13} strokeWidth={2.8} />
                )}
                <Text style={styles.gateScreenLockChipText}>
                  {effectiveAccessType === "holders"
                    ? "Holders only"
                    : effectiveAccessType === "passcode"
                      ? "Passcode locked"
                      : "Approval required"}
                </Text>
              </View>
              <Text style={styles.gateScreenTitle}>
                {pendingForMe
                  ? "Waiting for approval"
                  : effectiveAccessType === "holders"
                    ? "This community is for holders"
                    : effectiveAccessType === "passcode"
                      ? "Enter passcode to continue"
                      : "Request to join this community"}
              </Text>
              <Text style={styles.gateScreenBody2}>
                {pendingForMe
                  ? `Your request to join ${community.name} is pending the owner’s approval. You’ll get instant access the moment they accept.`
                  : effectiveAccessType === "holders"
                    ? `Verify your wallet holds ${Math.max(1, Number(community.gateMinimumBalance ?? 1)).toLocaleString()} $OGS to unlock posts and chat.`
                    : effectiveAccessType === "passcode"
                      ? `Ask the creator of ${community.name} for the passcode. It’s the only way to view posts, members, and chat inside.`
                      : `Send a request to the owner. You’ll see posts and chat the moment they approve you.`}
              </Text>

              {effectiveAccessType === "passcode" && !pendingForMe ? (
                <View style={styles.gateScreenInputCard}>
                  <Text style={styles.gateLabel}>Passcode</Text>
                  <View style={styles.gateInputWrap}>
                    <KeyRound color={Colors.orange} size={15} strokeWidth={2.6} />
                    <TextInput
                      value={gatePasscodeInput}
                      onChangeText={(t) => {
                        setGatePasscodeInput(t);
                        if (gatePasscodeError) setGatePasscodeError(null);
                      }}
                      placeholder="Enter passcode"
                      placeholderTextColor={Colors.muted}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.gateInput}
                      testID="community-gate-passcode-input"
                    />
                  </View>
                  {gatePasscodeError ? (
                    <View style={styles.gateError}>
                      <Text style={styles.gateErrorText}>{gatePasscodeError}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={onSubmitGatePasscode}
                    disabled={gatePasscodeInput.trim().length === 0}
                    style={[
                      styles.gateVerifyBtn,
                      { backgroundColor: Colors.orange },
                      gatePasscodeInput.trim().length === 0 && { opacity: 0.5 },
                    ]}
                    testID="community-gate-passcode-submit"
                  >
                    <KeyRound color={Colors.ink} size={14} strokeWidth={3} />
                    <Text style={styles.gateVerifyText}>Unlock community</Text>
                  </Pressable>
                  <Text style={styles.gateFootnote}>
                    Passcodes are set by the community creator. Ask them if you do not have one.
                  </Text>
                </View>
              ) : null}

              {effectiveAccessType === "holders" && !pendingForMe ? (
                <View style={styles.gateScreenInputCard}>
                  <Text style={styles.gateLabel}>Solana wallet address</Text>
                  <View style={styles.gateInputWrap}>
                    <Coins color={Colors.cyan} size={15} strokeWidth={2.6} />
                    <TextInput
                      value={holderGateAddress}
                      onChangeText={(t) => {
                        setHolderGateAddress(t);
                        if (holderGateError) setHolderGateError(null);
                      }}
                      placeholder="Paste your Solana wallet"
                      placeholderTextColor={Colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.gateInput}
                      testID="community-gate-holder-input"
                    />
                  </View>
                  {holderGateError ? (
                    <View style={styles.gateError}>
                      <Text style={styles.gateErrorText}>{holderGateError}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={onVerifyAndJoin}
                    disabled={holderGateScanning || holderGateAddress.trim().length === 0}
                    style={[
                      styles.gateVerifyBtn,
                      { backgroundColor: Colors.cyan },
                      (holderGateScanning || holderGateAddress.trim().length === 0) && { opacity: 0.5 },
                    ]}
                    testID="community-gate-holder-submit"
                  >
                    {holderGateScanning ? (
                      <ActivityIndicator color={Colors.ink} size="small" />
                    ) : (
                      <Text style={styles.gateVerifyText}>Scan wallet & join</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {effectiveAccessType === "request" || pendingForMe ? (
                <Pressable
                  onPress={() => requestJoin(community.id)}
                  disabled={pendingForMe}
                  style={[
                    styles.gateScreenPrimary,
                    { backgroundColor: Colors.violet },
                    pendingForMe && { opacity: 0.5 },
                  ]}
                  testID="community-gate-primary"
                >
                  <Text style={[styles.gateVerifyText, { color: Colors.ink }]}>
                    {pendingForMe ? "Awaiting approval" : "Request to join"}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => navigateBack(router, "/communities")}
                style={styles.gateScreenSecondary}
                testID="community-gate-cancel"
              >
                <Text style={styles.gateScreenSecondaryText}>Browse other communities</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="community-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* Hard gate is now an early return above. This Modal is permanently
          disabled but kept here so the structural diff stays small. */}
      <Modal
        visible={false}
        transparent={false}
        animationType="fade"
        onRequestClose={() => navigateBack(router, "/communities")}
      >
        <View style={styles.gateScreen} testID="community-gate-screen-legacy">
          <LinearGradient
            colors={[community.accent[0], community.accent[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gateScreenBg}
          />
          <View style={styles.gateScreenScrim} />
          <SafeAreaView edges={["top", "bottom"]} style={styles.gateScreenSafe}>
            <View style={styles.gateScreenTopBar}>
              <Pressable
                onPress={() => navigateBack(router, "/communities")}
                style={styles.bannerIcon}
                testID="community-gate-back"
              >
                <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
              </Pressable>
              <Text style={styles.gateScreenTopText} numberOfLines={1}>
                {community.name}
              </Text>
              <View style={styles.bannerIcon} />
            </View>

            <ScrollView
              contentContainerStyle={styles.gateScreenBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.gateScreenAvatar}>
                {community.avatarUrl ? (
                  <Image source={{ uri: community.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Text style={styles.gateScreenAvatarEmoji}>{community.iconEmoji}</Text>
                )}
              </View>
              <View style={styles.gateScreenLockChip}>
                {effectiveAccessType === "holders" ? (
                  <Coins color={Colors.cyan} size={13} strokeWidth={2.8} />
                ) : effectiveAccessType === "passcode" ? (
                  <KeyRound color={Colors.orange} size={13} strokeWidth={2.8} />
                ) : (
                  <LockIcon color={Colors.violet} size={13} strokeWidth={2.8} />
                )}
                <Text style={styles.gateScreenLockChipText}>
                  {effectiveAccessType === "holders"
                    ? "Holders only"
                    : effectiveAccessType === "passcode"
                      ? "Passcode locked"
                      : "Approval required"}
                </Text>
              </View>
              <Text style={styles.gateScreenTitle}>
                {pendingForMe
                  ? "Waiting for approval"
                  : effectiveAccessType === "holders"
                    ? "This community is for holders"
                    : effectiveAccessType === "passcode"
                      ? "Enter passcode to continue"
                      : "Request to join this community"}
              </Text>
              <Text style={styles.gateScreenBody2}>
                {pendingForMe
                  ? `Your request to join ${community.name} is pending the owner’s approval. You’ll get instant access the moment they accept.`
                  : effectiveAccessType === "holders"
                    ? `Verify your wallet holds ${Math.max(1, Number(community.gateMinimumBalance ?? 1)).toLocaleString()} $OGS to unlock posts and chat.`
                    : effectiveAccessType === "passcode"
                      ? `Ask the creator of ${community.name} for the passcode. It’s the only way to view posts, members, and chat inside.`
                      : `Send a request to the owner. You’ll see posts and chat the moment they approve you.`}
              </Text>

              {effectiveAccessType === "passcode" && !pendingForMe ? (
                <View style={styles.gateScreenInputCard}>
                  <Text style={styles.gateLabel}>Passcode</Text>
                  <View style={styles.gateInputWrap}>
                    <KeyRound color={Colors.orange} size={15} strokeWidth={2.6} />
                    <TextInput
                      value={gatePasscodeInput}
                      onChangeText={(t) => {
                        setGatePasscodeInput(t);
                        if (gatePasscodeError) setGatePasscodeError(null);
                      }}
                      placeholder="Enter passcode"
                      placeholderTextColor={Colors.muted}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.gateInput}
                      testID="community-gate-passcode-input"
                    />
                  </View>
                  {gatePasscodeError ? (
                    <View style={styles.gateError}>
                      <Text style={styles.gateErrorText}>{gatePasscodeError}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={onSubmitGatePasscode}
                    disabled={gatePasscodeInput.trim().length === 0}
                    style={[
                      styles.gateVerifyBtn,
                      { backgroundColor: Colors.orange },
                      gatePasscodeInput.trim().length === 0 && { opacity: 0.5 },
                    ]}
                    testID="community-gate-passcode-submit"
                  >
                    <KeyRound color={Colors.ink} size={14} strokeWidth={3} />
                    <Text style={styles.gateVerifyText}>Unlock community</Text>
                  </Pressable>
                  <Text style={styles.gateFootnote}>
                    Passcodes are set by the community creator. Ask them if you do not have one.
                  </Text>
                </View>
              ) : null}

              {effectiveAccessType !== "passcode" || pendingForMe ? (
                <Pressable
                  onPress={() => requestJoin(community.id)}
                  disabled={pendingForMe}
                  style={[
                    styles.gateScreenPrimary,
                    {
                      backgroundColor:
                        effectiveAccessType === "holders"
                          ? Colors.cyan
                          : Colors.violet,
                    },
                    pendingForMe && { opacity: 0.5 },
                  ]}
                  testID="community-gate-primary"
                >
                  <Text style={[styles.gateVerifyText, { color: Colors.ink }]}>
                    {pendingForMe
                      ? "Awaiting approval"
                      : effectiveAccessType === "holders"
                        ? "Verify wallet"
                        : "Request to join"}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => navigateBack(router, "/communities")}
                style={styles.gateScreenSecondary}
                testID="community-gate-cancel"
              >
                <Text style={styles.gateScreenSecondaryText}>Browse other communities</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

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
                    onPress={() => navigateBack(router, "/communities")}
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
                    requestJoin(community.id);
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
                    {joinLabel}
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

              <Pressable
                style={styles.memberRowButton}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMembersOpen(true);
                }}
                testID="community-members"
              >
                <View style={styles.memberStack}>
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
                </View>
                <View style={styles.memberCountWrap}>
                  <Text style={styles.memberCount}>
                    {fmtCount(community.members)} Members
                  </Text>
                  <Text style={styles.memberCountHint}>Tap to view</Text>
                </View>
              </Pressable>
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
                      requestJoin(community.id);
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

              <Text style={styles.desc} numberOfLines={3}>
                {community.description ||
                  `${community.name} is the official community for Crypto Community App.`}
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

            {tab !== "about" ? (
              <View style={styles.communityFeedNotice}>
                <View
                  style={[
                    styles.feedNoticeIcon,
                    {
                      backgroundColor: `${community.accent[0]}1A`,
                      borderColor: `${community.accent[0]}55`,
                    },
                  ]}
                >
                  <Hash color={community.accent[0]} size={17} strokeWidth={2.8} />
                </View>
                <View style={styles.feedNoticeCopy}>
                  <Text style={styles.feedNoticeTitle}>Community feed</Text>
                  <Text style={styles.feedNoticeBody} numberOfLines={2}>
                    Scoped to {community.name}: posts, replies, media, token scans, and saved posts stay inside this community.
                  </Text>
                </View>
                <View style={styles.feedNoticeStats}>
                  <View style={styles.feedNoticeStat}>
                    <MessageCircle color={Colors.cyan} size={11} strokeWidth={2.6} />
                    <Text style={styles.feedNoticeStatText}>{fmtCount(community.posts)}</Text>
                  </View>
                  <View style={styles.feedNoticeStat}>
                    <Users color={Colors.mint} size={11} strokeWidth={2.6} />
                    <Text style={styles.feedNoticeStatText}>{fmtCount(community.members)}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {isLocked ? (
              <View style={styles.lockedBanner} testID="community-lock-banner">
                <View style={styles.lockedIcon}>
                  {effectiveAccessType === "holders" ? (
                    <Coins color={Colors.cyan} size={20} strokeWidth={2.6} />
                  ) : effectiveAccessType === "passcode" ? (
                    <KeyRound color={Colors.orange} size={20} strokeWidth={2.6} />
                  ) : (
                    <UserCheck color={Colors.violet} size={20} strokeWidth={2.6} />
                  )}
                </View>
                <Text style={styles.lockedTitle}>
                  {pendingForMe
                    ? "Please wait for an admin to add you"
                    : effectiveAccessType === "holders"
                      ? "Holders-only community"
                      : effectiveAccessType === "passcode"
                        ? "Passcode required"
                        : "Approval required"}
                </Text>
                <Text style={styles.lockedBody}>
                  {pendingForMe
                    ? `Your request to join ${community.name} is pending the owner's approval. You will gain access automatically once approved.`
                    : effectiveAccessType === "holders"
                      ? `Verify your wallet holds ${Math.max(1, Number(community.gateMinimumBalance ?? 1)).toLocaleString()} $OGS to read posts and chat here.`
                      : effectiveAccessType === "passcode"
                        ? "Enter the passcode the creator shared to unlock posts and chat."
                        : "Send a request to the owner. You'll see posts and chat once they approve you."}
                </Text>
                <Pressable
                  onPress={() => requestJoin(community.id)}
                  disabled={pendingForMe}
                  style={[styles.lockedCta, pendingForMe && { opacity: 0.55 }]}
                  testID="community-locked-cta"
                >
                  <Text style={styles.lockedCtaText}>
                    {pendingForMe
                      ? "Awaiting approval"
                      : effectiveAccessType === "holders"
                        ? "Verify wallet"
                        : effectiveAccessType === "passcode"
                          ? "Enter passcode"
                          : "Request to join"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {canEditMedia && effectiveAccessType === "request" && pendingCount > 0 ? (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setRequestsOpen(true);
                }}
                style={styles.requestsBanner}
                testID="community-requests-banner"
              >
                <View style={styles.requestsBannerIcon}>
                  <UserCheck color={Colors.violet} size={16} strokeWidth={2.6} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.requestsBannerTitle}>{pendingCount} join request{pendingCount === 1 ? "" : "s"}</Text>
                  <Text style={styles.requestsBannerBody}>Review and approve members waiting to join.</Text>
                </View>
                <View style={styles.requestsBannerBadge}>
                  <Text style={styles.requestsBannerBadgeText}>{pendingCount}</Text>
                </View>
              </Pressable>
            ) : null}

            {tab === "recent" && !isLocked ? (
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
                  {detectedTokenAddress ? (
                    tokenPreview ? (
                      <CommunityTokenPreviewCard token={tokenPreview} onPress={() => openTokenChart(tokenPreview)} compact />
                    ) : (
                      <View style={styles.tokenScanningCard}>
                        <ActivityIndicator color={Colors.mint} size="small" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.tokenScanningTitle}>Scanning Solana CA</Text>
                          <Text style={styles.tokenScanningBody}>{shortAddress(detectedTokenAddress)}</Text>
                        </View>
                      </View>
                    )
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
            {canShareInvite ? (
              <>
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
                <View style={styles.menuDivider} />
              </>
            ) : null}
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
            {!canShareInvite ? (
              <MenuItem
                label="Report community"
                icon={Flag}
                onPress={() => {
                  setMenuOpen(false);
                  Alert.alert("Reported", "Thanks for flagging this community for review.");
                }}
                testID="menu-report"
              />
            ) : null}
            {isOwner ? (
              <>
                <View style={styles.menuDivider} />
                <MenuItem
                  label="Delete community"
                  icon={Trash2}
                  onPress={onDeleteCommunity}
                  testID="menu-delete-community"
                  destructive
                />
              </>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={membersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMembersOpen(false)}
      >
        <Pressable style={styles.membersBackdrop} onPress={() => setMembersOpen(false)}>
          <Pressable style={styles.membersSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.membersHandle} />
            <View style={styles.membersHeader}>
              <View>
                <Text style={styles.membersTitle}>Community members</Text>
                <Text style={styles.membersSub}>{community.name} · {fmtCount(community.members)} members</Text>
              </View>
              <Pressable onPress={() => setMembersOpen(false)} style={styles.threadClose} hitSlop={8}>
                <X color={Colors.text} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>
            {membersQ.isLoading ? (
              <View style={styles.membersLoading}>
                <ActivityIndicator color={Colors.mint} />
              </View>
            ) : members.length === 0 ? (
              <View style={styles.membersEmpty}>
                <Users color={Colors.muted} size={24} strokeWidth={2.4} />
                <Text style={styles.membersEmptyTitle}>No members loaded yet</Text>
                <Text style={styles.membersEmptyBody}>Join activity will appear here as people enter this community.</Text>
              </View>
            ) : (
              <FlatList
                data={members}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => (
                  <CommunityMemberRow
                    member={item}
                    isSelf={item.id === userId}
                    isToggling={isToggling}
                    isFollowing={!!item.isFollowing}
                    canModerate={isOwner && item.id !== userId}
                    isBanned={community ? isBanned(community.id, item.id) : false}
                    onOpen={() => openMemberProfile(item)}
                    onFollow={() => void onFollowMember(item)}
                    onKick={() => onKickMember(item)}
                    onBan={() => onBanMember(item)}
                  />
                )}
                ItemSeparatorComponent={() => <View style={styles.memberDivider} />}
                contentContainerStyle={styles.membersList}
                showsVerticalScrollIndicator={false}
              />
            )}
          </Pressable>
        </Pressable>
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
                    onTokenChart={openTokenChart}
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
                      onTokenChart={openTokenChart}
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

      <Modal
        visible={!!activeChartToken}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveChartToken(null)}
      >
        <View style={styles.chartBackdrop}>
          <SafeAreaView edges={["top", "bottom"]} style={styles.chartSheet}>
            {activeChartToken ? (
              <>
                <View style={styles.chartHeader}>
                  <View style={styles.chartIdentity}>
                    <View style={styles.chartLogo}>
                      {activeChartToken.logoUrl ? (
                        <Image source={{ uri: activeChartToken.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      ) : (
                        <Hash color={Colors.mint} size={18} strokeWidth={2.8} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chartTitle} numberOfLines={1}>{activeChartToken.symbol}</Text>
                      <Text style={styles.chartSub} numberOfLines={1}>{activeChartToken.name}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setActiveChartToken(null)} style={styles.threadClose} hitSlop={8}>
                    <X color={Colors.text} size={18} strokeWidth={2.6} />
                  </Pressable>
                </View>
                <View style={styles.chartStatsRow}>
                  <ChartStat label="Price" value={fmtUsd(activeChartToken.priceUsd)} />
                  <ChartStat
                    label="24h"
                    value={fmtPct(activeChartToken.change24h)}
                    tone={(activeChartToken.change24h ?? 0) >= 0 ? "good" : "bad"}
                  />
                  <ChartStat label="MCap" value={fmtUsd(activeChartToken.marketCapUsd)} />
                </View>
                <DexChart
                  contract={activeChartToken.address}
                  pairAddress={activeChartToken.pairAddress ?? undefined}
                  height={360}
                  interval="60"
                />
                <View style={styles.chartAddressRow}>
                  <Text style={styles.chartAddressText} numberOfLines={1}>{activeChartToken.address}</Text>
                  <Pressable onPress={() => void copyTokenAddress(activeChartToken.address)} style={styles.chartCopyBtn}>
                    <Copy color={Colors.ink} size={14} strokeWidth={2.8} />
                    <Text style={styles.chartCopyText}>Copy CA</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={passcodeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPasscodeOpen(false)}
      >
        <View style={styles.chartBackdrop}>
          <SafeAreaView edges={["bottom"]} style={styles.gateSheet}>
            <View style={styles.gateHeader}>
              <View style={[styles.gateIcon, { backgroundColor: "rgba(255,138,60,0.16)" }]}>
                <KeyRound color={Colors.orange} size={18} strokeWidth={2.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gateTitle}>Passcode required</Text>
                <Text style={styles.gateSub} numberOfLines={2}>
                  Enter the passcode the creator of {community.name} shared with you.
                </Text>
              </View>
              <Pressable onPress={() => setPasscodeOpen(false)} style={styles.threadClose} hitSlop={8}>
                <X color={Colors.text} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>

            <Text style={styles.gateLabel}>Passcode</Text>
            <View style={styles.gateInputWrap}>
              <TextInput
                value={passcodeInput}
                onChangeText={(t) => {
                  setPasscodeInput(t);
                  if (passcodeError) setPasscodeError(null);
                }}
                placeholder="Enter passcode"
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.gateInput}
                testID="community-passcode-input"
              />
            </View>

            {passcodeError ? (
              <View style={styles.gateError}>
                <Text style={styles.gateErrorText}>{passcodeError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={onSubmitPasscode}
              disabled={passcodeInput.trim().length === 0}
              style={[
                styles.gateVerifyBtn,
                { backgroundColor: Colors.orange },
                passcodeInput.trim().length === 0 && { opacity: 0.5 },
              ]}
              testID="community-passcode-submit"
            >
              <KeyRound color={Colors.ink} size={14} strokeWidth={3} />
              <Text style={styles.gateVerifyText}>Unlock community</Text>
            </Pressable>
            <Text style={styles.gateFootnote}>
              Passcodes are set by the community creator. Ask them if you do not have one.
            </Text>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={requestsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRequestsOpen(false)}
      >
        <View style={styles.chartBackdrop}>
          <SafeAreaView edges={["bottom"]} style={styles.gateSheet}>
            <View style={styles.gateHeader}>
              <View style={[styles.gateIcon, { backgroundColor: "rgba(168,85,247,0.18)" }]}>
                <UserCheck color={Colors.violet} size={18} strokeWidth={2.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gateTitle}>Join requests</Text>
                <Text style={styles.gateSub} numberOfLines={2}>
                  Approve or decline members waiting to join {community.name}.
                </Text>
              </View>
              <Pressable onPress={() => setRequestsOpen(false)} style={styles.threadClose} hitSlop={8}>
                <X color={Colors.text} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360, marginTop: 8 }} contentContainerStyle={{ gap: 10, paddingBottom: 14 }}>
              {(accessConfig?.pendingRequests ?? []).length === 0 ? (
                <Text style={[styles.gateFootnote, { marginTop: 16 }]}>No pending requests.</Text>
              ) : (
                (accessConfig?.pendingRequests ?? []).map((req) => (
                  <View key={req.userId} style={styles.requestRow}>
                    <View style={[styles.requestAvatar, { backgroundColor: req.avatarColor ?? Colors.violet }]}>
                      <Text style={styles.requestAvatarText}>{(req.name || "M").slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestName} numberOfLines={1}>{req.name}</Text>
                      <Text style={styles.requestHandle} numberOfLines={1}>{req.handle}</Text>
                    </View>
                    <Pressable
                      onPress={() => onRejectRequest(req.userId)}
                      style={styles.requestRejectBtn}
                      testID={`request-reject-${req.userId}`}
                    >
                      <Text style={styles.requestRejectText}>Decline</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onApproveRequest(req.userId)}
                      style={styles.requestApproveBtn}
                      testID={`request-approve-${req.userId}`}
                    >
                      <Text style={styles.requestApproveText}>Approve</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={holderGateOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setHolderGateOpen(false)}
      >
        <View style={styles.chartBackdrop}>
          <SafeAreaView edges={["bottom"]} style={styles.gateSheet}>
            <View style={styles.gateHeader}>
              <View style={styles.gateIcon}>
                <Hash color={Colors.mint} size={18} strokeWidth={2.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gateTitle}>Holder-only community</Text>
                <Text style={styles.gateSub} numberOfLines={2}>
                  Verify your wallet holds {Math.max(1, Number(community.gateMinimumBalance ?? 1)).toLocaleString()} ${"OGS"} to join {community.name}.
                </Text>
              </View>
              <Pressable onPress={() => setHolderGateOpen(false)} style={styles.threadClose} hitSlop={8}>
                <X color={Colors.text} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>

            <Text style={styles.gateLabel}>Solana wallet address</Text>
            <View style={styles.gateInputWrap}>
              <TextInput
                value={holderGateAddress}
                onChangeText={(t) => {
                  setHolderGateAddress(t);
                  if (holderGateError) setHolderGateError(null);
                }}
                placeholder="7xKXt...abcd"
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.gateInput}
                testID="holder-gate-input"
              />
              <Pressable
                onPress={async () => {
                  try {
                    const text = await Clipboard.getStringAsync();
                    if (text) {
                      setHolderGateAddress(text.trim());
                      Haptics.selectionAsync().catch(() => {});
                    }
                  } catch (e) {
                    console.log("[community] clipboard read failed", e);
                  }
                }}
                style={styles.gatePasteBtn}
                hitSlop={8}
              >
                <Text style={styles.gatePasteText}>Paste</Text>
              </Pressable>
            </View>

            <Text style={styles.gateMintLabel}>Gate token (Helius scan)</Text>
            <Text style={styles.gateMintValue} numberOfLines={1}>
              {community.gateTokenMint || SOLTOOLS_TOKEN_MINT}
            </Text>

            {holderGateBalance !== null ? (
              <View style={styles.gateBalanceRow}>
                <Text style={styles.gateBalanceLabel}>Wallet balance</Text>
                <Text style={styles.gateBalanceValue}>{holderGateBalance.toLocaleString()}</Text>
              </View>
            ) : null}

            {holderGateError ? (
              <View style={styles.gateError}>
                <Text style={styles.gateErrorText}>{holderGateError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={onVerifyAndJoin}
              disabled={holderGateScanning || holderGateAddress.trim().length < 32}
              style={[
                styles.gateVerifyBtn,
                (holderGateScanning || holderGateAddress.trim().length < 32) && { opacity: 0.5 },
              ]}
              testID="holder-gate-verify"
            >
              {holderGateScanning ? (
                <ActivityIndicator color={Colors.ink} />
              ) : (
                <>
                  <Hash color={Colors.ink} size={14} strokeWidth={3} />
                  <Text style={styles.gateVerifyText}>Scan wallet & join</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.gateFootnote}>
              We use Helius RPC to scan your token accounts. Read-only — we never request signing.
            </Text>
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
    { id: "p1", handle: "", username: null, name: "A", color: Colors.violet },
    { id: "p2", handle: "", username: null, name: "B", color: Colors.cyan },
    { id: "p3", handle: "", username: null, name: "C", color: Colors.mint },
  ];
}

function CommunityMemberRow({
  member,
  isSelf,
  isToggling,
  isFollowing,
  canModerate,
  isBanned: banned,
  onOpen,
  onFollow,
  onKick,
  onBan,
}: {
  member: CommunityMember;
  isSelf: boolean;
  isToggling: boolean;
  isFollowing: boolean;
  canModerate: boolean;
  isBanned: boolean;
  onOpen: () => void;
  onFollow: () => void;
  onKick: () => void;
  onBan: () => void;
}) {
  return (
    <Pressable onPress={onOpen} style={styles.memberSheetRow} testID={`community-member-${member.id}`}>
      {member.avatarUrl ? (
        <Image source={{ uri: member.avatarUrl }} style={styles.memberSheetAvatar} contentFit="cover" />
      ) : (
        <View style={[styles.memberSheetAvatar, { backgroundColor: member.color }]}> 
          <Text style={styles.memberSheetInit}>{member.name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.memberSheetCopy}>
        <View style={styles.memberSheetNameRow}>
          <Text style={styles.memberSheetName} numberOfLines={1}>{member.name}</Text>
          {member.verified ? <BadgeCheck color={Colors.cyan} size={13} strokeWidth={2.8} /> : null}
        </View>
        <Text style={styles.memberSheetHandle} numberOfLines={1}>
          {member.handle || "@user"} · {fmtCount(member.followersCount ?? 0)} followers
        </Text>
      </View>
      {!isSelf ? (
        <View style={styles.memberActionRow}>
          {canModerate ? (
            <>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onKick();
                }}
                hitSlop={6}
                style={styles.memberModBtn}
                testID={`community-member-kick-${member.id}`}
              >
                <UserMinus color={Colors.orange} size={14} strokeWidth={2.6} />
              </Pressable>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onBan();
                }}
                hitSlop={6}
                style={[styles.memberModBtn, banned && styles.memberModBtnActive]}
                testID={`community-member-ban-${member.id}`}
              >
                <Ban color={banned ? Colors.mint : Colors.rose} size={14} strokeWidth={2.6} />
              </Pressable>
            </>
          ) : null}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onFollow();
            }}
            disabled={isToggling}
            style={[styles.memberFollowBtn, isFollowing && styles.memberFollowBtnActive]}
            testID={`community-member-follow-${member.id}`}
          >
            <UserPlus color={isFollowing ? Colors.mint : Colors.ink} size={13} strokeWidth={3} />
            <Text style={[styles.memberFollowText, isFollowing && styles.memberFollowTextActive]}>
              {isFollowing ? "Following" : "Follow"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.memberSelfText}>You</Text>
      )}
    </Pressable>
  );
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
  destructive,
}: {
  label: string;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  onPress: () => void;
  testID?: string;
  destructive?: boolean;
}) {
  const tint = destructive ? Colors.rose : Colors.text;
  return (
    <Pressable onPress={onPress} style={styles.menuItem} testID={testID}>
      <Text style={[styles.menuItemText, destructive ? { color: Colors.rose } : null]}>{label}</Text>
      <Icon color={tint} size={18} strokeWidth={2.2} />
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

function ChartStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? Colors.mint : tone === "bad" ? Colors.rose : Colors.text;
  return (
    <View style={styles.chartStat}>
      <Text style={styles.chartStatLabel}>{label}</Text>
      <Text style={[styles.chartStatValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function CommunityTokenPreviewCard({
  token,
  onPress,
  compact = false,
}: {
  token: CommunityTokenCard;
  onPress: () => void;
  compact?: boolean;
}) {
  const changeColor = (token.change24h ?? 0) >= 0 ? Colors.mint : Colors.rose;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tokenCard, compact && styles.tokenCardCompact]}
      testID={`token-card-${token.address}`}
    >
      <LinearGradient
        colors={["rgba(85,245,178,0.14)", "rgba(56,215,255,0.06)", "rgba(255,255,255,0.025)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tokenTopRow}>
        <View style={styles.tokenLogo}>
          {token.logoUrl ? (
            <Image source={{ uri: token.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Hash color={Colors.mint} size={16} strokeWidth={2.8} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tokenSymbol} numberOfLines={1}>{token.symbol}</Text>
          <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
        </View>
        <View style={styles.tokenChartPill}>
          <ChartCandlestick color={Colors.ink} size={13} strokeWidth={2.8} />
          <Text style={styles.tokenChartText}>Chart</Text>
        </View>
      </View>
      <View style={styles.tokenMetricsRow}>
        <View style={styles.tokenMetric}>
          <Text style={styles.tokenMetricLabel}>Price</Text>
          <Text style={styles.tokenMetricValue}>{fmtUsd(token.priceUsd)}</Text>
        </View>
        <View style={styles.tokenMetric}>
          <Text style={styles.tokenMetricLabel}>24h</Text>
          <Text style={[styles.tokenMetricValue, { color: changeColor }]}>{fmtPct(token.change24h)}</Text>
        </View>
        <View style={styles.tokenMetric}>
          <Text style={styles.tokenMetricLabel}>Liq</Text>
          <Text style={styles.tokenMetricValue}>{fmtUsd(token.liquidityUsd)}</Text>
        </View>
      </View>
      <Text style={styles.tokenAddress} numberOfLines={1}>SOL CA · {shortAddress(token.address)}</Text>
    </Pressable>
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
  onTokenChart,
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
  onTokenChart?: (token: CommunityTokenCard) => void;
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
      {post.token ? (
        <CommunityTokenPreviewCard token={post.token} onPress={() => onTokenChart?.(post.token!)} />
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
    ...StyleSheet.absoluteFillObject,
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
    right: 14,
    bottom: 14,
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
  memberRowButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingRight: 8,
    borderRadius: 999,
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
  memberCountWrap: { flex: 1, minWidth: 0 },
  memberCount: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  memberCountHint: { color: Colors.mint, fontSize: 10, fontWeight: "900", marginTop: 1, textTransform: "uppercase", letterSpacing: 0.5 },
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
  communityFeedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 18,
    marginTop: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(7,18,20,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.075)",
  },
  feedNoticeIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  feedNoticeCopy: { flex: 1, gap: 2 },
  feedNoticeTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  feedNoticeBody: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  feedNoticeStats: { gap: 6, alignItems: "flex-end" },
  feedNoticeStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  feedNoticeStatText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
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
  tokenScanningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(85,245,178,0.08)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.2)",
  },
  tokenScanningTitle: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  tokenScanningBody: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  tokenCard: {
    marginTop: 12,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 12,
  },
  tokenCardCompact: { marginTop: 2, padding: 10 },
  tokenTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  tokenLogo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
  },
  tokenSymbol: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  tokenName: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  tokenChartPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  tokenChartText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  tokenMetricsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  tokenMetric: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tokenMetricLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  tokenMetricValue: { color: Colors.text, fontSize: 12, fontWeight: "900", marginTop: 3 },
  tokenAddress: { color: Colors.muted, fontSize: 10, fontWeight: "800", marginTop: 10 },

  membersBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  membersSheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.ink,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingTop: 10,
    overflow: "hidden",
  },
  membersHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 14,
  },
  membersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  membersTitle: { color: Colors.text, fontSize: 19, fontWeight: "900", letterSpacing: -0.4 },
  membersSub: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 3 },
  membersLoading: { paddingVertical: 44, alignItems: "center" },
  membersEmpty: { paddingHorizontal: 28, paddingVertical: 42, alignItems: "center", gap: 10 },
  membersEmptyTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  membersEmptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center", lineHeight: 17 },
  membersList: { paddingHorizontal: 18, paddingBottom: 28 },
  memberSheetRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  memberSheetAvatar: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  memberSheetInit: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  memberSheetCopy: { flex: 1, minWidth: 0 },
  memberSheetNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  memberSheetName: { color: Colors.text, fontSize: 14, fontWeight: "900", maxWidth: "88%" },
  memberSheetHandle: { color: Colors.muted, fontSize: 11, fontWeight: "800", marginTop: 3 },
  memberFollowBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.mint },
  memberFollowBtnActive: { backgroundColor: "rgba(85,245,178,0.09)", borderWidth: 1, borderColor: "rgba(85,245,178,0.32)" },
  memberFollowText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  memberFollowTextActive: { color: Colors.mint },
  memberSelfText: { color: Colors.muted, fontSize: 12, fontWeight: "900" },
  memberActionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  memberModBtn: { width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  memberModBtnActive: { backgroundColor: "rgba(85,245,178,0.12)", borderColor: "rgba(85,245,178,0.35)" },
  memberDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)" },

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

  gateSheet: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 12,
    backgroundColor: Colors.ink,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
  },
  gateHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  gateIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
  },
  gateTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  gateSub: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  gateLabel: { color: Colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 },
  gateInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  gateInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", padding: 0 },
  gatePasteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(85,245,178,0.14)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.28)",
  },
  gatePasteText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },
  gateMintLabel: { color: Colors.muted, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  gateMintValue: { color: Colors.text, fontSize: 12, fontWeight: "700" },
  gateBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  gateBalanceLabel: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  gateBalanceValue: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  gateError: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,93,143,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.3)",
  },
  gateErrorText: { color: Colors.rose, fontSize: 12, fontWeight: "800" },
  gateVerifyBtn: {
    marginTop: 4,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  gateVerifyText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  gateFootnote: { color: Colors.muted, fontSize: 11, fontWeight: "700", textAlign: "center" },

  gateScreen: { flex: 1, backgroundColor: Colors.ink },
  gateScreenBg: { ...StyleSheet.absoluteFillObject, opacity: 0.35 },
  gateScreenScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,3,1,0.78)" },
  gateScreenSafe: { flex: 1 },
  gateScreenTopBar: {
    paddingHorizontal: 14,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gateScreenTopText: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2, flex: 1, textAlign: "center" },
  gateScreenBody: { paddingHorizontal: 22, paddingTop: 36, paddingBottom: 32, gap: 14, alignItems: "center" },
  gateScreenAvatar: {
    width: 84,
    height: 84,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  gateScreenAvatarEmoji: { fontSize: 40 },
  gateScreenLockChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginTop: 4,
  },
  gateScreenLockChipText: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  gateScreenTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4, textAlign: "center", marginTop: 8 },
  gateScreenBody2: { color: Colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 19, textAlign: "center", paddingHorizontal: 6 },
  gateScreenInputCard: {
    width: "100%",
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 10,
  },
  gateScreenPrimary: {
    marginTop: 14,
    width: "100%",
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  gateScreenSecondary: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  gateScreenSecondaryText: { color: Colors.muted, fontSize: 12, fontWeight: "800" },

  lockedBanner: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  lockedIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 },
  lockedBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  lockedCta: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.mint,
  },
  lockedCtaText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  requestsBanner: {
    marginHorizontal: 14,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  requestsBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  requestsBannerTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  requestsBannerBody: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  requestsBannerBadge: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  requestsBannerBadgeText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  requestAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  requestAvatarText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  requestName: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  requestHandle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  requestRejectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  requestRejectText: { color: Colors.muted, fontSize: 11, fontWeight: "900" },
  requestApproveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.mint,
  },
  requestApproveText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },

  chartBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  chartSheet: {
    height: "88%",
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 12,
    backgroundColor: Colors.ink,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.14)",
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  chartIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  chartLogo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
  },
  chartTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  chartSub: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  chartStatsRow: { flexDirection: "row", gap: 8 },
  chartStat: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  chartStatLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  chartStatValue: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 4 },
  chartAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  chartAddressText: { flex: 1, color: Colors.muted, fontSize: 11, fontWeight: "800" },
  chartCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  chartCopyText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },

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
