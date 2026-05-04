import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, Clapperboard, Hash, Play, Send, Sparkles, UploadCloud, X } from "lucide-react-native";
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

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { createReel } from "@/lib/api/reels";
import { navigateBack } from "@/lib/navigation";
import { uploadReelMedia } from "@/lib/upload";
import { useAuth } from "@/providers/auth-provider";

type PickedVideo = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
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
  const { userId, isAuthenticated } = useAuth();
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [caption, setCaption] = useState<string>("");
  const [ticker, setTicker] = useState<string>("");
  const [tokenAddress, setTokenAddress] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const remaining = MAX_CAPTION - caption.length;
  const normalizedTicker = ticker.trim().replace(/^\$/, "").toUpperCase();
  const canPublish = !!video && !isUploading && remaining >= 0;

  const pickVideo = useCallback(async () => {
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
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        quality: 0.82,
        videoMaxDuration: 180,
      });

      if (result.canceled || !result.assets[0]?.uri) return;
      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        durationMs: asset.duration ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
      });
    } catch (e) {
      console.log("[upload-reel] pick failed", e);
      Alert.alert("Video failed", "Could not open that video. Try another clip.");
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
    if (!video || isUploading) return;

    setIsUploading(true);
    try {
      const videoUrl = await uploadReelMedia(userId, video.uri, video.fileName, video.mimeType);
      await createReel({
        userId,
        videoUrl,
        caption,
        ticker: normalizedTicker || null,
        tokenAddress: tokenAddress.trim() || null,
        durationMs: video.durationMs ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/(tabs)/reels");
    } catch (e) {
      console.log("[upload-reel] publish failed", e);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not publish this reel right now.");
    } finally {
      setIsUploading(false);
    }
  }, [caption, isAuthenticated, isUploading, normalizedTicker, router, tokenAddress, userId, video]);

  const meta = useMemo<string>(() => {
    if (!video) return "MP4, MOV, or camera-roll video up to 3 minutes.";
    const dims = video.width && video.height ? ` · ${video.width}×${video.height}` : "";
    return `${formatDuration(video.durationMs)}${dims}`;
  }, [video]);

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
            <Pressable onPress={pickVideo} style={styles.videoDrop} testID="pick-reel-video">
              <LinearGradient
                colors={video ? ["rgba(244,198,91,0.22)", "rgba(221,227,236,0.10)"] : ["rgba(255,255,255,0.055)", "rgba(244,198,91,0.08)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.videoGrad}
              >
                <View style={styles.videoIconWrap}>
                  {video ? <Play color={Colors.ink} size={28} strokeWidth={3} fill={Colors.ink} /> : <UploadCloud color={Colors.ink} size={28} strokeWidth={2.8} />}
                </View>
                <Text style={styles.videoTitle}>{video ? "Video selected" : "Choose a reel video"}</Text>
                <Text style={styles.videoSub}>{meta}</Text>
                {video ? (
                  <Pressable onPress={() => setVideo(null)} style={styles.removeVideo} testID="remove-reel-video">
                    <X color={Colors.text} size={13} strokeWidth={2.7} />
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : null}
              </LinearGradient>
            </Pressable>

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
});
