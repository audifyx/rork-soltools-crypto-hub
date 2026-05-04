import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BadgeCheck, Eye, Heart, MessageCircle, Play, Send, Share2 } from "lucide-react-native";
import React, { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import TokenAvatar from "@/components/TokenAvatar";
import Colors from "@/constants/colors";
import type { Reel } from "@/lib/api/reels";

interface ReelCardProps {
  reel: Reel;
  active: boolean;
  height: number;
  onLike: (reel: Reel) => void;
  onComment: (reel: Reel) => void;
  onShare: (reel: Reel) => void;
  onOpenAuthor: (reel: Reel) => void;
  onOpenToken: (reel: Reel) => void;
}

function escapeAttr(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  if (!str || typeof str.replace !== "function") return "";
  try {
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  } catch (e) {
    console.log("[reels] escapeAttr failed", e);
    return "";
  }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(diff / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function buildVideoHtml(url: string | null | undefined, active: boolean): string {
  const safeUrl = escapeAttr(url);
  if (!safeUrl) {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#000}</style></head><body></body></html>`;
  }
  const auto = active ? "autoplay" : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:cover;background:#000}</style></head><body><video ${auto} loop muted playsinline webkit-playsinline preload="metadata" src="${safeUrl}"></video><script>const v=document.querySelector('video');${active ? "v&&v.play().catch(()=>{});" : "v&&v.pause();"}</script></body></html>`;
}

function ReelCardBase({
  reel,
  active,
  height,
  onLike,
  onComment,
  onShare,
  onOpenAuthor,
  onOpenToken,
}: ReelCardProps) {
  const heartScale = useRef<Animated.Value>(new Animated.Value(0)).current;
  const isImage = reel.mediaType === "image";
  const mediaUrl: string | null = typeof reel.videoUrl === "string" && reel.videoUrl.length > 0 ? reel.videoUrl : null;
  const html = useMemo<string>(() => buildVideoHtml(mediaUrl, active), [active, mediaUrl]);
  const displayName: string = (reel.author?.displayName ?? "").trim();
  const initial = (displayName.slice(0, 1) || "S").toUpperCase();
  const ticker = typeof reel.ticker === "string" && reel.ticker.length > 0 ? reel.ticker.replace(/\$/g, "").toUpperCase() : null;

  useEffect(() => {
    if (!reel.likedByViewer) return;
    heartScale.setValue(0.6);
    Animated.spring(heartScale, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [heartScale, reel.likedByViewer]);

  const onDoubleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onLike(reel);
  };

  return (
    <View style={[styles.card, { height }]} testID={`reel-card-${reel.id}`}>
      {isImage ? (
        mediaUrl ? (
          <Image
            source={{ uri: mediaUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            testID="reel-image"
          />
        ) : null
      ) : (
        <>
          {reel.thumbnailUrl ? (
            <Image source={{ uri: reel.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={active ? 0 : 2} />
          ) : null}
          <WebView
            key={`${reel.id}-${active ? "active" : "idle"}`}
            originWhitelist={["*"]}
            source={{ html, baseUrl: "https://soltools.app" }}
            style={StyleSheet.absoluteFill}
            containerStyle={StyleSheet.absoluteFill}
            scrollEnabled={false}
            bounces={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            pointerEvents="none"
            testID="reel-video"
          />
        </>
      )}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.58)", "rgba(0,0,0,0.08)", "rgba(0,0,0,0.84)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Pressable onPress={onDoubleTap} style={styles.tapLayer} testID="reel-like-surface">
        {!active && !isImage ? (
          <View style={styles.pausedBadge}>
            <Play color={Colors.ink} size={20} strokeWidth={3} fill={Colors.ink} />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.topMeta} pointerEvents="none">
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{isImage ? "PHOTO" : "REELS"}</Text>
        </View>
        <View style={styles.viewPill}>
          <Eye color={Colors.text} size={12} strokeWidth={2.6} />
          <Text style={styles.viewText}>{formatCount(reel.viewsCount)}</Text>
        </View>
      </View>

      <View style={styles.sideRail}>
        <Pressable onPress={() => onOpenAuthor(reel)} style={styles.avatarButton} testID="reel-author">
          {reel.author.avatarUrl ? (
            <Image source={{ uri: reel.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: reel.author.avatarColor }]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </Pressable>
        <RailButton
          active={reel.likedByViewer}
          label={formatCount(reel.likesCount)}
          onPress={() => onLike(reel)}
          icon={<Heart color={reel.likedByViewer ? Colors.ink : Colors.text} size={24} strokeWidth={2.6} fill={reel.likedByViewer ? Colors.ink : "none"} />}
          testID="reel-like"
        />
        <RailButton
          label={formatCount(reel.commentsCount)}
          onPress={() => onComment(reel)}
          icon={<MessageCircle color={Colors.text} size={24} strokeWidth={2.5} />}
          testID="reel-comments"
        />
        <RailButton
          label={formatCount(reel.sharesCount)}
          onPress={() => onShare(reel)}
          icon={<Share2 color={Colors.text} size={23} strokeWidth={2.5} />}
          testID="reel-share"
        />
      </View>

      <View style={styles.captionWrap}>
        <Pressable onPress={() => onOpenAuthor(reel)} style={styles.authorRow} testID="reel-author-row">
          <Text style={styles.authorName} numberOfLines={1}>{reel.author.displayName}</Text>
          {reel.author.verified ? <BadgeCheck color={Colors.goldBright} size={14} strokeWidth={2.8} /> : null}
          <Text style={styles.authorHandle} numberOfLines={1}>{reel.author.handle}</Text>
          <Text style={styles.age}>· {timeAgo(reel.createdAt)}</Text>
        </Pressable>
        {reel.caption ? <Text style={styles.caption} numberOfLines={3}>{reel.caption}</Text> : null}
        {ticker ? (
          <Pressable onPress={() => onOpenToken(reel)} style={styles.tokenPill} testID="reel-token">
            <TokenAvatar ticker={ticker} uri={reel.thumbnailUrl} size={24} radius={10} textSize={8} />
            <View style={styles.tokenCopy}>
              <Text style={styles.tokenText}>${ticker}</Text>
              <Text style={styles.tokenSub}>{reel.tokenAddress ? "Open token intelligence" : "Tagged alpha"}</Text>
            </View>
            <Send color={Colors.goldBright} size={13} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </View>

      <Animated.View pointerEvents="none" style={[styles.heartBurst, { opacity: heartScale, transform: [{ scale: heartScale }] }]}>
        <Heart color={Colors.goldBright} size={86} strokeWidth={2.5} fill={Colors.goldBright} />
      </Animated.View>
    </View>
  );
}

function RailButton({
  icon,
  label,
  active,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.railButton, active && styles.railButtonActive]} testID={testID}>
      {icon}
      <Text style={[styles.railLabel, active && { color: Colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export default memo(ReelCardBase);

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: Colors.ink,
    overflow: "hidden",
  },
  tapLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  pausedBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(244,198,91,0.90)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.goldBright,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  topMeta: {
    position: "absolute",
    top: Platform.OS === "ios" ? 68 : 46,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.28)",
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.goldBright },
  liveText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  viewPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.36)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  viewText: { color: Colors.text, fontSize: 10, fontWeight: "900" },
  sideRail: {
    position: "absolute",
    right: 12,
    bottom: Platform.OS === "ios" ? 128 : 116,
    alignItems: "center",
    gap: 15,
  },
  avatarButton: {
    width: 46,
    height: 46,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.goldBright,
    backgroundColor: Colors.card,
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: Colors.ink, fontSize: 18, fontWeight: "900" },
  railButton: {
    minWidth: 48,
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 6,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  railButtonActive: {
    backgroundColor: Colors.goldBright,
    borderColor: "rgba(255,248,223,0.68)",
  },
  railLabel: { color: Colors.text, fontSize: 10, fontWeight: "900", marginTop: 3 },
  captionWrap: {
    position: "absolute",
    left: 16,
    right: 76,
    bottom: Platform.OS === "ios" ? 108 : 96,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 7 },
  authorName: { color: Colors.text, fontSize: 15, fontWeight: "900", maxWidth: 150 },
  authorHandle: { color: Colors.muted, fontSize: 12, fontWeight: "800", maxWidth: 90 },
  age: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
  caption: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  tokenPill: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.46)",
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.30)",
  },
  tokenCopy: { flexShrink: 1 },
  tokenText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  tokenSub: { color: Colors.muted, fontSize: 9, fontWeight: "800", marginTop: 1 },
  heartBurst: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
  },
});
