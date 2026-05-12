import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Flame, Trophy } from "lucide-react-native";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { getStreak } from "@/lib/api/platform";

interface Props {
  userId: string | null;
}

export default function StreakCard({ userId }: Props) {
  const query = useQuery({
    queryKey: ["streak", userId ?? "guest"],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: () => (userId ? getStreak(userId) : Promise.resolve(null)),
  });

  const current = query.data?.current_streak ?? 0;
  const longest = query.data?.longest_streak ?? 0;
  const totalDays = query.data?.total_active_days ?? 0;

  const milestones = useMemo<number[]>(() => [3, 7, 14, 30, 60, 100], []);
  const nextMilestone = milestones.find((m) => m > current) ?? Math.max(current + 1, 7);
  const progressPct = Math.min(100, Math.round((current / nextMilestone) * 100));

  return (
    <View style={styles.wrap} testID="streak-card">
      <LinearGradient
        colors={["rgba(255,140,40,0.16)", "rgba(63,169,255,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <Flame color="#FF8C28" size={20} strokeWidth={2.6} fill="#FF8C28" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DAILY STREAK</Text>
          <Text style={styles.value}>
            {current} day{current === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={styles.bestPill}>
          <Trophy color={Colors.goldBright} size={11} strokeWidth={2.6} />
          <Text style={styles.bestText}>Best {longest}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>
      <View style={styles.row}>
        <Text style={styles.subtle}>
          {current >= nextMilestone
            ? "You smashed it. Keep going!"
            : `${Math.max(0, nextMilestone - current)} day${nextMilestone - current === 1 ? "" : "s"} to ${nextMilestone}-day milestone`}
        </Text>
        <Text style={styles.subtleStrong}>{totalDays} total</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 22,
    padding: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,140,40,0.28)",
    backgroundColor: Colors.card,
    gap: 10,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,140,40,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,140,40,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { color: "#FF8C28", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  value: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.7 },
  bestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(63,169,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.34)",
  },
  bestText: { color: Colors.goldBright, fontSize: 11, fontWeight: "900" },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.10)", overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: "#FF8C28" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  subtle: { color: Colors.muted, fontSize: 11, fontWeight: "700", flex: 1 },
  subtleStrong: { color: Colors.text, fontSize: 11, fontWeight: "900" },
});
