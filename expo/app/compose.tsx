import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Stack, useRouter } from "expo-router";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Flame,
  Globe2,
  ImagePlus,
  Link2,
  Loader2,
  Play,
  Send,
  Smile,
  Sparkles,
  TrendingUp,
  Users,
  Video as VideoIcon,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import Colors from "@/constants/colors";
import AppBackground from "@/components/ui/AppBackground";
import { navigateBack } from "@/lib/navigation";
import { extractSolanaAddress } from "@/lib/token-search";
import { useTokenAutolink, type AutolinkResult } from "@/lib/use-token-autolink";
import { useTrendingTokens } from "@/lib/api/market";
import { useApp } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";

const MAX_CHARS = 280;
const MAX_IMAGES = 4;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type PickedMedia = { uri: string; kind: "image" | "video"; mimeType?: string | null; fileName?: string | null };
type Audience = "public" | "followers";

type Vibe = { id: string; label: string; emoji: string; tint: string };
const VIBES: Vibe[] = [
  { id: "bullish", label: "Bullish", emoji: "🚀", tint: Colors.mint },
  { id: "bearish", label: "Bearish", emoji: "🩸", tint: "#FF6B7A" },
  { id: "watching", label: "Watching", emoji: "👀", tint: Colors.cyan },
  { id: "aping", label: "Aping", emoji: "🦍", tint: "#F2C94C" },
  { id: "exit", label: "Taking profits", emoji: "💰", tint: Colors.neon },
];

const RING_SIZE = 30;
const RING_STROKE = 2.6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

