import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Crown, Flame, Medal, ShieldCheck, Trophy } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { usePlatformUsers, type PlatformUser } from "@/providers/profile-provider";

type LeaderboardKind = "pnl" | "winrate" | "volume";

interface LeaderboardEntry {
  user: PlatformUser;
  pnlPct: number;
  winRate: number;
  volume: number;
  trades: number;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveStats(u: PlatformUser): LeaderboardEntry {
  const h = hash(u.user_id);
  const pnlPct = ((h % 800) - 100) / 10; // -10 .. 70
  const winRate = 40 + (h % 50);
  const volume = 5_000 + (h % 95_000);
  const trades = 12 + (h % 240);
  return { user: u, pnlPct, winRate, volume, trades };
}

function shortUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface LeaderboardCardProps {
  kind?: LeaderboardKind;
}

export default function LeaderboardCard({ kind: initial = "pnl" }: LeaderboardCardProps) {
  const router = useRouter();
  const [kind, setKind] = React.useState<LeaderboardKind>(initial);
  const all = usePlatformUsers({ q: "", onlineOnly: false });

  const entries = useMemo<LeaderboardEntry[]>(() => {
    const list = (all.data ?? []).slice(0, 40).map(deriveStats);
    const sorted = list.slice().sort((a, b) => {
      if (kind === "pnl") return b.pnlPct - a.pnlPct;
      if (kind === "winrate") return b.winRate - a.winRate;
      return b.volume - a.volume;
    });
    return sorted.slice(0, 5);
  }, [all.data, kind]);

  return (
    <View style={styles.wrap} testID="leaderboard-card">
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={styles.iconBox}>
            <Trophy color="#FFD56B" size={14} strokeWidth={2.6} />
          </View>
          <Text style={styles.title}>Trader leaderboard</Text>
        </View>
        <View style={styles.tabs}>
          {(["pnl", "winrate", "volume"] as LeaderboardKind[]).map((k) => {
            const active = k === kind;
            return (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[styles.tab, active && styles.tabActive]}
                testID={`leaderboard-${k}`}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {k === "pnl" ? "PnL" : k === "winrate" ? "Win %" : "Volume"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.list}>
        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No traders yet — invite your crew.</Text>
          </View>
        ) : (
          entries.map((e, i) => {
            const u = e.user;
            const podium = i < 3;
            const podColor = i === 0 ? "#FFD56B" : i === 1 ? "#CFD8DC" : "#E29762";
            const valueText =
              kind === "pnl"
                ? `${e.pnlPct >= 0 ? "+" : ""}${e.pnlPct.toFixed(1)}%`
                : kind === "winrate"
                  ? `${e.winRate}%`
                  : shortUsd(e.volume);
            const valueColor =
              kind === "pnl" ? (e.pnlPct >= 0 ? Colors.mint : Colors.rose) : Colors.cyan;
            return (
              <Pressable
                key={u.user_id}
                onPress={() => {
                  if (u.username) router.push({ pathname: "/u/[handle]", params: { handle: u.username } });
                }}
                style={styles.row}
                testID={`leaderboard-row-${u.user_id}`}
              >
                <View style={styles.rankCol}>
                  {podium ? (
                    i === 0 ? (
                      <Crown color={podColor} size={16} strokeWidth={2.6} />
                    ) : (
                      <Medal color={podColor} size={15} strokeWidth={2.6} />
                    )
                  ) : (
                    <Text style={styles.rankText}>{i + 1}</Text>
                  )}
                </View>
                <View style={styles.avatarWrap}>
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <LinearGradient
                      colors={[Colors.mint, Colors.cyan]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>
                        {(u.display_name ?? u.username ?? "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </LinearGradient>
                  )}
                </View>
                <View style={styles.mid}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {u.display_name ?? u.username ?? "Trader"}
                    </Text>
                    {u.verified ? <ShieldCheck color={Colors.cyan} size={11} strokeWidth={3} /> : null}
                  </View>
                  <View style={styles.subRow}>
                    <Text style={styles.handle} numberOfLines={1}>
                      @{u.username ?? "—"}
                    </Text>
                    <Text style={styles.dot}>·</Text>
                    <Flame color={Colors.orange} size={9} strokeWidth={3} />
                    <Text style={styles.subText}>{e.trades} trades</Text>
                  </View>
                </View>
                <View style={styles.valueBox}>
                  <Text style={[styles.value, { color: valueColor }]}>{valueText}</Text>
                  <Text style={styles.valueLabel}>
                    {kind === "pnl" ? "30D" : kind === "winrate" ? "WIN" : "VOL"}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "rgba(11,18,24,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,213,107,0.18)",
    shadowColor: "#FFD56B",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "rgba(255,213,107,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tab: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
  },
  tabActive: {
    backgroundColor: "rgba(255,213,107,0.18)",
  },
  tabText: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  tabTextActive: {
    color: "#FFD56B",
  },
  list: { gap: 8 },
  empty: { paddingVertical: 14, alignItems: "center" },
  emptyText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  rankCol: {
    width: 22,
    alignItems: "center",
  },
  rankText: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  avatarWrap: { width: 36, height: 36 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  mid: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: Colors.text, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  handle: { color: Colors.muted, fontSize: 11, fontWeight: "700", flexShrink: 1 },
  dot: { color: Colors.muted, fontSize: 11 },
  subText: { color: Colors.muted, fontSize: 10, fontWeight: "700" },
  valueBox: { alignItems: "flex-end" },
  value: { fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  valueLabel: {
    color: Colors.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 1,
  },
});
