import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  CalendarCheck,
  Clock,
  Globe2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { deleteMyEvent, listEventRsvps, listUpcomingEvents, rsvpEvent, type EventRow, type EventRsvpUser } from "@/lib/api/platform";
import { hapticSelect } from "@/lib/haptics";
import { navigateBack } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";

type Filter = "all" | "today" | "week" | "virtual" | "going";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "virtual", label: "Virtual" },
  { id: "going", label: "Going" },
];

function formatDay(iso: string): { day: string; month: string; time: string } {
  const d = new Date(iso);
  return {
    day: d.getDate().toString().padStart(2, "0"),
    month: d.toLocaleString(undefined, { month: "short" }).toUpperCase(),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function withinWindow(iso: string, hours: number): boolean {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return t >= now - 3_600_000 && t <= now + hours * 3_600_000;
}

export default function EventsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, userId } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [authUid, setAuthUid] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setAuthUid(data.user?.id ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const myId = userId ?? authUid;

  const [rsvpSheet, setRsvpSheet] = useState<{ eventId: string; title: string; tab: "going" | "interested" } | null>(null);

  const rsvpListQuery = useQuery<EventRsvpUser[]>({
    queryKey: ["event-rsvps", rsvpSheet?.eventId ?? null, rsvpSheet?.tab ?? null],
    queryFn: () => (rsvpSheet ? listEventRsvps(rsvpSheet.eventId, rsvpSheet.tab) : Promise.resolve([])),
    enabled: !!rsvpSheet,
    staleTime: 10_000,
  });

  const query = useQuery<EventRow[]>({
    queryKey: ["events", "upcoming"],
    queryFn: () => listUpcomingEvents(),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const events = query.data ?? [];

  const filtered = useMemo<EventRow[]>(() => {
    if (filter === "today") return events.filter((e) => withinWindow(e.starts_at, 24));
    if (filter === "week") return events.filter((e) => withinWindow(e.starts_at, 24 * 7));
    if (filter === "virtual") return events.filter((e) => e.is_virtual);
    if (filter === "going") return events.filter((e) => e.my_status === "going");
    return events;
  }, [events, filter]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteMyEvent(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] }).catch(() => {});
    },
    onError: (e: unknown) => {
      Alert.alert("Couldn't delete", e instanceof Error ? e.message : "Try again.");
    },
  });

  const openOwnerMenu = (item: EventRow) => {
    Alert.alert(item.title, "Manage this event", [
      {
        text: "Edit",
        onPress: () => router.push({ pathname: "/events/edit/[id]", params: { id: item.id } }),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete event?", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => del.mutate(item.id) },
          ]),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const rsvp = useMutation({
    mutationFn: async (input: { id: string; status: "going" | "interested" | "no" }) => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to RSVP.");
      await rsvpEvent(input.id, input.status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] }).catch(() => {});
    },
    onError: (e: unknown) => {
      Alert.alert("RSVP failed", e instanceof Error ? e.message : "Try again.");
    },
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.nav}>
          <Pressable onPress={() => navigateBack(router, "/(tabs)/home")} style={styles.iconBtn} testID="events-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>WHAT&apos;S HAPPENING</Text>
            </View>
            <Text style={styles.title}>Events</Text>
          </View>
          <Pressable onPress={() => router.push("/events/create")} style={styles.createBtn} testID="event-create">
            <LinearGradient colors={[Colors.goldBright, Colors.mint]} style={styles.createGrad}>
              <Calendar color={Colors.ink} size={16} strokeWidth={2.8} />
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  hapticSelect();
                  setFilter(f.id);
                }}
                style={[styles.filterChip, active && styles.filterChipActive]}
                testID={`event-filter-${f.id}`}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const d = formatDay(item.starts_at);
            const hostId = (item as EventRow & { host_id?: string | null }).host_user_id ?? (item as EventRow & { host_id?: string | null }).host_id ?? null;
            const isOwner = !!myId && !!hostId && hostId === myId;
            return (
              <View style={styles.card} testID={`event-${item.id}`}>
                {item.banner_url ? (
                  <View style={styles.banner}>
                    <ExpoImage source={{ uri: item.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.8)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.bannerTag}>
                      {item.is_virtual ? (
                        <Globe2 color={Colors.text} size={11} strokeWidth={2.6} />
                      ) : (
                        <MapPin color={Colors.text} size={11} strokeWidth={2.6} />
                      )}
                      <Text style={styles.bannerTagText}>
                        {item.is_virtual ? "Virtual" : item.location ?? "In person"}
                      </Text>
                    </View>
                    {isOwner ? (
                      <Pressable
                        onPress={() => openOwnerMenu(item)}
                        style={styles.ownerBtn}
                        testID={`event-owner-${item.id}`}
                        hitSlop={10}
                      >
                        <MoreHorizontal color={Colors.text} size={16} strokeWidth={2.6} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View style={[styles.banner, styles.bannerFallback]}>
                    <LinearGradient
                      colors={[Colors.mint, Colors.violet]}
                      style={StyleSheet.absoluteFill}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    />
                    {isOwner ? (
                      <Pressable
                        onPress={() => openOwnerMenu(item)}
                        style={styles.ownerBtn}
                        testID={`event-owner-${item.id}`}
                        hitSlop={10}
                      >
                        <MoreHorizontal color={Colors.text} size={16} strokeWidth={2.6} />
                      </Pressable>
                    ) : null}
                  </View>
                )}
                <View style={styles.body}>
                  <View style={styles.datePill}>
                    <Text style={styles.dateMonth}>{d.month}</Text>
                    <Text style={styles.dateDay}>{d.day}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <Clock color={Colors.muted} size={11} strokeWidth={2.4} />
                      <Text style={styles.metaText}>{d.time}</Text>
                      <View style={styles.metaDot} />
                      <Pressable
                        onPress={() => {
                          hapticSelect();
                          setRsvpSheet({ eventId: item.id, title: item.title, tab: "going" });
                        }}
                        testID={`event-going-list-${item.id}`}
                        hitSlop={6}
                      >
                        <Text style={[styles.metaText, styles.metaLink]}>{item.going_count} going</Text>
                      </Pressable>
                    </View>
                    {item.description ? (
                      <Text style={styles.eventBody} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  {isOwner ? (
                    <>
                      <Pressable
                        onPress={() => router.push({ pathname: "/events/edit/[id]", params: { id: item.id } })}
                        style={[styles.actionBtn, styles.actionBtnEdit]}
                        testID={`event-edit-${item.id}`}
                      >
                        <Pencil color={Colors.text} size={14} strokeWidth={2.7} />
                        <Text style={styles.actionText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          Alert.alert("Delete event?", "This cannot be undone.", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => del.mutate(item.id) },
                          ])
                        }
                        style={[styles.actionBtn, styles.actionBtnDelete]}
                        testID={`event-delete-${item.id}`}
                      >
                        <Trash2 color={Colors.danger ?? "#ff5d6c"} size={14} strokeWidth={2.7} />
                        <Text style={[styles.actionText, { color: Colors.danger ?? "#ff5d6c" }]}>Delete</Text>
                      </Pressable>
                    </>
                  ) : (
                  <>
                  <View style={styles.pollWrap}>
                    <Pressable
                      onPress={() => {
                        hapticSelect();
                        setRsvpSheet({ eventId: item.id, title: item.title, tab: "going" });
                      }}
                      style={styles.pollPeek}
                      testID={`rsvp-going-peek-${item.id}`}
                      hitSlop={4}
                    >
                      <Text style={styles.pollPeekText}>See who&apos;s going</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        hapticSelect();
                        setRsvpSheet({ eventId: item.id, title: item.title, tab: "interested" });
                      }}
                      style={styles.pollPeek}
                      testID={`rsvp-interested-peek-${item.id}`}
                      hitSlop={4}
                    >
                      <Text style={styles.pollPeekText}>See who&apos;s interested</Text>
                    </Pressable>
                  </View>
                  </>
                  )}
                </View>
                {!isOwner && (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => rsvp.mutate({ id: item.id, status: "going" })}
                    style={[styles.actionBtn, item.my_status === "going" && styles.actionBtnActive]}
                    testID={`rsvp-going-${item.id}`}
                  >
                    <CalendarCheck
                      color={item.my_status === "going" ? Colors.ink : Colors.goldBright}
                      size={14}
                      strokeWidth={2.7}
                    />
                    <Text style={[styles.actionText, item.my_status === "going" && styles.actionTextActive]}>
                      Going
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => rsvp.mutate({ id: item.id, status: "interested" })}
                    style={[styles.actionBtn, item.my_status === "interested" && styles.actionBtnInterested]}
                    testID={`rsvp-interested-${item.id}`}
                  >
                    <Star
                      color={item.my_status === "interested" ? Colors.ink : Colors.text}
                      size={14}
                      strokeWidth={2.7}
                      fill={item.my_status === "interested" ? Colors.ink : "transparent"}
                    />
                    <Text style={[styles.actionText, item.my_status === "interested" && styles.actionTextActive]}>
                      Interested
                    </Text>
                  </Pressable>
                  {item.my_status ? (
                    <Pressable
                      onPress={() => rsvp.mutate({ id: item.id, status: "no" })}
                      style={styles.clearBtn}
                      testID={`rsvp-clear-${item.id}`}
                    >
                      <X color={Colors.muted} size={14} strokeWidth={2.7} />
                    </Pressable>
                  ) : null}
                </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Calendar color={Colors.goldBright} size={36} strokeWidth={2.2} />
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyBody}>Be the first to schedule a launch party, AMA, or community meetup.</Text>
            </View>
          }
        />
      </SafeAreaView>

      <Modal
        visible={!!rsvpSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setRsvpSheet(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setRsvpSheet(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{rsvpSheet?.title ?? "RSVPs"}</Text>
            <View style={styles.sheetTabs}>
              {((["going", "interested"] as const)).map((t) => {
                const active = rsvpSheet?.tab === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      hapticSelect();
                      if (rsvpSheet) setRsvpSheet({ ...rsvpSheet, tab: t });
                    }}
                    style={[styles.sheetTab, active && styles.sheetTabActive]}
                    testID={`rsvp-sheet-tab-${t}`}
                  >
                    <Text style={[styles.sheetTabText, active && styles.sheetTabTextActive]}>
                      {t === "going" ? "Going" : "Interested"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {rsvpListQuery.isLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={Colors.goldBright} />
              </View>
            ) : (
              <FlatList
                data={rsvpListQuery.data ?? []}
                keyExtractor={(u) => u.user_id}
                contentContainerStyle={styles.sheetList}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={styles.sheetSep} />}
                renderItem={({ item: u }) => {
                  const name = (u.display_name && u.display_name.trim()) || (u.username && `@${u.username.replace(/^@/, "")}`) || "Anon";
                  const handle = u.username ? `@${u.username.replace(/^@/, "")}` : "";
                  return (
                    <Pressable
                      onPress={() => {
                        setRsvpSheet(null);
                        router.push({ pathname: "/u/[id]", params: { id: u.user_id } });
                      }}
                      style={styles.sheetRow}
                      testID={`rsvp-user-${u.user_id}`}
                    >
                      {u.avatar_url ? (
                        <ExpoImage source={{ uri: u.avatar_url }} style={styles.sheetAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.sheetAvatar, { backgroundColor: u.avatar_color ?? Colors.violet, alignItems: "center", justifyContent: "center" }]}>
                          <Text style={styles.sheetAvatarInitial}>{(name[0] ?? "?").toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.sheetNameRow}>
                          <Text style={styles.sheetName} numberOfLines={1}>{name}</Text>
                          {u.verified ? (
                            <BadgeCheck color={Colors.goldBright} size={14} strokeWidth={2.8} fill={Colors.ink} />
                          ) : null}
                        </View>
                        {handle ? <Text style={styles.sheetHandle} numberOfLines={1}>{handle}</Text> : null}
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.sheetEmpty}>
                    <Text style={styles.sheetEmptyTitle}>Nobody yet</Text>
                    <Text style={styles.sheetEmptyBody}>
                      Be the first to tap {rsvpSheet?.tab === "going" ? "Going" : "Interested"}.
                    </Text>
                  </View>
                }
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  nav: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  createBtn: { borderRadius: 14, overflow: "hidden" },
  createGrad: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginTop: 8, marginBottom: 6, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  filterChipActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  filterText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: Colors.ink },
  list: { paddingHorizontal: 14, paddingBottom: 140, paddingTop: 8 },
  sep: { height: 12 },
  card: { borderRadius: 22, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  banner: { height: 110 },
  bannerFallback: { backgroundColor: Colors.violet },
  bannerTag: {
    position: "absolute", left: 12, bottom: 12,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  bannerTagText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  body: { flexDirection: "row", gap: 12, padding: 14 },
  datePill: {
    width: 52, paddingVertical: 8, borderRadius: 14,
    backgroundColor: "rgba(63,169,255,0.14)", borderWidth: 1, borderColor: "rgba(63,169,255,0.32)",
    alignItems: "center", justifyContent: "center",
  },
  dateMonth: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  dateDay: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.5, marginTop: 2 },
  eventTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  metaText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  metaLink: { color: Colors.text, textDecorationLine: "underline", textDecorationColor: "rgba(255,255,255,0.25)" },
  pollWrap: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 4, paddingTop: 0 },
  pollPeek: {
    flex: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  pollPeekText: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 10, paddingBottom: 28, maxHeight: "80%",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  sheetHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 10 },
  sheetTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.3, paddingHorizontal: 18, marginBottom: 10 },
  sheetTabs: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 6 },
  sheetTab: {
    flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  sheetTabActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  sheetTabText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  sheetTabTextActive: { color: Colors.ink },
  sheetLoading: { paddingVertical: 40, alignItems: "center" },
  sheetList: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  sheetSep: { height: 8 },
  sheetRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 8, paddingHorizontal: 8, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  sheetAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)" },
  sheetAvatarInitial: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  sheetName: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  sheetNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sheetHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 1 },
  sheetEmpty: { alignItems: "center", paddingVertical: 40, gap: 6 },
  sheetEmptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  sheetEmptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.muted2 },
  eventBody: { color: Colors.muted, fontSize: 12, fontWeight: "650", marginTop: 6, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  actionBtnActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  actionBtnInterested: { backgroundColor: Colors.silver, borderColor: Colors.silver },
  actionText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  actionTextActive: { color: Colors.ink },
  clearBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  ownerBtn: {
    position: "absolute", right: 10, top: 10,
    width: 32, height: 32, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  actionBtnEdit: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.16)" },
  actionBtnDelete: { backgroundColor: "rgba(255,93,108,0.12)", borderColor: "rgba(255,93,108,0.40)" },
  empty: { alignItems: "center", paddingHorizontal: 30, paddingVertical: 56, gap: 10 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 19 },
});
