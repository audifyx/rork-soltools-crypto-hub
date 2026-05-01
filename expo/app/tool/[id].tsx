import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  BellPlus,
  Bot,
  Brain,
  ChartCandlestick,
  ChartLine,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Crosshair,
  Eye,
  Flame,
  Gauge,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Radar,
  Rocket,
  Scan,
  Search,
  Send,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Waves,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { AlertItem, useApp } from "@/providers/app-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

interface ToolMeta {
  id: string;
  name: string;
  tagline: string;
  Icon: LucideIcon;
  accent: string;
  description: string;
}

const META: Record<string, ToolMeta> = {
  "wallet-tracker": {
    id: "wallet-tracker",
    name: "Wallet Tracker",
    tagline: "Live PnL on any address",
    Icon: Wallet,
    accent: Colors.mint,
    description:
      "Add any Solana wallet to monitor holdings, transactions, and PnL in real-time. Get notified on every move.",
  },
  "rug-scanner": {
    id: "rug-scanner",
    name: "Rug Scanner",
    tagline: "AI risk score in seconds",
    Icon: Shield,
    accent: Colors.rose,
    description:
      "Paste any contract for an AI risk score, holder cluster analysis, LP lock detection, and tax behavior.",
  },
  "lp-sniper": {
    id: "lp-sniper",
    name: "LP Sniper",
    tagline: "Catch new pools instantly",
    Icon: Crosshair,
    accent: Colors.orange,
    description: "Auto-snipe new liquidity pools the moment they go live. Set rules, slippage, and budget.",
  },
  "whale-radar": {
    id: "whale-radar",
    name: "Whale Radar",
    tagline: "Smart money in real-time",
    Icon: Radar,
    accent: Colors.cyan,
    description: "Watch top trader wallets and get pinged when whales accumulate or rotate.",
  },
  "new-pairs": {
    id: "new-pairs",
    name: "New Pairs",
    tagline: "Fresh launches stream",
    Icon: Rocket,
    accent: Colors.mint,
    description: "Live stream of every new Solana pair. Filter by liquidity, age, and rug score.",
  },
  "ai-analyst": {
    id: "ai-analyst",
    name: "AI Analyst",
    tagline: "Gemini deep dive on any token",
    Icon: Brain,
    accent: Colors.cyan,
    description: "Ask anything: chart patterns, whale flow, narrative fit. Powered by Gemini.",
  },
  trending: {
    id: "trending",
    name: "Trending Hub",
    tagline: "What's pumping right now",
    Icon: Flame,
    accent: Colors.orange,
    description: "Top-moving Solana tokens across timeframes, ranked by volume, volatility, and social heat.",
  },
  alerts: {
    id: "alerts",
    name: "Smart Alerts",
    tagline: "Price + on-chain triggers",
    Icon: Bell,
    accent: Colors.mint,
    description: "Set price-cross, volume-spike, and whale-buy alerts on any Solana token.",
  },
  "voice-lobby": {
    id: "voice-lobby",
    name: "Voice Lobbies",
    tagline: "Trade with your crew live",
    Icon: Mic,
    accent: Colors.rose,
    description: "Voice rooms with shared charts and live watchlists. Join your crew, share alpha, run plays.",
  },
  watchlist: {
    id: "watchlist",
    name: "Watchlists",
    tagline: "Track your shortlist",
    Icon: Eye,
    accent: Colors.mint,
    description: "Curate the tokens you care about. Sync across devices with live prices and changes.",
  },
  "chart-share": {
    id: "chart-share",
    name: "Chart Share",
    tagline: "Drop charts into chat",
    Icon: ChartLine,
    accent: Colors.cyan,
    description: "Snapshot any chart with annotations and share into voice lobbies or DMs.",
  },
  "copy-trade": {
    id: "copy-trade",
    name: "Copy Trade",
    tagline: "Mirror top wallets",
    Icon: Users,
    accent: Colors.orange,
    description: "Pick a top performing wallet, set risk, and mirror every trade automatically.",
  },
  honeypot: {
    id: "honeypot",
    name: "Honeypot Check",
    tagline: "Buy/sell tax + lock detect",
    Icon: AlertTriangle,
    accent: Colors.rose,
    description: "Simulate a buy and sell to detect honeypots, transfer taxes, and trading restrictions.",
  },
  "holder-scan": {
    id: "holder-scan",
    name: "Holder X-Ray",
    tagline: "Cluster + insider mapping",
    Icon: Scan,
    accent: Colors.cyan,
    description: "Map insider clusters, dev wallets, and bundled buys. Spot the real distribution.",
  },
  "alpha-bot": {
    id: "alpha-bot",
    name: "Alpha Bot",
    tagline: "Telegram-style alpha feed",
    Icon: Bot,
    accent: Colors.mint,
    description: "AI-curated alpha from across X, Telegram and on-chain — the signal, not the noise.",
  },
  "candle-scanner": {
    id: "candle-scanner",
    name: "Candle Scanner",
    tagline: "Pattern + breakout finder",
    Icon: ChartCandlestick,
    accent: Colors.orange,
    description: "Scan thousands of pairs for breakouts, reversals, and high-conviction patterns.",
  },
};

