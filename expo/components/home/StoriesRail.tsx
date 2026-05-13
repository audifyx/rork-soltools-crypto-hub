import { useQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Plus, Sparkles } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { listActiveStories, type StoryRow } from "@/lib/api/platform";
import { hapticSelect } from "@/lib/haptics";
import { useAuth } from "@/providers/auth-provider";

interface AuthorBucket {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: string;
  verified: boolean;
  stories: StoryRow[];
  hasUnseen: boolean;
}

function bucketize(rows: StoryRow[]): AuthorBucket[] {
  const map = new Map<string, AuthorBucket>();
  for (const r of rows) {
    const existing = map.get(r.user_id);
    if (existing) {
      existing.stories.push(r);
      continue;
    }
    map.set(r.user_id, {
      userId: r.user_id,
      username: r.username ?? r.user_id.slice(0, 6),
      displayName: r.display_name ?? r.username ?? "User",
      avatarUrl: r.avatar_url ?? null,
      avatarColor: r.avatar_color ?? Colors.mint,
      verified: !!r.verified,
      stories: [r],
      hasUnseen: true,
    });
  }
  return Array.from(map.values());
}

export default function StoriesRail() {
  const router = useRouter();
  const { userId } = useAuth();

  const query = useQuery<StoryRow[]>({
    queryKey: ["stories", "active"],
    queryFn: () => listActiveStories(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const buckets = useMemo<AuthorBucket[]>(() => bucketize(query.data ?? []), [query.data]);

  const onOpen = (bucket: AuthorBucket) => {
    hapticSelect();
    const first = bucket.stories[0];
    if (!first) return;
    router.push({
      pathname: "/story/[id]",
      params: { id: first.id, userId: bucket.userId },
    });
  };

  const onCreate = () => {
    hapticSelect();
    router.push("/story/create");
  };

  return (
    <View style={styles.wrap} testID="stories-rail">
      <View style={styles.head}>
        <Sparkles color={Colors.goldBright} size={13} strokeWidth={2.6} />
        <Text style={styles.title}>STORIES</Text>
        {buckets.length > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{buckets.length}</Text>
          </View>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {userId ? (
          <Pressable onPress={onCreate} style={styles.bubble} testID="story-create">
            <View style={styles.addRing}>
              <View style={styles.addInner}>
                <Plus color={Colors.text} size={22} strokeWidth={2.8} />
              </View>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              Your story
            </Text>
          </Pressable>
        ) : null}
        {buckets.map((b) => (
          <Pressable key={b.userId} onPress={() => onOpen(b)} style={styles.bubble} testID={`story-${b.userId}`}>
            <LinearGradient
              colors={b.hasUnseen ? [Colors.goldBright, Colors.mint, Colors.violet] : ["#33384a", "#22273a"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <View style={styles.avatarOuter}>
                <View style={[styles.avatar, { backgroundColor: b.avatarColor }]}>
                  {b.avatarUrl ? (
                    <ExpoImage source={{ uri: b.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarInit}>{b.displayName.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
              </View>
            </LinearGradient>
            <Text style={styles.name} numberOfLines={1}>
              {b.displayName}
            </Text>
          </Pressable>
        ))}
        {buckets.length === 0 && !userId ? (
          <Text style={styles.empty}>No stories yet — be the first to post one.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const SIZE = 64;
const styles = StyleSheet.create({
  wrap: { paddingTop: 8, paddingBottom: 4 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  title: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  countPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "rgba(63,169,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: Colors.mint, fontSize: 10, fontWeight: "900" },
  row: { paddingHorizontal: 14, gap: 12, paddingVertical: 4 },
  bubble: { width: 72, alignItems: "center" },
  ring: {
    width: SIZE + 6,
    height: SIZE + 6,
    borderRadius: (SIZE + 6) / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOuter: {
    width: SIZE + 2,
    height: SIZE + 2,
    borderRadius: (SIZE + 2) / 2,
    backgroundColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInit: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  name: { color: Colors.text, fontSize: 11, fontWeight: "700", marginTop: 6, maxWidth: 70 },
  addRing: {
    width: SIZE + 6,
    height: SIZE + 6,
    borderRadius: (SIZE + 6) / 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addInner: {
    width: SIZE - 4,
    height: SIZE - 4,
    borderRadius: (SIZE - 4) / 2,
    backgroundColor: "rgba(63,169,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { color: Colors.muted, fontSize: 12, fontWeight: "700", paddingHorizontal: 8, alignSelf: "center" },
});
