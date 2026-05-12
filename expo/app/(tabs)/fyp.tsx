import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  CalendarDays,
  Compass,
  Flame,
  Heart,
  MessageCircle,
  Play,
  RefreshCcw,
  Sparkles,
  Users,
} from "lucide-react-native";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { listFyp, type FypCard } from "@/lib/api/platform";
import { hapticSelect } from "@/lib/haptics";
import { useAuth } from "@/providers/auth-provider";

interface CardPayload {
  title?: string;
  body?: string;
  caption?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  ticker?: string | null;
  members_count?: number;
  starts_at?: string;
  likes?: number;
  comments?: number;
  reason?: string;
}

const KIND_LABEL: Record<FypCard["kind"], { label: string; Icon: typeof Sparkles; tint: string }> = {
  post: { label: "Post", Icon: MessageCircle, tint: Colors.mint },
  reel: { label: "Reel", Icon: Play, tint: "#FF5C8A" },
  story: { label: "Story", Icon: Flame, tint: "#FF8C28" },
  community: { label: "Community", Icon: Users, tint: Colors.violet },
  event: { label: "Event", Icon: CalendarDays, tint: Colors.goldBright },
};

export default function ForYouScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { userId, isAuthenticated } = useAuth();

  const query = useQuery<FypCard[]>({
    queryKey: ["fyp", userId ?? "guest"],
    enabled: !!userId,
    staleTime: 20_000,
    refetchInterval: 90_000,
    queryFn: () => (userId ? listFyp(userId) : Promise.resolve([])),
  });
  const cards = query.data ?? [];

  const grouped = useMemo<{ key: string; cards: FypCard[] }[]>(() => {
    if (cards.length === 0) return [];
    const top = cards.slice(0, 6);
    const rest = cards.slice(6);
    return [
      { key: "trending", cards: top },
      { key: "more", cards: rest },
    ];
  }, [cards]);

  const onRefresh = () => {
    hapticSelect().catch(() => {});
    query.refetch().catch(() => {});
  };

  const onOpen = (card: FypCard) => {
    hapticSelect().catch(() => {});
    if (card.kind === "reel") router.push("/(tabs)/reels");
    else if (card.kind === "story") router.push({ pathname: "/story/[id]", params: { id: card.ref_id } });
    else if (card.kind === "event") router.push("/events");
    else if (card.kind === "community") router.push("/communities");
    else router.push("/(tabs)/home");
    queryClient.setQueryData<FypCard[]>(["fyp", userId ?? "guest"], (prev) =>
      (prev ?? []).filter((c) => c.id !== card.id),
    );
  };

  const TAB_BAR_BLOCK = 74 + (Platform.OS === "ios" ? 22 : 14) + 12;

  return (
    <View style={styles.root} testID="fyp-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />

      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Sparkles color={Colors.goldBright} size={12} strokeWidth={2.6} />
              <Text style={styles.eyebrow}>HANDPICKED FOR YOU</Text>
            </View>
            <Text style={styles.title}>For You</Text>
          </View>
          <Pressable onPress={onRefresh} style={styles.refreshBtn} testID="fyp-refresh">
            <RefreshCcw color={Colors.text} size={15} strokeWidth={2.6} />
          </Pressable>
          <Pressable onPress={() => router.push("/interest-quiz")} style={styles.tuneBtn} testID="fyp-tune">
            <LinearGradient colors={[Colors.goldBright, Colors.mint]} style={styles.tuneGrad}>
              <Compass color={Colors.ink} size={15} strokeWidth={2.8} />
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>

      <FlatList
        data={grouped}
        keyExtractor={(g) => g.key}
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_BLOCK + insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {item.key === "trending" ? "Trending in your circle" : "More for you"}
            </Text>
            <View style={styles.cardsCol}>
              {item.cards.map((c) => (
                <FypCardView key={c.id} card={c} onPress={() => onOpen(c)} />
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            {query.isLoading ? (
              <ActivityIndicator color={Colors.goldBright} />
            ) : (
              <>
                <View style={styles.emptyIcon}>
                  <Sparkles color={Colors.goldBright} size={28} strokeWidth={2.6} />
                </View>
                <Text style={styles.emptyTitle}>
                  {isAuthenticated ? "Warming up your feed…" : "Sign in to unlock For You"}
                </Text>
                <Text style={styles.emptyBody}>
                  {isAuthenticated
                    ? "Tap people, posts and reels you love. We&apos;ll personalize this in seconds."
                    : "We tune your feed based on who you follow and what you tap."}
                </Text>
                <Pressable onPress={() => router.push("/interest-quiz")} style={styles.emptyBtn} testID="fyp-empty-tune">
                  <Compass color={Colors.ink} size={15} strokeWidth={2.7} />
                  <Text style={styles.emptyBtnText}>Pick interests</Text>
                </Pressable>
              </>
            )}
          </View>
        }
      />
    </View>
  );
}

function FypCardView({ card, onPress }: { card: FypCard; onPress: () => void }) {
  const meta = KIND_LABEL[card.kind];
  const Icon = meta.Icon;
  const payload = (card.payload ?? {}) as CardPayload;
  const cover = payload.thumbnail_url ?? payload.media_url ?? payload.avatar_url ?? null;
  const title = payload.title ?? payload.caption ?? payload.body ?? `${meta.label}`;
  const subtitle = payload.username
    ? `@${payload.username}`
    : payload.display_name ?? payload.reason ?? "Recommended";

  return (
    <Pressable onPress={onPress} style={styles.card} testID={`fyp-card-${card.id}`}>
      <View style={styles.cardMedia}>
        {cover ? (
          <ExpoImage source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[meta.tint, "rgba(0,0,0,0.4)"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.65)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.cardChip, { backgroundColor: `${meta.tint}22`, borderColor: `${meta.tint}88` }]}>
          <Icon color={meta.tint} size={11} strokeWidth={2.8} />
          <Text style={[styles.cardChipText, { color: meta.tint }]}>{meta.label.toUpperCase()}</Text>
        </View>
        {typeof payload.likes === "number" || typeof payload.comments === "number" ? (
          <View style={styles.cardMetricsRow}>
            {typeof payload.likes === "number" ? (
              <View style={styles.metric}>
                <Heart color={Colors.text} size={11} strokeWidth={2.6} />
                <Text style={styles.metricText}>{payload.likes}</Text>
              </View>
            ) : null}
            {typeof payload.comments === "number" ? (
              <View style={styles.metric}>
                <MessageCircle color={Colors.text} size={11} strokeWidth={2.6} />
                <Text style={styles.metricText}>{payload.comments}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
          {payload.reason ? ` · ${payload.reason}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  headerWrap: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(63,169,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -1.1, marginTop: 2 },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  tuneBtn: { borderRadius: 13, overflow: "hidden" },
  tuneGrad: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  list: { paddingTop: 14, paddingHorizontal: 14 },
  section: { marginBottom: 22 },
  sectionTitle: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: 10, paddingHorizontal: 4 },
  cardsCol: { gap: 12 },
  card: { borderRadius: 22, overflow: "hidden", backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  cardMedia: { height: 160 },
  cardChip: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  cardChipText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  cardMetricsRow: { position: "absolute", right: 12, top: 12, flexDirection: "row", gap: 6 },
  metric: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  metricText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  cardBody: { paddingHorizontal: 14, paddingVertical: 12 },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.3, lineHeight: 19 },
  cardSubtitle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 4 },
  empty: { alignItems: "center", paddingHorizontal: 30, paddingTop: 60, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: "rgba(63,169,255,0.14)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(63,169,255,0.32)" },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 19 },
  emptyBtn: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, backgroundColor: Colors.goldBright },
  emptyBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
