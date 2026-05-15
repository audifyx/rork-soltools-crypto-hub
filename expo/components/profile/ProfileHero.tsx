import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import type { UserBadge } from "@/lib/badge-system";
import GlowingBadge from "@/components/social/GlowingBadge";
import GlassCard from "@/components/ui/GlassCard";

interface Props {
  username: string;
  handle: string;
  bio?: string;
  avatar?: string;
  banner?: string;
  badges?: UserBadge[];
  followers?: number;
  following?: number;
  reputation?: number;
}

export default function ProfileHero({
  username,
  handle,
  bio,
  avatar,
  banner,
  badges = [],
  followers = 0,
  following = 0,
  reputation = 1,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.bannerWrap}>
        {banner ? (
          <Image source={{ uri: banner }} style={styles.banner} />
        ) : (
          <View style={styles.bannerFallback} />
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.avatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder} />
          )}
        </View>

        <View style={styles.identityRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.username}>{username}</Text>
            <Text style={styles.handle}>@{handle}</Text>
          </View>

          <View style={styles.levelPill}>
            <Text style={styles.levelText}>LVL {reputation}</Text>
          </View>
        </View>

        {!!bio && <Text style={styles.bio}>{bio}</Text>}

        <View style={styles.badgesWrap}>
          {badges.map((badge) => (
            <GlowingBadge
              key={badge.id}
              badge={badge}
              compact
            />
          ))}
        </View>

        <View style={styles.statsRow}>
          <GlassCard style={styles.statCard} radius={20} padding={14} borderColor="rgba(255,255,255,0.10)" gradient={["rgba(63,169,255,0.10)", "rgba(255,255,255,0.02)"]}>
            <Text style={styles.statValue}>{followers.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </GlassCard>

          <GlassCard style={styles.statCard} radius={20} padding={14} borderColor="rgba(255,255,255,0.10)" gradient={["rgba(63,169,255,0.10)", "rgba(255,255,255,0.02)"]}>
            <Text style={styles.statValue}>{following.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </GlassCard>

          <GlassCard style={styles.statCard} radius={20} padding={14} borderColor="rgba(255,255,255,0.10)" gradient={["rgba(63,169,255,0.10)", "rgba(255,255,255,0.02)"]}>
            <Text style={styles.statValue}>{reputation}</Text>
            <Text style={styles.statLabel}>Reputation</Text>
          </GlassCard>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 18,
  },
  bannerWrap: {
    height: 160,
    backgroundColor: "#111",
  },
  banner: {
    width: "100%",
    height: "100%",
  },
  bannerFallback: {
    flex: 1,
    backgroundColor: "#131A22",
  },
  content: {
    padding: 18,
    marginTop: -52,
  },
  avatarWrap: {
    width: 104,
    height: 104,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: Colors.mint,
    overflow: "hidden",
    backgroundColor: "#111",
    shadowColor: Colors.mint,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 8,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    flex: 1,
    backgroundColor: "#1A1F29",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 12,
  },
  username: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  handle: {
    color: Colors.muted,
    fontSize: 13,
    marginTop: 2,
    fontWeight: "700",
  },
  levelPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.28)",
  },
  levelText: {
    color: Colors.mint,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.6,
  },
  bio: {
    marginTop: 12,
    color: Colors.text,
    lineHeight: 20,
    fontWeight: "600",
  },
  badgesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: Colors.text,
    fontWeight: "900",
    fontSize: 20,
  },
  statLabel: {
    marginTop: 4,
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
