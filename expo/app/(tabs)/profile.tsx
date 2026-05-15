import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Award,
  Bell,
  Bookmark,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Crown,
  Edit3,
  ExternalLink,
  Eye,
  Flame,
  Gem,
  Globe,
  Heart,
  HelpCircle,
  Languages,
  Link as LinkIcon,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
  Quote,
  Repeat2,
  Rocket,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Twitter,
  Users,
  Vibrate,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import AppBackground from "@/components/ui/AppBackground";
import PortfolioCard from "@/components/profile/PortfolioCard";
import RecapCard from "@/components/profile/RecapCard";
import BadgeRow from "@/components/social/BadgeRow";
import { DEFAULT_BADGES, getHolderBadge, sortBadges, type UserBadge } from "@/lib/badge-system";
import { useAdmin } from "@/providers/admin-provider";
import { useApp, type Currency, type Language, type ThemeMode, type UserPost, type UserPrefs } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { patchPostEverywhere } from "@/lib/post-sync";
import { type Community, type CommunityPost, useSocial } from "@/providers/social-provider";
import {
  useFollowCounts,
  useFollowList,
  useProfileProvider,
  useSearchProfiles,
  type CustomBadge,
  type ProfileSummary,
} from "@/providers/profile-provider";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type Tab = "posts" | "holdings" | "activity" | "communities";

const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "posts", label: "Posts", Icon: Pencil },
  { id: "holdings", label: "Holdings", Icon: Gem },
  { id: "activity", label: "Activity", Icon: Sparkles },
  { id: "communities", label: "Communities", Icon: Users },
];

interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  Icon: LucideIcon;
  color: string;
  unlocked: boolean;
  progress: number;
  goal: number;
}

interface RankInfo {
  name: string;
  next: string;
  Icon: LucideIcon;
  color: string;
  level: number;
  progress: number;
  xpInLevel: number;
  xpForNext: number;
}

function computeRank(xp: number): RankInfo {
  const tiers: { min: number; name: string; Icon: LucideIcon; color: string }[] = [
    { min: 0, name: "Recruit", Icon: Sparkles, color: Colors.muted },
    { min: 100, name: "Scout", Icon: Eye, color: Colors.cyan },
    { min: 300, name: "Trader", Icon: TrendingUp, color: Colors.mint },
    { min: 700, name: "Sniper", Icon: Target, color: Colors.orange },
    { min: 1500, name: "Whale", Icon: Gem, color: Colors.rose },
    { min: 3000, name: "Legend", Icon: Crown, color: "#F4F4F5" },
  ];
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (xp >= tiers[i].min) idx = i;
  }
  const cur = tiers[idx];
  const nxt = tiers[Math.min(idx + 1, tiers.length - 1)];
  const xpInLevel = xp - cur.min;
  const xpForNext = Math.max(1, nxt.min - cur.min);
  return {
    name: cur.name,
    next: nxt.name,
    Icon: cur.Icon,
    color: cur.color,
    level: idx + 1,
    progress: idx === tiers.length - 1 ? 1 : Math.min(1, xpInLevel / xpForNext),
    xpInLevel,
    xpForNext,
  };
}

function buildAchievements(state: {
  watching: number;
  walletsCount: number;
  alertsCount: number;
  postsCount: number;
  listedCount: number;
  xp: number;
}): AchievementDef[] {
  return [
    {
      id: "first-watch",
      title: "Eagle Eye",
      desc: "Watch your first token",
      Icon: Eye,
      color: Colors.mint,
      unlocked: state.watching >= 1,
      progress: Math.min(1, state.watching),
      goal: 1,
    },
    {
      id: "watch-10",
      title: "Pair Hunter",
      desc: "Watch 10 tokens",
      Icon: Target,
      color: Colors.cyan,
      unlocked: state.watching >= 10,
      progress: state.watching,
      goal: 10,
    },
    {
      id: "first-wallet",
      title: "Wallet Stalker",
      desc: "Track a wallet",
      Icon: Wallet,
      color: Colors.cyan,
      unlocked: state.walletsCount >= 1,
      progress: Math.min(1, state.walletsCount),
      goal: 1,
    },
    {
      id: "alert-5",
      title: "Trigger Happy",
      desc: "Set 5 alerts",
      Icon: Bell,
      color: Colors.orange,
      unlocked: state.alertsCount >= 5,
      progress: state.alertsCount,
      goal: 5,
    },
    {
      id: "first-post",
      title: "Loud & Proud",
      desc: "Drop your first post",
      Icon: Pencil,
      color: Colors.rose,
      unlocked: state.postsCount >= 1,
      progress: Math.min(1, state.postsCount),
      goal: 1,
    },
    {
      id: "listed",
      title: "Launch Ready",
      desc: "List a token in Discover",
      Icon: Rocket,
      color: "#B8BEC8",
      unlocked: state.listedCount >= 1,
      progress: Math.min(1, state.listedCount),
      goal: 1,
    },
    {
      id: "xp-500",
      title: "On Fire",
      desc: "Reach 500 XP",
      Icon: Flame,
      color: Colors.orange,
      unlocked: state.xp >= 500,
      progress: state.xp,
      goal: 500,
    },
    {
      id: "xp-1500",
      title: "Whale Mode",
      desc: "Reach 1500 XP",
      Icon: Crown,
      color: "#F4F4F5",
      unlocked: state.xp >= 1500,
      progress: state.xp,
      goal: 1500,
    },
  ];
}

function tap() {
  if (Platform.OS !== "web") {
    Haptics.selectionAsync().catch(() => {});
  }
}

async function ensurePhotoPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission needed", "Allow photo library access to update your profile images.");
    return false;
  }
  return true;
}

