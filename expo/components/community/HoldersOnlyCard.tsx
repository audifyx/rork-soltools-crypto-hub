import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";

interface Props {
  title: string;
  minimumBalance: number;
  members?: number;
  locked?: boolean;
  onPress?: () => void;
}

export default function HoldersOnlyCard({
  title,
  minimumBalance,
  members = 0,
  locked = true,
  onPress,
}: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={styles.lockPill}>
          <View style={styles.lockDot} />
          <Text style={styles.lockText}>
            HOLDERS ONLY
          </Text>
        </View>

        {locked && (
          <View style={styles.lockedBadge}>
            <Text style={styles.lockedText}>LOCKED</Text>
          </View>
        )}
      </View>

      <Text style={styles.title}>{title}</Text>

      <Text style={styles.description}>
        Requires {minimumBalance.toLocaleString()} SOLTOOLS to join
      </Text>

      <View style={styles.footerRow}>
        <Text style={styles.memberText}>
          {members.toLocaleString()} members
        </Text>

        <View style={styles.joinButton}>
          <Text style={styles.joinText}>
            View Community
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.16)",
    shadowColor: Colors.mint,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.2)",
  },
  lockDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  lockText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  lockedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  lockedText: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: "800",
  },
  title: {
    marginTop: 16,
    color: Colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  description: {
    marginTop: 10,
    color: Colors.muted,
    lineHeight: 20,
    fontWeight: "600",
  },
  footerRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memberText: {
    color: Colors.text,
    fontWeight: "700",
  },
  joinButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.mint,
  },
  joinText: {
    color: Colors.ink,
    fontWeight: "900",
    fontSize: 12,
  },
});
