import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clapperboard, Hash, ImageIcon, Link2, Loader2, Play, Send, Sparkles, UploadCloud, Video as VideoIcon, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { Image as ExpoImage } from "expo-image";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { createReel, type ReelMediaType } from "@/lib/api/reels";
import { navigateBack } from "@/lib/navigation";
import { uploadReelMedia } from "@/lib/upload";
import { useTokenAutolink } from "@/lib/use-token-autolink";
import { useAuth } from "@/providers/auth-provider";

type PickedMedia = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  kind: ReelMediaType;
};

const MAX_CAPTION = 2200;

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return "Short clip";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export default function UploadReelScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState<string>("");
  const [ticker, setTicker] = useState<string>("");
  const [tokenAddress, setTokenAddress] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const remaining = MAX_CAPTION - caption.length;
  const normalizedTicker = ticker.trim().replace(/^\$/, "").toUpperCase();
  const canPublish = !!media && !isUploading && remaining >= 0;

  const autolink = useTokenAutolink({
    ticker,
    contract: tokenAddress,
    onResolve: useCallback((data, via) => {
      if (via === "ca") {
        if (!ticker.trim() && data.ticker) setTicker(data.ticker);
      } else if (via === "ticker") {
        if (!tokenAddress.trim() && data.address) setTokenAddress(data.address);
      }
    }, [ticker, tokenAddress]),
  });

  const pickMedia = useCallback(async (kind: ReelMediaType) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo library access to upload reels.");
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === "image" ? ["images"] : ["videos"],
        allowsMultipleSelection: false,
        quality: 0.82,
        videoMaxDuration: 180,
      });

      if (result.canceled || !result.assets[0]?.uri) return;
      const asset = result.assets[0];
      const inferredKind: ReelMediaType =
        asset.type === "video" || (asset.mimeType ?? "").startsWith("video/") ? "video" : "image";
      setMedia({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        durationMs: asset.duration ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        kind: inferredKind,
      });
    } catch (e) {
      console.log("[upload-reel] pick failed", e);
      Alert.alert("Media failed", "Could not open that file. Try another one.");
    }
  }, []);

  const publish = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      Alert.alert("Sign in", "Sign in to upload reels.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign in", onPress: () => router.replace("/auth") },
      ]);
      return;
    }
    if (!media || isUploading) return;

    setIsUploading(true);
    try {
      const url = await uploadReelMedia(userId, media.uri, media.fileName, media.mimeType);
      await createReel({
        userId,
        mediaType: media.kind,
        videoUrl: url,
        thumbnailUrl: media.kind === "image" ? url : null,
        caption,
        ticker: normalizedTicker || null,
        tokenAddress: tokenAddress.trim() || null,
        durationMs: media.kind === "video" ? media.durationMs ?? null : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await queryClient.invalidateQueries({ queryKey: ["reels", "feed"] });
      await queryClient.invalidateQueries({ queryKey: ["reels", "user", userId] });
      router.replace("/(tabs)/reels");
    } catch (e) {
      console.log("[upload-reel] publish failed", e);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not publish this reel right now.");
    } finally {
      setIsUploading(false);
    }
  }, [caption, isAuthenticated, isUploading, media, normalizedTicker, queryClient, router, tokenAddress, userId]);

  const meta = useMemo<string>(() => {
    if (!media) return "Photo or video — JPG, PNG, MP4, MOV up to 100MB.";
    const dims = media.width && media.height ? ` · ${media.width}×${media.height}` : "";
    if (media.kind === "image") return `Photo${dims}`;
    return `${formatDuration(media.durationMs)}${dims}`;
  }, [media]);

  return (
    <View style={styles.root} testID="upload-reel-screen">
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <StatusBar style="light" />
      <AppBackground variant="social" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => navigateBack(router, "/(tabs)/reels")} style={styles.iconBtn} testID="upload-reel-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>CREATE SHORT</Text>
            <Text style={styles.title}>Upload Reel</Text>
          </View>
          <Pressable onPress={publish} disabled={!canPublish} style={[styles.publishBtn, !canPublish && styles.publishBtnDisabled]} testID="publish-reel">
            {isUploading ? <ActivityIndicator color={Colors.ink} size="small" /> : <Send color={Colors.ink} size={15} strokeWidth={3} />}
            <Text style={styles.publishText}>{isUploading ? "Sending" : "Post"}</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.videoDrop} testID="reel-media-drop">
              <LinearGradient
                colors={media ? ["rgba(244,198,91,0.22)", "rgba(221,227,236,0.10)"] : ["rgba(255,255,255,0.055)", "rgba(244,198,91,0.08)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.videoGrad}
              >
                {media && media.kind === "image" ? (
                  <ExpoImage source={{ uri: media.uri }} style={styles.preview} contentFit="cover" />
                ) : null}
                <View style={styles.videoIconWrap}>
                  {media ? (
                    media.kind === "image" ? (
                      <ImageIcon color={Colors.ink} size={28} strokeWidth={2.8} />
                    ) : (
                      <Play color={Colors.ink} size={28} strokeWidth={3} fill={Colors.ink} />
                    )
                  ) : (
                    <UploadCloud color={Colors.ink} size={28} strokeWidth={2.8} />
                  )}
                </View>
                <Text style={styles.videoTitle}>{media ? (media.kind === "image" ? "Photo selected" : "Video selected") : "Choose photo or video"}</Text>
                <Text style={styles.videoSub}>{meta}</Text>
                <View style={styles.pickRow}>
                  <Pressable onPress={() => pickMedia("image")} style={[styles.pickBtn, media?.kind === "image" && styles.pickBtnActive]} testID="pick-reel-image">
                    <ImageIcon color={media?.kind === "image" ? Colors.ink : Colors.text} size={14} strokeWidth={2.7} />
                    <Text style={[styles.pickText, media?.kind === "image" && styles.pickTextActive]}>Photo</Text>
                  </Pressable>
                  <Pressable onPress={() => pickMedia("video")} style={[styles.pickBtn, media?.kind === "video" && styles.pickBtnActive]} testID="pick-reel-video">
                    <VideoIcon color={media?.kind === "video" ? Colors.ink : Colors.text} size={14} strokeWidth={2.7} />
                    <Text style={[styles.pickText, media?.kind === "video" && styles.pickTextActive]}>Video</Text>
                  </Pressable>
                </View>
                {media ? (
                  <Pressable onPress={() => setMedia(null)} style={styles.removeVideo} testID="remove-reel-media">
                    <X color={Colors.text} size={13} strokeWidth={2.7} />
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : null}
              </LinearGradient>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Clapperboard color={Colors.goldBright} size={16} strokeWidth={2.7} />
                <Text style={styles.cardTitle}>Caption</Text>
                <Text style={[styles.counter, remaining < 0 && { color: Colors.rose }]}>{remaining}</Text>
              </View>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Drop the alpha, chart context, or founder update…"
                placeholderTextColor={Colors.muted}
                multiline
                maxLength={MAX_CAPTION + 120}
                style={styles.captionInput}
                textAlignVertical="top"
                testID="reel-caption"
              />
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Hash color={Colors.goldBright} size={16} strokeWidth={2.7} />
                <Text style={styles.cardTitle}>Token tag</Text>
                <Text style={styles.optional}>OPTIONAL</Text>
              </View>
              <View style={styles.inputRow}>
                <Text style={styles.prefix}>$</Text>
                <TextInput
                  value={ticker}
                  onChangeText={setTicker}
                  placeholder="Ticker"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.inlineInput}
                  testID="reel-ticker"
                />
              </View>
              <TextInput
                value={tokenAddress}
                onChangeText={setTokenAddress}
                placeholder="Solana CA / mint address"
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.addressInput}
                testID="reel-token-address"
              />
              {autolink.status !== "idle" ? (
                <View style={[styles.linkPill, autolink.status === "resolved" && styles.linkPillOk]}>
                  {autolink.status === "resolving" ? (
                    <Loader2 color={Colors.cyan} size={11} strokeWidth={2.6} />
                  ) : autolink.status === "resolved" ? (
                    <CheckCircle2 color={Colors.mint} size={11} strokeWidth={2.6} />
                  ) : (
                    <Link2 color={Colors.muted} size={11} strokeWidth={2.6} />
                  )}
                  <Text style={[styles.linkPillText, autolink.status === "resolved" && { color: Colors.mint }, autolink.status === "missing" && { color: Colors.muted }]}>
                    {autolink.status === "resolving"
                      ? autolink.via === "ca"
                        ? "Resolving ticker from Solana\u2026"
                        : "Searching CA on Jupiter\u2026"
                      : autolink.status === "resolved"
                        ? autolink.via === "ca"
                          ? `Linked ${autolink.data.ticker} from chain`
                          : `Linked CA \u2022 ${autolink.data.address.slice(0, 4)}\u2026${autolink.data.address.slice(-4)}`
                        : autolink.via === "ca"
                          ? "No metadata for this CA yet"
                          : "No live match for that ticker"}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.tipCard}>
              <Sparkles color={Colors.goldBright} size={16} strokeWidth={2.8} />
              <Text style={styles.tipText}>Best reels are vertical, fast, and useful: call out the CA, risk, entry zone, and why it matters.</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.7, marginTop: 1 },
  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 15,
    backgroundColor: Colors.goldBright,
  },
  publishBtnDisabled: { opacity: 0.45 },
  publishText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  content: { padding: 16, paddingBottom: 140, gap: 14 },
  videoDrop: { borderRadius: 30, overflow: "hidden" },
  preview: { ...StyleSheet.absoluteFillObject, opacity: 0.45 },
  pickRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pickBtnActive: { backgroundColor: Colors.goldBright, borderColor: "rgba(255,248,223,0.7)" },
  pickText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  pickTextActive: { color: Colors.ink },
  videoGrad: {
    minHeight: 310,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.24)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  videoIconWrap: {
    width: 78,
    height: 78,
    borderRadius: 28,
    backgroundColor: Colors.goldBright,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  videoTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6 },
  videoSub: { color: Colors.muted, fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", marginTop: 8 },
  removeVideo: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.36)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  removeText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  card: {
    padding: 15,
    borderRadius: 24,
    backgroundColor: "rgba(10,9,7,0.88)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.16)",
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", flex: 1 },
  counter: { color: Colors.muted, fontSize: 11, fontWeight: "900" },
  optional: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  captionInput: {
    minHeight: 128,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    padding: 0,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 15,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
  },
  prefix: { color: Colors.goldBright, fontSize: 16, fontWeight: "900" },
  inlineInput: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: "800", padding: 0 },
  addressInput: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 15,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(244,198,91,0.08)",
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.16)",
  },
  tipText: { flex: 1, color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "750" },
  linkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.22)",
    alignSelf: "flex-start",
  },
  linkPillOk: {
    backgroundColor: "rgba(85,245,178,0.12)",
    borderColor: "rgba(85,245,178,0.30)",
  },
  linkPillText: { color: Colors.cyan, fontSize: 10.5, fontWeight: "900", letterSpacing: 0.2 },
});
