import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import {
  Globe2,
  Hash,
  ImagePlus,
  Send,
  Sparkles,
  X,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
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
import { useApp } from "@/providers/app-provider";

const MAX_CHARS = 280;
const MAX_IMAGES = 4;

export default function ComposeScreen() {
  const router = useRouter();
  const { addPost, isPosting, profile } = useApp();
  const [text, setText] = useState<string>("");
  const [ticker, setTicker] = useState<string>("");
  const [images, setImages] = useState<string[]>([]);

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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - images.length,
        quality: 0.85,
      });
      if (result.canceled) return;
      const uris = result.assets.map((a) => a.uri).slice(0, MAX_IMAGES - images.length);
      setImages((prev) => [...prev, ...uris].slice(0, MAX_IMAGES));
    } catch (e) {
      console.log("[compose] image pick failed", e);
    }
  }, [images.length]);

  const onRemoveImage = useCallback((uri: string) => {
    setImages((prev) => prev.filter((u) => u !== uri));
  }, []);

  const onPost = useCallback(async () => {
    const t = text.trim();
    if (!t && images.length === 0) return;
    try {
      await addPost({
        text: t,
        ticker: ticker.trim() ? ticker.trim().replace("$", "").toUpperCase() : undefined,
        images: images.length ? images : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      console.log("[compose] post failed", e);
      Alert.alert("Failed", "Couldn't post right now.");
    }
  }, [text, ticker, images, addPost, router]);

  const remaining = MAX_CHARS - text.length;
  const canPost =
    (text.trim().length > 0 || images.length > 0) && remaining >= 0 && !isPosting;
  const canPickMore = images.length < MAX_IMAGES;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="compose-close">
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

            {images.length > 0 ? (
              <View style={styles.imageGrid} testID="compose-images">
                {images.map((uri) => (
                  <View key={uri} style={[styles.imageWrap, images.length === 1 && styles.imageWrapSolo]}>
                    <ExpoImage
                      source={{ uri }}
                      style={styles.imageThumb}
                      contentFit="cover"
                      cachePolicy="memory"
                    />
                    <Pressable
                      onPress={() => onRemoveImage(uri)}
                      style={styles.imageRemove}
                      hitSlop={8}
                      testID={`remove-image-${uri.slice(-6)}`}
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
              />
              <Sparkles color={Colors.cyan} size={14} strokeWidth={2.6} />
            </View>
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
              <Text style={styles.toolHint}>
                {images.length}/{MAX_IMAGES} photos
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
  root: { flex: 1, backgroundColor: Colors.ink },
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

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(7,17,19,0.9)",
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
