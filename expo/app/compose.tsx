import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { Hash, Send, Sparkles, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
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

const MAX_CHARS = 280;

export default function ComposeScreen() {
  const router = useRouter();
  const { addPost, isPosting, profile } = useApp();
  const [text, setText] = useState<string>("");
  const [ticker, setTicker] = useState<string>("");

  const onPost = useCallback(async () => {
    const t = text.trim();
    if (!t) return;
    try {
      await addPost({
        text: t,
        ticker: ticker.trim() ? ticker.trim().replace("$", "").toUpperCase() : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      console.log("[compose] post failed", e);
      Alert.alert("Failed", "Couldn't post right now.");
    }
  }, [text, ticker, addPost, router]);

  const remaining = MAX_CHARS - text.length;
  const canPost = text.trim().length > 0 && remaining >= 0 && !isPosting;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10}>
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
        >
          <View style={styles.body}>
            <View style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: profile.avatarColor }]}>
                <Text style={styles.avatarText}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.handleCol}>
                <Text style={styles.name}>{profile.displayName}</Text>
                <Text style={styles.handle}>{profile.handle}</Text>
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
          </View>

          <View style={styles.footer}>
            <Text style={[styles.counter, remaining < 0 && { color: Colors.rose }]}>
              {remaining}
            </Text>
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

  body: { flex: 1, padding: 18, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { color: Colors.ink, fontSize: 16, fontWeight: "900" },
  handleCol: {},
  name: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  handle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },

  textInput: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 24,
    minHeight: 140,
    textAlignVertical: "top",
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

  footer: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    alignItems: "flex-end",
  },
  counter: { color: Colors.muted, fontSize: 12, fontWeight: "800" },
});
