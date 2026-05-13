import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, Camera, Image as ImageIcon, Sparkles } from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { createStory } from "@/lib/api/platform";
import { hapticSelect } from "@/lib/haptics";
import { uploadPostImage } from "@/lib/upload";
import { useAuth } from "@/providers/auth-provider";

export default function CreateStoryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const [uri, setUri] = useState<string | null>(null);
  const [assetBase64, setAssetBase64] = useState<string | null>(null);
  const [caption, setCaption] = useState<string>("");

  const pick = async (camera: boolean) => {
    hapticSelect();
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow access to add a story photo.");
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      quality: 0.85,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
    };
    const result = camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.uri) return;
    setUri(asset.uri);
    setAssetBase64(asset.base64 ?? null);
  };

  const publish = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to publish a story.");
      if (!uri) throw new Error("Pick a photo first.");
      const url = await uploadPostImage(userId, uri, assetBase64);
      if (!url) throw new Error("Upload failed.");
      const id = await createStory({ mediaUrl: url, mediaType: "image", caption: caption.trim() || null });
      if (!id) throw new Error("Could not publish story.");
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stories"] });
      router.back();
    },
    onError: (e: unknown) => {
      Alert.alert("Could not publish", e instanceof Error ? e.message : "Try again.");
    },
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="story-create-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.5} />
          </Pressable>
          <Text style={styles.title}>New story</Text>
          <Pressable
            onPress={() => publish.mutate()}
            disabled={!uri || publish.isPending}
            style={[styles.publishBtn, (!uri || publish.isPending) && styles.publishBtnDisabled]}
            testID="story-publish"
          >
            <LinearGradient colors={[Colors.goldBright, Colors.mint]} style={styles.publishGrad}>
              {publish.isPending ? (
                <ActivityIndicator color={Colors.ink} />
              ) : (
                <Text style={styles.publishText}>Share</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.preview}>
          {uri ? (
            <ExpoImage source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
          ) : (
            <View style={styles.placeholder}>
              <Sparkles color={Colors.goldBright} size={28} strokeWidth={2.6} />
              <Text style={styles.placeholderTitle}>Pick a moment</Text>
              <Text style={styles.placeholderBody}>Share what is happening right now. Stories vanish in 24h.</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => pick(true)} style={styles.actionBtn} testID="story-camera">
            <Camera color={Colors.text} size={16} strokeWidth={2.6} />
            <Text style={styles.actionText}>Camera</Text>
          </Pressable>
          <Pressable onPress={() => pick(false)} style={styles.actionBtn} testID="story-gallery">
            <ImageIcon color={Colors.text} size={16} strokeWidth={2.6} />
            <Text style={styles.actionText}>Gallery</Text>
          </Pressable>
        </View>

        <View style={styles.captionWrap}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption..."
            placeholderTextColor={Colors.muted}
            style={styles.captionInput}
            maxLength={220}
            multiline
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  title: { color: Colors.text, fontSize: 17, fontWeight: "900" },
  publishBtn: { borderRadius: 14, overflow: "hidden" },
  publishBtnDisabled: { opacity: 0.5 },
  publishGrad: { paddingHorizontal: 16, paddingVertical: 9 },
  publishText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
  preview: { flex: 1, marginHorizontal: 16, borderRadius: 28, overflow: "hidden", backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 10 },
  placeholderTitle: { color: Colors.text, fontSize: 19, fontWeight: "900" },
  placeholderBody: { color: Colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  actionText: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  captionWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 },
  captionInput: { color: Colors.text, fontSize: 14, fontWeight: "700", backgroundColor: Colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
});
