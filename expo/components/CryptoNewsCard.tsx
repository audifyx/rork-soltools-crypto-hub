import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import {
  BadgeCheck,
  Bookmark,
  Flame,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Share,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react-native";
import React, { memo, useCallback, useMemo } from "react";
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

const CATEGORY_META: Record<
  Exclude<NewsCategory, "all">,
  {
    label: string;
    color: string;
    Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  }
> = {
  trending: { label: "Trending", color: Colors.mint, Icon: Flame },
  meme: { label: "Meme", color: Colors.orange, Icon: Sparkles },
  viral: { label: "Viral", color: Colors.cyan, Icon: TrendingUp },
  kol: { label: "KOL", color: Colors.violet, Icon: Users },
};

const AVATAR_PALETTE = [
  ["#D8B75A", "#8C6F2F"],
  ["#F4C65B", "#A77A37"],
  ["#DDE3EC", "#6E7686"],
  ["#AEB6C3", "#4C5360"],
  ["#E2C98B", "#8C6F2F"],
];

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function handleFromSource(source: string): string {
  return `@${source.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) || "wire"}`;
}

function avatarFor(source: string): { initial: string; colors: [string, string] } {
  const initial = (source?.[0] ?? "C").toUpperCase();
  let h = 0;
  for (let i = 0; i < source.length; i += 1) h = (h * 31 + source.charCodeAt(i)) >>> 0;
  const palette = AVATAR_PALETTE[h % AVATAR_PALETTE.length] as [string, string];
  return { initial, colors: palette };
}

function CryptoNewsCardImpl({ item, saved, onToggleSave, onShare, onPress }: CryptoNewsCardProps) {
  const meta = CATEGORY_META[(item.category === "all" ? "trending" : item.category) as Exclude<NewsCategory, "all">];
  const sentiment: NewsSentiment | null = item.sentiment ?? null;
  const sentimentColor =
    sentiment === "bullish" ? Colors.mint : sentiment === "bearish" ? Colors.rose : Colors.muted;

  const avatar = useMemo(() => avatarFor(item.source ?? "Wire"), [item.source]);
  const handle = useMemo(() => handleFromSource(item.source ?? "wire"), [item.source]);

  const tweetText = useMemo(() => {
    const title = item.title?.trim() ?? "";
    const desc = item.description?.trim();
    if (!desc) return title;
    if (title.length > 140) return title;
    return `${title}\n\n${desc}`;
  }, [item.title, item.description]);

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
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`news-${item.id}`}
    >
      <View style={styles.headerRow}>
        <View style={[styles.avatar, { backgroundColor: avatar.colors[0] }]}>
          <View style={[styles.avatarRing, { borderColor: avatar.colors[1] }]} />
          <Text style={styles.avatarInitial}>{avatar.initial}</Text>
        </View>

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>
              {item.source}
            </Text>
            <BadgeCheck color={Colors.mint} size={14} strokeWidth={2.6} fill="rgba(216,183,90,0.18)" />
            <Text style={styles.dot}>·</Text>
            <Text style={styles.time}>{relTime(item.published_at)}</Text>
          </View>
          <View style={styles.handleRow}>
            <Text style={styles.handle} numberOfLines={1}>
              {handle}
            </Text>
            <View style={[styles.catChip, { borderColor: `${meta.color}55`, backgroundColor: `${meta.color}1A` }]}>
              <meta.Icon color={meta.color} size={10} strokeWidth={3} />
              <Text style={[styles.catChipText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {sentiment ? (
              <View style={[styles.sentChip, { borderColor: `${sentimentColor}55`, backgroundColor: `${sentimentColor}1A` }]}>
                {sentiment === "bullish" ? (
                  <TrendingUp color={sentimentColor} size={10} strokeWidth={3} />
                ) : sentiment === "bearish" ? (
                  <TrendingDown color={sentimentColor} size={10} strokeWidth={3} />
                ) : null}
                <Text style={[styles.sentChipText, { color: sentimentColor }]}>
                  {sentiment === "bullish" ? "Bull" : sentiment === "bearish" ? "Bear" : "Mixed"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable hitSlop={10} style={styles.moreBtn} testID={`news-more-${item.id}`}>
          <MoreHorizontal color={Colors.muted2} size={16} strokeWidth={2.4} />
        </Pressable>
      </View>

      <Text style={styles.tweetBody}>{tweetText}</Text>

      {item.coin_mentions.length > 0 ? (
        <View style={styles.cashRow}>
          {item.coin_mentions.slice(0, 6).map((m) => (
            <Text key={m} style={styles.cashTag}>
              ${m.replace("$", "").toUpperCase()}
            </Text>
          ))}
        </View>
      ) : null}

      {item.image_url ? (
        <View style={styles.imageWrap}>
          <ExpoImage
            source={{ uri: item.image_url }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <ActionButton
          Icon={MessageCircle}
          label={fmtNum(item.engagement.comments)}
          color={Colors.muted}
          testID={`news-reply-${item.id}`}
        />
        <ActionButton
          Icon={Repeat2}
          label={fmtNum(item.engagement.shares)}
          color={Colors.muted}
          testID={`news-repost-${item.id}`}
        />
        <ActionButton
          Icon={Heart}
          label={fmtNum(item.engagement.likes)}
          color={Colors.muted}
          testID={`news-like-${item.id}`}
        />
        <ActionButton
          Icon={Bookmark}
          color={saved ? Colors.mint : Colors.muted}
          filled={saved}
          onPress={handleSave}
          testID={`news-save-${item.id}`}
        />
        <ActionButton
          Icon={Share}
          color={Colors.muted}
          onPress={handleShare}
          testID={`news-share-${item.id}`}
        />
      </View>
    </Pressable>
  );
}

interface ActionButtonProps {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number; fill?: string }>;
  label?: string;
  color: string;
  filled?: boolean;
  onPress?: () => void;
  testID?: string;
}

function ActionButton({ Icon, label, color, filled, onPress, testID }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.65 }]}
      testID={testID}
    >
      <Icon color={color} size={15} strokeWidth={2.2} fill={filled ? color : "transparent"} />
      {label ? <Text style={[styles.actionLabel, { color }]}>{label}</Text> : null}
    </Pressable>
  );
}

const CryptoNewsCard = memo(CryptoNewsCardImpl);
export default CryptoNewsCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: "rgba(12,12,10,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 10,
  },
  pressed: { opacity: 0.94 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1.5,
    opacity: 0.5,
  },
  avatarInitial: { color: "#0B0B08", fontSize: 16, fontWeight: "900" },
  identity: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  displayName: { color: Colors.text, fontSize: 14.5, fontWeight: "900", letterSpacing: -0.2, maxWidth: 180 },
  dot: { color: Colors.muted2, fontSize: 12, fontWeight: "900", marginHorizontal: 1 },
  time: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  handle: { color: Colors.muted2, fontSize: 12, fontWeight: "700" },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  catChipText: { fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5 },
  sentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  sentChipText: { fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5 },
  moreBtn: { padding: 4 },
  tweetBody: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    letterSpacing: -0.1,
    paddingHorizontal: 2,
  },
  cashRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 2 },
  cashTag: { color: Colors.mint, fontSize: 13, fontWeight: "800" },
  imageWrap: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  image: { width: "100%", height: "100%" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingRight: 6,
  },
  actionLabel: { fontSize: 12, fontWeight: "700" },
});
