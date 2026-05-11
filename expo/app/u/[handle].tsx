import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Coins,
  Copy,
  Film,
  Globe,
  Heart,
  MapPin,
  MessageCircle,
  MessageSquare,
  Play,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Star,
  Twitter,
  UserPlus,
  UserCheck,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { SOLTOOLS_TRADING_DISABLED_MESSAGE } from "@/lib/soltools-platform";
import { useAuth } from "@/providers/auth-provider";
import { useMessages } from "@/providers/messages-provider";
import {
  useFollowCounts,
  useFollowList,
  useProfileProvider,
  usePublicProfile,
  type CustomBadge,
  type ProfileSummary,
} from "@/providers/profile-provider";
import { fetchUserPosts, type UserPostSummary } from "@/lib/api/posts";
import { fetchUserReels, type Reel } from "@/lib/api/reels";

export default function PublicProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ handle: string }>();
  const handle = (params.handle ?? "").toString();
  const { userId, isAuthenticated } = useAuth();
  const { ensureConversationWith } = useMessages();
  const { toggleFollow, isToggling } = useProfileProvider();

  const profileQ = usePublicProfile(handle);
  const profile = profileQ.data;
  const isSelf = !!profile && profile.id === userId;
  const [tipCopied, setTipCopied] = useState<boolean>(false);
  const [feedTab, setFeedTab] = useState<"posts" | "reels">("posts");
  const [followKind, setFollowKind] = useState<"followers" | "following" | null>(null);

  const targetUserId = profile?.user_id ?? null;
  const postsQ = useQuery<UserPostSummary[]>({
    queryKey: ["profile", "posts", targetUserId ?? "none"],
    enabled: !!targetUserId,
    queryFn: () => (targetUserId ? fetchUserPosts(targetUserId) : Promise.resolve([])),
    staleTime: 20_000,
  });
  const reelsQ = useQuery<Reel[]>({
    queryKey: ["profile", "reels", targetUserId ?? "none"],
    enabled: !!targetUserId,
    queryFn: () => (targetUserId ? fetchUserReels(targetUserId, userId) : Promise.resolve([])),
    staleTime: 20_000,
  });
  const followersQ = useFollowList(targetUserId, "followers");
  const followingQ = useFollowList(targetUserId, "following");
  const followCountsQ = useFollowCounts(targetUserId);
  const userPosts = postsQ.data ?? [];
  const userReels = reelsQ.data ?? [];
  const followersCount = Math.max(profile?.followers_count ?? 0, followersQ.data?.length ?? 0, followCountsQ.data?.followers ?? 0);
  const followingCount = Math.max(profile?.following_count ?? 0, followingQ.data?.length ?? 0, followCountsQ.data?.following ?? 0);

  const onToggleFollow = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in", "Sign in to follow traders.");
      return;
    }
    if (!profile || isSelf) return;
    try {
      await toggleFollow(profile.id);
    } catch (e) {
      Alert.alert("Couldn't update", e instanceof Error ? e.message : "Try again");
    }
  }, [isAuthenticated, profile, isSelf, toggleFollow]);

  const onMessageUser = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in", "Sign in to message traders.");
      return;
    }
    if (!profile || isSelf) return;
    try {
      const conversationId = await ensureConversationWith({
        userId: profile.user_id,
        handle: `@${profile.username ?? profile.user_id.slice(0, 8)}`,
        name: profile.display_name ?? profile.username ?? "Trader",
        color: profile.avatar_color ?? Colors.mint,
        verified: profile.verified,
        bio: profile.bio ?? undefined,
        avatarUrl: profile.avatar_url,
      });
      router.push({ pathname: "/dm/[id]", params: { id: conversationId } });
    } catch (e) {
      Alert.alert("Message failed", e instanceof Error ? e.message : "Try again.");
    }
  }, [ensureConversationWith, isAuthenticated, isSelf, profile, router]);

  const onComingSoonWallet = useCallback(() => {
    Alert.alert("Coming soon", SOLTOOLS_TRADING_DISABLED_MESSAGE);
  }, []);

  const onTipCopy = useCallback(async () => {
    const wallet = profile?.wallet_address ?? "";
    if (!wallet) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
      Alert.alert("No wallet added", "This user hasn't linked a wallet yet.");
      return;
    }
    try {
      await Clipboard.setStringAsync(wallet);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setTipCopied(true);
      setTimeout(() => setTipCopied(false), 1600);
    } catch {
      Alert.alert("Couldn't copy", "Try again in a moment.");
    }
  }, [profile?.wallet_address]);

  const onOpenLink = useCallback((url: string) => {
    if (!url) return;
    const safe = url.startsWith("http") ? url : `https://${url}`;
    Linking.openURL(safe).catch(() => {});
  }, []);

  if (profileQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.mint} />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.notFoundTitle}>Trader not found</Text>
        <Text style={styles.notFoundBody}>@{handle.replace("@", "")} doesn&apos;t exist on $OGS token.</Text>
        <Pressable onPress={() => navigateBack(router, "/(tabs)/users")} style={styles.backCta}>
          <Text style={styles.backCtaText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const display = profile.display_name ?? profile.username ?? "Trader";
  const initial = display.slice(0, 1).toUpperCase();
  const bannerFrom = profile.banner_from ?? Colors.rose;
  const bannerTo = profile.banner_to ?? Colors.cyan;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.bannerWrap}>
          {profile.banner_url ? (
            <Image
              source={{ uri: profile.banner_url }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
            />
          ) : (
            <LinearGradient
              colors={[bannerFrom, bannerTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          {!profile.banner_url ? <View style={styles.bannerOverlay} /> : null}
          <SafeAreaView edges={["top"]} style={styles.bannerHeader}>
            <Pressable onPress={() => navigateBack(router, "/(tabs)/users")} style={styles.backBtn} testID="public-back">
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          <View style={styles.row}>
            <View style={styles.avatarRing}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, { backgroundColor: profile.avatar_color ?? Colors.mint }]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              )}
            </View>

            {!isSelf ? (
              <View style={styles.actionStack}>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    }
                    onMessageUser();
                  }}
                  style={styles.messageBtn}
                  testID="message-user"
                >
                  <MessageCircle color={Colors.ink} size={13} strokeWidth={2.8} />
                  <Text style={styles.messageBtnText}>Message</Text>
                </Pressable>
                <Pressable
                  onPress={onTipCopy}
                  style={styles.tipBtn}
                  testID="open-tip"
                >
                  {tipCopied ? (
                    <Check color={Colors.mint} size={13} strokeWidth={3} />
                  ) : (
                    <Coins color={Colors.orange} size={13} strokeWidth={2.8} />
                  )}
                  <Text style={styles.tipBtnText}>
                    {tipCopied ? "Copied" : "Tip"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onToggleFollow}
                  disabled={isToggling}
                  style={[
                    styles.followBtn,
                    profile.is_following ? styles.followingBtn : styles.notFollowingBtn,
                    isToggling && { opacity: 0.55 },
                  ]}
                  testID="toggle-follow"
                >
                  {profile.is_following ? (
                    <UserCheck color={Colors.text} size={14} strokeWidth={2.6} />
                  ) : (
                    <UserPlus color={Colors.ink} size={14} strokeWidth={2.6} />
                  )}
                  <Text
                    style={[
                      styles.followBtnText,
                      profile.is_following ? { color: Colors.text } : { color: Colors.ink },
                    ]}
                  >
                    {profile.is_following ? "Following" : "Follow"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{display}</Text>
            {profile.verified ? (
              <ShieldCheck color={Colors.cyan} size={16} strokeWidth={3} />
            ) : null}
          </View>
          <Text style={styles.handleText}>@{profile.username ?? "trader"}</Text>

          {profile.custom_badges.length > 0 ? (
            <View style={styles.badgeRow}>
              {profile.custom_badges.map((b) => (
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
              <Pressable onPress={() => onOpenLink(profile.website ?? "")} style={styles.metaItem}>
                <Globe color={Colors.cyan} size={11} strokeWidth={2.4} />
                <Text style={[styles.metaText, { color: Colors.cyan }]}>{profile.website}</Text>
              </Pressable>
            ) : null}
            {profile.twitter_handle ? (
              <Pressable
                onPress={() =>
                  onOpenLink(`x.com/${(profile.twitter_handle ?? "").replace("@", "")}`)
                }
                style={styles.metaItem}
              >
                <Twitter color={Colors.cyan} size={11} strokeWidth={2.4} />
                <Text style={[styles.metaText, { color: Colors.cyan }]}>
                  {(profile.twitter_handle ?? "").startsWith("@")
                    ? profile.twitter_handle
                    : `@${profile.twitter_handle}`}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.metaItem}>
              <Star color={Colors.muted} size={11} strokeWidth={2.4} />
              <Text style={styles.metaText}>
                Joined{" "}
                {new Date(profile.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </View>
          </View>

          <View style={styles.followStrip}>
            <Pressable
              style={styles.followCell}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                setFollowKind("following");
              }}
              testID="open-following"
            >
              <Text style={styles.followNum}>{followingCount}</Text>
              <Text style={styles.followKey}>Following</Text>
            </Pressable>
            <View style={styles.followDivider} />
            <Pressable
              style={styles.followCell}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                setFollowKind("followers");
              }}
              testID="open-followers"
            >
              <Text style={styles.followNum}>{followersCount}</Text>
              <Text style={styles.followKey}>Followers</Text>
            </Pressable>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Sparkles color={Colors.mint} size={13} strokeWidth={2.6} />
              <Text style={styles.statNum}>{profile.trades_count}</Text>
              <Text style={styles.statKey}>TRADES</Text>
            </View>
            <View style={styles.statCard}>
              <Wallet color={Colors.cyan} size={13} strokeWidth={2.6} />
              <Text style={styles.statNum}>
                {profile.pnl_pct >= 0 ? "+" : ""}
                {Number(profile.pnl_pct).toFixed(1)}%
              </Text>
              <Text style={styles.statKey}>PnL 30D</Text>
            </View>
          </View>

          <View style={styles.feedTabsRow}>
            <FeedTabButton
              label={`Posts ${userPosts.length > 0 ? userPosts.length : ""}`.trim()}
              Icon={MessageSquare}
              active={feedTab === "posts"}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                setFeedTab("posts");
              }}
              testID="profile-feed-posts"
            />
            <FeedTabButton
              label={`Reels ${userReels.length > 0 ? userReels.length : ""}`.trim()}
              Icon={Film}
              active={feedTab === "reels"}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                setFeedTab("reels");
              }}
              testID="profile-feed-reels"
            />
          </View>

          {feedTab === "posts" ? (
            <PostsList
              posts={userPosts}
              loading={postsQ.isLoading}
              displayName={display}
              avatarColor={profile.avatar_color ?? Colors.mint}
              avatarUrl={profile.avatar_url}
              handle={profile.username ?? "trader"}
              verified={profile.verified}
              onOpenToken={(addr, ticker) =>
                router.push({ pathname: "/tool/token-lookup", params: { q: addr ?? ticker ?? "" } })
              }
            />
          ) : (
            <ReelsGrid
              reels={userReels}
              loading={reelsQ.isLoading}
              onOpen={() => router.push("/(tabs)/reels")}
            />
          )}
        </View>
      </ScrollView>
      <FollowListSheet
        visible={followKind !== null}
        kind={followKind ?? "followers"}
        userId={targetUserId}
        onClose={() => setFollowKind(null)}
        onOpenUser={(username) => {
          setFollowKind(null);
          router.push({ pathname: "/u/[handle]", params: { handle: username } });
        }}
      />
    </View>
  );
}

