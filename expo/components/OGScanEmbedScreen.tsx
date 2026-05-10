import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft, ExternalLink, Grid2X2, RefreshCw } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { WebView as WebViewType } from "react-native-webview";

import Colors from "@/constants/colors";

export const OGSCAN_BASE_URL = "https://www.ogscan.fun";

export type OGScanEmbedProps = {
  title: string;
  path: string;
  subtitle?: string;
  showBack?: boolean;
};

export function buildOgScanUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${OGSCAN_BASE_URL}${normalizedPath}`;
}

/** Native shell for one standalone OGScan web tool page. */
export default function OGScanEmbedScreen({ title, path, subtitle, showBack = true }: OGScanEmbedProps) {
  const router = useRouter();
  const webRef = useRef<WebViewType>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const url = useMemo<string>(() => buildOgScanUrl(path), [path]);

  const onOpenExternal = useCallback(() => {
    WebBrowser.openBrowserAsync(url).catch((error: unknown) => console.log("[ogscan] open external failed", error));
  }, [url]);

  const onRefresh = useCallback(() => {
    setLoading(true);
    webRef.current?.reload();
  }, []);

  return (
    <View style={styles.root} testID={`ogscan-embed-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <LinearGradient colors={["#000000", "#03111D", "#000000"]} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          {showBack ? (
            <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8}>
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.7} />
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push("/(tabs)/tools" as never)} style={styles.iconButton} hitSlop={8}>
              <Grid2X2 color={Colors.text} size={18} strokeWidth={2.7} />
            </Pressable>
          )}
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>OGSCAN LIVE TOOL</Text>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={onRefresh} style={styles.iconButton} hitSlop={8}>
            <RefreshCw color="#B8FF3C" size={17} strokeWidth={2.7} />
          </Pressable>
          <Pressable onPress={onOpenExternal} style={styles.iconButton} hitSlop={8}>
            <ExternalLink color="#62D0FF" size={17} strokeWidth={2.7} />
          </Pressable>
        </View>
        <View style={styles.webShell}>
          {loading ? (
            <View style={styles.loader} pointerEvents="none">
              <ActivityIndicator color="#B8FF3C" />
              <Text style={styles.loaderText}>Connecting to {title}</Text>
            </View>
          ) : null}
          <WebView
            ref={webRef}
            source={{ uri: url }}
            style={styles.web}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
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
  root: { flex: 1, backgroundColor: "#000000" },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(98,208,255,0.18)",
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
  eyebrow: { color: "#B8FF3C", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  subtitle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  webShell: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  web: { flex: 1, backgroundColor: "#000000" },
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
    borderColor: "rgba(184,255,60,0.28)",
  },
  loaderText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
});
