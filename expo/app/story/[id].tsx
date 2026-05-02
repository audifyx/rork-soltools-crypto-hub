import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  CheckCheck,
  ChevronLeft,
  Clock,
  Eye,
  MoreVertical,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAuth } from "@/providers/auth-provider";
import { useStories, type Story, type StoryViewer } from "@/providers/stories-provider";

const { width: SW, height: SH } = Dimensions.get("window");
const STORY_DURATION_MS = 5000;

function formatAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatExpires(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / (60 * 60 * 1000));
  if (h <= 0) {
    const m = Math.floor(diff / (60 * 1000));
    return `${m}m left`;
  }
  return `${h}h left`;
}

export default function StoryViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const userId = params.id;
  const { userId: meId } = useAuth();
  const { groups, recordView, deleteStory, isDeleting, useViewers } = useStories();

  const group = useMemo(
    () => groups.find((g) => g.userId === userId),
    [groups, userId],
  );
  const isMine = !!meId && meId === userId;

  const [index, setIndex] = useState<number>(() => {
    if (!group) return 0;
    if (isMine) return 0;
    const firstUnseen = group.stories.findIndex((s) => !s.viewedByMe);
    return firstUnseen >= 0 ? firstUnseen : 0;
  });
  const [paused, setPaused] = useState<boolean>(false);
  const [showViewers, setShowViewers] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const elapsedRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);

  const current: Story | undefined = group?.stories[index];

  // Record a view when a story comes into focus.
  useEffect(() => {
    if (!current || isMine) return;
    void recordView(current.id);
  }, [current, isMine, recordView]);

  const advance = useCallback(() => {
    if (!group) return;
    if (index + 1 < group.stories.length) {
      setIndex(index + 1);
    } else {
      router.back();
    }
  }, [group, index, router]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  // Drive progress bar.
  useEffect(() => {
    progress.setValue(0);
    elapsedRef.current = 0;
    startedAtRef.current = Date.now();
    if (paused) return;
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) advance();
    });
    return () => {
      animRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (paused) {
      animRef.current?.stop();
      elapsedRef.current += Date.now() - startedAtRef.current;
    } else if (current) {
      const remaining = Math.max(200, STORY_DURATION_MS - elapsedRef.current);
      startedAtRef.current = Date.now();
      animRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: remaining,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      animRef.current.start(({ finished }) => {
        if (finished) advance();
      });
    }
    return () => {
      animRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const onLeftPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    goPrev();
  }, [goPrev]);

  const onRightPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    advance();
  }, [advance]);

  const onDelete = useCallback(() => {
    if (!current) return;
    setShowMenu(false);
    Alert.alert(
      "Delete story?",
      "This story will disappear immediately for everyone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteStory(current.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              if (!group || group.stories.length <= 1) {
                router.back();
              } else if (index >= group.stories.length - 1) {
                setIndex(Math.max(0, index - 1));
              }
            } catch (e) {
              console.log("[story-viewer] delete failed", e);
              Alert.alert("Couldn't delete", "Please try again.");
            }
          },
        },
      ],
    );
  }, [current, deleteStory, group, index, router]);

  if (!group || !current) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Story unavailable</Text>
            <Text style={styles.emptyBody}>This story has ended or was deleted.</Text>
            <Pressable onPress={() => router.back()} style={styles.closeFallback} testID="story-viewer-back">
              <ChevronLeft color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={styles.closeFallbackText}>Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const initial = (group.displayName ?? group.username ?? "?").slice(0, 1).toUpperCase();

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, presentation: "modal", animation: "fade" }} />
      <View style={StyleSheet.absoluteFill}>
        <ExpoImage
          source={{ uri: current.mediaUrl }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.progressRow}>
          {group.stories.map((s, i) => {
            const filled =
              i < index
                ? 1
                : i === index
                  ? null
                  : 0;
            return (
              <View key={s.id} style={styles.progressTrack}>
                {filled === null ? (
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                ) : (
                  <View style={[styles.progressFill, { width: filled === 1 ? "100%" : "0%" }]} />
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.header}>
          <View style={styles.identityRow}>
            <View style={[styles.avatar, { backgroundColor: group.avatarColor ?? Colors.mint }]}>
              {group.avatarUrl ? (
                <ExpoImage source={{ uri: group.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </View>
            <View style={styles.identityCol}>
              <Text style={styles.identityName} numberOfLines={1}>
                {group.displayName ?? group.username ?? "Unknown"}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{formatAgo(current.createdAt)}</Text>
                <View style={styles.dot} />
                <Clock color={Colors.muted} size={10} strokeWidth={2.6} />
                <Text style={styles.metaText}>{formatExpires(current.expiresAt)}</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            {isMine ? (
              <Pressable onPress={() => setShowMenu(true)} style={styles.headerBtn} hitSlop={8} testID="story-menu">
                <MoreVertical color={Colors.text} size={18} strokeWidth={2.4} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={8} testID="story-close">
              <X color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
          </View>
        </View>

        {/* Tap zones */}
        <View style={styles.zones} pointerEvents="box-none">
          <Pressable
            onPress={onLeftPress}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            delayLongPress={150}
            style={styles.zoneLeft}
            testID="story-zone-left"
          />
          <Pressable
            onPress={onRightPress}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            delayLongPress={150}
            style={styles.zoneRight}
            testID="story-zone-right"
          />
        </View>

        <View style={styles.footer} pointerEvents="box-none">
          {current.caption ? (
            <View style={styles.captionPill}>
              <Text style={styles.captionText}>{current.caption}</Text>
            </View>
          ) : null}
          {isMine ? (
            <Pressable
              onPress={() => {
                setPaused(true);
                setShowViewers(true);
              }}
              style={styles.viewersPill}
              testID="story-viewers"
            >
              <Eye color={Colors.text} size={14} strokeWidth={2.6} />
              <Text style={styles.viewersText}>
                {current.viewsCount} {current.viewsCount === 1 ? "viewer" : "viewers"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>

      {/* Viewers sheet */}
      <Modal
        visible={showViewers}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowViewers(false);
          setPaused(false);
        }}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => {
            setShowViewers(false);
            setPaused(false);
          }}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ViewersList storyId={current.id} useViewers={useViewers} viewsCount={current.viewsCount} />
        </View>
      </Modal>

      {/* Owner menu */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowMenu(false)}>
          <View style={styles.menuCard}>
            <Pressable onPress={onDelete} disabled={isDeleting} style={styles.menuItem} testID="story-delete">
              {isDeleting ? (
                <ActivityIndicator color={Colors.rose} size="small" />
              ) : (
                <Trash2 color={Colors.rose} size={16} strokeWidth={2.6} />
              )}
              <Text style={[styles.menuText, { color: Colors.rose }]}>Delete story</Text>
            </Pressable>
            <Pressable onPress={() => setShowMenu(false)} style={styles.menuItem}>
              <Text style={styles.menuText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ViewersList({
  storyId,
  useViewers,
  viewsCount,
}: {
  storyId: string;
  useViewers: (id: string | undefined) => { data?: StoryViewer[]; isLoading: boolean };
  viewsCount: number;
}) {
  const q = useViewers(storyId);
  const viewers = q.data ?? [];
  return (
    <View style={styles.viewersWrap}>
      <View style={styles.viewersHeader}>
        <Eye color={Colors.text} size={16} strokeWidth={2.6} />
        <Text style={styles.viewersTitle}>Viewers</Text>
        <View style={styles.viewersCount}>
          <Text style={styles.viewersCountText}>{viewsCount}</Text>
        </View>
      </View>
      {q.isLoading ? (
        <View style={styles.viewersLoading}>
          <ActivityIndicator color={Colors.mint} />
        </View>
      ) : viewers.length === 0 ? (
        <View style={styles.viewersEmpty}>
          <Text style={styles.viewersEmptyTitle}>No viewers yet</Text>
          <Text style={styles.viewersEmptyBody}>
            When people watch your story, they&apos;ll appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={viewers}
          keyExtractor={(v) => v.userId}
          contentContainerStyle={styles.viewersList}
          ItemSeparatorComponent={() => <View style={styles.viewersDivider} />}
          renderItem={({ item }) => {
            const initial = (item.displayName ?? item.username ?? "?").slice(0, 1).toUpperCase();
            return (
              <View style={styles.viewerRow}>
                <View style={[styles.viewerAvatar, { backgroundColor: item.avatarColor ?? Colors.cyan }]}>
                  {item.avatarUrl ? (
                    <ExpoImage source={{ uri: item.avatarUrl }} style={styles.viewerAvatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.viewerAvatarText}>{initial}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.viewerName} numberOfLines={1}>
                    {item.displayName ?? item.username ?? "User"}
                  </Text>
                  {item.username ? (
                    <Text style={styles.viewerHandle} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.viewerSeen}>
                  <CheckCheck color={Colors.mint} size={14} strokeWidth={2.6} />
                  <Text style={styles.viewerTime}>{formatAgo(item.viewedAt)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  image: { width: "100%", height: "100%" },

  progressRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.text,
    borderRadius: 2,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 12,
  },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  identityCol: { flex: 1, gap: 2 },
  identityName: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { color: "rgba(244,255,249,0.75)", fontSize: 11, fontWeight: "700" },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(244,255,249,0.5)" },

  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,7,8,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  zones: { flex: 1, flexDirection: "row" },
  zoneLeft: { flex: 1 },
  zoneRight: { flex: 2 },

  footer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    alignItems: "center",
  },
  captionPill: {
    maxWidth: SW - 32,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(3,7,8,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  captionText: { color: Colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  viewersPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  viewersText: { color: Colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 13, fontWeight: "600", textAlign: "center" },
  closeFallback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.mint,
    marginTop: 12,
  },
  closeFallbackText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: Colors.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SH * 0.7,
    minHeight: 280,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: 8,
    marginBottom: 4,
  },
  viewersWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 },
  viewersHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  viewersTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", flex: 1 },
  viewersCount: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.14)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
  },
  viewersCountText: { color: Colors.mint, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  viewersLoading: { paddingVertical: 32, alignItems: "center" },
  viewersEmpty: { paddingVertical: 28, alignItems: "center", gap: 6 },
  viewersEmptyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  viewersEmptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", textAlign: "center" },
  viewersList: { paddingTop: 8, paddingBottom: 24 },
  viewersDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  viewerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  viewerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  viewerAvatarImg: { width: "100%", height: "100%" },
  viewerAvatarText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
  viewerName: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  viewerHandle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  viewerSeen: { flexDirection: "row", alignItems: "center", gap: 5 },
  viewerTime: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    padding: 16,
  },
  menuCard: {
    backgroundColor: Colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  menuText: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
});
