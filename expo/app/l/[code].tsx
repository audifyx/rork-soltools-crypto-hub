import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { routeForIncomingShareUrl } from "@/lib/share-links";

export default function ShareLinkRedirectScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    const rawCode = typeof code === "string" ? code : "";
    if (!rawCode) {
      setFailed(true);
      return;
    }
    void routeForIncomingShareUrl(`https://ogscan.fun/l/${encodeURIComponent(rawCode)}`).then((route) => {
      if (!alive) return;
      if (route) {
        router.replace(route as never);
      } else {
        setFailed(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [code, router]);

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {failed ? (
        <View style={styles.card}>
          <Text style={styles.title}>Link unavailable</Text>
          <Text style={styles.body}>This invite or post link may have expired.</Text>
          <Pressable onPress={() => router.replace("/(tabs)/home" as never)} style={styles.button}>
            <Text style={styles.buttonText}>Go home</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <ActivityIndicator color={Colors.mint} />
          <Text style={styles.title}>Opening SolTools…</Text>
          <Text style={styles.body}>Taking you straight to the shared post or community.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.ink,
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    gap: 12,
    padding: 22,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  body: { color: Colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 18 },
  button: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: Colors.mint },
  buttonText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
