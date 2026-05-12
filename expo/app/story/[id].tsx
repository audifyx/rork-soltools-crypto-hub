import { useQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Eye, Heart, MessageCircle, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { listActiveStories, type StoryRow, viewStory } from "@/lib/api/platform";
import { hapticSelect } from "@/lib/haptics";

const STORY_DURATION = 5000;

export default function StoryViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; userId?: string }>();
  const startId = typeof params.id === "string" ? params.id : null;
  const userId = typeof params.userId === "string" ? params.userId : null;

  const storiesQuery = useQuery<StoryRow[]>({
    queryKey: ["stories", "viewer", userId ?? "all"],
    queryFn: async () => {
      const all = await listActiveStories();
      return userId ? all.filter((s) => s.user_id === userId) : all;
    },
    staleTime: 15_000,
  });

  const stories = useMemo<StoryRow[]>(() => storiesQuery.data ?? [], [storiesQuery.data]);
  const startIndex = useMemo<number>(() => {
    const idx = stories.findIndex((s) => s.id === startId);
    return idx >= 0 ? idx : 0;
  }, [stories, startId]);

  const [index, setIndex] = useState<number>(0);
  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex]);

  const current = stories[index];

  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!current) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) {
        if (index < stories.length - 1) setIndex(index + 1);
        else router.back();
      }
    });
    viewStory(current.id).catch(() => {});
    return () => {
      animation.stop();
    };
  }, [current, index, progress, router, stories.length]);

  const goNext = () => {
    hapticSelect().catch(() => {});
    if (index < stories.length - 1) setIndex(index + 1);
    else router.back();
  };
  const goPrev = () => {
    hapticSelect().catch(() => {});
    if (index > 0) setIndex(index - 1);
  };

  if (!current) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" />
        <Text style={styles.emptyText}>No stories</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="story-close-empty">
          <X color={Colors.text} size={18} strokeWidth={2.5} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <StatusBar style="light" />
      <ExpoImage
        source={{ uri: current.media_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={120}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.7)", "transparent", "rgba(0,0,0,0.85)"]}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.35, 1]}
      />

      <SafeAreaView edges={["top"]} style={styles.topWrap} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {stories.map((s, i) => {
            const isPast = i < index;
            const isCurrent = i === index;
            return (
              <View key={s.id} style={styles.progressSeg}>
                {isPast ? <View style={[styles.progressFill, styles.progressFillFull]} /> : null}
                {isCurrent ? (
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.avatar, { backgroundColor: current.avatar_color ?? Colors.mint }]}>
              {current.avatar_url ? (
                <ExpoImage source={{ uri: current.avatar_url }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarInit}>{(current.display_name ?? "U").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {current.display_name ?? current.username ?? "User"}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{current.username ?? "user"}
              </Text>
            </View>
          </View>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="story-close">
            <X color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
        </View>
      </SafeAreaView>

      <Pressable style={styles.leftTap} onPress={goPrev} testID="story-prev" />
      <Pressable style={styles.rightTap} onPress={goNext} testID="story-next" />

      <SafeAreaView edges={["bottom"]} style={styles.bottomWrap} pointerEvents="box-none">
        {current.caption ? (
          <Text style={styles.caption} numberOfLines={3}>
            {current.caption}
          </Text>
        ) : null}
        <View style={styles.bottomBar}>
          <View style={styles.viewerPill}>
            <Eye color={Colors.text} size={12} strokeWidth={2.6} />
            <Text style={styles.viewerText}>{current.view_count ?? 0}</Text>
          </View>
          <Pressable style={styles.iconRound} testID="story-react">
            <Heart color={Colors.rose} size={18} strokeWidth={2.5} />
          </Pressable>
          <Pressable style={styles.iconRound} testID="story-reply">
            <MessageCircle color={Colors.text} size={18} strokeWidth={2.5} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  empty: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  topWrap: { paddingHorizontal: 12, paddingTop: Platform.OS === "android" ? 6 : 0 },
  progressRow: { flexDirection: "row", gap: 4, paddingTop: 8 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#FFFFFF" },
  progressFillFull: { width: "100%" },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 12, gap: 10 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInit: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  handle: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  leftTap: { position: "absolute", left: 0, top: 100, bottom: 100, width: "30%" },
  rightTap: { position: "absolute", right: 0, top: 100, bottom: 100, width: "30%" },
  bottomWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  caption: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 6,
    marginBottom: 10,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowRadius: 8,
  },
  bottomBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 12 },
  viewerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  viewerText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  iconRound: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
});
