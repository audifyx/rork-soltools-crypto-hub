import { LinearGradient } from "expo-linear-gradient";
import { Link, Stack } from "expo-router";
import { Radar } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";

export default function SolToolsNotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#020506", "#071315"]} style={styles.container} testID="soltools-not-found-screen">
        <View style={styles.iconShell}>
          <Radar color={Colors.mint} size={42} strokeWidth={2.4} />
        </View>

        <Text style={styles.kicker}>Signal unavailable</Text>

        <Text style={styles.title}>
          This route is still syncing or no longer active.
        </Text>

        <Text style={styles.body}>
          Continue scanning wallets, whale activity, token movement, and social momentum inside Social Alpha Cockpit.
        </Text>

        <Link href="/" style={styles.link} testID="soltools-not-found-home-link">
          Return to Scanner
        </Link>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  iconShell: {
    width: 92,
    height: 92,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85, 245, 178, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(85, 245, 178, 0.2)",
    marginBottom: 22,
  },
  kicker: {
    color: Colors.orange,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    color: Colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    textAlign: "center",
  },
  body: {
    color: Colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
    maxWidth: 340,
  },
  link: {
    color: Colors.ink,
    backgroundColor: Colors.mint,
    borderRadius: 16,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "900",
  },
});