export default function ToolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const meta = id ? META[id] : null;

  if (!meta) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <View style={styles.notFound}>
            <Text style={styles.notFoundTitle}>Tool not found</Text>
            <Pressable onPress={() => router.back()} style={styles.backSolo}>
              <Text style={styles.backSoloText}>Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root} testID={`tool-screen-${meta.id}`}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ToolHeader meta={meta} onBack={() => router.back()} />
          <ToolBody meta={meta} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ToolHeader({ meta, onBack }: { meta: ToolMeta; onBack: () => void }) {
  return (
    <View>
      <View style={styles.headerBar}>
        <Pressable onPress={onBack} style={styles.iconBtn} hitSlop={8} testID="tool-back">
          <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>SOL TOOLS · TOOL</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.heroCard}>
        <LinearGradient
          colors={[`${meta.accent}33`, `${meta.accent}05`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGrad}
        >
          <View style={[styles.heroIcon, { borderColor: `${meta.accent}55` }]}>
            <meta.Icon color={meta.accent} size={26} strokeWidth={2.4} />
          </View>
          <Text style={styles.heroTitle}>{meta.name}</Text>
          <Text style={[styles.heroTag, { color: meta.accent }]}>{meta.tagline}</Text>
          <Text style={styles.heroDesc}>{meta.description}</Text>
          <View style={styles.heroLive}>
            <View style={[styles.heroLiveDot, { backgroundColor: meta.accent }]} />
            <Text style={[styles.heroLiveText, { color: meta.accent }]}>LIVE</Text>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

function ToolBody({ meta }: { meta: ToolMeta }) {
  switch (meta.id) {
    case "wallet-tracker":
      return <WalletTrackerTool accent={meta.accent} />;
    case "rug-scanner":
    case "honeypot":
    case "holder-scan":
      return <ContractScanTool accent={meta.accent} kind={meta.id} />;
    case "ai-analyst":
      return <AiAnalystTool accent={meta.accent} />;
    case "alerts":
      return <AlertsTool accent={meta.accent} />;
    case "watchlist":
      return <WatchlistTool accent={meta.accent} />;
    case "voice-lobby":
      return <VoiceLobbyTool accent={meta.accent} />;
    case "lp-sniper":
      return <SniperTool accent={meta.accent} />;
    case "whale-radar":
      return <WhaleRadarTool accent={meta.accent} />;
    case "new-pairs":
    case "trending":
      return <TokenStreamTool accent={meta.accent} kind={meta.id} />;
    case "copy-trade":
      return <CopyTradeTool accent={meta.accent} />;
    case "alpha-bot":
      return <AlphaBotTool accent={meta.accent} />;
    case "candle-scanner":
    case "chart-share":
      return <ChartTool accent={meta.accent} kind={meta.id} />;
    default:
      return <ComingSoonTool accent={meta.accent} />;
  }
}

function SectionHead({ title, accent, action }: { title: string; accent: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionDot, { backgroundColor: accent }]} />
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <View style={styles.sectionAction}>{action}</View> : null}
    </View>
  );
}

