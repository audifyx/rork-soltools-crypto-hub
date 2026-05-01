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
  DollarSign,
  Edit3,
  ExternalLink,
  Eye,
  Fingerprint,
  Flame,
  Gem,
  Globe,
  Headphones,
  HelpCircle,
  Languages,
  Link as LinkIcon,
  Lock,
  LogOut,
  MapPin,
  Mic,
  Pencil,
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
import PortfolioCard from "@/components/profile/PortfolioCard";
import { useAdmin } from "@/providers/admin-provider";
import { useApp, type Currency, type Language, type ThemeMode, type UserPrefs } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";
import {
  useFollowList,
  useProfileProvider,
  useSearchProfiles,
  type CustomBadge,
  type ProfileSummary,
} from "@/providers/profile-provider";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type Tab = "overview" | "watchlist" | "wallets" | "alerts" | "posts" | "listings" | "activity";

const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", Icon: Sparkles },
  { id: "watchlist", label: "Watchlist", Icon: Eye },
  { id: "wallets", label: "Wallets", Icon: Wallet },
  { id: "alerts", label: "Alerts", Icon: Bell },
  { id: "posts", label: "Posts", Icon: Pencil },
  { id: "listings", label: "Listings", Icon: Rocket },
  { id: "activity", label: "Activity", Icon: Activity },
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
    { min: 3000, name: "Legend", Icon: Crown, color: "#FFD56B" },
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
      desc: "List a token on Launch Pad",
      Icon: Rocket,
      color: "#B88CFF",
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
      color: "#FFD56B",
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
    deletePost,
  } = useApp();
  const { listings } = useLaunchpad();
  const { isAuthenticated, email: authEmail, signOut, userId } = useAuth();
  const { isAdmin, role: adminRole } = useAdmin();
  const { uploadMedia, isUploading } = useProfileProvider();
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
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [followersOpen, setFollowersOpen] = useState<"followers" | "following" | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);

  const myListings = useMemo(
    () => listings.filter((l) => l.submittedBy === "user"),
    [listings],
  );

  const computedXp = useMemo(() => {
    return (
      watchlist.length * 12 +
      wallets.length * 18 +
      alerts.length * 8 +
      posts.length * 25 +
      myListings.length * 60 +
      profile.xp
    );
  }, [watchlist.length, wallets.length, alerts.length, posts.length, myListings.length, profile.xp]);

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
        color: "#B88CFF",
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
        message: `Follow ${profile.displayName} (${profile.handle}) on SolTools — pro Solana trading suite.`,
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
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (res.canceled || !res.assets[0]?.uri) return;
      const url = await uploadMedia({ kind: "avatar", uri: res.assets[0].uri });
      await updateProfile({ avatarUrl: url });
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    }
  }, [isAuthenticated, uploadMedia, updateProfile]);

  const onPickBanner = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in", "Sign in to upload a banner.");
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [3, 1],
      });
      if (res.canceled || !res.assets[0]?.uri) return;
      const url = await uploadMedia({ kind: "banner", uri: res.assets[0].uri });
      await updateProfile({ bannerUrl: url });
    } catch (e) {
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

  return (
    <View style={styles.root} testID="profile-screen">
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
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={styles.headerActions}>
              <Pressable onPress={onShareProfile} style={styles.iconBtn} testID="share-profile">
                <Share2 color={Colors.text} size={16} strokeWidth={2.4} />
              </Pressable>
              <Pressable onPress={() => setSettingsOpen(true)} style={styles.iconBtn} testID="open-settings">
                <Settings color={Colors.text} size={17} strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>

          <Pressable onPress={onPickBanner} style={styles.bannerCard} testID="pick-banner">
            {profile.bannerUrl ? (
              <Image
                source={{ uri: profile.bannerUrl }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            ) : (
              <LinearGradient
                colors={[profile.bannerFrom, profile.bannerTo]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
            )}
            <LinearGradient
              colors={["rgba(3,7,8,0)", "rgba(3,7,8,0.18)", "rgba(3,7,8,0.55)"]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <View style={styles.bannerEditBtn}>
              <Camera color={Colors.text} size={12} strokeWidth={2.8} />
              <Text style={styles.bannerEditText}>EDIT</Text>
            </View>
            <View style={styles.bannerBadgeRow}>
              <View style={[styles.rankBadge, { borderColor: `${rank.color}88` }]}>
                <rank.Icon color={rank.color} size={11} strokeWidth={3} />
                <Text style={[styles.rankBadgeText, { color: rank.color }]}>
                  LVL {rank.level} · {rank.name.toUpperCase()}
                </Text>
              </View>
            </View>
            {isUploading ? (
              <View style={[styles.bannerOverlay, styles.bannerUploadingBox]}>
                <Text style={styles.bannerUploading}>Uploading…</Text>
              </View>
            ) : null}
          </Pressable>

          <View style={styles.profileCard}>
            <View style={styles.heroBody}>
              <Pressable onPress={onPickAvatar} style={styles.avatarWrap} testID="pick-avatar">
                <Animated.View style={[styles.avatarRingOuter, { opacity: ringOpacity }]}>
                  <LinearGradient
                    colors={[rank.color, Colors.cyan, Colors.mint, rank.color]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                </Animated.View>
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
                {profile.verified ? (
                  <View style={styles.verifiedDot}>
                    <ShieldCheck color={Colors.ink} size={11} strokeWidth={3} />
                  </View>
                ) : null}
              </Pressable>

              <View style={styles.heroActions}>
                <Pressable onPress={() => setEditOpen(true)} style={styles.actionBtn} testID="edit-profile">
                  <Edit3 color={Colors.text} size={13} strokeWidth={2.6} />
                  <Text style={styles.actionBtnText}>Edit</Text>
                </Pressable>
                <Pressable onPress={onCopyAddress} style={styles.actionBtn} testID="copy-address">
                  <Copy color={Colors.text} size={13} strokeWidth={2.6} />
                  <Text style={styles.actionBtnText}>
                    {profile.walletAddress ? shorten(profile.walletAddress) : "Add wallet"}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.displayName}>{profile.displayName}</Text>
              <View style={styles.handleRow}>
                <Text style={styles.handle}>{profile.handle}</Text>
                {profile.verified ? (
                  <View style={styles.verifiedPill}>
                    <ShieldCheck color={Colors.cyan} size={10} strokeWidth={3} />
                    <Text style={styles.verifiedPillText}>VERIFIED</Text>
                  </View>
                ) : null}
              </View>
              {profile.customBadges.length > 0 ? (
                <View style={styles.badgeRow}>
                  {profile.customBadges.map((b) => (
                    <BadgePill key={b.id} badge={b} />
                  ))}
                </View>
              ) : null}
              {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

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
                    <Text style={[styles.metaText, { color: Colors.cyan }]}>{profile.website}</Text>
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

              <View style={styles.followRow}>
                <Pressable
                  style={styles.followItem}
                  onPress={() => setFollowersOpen("following")}
                  testID="open-following"
                >
                  <Text style={styles.followNum}>{profile.following}</Text>
                  <Text style={styles.followKey}>Following</Text>
                </Pressable>
                <View style={styles.followDivider} />
                <Pressable
                  style={styles.followItem}
                  onPress={() => setFollowersOpen("followers")}
                  testID="open-followers"
                >
                  <Text style={styles.followNum}>{profile.followers}</Text>
                  <Text style={styles.followKey}>Followers</Text>
                </Pressable>
                <View style={styles.followDivider} />
                <View style={styles.followItem}>
                  <Text style={[styles.followNum, { color: Colors.mint }]}>{computedXp}</Text>
                  <Text style={styles.followKey}>XP</Text>
                </View>
              </View>

              <View style={styles.xpBox}>
                <View style={styles.xpHeader}>
                  <Text style={styles.xpLabel}>
                    {rank.name} → {rank.next}
                  </Text>
                  <Text style={styles.xpValue}>
                    {rank.xpInLevel}/{rank.xpForNext} XP
                  </Text>
                </View>
                <View style={styles.xpTrack}>
                  <Animated.View style={[styles.xpFillWrap, { width: xpFillWidth }]}>
                    <LinearGradient
                      colors={[Colors.mint, Colors.cyan, "#B88CFF"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </Animated.View>
                </View>
              </View>
            </View>
          </View>

          <PortfolioCard />

          <View style={styles.statsGrid}>
            <StatCard label="WATCHING" value={stats.watching} accent={Colors.mint} Icon={Eye} />
            <StatCard label="ALERTS" value={stats.alerts} accent={Colors.orange} Icon={Bell} />
            <StatCard label="WALLETS" value={stats.wallets} accent={Colors.cyan} Icon={Wallet} />
            <StatCard label="LISTED" value={stats.listed} accent={Colors.rose} Icon={Rocket} />
          </View>

          <Pressable onPress={() => setSearchOpen(true)} style={styles.findBtn} testID="find-traders">
            <Users color={Colors.text} size={13} strokeWidth={2.6} />
            <Text style={styles.findBtnText}>Find traders to follow</Text>
          </Pressable>

          <Pressable onPress={() => router.push("/list-token")} style={styles.cta} testID="profile-list-token">
            <LinearGradient
              colors={[Colors.mint, Colors.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaGrad}
            >
              <Rocket color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={styles.ctaText}>List a token on Launch Pad</Text>
            </LinearGradient>
          </Pressable>

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
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                  testID={`profile-tab-${t.id}`}
                >
                  <t.Icon color={active ? Colors.ink : Colors.text} size={13} strokeWidth={2.6} />
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {tab === "overview" && (
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
                <MenuRow
                  Icon={Bookmark}
                  label="Saved tokens"
                  sub={`${stats.watching} on watchlist`}
                  onPress={() => setTab("watchlist")}
                />
                <MenuRow
                  Icon={Users}
                  label="Voice Lobbies"
                  sub="Trade with your crew"
                  onPress={() => router.push({ pathname: "/tool/[id]", params: { id: "voice-lobby" } })}
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

          {tab === "watchlist" && (
            <View style={styles.section}>
              {watchlist.length === 0 ? (
                <EmptyTab
                  Icon={Eye}
                  title="No watched tokens"
                  body="Tap the eye icon on Discover or any token to add it to your watchlist."
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
                      onPress={() => onConfirmDelete(`$${w.ticker}`, () => removeWatch(w.id))}
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

          {tab === "wallets" && (
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
                    <View style={[styles.listAvatar, { backgroundColor: "rgba(56,215,255,0.16)" }]}>
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

          {tab === "alerts" && (
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
                    <View style={[styles.listAvatar, { backgroundColor: "rgba(255,184,76,0.16)" }]}>
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
                  body="Share alpha, charts, and takes with the SolTools community."
                  ctaLabel="Compose post"
                  onCta={() => router.push("/compose")}
                />
              ) : (
                posts.map((p) => (
                  <View key={p.id} style={styles.postItem} testID={`my-post-${p.id}`}>
                    <Text style={styles.postText}>{p.text}</Text>
                    {p.ticker ? (
                      <View style={styles.postPill}>
                        <Text style={styles.postPillText}>${p.ticker}</Text>
                      </View>
                    ) : null}
                    <View style={styles.postFooter}>
                      <View style={styles.postStats}>
                        <View style={styles.postStat}>
                          <Star color={Colors.muted} size={11} strokeWidth={2.6} />
                          <Text style={styles.postStatText}>{p.likes}</Text>
                        </View>
                        <View style={styles.postStat}>
                          <TrendingUp color={Colors.muted} size={11} strokeWidth={2.6} />
                          <Text style={styles.postStatText}>{p.reposts}</Text>
                        </View>
                        <Text style={styles.postStatText}>{timeAgo(p.createdAt)}</Text>
                      </View>
                      <Pressable onPress={() => onConfirmDelete("post", () => deletePost(p.id))} hitSlop={6}>
                        <X color={Colors.muted} size={14} strokeWidth={2.6} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {tab === "listings" && (
            <View style={styles.section}>
              {myListings.length === 0 ? (
                <EmptyTab
                  Icon={Rocket}
                  title="No listings yet"
                  body="Submit your token to the Launch Pad and get discovered by traders."
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
                    <View style={[styles.listAvatar, { backgroundColor: "rgba(184,140,255,0.16)" }]}>
                      <Rocket color="#B88CFF" size={15} strokeWidth={2.6} />
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
        onSave={async (vals) => {
          await updateProfile(vals);
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
    </View>
  );
}

function BadgePill({ badge }: { badge: CustomBadge }) {
  const color = badge.color ?? "#FFD56B";
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
      <View style={[styles.menuIcon, danger && { backgroundColor: "rgba(255,93,143,0.12)" }]}>
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

  const COLORS = [Colors.mint, Colors.cyan, Colors.orange, Colors.rose, "#B88CFF", "#FFD56B", "#F4FFF9"];
  const BANNERS: { from: string; to: string }[] = [
    { from: Colors.rose, to: Colors.cyan },
    { from: Colors.mint, to: Colors.cyan },
    { from: Colors.orange, to: Colors.rose },
    { from: "#B88CFF", to: Colors.cyan },
    { from: "#FFD56B", to: Colors.rose },
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

            <Text style={styles.modalLabel}>SOLANA WALLET</Text>
            <TextInput
              value={walletAddress}
              onChangeText={setWalletAddress}
              style={styles.modalInput}
              placeholderTextColor={Colors.muted}
              placeholder="Paste your SOL address"
              autoCapitalize="none"
              autoCorrect={false}
            />

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
                setSaving(true);
                await onSave({
                  displayName,
                  handle,
                  bio,
                  avatarColor: color,
                  bannerFrom,
                  bannerTo,
                  walletAddress: walletAddress.trim(),
                  twitterHandle: twitterHandle.trim(),
                  website: website.trim(),
                  location: location.trim(),
                });
                setSaving(false);
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
  const { isAuthenticated, email: authEmail, signOut } = useAuth();
  const [section, setSection] = useState<"main" | "trading" | "privacy" | "appearance" | "about">("main");

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
                <SettingRow
                  label="AI narration"
                  sub="Read alpha aloud"
                  Icon={Headphones}
                  value={prefs.aiNarration}
                  onChange={(v) => onUpdate({ aiNarration: v })}
                />
                <SettingRow
                  label="Voice lobbies"
                  sub="Auto-join crew calls"
                  Icon={Mic}
                  value={prefs.voiceLobbies}
                  onChange={(v) => onUpdate({ voiceLobbies: v })}
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
                  Icon={DollarSign}
                  label="Trading defaults"
                  sub="Slippage, priority fee, MEV"
                  onPress={() => setSection("trading")}
                  rightLabel={`${prefs.slippage}%`}
                />
                <MenuRow
                  Icon={Lock}
                  label="Privacy & security"
                  sub="2FA, biometrics, profile"
                  onPress={() => setSection("privacy")}
                />
                <MenuRow
                  Icon={Sparkles}
                  label="Appearance"
                  sub="Theme, language, currency"
                  onPress={() => setSection("appearance")}
                  rightLabel={prefs.currency}
                />

                <Text style={styles.settingsGroup}>ACCOUNT</Text>
                <MenuRow
                  Icon={LinkIcon}
                  label="Connected accounts"
                  sub="Wallets, X, Discord"
                  onPress={() => Alert.alert("Soon", "Connect more accounts in the next update.")}
                />
                <MenuRow
                  Icon={Users}
                  label="Blocked users"
                  sub="Manage blocked traders"
                  onPress={() => Alert.alert("Blocked", "You haven't blocked anyone.")}
                />

                <Text style={styles.settingsGroup}>SUPPORT</Text>
                <MenuRow
                  Icon={HelpCircle}
                  label="Help & support"
                  sub="FAQ, contact"
                  onPress={() => Alert.alert("Support", "Reach us at support@soltools.app")}
                />
                <MenuRow
                  Icon={ExternalLink}
                  label="About SolTools"
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
                <MenuRow
                  Icon={LogOut}
                  label={isAuthenticated ? "Sign out" : "Sign in / Create account"}
                  sub={isAuthenticated ? (authEmail ?? "Signed in") : "Sync your data across devices"}
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

            {section === "trading" && (
              <>
                <Text style={styles.settingsGroup}>SLIPPAGE TOLERANCE</Text>
                <View style={styles.chipsRow}>
                  {[0.5, 1, 2, 5, 10].map((s) => {
                    const active = prefs.slippage === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => onUpdate({ slippage: s })}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}%</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.settingsGroup}>PRIORITY FEE (SOL)</Text>
                <View style={styles.chipsRow}>
                  {[0.0001, 0.0005, 0.001, 0.005, 0.01].map((f) => {
                    const active = prefs.priorityFee === f;
                    return (
                      <Pressable
                        key={f}
                        onPress={() => onUpdate({ priorityFee: f })}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <SettingRow
                  label="MEV protection"
                  sub="Route through protected RPC"
                  Icon={Shield}
                  value={prefs.mevProtection}
                  onChange={(v) => onUpdate({ mevProtection: v })}
                />
                <View style={{ height: 24 }} />
              </>
            )}

            {section === "privacy" && (
              <>
                <Text style={styles.settingsGroup}>SECURITY</Text>
                <SettingRow
                  label="Two-factor auth"
                  sub="Extra layer on sign-in"
                  Icon={ShieldCheck}
                  value={prefs.twoFactor}
                  onChange={(v) => onUpdate({ twoFactor: v })}
                />
                <SettingRow
                  label="Biometric unlock"
                  sub="Face / fingerprint"
                  Icon={Fingerprint}
                  value={prefs.biometric}
                  onChange={(v) => onUpdate({ biometric: v })}
                />
                <Text style={styles.settingsGroup}>PROFILE PRIVACY</Text>
                <SettingRow
                  label="Private profile"
                  sub="Only followers see posts"
                  Icon={Lock}
                  value={prefs.privateProfile}
                  onChange={(v) => onUpdate({ privateProfile: v })}
                />
                <SettingRow
                  label="Hide balances"
                  sub="Mask wallet PnL & holdings"
                  Icon={Eye}
                  value={prefs.hideBalance}
                  onChange={(v) => onUpdate({ hideBalance: v })}
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
                  <Text style={styles.aboutTitle}>SolTools</Text>
                  <Text style={styles.aboutSub}>Pro Trading Suite · v5.0.0</Text>
                </View>
                <MenuRow
                  Icon={ExternalLink}
                  label="Terms of service"
                  sub="Read the legal stuff"
                  onPress={() => Linking.openURL("https://soltools.app/terms").catch(() => {})}
                />
                <MenuRow
                  Icon={Shield}
                  label="Privacy policy"
                  sub="How we handle data"
                  onPress={() => Linking.openURL("https://soltools.app/privacy").catch(() => {})}
                />
                <MenuRow
                  Icon={Camera}
                  label="Open-source licenses"
                  sub="Credits"
                  onPress={() => Alert.alert("Licenses", "Built with React Native, Expo, lucide-react-native.")}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 140 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  headerTitle: { color: Colors.text, fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
  bannerCard: {
    marginTop: 14,
    height: 156,
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: Colors.card,
  },
  profileCard: {
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.card,
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
  avatarWrap: { marginTop: -56, width: 96, height: 96 },
  avatarRingOuter: {
    position: "absolute",
    inset: 0,
    width: 96,
    height: 96,
    borderRadius: 30,
    overflow: "hidden",
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 30,
    padding: 5,
    backgroundColor: Colors.card,
    borderWidth: 4,
    borderColor: Colors.card,
  },
  avatar: {
    flex: 1,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.ink, fontSize: 30, fontWeight: "900" },
  avatarImage: { flex: 1, borderRadius: 24 },
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
    borderColor: Colors.card,
  },
  bannerEditBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bannerEditText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  bannerUploadingBox: { alignItems: "center", justifyContent: "center" },
  bannerUploading: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 40,
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
  findBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: "rgba(85,245,178,0.16)",
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.cyan,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.card,
  },

  heroActions: {
    flexDirection: "row",
    gap: 8,
    position: "absolute",
    right: 16,
    top: 12,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionBtnText: { color: Colors.text, fontSize: 12, fontWeight: "900" },

  displayName: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4, marginTop: 12 },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  handle: { color: Colors.muted, fontSize: 13, fontWeight: "700" },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.4)",
  },
  verifiedPillText: { color: Colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  bio: { color: Colors.text, fontSize: 13, fontWeight: "600", lineHeight: 18, marginTop: 10 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

  followRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 12,
    backgroundColor: Colors.cardSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  followItem: { flex: 1, alignItems: "center" },
  followNum: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  followKey: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  followDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.06)" },

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

  tabsRow: { flexDirection: "row", gap: 6, marginTop: 18, paddingRight: 4 },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabBtnActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  tabText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: Colors.ink, fontWeight: "900" },

  section: { marginTop: 14 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },

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
    backgroundColor: "rgba(255,184,76,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.4)",
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
    backgroundColor: "rgba(85,245,178,0.16)",
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
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
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
    borderColor: "rgba(85,245,178,0.25)",
    backgroundColor: "rgba(85,245,178,0.04)",
    alignItems: "center",
  },
  emptyTabIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(85,245,178,0.12)",
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
    backgroundColor: "rgba(85,245,178,0.12)",
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
    backgroundColor: "rgba(85,245,178,0.12)",
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
