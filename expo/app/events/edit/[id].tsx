import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Check,
  Clock,
  Globe2,
  ImagePlus,
  Link2,
  MapPin,
  Sparkles,
  Trash2,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import {
  deleteMyEvent,
  getEventById,
  updateMyEvent,
  type EventRow,
} from "@/lib/api/platform";
import { hapticMedium, hapticSelect } from "@/lib/haptics";
import { navigateBack } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);
const MIN_OPTIONS = [0, 15, 30, 45];

export default function EditEventScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = typeof id === "string" ? id : "";

  const query = useQuery<EventRow | null>({
    queryKey: ["events", "detail", eventId],
    queryFn: () => getEventById(eventId),
    enabled: !!eventId,
  });

  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [eventUrl, setEventUrl] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [isVirtual, setIsVirtual] = useState<boolean>(true);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [duration, setDuration] = useState<number>(60);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    const e = query.data;
    if (!e || hydrated) return;
    setTitle(e.title);
    setDescription(e.description ?? "");
    setBannerUrl(e.banner_url ?? "");
    setEventUrl(e.url ?? "");
    setLocation(e.location ?? "");
    setIsVirtual(e.is_virtual);
    const starts = new Date(e.starts_at);
    setStartDate(starts);
    if (e.ends_at) {
      const ends = new Date(e.ends_at);
      const mins = Math.max(15, Math.round((ends.getTime() - starts.getTime()) / 60_000));
      setDuration(mins);
    }
    setHydrated(true);
  }, [query.data, hydrated]);

  const dayOptions = useMemo(() => {
    const days: Date[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  const setHM = useCallback((h: number, m: number) => {
    setStartDate((prev) => {
      const next = new Date(prev);
      next.setHours(h, m, 0, 0);
      return next;
    });
  }, []);

  const setDay = useCallback((d: Date) => {
    setStartDate((prev) => {
      const next = new Date(d);
      next.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
      return next;
    });
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (trimmed.length < 3) throw new Error("Add a title (3+ characters).");
      const ends = new Date(startDate.getTime() + duration * 60_000);
      await updateMyEvent(eventId, {
        title: trimmed,
        description: description.trim() || null,
        bannerUrl: bannerUrl.trim() || null,
        startsAt: startDate.toISOString(),
        endsAt: ends.toISOString(),
        location: isVirtual ? null : location.trim() || null,
        isVirtual,
        eventUrl: eventUrl.trim() || null,
      });
    },
    onSuccess: () => {
      hapticMedium();
      qc.invalidateQueries({ queryKey: ["events"] }).catch(() => {});
      navigateBack(router, "/events");
    },
    onError: (e: unknown) => {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      await deleteMyEvent(eventId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] }).catch(() => {});
      navigateBack(router, "/events");
    },
    onError: (e: unknown) => {
      Alert.alert("Couldn't delete", e instanceof Error ? e.message : "Try again.");
    },
  });

  const confirmDelete = () => {
    Alert.alert("Delete event?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => del.mutate() },
    ]);
  };

  const startLabel = useMemo(() => {
    return startDate.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [startDate]);

  const notOwner = !!query.data && !!userId && query.data.host_user_id !== userId;
  const missing = !query.isLoading && !query.data;

  if (query.isLoading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppBackground variant="social" />
        <SafeAreaView edges={["top"]} style={styles.centerSafe}>
          <ActivityIndicator color={Colors.goldBright} />
        </SafeAreaView>
      </View>
    );
  }

  if (notOwner || missing) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppBackground variant="social" />
        <SafeAreaView edges={["top"]} style={styles.centerSafe}>
          <Text style={styles.gateTitle}>{missing ? "Event not found" : "Not your event"}</Text>
          <Text style={styles.gateBody}>
            {missing ? "It may have been deleted." : "Only the creator can edit this event."}
          </Text>
          <Pressable
            onPress={() => navigateBack(router, "/events")}
            style={styles.gateBtn}
            testID="event-edit-back"
          >
            <Text style={styles.gateBtnText}>Back to events</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.nav}>
          <Pressable
            onPress={() => navigateBack(router, "/events")}
            style={styles.iconBtn}
            testID="event-edit-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>EDIT EVENT</Text>
            </View>
            <Text style={styles.title}>Update</Text>
          </View>
          <Pressable
            onPress={() => save.mutate()}
            disabled={save.isPending}
            style={[styles.publishBtn, save.isPending && { opacity: 0.6 }]}
            testID="event-edit-save"
          >
            <LinearGradient colors={[Colors.goldBright, Colors.mint]} style={styles.publishGrad}>
              <Check color={Colors.ink} size={14} strokeWidth={2.8} />
              <Text style={styles.publishText}>{save.isPending ? "Saving…" : "Save"}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Launch party, AMA, listening room…"
                placeholderTextColor={Colors.muted2}
                style={styles.input}
                testID="event-edit-title"
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What's the vibe? Who should show up?"
                placeholderTextColor={Colors.muted2}
                style={[styles.input, styles.inputMulti]}
                multiline
                testID="event-edit-desc"
              />

              <Text style={styles.label}>Banner URL</Text>
              <View style={styles.inputRow}>
                <ImagePlus color={Colors.muted} size={15} strokeWidth={2.4} />
                <TextInput
                  value={bannerUrl}
                  onChangeText={setBannerUrl}
                  placeholder="https://…"
                  placeholderTextColor={Colors.muted2}
                  style={styles.inputInline}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="event-edit-banner"
                />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>When</Text>
                  <Text style={styles.cardSub}>{startLabel}</Text>
                </View>
                <Clock color={Colors.goldBright} size={18} strokeWidth={2.6} />
              </View>

              <Text style={[styles.label, { marginTop: 10 }]}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
                {dayOptions.map((d) => {
                  const active =
                    d.getFullYear() === startDate.getFullYear() &&
                    d.getMonth() === startDate.getMonth() &&
                    d.getDate() === startDate.getDate();
                  const week = d.toLocaleString(undefined, { weekday: "short" }).toUpperCase();
                  return (
                    <Pressable
                      key={d.toISOString()}
                      onPress={() => {
                        hapticSelect();
                        setDay(d);
                      }}
                      style={[styles.dayPill, active && styles.dayPillActive]}
                      testID={`event-edit-day-${d.getDate()}`}
                    >
                      <Text style={[styles.dayPillWeek, active && styles.dayPillTextActive]}>{week}</Text>
                      <Text style={[styles.dayPillNum, active && styles.dayPillTextActive]}>{pad(d.getDate())}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Hour · 24-hour</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourRow}>
                {HOUR_OPTIONS.map((h) => {
                  const active = startDate.getHours() === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => {
                        hapticSelect();
                        setHM(h, startDate.getMinutes());
                      }}
                      style={[styles.hourPill, active && styles.hourPillActive]}
                      testID={`event-edit-hour-${h}`}
                    >
                      <Text style={[styles.hourPillText, active && styles.dayPillTextActive]}>
                        {pad(h)}:00
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Minutes</Text>
              <View style={styles.minRow}>
                {MIN_OPTIONS.map((m) => {
                  const active = startDate.getMinutes() === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setHM(startDate.getHours(), m)}
                      style={[styles.minPill, active && styles.minPillActive]}
                      testID={`event-edit-min-${m}`}
                    >
                      <Text style={[styles.minPillText, active && styles.dayPillTextActive]}>:{pad(m)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Duration (minutes)</Text>
              <View style={styles.minRow}>
                {[30, 60, 90, 120, 180, 240].map((d) => {
                  const active = duration === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDuration(d)}
                      style={[styles.minPill, active && styles.minPillActive]}
                      testID={`event-edit-dur-${d}`}
                    >
                      <Text style={[styles.minPillText, active && styles.dayPillTextActive]}>{d}m</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Location</Text>
                  <Text style={styles.cardSub}>
                    {isVirtual ? "Virtual / online room" : "In-person venue"}
                  </Text>
                </View>
                <Switch
                  value={isVirtual}
                  onValueChange={setIsVirtual}
                  trackColor={{ true: Colors.goldBright, false: "rgba(255,255,255,0.18)" }}
                  thumbColor={Colors.text}
                  testID="event-edit-virtual"
                />
              </View>

              {!isVirtual ? (
                <View style={[styles.inputRow, { marginTop: 10 }]}>
                  <MapPin color={Colors.muted} size={15} strokeWidth={2.4} />
                  <TextInput
                    value={location}
                    onChangeText={setLocation}
                    placeholder="City, venue, or address"
                    placeholderTextColor={Colors.muted2}
                    style={styles.inputInline}
                    testID="event-edit-location"
                  />
                </View>
              ) : null}

              <View style={[styles.inputRow, { marginTop: 10 }]}>
                {isVirtual ? (
                  <Globe2 color={Colors.muted} size={15} strokeWidth={2.4} />
                ) : (
                  <Link2 color={Colors.muted} size={15} strokeWidth={2.4} />
                )}
                <TextInput
                  value={eventUrl}
                  onChangeText={setEventUrl}
                  placeholder={isVirtual ? "Stream / Space URL" : "Optional event page URL"}
                  placeholderTextColor={Colors.muted2}
                  style={styles.inputInline}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="event-edit-url"
                />
              </View>
            </View>

            <Pressable
              onPress={confirmDelete}
              disabled={del.isPending}
              style={[styles.deleteBtn, del.isPending && { opacity: 0.6 }]}
              testID="event-edit-delete"
            >
              <Trash2 color="#ff5d6c" size={15} strokeWidth={2.7} />
              <Text style={styles.deleteText}>{del.isPending ? "Deleting…" : "Delete event"}</Text>
            </Pressable>

            <View style={{ height: 60 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  centerSafe: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  gateTitle: { color: Colors.text, fontSize: 20, fontWeight: "900" },
  gateBody: { color: Colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center" },
  gateBtn: {
    marginTop: 14, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  gateBtnText: { color: Colors.text, fontWeight: "900" },
  nav: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  publishBtn: { borderRadius: 14, overflow: "hidden" },
  publishGrad: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  publishText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },
  scroll: { paddingHorizontal: 14, paddingBottom: 40, gap: 12 },
  card: {
    borderRadius: 22,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 8,
  },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 },
  cardSub: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 4 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  label: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.1, marginTop: 4 },
  input: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  inputMulti: { minHeight: 84, textAlignVertical: "top" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  inputInline: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "700", paddingVertical: 4 },
  dayRow: { gap: 8, paddingVertical: 6 },
  dayPill: {
    width: 54, paddingVertical: 8, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  dayPillActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  dayPillWeek: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  dayPillNum: { color: Colors.text, fontSize: 16, fontWeight: "900", marginTop: 2 },
  dayPillTextActive: { color: Colors.ink },
  hourRow: { gap: 6, paddingVertical: 4 },
  hourPill: {
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  hourPillActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  hourPillText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  minRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  minPill: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  minPillActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  minPillText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 16,
    backgroundColor: "rgba(255,93,108,0.10)", borderWidth: 1, borderColor: "rgba(255,93,108,0.36)",
  },
  deleteText: { color: "#ff5d6c", fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
});
