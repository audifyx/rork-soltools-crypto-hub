import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { CalendarDays, Eye, Heart, TrendingUp, UserPlus } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { getLatestRecap } from "@/lib/api/platform";

interface Props {
  userId: string | null;
}

export default function RecapCard({ userId }: Props) {
  const query = useQuery({
    queryKey: ["recap", userId ?? "guest"],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => (userId ? getLatestRecap(userId) : Promise.resolve(null)),
  });

  const recap = query.data;
  if (!recap) return null;

  const weekStart = new Date(recap.week_start);
  const label = weekStart.toLocaleString(undefined, { month: "short", day: "numeric" });

  const stats: { Icon: typeof Eye; label: string; value: number; tint: string }[] = [
    { Icon: Eye, label: "Views", value: recap.views_count ?? 0, tint: Colors.mint },
    { Icon: Heart, label: "Reactions", value: recap.reactions_count ?? 0, tint: "#FF5C8A" },
    { Icon: UserPlus, label: "Followers", value: recap.followers_gained ?? 0, tint: Colors.goldBright },
    { Icon: TrendingUp, label: "Posts", value: recap.posts_count ?? 0, tint: Colors.violet },
  ];

  return (
    <View style={styles.wrap} testID="recap-card">
      <LinearGradient
        colors={["rgba(63,169,255,0.18)", "rgba(91,141,239,0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <CalendarDays color={Colors.goldBright} size={18} strokeWidth={2.6} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>WEEKLY RECAP</Text>
          <Text style={styles.title}>Week of {label}</Text>
        </View>
      </View>

      {recap.highlight_text ? <Text style={styles.highlight}>{recap.highlight_text}</Text> : null}

      <View style={styles.grid}>
        {stats.map((s) => {
          const Icon = s.Icon;
          return (
            <View key={s.label} style={styles.stat}>
              <View style={[styles.statIcon, { backgroundColor: `${s.tint}22`, borderColor: `${s.tint}55` }]}>
                <Icon color={s.tint} size={13} strokeWidth={2.7} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 22, padding: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(63,169,255,0.28)", overflow: "hidden", gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(63,169,255,0.18)", borderWidth: 1, borderColor: "rgba(63,169,255,0.45)", alignItems: "center", justifyContent: "center" },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  highlight: { color: Colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  grid: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  statIcon: { width: 26, height: 26, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  statValue: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.4 },
  statLabel: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.4, marginTop: 2 },
});
