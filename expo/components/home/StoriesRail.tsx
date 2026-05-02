import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Plus, Sparkles } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { useApp } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";
import { useStories, type StoryGroup } from "@/providers/stories-provider";

interface StoriesRailProps {
  onCompose?: () => void;
  onOpenUser?: (handle: string) => void;
}

const STORY_GRADIENTS: [string, string][] = [
  [Colors.mint, Colors.cyan],
  [Colors.rose, Colors.orange],
  [Colors.violet, Colors.cyan],
  [Colors.orange, Colors.rose],
  [Colors.cyan, Colors.violet],
  [Colors.mint, Colors.violet],
];

const SEEN_RING: [string, string] = ["rgba(255,255,255,0.18)", "rgba(255,255,255,0.18)"];

function gradientFor(seed: string, seen: boolean): [string, string] {
  if (seen) return SEEN_RING;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return STORY_GRADIENTS[Math.abs(h) % STORY_GRADIENTS.length];
}

/**
 * Horizontal stories rail at the top of the home feed: tap your circle to
 * post (or view your active story), then real story groups from other users.
 */
export default function StoriesRail({ onOpenUser }: StoriesRailProps) {
  const router = useRouter();
  const { profile } = useApp();
  const { isAuthenticated } = useAuth();
  const { myGroup, otherGroups, isLoading } = useStories();

  const items = useMemo(() => otherGroups.slice(0, 24), [otherGroups]);

  const goCreate = () => {
    Haptics.selectionAsync().catch(() => {});
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }
    router.push("/story/create");
  };

  const openMine = () => {
    Haptics.selectionAsync().catch(() => {});
    if (!myGroup) {
      goCreate();
      return;
    }
    router.push({ pathname: "/story/[id]", params: { id: myGroup.userId } });
  };

  const openGroup = (g: StoryGroup) => {
    Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/story/[id]", params: { id: g.userId } });
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID="stories-rail"
    >
      {/* Your story tile */}
      <Pressable
        onPress={openMine}
        onLongPress={goCreate}
        style={styles.tile}
        testID="story-add"
      >
        <LinearGradient
          colors={myGroup ? gradientFor(myGroup.userId, false) : [Colors.mint, Colors.cyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ring}
        >
          <View style={styles.inner}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
                <Text style={styles.avatarText}>
                  {(profile.displayName || "Y").slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <Pressable
              onPress={goCreate}
              style={styles.plus}
              hitSlop={6}
              testID="story-add-btn"
            >
              <Plus color={Colors.ink} size={10} strokeWidth={4} />
            </Pressable>
          </View>
        </LinearGradient>
        <Text style={styles.label} numberOfLines={1}>
          {myGroup ? "Your story" : "Add story"}
        </Text>
      </Pressable>

      {/* Other users' stories */}
      {items.map((g) => {
        const seen = !g.hasUnseen;
        const grad = gradientFor(g.userId, seen);
        const initial = (g.displayName ?? g.username ?? "?").slice(0, 1).toUpperCase();
        return (
          <Pressable
            key={g.userId}
            onPress={() => openGroup(g)}
            onLongPress={() => g.username && onOpenUser?.(g.username)}
            style={styles.tile}
            testID={`story-${g.userId}`}
          >
            <LinearGradient
              colors={grad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <View style={styles.inner}>
                {g.avatarUrl ? (
                  <Image source={{ uri: g.avatarUrl }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <LinearGradient
                    colors={grad === SEEN_RING ? [Colors.cardSoft, Colors.card] : grad}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarText}>{initial}</Text>
                  </LinearGradient>
                )}
                {g.stories.length > 1 ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{g.stories.length}</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>
            <Text style={[styles.label, seen && { color: Colors.muted }]} numberOfLines={1}>
              {g.displayName ?? g.username ?? "user"}
            </Text>
          </Pressable>
        );
      })}

      {items.length === 0 && !isLoading ? (
        <View style={[styles.tile, styles.emptyTile]} testID="story-empty">
          <View style={[styles.ring, styles.soonRing]}>
            <View style={[styles.inner, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
              <Sparkles color={Colors.muted} size={20} strokeWidth={2.4} />
            </View>
          </View>
          <Text style={[styles.label, { color: Colors.muted }]}>No stories yet</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const SIZE = 64;

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  tile: {
    width: SIZE + 8,
    alignItems: "center",
    gap: 6,
  },
  emptyTile: { opacity: 0.7 },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    padding: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  soonRing: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed",
  },
  inner: {
    width: "100%",
    height: "100%",
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: Colors.ink,
  },
  avatar: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.ink,
    fontSize: 22,
    fontWeight: "900",
  },
  plus: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.mint,
    borderWidth: 2.5,
    borderColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: Colors.rose,
    borderWidth: 2,
    borderColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: "900",
  },
  label: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "700",
    maxWidth: SIZE + 8,
    textAlign: "center",
  },
});