function usePressScale() {
  const v = useRef(new Animated.Value(1)).current;
  const onPressIn = useCallback(() => {
    Animated.timing(v, { toValue: 0.94, duration: 80, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start();
  }, [v]);
  const onPressOut = useCallback(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
  }, [v]);
  return { scale: v, onPressIn, onPressOut };
}

export default function ComposeScreen() {
  const router = useRouter();
  const { addPost, isPosting, profile } = useApp();
  const { isAuthenticated } = useAuth();
  const [text, setText] = useState<string>("");
  const [ticker, setTicker] = useState<string>("");
  const [contract, setContract] = useState<string>("");
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [resolvedToken, setResolvedToken] = useState<AutolinkResult | null>(null);
  const [audience, setAudience] = useState<Audience>("public");
  const [vibeId, setVibeId] = useState<string | null>(null);

  const trendingQ = useTrendingTokens({ limit: 12 });
  const trending = trendingQ.data ?? [];

  const autolink = useTokenAutolink({
    ticker,
    contract,
    onResolve: useCallback((data, via) => {
      setResolvedToken(data);
      if (via === "ca") {
        if (!ticker.trim() && data.ticker) setTicker(data.ticker);
      } else if (via === "ticker") {
        if (!contract.trim() && data.address) setContract(data.address);
      }
    }, [ticker, contract]),
  });

  const onPasteCA = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const txt = (await Clipboard.getStringAsync()).trim();
      if (!txt) {
        Alert.alert("Clipboard empty", "Copy a Solana CA first, then tap paste.");
        return;
      }
      const addr = extractSolanaAddress(txt) ?? txt;
      setContract(addr);
    } catch (e) {
      console.log("[compose] paste CA failed", e);
    }
  }, []);

  const images = useMemo(() => media.filter((m) => m.kind === "image"), [media]);
  const video = useMemo(() => media.find((m) => m.kind === "video") ?? null, [media]);

  const onPickImages = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo library access to attach images.");
          return;
        }
      }
      const remaining = MAX_IMAGES - images.length;
      if (remaining <= 0) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
      });
      if (result.canceled) return;
      const picked: PickedMedia[] = result.assets
        .slice(0, remaining)
        .map((a) => ({ uri: a.uri, kind: "image" as const, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null }));
      setMedia((prev) => [...prev.filter((m) => m.kind !== "video"), ...prev.filter((m) => m.kind === "image"), ...picked].slice(0, MAX_IMAGES));
    } catch (e) {
      console.log("[compose] image pick failed", e);
    }
  }, [images.length]);

  const onPickVideo = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo library access to attach a video.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        quality: 0.85,
        videoMaxDuration: 180,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const a = result.assets[0];
      setMedia([{ uri: a.uri, kind: "video", mimeType: a.mimeType ?? null, fileName: a.fileName ?? null }]);
    } catch (e) {
      console.log("[compose] video pick failed", e);
    }
  }, []);

  const onRemoveMedia = useCallback((uri: string) => {
    setMedia((prev) => prev.filter((m) => m.uri !== uri));
  }, []);

  const onToggleVibe = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setVibeId((prev) => (prev === id ? null : id));
  }, []);

  const onToggleAudience = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setAudience((prev) => (prev === "public" ? "followers" : "public"));
  }, []);

  const onInsertTicker = useCallback((sym: string, addr?: string) => {
    Haptics.selectionAsync().catch(() => {});
    setTicker(sym.replace("$", "").toUpperCase());
    if (addr) setContract(addr);
  }, []);

  const onPost = useCallback(async () => {
    const t = text.trim();
    if (!isAuthenticated) {
      Alert.alert("Sign in", "Sign in to post and sync your profile activity.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign in", onPress: () => router.replace("/auth") },
      ]);
      return;
    }
    if (!t && media.length === 0) return;
    try {
      const ca = extractSolanaAddress(contract) ?? resolvedToken?.address ?? undefined;
      const sym = ticker.trim() ? ticker.trim().replace("$", "").toUpperCase() : resolvedToken?.ticker;
      const vibe = VIBES.find((v) => v.id === vibeId);
      const finalText = vibe ? `${vibe.emoji} ${t}`.trim() : t;
      await addPost({
        text: finalText,
        ticker: sym,
        contract: ca,
        token: resolvedToken && (resolvedToken.address === ca || !ca)
          ? {
              address: resolvedToken.address,
              symbol: resolvedToken.ticker || sym || null,
              name: resolvedToken.name || null,
              logoUrl: resolvedToken.logoUrl,
            }
          : ca
            ? { address: ca, symbol: sym ?? null }
            : null,
        images: images.length ? images.map((m) => m.uri) : undefined,
        video: video ? { uri: video.uri, mimeType: video.mimeType ?? null, fileName: video.fileName ?? null } : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigateBack(router, "/(tabs)/home");
    } catch (e) {
      console.log("[compose] post failed", e);
      const msg =
        e instanceof Error && e.message
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : "Couldn't post right now.";
      Alert.alert("Failed to post", msg);
    }
  }, [text, ticker, contract, resolvedToken, images, video, vibeId, media.length, addPost, router, isAuthenticated]);

  const remaining = MAX_CHARS - text.length;
  const used = Math.max(0, Math.min(MAX_CHARS, text.length));
  const ringProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ringProgress, {
      toValue: used / MAX_CHARS,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [used, ringProgress]);
  const ringDashOffset = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRC, 0],
  });
  const ringColor = remaining < 0 ? "#FF6B7A" : remaining < 30 ? "#F2C94C" : Colors.mint;

  const canPost =
    (text.trim().length > 0 || media.length > 0) && remaining >= 0 && !isPosting;
  const canPickMore = !video && images.length < MAX_IMAGES;
  const canPickVideo = images.length === 0 && !video;

  const postPress = usePressScale();
  const closePress = usePressScale();

  const selectedVibe = useMemo(() => VIBES.find((v) => v.id === vibeId) ?? null, [vibeId]);

  return (
    <View style={styles.root}>
      <AppBackground variant="feed" />
      {/* ambient gradient glow */}
      <View pointerEvents="none" style={styles.glowWrap}>
        <LinearGradient
          colors={[
            "rgba(63,169,255,0.28)",
            "rgba(98,208,255,0.10)",
            "transparent",
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.glowTop}
        />
      </View>

      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Animated.View style={{ transform: [{ scale: closePress.scale }] }}>
            <Pressable
              onPress={() => navigateBack(router, "/(tabs)/home")}
              onPressIn={closePress.onPressIn}
              onPressOut={closePress.onPressOut}
              style={styles.closeBtn}
              hitSlop={10}
              testID="compose-close"
            >
              <X color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
          </Animated.View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerKicker}>POSTING TO</Text>
            <Pressable onPress={onToggleAudience} hitSlop={10} style={styles.audiencePill} testID="compose-audience">
              {audience === "public" ? (
                <Globe2 color={Colors.cyan} size={11} strokeWidth={2.8} />
              ) : (
                <Users color={Colors.mint} size={11} strokeWidth={2.8} />
              )}
              <Text style={styles.audiencePillText}>
                {audience === "public" ? "Public feed" : "Followers only"}
              </Text>
              <ChevronDown color={Colors.muted} size={11} strokeWidth={2.8} />
            </Pressable>
          </View>

          <Animated.View style={{ transform: [{ scale: postPress.scale }] }}>
            <Pressable
              onPress={onPost}
              onPressIn={postPress.onPressIn}
              onPressOut={postPress.onPressOut}
              disabled={!canPost}
              style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
              testID="compose-post"
            >
              <LinearGradient
                colors={canPost ? [Colors.mint, Colors.cyan] : ["#1a2538", "#1a2538"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.postBtnGrad}
              >
                {isPosting ? (
                  <Loader2 color={Colors.ink} size={13} strokeWidth={3} />
                ) : (
                  <Send color={canPost ? Colors.ink : Colors.muted} size={13} strokeWidth={3} />
                )}
                <Text style={[styles.postBtnText, !canPost && { color: Colors.muted }]}>
                  {isPosting ? "Posting" : "Post"}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === "ios" ? 4 : 0}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Author card */}
            <View style={styles.authorCard}>
              <LinearGradient
                colors={["rgba(63,169,255,0.10)", "rgba(98,208,255,0.02)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.row}>
                <View style={styles.avatarWrap}>
                  <LinearGradient
                    colors={[Colors.mint, Colors.cyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarRing}
                  >
                    {profile.avatarUrl ? (
                      <ExpoImage source={{ uri: profile.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
                        <Text style={styles.avatarText}>
                          {profile.displayName.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </LinearGradient>
                </View>
                <View style={styles.handleCol}>
                  <Text style={styles.name} numberOfLines={1}>{profile.displayName}</Text>
                  <Text style={styles.handle} numberOfLines={1}>
                    {profile.handle?.startsWith("@") ? profile.handle : `@${profile.handle ?? "you"}`}
                  </Text>
                </View>
                {selectedVibe ? (
                  <View style={[styles.activeVibe, { borderColor: `${selectedVibe.tint}55`, backgroundColor: `${selectedVibe.tint}1A` }]}>
                    <Text style={styles.activeVibeEmoji}>{selectedVibe.emoji}</Text>
                    <Text style={[styles.activeVibeLabel, { color: selectedVibe.tint }]} numberOfLines={1}>
                      {selectedVibe.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="What's the alpha? Drop your conviction…"
                placeholderTextColor={Colors.muted2}
                multiline
                autoFocus
                style={styles.textInput}
                maxLength={MAX_CHARS + 50}
                testID="compose-text"
              />

              {video ? (
                <View style={[styles.imageWrap, styles.imageWrapSolo, styles.videoWrap]} testID="compose-video">
                  <View style={styles.videoBadge}>
                    <Play color={Colors.ink} size={22} strokeWidth={3} fill={Colors.ink} />
                  </View>
                  <Text style={styles.videoLabel} numberOfLines={1}>
                    {video.fileName ?? "Video selected"}
                  </Text>
                  <Pressable
                    onPress={() => onRemoveMedia(video.uri)}
                    style={styles.imageRemove}
                    hitSlop={8}
                    testID="remove-video"
                  >
                    <X color={Colors.text} size={14} strokeWidth={3} />
                  </Pressable>
                </View>
              ) : null}

              {images.length > 0 ? (
                <View style={styles.imageGrid} testID="compose-images">
                  {images.map((m) => (
                    <View key={m.uri} style={[styles.imageWrap, images.length === 1 && styles.imageWrapSolo]}>
                      <ExpoImage
                        source={{ uri: m.uri }}
                        style={styles.imageThumb}
                        contentFit="cover"
                        cachePolicy="memory"
                      />
                      <Pressable
                        onPress={() => onRemoveMedia(m.uri)}
                        style={styles.imageRemove}
                        hitSlop={8}
                        testID={`remove-image-${m.uri.slice(-6)}`}
                      >
                        <X color={Colors.text} size={14} strokeWidth={3} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Vibe chips */}
            <View style={styles.sectionLabelRow}>
              <Zap color={Colors.cyan} size={12} strokeWidth={2.8} />
              <Text style={styles.sectionLabel}>Vibe check</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {VIBES.map((v) => {
                const active = vibeId === v.id;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => onToggleVibe(v.id)}
                    style={[
                      styles.vibeChip,
                      active && { borderColor: v.tint, backgroundColor: `${v.tint}22` },
                    ]}
                    testID={`vibe-${v.id}`}
                  >
                    <Text style={styles.vibeEmoji}>{v.emoji}</Text>
                    <Text
                      style={[
                        styles.vibeLabel,
                        active && { color: v.tint },
                      ]}
                    >
                      {v.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Token tag card */}
            <View style={styles.tokenCard}>
              <View style={styles.tokenHeader}>
                <View style={styles.tokenHeaderLeft}>
                  <Sparkles color={Colors.mint} size={12} strokeWidth={2.8} />
                  <Text style={styles.tokenHeaderText}>Tag a token</Text>
                </View>
                {autolink.status !== "idle" ? (
                  <View style={styles.autolinkInline}>
                    {autolink.status === "resolving" ? (
                      <Loader2 color={Colors.cyan} size={10} strokeWidth={2.8} />
                    ) : autolink.status === "resolved" ? (
                      <CheckCircle2 color={Colors.mint} size={10} strokeWidth={2.8} />
                    ) : (
                      <Link2 color={Colors.muted2} size={10} strokeWidth={2.8} />
                    )}
                    <Text
                      style={[
                        styles.autolinkInlineText,
                        autolink.status === "resolved" && { color: Colors.mint },
                        autolink.status === "missing" && { color: Colors.muted2 },
                      ]}
                      numberOfLines={1}
                    >
                      {autolink.status === "resolving"
                        ? "Linking…"
                        : autolink.status === "resolved"
                          ? autolink.via === "ca"
                            ? `Linked ${autolink.data.ticker}`
                            : `Linked ${autolink.data.address.slice(0, 4)}…${autolink.data.address.slice(-4)}`
                          : "No live match"}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.tickerInputRow}>
                <View style={styles.dollarBadge}>
                  <Text style={styles.dollarText}>$</Text>
                </View>
                <TextInput
                  value={ticker}
                  onChangeText={(v) => setTicker(v.replace("$", "").toUpperCase())}
                  placeholder="TICKER"
                  placeholderTextColor={Colors.muted2}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.tickerInput}
                  maxLength={10}
                  testID="compose-ticker"
                />
                <View style={styles.divider} />
                <Link2 color={Colors.cyan} size={13} strokeWidth={2.6} />
                <TextInput
                  value={contract}
                  onChangeText={setContract}
                  placeholder="Paste Solana CA"
                  placeholderTextColor={Colors.muted2}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.caInput}
                  testID="compose-contract"
                />
                <Pressable onPress={onPasteCA} style={styles.pasteBtn} hitSlop={8} testID="compose-paste-ca">
                  <ClipboardPaste color={Colors.cyan} size={12} strokeWidth={2.8} />
                </Pressable>
              </View>
            </View>

            {/* Trending tickers */}
            {trending.length > 0 ? (
              <>
                <View style={styles.sectionLabelRow}>
                  <Flame color="#F2994A" size={12} strokeWidth={2.8} />
                  <Text style={styles.sectionLabel}>Trending right now</Text>
                  <View style={styles.liveDot} />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                >
                  {trending.slice(0, 12).map((t) => {
                    const sym = (t.symbol ?? "").replace("$", "").toUpperCase();
                    if (!sym) return null;
                    const active = ticker.toUpperCase() === sym;
                    const change = typeof t.priceChange24hPercent === "number" ? t.priceChange24hPercent : null;
                    const up = (change ?? 0) >= 0;
                    return (
                      <Pressable
                        key={`${t.address}-${sym}`}
                        onPress={() => onInsertTicker(sym, t.address)}
                        style={[styles.trendChip, active && styles.trendChipActive]}
                        testID={`trend-${sym}`}
                      >
                        {t.logoURI ? (
                          <ExpoImage source={{ uri: t.logoURI }} style={styles.trendLogo} contentFit="cover" />
                        ) : (
                          <View style={[styles.trendLogo, { backgroundColor: Colors.cardSoft }]} />
                        )}
                        <Text style={styles.trendSym}>${sym}</Text>
                        {change !== null ? (
                          <View style={[styles.trendDelta, up ? styles.trendDeltaUp : styles.trendDeltaDown]}>
                            <TrendingUp
                              color={up ? Colors.mint : "#FF6B7A"}
                              size={9}
                              strokeWidth={3}
                              style={!up ? { transform: [{ rotate: "180deg" }] } : undefined}
                            />
                            <Text style={[styles.trendDeltaText, { color: up ? Colors.mint : "#FF6B7A" }]}>
                              {Math.abs(change).toFixed(1)}%
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <View style={{ height: 90 }} />
          </ScrollView>

          {/* Floating bottom toolbar */}
          <View style={styles.toolbarShell}>
            <BlurView intensity={Platform.OS === "ios" ? 40 : 0} tint="dark" style={styles.toolbarBlur}>
              <View style={styles.toolbar}>
                <View style={styles.toolbarLeft}>
                  <Pressable
                    onPress={onPickImages}
                    disabled={!canPickMore}
                    style={[styles.toolBtn, !canPickMore && styles.toolBtnDisabled]}
                    hitSlop={8}
                    testID="compose-image-btn"
                  >
                    <ImagePlus color={canPickMore ? Colors.mint : Colors.muted2} size={18} strokeWidth={2.4} />
                  </Pressable>
                  <Pressable
                    onPress={onPickVideo}
                    disabled={!canPickVideo}
                    style={[styles.toolBtn, !canPickVideo && styles.toolBtnDisabled]}
                    hitSlop={8}
                    testID="compose-video-btn"
                  >
                    <VideoIcon color={canPickVideo ? Colors.cyan : Colors.muted2} size={18} strokeWidth={2.4} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setText((t) => `${t}${t.length > 0 && !t.endsWith(" ") ? " " : ""}#`);
                    }}
                    style={styles.toolBtn}
                    hitSlop={8}
                    testID="compose-hashtag-btn"
                  >
                    <Text style={styles.hashtagGlyph}>#</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setText((t) => `${t}${t.length > 0 && !t.endsWith(" ") ? " " : ""}@`);
                    }}
                    style={styles.toolBtn}
                    hitSlop={8}
                    testID="compose-mention-btn"
                  >
                    <Smile color={Colors.neon} size={18} strokeWidth={2.4} />
                  </Pressable>
                </View>

                <View style={styles.toolbarRight}>
                  <Text style={styles.toolHint} numberOfLines={1}>
                    {video ? "1 video" : images.length > 0 ? `${images.length}/${MAX_IMAGES}` : ""}
                  </Text>
                  <View style={styles.counterWrap}>
                    <Svg width={RING_SIZE} height={RING_SIZE}>
                      <Circle
                        cx={RING_SIZE / 2}
                        cy={RING_SIZE / 2}
                        r={RING_RADIUS}
                        stroke="rgba(255,255,255,0.10)"
                        strokeWidth={RING_STROKE}
                        fill="transparent"
                      />
                      <AnimatedCircle
                        cx={RING_SIZE / 2}
                        cy={RING_SIZE / 2}
                        r={RING_RADIUS}
                        stroke={ringColor}
                        strokeWidth={RING_STROKE}
                        strokeLinecap="round"
                        strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                        strokeDashoffset={ringDashOffset}
                        fill="transparent"
                        rotation={-90}
                        origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                      />
                    </Svg>
                    {remaining <= 20 ? (
                      <Text
                        style={[
                          styles.counter,
                          { color: ringColor },
                        ]}
                      >
                        {remaining}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </BlurView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  glowWrap: { ...StyleSheet.absoluteFillObject },
  glowTop: { position: "absolute", top: 0, left: -40, right: -40, height: 260 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
  },
  headerCenter: { alignItems: "center", gap: 4, flex: 1 },
  headerKicker: {
    color: Colors.muted2,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  audiencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(63,169,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.24)",
  },
  audiencePillText: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  postBtn: { borderRadius: 999, overflow: "hidden" },
  postBtnDisabled: { opacity: 0.6 },
  postBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  postBtnText: { color: Colors.ink, fontSize: 12.5, fontWeight: "900", letterSpacing: 0.3 },

  bodyContent: { paddingHorizontal: 14, paddingTop: 4, gap: 16, paddingBottom: 16 },

  authorCard: {
    borderRadius: 24,
    backgroundColor: "rgba(11,15,26,0.7)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.18)",
    padding: 16,
    gap: 12,
    overflow: "hidden",
  },

  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarWrap: {},
  avatarRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  avatarText: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  handleCol: { gap: 2, flex: 1 },
  name: { color: Colors.text, fontSize: 14.5, fontWeight: "900" },
  handle: { color: Colors.muted2, fontSize: 11.5, fontWeight: "700" },

  activeVibe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 130,
  },
  activeVibeEmoji: { fontSize: 12 },
  activeVibeLabel: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.3 },

  textInput: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 26,
    minHeight: 110,
    textAlignVertical: "top",
    padding: 0,
  },

  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  imageWrap: {
    width: "49%",
    aspectRatio: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: Colors.card,
    position: "relative",
  },
  imageWrapSolo: {
    width: "100%",
    aspectRatio: 16 / 10,
  },
  imageThumb: { width: "100%", height: "100%" },
  videoWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,215,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.30)",
    gap: 10,
    padding: 14,
  },
  videoBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.cyan,
    alignItems: "center",
    justifyContent: "center",
  },
  videoLabel: { color: Colors.text, fontSize: 12, fontWeight: "800", maxWidth: "80%" },
  imageRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(3,7,8,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    color: Colors.muted,
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F2994A",
    marginLeft: 2,
  },

  chipsRow: { gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  vibeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  vibeEmoji: { fontSize: 14 },
  vibeLabel: { color: Colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },

  trendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(11,15,26,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  trendChipActive: {
    borderColor: Colors.mint,
    backgroundColor: "rgba(63,169,255,0.18)",
  },
  trendLogo: { width: 18, height: 18, borderRadius: 9 },
  trendSym: { color: Colors.text, fontSize: 11.5, fontWeight: "900", letterSpacing: 0.3 },
  trendDelta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendDeltaUp: { backgroundColor: "rgba(63,169,255,0.16)" },
  trendDeltaDown: { backgroundColor: "rgba(255,107,122,0.16)" },
  trendDeltaText: { fontSize: 9.5, fontWeight: "900" },

  tokenCard: {
    borderRadius: 20,
    backgroundColor: "rgba(11,15,26,0.7)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.16)",
    padding: 12,
    gap: 10,
  },
  tokenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tokenHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  tokenHeaderText: {
    color: Colors.muted,
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  autolinkInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 180,
  },
  autolinkInlineText: { color: Colors.cyan, fontSize: 10, fontWeight: "800" },

  tickerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  dollarBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(63,169,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  dollarText: { color: Colors.mint, fontSize: 13, fontWeight: "900" },
  tickerInput: {
    width: 78,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
    padding: 0,
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  caInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
    padding: 0,
  },
  pasteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(98,208,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.32)",
  },

  toolbarShell: {
    position: "absolute",
    bottom: 14,
    left: 14,
    right: 14,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: Platform.OS === "android" ? "rgba(5,7,15,0.92)" : "rgba(5,7,15,0.55)",
  },
  toolbarBlur: {},
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toolbarLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolbarRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  toolBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  toolBtnDisabled: { opacity: 0.35 },
  hashtagGlyph: { color: Colors.cyan, fontSize: 18, fontWeight: "900", lineHeight: 20 },
  toolHint: { color: Colors.muted2, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  counterWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    position: "absolute",
    fontSize: 9.5,
    fontWeight: "900",
  },
});
