import React from "react";
import { Stack, useRouter } from "expo-router";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Wallet, ArrowLeft } from "lucide-react-native";

import Colors from "@/constants/colors";

export default function SwapComingSoonScreen() {
  const router = useRouter();
  return (
    <View style={styles.root} testID="swap-coming-soon">
      <Stack.Screen options={{ title: "Trading" }} />
      <Pressable onPress={() => router.back()} style={styles.back} testID="swap-back">
        <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
      </Pressable>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Wallet color={Colors.mint} size={28} strokeWidth={2.4} />
        </View>
        <Text style={styles.title}>Trading is coming later</Text>
        <Text style={styles.body}>
          Buying, selling and swapping aren&apos;t available in the app yet. We&apos;re focused on
          research, KOL intel, Spaces and community for now — trading will arrive in a future update.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  back: { position: "absolute", top: 56, left: 16, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", zIndex: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(85,245,178,0.12)", borderWidth: 1, borderColor: "rgba(85,245,178,0.32)" },
  title: { color: Colors.text, fontSize: 22, fontWeight: "900", textAlign: "center", letterSpacing: 0.2 },
  body: { color: Colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center", fontWeight: "600" },
});
