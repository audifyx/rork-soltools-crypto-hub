import { useQuery } from "@tanstack/react-query";
import { Heart, MessageCircle, Repeat2 } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import {
  fetchProfileLikes,
  fetchProfilePosts,
  fetchProfileReposts,
  type ProfileActivityItem,
  type ProfileActivityType,
} from "@/lib/api/profile-activity";

type ProfilePostActivityListMode = "posts" | "likes" | "reposts";

interface Props {
  userId: string;
  mode?: ProfilePostActivityListMode;
  limit?: number;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function actionLabel(type: ProfileActivityType): string {
  if (type === "like") return "Liked";
  if (type === "repost") return "Reposted";
  if (type === "comment") return "Commented";
  return "Posted";
}

function EmptyState({ mode }: { mode: ProfilePostActivityListMode }) {
  const title = mode === "likes" ? "No liked posts yet" : mode === "reposts" ? "No reposts yet" : "No posts yet";
  const body =
    mode === "likes"
      ? "Posts this profile likes will show here."
      : mode === "reposts"
        ? "Reposted posts will show here."
        : "Top-level posts from this profile will show here.";

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function StatRow({ item }: { item: ProfileActivityItem }) {
  return (
    <View style={styles.stats}>
      <View style={styles.statItem}>
        <Heart color={Colors.muted2} size={12} strokeWidth={2.3} />
        <Text style={styles.stat}>{item.likes}</Text>
      </View>
      <View style={styles.statItem}>
        <Repeat2 color={Colors.muted2} size={12} strokeWidth={2.3} />
        <Text style={styles.stat}>{item.reposts}</Text>
      </View>
      <View style={styles.statItem}>
        <MessageCircle color={Colors.muted2} size={12} strokeWidth={2.3} />
        <Text style={styles.stat}>{item.comments}</Text>
      </View>
    </View>
  );
}

export default function ProfilePostActivityList({ userId, mode = "posts", limit = 80 }: Props) {
  const query = useQuery({
    queryKey: ["profile", "activity", mode, userId],
    enabled: !!userId,
    queryFn: () => {
      if (mode === "likes") return fetchProfileLikes(userId, limit);
      if (mode === "reposts") return fetchProfileReposts(userId, limit);
      return fetchProfilePosts(userId, limit);
    },
    staleTime: 20_000,
  });

  if (query.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.mint} />
      </View>
    );
  }

  if (!query.data?.length) return <EmptyState mode={mode} />;

  return (
    <FlatList
      scrollEnabled={false}
      data={query.data}
      keyExtractor={(item) => `${item.activityType}-${item.id}-${item.activityAt}`}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => (
        <Pressable style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.type}>{actionLabel(item.activityType)}</Text>
            <Text style={styles.time}>{relTime(item.activityAt)}</Text>
          </View>
          <Text style={styles.content} numberOfLines={5}>
            {item.content || "Untitled post"}
          </Text>
          {item.ticker ? <Text style={styles.ticker}>${item.ticker.replace(/^\$/, "")}</Text> : null}
          <StatRow item={item} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "rgba(12,12,10,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  type: {
    color: Colors.mint,
    fontSize: 12,
    fontWeight: "900",
  },
  time: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  content: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  ticker: {
    marginTop: 8,
    color: Colors.cyan,
    fontSize: 12,
    fontWeight: "900",
  },
  stats: {
    flexDirection: "row",
    gap: 14,
    marginTop: 12,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stat: {
    color: Colors.muted2,
    fontSize: 11,
    fontWeight: "800",
  },
  empty: {
    marginTop: 20,
    padding: 22,
    borderRadius: 18,
    backgroundColor: "rgba(12,12,10,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  emptyBody: {
    color: Colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },
});
