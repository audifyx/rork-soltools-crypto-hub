import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, BadgeCheck, Check, UserPlus, Users, X } from "lucide-react-native";
import React, { useCallback } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import {
  useIncomingFollowRequests,
  useProfileProvider,
  type FollowRequestRow,
} from "@/providers/profile-provider";

export default function FollowRequestsScreen() {
  const router = useRouter();
  const requestsQ = useIncomingFollowRequests();
  const { respondFollowRequest, isRespondingRequest } = useProfileProvider();
  const requests: FollowRequestRow[] = requestsQ.data ?? [];

  const onRespond = useCallback(
    async (requestId: string, accept: boolean) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      try {
        await respondFollowRequest({ requestId, accept });
      } catch (e) {
        Alert.alert("Couldn't update", e instanceof Error ? e.message : "Try again");
      }
    },
    [respondFollowRequest],
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
            onPress={() => navigateBack(router, "/(tabs)/settings")}
            style={styles.iconBtn}
            testID="follow-req-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Follow requests</Text>
            <Text style={styles.subtitle}>
              {requests.length === 0
                ? "No pending requests"
                : `${requests.length} pending`}
            </Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <FlatList
          data={requests}
          keyExtractor={(item) => item.request_id}
          renderItem={({ item }) => (
            <RequestRow
              row={item}
              busy={isRespondingRequest}
              onAccept={() => onRespond(item.request_id, true)}
              onReject={() => onRespond(item.request_id, false)}
              onPress={() => onOpenUser(item.username)}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            requestsQ.isLoading ? (
              <ActivityIndicator color={Colors.mint} style={{ marginTop: 80 }} />
            ) : (
              <View style={styles.empty}>
                <Users color={Colors.mint} size={28} strokeWidth={2.2} />
                <Text style={styles.emptyTitle}>No pending requests</Text>
                <Text style={styles.emptyBody}>
                  When someone with a private-friendly account asks to follow you, they&apos;ll show up here.
                </Text>
              </View>
            )
          }
          refreshing={requestsQ.isRefetching}
          onRefresh={() => requestsQ.refetch().catch(() => {})}
        />
      </SafeAreaView>
    </View>
  );
}

function RequestRow({
  row,
  busy,
  onAccept,
  onReject,
  onPress,
}: {
  row: FollowRequestRow;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onPress: () => void;
}) {
  const display = row.display_name ?? row.username ?? "Trader";
  const initial = display.slice(0, 1).toUpperCase();
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`follow-req-${row.request_id}`}>
      {row.avatar_url ? (
        <Image source={{ uri: row.avatar_url }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInit}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {display}
          </Text>
          {row.verified ? <BadgeCheck color={Colors.cyan} size={12} strokeWidth={2.8} /> : null}
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          @{(row.username ?? "trader").replace(/^@/, "")}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onReject}
          disabled={busy}
          style={[styles.rejectBtn, busy && { opacity: 0.5 }]}
          testID={`reject-${row.request_id}`}
        >
          <X color={Colors.text} size={14} strokeWidth={2.8} />
        </Pressable>
        <Pressable
          onPress={onAccept}
          disabled={busy}
          style={[styles.acceptBtn, busy && { opacity: 0.5 }]}
          testID={`accept-${row.request_id}`}
        >
          <Check color={Colors.ink} size={14} strokeWidth={3} />
          <Text style={styles.acceptText}>Accept</Text>
        </Pressable>
      </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 14 },
  avatarFallback: { backgroundColor: Colors.mint, alignItems: "center", justifyContent: "center" },
  avatarInit: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, maxWidth: 180 },
  handle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  rejectBtn: {
    width: 36,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  acceptText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
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
