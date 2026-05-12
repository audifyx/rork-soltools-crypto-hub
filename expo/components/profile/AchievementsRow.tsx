import { useQuery } from "@tanstack/react-query";
import { Award, Lock } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { listAchievements, type UserAchievementRow } from "@/lib/api/platform";

const RARITY_COLOR: Record<string, string> = {
  common: "#9CD7FF",
  rare: Colors.mint,
  epic: Colors.violet,
  legendary: Colors.goldBright,
};

interface Props {
  userId: string | null;
}

export default function AchievementsRow({ userId }: Props) {
  const query = useQuery<UserAchievementRow[]>({
    queryKey: ["achievements", userId ?? "guest"],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: () => listAchievements(userId),
  });

  const items = query.data ?? [];
  const earned = items.filter((a) => a.awarded_at).length;
  const sorted = [...items].sort((a, b) => {
    if (!!a.awarded_at !== !!b.awarded_at) return a.awarded_at ? -1 : 1;
    return (b.xp_reward ?? 0) - (a.xp_reward ?? 0);
  });

  return (
    <View style={styles.wrap} testID="achievements-row">
      <View style={styles.head}>
        <Award color={Colors.goldBright} size={14} strokeWidth={2.6} />
        <Text style={styles.title}>Achievements</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>
            {earned}/{items.length || 0}
          </Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {sorted.slice(0, 20).map((a) => {
          const owned = !!a.awarded_at;
          const tint = RARITY_COLOR[a.rarity ?? "common"] ?? Colors.mint;
          return (
            <Pressable key={a.slug} style={[styles.tile, owned ? { borderColor: `${tint}66` } : null]} testID={`ach-${a.slug}`}>
              <View
                style={[
                  styles.tileIcon,
                  { backgroundColor: owned ? `${tint}22` : "rgba(255,255,255,0.04)", borderColor: owned ? `${tint}55` : "rgba(255,255,255,0.10)" },
                ]}
              >
                {owned ? (
                  <Text style={styles.tileEmoji}>{a.icon ?? "🏅"}</Text>
                ) : (
                  <Lock color={Colors.muted2} size={16} strokeWidth={2.4} />
                )}
              </View>
              <Text style={[styles.tileTitle, !owned && styles.tileTitleLocked]} numberOfLines={2}>
                {a.title}
              </Text>
              {a.xp_reward ? (
                <Text style={[styles.xpText, owned && { color: tint }]}>+{a.xp_reward} XP</Text>
              ) : null}
            </Pressable>
          );
        })}
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Post, share, and engage to unlock achievements.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 22,
    paddingVertical: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  title: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, flex: 1 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(63,169,255,0.14)", borderWidth: 1, borderColor: "rgba(63,169,255,0.32)" },
  countText: { color: Colors.goldBright, fontSize: 11, fontWeight: "900" },
  row: { gap: 10, paddingHorizontal: 16 },
  tile: { width: 100, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" },
  tileIcon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  tileEmoji: { fontSize: 22 },
  tileTitle: { color: Colors.text, fontSize: 11, fontWeight: "900", lineHeight: 14 },
  tileTitleLocked: { color: Colors.muted2 },
  xpText: { color: Colors.muted, fontSize: 10, fontWeight: "800", marginTop: 4 },
  empty: { width: 240, paddingVertical: 24, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
});
