import { useQuery } from "@tanstack/react-query";
import { Heart, MessageCircle, Repeat2 } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";

interface ActivityItem {
  activity_type: "like" | "repost" | "comment";
  external_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  source: string;
  source_url: string | null;
  created_at: string;
  like_count: number;
  repost_count: number;
  comment_count: number;
  quote_text: string | null;
}

async function getMyNewsActivity(): Promise<ActivityItem[]> {
  const { data, error } = await supabase.rpc("get_my_news_activity", {
    p_limit: 100,
  });

  if (error) throw error;
  return (data ?? []) as ActivityItem[];
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function iconFor(type: ActivityItem["activity_type"]) {
  switch (type) {
    case "like":
      return <Heart color={Colors.rose} size={15} strokeWidth={2.5} fill={Colors.rose} />;
    case "repost":
      return <Repeat2 color={Colors.mint} size={15} strokeWidth={2.5} />;
    case "comment":
      return <MessageCircle color={Colors.cyan} size={15} strokeWidth={2.5} />;
  }
}

export default function ProfileActivityFeed() {
  const query = useQuery({
    queryKey: ["profile", "news-activity"],
    queryFn: getMyNewsActivity,
    staleTime: 20_000,
  });

  if (query.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.mint} />
      </View>
    );
  }

  if (!query.data?.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No social activity yet</Text>
        <Text style={styles.emptyBody}>
          Likes, reposts, and comments from the news feed will appear here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      scrollEnabled={false}
      data={query.data}
      keyExtractor={(item, i) => `${item.activity_type}-${item.external_id}-${i}`}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => (
        <Pressable style={styles.card}>
          <View style={styles.row}>
            <View style={styles.iconWrap}>{iconFor(item.activity_type)}</View>
            <View style={{ flex: 1 }}>
              <View style={styles.topRow}>
                <Text style={styles.type}>
                  {item.activity_type === "like"
                    ? "Liked"
                    : item.activity_type === "repost"
                      ? "Reposted"
                      : "Commented"}
                </Text>
                <Text style={styles.time}>{relTime(item.created_at)}</Text>
              </View>

              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>

              {item.quote_text ? (
                <Text style={styles.quote} numberOfLines={3}>
                  {item.quote_text}
                </Text>
              ) : null}

              <View style={styles.stats}>
                <Text style={styles.stat}>{item.like_count} likes</Text>
                <Text style={styles.stat}>{item.repost_count} reposts</Text>
                <Text style={styles.stat}>{item.comment_count} comments</Text>
              </View>
            </View>
          </View>
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
  row: {
    flexDirection: "row",
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  type: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  time: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  quote: {
    marginTop: 8,
    color: Colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  stat: {
    color: Colors.muted2,
    fontSize: 11,
    fontWeight: "700",
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
