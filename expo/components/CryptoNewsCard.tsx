import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  Bookmark,
  Flame,
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react-native";
import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { fmtNum } from "@/utils/format";
import type { CryptoNewsItem, NewsCategory, NewsSentiment } from "@/lib/api/crypto-news";

interface CryptoNewsCardProps {
  item: CryptoNewsItem;
  saved?: boolean;
  onToggleSave?: (item: CryptoNewsItem) => void;
  onShare?: (item: CryptoNewsItem) => void;
  onPress?: (item: CryptoNewsItem) => void;
}

const CATEGORY_META: Record<Exclude<NewsCategory, "all">, { label: string; color: string; Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }> }> = {
  trending: { label: "TRENDING", color: Colors.mint, Icon: Flame },
  meme: { label: "MEME", color: Colors.orange, Icon: Sparkles },
  viral: { label: "VIRAL", color: Colors.cyan, Icon: TrendingUp },
  kol: { label: "KOL", color: Colors.violet, Icon: Users },
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function CryptoNewsCardImpl({ item, saved, onToggleSave, onShare, onPress }: CryptoNewsCardProps) {
  const meta = CATEGORY_META[(item.category === "all" ? "trending" : item.category) as Exclude<NewsCategory, "all">];
  const sentiment: NewsSentiment | null = item.sentiment ?? null;
  const sentimentColor =
    sentiment === "bullish" ? Colors.mint : sentiment === "bearish" ? Colors.rose : Colors.muted;

  const handleSave = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onToggleSave?.(item);
  }, [onToggleSave, item]);

  const handleShare = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onShare?.(item);
  }, [onShare, item]);

  const handlePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onPress?.(item);
  }, [onPress, item]);

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.card, pressed && styles.pressed]} testID={`news-${item.id}`}>
      <LinearGradient
        colors={["rgba(244,198,91,0.10)", "rgba(0,0,0,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {item.image_url ? (
        <View style={styles.imageWrap}>
          <ExpoImage source={{ uri: item.image_url }} style={styles.image} contentFit="cover" transition={180} />
          <LinearGradient
            colors={["rgba(2,2,2,0)", "rgba(2,2,2,0.8)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.imageBadgeRow}>
            <View style={[styles.catBadge, { borderColor: `${meta.color}66`, backgroundColor: `${meta.color}1F` }]}>
              <meta.Icon color={meta.color} size={11} strokeWidth={3} />
              <Text style={[styles.catBadgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {sentiment ? (
              <View style={[styles.sentimentPill, { borderColor: `${sentimentColor}66`, backgroundColor: `${sentimentColor}1F` }]}>
                {sentiment === "bullish" ? (
                  <TrendingUp color={sentimentColor} size={11} strokeWidth={3} />
                ) : sentiment === "bearish" ? (
                  <TrendingDown color={sentimentColor} size={11} strokeWidth={3} />
                ) : null}
                <Text style={[styles.sentimentText, { color: sentimentColor }]}>
                  {sentiment.toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.imageBadgeRowFlat}>
          <View style={[styles.catBadge, { borderColor: `${meta.color}66`, backgroundColor: `${meta.color}1F` }]}>
            <meta.Icon color={meta.color} size={11} strokeWidth={3} />
            <Text style={[styles.catBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {sentiment ? (
            <View style={[styles.sentimentPill, { borderColor: `${sentimentColor}66`, backgroundColor: `${sentimentColor}1F` }]}>
              <Text style={[styles.sentimentText, { color: sentimentColor }]}>{sentiment.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.sourceRow}>
          <Text style={styles.source} numberOfLines={1}>{item.source}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.time}>{relTime(item.published_at)}</Text>
        </View>

        <Text style={styles.title} numberOfLines={3}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={3}>{item.description}</Text>
        ) : null}

        {item.coin_mentions.length > 0 ? (
          <View style={styles.mentionsRow}>
            {item.coin_mentions.slice(0, 5).map((m) => (
              <View key={m} style={styles.mention}>
                <Text style={styles.mentionText}>${m.replace("$", "").toUpperCase()}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footerRow}>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Heart color={Colors.muted} size={13} strokeWidth={2.4} />
              <Text style={styles.metricText}>{fmtNum(item.engagement.likes)}</Text>
            </View>
            <View style={styles.metric}>
              <MessageCircle color={Colors.muted} size={13} strokeWidth={2.4} />
              <Text style={styles.metricText}>{fmtNum(item.engagement.comments)}</Text>
            </View>
            <View style={styles.metric}>
              <Repeat2 color={Colors.muted} size={13} strokeWidth={2.4} />
              <Text style={styles.metricText}>{fmtNum(item.engagement.shares)}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable onPress={handleShare} hitSlop={10} style={styles.iconBtn} testID={`news-share-${item.id}`}>
              <Share2 color={Colors.muted} size={15} strokeWidth={2.4} />
            </Pressable>
            <Pressable onPress={handleSave} hitSlop={10} style={styles.iconBtn} testID={`news-save-${item.id}`}>
              <Bookmark
                color={saved ? Colors.mint : Colors.muted}
                fill={saved ? Colors.mint : "transparent"}
                size={15}
                strokeWidth={2.4}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const CryptoNewsCard = memo(CryptoNewsCardImpl);
export default CryptoNewsCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: "rgba(16,16,14,0.84)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.18)",
    overflow: "hidden",
  },
  pressed: { opacity: 0.92 },
  imageWrap: { width: "100%", height: 180, backgroundColor: Colors.cardSoft },
  image: { width: "100%", height: "100%" },
  imageBadgeRow: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    gap: 8,
  },
  imageBadgeRowFlat: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  catBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  catBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  sentimentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  sentimentText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  body: { padding: 14, gap: 8 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  source: { color: Colors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 0.5, maxWidth: 180 },
  dot: { color: Colors.muted2, fontSize: 11, fontWeight: "900" },
  time: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  title: { color: Colors.text, fontSize: 17, lineHeight: 22, fontWeight: "900", letterSpacing: -0.3 },
  desc: { color: Colors.muted, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  mentionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  mention: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(216,183,90,0.12)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.28)",
  },
  mentionText: { color: Colors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  metricsRow: { flexDirection: "row", gap: 14 },
  metric: { flexDirection: "row", alignItems: "center", gap: 5 },
  metricText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 6 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
});
