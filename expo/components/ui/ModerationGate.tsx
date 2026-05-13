import { LinearGradient } from "expo-linear-gradient";
import { AlertOctagon, Ban, Clock, LogOut, ShieldAlert } from "lucide-react-native";
import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAuth } from "@/providers/auth-provider";
import { useModeration } from "@/providers/moderation-provider";

interface Props {
  children: React.ReactNode;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "permanently";
  const target = new Date(iso).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return "any moment now";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(diff / 60_000));
    return `in ${minutes}m`;
  }
  if (hours < 48) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

export default function ModerationGate({ children }: Props) {
  const { isAuthenticated, signOut } = useAuth();
  const { isBanned, status, isLoading } = useModeration();

  const expiry = useMemo(() => formatExpiry(status.ban_expires_at), [status.ban_expires_at]);

  if (!isAuthenticated) return <>{children}</>;
  if (isLoading && !isBanned) return <>{children}</>;
  if (!isBanned) return <>{children}</>;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["rgba(255,40,90,0.32)", "rgba(11,15,26,0.4)", "rgba(0,0,0,0)"]}
        style={styles.bgGlow}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ban color="#FF4D6D" size={48} strokeWidth={2.6} />
          </View>
          <Text style={styles.eyebrow}>ACCOUNT BANNED</Text>
          <Text style={styles.title}>YOU ARE BANNED</Text>
          <Text style={styles.subtitle}>CAN&apos;T USE THE APP ANYMORE</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <ShieldAlert color={Colors.muted} size={14} strokeWidth={2.6} />
              <Text style={styles.rowLabel}>Reason</Text>
            </View>
            <Text style={styles.rowValue}>{status.ban_reason?.trim() || "Violation of community guidelines."}</Text>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Clock color={Colors.muted} size={14} strokeWidth={2.6} />
              <Text style={styles.rowLabel}>Ban length</Text>
            </View>
            <Text style={styles.rowValue}>
              {status.ban_expires_at ? `Lifts ${expiry}` : "Permanent — no expiration"}
            </Text>
          </View>

          <Text style={styles.body}>
            If you believe this was a mistake, contact support. You cannot post, comment, like, follow, message, or
            otherwise use the app while your account is banned.
          </Text>

          <Pressable
            onPress={() => signOut().catch(() => {})}
            style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
            testID="banned-signout"
          >
            <LogOut color={Colors.text} size={16} strokeWidth={2.6} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Inline banner shown across surfaces (home/compose) when the user is suspended
 * or limited but not banned.
 */
export function ModerationBanner() {
  const { isSuspended, isLimited, status } = useModeration();
  if (!isSuspended && !isLimited) return null;

  const expiry = isSuspended
    ? formatExpiry(status.suspend_expires_at)
    : formatExpiry(status.limit_expires_at);

  const reason = isSuspended ? status.suspend_reason : status.limit_reason;
  const title = isSuspended ? "Account suspended" : "Account limited";
  const sub = isSuspended
    ? `You can browse, but can't post, comment, like or message · ${status.suspend_expires_at ? `lifts ${expiry}` : "permanent"}`
    : `Some actions are limited · ${status.limit_expires_at ? `lifts ${expiry}` : "permanent"}`;

  return (
    <View style={styles.banner}>
      <AlertOctagon color="#FFB84C" size={16} strokeWidth={2.8} />
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerSub}>{sub}</Text>
        {reason ? <Text style={styles.bannerReason}>“{reason}”</Text> : null}
      </View>
    </View>
  );
}

/**
 * Lightweight loader spinner used while moderation status first resolves.
 */
export function ModerationLoader() {
  return (
    <View style={styles.loaderWrap}>
      <ActivityIndicator color={Colors.goldBright} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  bgGlow: { position: "absolute", top: 0, left: 0, right: 0, height: 360 },
  content: { flex: 1, paddingHorizontal: 26, paddingTop: 30, paddingBottom: 30, alignItems: "center", justifyContent: "center", gap: 14 },
  iconWrap: {
    width: 110, height: 110, borderRadius: 36, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,77,109,0.12)", borderWidth: 1, borderColor: "rgba(255,77,109,0.34)", marginBottom: 6,
  },
  eyebrow: { color: "#FF4D6D", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: Colors.text, fontSize: 36, fontWeight: "900", letterSpacing: -0.8, textAlign: "center" },
  subtitle: { color: Colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 0.6, textAlign: "center", marginTop: -4 },
  card: {
    width: "100%", borderRadius: 22, padding: 18, gap: 6, marginTop: 14,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,77,109,0.32)",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  rowValue: { color: Colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  divider: { height: 1, backgroundColor: Colors.line, marginVertical: 10 },
  body: { color: Colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 4 },
  signOutBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18,
    height: 48, paddingHorizontal: 22, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.lineStrong,
  },
  signOutText: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.78 },

  banner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginHorizontal: 14, marginTop: 8, marginBottom: 4,
    padding: 12, borderRadius: 14,
    backgroundColor: "rgba(255,184,76,0.08)", borderWidth: 1, borderColor: "rgba(255,184,76,0.34)",
  },
  bannerCopy: { flex: 1, gap: 2 },
  bannerTitle: { color: "#FFB84C", fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  bannerSub: { color: Colors.text, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  bannerReason: { color: Colors.muted, fontSize: 11, fontStyle: "italic", marginTop: 2 },

  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.ink },
});
