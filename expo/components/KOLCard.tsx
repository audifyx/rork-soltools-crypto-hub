import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { BadgeCheck, TrendingDown, TrendingUp, Trophy, UserMinus, UserPlus, Users } from "lucide-react-native";
import React, { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";
import { truncateAddress, type KOLProfile } from "@/lib/api/kol";

interface KOLCardProps {
  kol: KOLProfile;
  onPress?: (kol: KOLProfile) => void;
  onToggleFollow?: (kol: KOLProfile) => void;
  busy?: boolean;
}

const PALETTE: [string, string][] = [
  ["#D8B75A", "#8C6F2F"],
  ["#F4C65B", "#A77A37"],
  ["#DDE3EC", "#6E7686"],
  ["#AEB6C3", "#4C5360"],
  ["#E2C98B", "#8C6F2F"],
];

function avatarFor(name: string): { initial: string; colors: [string, string] } {
  const initial = (name?.[0] ?? "K").toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { initial, colors: PALETTE[h % PALETTE.length] };
}

function KOLCardImpl({ kol, onPress, onToggleFollow, busy }: KOLCardProps) {
  const avatar = useMemo(() => avatarFor(kol.name ?? "KOL"), [kol.name]);
  const pnlColor = kol.total_pnl_usd >= 0 ? Colors.mint : Colors.rose;
  const pnlIcon = kol.total_pnl_usd >= 0 ? TrendingUp : TrendingDown;
  const PnlIcon = pnlIcon;

  const handlePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onPress?.(kol);
  }, [onPress, kol]);

  const handleFollow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggleFollow?.(kol);
  }, [onToggleFollow, kol]);

  const handle = kol.x_handle ? `@${kol.x_handle.replace(/^@/, "")}` : `@${kol.name.toLowerCase().replace(/\s+/g, "")}`;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`kol-card-${kol.id}`}
    >
      <View style={styles.row}>
        {kol.avatar_url ? (
          <ExpoImage source={{ uri: kol.avatar_url }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: avatar.colors[0] }]}>
            <View style={[styles.avatarRing, { borderColor: avatar.colors[1] }]} />
            <Text style={styles.avatarInitial}>{avatar.initial}</Text>
          </View>
        )}

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {kol.name}
            </Text>
            {kol.verified ? (
              <BadgeCheck color={Colors.mint} size={14} strokeWidth={2.6} fill="rgba(216,183,90,0.2)" />
            ) : null}
          </View>
          <Text style={styles.handle} numberOfLines={1}>
            {handle} · {truncateAddress(kol.wallet_address)}
          </Text>
        </View>

        <Pressable
          onPress={handleFollow}
          disabled={busy}
          style={({ pressed }) => [
            styles.followBtn,
            kol.is_followed ? styles.followBtnActive : null,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.6 },
          ]}
          testID={`kol-follow-${kol.id}`}
        >
          {kol.is_followed ? (
            <UserMinus color={Colors.ink} size={13} strokeWidth={3} />
          ) : (
            <UserPlus color={Colors.ink} size={13} strokeWidth={3} />
          )}
          <Text style={styles.followText}>{kol.is_followed ? "Following" : "Follow"}</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Stat
          Icon={Users}
          color={Colors.cyan}
          label="Followers"
          value={fmtNum(kol.follower_count)}
        />
        <Stat
          Icon={PnlIcon}
          color={pnlColor}
          label="P&L"
          value={fmtUsd(kol.total_pnl_usd)}
        />
        <Stat
          Icon={Trophy}
          color={Colors.orange}
          label="Win rate"
          value={fmtPct(kol.win_rate, 1)}
        />
      </View>
    </Pressable>
  );
}

interface StatProps {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  color: string;
  label: string;
  value: string;
}

function Stat({ Icon, color, label, value }: StatProps) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { borderColor: `${color}55`, backgroundColor: `${color}1A` }]}>
        <Icon color={color} size={11} strokeWidth={3} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, { color }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const KOLCard = memo(KOLCardImpl);
export default KOLCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: "rgba(12,12,10,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 12,
  },
  pressed: { opacity: 0.92 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1.5,
    opacity: 0.55,
  },
  avatarInitial: { color: "#0B0B08", fontSize: 18, fontWeight: "900" },
  identity: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2, maxWidth: 170 },
  handle: { color: Colors.muted2, fontSize: 12, fontWeight: "700" },
  followBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  followBtnActive: { backgroundColor: Colors.cyan },
  followText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  stat: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { color: Colors.muted2, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  statValue: { fontSize: 13, fontWeight: "900", letterSpacing: -0.2, marginTop: 1 },
});
