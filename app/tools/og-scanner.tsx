import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { ArrowLeft, Bot, Coins, Copy, Crosshair, ExternalLink, Flame, Radar, Search, ShieldAlert, WalletCards } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { fetchOfficialOGScanToken, fetchSolanaTrending, formatAge, formatUsd, OGSCAN_DEXSCREENER_URL, OGSCAN_DEV_WALLET, OGSCAN_PUMPFUN_URL, OGSCAN_TOKEN_MINT, searchScannerTokens, shortAddress, type OGScannerToken } from "@/lib/og-scanner";
import { OG_SCANNER_TOOLS, type OGScannerTool, type OGScannerToolId } from "@/lib/og-scanner/tools";

const icons: Record<OGScannerToolId, React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>> = {
  "direct-og-scan": Crosshair,
  "trending-scanner": Flame,
  "new-pairs-scanner": Radar,
  "snipe-feed": Flame,
  "official-ogscan-coin": Coins,
  "dev-wallet-intel": WalletCards,
  "launch-analyzer": ShieldAlert,
  "telegram-ai-bot": Bot,
};

export default function OGScannerToolsHub() {
  const params = useLocalSearchParams<{ tool?: string }>();
  const initialTool = OG_SCANNER_TOOLS.some((t) => t.id === params.tool) ? (params.tool as OGScannerToolId) : "direct-og-scan";
  const [activeTool, setActiveTool] = useState<OGScannerToolId>(initialTool);
  const selectedTool = useMemo(() => OG_SCANNER_TOOLS.find((t) => t.id === activeTool), [activeTool]);

  return (
    <View style={styles.root} testID="og-scanner-hub">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient colors={["#020506", "#06120F", "#020708"]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="og-scanner-back">
            <ArrowLeft color={Colors.text} size={18} strokeWidth={2.7} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>SOLTOOLS</Text>
            <Text style={styles.headerTitle}>OG Scanner Tools</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>OGScan tools inside SolTools</Text>
            <Text style={styles.heroBody}>Separate scanner tools for Direct OG scan, trending pairs, new pairs, official CA, dev wallets, launch analysis, and Telegram AI bot setup.</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {OG_SCANNER_TOOLS.map((tool) => {
              const Icon = icons[tool.id];
              const active = activeTool === tool.id;
              return (
                <Pressable key={tool.id} onPress={() => setActiveTool(tool.id)} style={[styles.toolTab, active && styles.toolTabActive]} testID={`og-scanner-tab-${tool.id}`}>
                  <Icon color={active ? Colors.ink : Colors.mint} size={15} strokeWidth={2.8} />
                  <Text style={[styles.toolTabText, active && styles.toolTabTextActive]}>{tool.title}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedTool ? <ToolPanel tool={selectedTool} /> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ToolPanel({ tool }: { tool: OGScannerTool }) {
  if (tool.id === "official-ogscan-coin") return <OfficialCoinTool />;
  if (tool.id === "trending-scanner") return <TokenListTool mode="trending" />;
  if (tool.id === "new-pairs-scanner") return <TokenListTool mode="new" />;
  if (tool.id === "direct-og-scan") return <DirectOGScanTool />;
  if (tool.id === "snipe-feed") return <TokenListTool mode="snipe" />;
  if (tool.id === "dev-wallet-intel") return <InfoTool title="Dev Wallet Intel" body="Tracks watched dev wallets, previous launches, latest coins, and repeat creator behavior. Backend holder/transaction history should be connected with Helius or Birdeye." extra={OGSCAN_DEV_WALLET} />;
  if (tool.id === "launch-analyzer") return <InfoTool title="Launch Analyzer" body="Analyzes holder risk, liquidity quality, security warnings, social links, sell pressure, age, and momentum score. Full holder checks need RPC/Birdeye holder data." />;
  return <InfoTool title="Telegram OG Scanner AI" body="Supabase Edge Function bot system with /ai, /og, /search, /trending, /newpairs, /whales, and /watch commands. Needs TELEGRAM_BOT_TOKEN and GEMINI_API_KEY." />;
}

function DirectOGScanTool() {
  const [query, setQuery] = useState<string>(OGSCAN_TOKEN_MINT);
  const [loading, setLoading] = useState<boolean>(false);
  const [tokens, setTokens] = useState<OGScannerToken[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await searchScannerTokens(query);
      setTokens(next);
      if (!next.length) setError("No Solana pairs found for that ticker or CA.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scanner failed.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void runScan(); }, []);

  const mainPair = tokens[0];
  const copycats = mainPair ? tokens.filter((t) => t.baseToken.address !== mainPair.baseToken.address).slice(0, 3) : [];

  return (
    <View style={styles.panel}>
      <ToolHeading title="Direct OG Scan" body="Search ticker or CA. Finds the main Solana pair, copycats, liquidity, age, risk, and OG momentum score." />
      <View style={styles.searchBox}>
        <Search color={Colors.muted} size={18} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Enter ticker or CA" placeholderTextColor={Colors.muted} autoCapitalize="none" style={styles.searchInput} />
        <Pressable onPress={runScan} style={styles.scanBtn} disabled={loading}>{loading ? <ActivityIndicator color={Colors.ink} /> : <Text style={styles.scanBtnText}>Scan</Text>}</Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {mainPair ? <TokenCard token={mainPair} featured /> : null}
      {copycats.length ? <Text style={styles.noteText}>Copycats found: {copycats.length}</Text> : null}
      {copycats.map((token) => <TokenCard key={token.id} token={token} />)}
    </View>
  );
}

function TokenListTool({ mode }: { mode: "trending" | "new" | "snipe" }) {
  const [tokens, setTokens] = useState<OGScannerToken[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSolanaTrending();
      const sorted = mode === "new" ? [...data].sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0)).slice(0, 20) : mode === "snipe" ? [...data].sort((a, b) => (b.txns24h || 0) - (a.txns24h || 0)).slice(0, 25) : data.slice(0, 20);
      setTokens(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load scanner data.");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { void load(); }, [load]);

  const title = mode === "new" ? "New Pairs Scanner" : mode === "snipe" ? "Snipe Feed" : "Trending Scanner";
  const body = mode === "new" ? "Fresh Solana pairs sorted by pair creation time." : mode === "snipe" ? "Fresh launch feed sorted by activity with liquidity, risk notes, and chart links." : "Top Solana pairs ranked by scanner momentum and 24h activity.";

  return <View style={styles.panel}><ToolHeading title={title} body={body} />{loading ? <ActivityIndicator color={Colors.mint} style={{ marginVertical: 20 }} /> : null}{error ? <Text style={styles.errorText}>{error}</Text> : null}{tokens.map((token) => <TokenCard key={`${mode}-${token.id}`} token={token} />)}</View>;
}

function OfficialCoinTool() {
  const [token, setToken] = useState<OGScannerToken | null>(null);
  useEffect(() => { fetchOfficialOGScanToken().then(setToken).catch(() => setToken(null)); }, []);
  return <View style={styles.panel}><ToolHeading title="Official OGScan Coin" body="Verified CA, dev wallet, chart links, Pump.fun link, and copy buttons." /><AddressRow label="Official CA" value={OGSCAN_TOKEN_MINT} /><AddressRow label="Dev Wallet" value={OGSCAN_DEV_WALLET} /><View style={styles.linkRow}><LinkButton label="DexScreener" url={OGSCAN_DEXSCREENER_URL} /><LinkButton label="Pump.fun" url={OGSCAN_PUMPFUN_URL} /></View>{token ? <TokenCard token={token} featured /> : null}</View>;
}

function InfoTool({ title, body, extra }: { title: string; body: string; extra?: string }) {
  return <View style={styles.panel}><ToolHeading title={title} body={body} />{extra ? <AddressRow label="Default watched wallet" value={extra} /> : null}</View>;
}

function ToolHeading({ title, body }: { title: string; body: string }) {
  return <View style={styles.toolHeading}><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelBody}>{body}</Text></View>;
}

function TokenCard({ token, featured }: { token: OGScannerToken; featured?: boolean }) {
  const open = useCallback(() => { if (token.url) Linking.openURL(token.url).catch(() => Alert.alert("Link failed", "Could not open chart.")); }, [token.url]);
  return <Pressable onPress={open} style={[styles.tokenCard, featured && styles.tokenCardFeatured]}><View style={styles.tokenHeader}><View style={{ flex: 1 }}><Text style={styles.tokenSymbol}>${token.baseToken.symbol}</Text><Text style={styles.tokenName} numberOfLines={1}>{token.baseToken.name}</Text></View><View style={styles.scorePill}><Text style={styles.scoreText}>{token.momentumScore}</Text></View></View><View style={styles.metricsGrid}><Metric label="Price" value={formatUsd(token.priceUsd)} /><Metric label="MCap" value={formatUsd(token.fdv || token.marketCap)} /><Metric label="Liq" value={formatUsd(token.liquidityUsd)} /><Metric label="Age" value={formatAge(token.pairCreatedAt)} /></View><View style={styles.riskRow}><Text style={[styles.riskText, token.riskLevel === "high" ? styles.riskHigh : token.riskLevel === "medium" ? styles.riskMed : styles.riskLow]}>{token.riskLevel.toUpperCase()} RISK</Text><ExternalLink color={Colors.muted} size={15} /></View><Text style={styles.noteText} numberOfLines={2}>{token.riskNotes.join(" · ")}</Text></Pressable>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function AddressRow({ label, value }: { label: string; value: string }) {
  const copy = useCallback(async () => { await Clipboard.setStringAsync(value); Alert.alert("Copied", `${label} copied.`); }, [label, value]);
  return <View style={styles.addressRow}><View style={{ flex: 1 }}><Text style={styles.addressLabel}>{label}</Text><Text style={styles.addressValue}>{shortAddress(value, 7)}</Text></View><Pressable onPress={copy} style={styles.copyBtn}><Copy color={Colors.ink} size={16} /><Text style={styles.copyText}>Copy</Text></Pressable></View>;
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return <Pressable onPress={() => Linking.openURL(url)} style={styles.linkBtn}><Text style={styles.linkText}>{label}</Text><ExternalLink color={Colors.ink} size={14} /></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  backBtn: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 2.2 },
  headerTitle: { color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.7 },
  scroll: { padding: 16, paddingBottom: 80 },
  heroCard: { padding: 18, borderRadius: 24, backgroundColor: "rgba(98,208,255,0.08)", borderWidth: 1, borderColor: "rgba(98,208,255,0.20)", marginBottom: 14 },
  heroTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.7 },
  heroBody: { color: Colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8, fontWeight: "600" },
  tabsRow: { gap: 8, paddingBottom: 14 },
  toolTab: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  toolTabActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  toolTabText: { color: Colors.mint, fontSize: 12, fontWeight: "900" },
  toolTabTextActive: { color: Colors.ink },
  panel: { gap: 12 },
  toolHeading: { marginBottom: 4 },
  panelTitle: { color: Colors.text, fontSize: 21, fontWeight: "900", letterSpacing: -0.5 },
  panelBody: { color: Colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, fontWeight: "600" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "700" },
  scanBtn: { minWidth: 68, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: Colors.mint },
  scanBtnText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  errorText: { color: "#ff7b7b", fontSize: 12, fontWeight: "800", lineHeight: 18 },
  tokenCard: { padding: 14, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  tokenCardFeatured: { borderColor: "rgba(98,208,255,0.30)", backgroundColor: "rgba(98,208,255,0.07)" },
  tokenHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  tokenSymbol: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  tokenName: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  scorePill: { minWidth: 44, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: "rgba(98,208,255,0.14)", borderWidth: 1, borderColor: "rgba(98,208,255,0.25)" },
  scoreText: { color: Colors.mint, fontSize: 13, fontWeight: "900" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metric: { flexGrow: 1, minWidth: "22%", padding: 9, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.22)" },
  metricLabel: { color: Colors.muted, fontSize: 10, fontWeight: "800" },
  metricValue: { color: Colors.text, fontSize: 12, fontWeight: "900", marginTop: 3 },
  riskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  riskText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  riskHigh: { color: "#ff7b7b" }, riskMed: { color: "#ffd166" }, riskLow: { color: Colors.mint },
  noteText: { color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  addressLabel: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  addressValue: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 3 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.mint },
  copyText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
  linkRow: { flexDirection: "row", gap: 10 },
  linkBtn: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: Colors.mint },
  linkText: { color: Colors.ink, fontSize: 12, fontWeight: "900" },
});
