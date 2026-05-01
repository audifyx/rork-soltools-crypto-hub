import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Plus, Radio, Sparkles } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { usePlatformUsers } from "@/providers/profile-provider";
import { useApp } from "@/providers/app-provider";

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

/**
 * Horizontal stories rail at the top of the home feed: "Your Live", a "Go Live"
 * call to action, then real online users from the platform with gradient rings.
 */
export default function StoriesRail({ onCompose, onOpenUser }: StoriesRailProps) {
  const { profile } = useApp();
  const onlineUsers = usePlatformUsers({ q: "", onlineOnly: true });

  const items = useMemo(
    () => (onlineUsers.data ?? []).slice(0, 12),
    [onlineUsers.data],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID="stories-rail"
    >
      <Pressable onPress={onCompose} style={styles.tile} testID="story-add">
        <LinearGradient
          colors={[Colors.mint, Colors.cyan]}
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
                  {profile.displayName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.plus}>
              <Plus color={Colors.ink} size={10} strokeWidth={4} />
            </View>
          </View>
        </LinearGradient>
        <Text style={styles.label} numberOfLines={1}>
          You
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }}
        style={styles.tile}
        testID="story-live"
      >
        <View style={[styles.ring, styles.liveRing]}>
          <View style={[styles.inner, { backgroundColor: "rgba(255,93,143,0.2)" }]}>
            <View style={styles.live}>
              <Radio color={Colors.rose} size={20} strokeWidth={2.6} />
            </View>
            <View style={styles.liveDot}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          Go live
        </Text>
      </Pressable>

      {items.map((u, i) => {
        const grad = STORY_GRADIENTS[i % STORY_GRADIENTS.length];
        const initial = (u.display_name ?? u.username ?? "?").slice(0, 1).toUpperCase();
        return (
          <Pressable
            key={u.user_id}
            onPress={() => u.username && onOpenUser?.(u.username)}
            style={styles.tile}
            testID={`story-${u.user_id}`}
          >
            <LinearGradient
              colors={grad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <View style={styles.inner}>
                {u.avatar_url ? (
                  <Image source={{ uri: u.avatar_url }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <LinearGradient
                    colors={grad}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarText}>{initial}</Text>
                  </LinearGradient>
                )}
                {u.is_online ? <View style={styles.online} /> : null}
              </View>
            </LinearGradient>
            <Text style={styles.label} numberOfLines={1}>
              {u.display_name ?? u.username ?? "user"}
            </Text>
          </Pressable>
        );
      })}

      {items.length === 0 ? (
        <View style={[styles.tile, styles.emptyTile]} testID="story-empty">
          <View style={[styles.ring, { padding: 0 }]}>
            <View style={[styles.inner, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
              <Sparkles color={Colors.muted} size={20} strokeWidth={2.4} />
            </View>
          </View>
          <Text style={[styles.label, { color: Colors.muted }]}>No live now</Text>
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
  liveRing: {
    backgroundColor: "rgba(255,93,143,0.3)",
    borderWidth: 1.5,
    borderColor: Colors.rose,
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
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.mint,
    borderWidth: 2,
    borderColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  online: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.mint,
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  live: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  liveDot: {
    position: "absolute",
    bottom: -4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: Colors.rose,
  },
  liveText: {
    color: Colors.text,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  label: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "700",
    maxWidth: SIZE + 8,
    textAlign: "center",
  },
});