const TIP_AMOUNTS: number[] = [0.1, 0.5, 1, 5];

function TipModal({
  visible,
  onClose,
  recipientName,
  recipientHandle,
  walletAddress,
}: {
  visible: boolean;
  onClose: () => void;
  recipientName: string;
  recipientHandle: string;
  walletAddress: string;
}) {
  const [amount, setAmount] = useState<number>(0.5);
  const [copied, setCopied] = useState<boolean>(false);
  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(walletAddress);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [walletAddress]);
  const onSend = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const url = `https://phantom.app/ul/v1/send?recipient=${walletAddress}&amount=${amount}`;
    const can = await Linking.canOpenURL(url).catch(() => false);
    if (can) {
      Linking.openURL(url).catch(() => {});
    } else {
      await Clipboard.setStringAsync(walletAddress);
      Alert.alert(
        "Wallet copied",
        `Open Phantom or your Solana wallet and paste this address to tip ${amount} SOL.`,
      );
    }
    onClose();
  }, [amount, walletAddress, onClose]);
  const short = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-6)}`
    : "";
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={tipStyles.backdrop} onPress={onClose}>
        <Pressable style={tipStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={tipStyles.handle} />
          <View style={tipStyles.header}>
            <View style={tipStyles.titleWrap}>
              <Coins color={Colors.orange} size={16} strokeWidth={2.6} />
              <Text style={tipStyles.title}>Tip {recipientName}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X color={Colors.muted} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>
          <Text style={tipStyles.sub}>
            Send SOL directly to @{recipientHandle}'s wallet.
          </Text>

          <Text style={tipStyles.sectionLabel}>AMOUNT (SOL)</Text>
          <View style={tipStyles.amountRow}>
            {TIP_AMOUNTS.map((v) => {
              const active = amount === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.selectionAsync().catch(() => {});
                    }
                    setAmount(v);
                  }}
                  style={[tipStyles.amountChip, active && tipStyles.amountChipActive]}
                  testID={`tip-amount-${v}`}
                >
                  <Text
                    style={[
                      tipStyles.amountText,
                      active && tipStyles.amountTextActive,
                    ]}
                  >
                    {v} SOL
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={tipStyles.sectionLabel}>RECIPIENT WALLET</Text>
          <Pressable onPress={onCopy} style={tipStyles.walletBox} testID="copy-tip-wallet">
            <View style={tipStyles.walletIcon}>
              <Wallet color={Colors.cyan} size={14} strokeWidth={2.6} />
            </View>
            <Text style={tipStyles.walletText} numberOfLines={1}>
              {short || "No wallet linked"}
            </Text>
            {copied ? (
              <Check color={Colors.mint} size={14} strokeWidth={3} />
            ) : (
              <Copy color={Colors.muted} size={14} strokeWidth={2.6} />
            )}
          </Pressable>

          <Pressable
            onPress={onSend}
            disabled={!walletAddress}
            style={[tipStyles.sendBtn, !walletAddress && { opacity: 0.5 }]}
            testID="send-tip"
          >
            <LinearGradient
              colors={[Colors.orange, Colors.rose]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={tipStyles.sendGrad}
            >
              <Zap color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={tipStyles.sendText}>Send {amount} SOL</Text>
            </LinearGradient>
          </Pressable>
          <Text style={tipStyles.foot}>
            Wallet transfers are coming soon. $OGS token never holds funds.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FeedTabButton({
  label,
  Icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.feedTab, active && styles.feedTabActive]}
      testID={testID}
    >
      <Icon color={active ? Colors.ink : Colors.text} size={13} strokeWidth={2.6} />
      <Text style={[styles.feedTabText, active && styles.feedTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PostsList({
  posts,
  loading,
  displayName,
  avatarColor,
  avatarUrl,
  handle,
  verified,
  onOpenToken,
}: {
  posts: UserPostSummary[];
  loading: boolean;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  handle: string;
  verified: boolean;
  onOpenToken: (address: string | null, ticker: string | null) => void;
}) {
  if (loading && posts.length === 0) {
    return (
      <View style={styles.feedEmpty}>
        <ActivityIndicator color={Colors.mint} />
      </View>
    );
  }
  if (posts.length === 0) {
    return (
      <View style={styles.feedEmpty}>
        <View style={styles.feedEmptyIcon}>
          <MessageSquare color={Colors.muted} size={22} strokeWidth={2.4} />
        </View>
        <Text style={styles.feedEmptyTitle}>No posts yet</Text>
        <Text style={styles.feedEmptyBody}>
          When @{handle} posts a take, chart, or call, it shows up here.
        </Text>
      </View>
    );
  }
  const initial = displayName.slice(0, 1).toUpperCase();
  return (
    <View style={styles.postsWrap}>
      {posts.map((p) => (
        <View key={p.id} style={styles.postCard}>
          <View style={styles.postHead}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.postAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.postAvatar, { backgroundColor: avatarColor, alignItems: "center", justifyContent: "center" }]}>
                <Text style={styles.postAvatarInit}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={styles.postNameRow}>
                <Text style={styles.postName} numberOfLines={1}>
                  {displayName}
                </Text>
                {verified ? <BadgeCheck color={Colors.cyan} size={12} strokeWidth={2.8} /> : null}
                <Text style={styles.postHandle} numberOfLines={1}>
                  @{handle}
                </Text>
              </View>
              <Text style={styles.postTime}>{relativeTime(p.createdAt)}</Text>
            </View>
          </View>
          {p.text ? <Text style={styles.postBody}>{p.text}</Text> : null}
          {p.imageUrl ? (
            <Image source={{ uri: p.imageUrl }} style={styles.postImage} contentFit="cover" />
          ) : null}
          {p.ticker ? (
            <Pressable
              onPress={() => onOpenToken(p.tokenAddress, p.ticker)}
              style={styles.postTokenPill}
              testID={`post-token-${p.id}`}
            >
              <Coins color={Colors.cyan} size={11} strokeWidth={2.8} />
              <Text style={styles.postTokenText}>${p.ticker}</Text>
              {p.changePct != null ? (
                <Text
                  style={[
                    styles.postChange,
                    { color: p.changePct >= 0 ? Colors.mint : Colors.rose },
                  ]}
                >
                  {p.changePct >= 0 ? "+" : ""}
                  {p.changePct.toFixed(2)}%
                </Text>
              ) : null}
            </Pressable>
          ) : null}
          <View style={styles.postStatsRow}>
            <View style={styles.postStatItem}>
              <Heart color={Colors.muted} size={12} strokeWidth={2.4} />
              <Text style={styles.postStatText}>{p.likes}</Text>
            </View>
            <View style={styles.postStatItem}>
              <Repeat2 color={Colors.muted} size={12} strokeWidth={2.4} />
              <Text style={styles.postStatText}>{p.reposts}</Text>
            </View>
            <View style={styles.postStatItem}>
              <MessageCircle color={Colors.muted} size={12} strokeWidth={2.4} />
              <Text style={styles.postStatText}>{p.comments}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReelsGrid({
  reels,
  loading,
  onOpen,
}: {
  reels: Reel[];
  loading: boolean;
  onOpen: () => void;
}) {
  if (loading && reels.length === 0) {
    return (
      <View style={styles.feedEmpty}>
        <ActivityIndicator color={Colors.mint} />
      </View>
    );
  }
  if (reels.length === 0) {
    return (
      <View style={styles.feedEmpty}>
        <View style={styles.feedEmptyIcon}>
          <Film color={Colors.muted} size={22} strokeWidth={2.4} />
        </View>
        <Text style={styles.feedEmptyTitle}>No reels yet</Text>
        <Text style={styles.feedEmptyBody}>Reels and photos this trader posts will live here.</Text>
      </View>
    );
  }
  return (
    <View style={styles.reelsGrid}>
      {reels.map((r) => {
        const thumb = r.thumbnailUrl ?? (r.mediaType === "image" ? r.videoUrl : null);
        return (
          <Pressable
            key={r.id}
            onPress={onOpen}
            style={styles.reelTile}
            testID={`profile-reel-${r.id}`}
          >
            {thumb ? (
              <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#0a0f15" }]} />
            )}
            <LinearGradient
              pointerEvents="none"
              colors={["transparent", "rgba(0,0,0,0.7)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.reelTileTop}>
              {r.mediaType === "video" ? (
                <View style={styles.reelPlayPill}>
                  <Play color={Colors.ink} size={10} strokeWidth={3} fill={Colors.ink} />
                </View>
              ) : null}
            </View>
            <View style={styles.reelTileBottom}>
              <Heart color={Colors.text} size={11} strokeWidth={2.6} fill={Colors.text} />
              <Text style={styles.reelTileStat}>{r.likesCount}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function FollowListSheet({
  visible,
  kind,
  userId,
  onClose,
  onOpenUser,
}: {
  visible: boolean;
  kind: "followers" | "following";
  userId: string | null;
  onClose: () => void;
  onOpenUser: (username: string) => void;
}) {
  const list = useFollowList(visible ? userId : null, kind);
  const data = list.data ?? [];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={followStyles.backdrop} onPress={onClose}>
        <Pressable style={followStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={followStyles.handle} />
          <View style={followStyles.head}>
            <View style={followStyles.titleRow}>
              <Users color={Colors.mint} size={16} strokeWidth={2.6} />
              <Text style={followStyles.title}>
                {kind === "followers" ? "Followers" : "Following"}
              </Text>
              <View style={followStyles.countPill}>
                <Text style={followStyles.countText}>{data.length}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={followStyles.closeBtn}>
              <X color={Colors.text} size={16} strokeWidth={2.6} />
            </Pressable>
          </View>
          {list.isLoading ? (
            <View style={followStyles.loading}>
              <ActivityIndicator color={Colors.mint} />
            </View>
          ) : data.length === 0 ? (
            <View style={followStyles.empty}>
              <Text style={followStyles.emptyTitle}>
                {kind === "followers" ? "No followers yet" : "Not following anyone yet"}
              </Text>
              <Text style={followStyles.emptyBody}>
                {kind === "followers"
                  ? "Share alpha and great posts to grow a real audience."
                  : "Discover traders to follow on the Users tab."}
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={followStyles.list}>
              {data.map((u) => (
                <FollowRow
                  key={u.user_id}
                  user={u}
                  onPress={() => {
                    const username = (u.username ?? "").replace(/^@/, "").trim();
                    if (username) onOpenUser(username);
                  }}
                />
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FollowRow({ user, onPress }: { user: ProfileSummary; onPress: () => void }) {
  const display = user.display_name ?? user.username ?? "Trader";
  const initial = display.slice(0, 1).toUpperCase();
  return (
    <Pressable onPress={onPress} style={followStyles.row} testID={`follow-row-${user.user_id}`}>
      {user.avatar_url ? (
        <Image source={{ uri: user.avatar_url }} style={followStyles.avatar} contentFit="cover" />
      ) : (
        <View style={[followStyles.avatar, { backgroundColor: Colors.mint, alignItems: "center", justifyContent: "center" }]}>
          <Text style={followStyles.avatarInit}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={followStyles.nameRow}>
          <Text style={followStyles.name} numberOfLines={1}>
            {display}
          </Text>
          {user.verified ? <BadgeCheck color={Colors.cyan} size={12} strokeWidth={2.8} /> : null}
        </View>
        <Text style={followStyles.handle} numberOfLines={1}>
          @{(user.username ?? "trader").replace(/^@/, "")}
        </Text>
      </View>
      {typeof user.followers_count === "number" ? (
        <Text style={followStyles.followers}>
          {compactNumber(user.followers_count)} followers
        </Text>
      ) : null}
    </Pressable>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(diff / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  scroll: { paddingBottom: 80 },
  center: {
    flex: 1,
    backgroundColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  notFoundTitle: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  notFoundBody: { color: Colors.muted, fontSize: 14, textAlign: "center" },
  backCta: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: Colors.mint,
    borderRadius: 14,
  },
  backCtaText: { color: Colors.ink, fontWeight: "900" },
  bannerWrap: { height: 180, position: "relative", overflow: "hidden" },
  bannerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.18)" },
  bannerHeader: { paddingHorizontal: 16, paddingTop: 6 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  body: { paddingHorizontal: 18, marginTop: -42 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: Colors.ink,
    padding: 4,
  },
  avatarImg: { flex: 1, borderRadius: 22 },
  avatar: { flex: 1, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: Colors.ink, fontSize: 32, fontWeight: "900" },
  actionStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  messageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  messageBtnText: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  tipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,184,76,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.4)",
  },
  tipBtnText: {
    color: Colors.orange,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  followBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  notFollowingBtn: { backgroundColor: Colors.mint },
  followingBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  followBtnText: { fontSize: 13, fontWeight: "900", letterSpacing: 0.4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  displayName: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  handleText: { color: Colors.muted, fontSize: 13, fontWeight: "700", marginTop: 2 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
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
  bio: { color: Colors.text, fontSize: 14, fontWeight: "500", lineHeight: 20, marginTop: 12 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  followStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: Colors.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  followCell: { flex: 1, alignItems: "center" },
  followNum: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  followKey: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  followDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.06)" },
  statsGrid: { flexDirection: "row", gap: 8, marginTop: 14 },
  statCard: {
    flex: 1,
    padding: 12,
    gap: 6,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statNum: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  statKey: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },

  feedTabsRow: { flexDirection: "row", gap: 8, marginTop: 22 },
  feedTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  feedTabActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  feedTabText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  feedTabTextActive: { color: Colors.ink, fontWeight: "900" },

  feedEmpty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  feedEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  feedEmptyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  feedEmptyBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 18,
    lineHeight: 17,
  },

  postsWrap: { gap: 10, marginTop: 14 },
  postCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 10,
  },
  postHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvatar: { width: 38, height: 38, borderRadius: 12 },
  postAvatarInit: { color: Colors.ink, fontSize: 15, fontWeight: "900" },
  postNameRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  postName: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2, maxWidth: 160 },
  postHandle: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  postTime: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  postBody: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  postImage: { width: "100%", height: 220, borderRadius: 12, backgroundColor: "#0a0f15" },
  postTokenPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.3)",
  },
  postTokenText: { color: Colors.cyan, fontSize: 11, fontWeight: "900" },
  postChange: { fontSize: 11, fontWeight: "900" },
  postStatsRow: { flexDirection: "row", gap: 18, marginTop: 4 },
  postStatItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  postStatText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  reelsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 14 },
  reelTile: {
    width: "32.6%",
    aspectRatio: 9 / 14,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#070c11",
    position: "relative",
  },
  reelTileTop: { position: "absolute", top: 6, left: 6 },
  reelPlayPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(244,198,91,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  reelTileBottom: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reelTileStat: { color: Colors.text, fontSize: 11, fontWeight: "900" },
});

const followStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: {
    height: "72%",
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 12,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.14)",
  },
  countText: { color: Colors.mint, fontSize: 10, fontWeight: "900" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  list: { paddingHorizontal: 14, paddingBottom: 30 },
  loading: { paddingVertical: 60, alignItems: "center" },
  empty: { paddingHorizontal: 32, paddingVertical: 60, alignItems: "center" },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  avatar: { width: 42, height: 42, borderRadius: 13 },
  avatarInit: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, flexShrink: 1 },
  handle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  followers: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
});

const tipStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: "rgba(255,184,76,0.18)",
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  sub: { color: Colors.muted, fontSize: 13, fontWeight: "600", marginTop: 6 },
  sectionLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 22,
    marginBottom: 10,
  },
  amountRow: { flexDirection: "row", gap: 8 },
  amountChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  amountChipActive: {
    backgroundColor: "rgba(255,184,76,0.14)",
    borderColor: Colors.orange,
  },
  amountText: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  amountTextActive: { color: Colors.orange, fontWeight: "900" },
  walletBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.18)",
  },
  walletIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,215,255,0.16)",
  },
  walletText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    flex: 1,
  },
  sendBtn: {
    marginTop: 22,
    borderRadius: 16,
    overflow: "hidden",
  },
  sendGrad: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendText: {
    color: Colors.ink,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  foot: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 14,
    lineHeight: 16,
  },
});
