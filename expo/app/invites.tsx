import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Copy,
  Crown,
  Gift,
  Share2,
  Sparkles,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import {
  getMyInviteStats,
  getOrCreateInviteCode,
  listMyReferrals,
  redeemInviteCode,
  topReferrers,
  type InviteCode,
  type InviteStats,
  type LeaderboardEntry,
  type ReferralUser,
} from "@/lib/api/invites";
import { hapticSelect } from "@/lib/haptics";
import { navigateBack } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";

type Tab = "you" | "friends" | "leaderboard";

const TABS: { id: Tab; label: string }[] = [
  { id: "you", label: "Your code" },
  { id: "friends", label: "Invited" },
  { id: "leaderboard", label: "Top inviters" },
];

function shortTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export default function InvitesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("you");
  const [redeemInput, setRedeemInput] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  const codeQ = useQuery<InviteCode | null>({
    queryKey: ["invites", "code"],
    queryFn: () => getOrCreateInviteCode(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const statsQ = useQuery<InviteStats>({
    queryKey: ["invites", "stats"],
    queryFn: () => getMyInviteStats(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const friendsQ = useQuery<ReferralUser[]>({
    queryKey: ["invites", "referrals"],
    queryFn: () => listMyReferrals(50),
    enabled: isAuthenticated && tab === "friends",
    staleTime: 30_000,
  });

  const boardQ = useQuery<LeaderboardEntry[]>({
    queryKey: ["invites", "leaderboard"],
    queryFn: () => topReferrers(25),
    enabled: tab === "leaderboard",
    staleTime: 60_000,
  });

  const redeem = useMutation({
    mutationFn: async (code: string) => redeemInviteCode(code),
    onSuccess: () => {
      Alert.alert("Welcome aboard", "Your invite was redeemed successfully.");
      setRedeemInput("");
      qc.invalidateQueries({ queryKey: ["invites"] }).catch(() => {});
    },
    onError: (e: unknown) => {
      Alert.alert("Couldn't redeem", e instanceof Error ? e.message : "Try a different code.");
    },
  });

  const code = codeQ.data?.code ?? null;
  const totalInvites = statsQ.data?.total_invites ?? 0;
  const myRank = statsQ.data?.rank ?? 0;
  const credits = statsQ.data?.reward_credits_earned ?? 0;

  const onCopy = async (): Promise<void> => {
    if (!code) return;
    hapticSelect();
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      console.log("[invites] copy failed", e);
    }
  };

  const onShare = async (): Promise<void> => {
    if (!code) return;
    hapticSelect();
    try {
      await Share.share({
        message: `Join me on the app — use my invite code ${code} when you sign up.`,
        title: "Join with my invite code",
      });
    } catch (e) {
      console.log("[invites] share failed", e);
    }
  };

  const onRedeem = (): void => {
    const v = redeemInput.trim().toUpperCase();
    if (v.length < 4) {
      Alert.alert("Enter a code", "Paste a friend's invite code first.");
      return;
    }
    redeem.mutate(v);
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.nav}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/home")}
            style={styles.iconBtn}
            testID="invites-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.cyan} size={12} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>GROW THE CREW</Text>
            </View>
            <Text style={styles.title}>Invite friends</Text>
          </View>
          <View style={styles.countPill}>
            <UserPlus color={Colors.cyan} size={12} strokeWidth={2.8} />
            <Text style={styles.countText}>{totalInvites}</Text>
          </View>
        </View>

        <View style={styles.tabsRow}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  hapticSelect();
                  setTab(t.id);
                }}
                style={[styles.tabChip, active && styles.tabChipActive]}
                testID={`invites-tab-${t.id}`}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {!isAuthenticated ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <UserPlus color={Colors.cyan} size={28} strokeWidth={2.2} />
            </View>
            <Text style={styles.emptyTitle}>Sign in to invite friends</Text>
            <Text style={styles.emptyBody}>Share your code and climb the leaderboard.</Text>
          </View>
        ) : tab === "you" ? (
          <FlatList
            data={[0]}
            keyExtractor={() => "you"}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={(codeQ.isFetching || statsQ.isFetching) && !codeQ.isLoading}
                onRefresh={() => {
                  codeQ.refetch().catch(() => {});
                  statsQ.refetch().catch(() => {});
                }}
                tintColor={Colors.muted}
              />
            }
            renderItem={() => (
              <View style={{ gap: 14 }}>
                <LinearGradient
                  colors={["rgba(63,169,255,0.22)", "rgba(63,169,255,0.04)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.codeCard}
                >
                  <View style={styles.codeHead}>
                    <View style={styles.codeBadge}>
                      <Ticket color={Colors.cyan} size={14} strokeWidth={2.6} />
                      <Text style={styles.codeBadgeText}>YOUR INVITE CODE</Text>
                    </View>
                    {codeQ.data?.reward_credits ? (
                      <View style={styles.rewardPill}>
                        <Gift color={Colors.goldBright} size={11} strokeWidth={2.8} />
                        <Text style={styles.rewardText}>+{codeQ.data.reward_credits} credits each</Text>
                      </View>
                    ) : null}
                  </View>

                  {codeQ.isLoading || !code ? (
                    <View style={styles.codeLoading}>
                      <ActivityIndicator color={Colors.cyan} />
                    </View>
                  ) : (
                    <Text style={styles.codeText} selectable>
                      {code}
                    </Text>
                  )}

                  <View style={styles.codeActions}>
                    <Pressable
                      onPress={onCopy}
                      disabled={!code}
                      style={[styles.actionBtn, !code && styles.actionDisabled]}
                      testID="invites-copy"
                    >
                      {copied ? (
                        <Check color={Colors.text} size={14} strokeWidth={2.8} />
                      ) : (
                        <Copy color={Colors.text} size={14} strokeWidth={2.6} />
                      )}
                      <Text style={styles.actionText}>{copied ? "Copied" : "Copy"}</Text>
                    </Pressable>
                    <Pressable
                      onPress={onShare}
                      disabled={!code}
                      style={[styles.actionBtnPrimary, !code && styles.actionDisabled]}
                      testID="invites-share"
                    >
                      <Share2 color={Colors.ink} size={14} strokeWidth={2.8} />
                      <Text style={styles.actionTextPrimary}>Share invite</Text>
                    </Pressable>
                  </View>
                </LinearGradient>

                <View style={styles.statsRow}>
                  <StatTile
                    Icon={Users}
                    label="Friends joined"
                    value={String(totalInvites)}
                    tint={Colors.cyan}
                  />
                  <StatTile
                    Icon={TrendingUp}
                    label="Your rank"
                    value={myRank > 0 ? `#${myRank}` : "—"}
                    tint={Colors.violet}
                  />
                  <StatTile
                    Icon={Gift}
                    label="Credits"
                    value={String(credits)}
                    tint={Colors.goldBright}
                  />
                </View>

                <View style={styles.redeemCard}>
                  <Text style={styles.redeemTitle}>Have an invite code?</Text>
                  <Text style={styles.redeemBody}>
                    Paste a friend's code to reward them and unlock perks.
                  </Text>
                  <View style={styles.redeemRow}>
                    <TextInput
                      value={redeemInput}
                      onChangeText={(t) => setRedeemInput(t.toUpperCase())}
                      placeholder="ABCD1234"
                      placeholderTextColor={Colors.muted2}
                      style={styles.redeemInput}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={16}
                      testID="invites-redeem-input"
                    />
                    <Pressable
                      onPress={onRedeem}
                      disabled={redeem.isPending}
                      style={[styles.redeemBtn, redeem.isPending && styles.actionDisabled]}
                      testID="invites-redeem-submit"
                    >
                      {redeem.isPending ? (
                        <ActivityIndicator color={Colors.ink} size="small" />
                      ) : (
                        <Text style={styles.redeemBtnText}>Redeem</Text>
                      )}
                    </Pressable>
                  </View>
                </View>

                <View style={styles.howCard}>
                  <Text style={styles.howTitle}>How it works</Text>
                  <HowStep n={1} text="Share your code with friends." />
                  <HowStep n={2} text="They enter it when signing up — or in this screen." />
                  <HowStep n={3} text="You both earn credits and climb the leaderboard." />
                </View>
              </View>
            )}
          />
        ) : tab === "friends" ? (
          <FlatList
            data={friendsQ.data ?? []}
            keyExtractor={(u) => u.user_id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            refreshControl={
              <RefreshControl
                refreshing={friendsQ.isFetching && !friendsQ.isLoading}
                onRefresh={() => friendsQ.refetch().catch(() => {})}
                tintColor={Colors.muted}
              />
            }
            ListEmptyComponent={
              friendsQ.isLoading ? (
                <View style={styles.emptyWrap}>
                  <ActivityIndicator color={Colors.muted} />
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyIcon}>
                    <Users color={Colors.cyan} size={28} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.emptyTitle}>No friends yet</Text>
                  <Text style={styles.emptyBody}>
                    Share your code to start filling this list.
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.friendRow}
                onPress={() => {
                  if (item.username) {
                    router.push({ pathname: "/u/[handle]", params: { handle: item.username } });
                  }
                }}
                testID={`invites-friend-${item.user_id}`}
              >
                <Avatar user={item} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.friendName} numberOfLines={1}>
                      {item.display_name ?? item.username ?? "New friend"}
                    </Text>
                    {item.verified ? (
                      <BadgeCheck color={Colors.mint} size={13} strokeWidth={2.6} />
                    ) : null}
                  </View>
                  {item.username ? (
                    <Text style={styles.friendHandle} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.friendTime}>{shortTime(item.created_at)}</Text>
              </Pressable>
            )}
          />
        ) : (
          <FlatList
            data={boardQ.data ?? []}
            keyExtractor={(e) => e.user_id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            refreshControl={
              <RefreshControl
                refreshing={boardQ.isFetching && !boardQ.isLoading}
                onRefresh={() => boardQ.refetch().catch(() => {})}
                tintColor={Colors.muted}
              />
            }
            ListEmptyComponent={
              boardQ.isLoading ? (
                <View style={styles.emptyWrap}>
                  <ActivityIndicator color={Colors.muted} />
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyIcon}>
                    <Crown color={Colors.goldBright} size={28} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.emptyTitle}>Leaderboard opens soon</Text>
                  <Text style={styles.emptyBody}>Be the first inviter and claim #1.</Text>
                </View>
              )
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.leaderRow, item.rank <= 3 && styles.leaderRowTop]}
                onPress={() => {
                  if (item.username) {
                    router.push({ pathname: "/u/[handle]", params: { handle: item.username } });
                  }
                }}
                testID={`invites-leader-${item.user_id}`}
              >
                <View style={[styles.rankPill, rankStyle(item.rank)]}>
                  {item.rank === 1 ? (
                    <Crown color={Colors.ink} size={12} strokeWidth={3} />
                  ) : (
                    <Text style={styles.rankText}>#{item.rank}</Text>
                  )}
                </View>
                <Avatar user={item} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.friendName} numberOfLines={1}>
                      {item.display_name ?? item.username ?? "Anon"}
                    </Text>
                    {item.verified ? (
                      <BadgeCheck color={Colors.mint} size={13} strokeWidth={2.6} />
                    ) : null}
                  </View>
                  {item.username ? (
                    <Text style={styles.friendHandle} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.invitesBadge}>
                  <UserPlus color={Colors.cyan} size={11} strokeWidth={2.8} />
                  <Text style={styles.invitesBadgeText}>{item.invites_count}</Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

function rankStyle(rank: number): { backgroundColor: string } {
  if (rank === 1) return { backgroundColor: Colors.goldBright };
  if (rank === 2) return { backgroundColor: "rgba(230,242,255,0.95)" };
  if (rank === 3) return { backgroundColor: "rgba(30,136,255,0.9)" };
  return { backgroundColor: "rgba(255,255,255,0.08)" };
}

interface StatTileProps {
  Icon: React.ComponentType<{ color: string; size: number; strokeWidth: number }>;
  label: string;
  value: string;
  tint: string;
}

function StatTile({ Icon, label, value, tint }: StatTileProps) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: tint + "22" }]}>
        <Icon color={tint} size={14} strokeWidth={2.6} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface HowStepProps {
  n: number;
  text: string;
}

