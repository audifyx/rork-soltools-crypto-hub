import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, ShieldOff, UserX } from "lucide-react-native";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";
import {
  useBlockedUsers,
  useMessages,
  type BlockedUserRow,
} from "@/providers/messages-provider";

export default function BlockedUsersScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useAuth();
  const blockedQ = useBlockedUsers();
  const { unblockUser } = useMessages();
  const rows: BlockedUserRow[] = blockedQ.data ?? [];

  const unblockMut = useMutation({
    mutationFn: async (target: BlockedUserRow) => unblockUser(target.blocked_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", "blocked", userId ?? "guest"] }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["messages"] }).catch(() => {});
    },
    onError: (e: Error) => Alert.alert("Couldn't unblock", e.message),
  });

  const onUnblock = useCallback(
    (target: BlockedUserRow) => {
      const display = target.display_name ?? target.username ?? "this user";
      Alert.alert(
        "Unblock?",
        `${display} will be able to follow, message, and see your activity again.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unblock",
            style: "destructive",
            onPress: () => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              }
              unblockMut.mutate(target);
            },
          },
        ],
      );
    },
    [unblockMut],
  );

  const onOpenUser = useCallback(
    (username: string | null) => {
      const handle = (username ?? "").replace(/^@/, "").trim();
      if (!handle) return;
      router.push({ pathname: "/u/[handle]", params: { handle } });
    },
    [router],
  );

  return (
    <View style={styles.root}>
      <AppBackground variant="social" />
      <Stack.Screen options={{ headerShown: false, animation: "slide_from_right" }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateBack(router, "/(tabs)/profile")}
            style={styles.iconBtn}
            testID="blocked-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Blocked users</Text>
            <Text style={styles.subtitle}>
              {rows.length === 0 ? "No one blocked" : `${rows.length} blocked`}
            </Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <FlatList
          data={rows}
          keyExtractor={(item) => item.blocked_id}
          renderItem={({ item }) => (
            <BlockedRow
              row={item}
              busy={unblockMut.isPending}
              onUnblock={() => onUnblock(item)}
              onPress={() => onOpenUser(item.username)}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            rows.length > 0 ? (
              <View style={styles.notice}>
                <ShieldOff color={Colors.mint} size={14} strokeWidth={2.4} />
                <Text style={styles.noticeText}>
                  Blocked users can&apos;t follow you, DM you, or see your activity. They won&apos;t know they were blocked.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            blockedQ.isLoading ? (
              <ActivityIndicator color={Colors.mint} style={{ marginTop: 80 }} />
            ) : (
              <View style={styles.empty}>
                <UserX color={Colors.mint} size={28} strokeWidth={2.2} />
                <Text style={styles.emptyTitle}>No blocked users</Text>
                <Text style={styles.emptyBody}>
                  Block someone from their profile or a chat to stop seeing them entirely. They&apos;ll appear here so you can manage them.
                </Text>
              </View>
            )
          }
          refreshing={blockedQ.isRefetching}
          onRefresh={() => blockedQ.refetch().catch(() => {})}
        />
      </SafeAreaView>
    </View>
  );
}

function BlockedRow({
  row,
  busy,
  onUnblock,
  onPress,
}: {
  row: BlockedUserRow;
  busy: boolean;
  onUnblock: () => void;
  onPress: () => void;
}) {
  const display = row.display_name ?? row.username ?? "Trader";
  const initial = display.slice(0, 1).toUpperCase();
  const color = row.avatar_color ?? Colors.mint;
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`blocked-${row.blocked_id}`}>
      {row.avatar_url ? (
        <Image source={{ uri: row.avatar_url }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: color, alignItems: "center", justifyContent: "center" }]}>
          <Text style={styles.avatarInit}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{display}</Text>
          {row.verified ? <BadgeCheck color={Colors.cyan} size={12} strokeWidth={2.8} /> : null}
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          @{(row.username ?? "trader").replace(/^@/, "")}
        </Text>
      </View>
      <Pressable
        onPress={onUnblock}
        disabled={busy}
        style={[styles.unblockBtn, busy && { opacity: 0.5 }]}
        testID={`unblock-${row.blocked_id}`}
      >
        <Text style={styles.unblockText}>Unblock</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCenter: { alignItems: "center", gap: 4 },
  title: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  subtitle: { color: Colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { paddingVertical: 6, paddingBottom: 80, flexGrow: 1 },
  separator: { height: 1, backgroundColor: "rgba(255,255,255,0.04)", marginLeft: 64 },
  notice: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(85,245,178,0.08)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  noticeText: { color: Colors.muted, fontSize: 12, lineHeight: 17, flex: 1, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 14 },
  avatarInit: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, maxWidth: 200 },
  handle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  unblockBtn: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  unblockText: { color: Colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  empty: { paddingTop: 80, alignItems: "center", paddingHorizontal: 32, gap: 10 },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", marginTop: 8, letterSpacing: -0.3 },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 19,
  },
});
