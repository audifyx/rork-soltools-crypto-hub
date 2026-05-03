import React, { useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import Colors from "@/constants/colors";
import { useDexToken } from "@/lib/api/dexscreener";

interface Props {
  contract: string;
  /** Pair address override (preferred when known) */
  pairAddress?: string;
  height?: number;
  /** "1S" | "1" | "5" | "15" | "60" | "240" | "1D" */
  interval?: string;
  theme?: "dark" | "light";
}

/**
 * Live DEXScreener chart embed. Works on iOS/Android (WebView) and web (iframe).
 * Resolves Pump.fun mint CAs to the active Solana pair when needed.
 */
export default function DexChart({
  contract,
  pairAddress,
  height = 320,
  interval = "60",
  theme = "dark",
}: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const { data: resolvedDex } = useDexToken(pairAddress ? null : contract);

  const target = pairAddress ?? resolvedDex?.pairAddress ?? contract;
  if (!target || target.length < 8) {
    return <View style={[styles.wrap, { height }]} />;
  }

  const url = `https://dexscreener.com/solana/${target}?embed=1&theme=${theme}&trades=0&info=0&interval=${interval}`;

  if (Platform.OS === "web") {
    return (
      <View style={[styles.wrap, { height }]} testID="dex-chart-web">
        <iframe
          src={url}
          style={{ width: "100%", height: "100%", border: 0 }}
          title="DEXScreener chart"
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]} testID="dex-chart-native">
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        startInLoadingState
        onLoadEnd={() => setLoading(false)}
        androidLayerType="hardware"
        scrollEnabled={false}
      />
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={Colors.mint} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,7,8,0.6)",
  },
});
