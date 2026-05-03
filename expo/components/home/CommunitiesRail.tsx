import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { BadgeCheck, Flame, Plus, Users } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { useSocial } from "@/providers/social-provider";

function fmtCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function CommunitiesRail() {
  const router = useRouter();
  const { trendingCommunities, joinedCommunities, isJoined, toggleJoin } = useSocial();

  const featured = trendingCommunities.slice(0, 6);

  return (
    <View style={styles.wrap} testID="communities-rail">
      <View style={styles.header}>
        <View style={styles.headLeft}>
          <View style={styles.iconBox}>
            <Users color={Colors.mint} size={14} strokeWidth={2.6} />
          </View>
          <Text style={styles.title}>Communities</Text>
          {joinedCommunities.length > 0 ? (
            <View style={styles.joinedPill}>
              <Text style={styles.joinedPillText}>{joinedCommunities.length} joined</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            router.push("/communities");
          }}
          hitSlop={8}
          testID="communities-see-all"
        >
          <Text style={styles.see}>See all</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            router.push("/communities");
          }}
          style={styles.discoverCard}
          testID="discover-communities"
        >
          <LinearGradient
            colors={["rgba(244,198,91,0.16)", "rgba(221,227,236,0.06)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.discoverInner}
          >
            <View style={styles.discoverIcon}>
              <Plus color={Colors.mint} size={20} strokeWidth={2.8} />
            </View>
            <Text style={styles.discoverTitle}>Discover{"\n"}tribes</Text>
            <Text style={styles.discoverSub}>Browse all</Text>
          </LinearGradient>
        </Pressable>

        {featured.map((c) => {
          const joined = isJoined(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push({ pathname: "/community/[id]", params: { id: c.id } });
              }}
              style={[styles.card, { shadowColor: c.accent[0] }]}
              testID={`community-rail-${c.id}`}
            >
              <LinearGradient
                colors={[`${c.accent[0]}38`, `${c.accent[1]}10`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardInner}
              >
                {c.bannerUrl ? (
                  <Image source={{ uri: c.bannerUrl }} style={styles.bannerImage} contentFit="cover" />
                ) : null}
                <View style={styles.bannerShade} pointerEvents="none" />
                <View style={styles.cardTop}>
                  <View
                    style={[styles.avatar, { backgroundColor: `${c.accent[0]}26` }]}
                  >
                    {c.avatarUrl ? (
                      <Image source={{ uri: c.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <Text style={styles.avatarEmoji}>{c.iconEmoji}</Text>
                    )}
                  </View>
                  <View style={styles.topRight}>
                    {c.verified ? (
                      <BadgeCheck color={Colors.cyan} size={13} strokeWidth={2.8} />
                    ) : null}
                    {c.trending ? (
                      <View style={styles.hotBadge}>
                        <Flame color={Colors.orange} size={9} strokeWidth={3} />
                      </View>
                    ) : null}
                  </View>
                </View>

                <Text style={styles.cardName} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {c.description}
                </Text>

                <View style={styles.foot}>
                  <View style={styles.stat}>
                    <Users color={Colors.muted} size={10} strokeWidth={2.8} />
                    <Text style={styles.statText}>{fmtCount(c.members)}</Text>
                  </View>
                  <View style={styles.stat}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.statText}>{fmtCount(c.online)}</Text>
                  </View>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      toggleJoin(c.id);
                    }}
                    style={[
                      styles.joinBtn,
                      joined
                        ? styles.joinBtnOn
                        : { backgroundColor: c.accent[0] },
                    ]}
                    hitSlop={6}
                    testID={`rail-join-${c.id}`}
                  >
                    <Text
                      style={[
                        styles.joinText,
                        { color: joined ? Colors.text : Colors.ink },
                      ]}
                    >
                      {joined ? "JOINED" : "JOIN"}
                    </Text>
                  </Pressable>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 },
  header: {
    paddingHorizontal: 18,
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
    backgroundColor: "rgba(244,198,91,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  joinedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(216,183,90,0.10)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.28)",
  },
  joinedPillText: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  see: { color: Colors.mint, fontSize: 12, fontWeight: "800" },

  row: { paddingHorizontal: 14, gap: 10 },

  discoverCard: {
    width: 130,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.24)",
    backgroundColor: Colors.card,
  },
  discoverInner: { padding: 14, minHeight: 168, justifyContent: "space-between" },
  discoverIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(244,198,91,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  discoverTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  discoverSub: { color: Colors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },

  card: {
    width: 220,
    borderRadius: 22,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.18)",
    backgroundColor: "rgba(10,8,4,0.86)",
  },
  cardInner: { padding: 14, minHeight: 168 },
  bannerImage: { ...StyleSheet.absoluteFillObject, opacity: 0.78 },
  bannerShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,3,1,0.48)",
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarEmoji: { fontSize: 22 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  hotBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(244,198,91,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 12,
    letterSpacing: -0.2,
  },
  cardDesc: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    marginTop: 4,
  },
  foot: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  statText: { color: Colors.text, fontSize: 10, fontWeight: "800" },
  onlineDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: Colors.mint },
  joinBtn: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  joinBtnOn: {
    backgroundColor: "rgba(221,227,236,0.08)",
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.18)",
  },
  joinText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
});
