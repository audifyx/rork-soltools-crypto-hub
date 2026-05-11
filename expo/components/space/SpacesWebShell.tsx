import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { WebView as WebViewType } from "react-native-webview";

import Colors from "@/constants/colors";

/**
 * Spaces is hosted as a standalone web app and embedded here as a WebView.
 * Set EXPO_PUBLIC_SPACES_WEB_URL to override the default.
 */
export const SPACES_WEB_BASE_URL: string =
  process.env.EXPO_PUBLIC_SPACES_WEB_URL ?? "https://spaces.soltools.app";

export function buildSpacesUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SPACES_WEB_BASE_URL}${normalized}`;
}

type Props = {
  title: string;
  path: string;
  subtitle?: string;
};

export default function SpacesWebShell({ title, path, subtitle }: Props) {
  const router = useRouter();
  const webRef = useRef<WebViewType>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const url = useMemo<string>(() => buildSpacesUrl(path), [path]);

  const onOpenExternal = useCallback(() => {
    WebBrowser.openBrowserAsync(url).catch((err: unknown) =>
      console.log("[spaces] open external failed", err),
    );
  }, [url]);

  const onRefresh = useCallback(() => {
    setLoading(true);
    webRef.current?.reload();
  }, []);

  return (
    <View style={styles.root} testID="spaces-web-shell">
      <LinearGradient colors={["#000000", "#0A0804", "#000000"]} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8} testID="spaces-shell-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.7} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>SOLTOOLS SPACES</Text>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={onRefresh} style={styles.iconButton} hitSlop={8}>
            <RefreshCw color={Colors.goldBright} size={17} strokeWidth={2.7} />
          </Pressable>
          <Pressable onPress={onOpenExternal} style={styles.iconButton} hitSlop={8}>
            <ExternalLink color={Colors.cyan} size={17} strokeWidth={2.7} />
          </Pressable>
        </View>
        <View style={styles.webShell}>
          {loading ? (
            <View style={styles.loader} pointerEvents="none">
              <ActivityIndicator color={Colors.goldBright} />
              <Text style={styles.loaderText}>Connecting to Spaces</Text>
            </View>
          ) : null}
          <WebView
            ref={webRef}
            source={{ uri: url }}
            style={styles.web}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            allowsProtectedMedia
            onPermissionRequest={(event: { permissions: string[]; grant: () => void; deny: () => void }) => {
              try { event.grant(); } catch {}
            }}
            setSupportMultipleWindows={false}
            startInLoadingState
            onLoadEnd={() => setLoading(false)}
            allowsBackForwardNavigationGestures
            pullToRefreshEnabled={Platform.OS !== "web"}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(244,198,91,0.18)",
    backgroundColor: "rgba(0,0,0,0.82)",
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  titleWrap: { flex: 1, minWidth: 0 },
  eyebrow: { color: Colors.goldBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  subtitle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  webShell: { flex: 1, overflow: "hidden", backgroundColor: Colors.ink },
  web: { flex: 1, backgroundColor: Colors.ink },
  loader: {
    position: "absolute",
    zIndex: 4,
    top: 18,
    alignSelf: "center",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.82)",
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.28)",
  },
  loaderText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
});
