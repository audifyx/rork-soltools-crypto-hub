import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Check,
  Coins,
  Copy,
  Globe,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Twitter,
  UserPlus,
  UserCheck,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
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
import { useAuth } from "@/providers/auth-provider";
import {
  useProfileProvider,
  usePublicProfile,
  type CustomBadge,
} from "@/providers/profile-provider";

export default function PublicProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ handle: string }>();
  const handle = (params.handle ?? "").toString();
  const { userId, isAuthenticated } = useAuth();
  const { toggleFollow, isToggling } = useProfileProvider();

  const profileQ = usePublicProfile(handle);
  const profile = profileQ.data;
  const isSelf = !!profile && profile.id === userId;
  const [tipOpen, setTipOpen] = useState<boolean>(false);

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
        <Text style={styles.notFoundBody}>@{handle.replace("@", "")} doesn&apos;t exist on SolTools.</Text>
        <Pressable onPress={() => router.back()} style={styles.backCta}>
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
          <View style={styles.bannerOverlay} />
          <SafeAreaView edges={["top"]} style={styles.bannerHeader}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} testID="public-back">
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
                {profile.wallet_address ? (
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== "web") {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      }
                      setTipOpen(true);
                    }}
                    style={styles.tipBtn}
                    testID="open-tip"
                  >
                    <Coins color={Colors.orange} size={13} strokeWidth={2.8} />
                    <Text style={styles.tipBtnText}>Tip</Text>
                  </Pressable>
                ) : null}
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
            <View style={styles.followCell}>
              <Text style={styles.followNum}>{profile.following_count}</Text>
              <Text style={styles.followKey}>Following</Text>
            </View>
            <View style={styles.followDivider} />
            <View style={styles.followCell}>
              <Text style={styles.followNum}>{profile.followers_count}</Text>
              <Text style={styles.followKey}>Followers</Text>
            </View>
            <View style={styles.followDivider} />
            <View style={styles.followCell}>
              <Text style={[styles.followNum, { color: Colors.mint }]}>{profile.xp}</Text>
              <Text style={styles.followKey}>XP</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Sparkles color={Colors.mint} size={13} strokeWidth={2.6} />
              <Text style={styles.statNum}>{profile.trades_count}</Text>
              <Text style={styles.statKey}>TRADES</Text>
            </View>
            <View style={styles.statCard}>
              <Star color={Colors.orange} size={13} strokeWidth={2.6} />
              <Text style={styles.statNum}>{Number(profile.win_rate).toFixed(0)}%</Text>
              <Text style={styles.statKey}>WIN RATE</Text>
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
        </View>
      </ScrollView>
      <TipModal
        visible={tipOpen}
        onClose={() => setTipOpen(false)}
        recipientName={display}
        recipientHandle={profile.username ?? "trader"}
        walletAddress={profile.wallet_address ?? ""}
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
            Opens Phantom (or your default wallet) to confirm. SolTools never holds funds.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
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
