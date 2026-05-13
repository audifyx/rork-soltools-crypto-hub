import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, Check, Sparkles } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { getMyInterests, listInterestTopics, setMyInterests, type InterestTopicRow } from "@/lib/api/platform";
import { hapticSelect } from "@/lib/haptics";
import { useAuth } from "@/providers/auth-provider";

export default function InterestQuizScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const topicsQuery = useQuery<InterestTopicRow[]>({
    queryKey: ["interest-topics"],
    queryFn: listInterestTopics,
    staleTime: 5 * 60_000,
  });

  const mineQuery = useQuery<string[]>({
    queryKey: ["interests", userId ?? "guest"],
    enabled: !!userId,
    queryFn: () => (userId ? getMyInterests(userId) : Promise.resolve([])),
  });

  useEffect(() => {
    if (mineQuery.data) setSelected(new Set(mineQuery.data));
  }, [mineQuery.data]);

  const grouped = useMemo<{ category: string; items: InterestTopicRow[] }[]>(() => {
    const map = new Map<string, InterestTopicRow[]>();
    for (const t of topicsQuery.data ?? []) {
      const cat = t.category ?? "Other";
      const list = map.get(cat) ?? [];
      list.push(t);
      map.set(cat, list);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }, [topicsQuery.data]);

  const toggle = (slug: string) => {
    hapticSelect();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to save interests.");
      await setMyInterests(userId, Array.from(selected));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["interests"] });
      await queryClient.invalidateQueries({ queryKey: ["fyp"] });
      router.back();
    },
    onError: (e: unknown) => {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Try again.");
    },
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="quiz-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>TUNE YOUR FEED</Text>
            </View>
            <Text style={styles.title}>Pick your interests</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.hint}>
            Tap topics you love. We use these to surface stories, reels, communities and people.
          </Text>
          {grouped.map((g) => (
            <View key={g.category} style={styles.section}>
              <Text style={styles.sectionTitle}>{g.category.toUpperCase()}</Text>
              <View style={styles.chipsWrap}>
                {g.items.map((t) => {
                  const active = selected.has(t.slug);
                  return (
                    <Pressable
                      key={t.slug}
                      onPress={() => toggle(t.slug)}
                      style={[styles.chip, active && styles.chipActive]}
                      testID={`interest-${t.slug}`}
                    >
                      {t.emoji ? <Text style={styles.chipEmoji}>{t.emoji}</Text> : null}
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                      {active ? <Check color={Colors.ink} size={12} strokeWidth={3} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {topicsQuery.isLoading ? <ActivityIndicator color={Colors.goldBright} style={{ marginTop: 30 }} /> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.countText}>
            {selected.size} selected{selected.size < 3 ? " · pick at least 3" : ""}
          </Text>
          <Pressable
            onPress={() => save.mutate()}
            disabled={save.isPending || selected.size < 3}
            style={[styles.saveBtn, (save.isPending || selected.size < 3) && styles.saveBtnDisabled]}
            testID="quiz-save"
          >
            <LinearGradient colors={[Colors.goldBright, Colors.mint]} style={styles.saveGrad}>
              {save.isPending ? (
                <ActivityIndicator color={Colors.ink} />
              ) : (
                <Text style={styles.saveText}>Save & personalize</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  header: { flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.8, marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 30 },
  hint: { color: Colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 18, marginBottom: 18 },
  section: { marginBottom: 22 },
  sectionTitle: { color: Colors.muted2, fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: 10 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  chipActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  chipEmoji: { fontSize: 14 },
  chipText: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  chipTextActive: { color: Colors.ink },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", gap: 10 },
  countText: { color: Colors.muted, fontSize: 12, fontWeight: "800", textAlign: "center" },
  saveBtn: { borderRadius: 16, overflow: "hidden" },
  saveBtnDisabled: { opacity: 0.5 },
  saveGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  saveText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
});
