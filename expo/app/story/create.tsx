import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import {
  Camera,
  Clock,
  ImagePlus,
  Send,
  Sparkles,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useApp } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";
import { useStories } from "@/providers/stories-provider";

const MAX_CAPTION = 140;

export default function StoryCreateScreen() {
  const router = useRouter();
  const { profile } = useApp();
  const { isAuthenticated } = useAuth();
  const { postStory, isPosting } = useStories();
  const [uri, setUri] = useState<string | null>(null);
  const [caption, setCaption] = useState<string>("");

  useEffect(() => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Sign in to post a story.");
      router.replace("/auth");
    }
  }, [isAuthenticated, router]);

  const pickFromLibrary = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo library access to share a story.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 0.9,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets[0]) return;
      setUri(result.assets[0].uri);
    } catch (e) {
      console.log("[story-create] library failed", e);
    }
  }, []);

  const pickFromCamera = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    if (Platform.OS === "web") {
      Alert.alert("Camera unavailable", "Pick from your library on web.");
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow camera access to capture a story.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets[0]) return;
      setUri(result.assets[0].uri);
    } catch (e) {
      console.log("[story-create] camera failed", e);
    }
  }, []);

  const onPost = useCallback(async () => {
    if (!uri) return;
    try {
      await postStory({ uri, caption: caption.trim() || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      console.log("[story-create] post failed", e);
      const msg = e instanceof Error ? e.message : "Couldn't post story";
      Alert.alert("Story failed", msg);
    }
  }, [uri, caption, postStory, router]);

  const remaining = MAX_CAPTION - caption.length;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="story-close">
            <X color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>NEW STORY</Text>
            <View style={styles.expiryRow}>
              <Clock color={Colors.muted} size={11} strokeWidth={2.6} />
              <Text style={styles.expiryText}>Expires in 36h</Text>
            </View>
          </View>
          <Pressable
            onPress={onPost}
            disabled={!uri || isPosting}
            style={[styles.postBtn, (!uri || isPosting) && styles.postBtnDisabled]}
            testID="story-post"
          >
            <LinearGradient
              colors={uri ? [Colors.mint, Colors.cyan] : ["#1a2528", "#1a2528"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.postBtnGrad}
            >
              {isPosting ? (
                <ActivityIndicator color={Colors.ink} size="small" />
              ) : (
                <Send color={uri ? Colors.ink : Colors.muted} size={13} strokeWidth={3} />
              )}
              <Text style={[styles.postBtnText, !uri && { color: Colors.muted }]}>
                {isPosting ? "Posting" : "Share"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <View style={styles.canvas}>
            {uri ? (
              <>
                <ExpoImage source={{ uri }} style={styles.image} contentFit="cover" cachePolicy="memory" />
                <LinearGradient
                  colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
                  locations={[0, 0.4, 1]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.author}>
                  <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
                    {profile.avatarUrl ? (
                      <ExpoImage source={{ uri: profile.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                    ) : (
                      <Text style={styles.avatarText}>
                        {profile.displayName.slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.authorName} numberOfLines={1}>
                    {profile.displayName || "You"}
                  </Text>
                </View>
                <Pressable onPress={() => setUri(null)} style={styles.replaceBtn} hitSlop={6} testID="story-replace">
                  <X color={Colors.text} size={14} strokeWidth={3} />
                  <Text style={styles.replaceText}>Replace</Text>
                </Pressable>

                <View style={styles.captionWrap}>
                  <TextInput
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Add a caption…"
                    placeholderTextColor="rgba(244,255,249,0.55)"
                    style={styles.captionInput}
                    maxLength={MAX_CAPTION + 20}
                    multiline
                    testID="story-caption"
                  />
                  <Text
                    style={[
                      styles.captionCount,
                      remaining < 0 && { color: Colors.rose },
                      remaining >= 0 && remaining < 20 && { color: Colors.orange },
                    ]}
                  >
                    {remaining}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.emptyCanvas}>
                <LinearGradient
                  colors={["rgba(85,245,178,0.18)", "rgba(56,215,255,0.08)", "rgba(255,93,143,0.16)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.emptyIcon}>
                  <Sparkles color={Colors.mint} size={34} strokeWidth={2.4} />
                </View>
                <Text style={styles.emptyTitle}>Share a moment</Text>
                <Text style={styles.emptyBody}>
                  Pick a photo or capture one — your story is live for 36 hours.
                </Text>

                <View style={styles.pickRow}>
                  <Pressable onPress={pickFromCamera} style={styles.pickBtn} testID="story-camera">
                    <Camera color={Colors.ink} size={16} strokeWidth={2.8} />
                    <Text style={styles.pickText}>Camera</Text>
                  </Pressable>
                  <Pressable onPress={pickFromLibrary} style={[styles.pickBtn, styles.pickBtnAlt]} testID="story-library">
                    <ImagePlus color={Colors.text} size={16} strokeWidth={2.8} />
                    <Text style={[styles.pickText, { color: Colors.text }]}>Library</Text>
                  </Pressable>
                </View>
              </View>
            )}
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
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { alignItems: "center", gap: 4 },
  eyebrow: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  expiryText: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  postBtn: { borderRadius: 12, overflow: "hidden" },
  postBtnDisabled: { opacity: 0.55 },
  postBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 92,
    justifyContent: "center",
  },
  postBtnText: { color: Colors.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },

  canvas: {
    flex: 1,
    margin: 14,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  image: { width: "100%", height: "100%" },
  author: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 14,
    paddingLeft: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.55)",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  authorName: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  replaceBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  replaceText: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },

  captionWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    backgroundColor: "rgba(3,7,8,0.55)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  captionInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    maxHeight: 92,
    padding: 0,
  },
  captionCount: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  emptyCanvas: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.25)",
    marginBottom: 8,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
  pickRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.mint,
  },
  pickBtnAlt: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pickText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },
});