function HowStep({ n, text }: HowStepProps) {
  return (
    <View style={styles.howRow}>
      <View style={styles.howNum}>
        <Text style={styles.howNumText}>{n}</Text>
      </View>
      <Text style={styles.howText}>{text}</Text>
    </View>
  );
}

interface AvatarProps {
  user: { display_name: string | null; username: string | null; avatar_url: string | null; avatar_color: string | null };
  size: number;
}

function Avatar({ user, size }: AvatarProps) {
  const initial = (user.display_name ?? user.username ?? "?").slice(0, 1).toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 3, backgroundColor: user.avatar_color ?? Colors.violet },
      ]}
    >
      {user.avatar_url ? (
        <ExpoImage source={{ uri: user.avatar_url }} style={styles.avatarImg} contentFit="cover" />
      ) : (
        <Text style={[styles.avatarInit, { fontSize: size * 0.42 }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 24, fontWeight: "900", marginTop: 2 },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(63,169,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.32)",
  },
  countText: { color: Colors.cyan, fontSize: 12, fontWeight: "900" },

  tabsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabChipActive: { backgroundColor: "rgba(63,169,255,0.16)", borderColor: "rgba(63,169,255,0.42)" },
  tabText: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: Colors.cyan },

  list: { paddingHorizontal: 16, paddingBottom: 140, paddingTop: 4 },
  sep: { height: 10 },

  codeCard: {
    borderRadius: 22,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.28)",
  },
  codeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(63,169,255,0.18)",
  },
  codeBadgeText: { color: Colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  rewardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(98,208,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.32)",
  },
  rewardText: { color: Colors.goldBright, fontSize: 10, fontWeight: "900" },
  codeText: {
    color: Colors.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 6,
    textAlign: "center",
    paddingVertical: 6,
  },
  codeLoading: { height: 60, alignItems: "center", justifyContent: "center" },
  codeActions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionText: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  actionBtnPrimary: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.cyan,
  },
  actionTextPrimary: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  actionDisabled: { opacity: 0.5 },

  statsRow: { flexDirection: "row", gap: 10 },
  statTile: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  statLabel: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

  redeemCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  redeemTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  redeemBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  redeemRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  redeemInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2,
  },
  redeemBtn: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.cyan,
    alignItems: "center",
    justifyContent: "center",
  },
  redeemBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },

  howCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  howTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  howRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  howNum: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(63,169,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  howNumText: { color: Colors.cyan, fontSize: 12, fontWeight: "900" },
  howText: { color: Colors.muted, fontSize: 13, fontWeight: "600", flex: 1, lineHeight: 18 },

  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  friendName: { color: Colors.text, fontSize: 14, fontWeight: "800", maxWidth: 180 },
  friendHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 1 },
  friendTime: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },

  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  leaderRowTop: { borderColor: "rgba(98,208,255,0.32)", backgroundColor: "rgba(63,169,255,0.06)" },
  rankPill: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  invitesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(63,169,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.28)",
  },
  invitesBadgeText: { color: Colors.cyan, fontSize: 12, fontWeight: "900" },

  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInit: { color: "#FFFFFF", fontWeight: "900" },

  emptyWrap: {
    paddingTop: 60,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(63,169,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 19,
  },
});
