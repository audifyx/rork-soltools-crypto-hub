import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import {
  CheckCircle2,
  ClipboardPaste,
  Globe2,
  Hash,
  ImagePlus,
  Link2,
  Loader2,
  Play,
  Send,
  Sparkles,
  Video as VideoIcon,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
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

import Colors from "@/constants/colors";
import AppBackground from "@/components/ui/AppBackground";
import { navigateBack } from "@/lib/navigation";
import { extractSolanaAddress } from "@/lib/token-search";
import { useTokenAutolink, type AutolinkResult } from "@/lib/use-token-autolink";
import { useApp } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";

const MAX_CHARS = 280;
const MAX_IMAGES = 4;

type PickedMedia = { uri: string; kind: "image" | "video"; mimeType?: string | null; fileName?: string | null };

export default function ComposeScreen() {
  const router = useRouter();
  const { addPost, isPosting, profile } = useApp();
  const { isAuthenticated } = useAuth();
  const [text, setText] = useState<string>("");
  const [ticker, setTicker] = useState<string>("");
  const [contract, setContract] = useState<string>("");
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [resolvedToken, setResolvedToken] = useState<AutolinkResult | null>(null);

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
      await addPost({
        text: t,
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
  }, [text, ticker, contract, resolvedToken, images, video, media.length, addPost, router, isAuthenticated]);

  const remaining = MAX_CHARS - text.length;
  const canPost =
    (text.trim().length > 0 || media.length > 0) && remaining >= 0 && !isPosting;
  const canPickMore = !video && images.length < MAX_IMAGES;
  const canPickVideo = images.length === 0 && !video;

  return (
    <View style={styles.root}>
      <AppBackground variant="feed" />
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => navigateBack(router, "/(tabs)/home")} style={styles.closeBtn} hitSlop={10} testID="compose-close">
            <X color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <Text style={styles.headerTitle}>New post</Text>
          <Pressable
            onPress={onPost}
            disabled={!canPost}
            style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
            testID="compose-post"
          >
            <LinearGradient
              colors={canPost ? [Colors.mint, Colors.cyan] : ["#1a2528", "#1a2528"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.postBtnGrad}
            >
              <Send color={canPost ? Colors.ink : Colors.muted} size={13} strokeWidth={3} />
              <Text style={[styles.postBtnText, !canPost && { color: Colors.muted }]}>Post</Text>
            </LinearGradient>
          </Pressable>
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
            <View style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
                <Text style={styles.avatarText}>
                  {profile.displayName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.handleCol}>
                <Text style={styles.name}>{profile.displayName}</Text>
                <View style={styles.audienceRow}>
                  <Globe2 color={Colors.cyan} size={11} strokeWidth={2.6} />
                  <Text style={styles.audienceText}>Public</Text>
                </View>
              </View>
            </View>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="What's the alpha?"
              placeholderTextColor={Colors.muted}
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

            <View style={styles.tickerRow}>
              <Hash color={Colors.mint} size={14} strokeWidth={2.6} />
              <TextInput
                value={ticker}
                onChangeText={(v) => setTicker(v.replace("$", "").toUpperCase())}
                placeholder="Tag a token (optional)"
                placeholderTextColor={Colors.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.tickerInput}
                maxLength={10}
                testID="compose-ticker"
              />
              <Sparkles color={Colors.cyan} size={14} strokeWidth={2.6} />
            </View>

            <View style={styles.caRow}>
              <Link2 color={Colors.cyan} size={13} strokeWidth={2.6} />
              <TextInput
                value={contract}
                onChangeText={setContract}
                placeholder="Paste Solana CA / mint"
                placeholderTextColor={Colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.caInput}
                testID="compose-contract"
              />
              <Pressable onPress={onPasteCA} style={styles.pasteBtn} hitSlop={8} testID="compose-paste-ca">
                <ClipboardPaste color={Colors.cyan} size={13} strokeWidth={2.6} />
                <Text style={styles.pasteBtnText}>Paste</Text>
              </Pressable>
            </View>

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
          </ScrollView>

          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              <Pressable
                onPress={onPickImages}
                disabled={!canPickMore}
                style={[styles.toolBtn, !canPickMore && styles.toolBtnDisabled]}
                hitSlop={8}
                testID="compose-image-btn"
              >
                <ImagePlus
                  color={canPickMore ? Colors.mint : Colors.muted}
                  size={20}
                  strokeWidth={2.4}
                />
              </Pressable>
              <Pressable
                onPress={onPickVideo}
                disabled={!canPickVideo}
                style={[styles.toolBtn, !canPickVideo && styles.toolBtnDisabled]}
                hitSlop={8}
                testID="compose-video-btn"
              >
                <VideoIcon
                  color={canPickVideo ? Colors.cyan : Colors.muted}
                  size={20}
                  strokeWidth={2.4}
                />
              </Pressable>
              <Text style={styles.toolHint}>
                {video ? "1 video" : `${images.length}/${MAX_IMAGES} photos`}
              </Text>
            </View>
            <View style={styles.counterWrap}>
              <View
                style={[
                  styles.counterRing,
                  remaining < 0 && { borderColor: Colors.rose },
                  remaining >= 0 && remaining < 30 && { borderColor: Colors.orange },
                ]}
              />
              <Text
                style={[
                  styles.counter,
                  remaining < 0 && { color: Colors.rose },
                  remaining >= 0 && remaining < 30 && { color: Colors.orange },
                ]}
              >
                {remaining}
              </Text>
            </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  postBtn: { borderRadius: 12, overflow: "hidden" },
  postBtnDisabled: { opacity: 0.6 },
  postBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  postBtnText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },

  bodyContent: { padding: 18, gap: 14, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  handleCol: { gap: 4 },
  name: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  audienceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.25)",
    alignSelf: "flex-start",
  },
  audienceText: {
    color: Colors.cyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  textInput: {
    color: Colors.text,
    fontSize: 19,
    fontWeight: "500",
    lineHeight: 26,
    minHeight: 120,
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
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.card,
    position: "relative",
  },
  imageWrapSolo: {
    width: "100%",
    aspectRatio: 16 / 10,
  },
  imageThumb: {
    width: "100%",
    height: "100%",
  },
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
  videoLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
    maxWidth: "80%",
  },
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

  tickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
  },
  tickerInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
    padding: 0,
  },
  caRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.18)",
  },
  caInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
    padding: 0,
  },
  pasteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.3)",
  },
  pasteBtnText: { color: Colors.cyan, fontSize: 10.5, fontWeight: "900", letterSpacing: 0.4 },
  linkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(5,5,10,0.88)",
  },
  toolbarLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  toolBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,245,178,0.08)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.22)",
  },
  toolBtnDisabled: { opacity: 0.4 },
  toolHint: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  counterWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  counterRing: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(85,245,178,0.4)",
  },
  counter: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
});