function WalletTrackerTool({ accent }: { accent: string }) {
  const { wallets, addWallet, removeWallet } = useApp();
  const [address, setAddress] = useState<string>("");
  const [label, setLabel] = useState<string>("");

  const onAdd = useCallback(async () => {
    const a = address.trim();
    if (a.length < 32) {
      Alert.alert("Invalid address", "Enter a valid Solana wallet address.");
      return;
    }
    await addWallet({ address: a, label: label.trim() });
    setAddress("");
    setLabel("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [address, label, addWallet]);

  return (
    <View>
      <SectionHead title="Track a wallet" accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Address</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="So11111111111111111111111111111111111111112"
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          testID="wallet-input-address"
        />
        <Text style={styles.label}>Label (optional)</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="My main"
          placeholderTextColor={Colors.muted}
          style={styles.input}
          testID="wallet-input-label"
        />
        <Pressable onPress={onAdd} style={[styles.primaryBtn, { backgroundColor: accent }]} testID="wallet-add">
          <Plus color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.primaryBtnText}>Track wallet</Text>
        </Pressable>
      </View>

      <SectionHead title={`Tracked · ${wallets.length}`} accent={accent} />
      {wallets.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Wallet}
          title="No wallets tracked"
          body="Add any Solana wallet to monitor PnL, holdings and live transactions."
        />
      ) : (
        <View style={styles.list}>
          {wallets.map((w) => (
            <View key={w.id} style={styles.rowCard} testID={`tracked-wallet-${w.id}`}>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Wallet color={accent} size={15} strokeWidth={2.6} />
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle}>{w.label}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {w.address.slice(0, 8)}…{w.address.slice(-6)}
                </Text>
              </View>
              <View style={styles.rowMetric}>
                <Text style={styles.rowMetricLabel}>PNL</Text>
                <Text style={styles.rowMetricValue}>—</Text>
              </View>
              <Pressable onPress={() => removeWallet(w.id)} style={styles.rowAction} hitSlop={6}>
                <X color={Colors.muted} size={14} strokeWidth={2.6} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ContractScanTool({ accent, kind }: { accent: string; kind: string }) {
  const [contract, setContract] = useState<string>("");
  const [scanning, setScanning] = useState<boolean>(false);
  const [result, setResult] = useState<null | { score: number; flags: string[] }>(null);

  const onScan = useCallback(async () => {
    if (contract.trim().length < 32) {
      Alert.alert("Invalid contract", "Paste a Solana token contract address.");
      return;
    }
    setScanning(true);
    setResult(null);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => {
      setScanning(false);
      setResult(null);
      Alert.alert(
        "Backend offline",
        "Connect a scanner provider to enable real-time contract analysis. The UI is wired and ready.",
      );
    }, 900);
  }, [contract]);

  const titleByKind: Record<string, string> = {
    "rug-scanner": "AI Rug Scan",
    honeypot: "Honeypot Simulation",
    "holder-scan": "Holder X-Ray",
  };

  return (
    <View>
      <SectionHead title={titleByKind[kind] ?? "Scan"} accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Contract address</Text>
        <TextInput
          value={contract}
          onChangeText={setContract}
          placeholder="Paste Solana contract address..."
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          testID="scan-input"
        />
        <Pressable
          onPress={onScan}
          style={[styles.primaryBtn, { backgroundColor: accent }, scanning && { opacity: 0.6 }]}
          disabled={scanning}
          testID="scan-run"
        >
          {scanning ? (
            <Loader2 color={Colors.ink} size={15} strokeWidth={3} />
          ) : (
            <Scan color={Colors.ink} size={15} strokeWidth={3} />
          )}
          <Text style={styles.primaryBtnText}>{scanning ? "Scanning..." : "Run scan"}</Text>
        </Pressable>
      </View>

      <SectionHead title="What we check" accent={accent} />
      <View style={styles.checksList}>
        {[
          { label: "Mint authority renounced", Icon: Shield },
          { label: "LP locked / burned", Icon: CheckCircle2 },
          { label: "Top 10 holder concentration", Icon: Users },
          { label: "Tax & blacklist functions", Icon: AlertTriangle },
          { label: "Insider clusters", Icon: Scan },
          { label: "Buy/sell simulation", Icon: Activity },
        ].map((c) => (
          <View key={c.label} style={styles.checkRow}>
            <View style={[styles.checkIcon, { backgroundColor: `${accent}1A` }]}>
              <c.Icon color={accent} size={12} strokeWidth={2.6} />
            </View>
            <Text style={styles.checkText}>{c.label}</Text>
          </View>
        ))}
      </View>

      {result == null ? null : (
        <View style={styles.resultCard}>
          <Text style={styles.resultScore}>{result.score}/100</Text>
        </View>
      )}
    </View>
  );
}

function AiAnalystTool({ accent }: { accent: string }) {
  type Msg = { id: string; role: "user" | "assistant"; text: string };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState<string>("");
  const [thinking, setThinking] = useState<boolean>(false);

  const onSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const u: Msg = { id: `u${Date.now()}`, role: "user", text };
    setMessages((m) => [...m, u]);
    setInput("");
    setThinking(true);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => {
      const a: Msg = {
        id: `a${Date.now()}`,
        role: "assistant",
        text: "Connect an AI provider to enable live analysis. Your prompt is queued.",
      };
      setMessages((m) => [...m, a]);
      setThinking(false);
    }, 800);
  }, [input]);

  const SUGGESTIONS = [
    "Analyze $WIF chart structure",
    "Top whale rotations last 24h",
    "Is this contract risky?",
    "Find breakouts on Solana",
  ];

  return (
    <View>
      <SectionHead title="Ask the AI Analyst" accent={accent} />
      <View style={styles.chatBox}>
        {messages.length === 0 ? (
          <View style={styles.chatEmpty}>
            <View style={[styles.chatEmptyIcon, { backgroundColor: `${accent}1A` }]}>
              <Brain color={accent} size={22} strokeWidth={2.4} />
            </View>
            <Text style={styles.chatEmptyText}>Ask anything about Solana tokens, wallets, or charts.</Text>
          </View>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={[
                styles.bubble,
                m.role === "user" ? styles.bubbleUser : styles.bubbleAi,
                m.role === "user" && { backgroundColor: `${accent}26` },
              ]}
            >
              <Text style={styles.bubbleText}>{m.text}</Text>
            </View>
          ))
        )}
        {thinking ? (
          <View style={[styles.bubble, styles.bubbleAi]}>
            <Text style={styles.bubbleText}>Thinking...</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.suggestionsRow}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} onPress={() => setInput(s)} style={styles.suggestionChip}>
            <Sparkles color={accent} size={11} strokeWidth={2.6} />
            <Text style={styles.suggestionText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.chatInputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask the AI..."
          placeholderTextColor={Colors.muted}
          style={styles.chatInput}
          multiline
        />
        <Pressable
          onPress={onSend}
          style={[styles.sendBtn, { backgroundColor: accent }]}
          disabled={!input.trim()}
          testID="ai-send"
        >
          <Send color={Colors.ink} size={14} strokeWidth={3} />
        </Pressable>
      </View>
    </View>
  );
}

function AlertsTool({ accent }: { accent: string }) {
  const { alerts, addAlert, toggleAlert, removeAlert } = useApp();
  const [ticker, setTicker] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [type, setType] = useState<AlertItem["type"]>("price-above");

  const onAdd = useCallback(async () => {
    const t = ticker.trim().toUpperCase();
    const v = parseFloat(value);
    if (!t) {
      Alert.alert("Missing ticker", "Enter a token ticker.");
      return;
    }
    if (Number.isNaN(v) || v <= 0) {
      Alert.alert("Invalid value", "Enter a numeric trigger value.");
      return;
    }
    await addAlert({ ticker: t, type, value: v });
    setTicker("");
    setValue("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [ticker, value, type, addAlert]);

  const TYPES: { key: AlertItem["type"]; label: string; Icon: LucideIcon }[] = [
    { key: "price-above", label: "Price ≥", Icon: ArrowUp },
    { key: "price-below", label: "Price ≤", Icon: ArrowDown },
    { key: "volume-spike", label: "Volume", Icon: Waves },
    { key: "whale-buy", label: "Whale", Icon: Users },
  ];

  return (
    <View>
      <SectionHead title="New alert" accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Ticker</Text>
        <TextInput
          value={ticker}
          onChangeText={(v) => setTicker(v.replace("$", "").toUpperCase())}
          placeholder="WIF"
          placeholderTextColor={Colors.muted}
          autoCapitalize="characters"
          style={styles.input}
          testID="alert-ticker"
        />
        <Text style={styles.label}>Trigger</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => {
            const active = t.key === type;
            return (
              <Pressable
                key={t.key}
                onPress={() => setType(t.key)}
                style={[styles.typeChip, active && { backgroundColor: accent, borderColor: accent }]}
                testID={`alert-type-${t.key}`}
              >
                <t.Icon color={active ? Colors.ink : Colors.text} size={12} strokeWidth={2.6} />
                <Text style={[styles.typeText, active && { color: Colors.ink }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.label}>Value</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="e.g. 2.50"
          placeholderTextColor={Colors.muted}
          keyboardType="decimal-pad"
          style={styles.input}
          testID="alert-value"
        />
        <Pressable onPress={onAdd} style={[styles.primaryBtn, { backgroundColor: accent }]} testID="alert-create">
          <BellPlus color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.primaryBtnText}>Create alert</Text>
        </Pressable>
      </View>

      <SectionHead title={`Active · ${alerts.length}`} accent={accent} />
      {alerts.length === 0 ? (
        <EmptyState accent={accent} Icon={Bell} title="No alerts yet" body="Set price, volume or whale-buy triggers." />
      ) : (
        <View style={styles.list}>
          {alerts.map((a) => (
            <View key={a.id} style={styles.rowCard}>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Bell color={accent} size={14} strokeWidth={2.6} />
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle}>${a.ticker}</Text>
                <Text style={styles.rowSub}>
                  {a.type === "price-above" && `Price ≥ ${a.value}`}
                  {a.type === "price-below" && `Price ≤ ${a.value}`}
                  {a.type === "volume-spike" && `Volume spike ${a.value}x`}
                  {a.type === "whale-buy" && `Whale buy ≥ $${a.value}`}
                </Text>
              </View>
              <Switch
                value={a.enabled}
                onValueChange={() => toggleAlert(a.id)}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: accent }}
                thumbColor={a.enabled ? Colors.ink : Colors.muted}
              />
              <Pressable onPress={() => removeAlert(a.id)} style={styles.rowAction} hitSlop={6}>
                <X color={Colors.muted} size={14} strokeWidth={2.6} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function WatchlistTool({ accent }: { accent: string }) {
  const { watchlist, addWatch, removeWatch } = useApp();
  const [ticker, setTicker] = useState<string>("");
  const [contract, setContract] = useState<string>("");

  const onAdd = useCallback(async () => {
    if (!ticker.trim() || contract.trim().length < 8) {
      Alert.alert("Missing fields", "Enter a ticker and contract.");
      return;
    }
    await addWatch({ ticker: ticker.trim(), contract: contract.trim() });
    setTicker("");
    setContract("");
    Haptics.selectionAsync().catch(() => {});
  }, [ticker, contract, addWatch]);

  return (
    <View>
      <SectionHead title="Add to watchlist" accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Ticker</Text>
        <TextInput
          value={ticker}
          onChangeText={(v) => setTicker(v.replace("$", "").toUpperCase())}
          placeholder="WIF"
          placeholderTextColor={Colors.muted}
          autoCapitalize="characters"
          style={styles.input}
        />
        <Text style={styles.label}>Contract</Text>
        <TextInput
          value={contract}
          onChangeText={setContract}
          placeholder="Solana contract address"
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable onPress={onAdd} style={[styles.primaryBtn, { backgroundColor: accent }]}>
          <Plus color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.primaryBtnText}>Add</Text>
        </Pressable>
      </View>

      <SectionHead title={`Watching · ${watchlist.length}`} accent={accent} />
      {watchlist.length === 0 ? (
        <EmptyState accent={accent} Icon={Eye} title="No watched tokens" body="Build your shortlist and track changes." />
      ) : (
        <View style={styles.list}>
          {watchlist.map((w) => (
            <View key={w.id} style={styles.rowCard}>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Text style={[styles.rowIconText, { color: accent }]}>
                  {w.ticker.slice(0, 2)}
                </Text>
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle}>${w.ticker}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {w.contract.slice(0, 8)}…{w.contract.slice(-6)}
                </Text>
              </View>
              <Pressable onPress={() => removeWatch(w.id)} style={styles.rowAction} hitSlop={6}>
                <X color={Colors.muted} size={14} strokeWidth={2.6} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function VoiceLobbyTool({ accent }: { accent: string }) {
  const [muted, setMuted] = useState<boolean>(true);
  const [inLobby, setInLobby] = useState<boolean>(false);
  const [lobbyName, setLobbyName] = useState<string>("");

  const onJoin = useCallback(() => {
    if (!lobbyName.trim()) {
      Alert.alert("Lobby name", "Pick a lobby to join.");
      return;
    }
    setInLobby(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [lobbyName]);

  return (
    <View>
      {inLobby ? (
        <View style={[styles.lobbyCard, { borderColor: `${accent}55` }]}>
          <View style={styles.lobbyHead}>
            <View style={[styles.lobbyAvatar, { backgroundColor: accent }]}>
              <Mic color={Colors.ink} size={16} strokeWidth={3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lobbyTitle}>{lobbyName}</Text>
              <Text style={styles.lobbySub}>Connected · 1 in room</Text>
            </View>
            <View style={styles.lobbyLive}>
              <View style={[styles.lobbyLiveDot, { backgroundColor: accent }]} />
              <Text style={[styles.lobbyLiveText, { color: accent }]}>LIVE</Text>
            </View>
          </View>

          <View style={styles.lobbyControls}>
            <Pressable
              onPress={() => setMuted((m) => !m)}
              style={[styles.lobbyCtrl, !muted && { backgroundColor: accent }]}
            >
              {muted ? (
                <MicOff color={Colors.text} size={16} strokeWidth={2.6} />
              ) : (
                <Mic color={Colors.ink} size={16} strokeWidth={2.6} />
              )}
              <Text style={[styles.lobbyCtrlText, !muted && { color: Colors.ink }]}>
                {muted ? "Unmute" : "Live"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setInLobby(false)}
              style={[styles.lobbyCtrl, { backgroundColor: "rgba(255,93,143,0.16)" }]}
            >
              <X color={Colors.rose} size={16} strokeWidth={2.6} />
              <Text style={[styles.lobbyCtrlText, { color: Colors.rose }]}>Leave</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <SectionHead title="Join a lobby" accent={accent} />
          <View style={styles.formCard}>
            <Text style={styles.label}>Lobby name</Text>
            <TextInput
              value={lobbyName}
              onChangeText={setLobbyName}
              placeholder="alpha-degens"
              placeholderTextColor={Colors.muted}
              autoCapitalize="none"
              style={styles.input}
            />
            <Pressable onPress={onJoin} style={[styles.primaryBtn, { backgroundColor: accent }]}>
              <Mic color={Colors.ink} size={15} strokeWidth={3} />
              <Text style={styles.primaryBtnText}>Join lobby</Text>
            </Pressable>
          </View>
          <SectionHead title="Public rooms" accent={accent} />
          <EmptyState
            accent={accent}
            Icon={Users}
            title="No lobbies live yet"
            body="Voice rooms come online when the backend connects. Create your own and invite your crew."
          />
        </>
      )}
    </View>
  );
}

function SniperTool({ accent }: { accent: string }) {
  const [armed, setArmed] = useState<boolean>(false);
  const [budget, setBudget] = useState<string>("0.5");
  const [slippage, setSlippage] = useState<string>("15");
  const [minLiq, setMinLiq] = useState<string>("5");

  return (
    <View>
      <SectionHead title="Sniper config" accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Budget per snipe (SOL)</Text>
        <TextInput
          value={budget}
          onChangeText={setBudget}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={Colors.muted}
        />
        <Text style={styles.label}>Slippage %</Text>
        <TextInput
          value={slippage}
          onChangeText={setSlippage}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={Colors.muted}
        />
        <Text style={styles.label}>Min LP (SOL)</Text>
        <TextInput
          value={minLiq}
          onChangeText={setMinLiq}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={Colors.muted}
        />
        <Pressable
          onPress={() => {
            setArmed((v) => !v);
            Haptics.notificationAsync(
              armed ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
            ).catch(() => {});
          }}
          style={[styles.primaryBtn, { backgroundColor: armed ? Colors.rose : accent }]}
        >
          <Target color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.primaryBtnText}>{armed ? "Disarm sniper" : "Arm sniper"}</Text>
        </Pressable>
      </View>

      <SectionHead title="Recent snipes" accent={accent} />
      <EmptyState
        accent={accent}
        Icon={Crosshair}
        title="No snipes yet"
        body="Once armed, executions appear here in real-time."
      />
    </View>
  );
}

function WhaleRadarTool({ accent }: { accent: string }) {
  return (
    <View>
      <SectionHead title="Smart money flow" accent={accent} />
      <EmptyState
        accent={accent}
        Icon={Radar}
        title="Radar idle"
        body="Connect a whale tracker provider to stream big buys, rotations, and accumulation in real-time."
      />
      <SectionHead title="Filter presets" accent={accent} />
      <View style={styles.list}>
        {["Buys ≥ $10k", "Top 100 wallets", "Smart money picks", "Same wallet 3+ buys"].map((p) => (
          <Pressable key={p} style={styles.rowCard}>
            <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
              <Waves color={accent} size={14} strokeWidth={2.6} />
            </View>
            <Text style={[styles.rowTitle, { flex: 1 }]}>{p}</Text>
            <ChevronRight color={Colors.muted} size={14} strokeWidth={2.4} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TokenStreamTool({ accent, kind }: { accent: string; kind: string }) {
  const { listings } = useLaunchpad();
  const items = useMemo(() => {
    const sorted = [...listings];
    if (kind === "new-pairs") sorted.sort((a, b) => b.createdAt - a.createdAt);
    if (kind === "trending") sorted.sort((a, b) => b.upvotes - a.upvotes);
    return sorted.slice(0, 30);
  }, [listings, kind]);

  return (
    <View>
      <SectionHead title={kind === "new-pairs" ? "Live stream" : "Trending now"} accent={accent} />
      {items.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Zap}
          title={kind === "new-pairs" ? "No new pairs yet" : "No trending tokens"}
          body="Once tokens are listed on the launch pad they'll surface here in real-time."
        />
      ) : (
        <View style={styles.list}>
          {items.map((t, i) => (
            <View key={t.id} style={styles.rowCard}>
              <Text style={[styles.rowRank, { color: accent }]}>{i + 1}</Text>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Text style={[styles.rowIconText, { color: accent }]}>
                  {t.ticker.replace("$", "").slice(0, 2)}
                </Text>
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle}>{t.name}</Text>
                <Text style={styles.rowSub}>${t.ticker.replace("$", "")} · {t.venue}</Text>
              </View>
              {t.change24hPct != null ? (
                <Text style={[styles.rowChange, { color: t.change24hPct >= 0 ? Colors.mint : Colors.rose }]}>
                  {t.change24hPct >= 0 ? "+" : ""}
                  {t.change24hPct.toFixed(1)}%
                </Text>
              ) : (
                <Text style={styles.rowChangeMuted}>—</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function CopyTradeTool({ accent }: { accent: string }) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [riskPct, setRiskPct] = useState<string>("10");
  return (
    <View>
      <SectionHead title="Copy trader" accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Wallet to mirror</Text>
        <TextInput
          placeholder="Top trader address"
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          style={styles.input}
        />
        <Text style={styles.label}>Risk % per trade</Text>
        <TextInput
          value={riskPct}
          onChangeText={setRiskPct}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={Colors.muted}
        />
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Enable copy trade</Text>
            <Text style={styles.toggleSub}>Mirror every buy / sell</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: "rgba(255,255,255,0.1)", true: accent }}
            thumbColor={enabled ? Colors.ink : Colors.muted}
          />
        </View>
      </View>
      <SectionHead title="Top performing wallets" accent={accent} />
      <EmptyState accent={accent} Icon={Users} title="Backend offline" body="Live wallet leaderboard streams here once the data provider connects." />
    </View>
  );
}

function AlphaBotTool({ accent }: { accent: string }) {
  return (
    <View>
      <SectionHead title="Alpha feed" accent={accent} />
      <EmptyState
        accent={accent}
        Icon={Bot}
        title="No alpha yet"
        body="AI-curated alpha from X, Telegram and on-chain will stream here."
      />
      <SectionHead title="Sources" accent={accent} />
      <View style={styles.list}>
        {[
          { label: "X / Twitter", Icon: Sparkles },
          { label: "Telegram channels", Icon: Send },
          { label: "On-chain whales", Icon: Waves },
        ].map((s) => (
          <View key={s.label} style={styles.rowCard}>
            <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
              <s.Icon color={accent} size={14} strokeWidth={2.6} />
            </View>
            <Text style={[styles.rowTitle, { flex: 1 }]}>{s.label}</Text>
            <View style={styles.statusDotMuted} />
          </View>
        ))}
      </View>
    </View>
  );
}

function ChartTool({ accent, kind }: { accent: string; kind: string }) {
  return (
    <View>
      <SectionHead title={kind === "candle-scanner" ? "Pattern scanner" : "Chart sharing"} accent={accent} />
      <View style={styles.chartPlaceholder}>
        <ChartCandlestick color={accent} size={32} strokeWidth={2.4} />
        <Text style={styles.chartPlaceholderTitle}>Live charts pending data feed</Text>
        <Text style={styles.chartPlaceholderBody}>
          The UI is fully wired. Hook up Birdeye, GeckoTerminal or your preferred provider to power charts.
        </Text>
      </View>
      <View style={styles.list}>
        {["Bullish breakout", "Bull flag", "Cup & handle", "Reversal hammer"].map((p) => (
          <Pressable key={p} style={styles.rowCard}>
            <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
              <TrendingUp color={accent} size={14} strokeWidth={2.6} />
            </View>
            <Text style={[styles.rowTitle, { flex: 1 }]}>{p}</Text>
            <ChevronRight color={Colors.muted} size={14} strokeWidth={2.4} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ComingSoonTool({ accent }: { accent: string }) {
  return (
    <EmptyState
      accent={accent}
      Icon={Sparkles}
      title="Coming soon"
      body="This tool is on the roadmap. Vote in the SolTools Discord to bump it up."
    />
  );
}

function EmptyState({
  accent,
  Icon,
  title,
  body,
}: {
  accent: string;
  Icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <View style={[styles.empty, { borderColor: `${accent}33`, backgroundColor: `${accent}08` }]}>
      <View style={[styles.emptyIcon, { backgroundColor: `${accent}1A` }]}>
        <Icon color={accent} size={22} strokeWidth={2.4} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingBottom: 64 },

  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerEyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },

  heroCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  heroGrad: { padding: 18 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.6, marginTop: 14 },
  heroTag: { fontSize: 12, fontWeight: "900", letterSpacing: 0.6, marginTop: 4 },
  heroDesc: { color: Colors.muted, fontSize: 13, fontWeight: "600", lineHeight: 19, marginTop: 10 },
  heroLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  heroLiveDot: { width: 6, height: 6, borderRadius: 3 },
  heroLiveText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 18,
  },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
  sectionAction: { marginLeft: "auto" },

  formCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  label: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginTop: 8 },
  input: {
    backgroundColor: Colors.cardSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 14,
  },
  primaryBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },

  list: { marginHorizontal: 16, gap: 8 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowIconText: { fontSize: 11, fontWeight: "900" },
  rowMid: { flex: 1, minWidth: 0 },
  rowTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  rowSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  rowMetric: { alignItems: "flex-end" },
  rowMetricLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  rowMetricValue: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  rowAction: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowRank: { fontSize: 11, fontWeight: "900", width: 16, textAlign: "center" },
  rowChange: { fontSize: 12, fontWeight: "900" },
  rowChangeMuted: { color: Colors.muted, fontSize: 12, fontWeight: "900" },

  empty: {
    marginHorizontal: 16,
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
  },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", marginTop: 12 },
  emptyBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
  },

  checksList: { marginHorizontal: 16, gap: 6 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  checkIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  checkText: { color: Colors.text, fontSize: 13, fontWeight: "700" },

  resultCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 18,
    borderRadius: 16,
    backgroundColor: Colors.card,
    alignItems: "center",
  },
  resultScore: { color: Colors.text, fontSize: 32, fontWeight: "900" },

  chatBox: {
    marginHorizontal: 16,
    minHeight: 180,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 8,
  },
  chatEmpty: { alignItems: "center", paddingVertical: 28, gap: 12 },
  chatEmptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  chatEmptyText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 30,
    lineHeight: 17,
  },
  bubble: { padding: 11, borderRadius: 14, maxWidth: "85%" },
  bubbleAi: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    alignSelf: "flex-start",
  },
  bubbleUser: { alignSelf: "flex-end" },
  bubbleText: { color: Colors.text, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  suggestionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginHorizontal: 16, marginTop: 10 },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  suggestionText: { color: Colors.text, fontSize: 11, fontWeight: "800" },

  chatInputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 8,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chatInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    maxHeight: 100,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  typeRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  typeText: { color: Colors.text, fontSize: 11, fontWeight: "800" },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    marginTop: 6,
  },
  toggleTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  toggleSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  lobbyCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 18,
    borderRadius: 22,
    backgroundColor: Colors.card,
    borderWidth: 1,
  },
  lobbyHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  lobbyAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lobbyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  lobbySub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  lobbyLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  lobbyLiveDot: { width: 6, height: 6, borderRadius: 3 },
  lobbyLiveText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  lobbyControls: { flexDirection: "row", gap: 8, marginTop: 16 },
  lobbyCtrl: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  lobbyCtrlText: { color: Colors.text, fontSize: 12, fontWeight: "900" },

  chartPlaceholder: {
    marginHorizontal: 16,
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    marginBottom: 14,
  },
  chartPlaceholderTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 10 },
  chartPlaceholderBody: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
  },

  statusDotMuted: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.muted },

  notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  notFoundTitle: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  backSolo: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.mint,
  },
  backSoloText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