function shorten(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function shortTimeAgo(ts: number): string {
  return timeAgo(ts).replace(" ago", "");
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `${n}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const {
    profile,
    updateProfile,
    prefs,
    updatePrefs,
    resetAllData,
    watchlist,
    removeWatch,
    alerts,
    toggleAlert,
    removeAlert,
    wallets,
    removeWallet,
    posts,
    togglePostLike,
    togglePostRepost,
    deletePost,
  } = useApp();
  const { listings } = useLaunchpad();
  const { isAuthenticated, signOut, userId } = useAuth();
  const { isAdmin, isTeam, role: adminRole } = useAdmin();
  const { uploadMedia, isUploading } = useProfileProvider();
  const { communities, joinedCommunities, addPostReply, quotePost } = useSocial();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Refetch profile data whenever the screen regains focus so updates made
  // on another device sync immediately.
  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ["app", "profile"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["app", "posts"] });
      qc.invalidateQueries({ queryKey: ["app", "watch"] });
      qc.invalidateQueries({ queryKey: ["app", "alerts"] });
      qc.invalidateQueries({ queryKey: ["app", "wallets"] });
      qc.invalidateQueries({ queryKey: ["social", "communities"] });
      qc.invalidateQueries({ queryKey: ["social", "memberships"] });
      return undefined;
    }, [qc]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.refetchQueries({ queryKey: ["app", "profile"] }),
        qc.refetchQueries({ queryKey: ["profile"] }),
        qc.refetchQueries({ queryKey: ["app", "posts"] }),
        qc.refetchQueries({ queryKey: ["app", "watch"] }),
        qc.refetchQueries({ queryKey: ["app", "alerts"] }),
        qc.refetchQueries({ queryKey: ["app", "wallets"] }),
        qc.refetchQueries({ queryKey: ["social", "communities"] }),
        qc.refetchQueries({ queryKey: ["social", "memberships"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  // Animated XP fill + subtle ring shimmer for premium feel.
  const xpAnim = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const ringOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const [tab, setTab] = useState<Tab>("posts");
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [followersOpen, setFollowersOpen] = useState<"followers" | "following" | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [postInteraction, setPostInteraction] = useState<{ mode: "reply" | "quote"; post: UserPost } | null>(null);
  const [postInteractionText, setPostInteractionText] = useState<string>("");
  const [submittingInteraction, setSubmittingInteraction] = useState<boolean>(false);
  const followersQ = useFollowList(userId, "followers");
  const followingQ = useFollowList(userId, "following");
  const followCountsQ = useFollowCounts(userId);
  const followersCount = Math.max(profile.followers, followersQ.data?.length ?? 0, followCountsQ.data?.followers ?? 0);
  const followingCount = Math.max(profile.following, followingQ.data?.length ?? 0, followCountsQ.data?.following ?? 0);

  const myListings = useMemo(
    () => listings.filter((l) => !!userId && l.ownerId === userId),
    [listings, userId],
  );

  const communityById = useMemo(() => {
    const map = new Map<string, Community>();
    communities.forEach((community) => map.set(community.id, community));
    return map;
  }, [communities]);

  const computedXp = useMemo(() => profile.xp, [profile.xp]);

  const stackedBadges = useMemo<UserBadge[]>(() => {
    const out: UserBadge[] = [];
    if (isAdmin && adminRole) {
      const r = adminRole.toLowerCase();
      if (r === "owner" || r === "superadmin" || r === "admin") out.push(DEFAULT_BADGES.admin);
      else if (r === "moderator") out.push(DEFAULT_BADGES.mod);
      else if (r === "support") out.push({ ...DEFAULT_BADGES.team, id: "support", label: "SUPPORT" });
    }
    // Holder/whale badge derived from XP as a graceful proxy until wallet balance lands.
    const holder = getHolderBadge(profile.xp * 100);
    if (holder) out.push(holder);
    profile.customBadges.forEach((b) => {
      out.push({
        id: b.id,
        label: b.label.toUpperCase(),
        color: b.color ?? Colors.mint,
        glow: true,
        priority: 50,
        rarity: "rare",
      });
    });
    const seen = new Set<string>();
    const deduped = out.filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
    return sortBadges(deduped);
  }, [profile.customBadges, profile.xp, isAdmin, adminRole]);

  const rank = useMemo(() => computeRank(computedXp), [computedXp]);

  useEffect(() => {
    Animated.timing(xpAnim, {
      toValue: rank.progress,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [rank.progress, xpAnim]);

  const xpFillWidth = xpAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const stats = useMemo(
    () => ({
      watching: watchlist.length,
      alerts: alerts.filter((a) => a.enabled).length,
      wallets: wallets.length,
      listed: myListings.length,
      posts: posts.length,
    }),
    [watchlist, alerts, wallets, myListings, posts],
  );

  const achievements = useMemo(
    () =>
      buildAchievements({
        watching: stats.watching,
        walletsCount: stats.wallets,
        alertsCount: alerts.length,
        postsCount: stats.posts,
        listedCount: stats.listed,
        xp: computedXp,
      }),
    [stats, alerts.length, computedXp],
  );

  const unlockedCount = useMemo(() => achievements.filter((a) => a.unlocked).length, [achievements]);

  const activity = useMemo(() => {
    const items: { id: string; ts: number; title: string; sub: string; Icon: LucideIcon; color: string }[] = [];
    watchlist.slice(0, 12).forEach((w) =>
      items.push({
        id: `w-${w.id}`,
        ts: w.addedAt,
        title: `Watching $${w.ticker}`,
        sub: shorten(w.contract),
        Icon: Eye,
        color: Colors.mint,
      }),
    );
    wallets.slice(0, 12).forEach((w) =>
      items.push({
        id: `wa-${w.id}`,
        ts: w.addedAt,
        title: `Tracked wallet ${w.label}`,
        sub: shorten(w.address),
        Icon: Wallet,
        color: Colors.cyan,
      }),
    );
    alerts.slice(0, 12).forEach((a) =>
      items.push({
        id: `a-${a.id}`,
        ts: a.createdAt,
        title: `Alert · $${a.ticker}`,
        sub: `${a.type} @ ${a.value}`,
        Icon: Bell,
        color: Colors.orange,
      }),
    );
    posts.slice(0, 12).forEach((p) =>
      items.push({
        id: `p-${p.id}`,
        ts: p.createdAt,
        title: "Posted alpha",
        sub: p.text.slice(0, 60),
        Icon: Pencil,
        color: Colors.rose,
      }),
    );
    myListings.slice(0, 12).forEach((l) =>
      items.push({
        id: `l-${l.id}`,
        ts: l.createdAt ?? Date.now(),
        title: `Listed $${l.ticker}`,
        sub: l.name,
        Icon: Rocket,
        color: "#B8BEC8",
      }),
    );
    return items.sort((a, b) => b.ts - a.ts).slice(0, 25);
  }, [watchlist, wallets, alerts, posts, myListings]);

  const onConfirmDelete = useCallback(
    (label: string, onConfirm: () => void) => {
      Alert.alert("Remove?", `Remove ${label}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: onConfirm },
      ]);
    },
    [],
  );

  const onCopyAddress = useCallback(async () => {
    if (!profile.walletAddress) {
      Alert.alert("No wallet", "Add your Solana address in Edit profile.");
      return;
    }
    await Clipboard.setStringAsync(profile.walletAddress);
    tap();
    Alert.alert("Copied", "Wallet address copied to clipboard.");
  }, [profile.walletAddress]);

  const onShareProfile = useCallback(async () => {
    try {
      await Share.share({
        message: `Follow ${profile.displayName} (${profile.handle}) on Crypto Community App — pro Solana trading suite.`,
      });
    } catch (e) {
      console.log("[profile] share failed", e);
    }
  }, [profile.displayName, profile.handle]);

  const onPickAvatar = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in", "Sign in to upload a profile picture.");
      return;
    }
    try {
      if (Platform.OS !== "web") {
        const allowed = await ensurePhotoPermission();
        if (!allowed) return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
      });
      if (res.canceled || !res.assets[0]?.uri) return;
      const asset = res.assets[0];
      const url = await uploadMedia({
        kind: "avatar",
        uri: asset.uri,
        base64: asset.base64 ?? null,
        fileName: asset.fileName ?? null,
        mimeType: asset.mimeType ?? null,
      });
      await updateProfile({ avatarUrl: url });
    } catch (e) {
      console.log("[profile] avatar upload failed", e);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    }
  }, [isAuthenticated, uploadMedia, updateProfile]);

  const onPickBanner = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in", "Sign in to upload a banner.");
      return;
    }
    try {
      if (Platform.OS !== "web") {
        const allowed = await ensurePhotoPermission();
        if (!allowed) return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: true,
        aspect: [3, 1],
        base64: true,
      });
      if (res.canceled || !res.assets[0]?.uri) return;
      const asset = res.assets[0];
      const url = await uploadMedia({
        kind: "banner",
        uri: asset.uri,
        base64: asset.base64 ?? null,
        fileName: asset.fileName ?? null,
        mimeType: asset.mimeType ?? null,
      });
      await updateProfile({ bannerUrl: url });
    } catch (e) {
      console.log("[profile] banner upload failed", e);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    }
  }, [isAuthenticated, uploadMedia, updateProfile]);

  const onOpenLink = useCallback((url: string) => {
    if (!url) return;
    const safe = url.startsWith("http") ? url : `https://${url}`;
    Linking.openURL(safe).catch(() => {
      Alert.alert("Couldn't open link", safe);
    });
  }, []);

  const buildCommunityPostRef = useCallback(
    (post: UserPost): CommunityPost => ({
      id: post.id,
      communityId: post.communityId ?? "",
      authorUserId: post.authorId ?? userId ?? null,
      authorHandle: post.authorUsername ? `@${post.authorUsername}` : (profile.handle || "@you"),
      authorName: post.authorDisplayName ?? profile.displayName ?? "You",
      authorColor: post.authorAvatarColor ?? profile.avatarColor,
      authorAvatarUrl: post.authorAvatarUrl ?? profile.avatarUrl ?? null,
      authorUsername: post.authorUsername ?? (profile.handle.replace(/^@/, "") || null),
      content: post.text,
      imageUrl: post.images?.[0] ?? null,
      ticker: post.ticker,
      changePct: post.changePct,
      createdAt: post.createdAt,
      likes: post.likes,
      comments: post.comments,
      reposts: post.reposts,
      liked: !!post.liked,
      reposted: !!post.reposted,
      bookmarked: false,
      parentPostId: null,
      quotePostId: null,
      quote: null,
      replyTo: null,
      token: null,
    }),
    [profile.avatarColor, profile.avatarUrl, profile.displayName, profile.handle, userId],
  );

  const closePostInteraction = useCallback(() => {
    setPostInteraction(null);
    setPostInteractionText("");
  }, []);

  const openPostInteraction = useCallback(
    (mode: "reply" | "quote", post: UserPost) => {
      if (!isAuthenticated) {
        Alert.alert("Sign in", mode === "reply" ? "Sign in to reply." : "Sign in to quote posts.");
        return;
      }
      tap();
      setPostInteraction({ mode, post });
      setPostInteractionText("");
    },
    [isAuthenticated],
  );

  const submitPostInteraction = useCallback(async () => {
    if (!postInteraction) return;
    const text = postInteractionText.trim();
    if (!text) return;
    setSubmittingInteraction(true);
    try {
      const viewer = {
        authorHandle: profile.handle || "@you",
        authorName: profile.displayName || "You",
        authorColor: profile.avatarColor,
      };
      const target = buildCommunityPostRef(postInteraction.post);
      if (postInteraction.mode === "reply") {
        await addPostReply({ post: target, content: text, ...viewer });
        patchPostEverywhere(qc, postInteraction.post.id, { commentsDelta: 1 });
      } else {
        await quotePost({ post: target, content: text, ...viewer });
        patchPostEverywhere(qc, postInteraction.post.id, { reposted: true, repostsDelta: postInteraction.post.reposted ? 0 : 1 });
      }
      closePostInteraction();
    } catch (e) {
      Alert.alert(
        postInteraction.mode === "reply" ? "Reply failed" : "Quote failed",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setSubmittingInteraction(false);
    }
  }, [addPostReply, buildCommunityPostRef, closePostInteraction, postInteraction, postInteractionText, profile.avatarColor, profile.displayName, profile.handle, qc, quotePost]);

  const onSharePost = useCallback(async (post: UserPost) => {
    tap();
    const author = post.authorUsername ? `@${post.authorUsername}` : profile.handle || profile.displayName;
    const ticker = post.ticker ? `\n\n${post.ticker.replace("$", "")}` : "";
    const url = `https://rork.com/post/${post.id}`;
    try {
      await Share.share({ message: `${post.text || "Crypto Community App post"}${ticker}\n\n— ${author}\n${url}`, url });
    } catch (e) {
      console.log("[profile] share post failed", e);
      await Clipboard.setStringAsync(url).catch(() => {});
    }
  }, [profile.displayName, profile.handle]);

  return (
    <View style={styles.root} testID="profile-screen">
      <AppBackground variant="social" />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.mint}
              colors={[Colors.mint]}
            />
          }
        >
          {/* HEADER */}
          <View style={styles.topBar}>
            <View style={styles.topTitleBlock}>
              <Text style={styles.headerKicker}>PROFILE</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>{profile.displayName}</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={onShareProfile} style={styles.iconBtn} testID="share-profile">
                <Share2 color={Colors.text} size={16} strokeWidth={2.4} />
              </Pressable>
              <Pressable onPress={() => setSettingsOpen(true)} style={styles.iconBtn} testID="open-settings">
                <Settings color={Colors.text} size={17} strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>

          {/* HERO: banner + identity */}
          <View style={styles.heroShell}>
            <Pressable onPress={onPickBanner} style={styles.bannerWrap} testID="pick-banner">
              {profile.bannerUrl ? (
                <Image
                  source={{ uri: profile.bannerUrl }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient
                  colors={["#0A1224", "#06080F", "#000000"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.25)", "rgba(6,8,15,0.95)"]}
                locations={[0, 0.55, 1]}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <View style={styles.bannerTopRow}>
                <View style={{ flex: 1 }} />
                <View style={styles.bannerEditBtn}>
                  <Camera color={Colors.text} size={11} strokeWidth={2.8} />
                </View>
              </View>
              {isUploading ? (
                <View style={styles.bannerUploadingBox}>
                  <Text style={styles.bannerUploading}>Uploading…</Text>
                </View>
              ) : null}
            </Pressable>

            <View style={styles.heroBody2}>
              <View style={styles.heroTopRow}>
                <Pressable onPress={onPickAvatar} style={styles.avatarWrap} testID="pick-avatar">
                  <View style={styles.avatarRing}>
                    {profile.avatarUrl ? (
                      <Image
                        source={{ uri: profile.avatarUrl }}
                        style={styles.avatarImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
                        <Text style={styles.avatarText}>
                          {(profile.displayName || "S").slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.avatarEditDot}>
                    <Camera color={Colors.ink} size={11} strokeWidth={3} />
                  </View>
                </Pressable>

                <View style={styles.heroActionsRow}>
                  <Pressable onPress={() => setEditOpen(true)} style={styles.primaryActionBtn} testID="edit-profile">
                    <Edit3 color={Colors.ink} size={13} strokeWidth={2.8} />
                    <Text style={styles.primaryActionText}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={onCopyAddress} style={styles.ghostActionBtn} testID="copy-address">
                    <Copy color={Colors.text} size={13} strokeWidth={2.6} />
                    <Text style={styles.ghostActionText}>
                      {profile.walletAddress ? shorten(profile.walletAddress) : "Add wallet"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.identityBlock}>
                <View style={styles.nameRow2}>
                  <Text style={styles.displayName} numberOfLines={1}>{profile.displayName}</Text>
                  {profile.verified ? (
                    <View style={styles.socialVerified}>
                      <ShieldCheck color={Colors.ink} size={12} strokeWidth={3} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.handle}>{profile.handle}</Text>
                {stackedBadges.length > 0 ? (
                  <View style={styles.badgeRow}>
                    <BadgeRow badges={stackedBadges} />
                  </View>
                ) : null}
                <Text style={[styles.bio, !profile.bio && styles.socialBioEmpty]}>
                  {profile.bio || "Add a bio, links, and your best alpha so people know why they should follow."}
                </Text>

                {(profile.location || profile.website || profile.twitterHandle) ? (
                  <View style={styles.metaRow}>
                    {profile.location ? (
                      <View style={styles.metaItem}>
                        <MapPin color={Colors.muted} size={11} strokeWidth={2.4} />
                        <Text style={styles.metaText}>{profile.location}</Text>
                      </View>
                    ) : null}
                    {profile.website ? (
                      <Pressable onPress={() => onOpenLink(profile.website)} style={styles.metaItem}>
                        <Globe color={Colors.cyan} size={11} strokeWidth={2.4} />
                        <Text style={[styles.metaText, { color: Colors.cyan }]} numberOfLines={1}>{profile.website}</Text>
                      </Pressable>
                    ) : null}
                    {profile.twitterHandle ? (
                      <Pressable
                        onPress={() => onOpenLink(`x.com/${profile.twitterHandle.replace("@", "")}`)}
                        style={styles.metaItem}
                      >
                        <Twitter color={Colors.cyan} size={11} strokeWidth={2.4} />
                        <Text style={[styles.metaText, { color: Colors.cyan }]}>
                          {profile.twitterHandle.startsWith("@") ? profile.twitterHandle : `@${profile.twitterHandle}`}
                        </Text>
                      </Pressable>
                    ) : null}
                    <View style={styles.metaItem}>
                      <Star color={Colors.muted} size={11} strokeWidth={2.4} />
                      <Text style={styles.metaText}>
                        Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Star color={Colors.muted} size={11} strokeWidth={2.4} />
                      <Text style={styles.metaText}>
                        Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* UNIFIED STATS + LEVEL CARD */}
          <View style={styles.unifiedCard}>
            <View style={styles.statsGridRowInner}>
              <Pressable
                style={styles.statGridCell}
                onPress={() => setFollowersOpen("following")}
                testID="open-following"
              >
                <Text style={styles.statGridNum}>{followingCount}</Text>
                <Text style={styles.statGridKey}>Following</Text>
              </Pressable>
              <View style={styles.statGridDiv} />
              <Pressable
                style={styles.statGridCell}
                onPress={() => setFollowersOpen("followers")}
                testID="open-followers"
              >
                <Text style={styles.statGridNum}>{followersCount}</Text>
                <Text style={styles.statGridKey}>Followers</Text>
              </Pressable>
              <View style={styles.statGridDiv} />
              <View style={styles.statGridCell}>
                <Text style={styles.statGridNum}>{stats.posts}</Text>
                <Text style={styles.statGridKey}>Posts</Text>
              </View>
              <View style={styles.statGridDiv} />
              <View style={styles.statGridCell}>
                <Text style={styles.statGridNum}>{stats.watching}</Text>
                <Text style={styles.statGridKey}>Watching</Text>
              </View>
            </View>

            <View style={styles.unifiedDivider} />

            <View style={styles.levelHeader}>
              <View style={styles.levelTitleRow}>
                <View style={[styles.levelIcon, { backgroundColor: `${rank.color}22`, borderColor: `${rank.color}55` }]}>
                  <rank.Icon color={rank.color} size={14} strokeWidth={2.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.levelEyebrow}>LEVEL {rank.level} · {rank.name.toUpperCase()}</Text>
                  <Text style={styles.levelTitle} numberOfLines={1}>
                    Next: {rank.next}
                  </Text>
                </View>
              </View>
              <Text style={styles.levelXP}>
                {rank.xpInLevel}/{rank.xpForNext} XP
              </Text>
            </View>
            <View style={styles.xpTrack}>
              <Animated.View style={[styles.xpFillWrap, { width: xpFillWidth }]}>
                <LinearGradient
                  colors={[Colors.mint, Colors.cyan, Colors.neon]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </Animated.View>
            </View>
          </View>

          {/* TABS — underline segmented */}
          <View style={styles.tabsBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      tap();
                      setTab(t.id);
                    }}
                    style={styles.tabBtn}
                    testID={`profile-tab-${t.id}`}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {t.label}
                    </Text>
                    <View style={[styles.tabIndicator, active && styles.tabIndicatorActive]} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {false && tab === ("overview" as unknown as Tab) && (
            <View style={styles.section}>
              <View style={styles.perfCard}>
                <View style={styles.perfHeader}>
                  <Text style={styles.sectionTitle}>Trader Performance</Text>
                  <View style={styles.perfBadge}>
                    <Zap color={Colors.orange} size={10} strokeWidth={3} />
                    <Text style={styles.perfBadgeText}>LIVE</Text>
                  </View>
                </View>
                <View style={styles.perfGrid}>
                  <PerfCell
                    label="PnL 30D"
                    value={`${profile.pnlPct >= 0 ? "+" : ""}${profile.pnlPct.toFixed(1)}%`}
                    Icon={profile.pnlPct >= 0 ? TrendingUp : TrendingDown}
                    color={profile.pnlPct >= 0 ? Colors.mint : Colors.rose}
                  />
                  <PerfCell label="Win Rate" value={`${profile.winRate}%`} Icon={Target} color={Colors.cyan} />
                  <PerfCell label="Trades" value={`${profile.trades}`} Icon={Activity} color={Colors.orange} />
                  <PerfCell label="Rank" value={rank.name} Icon={Trophy} color={rank.color} />
                </View>
              </View>

              <View style={styles.achievCard}>
                <View style={styles.perfHeader}>
                  <Text style={styles.sectionTitle}>Achievements</Text>
                  <Text style={styles.achievCount}>
                    {unlockedCount}/{achievements.length}
                  </Text>
                </View>
                <View style={styles.achievGrid}>
                  {achievements.map((a) => (
                    <View
                      key={a.id}
                      style={[
                        styles.achievItem,
                        { borderColor: a.unlocked ? `${a.color}55` : "rgba(255,255,255,0.06)" },
                        !a.unlocked && styles.achievLocked,
                      ]}
                    >
                      <View
                        style={[
                          styles.achievIcon,
                          { backgroundColor: a.unlocked ? `${a.color}1F` : "rgba(255,255,255,0.04)" },
                        ]}
                      >
                        <a.Icon
                          color={a.unlocked ? a.color : Colors.muted}
                          size={16}
                          strokeWidth={2.6}
                        />
                      </View>
                      <Text
                        style={[styles.achievTitle, !a.unlocked && { color: Colors.muted }]}
                        numberOfLines={1}
                      >
                        {a.title}
                      </Text>
                      <Text style={styles.achievDesc} numberOfLines={2}>
                        {a.desc}
                      </Text>
                      {!a.unlocked ? (
                        <View style={styles.achievBar}>
                          <View
                            style={[
                              styles.achievBarFill,
                              {
                                width: `${Math.min(100, Math.round((a.progress / a.goal) * 100))}%`,
                                backgroundColor: a.color,
                              },
                            ]}
                          />
                        </View>
                      ) : (
                        <View style={styles.achievUnlocked}>
                          <Check color={a.color} size={10} strokeWidth={3} />
                          <Text style={[styles.achievUnlockedText, { color: a.color }]}>UNLOCKED</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.menuSection}>
                {isAdmin ? (
                  <MenuRow
                    Icon={Shield}
                    label="Admin Console"
                    sub={`Logged in as ${adminRole ?? "admin"}`}
                    rightLabel="OPEN"
                    onPress={() => router.push("/admin")}
                  />
                ) : null}
                {isTeam ? (
                  <MenuRow
                    Icon={Shield}
                    label="Team Dashboard"
                    sub={`Moderator console · ${adminRole ?? "team"}`}
                    rightLabel="OPEN"
                    onPress={() => router.push("/team")}
                  />
                ) : null}
                <MenuRow
                  Icon={Bookmark}
                  label="Saved tokens"
                  sub={`${stats.watching} on watchlist`}
                  onPress={() => setTab("watchlist")}
                />
                <MenuRow
                  Icon={Award}
                  label={`${unlockedCount} achievements unlocked`}
                  sub={`${achievements.length - unlockedCount} more to earn`}
                  onPress={() => Alert.alert("Achievements", `You've unlocked ${unlockedCount}/${achievements.length}`)}
                />
              </View>
            </View>
          )}

          {tab === "holdings" && (
            <View style={styles.section}>
              <PortfolioCard />
              {watchlist.length === 0 ? (
                <EmptyTab
                  Icon={Gem}
                  title="No holdings tracked"
                  body="Add tokens from Discover to track your holdings, or connect a wallet to auto-sync your portfolio."
                  ctaLabel="Open Discover"
                  onCta={() => router.push("/discover")}
                />
              ) : (
                watchlist.map((w) => (
                  <View key={w.id} style={styles.listItem} testID={`watch-${w.id}`}>
                    <View style={styles.listAvatar}>
                      <Text style={styles.listAvatarText}>{w.ticker.slice(0, 2)}</Text>
                    </View>
                    <View style={styles.listMid}>
                      <Text style={styles.listTitle}>${w.ticker}</Text>
                      <Text style={styles.listSub} numberOfLines={1}>
                        {shorten(w.contract)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => onConfirmDelete(`${w.ticker}`, () => removeWatch(w.id))}
                      style={styles.listAction}
                      hitSlop={6}
                    >
                      <X color={Colors.muted} size={14} strokeWidth={2.6} />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          )}

          {tab === "communities" && (
            <View style={styles.section}>
              {joinedCommunities.length === 0 ? (
                <EmptyTab
                  Icon={Users}
                  title="No communities yet"
                  body="Join holders-only and public communities. Communities you join will show here on your profile."
                  ctaLabel="Browse communities"
                  onCta={() => router.push("/communities")}
                />
              ) : (
                <View style={styles.communityProfileGrid}>
                  {joinedCommunities.map((community) => (
                    <ProfileCommunityCard
                      key={community.id}
                      community={community}
                      onPress={() => router.push({ pathname: "/community/[id]", params: { id: community.id } })}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {false && tab === ("wallets" as unknown as Tab) && (
            <View style={styles.section}>
              {wallets.length === 0 ? (
                <EmptyTab
                  Icon={Wallet}
                  title="No wallets tracked"
                  body="Track any Solana wallet for live PnL, holdings, and transaction alerts."
                  ctaLabel="Open Wallet Tracker"
                  onCta={() => router.push({ pathname: "/tool/[id]", params: { id: "wallet-tracker" } })}
                />
              ) : (
                wallets.map((w) => (
                  <View key={w.id} style={styles.listItem} testID={`wallet-${w.id}`}>
                    <View style={[styles.listAvatar, { backgroundColor: "rgba(229,231,235,0.10)" }]}>
                      <Wallet color={Colors.cyan} size={15} strokeWidth={2.6} />
                    </View>
                    <View style={styles.listMid}>
                      <Text style={styles.listTitle}>{w.label}</Text>
                      <Text style={styles.listSub} numberOfLines={1}>
                        {shorten(w.address)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => onConfirmDelete(w.label, () => removeWallet(w.id))}
                      style={styles.listAction}
                      hitSlop={6}
                    >
                      <X color={Colors.muted} size={14} strokeWidth={2.6} />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          )}

          {false && tab === ("alerts" as unknown as Tab) && (
            <View style={styles.section}>
              {alerts.length === 0 ? (
                <EmptyTab
                  Icon={Bell}
                  title="No alerts set"
                  body="Set price, volume or whale-buy triggers to never miss a move."
                  ctaLabel="Open Alerts"
                  onCta={() => router.push({ pathname: "/tool/[id]", params: { id: "alerts" } })}
                />
              ) : (
                alerts.map((a) => (
                  <View key={a.id} style={styles.listItem} testID={`alert-${a.id}`}>
                    <View style={[styles.listAvatar, { backgroundColor: "rgba(201,206,216,0.10)" }]}>
                      <Bell color={Colors.orange} size={15} strokeWidth={2.6} />
                    </View>
                    <View style={styles.listMid}>
                      <Text style={styles.listTitle}>${a.ticker}</Text>
                      <Text style={styles.listSub}>
                        {alertLabel(a.type)} · {a.value}
                      </Text>
                    </View>
                    <Switch
                      value={a.enabled}
                      onValueChange={() => toggleAlert(a.id)}
                      trackColor={{ false: "rgba(255,255,255,0.1)", true: Colors.mint }}
                      thumbColor={a.enabled ? Colors.ink : Colors.muted}
                      testID={`alert-toggle-${a.id}`}
                    />
                    <Pressable
                      onPress={() => onConfirmDelete(`alert for $${a.ticker}`, () => removeAlert(a.id))}
                      style={styles.listAction}
                      hitSlop={6}
                    >
                      <X color={Colors.muted} size={14} strokeWidth={2.6} />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          )}

          {tab === "posts" && (
            <View style={styles.section}>
              {posts.length === 0 ? (
                <EmptyTab
                  Icon={Pencil}
                  title="No posts yet"
                  body="Share alpha, charts, and takes with the $OGS community."
                  ctaLabel="Compose post"
                  onCta={() => router.push("/compose")}
                />
              ) : (
                <View style={styles.profileFeedList}>
                  {posts.map((p) => (
                    <ProfileFeedPostCard
                      key={p.id}
                      post={p}
                      displayName={profile.displayName || "You"}
                      handle={profile.handle || "@you"}
                      avatarColor={profile.avatarColor}
                      avatarUrl={profile.avatarUrl ?? null}
                      verified={profile.verified}
                      community={p.communityId ? communityById.get(p.communityId) : undefined}
                      onOpenCommunity={(id) => router.push({ pathname: "/community/[id]", params: { id } })}
                      onLike={() => {
                        tap();
                        togglePostLike(p.id).catch((e) => {
                          console.log("[profile] like failed", e);
                          Alert.alert("Like failed", e instanceof Error ? e.message : "Try again.");
                        });
                      }}
                      onRepost={() => {
                        tap();
                        togglePostRepost(p.id).catch((e) => {
                          console.log("[profile] repost failed", e);
                          Alert.alert("Repost failed", e instanceof Error ? e.message : "Try again.");
                        });
                      }}
                      onQuote={() => openPostInteraction("quote", p)}
                      onComment={() => openPostInteraction("reply", p)}
                      onShare={() => onSharePost(p)}
                      onDelete={() => onConfirmDelete("post", () => deletePost(p.id))}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {false && tab === ("listings" as unknown as Tab) && (
            <View style={styles.section}>
              {myListings.length === 0 ? (
                <EmptyTab
                  Icon={Rocket}
                  title="No listings yet"
                  body="Submit your token to Discover and get in front of traders after admin approval."
                  ctaLabel="List a token"
                  onCta={() => router.push("/list-token")}
                />
              ) : (
                myListings.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => router.push({ pathname: "/launch/[id]", params: { id: l.id } })}
                    style={styles.listItem}
                    testID={`listing-${l.id}`}
                  >
                    <View style={[styles.listAvatar, { backgroundColor: "rgba(184,190,200,0.10)" }]}>
                      <Rocket color="#B8BEC8" size={15} strokeWidth={2.6} />
                    </View>
                    <View style={styles.listMid}>
                      <Text style={styles.listTitle}>${l.ticker}</Text>
                      <Text style={styles.listSub} numberOfLines={1}>
                        {l.name}
                      </Text>
                    </View>
                    <ChevronRight color={Colors.muted} size={15} strokeWidth={2.4} />
                  </Pressable>
                ))
              )}
            </View>
          )}

          {tab === "activity" && (
            <View style={styles.section}>
              <View style={profileBlockStyles.gap}>
                <RecapCard userId={userId ?? null} />
              </View>
              {activity.length === 0 ? (
                <EmptyTab
                  Icon={Activity}
                  title="No activity yet"
                  body="Your watchlist adds, alerts, posts, and listings will show up here."
                  ctaLabel="Explore Discover"
                  onCta={() => router.push("/discover")}
                />
              ) : (
                activity.map((it) => (
                  <View key={it.id} style={styles.activityItem}>
                    <View style={[styles.activityIcon, { backgroundColor: `${it.color}1F` }]}>
                      <it.Icon color={it.color} size={14} strokeWidth={2.6} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityTitle}>{it.title}</Text>
                      <Text style={styles.activitySub} numberOfLines={1}>
                        {it.sub}
                      </Text>
                    </View>
                    <Text style={styles.activityTime}>{timeAgo(it.ts)}</Text>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <EditProfileModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        initial={profile}
        avatarUrl={profile.avatarUrl ?? null}
        bannerUrl={profile.bannerUrl ?? null}
        isUploading={isUploading}
        onPickAvatar={onPickAvatar}
        onPickBanner={onPickBanner}
        onClearAvatar={async () => {
          await updateProfile({ avatarUrl: "" });
        }}
        onClearBanner={async () => {
          await updateProfile({ bannerUrl: "" });
        }}
        onSave={async (vals) => {
          const w = (vals.walletAddress ?? "").trim();
          if (w && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) {
            Alert.alert(
              "Invalid Solana address",
              "Paste a valid base58 Solana address. We never connect to your wallet \u2014 we only read on-chain data.",
            );
            return;
          }
          await updateProfile({ ...vals, walletAddress: w });
          qc.invalidateQueries({ queryKey: ["profile", "portfolio"] });
          setEditOpen(false);
        }}
      />

      <FollowListModal
        visible={followersOpen !== null}
        onClose={() => setFollowersOpen(null)}
        kind={followersOpen}
        userId={userId}
      />

      <SearchProfilesModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        onUpdate={updatePrefs}
        onResetData={async () => {
          await resetAllData();
          setSettingsOpen(false);
          Alert.alert("Reset", "All local data was cleared.");
        }}
      />

      <PostInteractionModal
        interaction={postInteraction}
        text={postInteractionText}
        submitting={submittingInteraction}
        onChangeText={setPostInteractionText}
        onClose={closePostInteraction}
        onSubmit={submitPostInteraction}
      />
    </View>
  );
}

function BadgePill({ badge }: { badge: CustomBadge }) {
  const color = badge.color ?? "#F4F4F5";
  return (
    <View style={[styles.customBadge, { borderColor: `${color}55`, backgroundColor: `${color}1A` }]}>
      <Sparkles color={color} size={10} strokeWidth={3} />
      <Text style={[styles.customBadgeText, { color }]} numberOfLines={1}>
        {badge.label}
      </Text>
    </View>
  );
}

function FollowListModal({
  visible,
  onClose,
  kind,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  kind: "followers" | "following" | null;
  userId: string | null;
}) {
  const router = useRouter();
  const list = useFollowList(userId, kind ?? "followers");
  const items = list.data ?? [];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { maxHeight: "82%" }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {kind === "following" ? "Following" : "Followers"}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X color={Colors.muted} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <Text style={styles.emptyTabBody}>
                {list.isLoading ? "Loading…" : "No one here yet."}
              </Text>
            ) : (
              items.map((u) => (
                <Pressable
                  key={u.user_id}
                  style={styles.followRowItem}
                  onPress={() => {
                    if (!u.username) return;
                    onClose();
                    router.push({ pathname: "/u/[handle]", params: { handle: u.username } });
                  }}
                  testID={`follow-row-${u.user_id}`}
                >
                  <View style={styles.followAvatar}>
                    {u.avatar_url ? (
                      <Image source={{ uri: u.avatar_url }} style={styles.followAvatarImg} contentFit="cover" />
                    ) : (
                      <Text style={styles.followAvatarText}>
                        {(u.display_name ?? u.username ?? "?").slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.followRowName} numberOfLines={1}>
                        {u.display_name ?? u.username ?? "User"}
                      </Text>
                      {u.verified ? <ShieldCheck color={Colors.cyan} size={11} strokeWidth={3} /> : null}
                    </View>
                    <Text style={styles.followRowSub} numberOfLines={1}>
                      @{u.username ?? "—"}
                    </Text>
                    {u.custom_badges.length > 0 ? (
                      <View style={styles.badgeRowSmall}>
                        {u.custom_badges.slice(0, 2).map((b) => (
                          <BadgePill key={b.id} badge={b} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <ChevronRight color={Colors.muted} size={14} strokeWidth={2.4} />
                </Pressable>
              ))
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SearchProfilesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState<string>("");
  const search = useSearchProfiles(query.trim());
  const items: ProfileSummary[] = search.data ?? [];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { maxHeight: "82%" }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Find traders</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X color={Colors.muted} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.modalInput}
            placeholderTextColor={Colors.muted}
            placeholder="Search by name or @handle"
            autoCapitalize="none"
            autoCorrect={false}
            testID="search-traders"
          />
          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
            {items.length === 0 ? (
              <Text style={styles.emptyTabBody}>
                {search.isLoading ? "Loading…" : "No traders match."}
              </Text>
            ) : (
              items.map((u) => (
                <Pressable
                  key={u.user_id}
                  style={styles.followRowItem}
                  onPress={() => {
                    if (!u.username) return;
                    onClose();
                    router.push({ pathname: "/u/[handle]", params: { handle: u.username } });
                  }}
                >
                  <View style={styles.followAvatar}>
                    {u.avatar_url ? (
                      <Image source={{ uri: u.avatar_url }} style={styles.followAvatarImg} contentFit="cover" />
                    ) : (
                      <Text style={styles.followAvatarText}>
                        {(u.display_name ?? u.username ?? "?").slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.followRowName} numberOfLines={1}>
                        {u.display_name ?? u.username ?? "User"}
                      </Text>
                      {u.verified ? <ShieldCheck color={Colors.cyan} size={11} strokeWidth={3} /> : null}
                    </View>
                    <Text style={styles.followRowSub}>
                      @{u.username ?? "—"} · {u.followers_count ?? 0} followers
                    </Text>
                  </View>
                  <ChevronRight color={Colors.muted} size={14} strokeWidth={2.4} />
                </Pressable>
              ))
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function alertLabel(type: "price-above" | "price-below" | "volume-spike" | "whale-buy"): string {
  switch (type) {
    case "price-above":
      return "Price above";
    case "price-below":
      return "Price below";
    case "volume-spike":
      return "Volume spike";
    case "whale-buy":
      return "Whale buy";
  }
}

function HighlightBubble({
  label,
  value,
  accent,
  Icon,
  onPress,
}: {
  label: string;
  value: number;
  accent: string;
  Icon: LucideIcon;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.highlightBubble} testID={`profile-highlight-${label.toLowerCase()}`}>
      <LinearGradient
        colors={[accent, "rgba(255,255,255,0.88)", accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.highlightRing}
      >
        <View style={styles.highlightInner}>
          <Icon color={accent} size={18} strokeWidth={2.8} />
          <Text style={styles.highlightValue}>{value}</Text>
        </View>
      </LinearGradient>
      <Text style={styles.highlightLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function StatCard({
  label,
  value,
  accent,
  Icon,
}: {
  label: string;
  value: number;
  accent: string;
  Icon: LucideIcon;
}) {
  return (
    <View style={[styles.statCard, { borderColor: `${accent}33` }]}>
      <View style={[styles.statIconBox, { backgroundColor: `${accent}1A` }]}>
        <Icon color={accent} size={14} strokeWidth={2.6} />
      </View>
      <Text style={styles.statNum}>{value}</Text>
      <Text style={styles.statKey}>{label}</Text>
    </View>
  );
}

function PerfCell({
  label,
  value,
  Icon,
  color,
}: {
  label: string;
  value: string;
  Icon: LucideIcon;
  color: string;
}) {
  return (
    <View style={[styles.perfCell, { borderColor: `${color}33` }]}>
      <View style={[styles.perfIcon, { backgroundColor: `${color}1A` }]}>
        <Icon color={color} size={13} strokeWidth={2.6} />
      </View>
      <Text style={styles.perfLabel}>{label}</Text>
      <Text style={[styles.perfValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function EmptyTab({
  Icon,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View style={styles.emptyTab}>
      <View style={styles.emptyTabIcon}>
        <Icon color={Colors.mint} size={22} strokeWidth={2.4} />
      </View>
      <Text style={styles.emptyTabTitle}>{title}</Text>
      <Text style={styles.emptyTabBody}>{body}</Text>
      <Pressable onPress={onCta} style={styles.emptyTabBtn}>
        <Text style={styles.emptyTabBtnText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

function MenuRow({
  Icon,
  label,
  sub,
  onPress,
  danger,
  rightLabel,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  onPress: () => void;
  danger?: boolean;
  rightLabel?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuRow}>
      <View style={[styles.menuIcon, danger && { backgroundColor: "rgba(244,244,245,0.08)" }]}>
        <Icon color={danger ? Colors.rose : Colors.mint} size={15} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, danger && { color: Colors.rose }]}>{label}</Text>
        <Text style={styles.menuSub}>{sub}</Text>
      </View>
      {rightLabel ? <Text style={styles.menuRight}>{rightLabel}</Text> : null}
      <ChevronRight color={Colors.muted} size={15} strokeWidth={2.4} />
    </Pressable>
  );
}

function EditProfileModal({
  visible,
  onClose,
  initial,
  avatarUrl,
  bannerUrl,
  isUploading,
  onPickAvatar,
  onPickBanner,
  onClearAvatar,
  onClearBanner,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  initial: {
    displayName: string;
    handle: string;
    bio: string;
    avatarColor: string;
    bannerFrom: string;
    bannerTo: string;
    walletAddress: string;
    twitterHandle: string;
    website: string;
    location: string;
  };
  avatarUrl: string | null;
  bannerUrl: string | null;
  isUploading: boolean;
  onPickAvatar: () => Promise<void> | void;
  onPickBanner: () => Promise<void> | void;
  onClearAvatar: () => Promise<void> | void;
  onClearBanner: () => Promise<void> | void;
  onSave: (vals: {
    displayName: string;
    handle: string;
    bio: string;
    avatarColor: string;
    bannerFrom: string;
    bannerTo: string;
    walletAddress: string;
    twitterHandle: string;
    website: string;
    location: string;
  }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState<string>(initial.displayName);
  const [handle, setHandle] = useState<string>(initial.handle);
  const [bio, setBio] = useState<string>(initial.bio);
  const [color, setColor] = useState<string>(initial.avatarColor);
  const [bannerFrom, setBannerFrom] = useState<string>(initial.bannerFrom);
  const [bannerTo, setBannerTo] = useState<string>(initial.bannerTo);
  const [walletAddress, setWalletAddress] = useState<string>(initial.walletAddress);
  const [twitterHandle, setTwitterHandle] = useState<string>(initial.twitterHandle);
  const [website, setWebsite] = useState<string>(initial.website);
  const [location, setLocation] = useState<string>(initial.location);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) return;
    setDisplayName(initial.displayName);
    setHandle(initial.handle);
    setBio(initial.bio);
    setColor(initial.avatarColor);
    setBannerFrom(initial.bannerFrom);
    setBannerTo(initial.bannerTo);
    setWalletAddress(initial.walletAddress);
    setTwitterHandle(initial.twitterHandle);
    setWebsite(initial.website);
    setLocation(initial.location);
  }, [
    visible,
    initial.displayName,
    initial.handle,
    initial.bio,
    initial.avatarColor,
    initial.bannerFrom,
    initial.bannerTo,
    initial.walletAddress,
    initial.twitterHandle,
    initial.website,
    initial.location,
  ]);

  const COLORS = [Colors.mint, Colors.cyan, Colors.orange, Colors.rose, "#B8BEC8", "#F4F4F5", "#FFFFFF"];
  const BANNERS: { from: string; to: string }[] = [
    { from: Colors.rose, to: Colors.cyan },
    { from: Colors.mint, to: Colors.cyan },
    { from: Colors.orange, to: Colors.rose },
    { from: "#B8BEC8", to: Colors.cyan },
    { from: "#F4F4F5", to: Colors.rose },
    { from: Colors.ink, to: Colors.mint },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { maxHeight: "92%" }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit profile</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X color={Colors.muted} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalLabel}>BANNER</Text>
            <Pressable
              onPress={onPickBanner}
              style={styles.uploadCard}
              testID="upload-banner-card"
              disabled={isUploading}
            >
              {bannerUrl ? (
                <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <LinearGradient
                  colors={[initial.bannerFrom, initial.bannerTo]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
              <LinearGradient
                colors={["rgba(3,7,8,0)", "rgba(3,7,8,0.55)"]}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <View style={styles.uploadCardOverlay}>
                <Camera color={Colors.text} size={14} strokeWidth={2.8} />
                <Text style={styles.uploadCardText}>
                  {isUploading ? "Uploading\u2026" : bannerUrl ? "Change banner image" : "Upload custom banner"}
                </Text>
              </View>
              {bannerUrl ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onClearBanner();
                  }}
                  style={styles.uploadClearBtn}
                  hitSlop={8}
                  testID="clear-banner-image"
                >
                  <Trash2 color={Colors.text} size={12} strokeWidth={2.8} />
                </Pressable>
              ) : null}
            </Pressable>

            <Text style={[styles.modalLabel, { marginTop: 14 }]}>OR PICK A GRADIENT</Text>
            <View style={styles.bannerPickerRow}>
              {BANNERS.map((b) => {
                const active = b.from === bannerFrom && b.to === bannerTo;
                return (
                  <Pressable
                    key={`${b.from}-${b.to}`}
                    onPress={() => {
                      setBannerFrom(b.from);
                      setBannerTo(b.to);
                    }}
                    style={[styles.bannerPick, active && styles.bannerPickActive]}
                  >
                    <LinearGradient
                      colors={[b.from, b.to]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.bannerPickGrad}
                    >
                      {active ? <Check color={Colors.text} size={14} strokeWidth={3} /> : null}
                    </LinearGradient>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.modalLabel}>AVATAR</Text>
            <View style={styles.avatarUploadRow}>
              <Pressable
                onPress={onPickAvatar}
                style={styles.avatarUploadPreview}
                testID="upload-avatar-card"
                disabled={isUploading}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: color, alignItems: "center", justifyContent: "center" }]}>
                    <Text style={styles.avatarUploadInitial}>
                      {(displayName || "S").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.avatarUploadDot}>
                  <Camera color={Colors.ink} size={11} strokeWidth={3} />
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Pressable
                  onPress={onPickAvatar}
                  style={styles.uploadBtn}
                  testID="upload-avatar-btn"
                  disabled={isUploading}
                >
                  <Camera color={Colors.text} size={13} strokeWidth={2.6} />
                  <Text style={styles.uploadBtnText}>
                    {isUploading ? "Uploading\u2026" : avatarUrl ? "Change photo" : "Upload photo"}
                  </Text>
                </Pressable>
                {avatarUrl ? (
                  <Pressable
                    onPress={onClearAvatar}
                    style={[styles.uploadBtn, styles.uploadBtnGhost]}
                    testID="clear-avatar-image"
                  >
                    <Trash2 color={Colors.rose} size={12} strokeWidth={2.6} />
                    <Text style={[styles.uploadBtnText, { color: Colors.rose }]}>Remove photo</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Text style={styles.modalLabel}>AVATAR COLOR</Text>
            <View style={styles.colorRow}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                >
                  {color === c ? <Check color={Colors.ink} size={14} strokeWidth={3} /> : null}
                </Pressable>
              ))}
            </View>

            <Text style={styles.modalLabel}>DISPLAY NAME</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              style={styles.modalInput}
              placeholderTextColor={Colors.muted}
              placeholder="Your name"
              maxLength={30}
            />

            <Text style={styles.modalLabel}>HANDLE</Text>
            <TextInput
              value={handle}
              onChangeText={(v) => setHandle(v.startsWith("@") ? v : `@${v.replace(/[^a-zA-Z0-9_]/g, "")}`)}
              style={styles.modalInput}
              placeholderTextColor={Colors.muted}
              placeholder="@yourhandle"
              autoCapitalize="none"
              maxLength={20}
            />

            <Text style={styles.modalLabel}>BIO</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              style={[styles.modalInput, { height: 80, textAlignVertical: "top" }]}
              placeholderTextColor={Colors.muted}
              placeholder="Tell traders about yourself"
              multiline
              maxLength={160}
            />
            <Text style={styles.modalHint}>{bio.length}/160</Text>

            <Text style={styles.modalLabel}>SOLANA ADDRESS (READ-ONLY SCAN)</Text>
            <TextInput
              value={walletAddress}
              onChangeText={setWalletAddress}
              style={styles.modalInput}
              placeholderTextColor={Colors.muted}
              placeholder="Paste your SOL address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalHint}>
              We never connect to your wallet. We only scan public on-chain data to display your holdings.
            </Text>

            <Text style={styles.modalLabel}>TWITTER / X</Text>
            <TextInput
              value={twitterHandle}
              onChangeText={setTwitterHandle}
              style={styles.modalInput}
              placeholderTextColor={Colors.muted}
              placeholder="@yourhandle"
              autoCapitalize="none"
            />

            <Text style={styles.modalLabel}>WEBSITE</Text>
            <TextInput
              value={website}
              onChangeText={setWebsite}
              style={styles.modalInput}
              placeholderTextColor={Colors.muted}
              placeholder="yoursite.xyz"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.modalLabel}>LOCATION</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              style={styles.modalInput}
              placeholderTextColor={Colors.muted}
              placeholder="On-chain"
              maxLength={40}
            />

            <Pressable
              disabled={saving}
              onPress={async () => {
                const cleanDisplayName = displayName.trim();
                const cleanHandle = handle.replace(/^@/, "").trim();
                if (!cleanDisplayName || !cleanHandle) {
                  Alert.alert("Missing profile info", "Display name and handle are required.");
                  return;
                }
                setSaving(true);
                try {
                  await onSave({
                    displayName: cleanDisplayName,
                    handle: `@${cleanHandle}`,
                    bio: bio.trim(),
                    avatarColor: color,
                    bannerFrom,
                    bannerTo,
                    walletAddress: walletAddress.trim(),
                    twitterHandle: twitterHandle.trim(),
                    website: website.trim(),
                    location: location.trim(),
                  });
                } catch (e) {
                  Alert.alert("Save failed", e instanceof Error ? e.message : "Could not save profile.");
                } finally {
                  setSaving(false);
                }
              }}
              style={styles.saveBtn}
              testID="save-profile"
            >
              <LinearGradient
                colors={[Colors.mint, Colors.cyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.saveGrad}
              >
                <Text style={styles.saveText}>{saving ? "Saving…" : "Save changes"}</Text>
              </LinearGradient>
            </Pressable>
            <View style={{ height: 18 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SettingsModal({
  visible,
  onClose,
  prefs,
  onUpdate,
  onResetData,
}: {
  visible: boolean;
  onClose: () => void;
  prefs: UserPrefs;
  onUpdate: (p: Partial<UserPrefs>) => Promise<void>;
  onResetData: () => Promise<void>;
}) {
  const router = useRouter();
  const { isAuthenticated, signOut, deleteAccount, isDeletingAccount } = useAuth();
  const { profile } = useApp();
  const accountLabel = profile.handle || profile.displayName || "Signed in";
  const [section, setSection] = useState<"main" | "appearance" | "about">("main");

  const onConfirmDelete = useCallback(() => {
    if (!isAuthenticated) {
      Alert.alert("Sign in", "You must be signed in to delete your account.");
      return;
    }
    Alert.alert(
      "Delete account?",
      "This permanently deletes your Crypto Community App account, profile, posts, and synced data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              "This is your final confirmation. Your account and data will be erased.",
              [
                { text: "Keep account", style: "cancel" },
                {
                  text: "Delete forever",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      onClose();
                      router.replace("/auth");
                    } catch (e) {
                      Alert.alert(
                        "Delete failed",
                        e instanceof Error ? e.message : "Could not delete account. Try again.",
                      );
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [deleteAccount, isAuthenticated, onClose, router]);

  const onConfirmReset = useCallback(() => {
    Alert.alert(
      "Reset everything?",
      "This clears posts, watchlist, alerts, wallets, and profile data on this device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => onResetData() },
      ],
    );
  }, [onResetData]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { maxHeight: "92%" }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            {section !== "main" ? (
              <Pressable onPress={() => setSection("main")} hitSlop={8} style={styles.backLink}>
                <ChevronRight
                  color={Colors.text}
                  size={18}
                  strokeWidth={2.6}
                  style={{ transform: [{ rotate: "180deg" }] }}
                />
                <Text style={styles.backLinkText}>Settings</Text>
              </Pressable>
            ) : (
              <Text style={styles.modalTitle}>Settings</Text>
            )}
            <Pressable onPress={onClose} hitSlop={8}>
              <X color={Colors.muted} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {section === "main" && (
              <>
                <Text style={styles.settingsGroup}>NOTIFICATIONS</Text>
                <SettingRow
                  label="Push notifications"
                  sub="Price moves & alerts"
                  Icon={Bell}
                  value={prefs.push}
                  onChange={(v) => onUpdate({ push: v })}
                />
                <SettingRow
                  label="Whale alerts"
                  sub="Big buys above $10k"
                  Icon={Gem}
                  value={prefs.whaleAlerts}
                  onChange={(v) => onUpdate({ whaleAlerts: v })}
                />

                <Text style={styles.settingsGroup}>FEEDBACK</Text>
                <SettingRow
                  label="Haptics"
                  sub="Tap feedback"
                  Icon={Vibrate}
                  value={prefs.haptics}
                  onChange={(v) => onUpdate({ haptics: v })}
                />

                <Text style={styles.settingsGroup}>PREFERENCES</Text>
                <MenuRow
                  Icon={Sparkles}
                  label="Appearance"
                  sub="Theme, language, currency"
                  onPress={() => setSection("appearance")}
                  rightLabel={prefs.currency}
                />

                <Text style={styles.settingsGroup}>ACCOUNT</Text>
                <MenuRow
                  Icon={Users}
                  label="Blocked users"
                  sub="Manage blocked traders"
                  onPress={() => router.push("/blocked-users")}
                />

                <Text style={styles.settingsGroup}>SUPPORT</Text>
                <MenuRow
                  Icon={HelpCircle}
                  label="Help & support"
                  sub="Telegram @ogscandev"
                  onPress={() => Alert.alert("Support", "Message us on Telegram @ogscandev")}
                />
                <MenuRow
                  Icon={ExternalLink}
                  label="About Crypto Community App"
                  sub="Version, terms, privacy"
                  onPress={() => setSection("about")}
                />

                <Text style={styles.settingsGroup}>DANGER ZONE</Text>
                <MenuRow
                  Icon={Trash2}
                  label="Reset local data"
                  sub="Clear everything on this device"
                  danger
                  onPress={onConfirmReset}
                />
                {isAuthenticated ? (
                  <MenuRow
                    Icon={Trash2}
                    label={isDeletingAccount ? "Deleting account…" : "Delete account"}
                    sub="Permanently erase your data"
                    danger
                    onPress={onConfirmDelete}
                  />
                ) : null}
                <MenuRow
                  Icon={LogOut}
                  label={isAuthenticated ? "Sign out" : "Sign in / Create account"}
                  sub={isAuthenticated ? accountLabel : "Sync your data across devices"}
                  danger={isAuthenticated}
                  onPress={async () => {
                    if (isAuthenticated) {
                      Alert.alert("Sign out", "Are you sure you want to sign out?", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Sign out",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await signOut();
                              router.replace("/auth");
                            } catch (e) {
                              Alert.alert("Sign out failed", e instanceof Error ? e.message : "Try again");
                            }
                          },
                        },
                      ]);
                    } else {
                      router.push("/auth");
                    }
                  }}
                />
                <View style={{ height: 24 }} />
              </>
            )}

            {section === "appearance" && (
              <>
                <Text style={styles.settingsGroup}>THEME</Text>
                <View style={styles.chipsRow}>
                  {(["dark", "midnight", "sunset"] as ThemeMode[]).map((t) => {
                    const active = prefs.theme === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => onUpdate({ theme: t })}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.settingsGroup}>CURRENCY</Text>
                <View style={styles.chipsRow}>
                  {(["USD", "EUR", "GBP", "SOL"] as Currency[]).map((c) => {
                    const active = prefs.currency === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => onUpdate({ currency: c })}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.settingsGroup}>LANGUAGE</Text>
                <View style={styles.chipsRow}>
                  {(
                    [
                      { id: "en", label: "English" },
                      { id: "es", label: "Español" },
                      { id: "fr", label: "Français" },
                      { id: "de", label: "Deutsch" },
                      { id: "jp", label: "日本語" },
                    ] as { id: Language; label: string }[]
                  ).map((l) => {
                    const active = prefs.language === l.id;
                    return (
                      <Pressable
                        key={l.id}
                        onPress={() => onUpdate({ language: l.id })}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Languages
                          color={active ? Colors.ink : Colors.text}
                          size={11}
                          strokeWidth={2.6}
                        />
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{l.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ height: 24 }} />
              </>
            )}

            {section === "about" && (
              <>
                <View style={styles.aboutCard}>
                  <View style={styles.aboutLogo}>
                    <Sparkles color={Colors.ink} size={22} strokeWidth={3} />
                  </View>
                  <Text style={styles.aboutTitle}>Crypto Community App</Text>
                  <Text style={styles.aboutSub}>Pro Trading Suite · v5.0.0</Text>
                </View>
                <MenuRow
                  Icon={ExternalLink}
                  label="Terms of service"
                  sub="Read the legal stuff"
                  onPress={() => router.push("/legal/terms")}
                />
                <MenuRow
                  Icon={Shield}
                  label="Privacy policy"
                  sub="How we handle data"
                  onPress={() => router.push("/legal/privacy")}
                />
                <MenuRow
                  Icon={Camera}
                  label="Open-source licenses"
                  sub="Credits"
                  onPress={() => router.push("/legal/licenses")}
                />
                <View style={{ height: 24 }} />
              </>
            )}
          </ScrollView>

          {section === "main" ? null : (
            <Pressable onPress={onClose} style={styles.saveBtn}>
              <LinearGradient
                colors={[Colors.mint, Colors.cyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.saveGrad}
              >
                <Text style={styles.saveText}>Done</Text>
              </LinearGradient>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SettingRow({
  label,
  sub,
  value,
  onChange,
  Icon,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  Icon?: LucideIcon;
}) {
  return (
    <View style={styles.settingRow}>
      {Icon ? (
        <View style={styles.settingIcon}>
          <Icon color={Colors.mint} size={14} strokeWidth={2.6} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "rgba(255,255,255,0.1)", true: Colors.mint }}
        thumbColor={value ? Colors.ink : Colors.muted}
      />
    </View>
  );
}

function ProfileFeedPostCard({
  post,
  displayName,
  handle,
  avatarColor,
  avatarUrl,
  verified,
  community,
  onOpenCommunity,
  onLike,
  onRepost,
  onQuote,
  onComment,
  onShare,
  onDelete,
}: {
  post: UserPost;
  displayName: string;
  handle: string;
  avatarColor: string;
  avatarUrl?: string | null;
  verified: boolean;
  community?: Community;
  onOpenCommunity: (id: string) => void;
  onLike: () => void;
  onRepost: () => void;
  onQuote: () => void;
  onComment: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const shownHandle = handle.startsWith("@") ? handle : `@${handle}`;
  return (
    <View style={styles.feedPostCard} testID={`my-post-${post.id}`}>
      <View style={[styles.feedPostAvatar, { backgroundColor: avatarColor || Colors.mint }]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.feedPostAvatarImg} contentFit="cover" />
        ) : (
          <Text style={styles.feedPostAvatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.feedPostBody}>
        <View style={styles.feedPostHeaderRow}>
          <Text style={styles.feedPostName} numberOfLines={1}>{displayName}</Text>
          {verified ? <ShieldCheck color={Colors.cyan} size={13} strokeWidth={3} /> : null}
          <Text style={styles.feedPostHandle} numberOfLines={1}>{shownHandle}</Text>
          <Text style={styles.feedPostDot}>·</Text>
          <Text style={styles.feedPostTime}>{shortTimeAgo(post.createdAt)}</Text>
          <Pressable onPress={onDelete} hitSlop={8} style={styles.feedDeleteBtn} testID={`delete-post-${post.id}`}>
            <X color={Colors.muted} size={14} strokeWidth={2.6} />
          </Pressable>
        </View>
        {community ? (
          <Pressable onPress={() => onOpenCommunity(community.id)} style={styles.feedCommunityChip} testID={`post-community-${post.id}`}>
            <Text style={styles.feedCommunityEmoji}>{community.iconEmoji}</Text>
            <Text style={styles.feedCommunityText} numberOfLines={1}>{community.name}</Text>
          </Pressable>
        ) : null}
        {post.text ? <Text style={styles.feedPostText}>{post.text}</Text> : null}
        {post.images && post.images.length > 0 ? <ProfilePostImageGrid images={post.images} /> : null}
        {post.ticker ? <ProfileTickerCard ticker={post.ticker} changePct={post.changePct ?? 0} /> : null}
        <View style={styles.feedActionsRow}>
          <Pressable onPress={onComment} style={styles.feedActionBtn} hitSlop={8} testID={`comment-profile-${post.id}`}>
            <MessageCircle color={Colors.muted} size={16} strokeWidth={2.3} />
            <Text style={styles.feedActionText}>{formatCount(post.comments)}</Text>
          </Pressable>
          <Pressable onPress={onRepost} style={styles.feedActionBtn} hitSlop={8} testID={`repost-profile-${post.id}`}>
            <Repeat2 color={post.reposted ? Colors.mint : Colors.muted} size={17} strokeWidth={2.3} />
            <Text style={[styles.feedActionText, post.reposted && { color: Colors.mint }]}>{formatCount(post.reposts)}</Text>
          </Pressable>
          <Pressable onPress={onQuote} style={styles.feedActionBtn} hitSlop={8} testID={`quote-profile-${post.id}`}>
            <Quote color={Colors.muted} size={15} strokeWidth={2.3} />
          </Pressable>
          <Pressable onPress={onLike} style={styles.feedActionBtn} hitSlop={8} testID={`like-profile-${post.id}`}>
            <Heart color={post.liked ? Colors.rose : Colors.muted} fill={post.liked ? Colors.rose : "transparent"} size={16} strokeWidth={2.3} />
            <Text style={[styles.feedActionText, post.liked && { color: Colors.rose }]}>{formatCount(post.likes)}</Text>
          </Pressable>
          <Pressable onPress={onShare} style={styles.feedActionBtn} hitSlop={8} testID={`share-profile-post-${post.id}`}>
            <Share2 color={Colors.muted} size={15} strokeWidth={2.3} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ProfilePostImageGrid({ images }: { images: string[] }) {
  const visible = images.filter(Boolean).slice(0, 4);
  if (visible.length === 0) return null;
  if (visible.length === 1) {
    return (
      <View style={styles.feedImageSolo}>
        <Image source={{ uri: visible[0] }} style={styles.feedImage} contentFit="cover" />
      </View>
    );
  }
  return (
    <View style={visible.length === 2 ? styles.feedImageRow : styles.feedImageGrid}>
      {visible.map((uri, index) => (
        <View key={`${uri}-${index}`} style={visible.length === 2 ? styles.feedImageHalf : styles.feedImageQuad}>
          <Image source={{ uri }} style={styles.feedImage} contentFit="cover" />
        </View>
      ))}
    </View>
  );
}

function ProfileTickerCard({ ticker, changePct }: { ticker: string; changePct: number }) {
  const up = changePct >= 0;
  const clean = ticker.replace("$", "").toUpperCase();
  return (
    <View style={styles.feedTickerCard}>
      <View style={styles.feedTickerIcon}>
        <Text style={styles.feedTickerIconText}>{clean.slice(0, 2)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.feedTickerName}>${clean}</Text>
        <Text style={styles.feedTickerSub}>Linked token</Text>
      </View>
      <View style={[styles.feedTickerChange, { backgroundColor: up ? "rgba(63,169,255,0.14)" : "rgba(230,242,255,0.10)" }]}>
        {up ? <TrendingUp color={Colors.mint} size={12} strokeWidth={3} /> : <TrendingDown color={Colors.rose} size={12} strokeWidth={3} />}
        <Text style={[styles.feedTickerChangeText, { color: up ? Colors.mint : Colors.rose }]}>{up ? "+" : ""}{changePct.toFixed(1)}%</Text>
      </View>
    </View>
  );
}

function ProfileCommunityCard({ community, onPress }: { community: Community; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.profileCommunityCard} testID={`profile-community-${community.id}`}>
      <LinearGradient
        colors={[`${community.accent[0]}33`, "rgba(11,15,26,0.92)", `${community.accent[1]}22`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {community.bannerUrl ? <Image source={{ uri: community.bannerUrl }} style={styles.profileCommunityBanner} contentFit="cover" /> : null}
      <View style={styles.profileCommunityTop}>
        <View style={[styles.profileCommunityAvatar, { borderColor: `${community.accent[0]}66` }]}>
          {community.avatarUrl ? (
            <Image source={{ uri: community.avatarUrl }} style={styles.profileCommunityAvatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.profileCommunityEmojiLarge}>{community.iconEmoji}</Text>
          )}
        </View>
        {community.verified ? <ShieldCheck color={Colors.cyan} size={16} strokeWidth={3} /> : null}
      </View>
      <Text style={styles.profileCommunityName} numberOfLines={1}>{community.name}</Text>
      <Text style={styles.profileCommunityHandle} numberOfLines={1}>/{community.handle}</Text>
      <Text style={styles.profileCommunityDesc} numberOfLines={2}>{community.description}</Text>
      <View style={styles.profileCommunityStats}>
        <Text style={styles.profileCommunityStat}>{formatCount(community.members)} members</Text>
        <Text style={styles.profileCommunityDot}>•</Text>
        <Text style={styles.profileCommunityStat}>{formatCount(community.online)} online</Text>
      </View>
    </Pressable>
  );
}

function PostInteractionModal({
  interaction,
  text,
  submitting,
  onChangeText,
  onClose,
  onSubmit,
}: {
  interaction: { mode: "reply" | "quote"; post: UserPost } | null;
  text: string;
  submitting: boolean;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const title = interaction?.mode === "reply" ? "Reply to post" : "Quote post";
  return (
    <Modal visible={!!interaction} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.interactionBackdrop}>
        <Pressable style={styles.interactionDim} onPress={onClose}>
          <Pressable style={styles.interactionSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <X color={Colors.muted} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>
            {interaction ? (
              <View style={styles.interactionQuotedPost}>
                <Text style={styles.interactionQuotedText} numberOfLines={3}>{interaction.post.text || "Media post"}</Text>
              </View>
            ) : null}
            <TextInput
              value={text}
              onChangeText={onChangeText}
              style={styles.interactionInput}
              placeholder={interaction?.mode === "reply" ? "Write your reply…" : "Add your quote…"}
              placeholderTextColor={Colors.muted2}
              multiline
              maxLength={280}
              autoFocus
            />
            <Pressable disabled={submitting || text.trim().length === 0} onPress={onSubmit} style={[styles.interactionSubmit, (submitting || text.trim().length === 0) && { opacity: 0.55 }]}>
              <Text style={styles.interactionSubmitText}>{submitting ? "Sending…" : interaction?.mode === "reply" ? "Reply" : "Quote"}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const profileBlockStyles = StyleSheet.create({
  gap: { gap: 12, marginTop: 14, marginHorizontal: 14 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingBottom: 140 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
  },
  topTitleBlock: { flex: 1, minWidth: 0 },
  headerKicker: { color: Colors.muted2, fontSize: 10, fontWeight: "900", letterSpacing: 1.8, textTransform: "uppercase" },
  headerTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6, marginTop: 3 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroCard: {
    marginTop: 14,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.card,
  },
  heroShell: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: Colors.card,
  },
  bannerWrap: {
    height: 132,
    position: "relative",
    overflow: "hidden",
    backgroundColor: Colors.cardSoft,
  },
  bannerTopRow: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bannerCard: {
    marginTop: 4,
    height: 166,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: Colors.card,
  },
  bannerTexture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.48,
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.20)",
    transform: [{ rotate: "-4deg" }, { scale: 1.25 }],
  },
  profileCard: {
    marginTop: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(8,8,7,0.98)",
  },
  banner: { height: 148, position: "relative" },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  bannerBadgeRow: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  rankBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  heroBody: { padding: 16, paddingTop: 0 },
  heroBody2: { padding: 16, paddingTop: 0 },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  heroActionsRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 6,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.text,
  },
  primaryActionText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  ghostActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  ghostActionText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  identityBlock: { marginTop: 14 },
  nameRow2: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatarWrap: { marginTop: -52, width: 96, height: 96 },
  avatarRingOuter: {
    position: "absolute",
    inset: 0,
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 4,
    backgroundColor: Colors.card,
    borderWidth: 4,
    borderColor: Colors.card,
  },
  avatar: {
    flex: 1,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.ink, fontSize: 32, fontWeight: "900" },
  avatarImage: { flex: 1, borderRadius: 44 },
  avatarEditDot: {
    position: "absolute",
    left: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#080807",
  },
  bannerEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(6,8,15,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerEditText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  bannerUploadingBox: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  bannerUploading: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  badgeRowSmall: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  customBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  customBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  highlightsScroll: { marginTop: 16, marginHorizontal: -20 },
  highlightsRow: { flexDirection: "row", gap: 14, paddingHorizontal: 20, paddingRight: 30 },
  highlightBubble: { width: 72, alignItems: "center" },
  highlightRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    padding: 2,
  },
  highlightInner: {
    flex: 1,
    borderRadius: 31,
    backgroundColor: "#080807",
    borderWidth: 3,
    borderColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  highlightValue: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 1, letterSpacing: -0.2 },
  highlightLabel: { color: Colors.muted, fontSize: 10, fontWeight: "800", marginTop: 7, textAlign: "center" },
  findBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  findBtnText: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  followRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  followAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  followAvatarImg: { width: "100%", height: "100%" },
  followAvatarText: { color: Colors.mint, fontSize: 15, fontWeight: "900" },
  followRowName: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  followRowSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  verifiedDot: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.cyan,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#080807",
  },

  heroActions: {
    flexDirection: "row",
    gap: 8,
    position: "absolute",
    right: 16,
    top: 14,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  actionBtnText: { color: Colors.text, fontSize: 12, fontWeight: "900" },

  socialNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  socialVerified: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.cyan,
    alignItems: "center",
    justifyContent: "center",
  },
  displayName: { color: Colors.text, fontSize: 25, fontWeight: "900", letterSpacing: -0.7, flexShrink: 1 },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  handle: { color: Colors.muted, fontSize: 14, fontWeight: "700" },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(229,231,235,0.08)",
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.20)",
  },
  verifiedPillText: { color: Colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  bio: { color: Colors.text, fontSize: 14, fontWeight: "600", lineHeight: 20, marginTop: 12 },
  socialBioEmpty: { color: Colors.muted, fontStyle: "italic" },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 13 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

  followRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 13,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statsGridRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  unifiedCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statsGridRowInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  unifiedDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 14,
  },
  statGridCell: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  statGridDiv: { width: 1, height: 26, backgroundColor: "rgba(255,255,255,0.08)" },
  statGridNum: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.4 },
  statGridKey: { color: Colors.muted2, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 4, textTransform: "uppercase" },
  levelCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  levelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  levelTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  levelIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  levelEyebrow: { color: Colors.muted2, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, textTransform: "uppercase" },
  levelTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, marginTop: 2 },
  levelXP: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  followItem: { flex: 1, alignItems: "center" },
  followNum: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.4 },
  followKey: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, marginTop: 3, textTransform: "uppercase" },
  followDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.08)" },

  xpBox: { marginTop: 14 },
  xpHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  xpLabel: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  xpValue: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  xpTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  xpFill: { height: "100%", borderRadius: 999 },
  xpFillWrap: { height: "100%", borderRadius: 999, overflow: "hidden" },

  creditsCard: {
    marginTop: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  creditsTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  creditsIconBox: { width: 38, height: 38, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: Colors.mint },
  creditsEyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, textTransform: "uppercase" },
  creditsTitle: { color: Colors.text, fontSize: 23, fontWeight: "900", letterSpacing: -0.7, marginTop: 2 },
  creditsCta: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: Colors.text, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  creditsCtaText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  creditProgressTrack: { height: 9, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 14 },
  creditProgressFill: { height: "100%", borderRadius: 999, backgroundColor: Colors.mint },
  creditMetaRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 8 },
  creditMetaText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  creditCostsRow: { flexDirection: "row", gap: 7, marginTop: 13 },
  creditCostMini: { flex: 1, borderRadius: 14, paddingVertical: 9, alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  creditCostMiniLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  creditCostMiniValue: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 2 },
  creditLogBox: { marginTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 12 },
  creditLogTitle: { color: Colors.text, fontSize: 12, fontWeight: "900", marginBottom: 7 },
  creditLogEmpty: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  creditLogRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 5 },
  creditLogAction: { flex: 1, color: Colors.text, fontSize: 12, fontWeight: "800", textTransform: "capitalize" },
  creditLogCost: { color: Colors.orange, fontSize: 11, fontWeight: "900" },
  statsGrid: { flexDirection: "row", gap: 8, marginTop: 14 },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
  },
  statIconBox: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statNum: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 8, letterSpacing: -0.4 },
  statKey: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },

  cta: { marginTop: 14, borderRadius: 14, overflow: "hidden" },
  ctaGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  ctaText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },

  tabsBar: {
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  tabsRow: { flexDirection: "row", gap: 4, paddingRight: 4 },
  tabBtn: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 0,
    alignItems: "center",
  },
  tabBtnActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  tabText: { color: Colors.muted, fontSize: 13, fontWeight: "800", letterSpacing: -0.1 },
  tabTextActive: { color: Colors.text, fontWeight: "900" },
  tabIndicator: {
    height: 2,
    width: "100%",
    marginTop: 10,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  tabIndicatorActive: { backgroundColor: Colors.mint },

  section: { marginTop: 14 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  profileFeedList: { gap: 10 },
  feedPostCard: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(11,15,26,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  feedPostAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  feedPostAvatarImg: { width: "100%", height: "100%" },
  feedPostAvatarText: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  feedPostBody: { flex: 1, minWidth: 0 },
  feedPostHeaderRow: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
  feedPostName: { color: Colors.text, fontSize: 14, fontWeight: "900", maxWidth: 104 },
  feedPostHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", maxWidth: 82 },
  feedPostDot: { color: Colors.muted2, fontSize: 12, fontWeight: "900" },
  feedPostTime: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  feedDeleteBtn: { marginLeft: "auto" as const, width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  feedCommunityChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(63,169,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.20)",
  },
  feedCommunityEmoji: { fontSize: 11 },
  feedCommunityText: { color: Colors.cyan, fontSize: 10, fontWeight: "900", maxWidth: 160 },
  feedPostText: { color: Colors.text, fontSize: 15, fontWeight: "500", lineHeight: 21, marginTop: 8 },
  feedImageSolo: { height: 210, borderRadius: 16, overflow: "hidden", marginTop: 10, backgroundColor: Colors.cardSoft },
  feedImageRow: { flexDirection: "row", gap: 4, height: 170, marginTop: 10 },
  feedImageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 10 },
  feedImageHalf: { flex: 1, borderRadius: 14, overflow: "hidden", backgroundColor: Colors.cardSoft },
  feedImageQuad: { width: "49%", height: 116, borderRadius: 14, overflow: "hidden", backgroundColor: Colors.cardSoft },
  feedImage: { width: "100%", height: "100%" },
  feedTickerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  feedTickerIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: Colors.mint },
  feedTickerIconText: { color: Colors.ink, fontSize: 11, fontWeight: "900" },
  feedTickerName: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  feedTickerSub: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 1 },
  feedTickerChange: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  feedTickerChangeText: { fontSize: 11, fontWeight: "900" },
  feedActionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 11, paddingRight: 4 },
  feedActionBtn: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 34, paddingVertical: 4 },
  feedActionText: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  communityProfileGrid: { gap: 10 },
  profileCommunityCard: {
    minHeight: 154,
    padding: 14,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: Colors.card,
  },
  profileCommunityBanner: { ...StyleSheet.absoluteFillObject, opacity: 0.18 },
  profileCommunityTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileCommunityAvatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
  },
  profileCommunityAvatarImg: { width: "100%", height: "100%" },
  profileCommunityEmojiLarge: { fontSize: 24 },
  profileCommunityName: { color: Colors.text, fontSize: 17, fontWeight: "900", marginTop: 12, letterSpacing: -0.3 },
  profileCommunityHandle: { color: Colors.cyan, fontSize: 12, fontWeight: "800", marginTop: 2 },
  profileCommunityDesc: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 7 },
  profileCommunityStats: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 11 },
  profileCommunityStat: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  profileCommunityDot: { color: Colors.muted2, fontSize: 11, fontWeight: "900" },
  interactionBackdrop: { flex: 1, justifyContent: "flex-end" },
  interactionDim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  interactionSheet: {
    padding: 18,
    paddingBottom: 34,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  interactionQuotedPost: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginTop: 8,
  },
  interactionQuotedText: { color: Colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  interactionInput: {
    minHeight: 112,
    maxHeight: 180,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    textAlignVertical: "top",
    padding: 12,
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  interactionSubmit: { marginTop: 12, paddingVertical: 14, borderRadius: 16, alignItems: "center", backgroundColor: Colors.mint },
  interactionSubmitText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },

  perfCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  perfHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  perfBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(201,206,216,0.08)",
    borderWidth: 1,
    borderColor: "rgba(201,206,216,0.20)",
  },
  perfBadgeText: { color: Colors.orange, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  perfGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  perfCell: {
    width: "48%",
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
  },
  perfIcon: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  perfLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 8 },
  perfValue: { fontSize: 18, fontWeight: "900", marginTop: 4, letterSpacing: -0.4 },

  achievCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  achievCount: { color: Colors.mint, fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  achievGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  achievItem: {
    width: "48%",
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
  },
  achievLocked: { opacity: 0.7 },
  achievIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  achievTitle: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 8 },
  achievDesc: { color: Colors.muted, fontSize: 11, fontWeight: "600", marginTop: 2, lineHeight: 14 },
  achievBar: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginTop: 10,
  },
  achievBarFill: { height: "100%", borderRadius: 999 },
  achievUnlocked: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  achievUnlockedText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  listAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  listAvatarText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },
  listMid: { flex: 1, minWidth: 0 },
  listTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  listSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  listAction: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  postItem: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  postText: { color: Colors.text, fontSize: 14, fontWeight: "500", lineHeight: 19 },
  postPill: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  postPillText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },
  postFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  postStats: { flexDirection: "row", gap: 12, alignItems: "center" },
  postStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  postStatText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  activityIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  activityTitle: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  activitySub: { color: Colors.muted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  activityTime: { color: Colors.muted, fontSize: 10, fontWeight: "800" },

  emptyTab: {
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.035)",
    alignItems: "center",
  },
  emptyTabIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTabTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", marginTop: 12 },
  emptyTabBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
  },
  emptyTabBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.mint,
  },
  emptyTabBtnText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },

  menuSection: { marginTop: 14, gap: 8 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  menuSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  menuRight: { color: Colors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  backLinkText: { color: Colors.text, fontSize: 14, fontWeight: "900" },

  modalLabel: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginTop: 14 },
  modalHint: { color: Colors.muted, fontSize: 10, fontWeight: "700", textAlign: "right", marginTop: 4 },
  modalInput: {
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
  },
  uploadCard: {
    height: 110,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  uploadCardOverlay: {
    position: "absolute",
    left: 12,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.55)",
  },
  uploadCardText: { color: Colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  uploadClearBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,7,8,0.65)",
  },
  avatarUploadRow: { flexDirection: "row", gap: 12, marginTop: 8, alignItems: "center" },
  avatarUploadPreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.10)",
    position: "relative",
  },
  avatarUploadInitial: { color: Colors.ink, fontSize: 24, fontWeight: "900" },
  avatarUploadDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 6,
  },
  uploadBtnGhost: { backgroundColor: "transparent", borderColor: "rgba(244,244,245,0.16)" },
  uploadBtnText: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  bannerPickerRow: { flexDirection: "row", gap: 10, marginTop: 8, flexWrap: "wrap" },
  bannerPick: {
    width: 56,
    height: 38,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  bannerPickActive: { borderColor: Colors.text },
  bannerPickGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  colorRow: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: { borderColor: Colors.text },

  saveBtn: { marginTop: 16, borderRadius: 14, overflow: "hidden" },
  saveGrad: { paddingVertical: 14, alignItems: "center" },
  saveText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },

  settingsGroup: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 18,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  settingSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chipActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  chipText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: Colors.ink, fontWeight: "900" },

  aboutCard: {
    alignItems: "center",
    padding: 22,
    borderRadius: 18,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginTop: 8,
  },
  aboutLogo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  aboutTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 12, letterSpacing: -0.4 },
  aboutSub: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 4 },
});
