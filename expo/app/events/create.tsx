import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  CalendarPlus,
  Clock,
  Globe2,
  ImagePlus,
  Link2,
  MapPin,
  Sparkles,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
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
import { adminCreateEvent } from "@/lib/api/platform";
import { hapticMedium, hapticSelect } from "@/lib/haptics";
import { navigateBack } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function defaultStart(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  return d;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);
const MIN_OPTIONS = [0, 15, 30, 45];

export default function CreateEventScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();

  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [eventUrl, setEventUrl] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [isVirtual, setIsVirtual] = useState<boolean>(true);

  const [startDate, setStartDate] = useState<Date>(defaultStart());
  const [duration, setDuration] = useState<number>(60); // minutes

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

  const create = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated) throw new Error("Sign in to create events.");
      const trimmed = title.trim();
      if (trimmed.length < 3) throw new Error("Add a title (3+ characters).");
      const ends = new Date(startDate.getTime() + duration * 60_000);
      const id = await adminCreateEvent({
        title: trimmed,
        description: description.trim() || null,
        bannerUrl: bannerUrl.trim() || null,
        startsAt: startDate.toISOString(),
        endsAt: ends.toISOString(),
        location: isVirtual ? null : location.trim() || null,
        isVirtual,
        eventUrl: eventUrl.trim() || null,
      });
      return id;
    },
    onSuccess: () => {
      hapticMedium();
      qc.invalidateQueries({ queryKey: ["events"] }).catch(() => {});
      navigateBack(router, "/events");
    },
    onError: (e: unknown) => {
      Alert.alert("Couldn't create event", e instanceof Error ? e.message : "Try again.");
    },
  });

  const startLabel = useMemo(() => {
    return startDate.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [startDate]);

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
            testID="event-create-back"
          >
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>NEW EVENT</Text>
            </View>
            <Text style={styles.title}>Schedule</Text>
          </View>
          <Pressable
            onPress={() => create.mutate()}
            disabled={create.isPending}
            style={[styles.publishBtn, create.isPending && { opacity: 0.6 }]}
            testID="event-create-publish"
          >
            <LinearGradient colors={[Colors.goldBright, Colors.mint]} style={styles.publishGrad}>
              <CalendarPlus color={Colors.ink} size={14} strokeWidth={2.8} />
              <Text style={styles.publishText}>{create.isPending ? "Posting…" : "Post"}</Text>
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
                testID="event-input-title"
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What's the vibe? Who should show up?"
                placeholderTextColor={Colors.muted2}
                style={[styles.input, styles.inputMulti]}
                multiline
                testID="event-input-desc"
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
                  testID="event-input-banner"
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

              <Text style={[styles.label, { marginTop: 10 }]}>Day · 7-day &amp; beyond</Text>
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
                      testID={`event-day-${d.getDate()}`}
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
                      testID={`event-hour-${h}`}
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
                      testID={`event-min-${m}`}
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
                      testID={`event-dur-${d}`}
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
                  testID="event-virtual-toggle"
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
                    testID="event-input-location"
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
                  testID="event-input-url"
                />
              </View>
            </View>

            <View style={{ height: 80 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
});
