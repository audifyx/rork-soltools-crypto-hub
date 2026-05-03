import * as Clipboard from "expo-clipboard";
import { useQueries } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellOff,
  BellPlus,
  Bot,
  Brain,
  Briefcase,
  Bug,
  ChartCandlestick,
  ChartLine,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardPaste,
  Clock,
  Coins,
  Copy,
  Crosshair,
  Droplets,
  Eye,
  Filter,
  Fingerprint,
  Flame,
  Gauge,
  Gift,
  Globe,
  Hash,
  Layers,
  LineChart,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Minus,
  Network,
  PieChart,
  Plus,
  Power,
  Radar,
  Repeat,
  Rocket,
  Route,
  Scale,
  Scan,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  UserPlus,
  UserSearch,
  Volume2,
  Wallet,
  Waves,
  Wrench,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
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

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { getTokenOverview, getTokenSecurity, type TokenOverview } from "@/lib/api/birdeye";
import { getLiveKitToken } from "@/lib/api/livekit";
import { useTrendingTokens } from "@/lib/api/market";
import {
  fetchWalletBalance,
  fetchWalletPortfolio,
  isValidSolanaAddress,
  type WalletBalance,
  type WalletPortfolio,
} from "@/lib/api/wallet";
import { AlertItem, useApp } from "@/providers/app-provider";
import { useAuth } from "@/providers/auth-provider";
import {
  SOLTOOLS_PLATFORM_MODULES,
  SOLTOOLS_TRADING_DISABLED_MESSAGE,
  type SolToolsModuleCategory,
  type SolToolsModuleSpec,
} from "@/lib/soltools-platform";
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

const TRADING_GATED_TOOLS = new Set<string>([
  "copy-trade",
  ...SOLTOOLS_PLATFORM_MODULES.filter((module) => module.status === "gated").map((module) => module.id),
]);

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
  "whale-radar": {
    id: "whale-radar",
    name: "Whale Radar",
    tagline: "Smart money in real-time",
    Icon: Radar,
    accent: Colors.cyan,
    description: "Watch top trader wallets and get pinged when whales accumulate or rotate.",
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
    tagline: "Gated until App Store launch",
    Icon: Users,
    accent: Colors.orange,
    description: SOLTOOLS_TRADING_DISABLED_MESSAGE,
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
  // Trading
  "token-sniper": { id: "token-sniper", name: "Token Sniper", tagline: "Detect new launches instantly", Icon: Crosshair, accent: Colors.mint,
    description: "Live stream of fresh mints across Pump.fun, Raydium, Meteora and Orca with instant-snipe filters." },
  "liquidity-sniper": { id: "liquidity-sniper", name: "Liquidity Sniper", tagline: "Snipe new liquidity pools", Icon: Droplets, accent: Colors.cyan,
    description: "Watch new LP creations live. Filter by quote token, min liquidity and lock state — alert on launch." },
  "jupiter-routes": { id: "jupiter-routes", name: "Jupiter Routes", tagline: "Track swap routes & slippage", Icon: Route, accent: Colors.orange,
    description: "Inspect Jupiter quote routes, hops, price impact and per-DEX split for any swap pair before you trade." },
  "profit-curve": { id: "profit-curve", name: "Profit Curve", tagline: "PnL curves over time", Icon: LineChart, accent: Colors.violet,
    description: "Plot any wallet's realized + unrealized PnL across days, weeks, months. Spot drawdowns and streaks." },
  "trading-style": { id: "trading-style", name: "Trading Style", tagline: "Classify trader patterns", Icon: Fingerprint, accent: Colors.mint,
    description: "AI labels wallets as scalper, sniper, swing, holder, farmer, or insider based on on-chain behavior." },
  "wallet-profiler": { id: "wallet-profiler", name: "Wallet Profiler", tagline: "Analyze wallet performance", Icon: Briefcase, accent: Colors.cyan,
    description: "Win rate, avg hold time, ROI, biggest wins, biggest rugs — a complete profile of any address." },
  // Token Intel
  "holder-analysis": { id: "holder-analysis", name: "Holder Analysis", tagline: "Deep dive into holders", Icon: Users, accent: Colors.cyan,
    description: "Cluster holders by entry, dev wallet, sniper, fresh wallet. See accumulators vs distributors." },
  "liquidity-scanner": { id: "liquidity-scanner", name: "Liquidity Scanner", tagline: "Pool depth at every size", Icon: Waves, accent: Colors.mint,
    description: "Real liquidity across every pool, slippage curves at any size, and risk on low-depth pools." },
  "token-metadata": { id: "token-metadata", name: "Token Metadata", tagline: "On-chain token data", Icon: Hash, accent: Colors.violet,
    description: "Mint authority, freeze authority, Metaplex metadata, decimals, supply, update authority." },
  "whale-concentration": { id: "whale-concentration", name: "Whale Concentration", tagline: "Top-holder share", Icon: PieChart, accent: Colors.orange,
    description: "Top 10/50/100 holder share, concentration index, whale rotation, distribution health score." },
  "wash-trading": { id: "wash-trading", name: "Wash Trading", tagline: "Detect wash patterns", Icon: Repeat, accent: Colors.rose,
    description: "Spot circular flows, repeat counterparties, inflated volume — find fake liquidity & pump rings." },
  "insider-detector": { id: "insider-detector", name: "Insider Detector", tagline: "Find insider patterns", Icon: UserSearch, accent: Colors.rose,
    description: "Detect bundled buys, dev clusters, sniper bots, pre-launch funding paths and insider wallets." },
  // DeFi & Yield
  "staking-calculator": { id: "staking-calculator", name: "Staking Calculator", tagline: "Project staking rewards", Icon: Scale, accent: Colors.mint,
    description: "Project SOL & SPL staking rewards across validators with APY, commission, fees, and compounding." },
  "impermanent-loss": { id: "impermanent-loss", name: "Impermanent Loss", tagline: "IL calculator", Icon: TrendingDown, accent: Colors.cyan,
    description: "Model IL on any LP pair with custom price moves. Compare HODL vs LP vs concentrated liquidity." },
  "lp-scanner": { id: "lp-scanner", name: "LP Scanner", tagline: "Scan LP positions", Icon: Layers, accent: Colors.violet,
    description: "Inspect any wallet's LP positions, current value, fees earned, and live APR across DEXs." },
  "program-monitor": { id: "program-monitor", name: "Program Monitor", tagline: "Watch DEX programs", Icon: Network, accent: Colors.cyan,
    description: "Watch any Solana program ID for instructions, calls, and unusual flow." },
  "fee-analyzer": { id: "fee-analyzer", name: "Fee Analyzer", tagline: "Analyze transaction fees", Icon: Gauge, accent: Colors.orange,
    description: "Break down priority fees, compute units, total SOL spent on fees per wallet, program, day." },
  "token-locks": { id: "token-locks", name: "Token Locks", tagline: "Track unlock schedules", Icon: Lock, accent: Colors.violet,
    description: "Team & LP unlocks across PinkLock, Streamflow, Bonfida — see what unlocks when in real time." },
  // Risk
  "rug-detector": { id: "rug-detector", name: "Rug Detector", tagline: "Analyze rug pull risk", Icon: ShieldAlert, accent: Colors.rose,
    description: "AI rug score from mint authority, LP lock, dev wallets, holder clustering, and rug history." },
  "risk-detector": { id: "risk-detector", name: "Risk Detector", tagline: "Comprehensive risk score", Icon: Shield, accent: Colors.rose,
    description: "Holistic risk dashboard: rug, honeypot, wash, insider, MEV, liquidity — one consolidated score." },
  "token-creator": { id: "token-creator", name: "Token Creator", tagline: "Track creator history", Icon: Target, accent: Colors.orange,
    description: "Every token a creator has launched, their average performance, rug rate, and active wallets." },
  "burn-watcher": { id: "burn-watcher", name: "Burn Watcher", tagline: "Monitor token burns", Icon: Flame, accent: Colors.orange,
    description: "Track token burns, dev burns, LP burns and supply changes in real-time across Solana." },
  "mev-tracker": { id: "mev-tracker", name: "MEV Tracker", tagline: "Detect MEV activity", Icon: Bug, accent: Colors.rose,
    description: "Spot sandwich attacks, JIT liquidity, frontrunning bots, MEV losses across any token or wallet." },
  "sol-depletion": { id: "sol-depletion", name: "SOL Depletion", tagline: "Low balance warnings", Icon: AlertTriangle, accent: Colors.orange,
    description: "Get pinged before any tracked wallet runs out of SOL for fees. Auto-track burn rate." },
  // Wallet Intel
  "wallet-age": { id: "wallet-age", name: "Wallet Age", tagline: "Age & activity timeline", Icon: Clock, accent: Colors.cyan,
    description: "First-seen, last-seen, total active days, dormancy gaps, full lifetime activity timeline." },
  "transfer-profiler": { id: "transfer-profiler", name: "Transfer Profiler", tagline: "Analyze transfer patterns", Icon: BarChart3, accent: Colors.violet,
    description: "Top counterparties, inflow/outflow heatmap, suspicious mixing, stablecoin vs SPL flow analysis." },
  "wallet-graph": { id: "wallet-graph", name: "Wallet Graph", tagline: "Wallet relationships", Icon: Network, accent: Colors.cyan,
    description: "Interactive graph of connected wallets, common funders, shared exchange deposit clusters." },
  "stake-tracker": { id: "stake-tracker", name: "Stake Tracker", tagline: "Track stake accounts", Icon: Coins, accent: Colors.mint,
    description: "All stake accounts, validators, rewards earned, and active/deactivating epochs for any wallet." },
  "airdrop-analyzer": { id: "airdrop-analyzer", name: "Airdrop Analyzer", tagline: "Check airdrop eligibility", Icon: Gift, accent: Colors.violet,
    description: "Run any wallet against active and upcoming Solana airdrops to estimate allocation and farmability." },
  "multi-wallet": { id: "multi-wallet", name: "Multi-Wallet", tagline: "Merge wallet views", Icon: Eye, accent: Colors.mint,
    description: "Combine multiple addresses into one consolidated portfolio — net worth, holdings, PnL, all merged." },
};

const CONTRACT_TOOLS = new Set<string>([
  "holder-analysis", "liquidity-scanner", "token-metadata", "token-metadata-inspector", "whale-concentration",
  "wash-trading", "insider-detector", "rug-detector", "risk-detector",
  "token-creator", "token-creator-tracker", "burn-watcher", "token-locks", "token-lock-monitor", "mev-tracker",
  "impermanent-loss", "jupiter-routes", "jupiter-route-tracker", "lp-position-scanner", "program-interaction-monitor",
]);
const WALLET_TOOLS = new Set<string>([
  "wallet-profiler", "profit-curve", "profit-curve-generator", "trading-style", "trading-style-classifier", "wallet-age", "wallet-age-calculator",
  "transfer-profiler", "wallet-graph", "wallet-relationship-graph", "stake-tracker", "stake-account-tracker", "airdrop-analyzer",
  "multi-wallet", "multi-wallet-merge", "sol-depletion", "sol-depletion-warning", "fee-analyzer", "lp-scanner", "lp-position-scanner",
  "portfolio-comparison", "trade-history",
]);
const STREAM_TOOLS = new Set<string>([
  "token-sniper", "token-sniper-v2", "liquidity-sniper", "program-monitor", "staking-calculator", "live-feed", "tokens-tracker",
]);

function moduleIcon(category: SolToolsModuleCategory): LucideIcon {
  if (category === "wallet" || category === "premium" || category === "credits") return Wallet;
  if (category === "token" || category === "basic") return Scan;
  if (category === "ai") return Brain;
  if (category === "advanced") return ShieldAlert;
  if (category === "voice") return Mic;
  if (category === "social") return Users;
  if (category === "notifications") return Bell;
  if (category === "launchpad") return Rocket;
  return Wrench;
}

function moduleAccent(category: SolToolsModuleCategory): string {
  if (category === "wallet" || category === "premium" || category === "credits") return Colors.orange;
  if (category === "token" || category === "basic") return Colors.cyan;
  if (category === "ai") return Colors.violet;
  if (category === "advanced") return Colors.rose;
  if (category === "voice" || category === "social" || category === "notifications") return Colors.silver;
  if (category === "launchpad") return Colors.mint;
  return Colors.goldBright;
}

function moduleToMeta(module: SolToolsModuleSpec): ToolMeta {
  return {
    id: module.id,
    name: module.name,
    tagline: module.status === "gated" ? "Paused until App Store launch" : `${module.surface} · ${module.status.toUpperCase()}`,
    Icon: moduleIcon(module.category),
    accent: moduleAccent(module.category),
    description: module.gatedReason ?? `${module.name} is connected through the existing SolTools API/data layer without changing API contracts.`,
  };
}

function getToolMeta(id?: string): ToolMeta | null {
  if (!id) return null;
  const direct = META[id];
  if (direct) return direct;
  const module = SOLTOOLS_PLATFORM_MODULES.find((item) => item.id === id || item.route?.endsWith(`/${id}`));
  return module ? moduleToMeta(module) : null;
}

export default function ToolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const meta = getToolMeta(id);

  if (!meta) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <View style={styles.notFound}>
            <Text style={styles.notFoundTitle}>Tool not found</Text>
            <Pressable onPress={() => navigateBack(router, "/(tabs)/tools")} style={styles.backSolo}>
              <Text style={styles.backSoloText}>Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root} testID={`tool-screen-${meta.id}`}>
      <AppBackground variant="tool" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ToolHeader meta={meta} onBack={() => navigateBack(router, "/(tabs)/tools")} />
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
            <Text style={[styles.heroLiveText, { color: meta.accent }]}>{TRADING_GATED_TOOLS.has(meta.id) ? "GATED" : "LIVE"}</Text>
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
    case "whale-radar":
      return <WhaleRadarTool accent={meta.accent} />;
    case "trending":
      return <TokenStreamTool accent={meta.accent} kind={meta.id} />;
    case "copy-trade":
      return <TradingGatedTool accent={meta.accent} />;
    case "alpha-bot":
      return <AlphaBotTool accent={meta.accent} />;
    case "candle-scanner":
    case "chart-share":
      return <ChartTool accent={meta.accent} kind={meta.id} />;
    default:
      if (TRADING_GATED_TOOLS.has(meta.id)) return <TradingGatedTool accent={meta.accent} />;
      if (CONTRACT_TOOLS.has(meta.id)) return <GenericInputTool meta={meta} kind="contract" />;
      if (WALLET_TOOLS.has(meta.id)) return <GenericInputTool meta={meta} kind="wallet" />;
      if (STREAM_TOOLS.has(meta.id)) return <GenericInputTool meta={meta} kind="stream" />;
      return <ConnectedModuleTool meta={meta} />;
  }
}

function SectionHead({
  title,
  accent,
  action,
}: {
  title: string;
  accent: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionDot, { backgroundColor: accent }]} />
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <View style={styles.sectionAction}>{action}</View> : null}
    </View>
  );
}

function StatTile({
  label,
  value,
  accent,
  Icon,
}: {
  label: string;
  value: string;
  accent: string;
  Icon: LucideIcon;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statTileIcon, { backgroundColor: `${accent}1A` }]}>
        <Icon color={accent} size={13} strokeWidth={2.6} />
      </View>
      <Text style={styles.statTileLabel}>{label}</Text>
      <Text style={styles.statTileValue}>{value}</Text>
    </View>
  );
}

function WalletTrackerTool({ accent }: { accent: string }) {
  const { wallets, addWallet, removeWallet } = useApp();
  const [address, setAddress] = useState<string>("");
  const [label, setLabel] = useState<string>("");

  const balanceQueries = useQueries({
    queries: wallets.map((w) => ({
      queryKey: ["wallet", "balance", w.address],
      queryFn: () => fetchWalletBalance(w.address),
      staleTime: 30_000,
      refetchInterval: 60_000,
      enabled: w.address.length >= 32,
    })),
  });

  const totalUsd = useMemo(() => {
    return balanceQueries.reduce((acc, q) => {
      const data = q.data as WalletBalance | undefined;
      return acc + (data?.usd ?? 0);
    }, 0);
  }, [balanceQueries]);

  const onPaste = useCallback(async () => {
    try {
      const txt = await Clipboard.getStringAsync();
      if (txt) {
        setAddress(txt.trim());
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[wallet] paste failed", e);
    }
  }, []);

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

  const onCopy = useCallback(async (addr: string) => {
    await Clipboard.setStringAsync(addr);
    Haptics.selectionAsync().catch(() => {});
    Alert.alert("Copied", "Address copied to clipboard.");
  }, []);

  return (
    <View>
      <View style={styles.statRow}>
        <StatTile label="Tracked" value={`${wallets.length}`} accent={accent} Icon={Wallet} />
        <StatTile
          label="Total USD"
          value={totalUsd > 0 ? `${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
          accent={accent}
          Icon={TrendingUp}
        />
        <StatTile label="Alerts" value="—" accent={accent} Icon={Bell} />
      </View>

      <SectionHead title="Track a wallet" accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Address</Text>
        <View style={styles.inputWithAction}>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="So111111…"
            placeholderTextColor={Colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, styles.inputFlex]}
            testID="wallet-input-address"
          />
          <Pressable onPress={onPaste} style={styles.iconAction} hitSlop={6}>
            <ClipboardPaste color={accent} size={15} strokeWidth={2.6} />
          </Pressable>
        </View>
        <Text style={styles.label}>Label (optional)</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="My main"
          placeholderTextColor={Colors.muted}
          style={styles.input}
          testID="wallet-input-label"
        />
        <Pressable
          onPress={onAdd}
          style={[styles.primaryBtn, { backgroundColor: accent }]}
          testID="wallet-add"
        >
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
          {wallets.map((w, idx) => {
            const bq = balanceQueries[idx];
            const bal = bq?.data as WalletBalance | undefined;
            const sol = bal?.sol ?? 0;
            const usd = bal?.usd ?? 0;
            const loading = bq?.isLoading ?? false;
            return (
              <View key={w.id} style={styles.rowCard} testID={`tracked-wallet-${w.id}`}>
                <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                  <Wallet color={accent} size={15} strokeWidth={2.6} />
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowTitle}>{w.label || "Wallet"}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {w.address.slice(0, 8)}…{w.address.slice(-6)}
                  </Text>
                  <Text style={[styles.rowSub, { color: accent, marginTop: 2 }]} numberOfLines={1}>
                    {loading
                      ? "Loading…"
                      : `${sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL · ${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  </Text>
                </View>
                <Pressable onPress={() => onCopy(w.address)} style={styles.rowAction} hitSlop={6}>
                  <Copy color={Colors.muted} size={13} strokeWidth={2.6} />
                </Pressable>
                <Pressable onPress={() => removeWallet(w.id)} style={styles.rowAction} hitSlop={6}>
                  <X color={Colors.muted} size={14} strokeWidth={2.6} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface ScanRecord {
  id: string;
  contract: string;
  at: number;
  status: "pending" | "ready";
}

type ScanResult = {
  riskScore: number;
  isHoneypot: boolean;
  buyTax?: number;
  sellTax?: number;
  lpLocked?: boolean;
  topHoldersPct?: number;
  symbol?: string;
  name?: string;
  price?: number;
  liquidity?: number;
  marketCap?: number;
  holders?: number;
};

function labelForCheck(label: string, r: ScanResult | null): string {
  if (!r) return "—";
  const l = label.toLowerCase();
  if (l.includes("buy") && l.includes("tax")) return r.buyTax != null ? `${r.buyTax}%` : "—";
  if (l.includes("sell") && l.includes("tax")) return r.sellTax != null ? `${r.sellTax}%` : "—";
  if (l.includes("lp")) return r.lpLocked == null ? "—" : r.lpLocked ? "LOCKED" : "OPEN";
  if (l.includes("top 10") || l.includes("top holder"))
    return r.topHoldersPct != null ? `${r.topHoldersPct.toFixed(1)}%` : "—";
  if (l.includes("buy/sell simulation") || l.includes("buy simulation") || l.includes("sell simulation"))
    return r.isHoneypot ? "FAIL" : "PASS";
  if (l.includes("holder")) return r.holders ? r.holders.toLocaleString() : "—";
  return "—";
}

function ContractScanTool({ accent, kind }: { accent: string; kind: string }) {
  const [contract, setContract] = useState<string>("");
  const [scanning, setScanning] = useState<boolean>(false);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [scanned, setScanned] = useState<boolean>(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const onPaste = useCallback(async () => {
    try {
      const txt = await Clipboard.getStringAsync();
      if (txt) setContract(txt.trim());
    } catch (e) {
      console.log("[scan] paste failed", e);
    }
  }, []);

  const onScan = useCallback(async () => {
    const c = contract.trim();
    if (c.length < 32) {
      Alert.alert("Invalid contract", "Paste a Solana token contract address.");
      return;
    }
    setScanning(true);
    setScanned(false);
    setScanError(null);
    Haptics.selectionAsync().catch(() => {});
    try {
      const [security, overview] = await Promise.all([
        getTokenSecurity(c).catch((e) => {
          console.log("[scan] security err", e);
          return null;
        }),
        getTokenOverview(c).catch((e) => {
          console.log("[scan] overview err", e);
          return null;
        }),
      ]);
      const merged: ScanResult = {
        riskScore: security?.riskScore ?? 0,
        isHoneypot: security?.isHoneypot ?? false,
        buyTax: security?.buyTax,
        sellTax: security?.sellTax,
        lpLocked: security?.lpLocked,
        topHoldersPct: security?.topHoldersPct,
        symbol: overview?.symbol,
        name: overview?.name,
        price: overview?.price,
        liquidity: overview?.liquidity,
        marketCap: overview?.marketCap,
        holders: overview?.holder,
      };
      setResult(merged);
      setScanned(true);
      const rec: ScanRecord = {
        id: `${Date.now()}`,
        contract: c,
        at: Date.now(),
        status: "ready",
      };
      setHistory((h) => [rec, ...h].slice(0, 8));
    } catch (e) {
      console.log("[scan] failed", e);
      setScanError(e instanceof Error ? e.message : "Scan failed");
      setScanned(true);
    } finally {
      setScanning(false);
    }
  }, [contract]);

  const titleByKind: Record<string, string> = {
    "rug-scanner": "AI Rug Scan",
    honeypot: "Honeypot Simulation",
    "holder-scan": "Holder X-Ray",
  };

  const checks: { label: string; Icon: LucideIcon }[] = useMemo(() => {
    if (kind === "honeypot") {
      return [
        { label: "Buy simulation", Icon: ArrowDown },
        { label: "Sell simulation", Icon: ArrowUp },
        { label: "Buy tax", Icon: Activity },
        { label: "Sell tax", Icon: Activity },
        { label: "Transfer restrictions", Icon: AlertTriangle },
        { label: "Blacklist functions", Icon: ShieldAlert },
      ];
    }
    if (kind === "holder-scan") {
      return [
        { label: "Top 10 concentration", Icon: Users },
        { label: "Top 50 concentration", Icon: Users },
        { label: "Insider clusters", Icon: Scan },
        { label: "Bundled buys", Icon: Waves },
        { label: "Dev wallet activity", Icon: Activity },
        { label: "Sniper bots count", Icon: Crosshair },
      ];
    }
    return [
      { label: "Mint authority renounced", Icon: ShieldCheck },
      { label: "LP locked / burned", Icon: Lock },
      { label: "Top 10 holder concentration", Icon: Users },
      { label: "Tax & blacklist functions", Icon: AlertTriangle },
      { label: "Insider clusters", Icon: Scan },
      { label: "Buy/sell simulation", Icon: Activity },
    ];
  }, [kind]);

  return (
    <View>
      <SectionHead title={titleByKind[kind] ?? "Scan"} accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Contract address</Text>
        <View style={styles.inputWithAction}>
          <TextInput
            value={contract}
            onChangeText={setContract}
            placeholder="Paste Solana contract..."
            placeholderTextColor={Colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, styles.inputFlex]}
            testID="scan-input"
          />
          <Pressable onPress={onPaste} style={styles.iconAction} hitSlop={6}>
            <ClipboardPaste color={accent} size={15} strokeWidth={2.6} />
          </Pressable>
        </View>
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
          <Text style={styles.primaryBtnText}>{scanning ? "Scanning…" : "Run scan"}</Text>
        </Pressable>
      </View>

      {scanned && (
        <View style={[styles.resultCard, { borderColor: `${accent}33` }]}>
          <View style={styles.resultHead}>
            <Text style={styles.resultEyebrow}>RISK SCORE</Text>
            {scanError ? (
              <View style={[styles.resultPending, { borderColor: `${Colors.rose}55` }]}>
                <AlertTriangle color={Colors.rose} size={11} strokeWidth={2.6} />
                <Text style={[styles.resultPendingText, { color: Colors.rose }]}>ERROR</Text>
              </View>
            ) : result ? (
              <View style={[styles.resultPending, { borderColor: `${accent}55` }]}>
                <CheckCircle2 color={accent} size={11} strokeWidth={2.6} />
                <Text style={[styles.resultPendingText, { color: accent }]}>LIVE</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.resultScore}>
            {result ? `${Math.round(result.riskScore)}/100` : "—/100"}
          </Text>
          <Text style={styles.resultBody}>
            {scanError
              ? scanError
              : result?.symbol
                ? `${result.name ?? result.symbol} · ${result.symbol}`
                : "Scan complete."}
          </Text>
          <View style={styles.resultGrid}>
            {checks.map((c) => {
              const value = labelForCheck(c.label, result);
              return (
                <View key={c.label} style={styles.resultGridItem}>
                  <View style={[styles.checkIcon, { backgroundColor: `${accent}1A` }]}>
                    <c.Icon color={accent} size={12} strokeWidth={2.6} />
                  </View>
                  <Text style={styles.resultGridLabel} numberOfLines={2}>
                    {c.label}
                  </Text>
                  <Text style={styles.resultGridValue}>{value}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <SectionHead title="What we check" accent={accent} />
      <View style={styles.checksList}>
        {checks.map((c) => (
          <View key={c.label} style={styles.checkRow}>
            <View style={[styles.checkIcon, { backgroundColor: `${accent}1A` }]}>
              <c.Icon color={accent} size={12} strokeWidth={2.6} />
            </View>
            <Text style={styles.checkText}>{c.label}</Text>
          </View>
        ))}
      </View>

      <SectionHead title={`Recent · ${history.length}`} accent={accent} />
      {history.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Timer}
          title="No scans yet"
          body="Your scan history appears here. Tap any to re-run."
        />
      ) : (
        <View style={styles.list}>
          {history.map((h) => (
            <Pressable key={h.id} onPress={() => setContract(h.contract)} style={styles.rowCard}>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Hash color={accent} size={14} strokeWidth={2.6} />
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {h.contract.slice(0, 10)}…{h.contract.slice(-6)}
                </Text>
                <Text style={styles.rowSub}>{timeAgo(h.at)}</Text>
              </View>
              <ChevronRight color={Colors.muted} size={14} strokeWidth={2.4} />
            </Pressable>
          ))}
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
  const [model, setModel] = useState<"gemini" | "gpt" | "claude">("gemini");

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    const u: Msg = { id: `u${Date.now()}`, role: "user", text };
    const history = [...messages, u];
    setMessages(history);
    setInput("");
    setThinking(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      const base = process.env.EXPO_PUBLIC_TOOLKIT_URL ?? "https://toolkit.rork.com";
      const res = await fetch(`${base}/text/llm/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are SolTools AI Analyst, an expert on Solana DeFi, memecoins, on-chain analysis, charting, and tokenomics. Be sharp, concise, actionable.",
            },
            ...history.map((m) => ({ role: m.role, content: m.text })),
          ],
        }),
      });
      if (!res.ok) throw new Error(`LLM ${res.status}`);
      const json = (await res.json()) as { completion?: string };
      const reply = json.completion ?? "No response.";
      const a: Msg = { id: `a${Date.now()}`, role: "assistant", text: reply };
      setMessages((m) => [...m, a]);
    } catch (e) {
      console.log("[ai] failed", e);
      const a: Msg = {
        id: `a${Date.now()}`,
        role: "assistant",
        text: e instanceof Error ? `Error: ${e.message}` : "AI request failed.",
      };
      setMessages((m) => [...m, a]);
    } finally {
      setThinking(false);
    }
  }, [input, messages]);

  const onClear = useCallback(() => {
    setMessages([]);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const SUGGESTIONS = [
    "Analyze $WIF chart structure",
    "Top whale rotations last 24h",
    "Is this contract risky?",
    "Find breakouts on Solana",
    "Compare $BONK vs $WIF",
    "Narrative plays right now",
  ];

  const MODELS: { key: "gemini" | "gpt" | "claude"; label: string }[] = [
    { key: "gemini", label: "Gemini 2.0" },
    { key: "gpt", label: "GPT-4o" },
    { key: "claude", label: "Claude 3.5" },
  ];

  return (
    <View>
      <SectionHead
        title="Ask the AI Analyst"
        accent={accent}
        action={
          messages.length > 0 ? (
            <Pressable onPress={onClear} hitSlop={6}>
              <Text style={[styles.linkText, { color: accent }]}>Clear</Text>
            </Pressable>
          ) : null
        }
      />

      <View style={styles.modelRow}>
        {MODELS.map((m) => {
          const active = m.key === model;
          return (
            <Pressable
              key={m.key}
              onPress={() => setModel(m.key)}
              style={[styles.typeChip, active && { backgroundColor: accent, borderColor: accent }]}
            >
              <Sparkles color={active ? Colors.ink : Colors.text} size={11} strokeWidth={2.6} />
              <Text style={[styles.typeText, active && { color: Colors.ink }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.chatBox}>
        {messages.length === 0 ? (
          <View style={styles.chatEmpty}>
            <View style={[styles.chatEmptyIcon, { backgroundColor: `${accent}1A` }]}>
              <Brain color={accent} size={22} strokeWidth={2.4} />
            </View>
            <Text style={styles.chatEmptyText}>
              Ask anything about Solana tokens, wallets, or charts.
            </Text>
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
            <Text style={styles.bubbleText}>Thinking…</Text>
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
          placeholder="Ask the AI…"
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

  const enabledCount = alerts.filter((a) => a.enabled).length;

  return (
    <View>
      <View style={styles.statRow}>
        <StatTile label="Total" value={`${alerts.length}`} accent={accent} Icon={Bell} />
        <StatTile label="Active" value={`${enabledCount}`} accent={accent} Icon={Zap} />
        <StatTile label="Fired 24h" value="—" accent={accent} Icon={Activity} />
      </View>

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
                style={[
                  styles.typeChip,
                  active && { backgroundColor: accent, borderColor: accent },
                ]}
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
        <Pressable
          onPress={onAdd}
          style={[styles.primaryBtn, { backgroundColor: accent }]}
          testID="alert-create"
        >
          <BellPlus color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.primaryBtnText}>Create alert</Text>
        </Pressable>
      </View>

      <SectionHead title={`Active · ${alerts.length}`} accent={accent} />
      {alerts.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Bell}
          title="No alerts yet"
          body="Set price, volume or whale-buy triggers."
        />
      ) : (
        <View style={styles.list}>
          {alerts.map((a) => (
            <View key={a.id} style={styles.rowCard}>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                {a.enabled ? (
                  <Bell color={accent} size={14} strokeWidth={2.6} />
                ) : (
                  <BellOff color={Colors.muted} size={14} strokeWidth={2.6} />
                )}
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
  const [sort, setSort] = useState<"recent" | "alpha">("recent");

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

  const sorted = useMemo(() => {
    const arr = [...watchlist];
    if (sort === "alpha") arr.sort((a, b) => a.ticker.localeCompare(b.ticker));
    else arr.sort((a, b) => b.addedAt - a.addedAt);
    return arr;
  }, [watchlist, sort]);

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

      <SectionHead
        title={`Watching · ${watchlist.length}`}
        accent={accent}
        action={
          <View style={styles.miniSegment}>
            <Pressable
              onPress={() => setSort("recent")}
              style={[styles.miniSegItem, sort === "recent" && { backgroundColor: `${accent}26` }]}
            >
              <Text
                style={[
                  styles.miniSegText,
                  sort === "recent" && { color: accent },
                ]}
              >
                Recent
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSort("alpha")}
              style={[styles.miniSegItem, sort === "alpha" && { backgroundColor: `${accent}26` }]}
            >
              <Text
                style={[
                  styles.miniSegText,
                  sort === "alpha" && { color: accent },
                ]}
              >
                A-Z
              </Text>
            </Pressable>
          </View>
        }
      />
      {sorted.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Eye}
          title="No watched tokens"
          body="Build your shortlist and track changes."
        />
      ) : (
        <View style={styles.list}>
          {sorted.map((w) => (
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
              <View style={styles.rowMetric}>
                <Text style={styles.rowMetricLabel}>24H</Text>
                <Text style={styles.rowMetricValue}>—</Text>
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

interface LobbyMember {
  id: string;
  handle: string;
  speaking: boolean;
  muted: boolean;
}

function VoiceLobbyTool({ accent }: { accent: string }) {
  const [muted, setMuted] = useState<boolean>(true);
  const [inLobby, setInLobby] = useState<boolean>(false);
  const [lobbyName, setLobbyName] = useState<string>("");
  const [privateRoom, setPrivateRoom] = useState<boolean>(false);
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [lobbyToken, setLobbyToken] = useState<string | null>(null);
  const [joining, setJoining] = useState<boolean>(false);
  const { user, email } = useAuth();

  const onJoin = useCallback(async () => {
    if (!lobbyName.trim()) {
      Alert.alert("Lobby name", "Pick a lobby to join.");
      return;
    }
    const handle = (email ?? "you").split("@")[0];
    setJoining(true);
    try {
      const tok = await getLiveKitToken({
        room: lobbyName.trim(),
        identity: user?.id ?? handle,
        name: handle,
      });
      setLobbyToken(tok.token);
      setInLobby(true);
      setMembers([{ id: user?.id ?? "me", handle, speaking: false, muted: true }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.log("[lobby] token failed", e);
      Alert.alert("Lobby unavailable", e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setJoining(false);
    }
  }, [lobbyName, user, email]);

  const onLeave = useCallback(() => {
    setInLobby(false);
    setMembers([]);
    setLobbyToken(null);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  return (
    <View>
      {inLobby ? (
        <>
          <View style={[styles.lobbyCard, { borderColor: `${accent}55` }]}>
            <View style={styles.lobbyHead}>
              <View style={[styles.lobbyAvatar, { backgroundColor: accent }]}>
                <Mic color={Colors.ink} size={16} strokeWidth={3} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lobbyTitle}>{lobbyName}</Text>
                <Text style={styles.lobbySub}>
                  Connected · {members.length} in room {privateRoom ? "· Private" : "· Public"}
                </Text>
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
                onPress={() =>
                  Alert.alert("Share chart", "Pick a chart to drop into the lobby.")
                }
                style={styles.lobbyCtrl}
              >
                <ChartLine color={Colors.text} size={16} strokeWidth={2.6} />
                <Text style={styles.lobbyCtrlText}>Share</Text>
              </Pressable>
              <Pressable
                onPress={onLeave}
                style={[styles.lobbyCtrl, { backgroundColor: "rgba(255,93,143,0.16)" }]}
              >
                <X color={Colors.rose} size={16} strokeWidth={2.6} />
                <Text style={[styles.lobbyCtrlText, { color: Colors.rose }]}>Leave</Text>
              </Pressable>
            </View>
          </View>

          <SectionHead title={`In room · ${members.length}`} accent={accent} />
          <View style={styles.list}>
            {members.map((m) => (
              <View key={m.id} style={styles.rowCard}>
                <View
                  style={[
                    styles.lobbyMemberAvatar,
                    { backgroundColor: `${accent}1A`, borderColor: `${accent}55` },
                  ]}
                >
                  <Text style={[styles.lobbyMemberInitial, { color: accent }]}>
                    {m.handle.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowTitle}>@{m.handle}</Text>
                  <Text style={styles.rowSub}>{m.muted ? "Muted" : "Speaking"}</Text>
                </View>
                {m.muted ? (
                  <MicOff color={Colors.muted} size={14} strokeWidth={2.6} />
                ) : (
                  <Volume2 color={accent} size={14} strokeWidth={2.6} />
                )}
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <SectionHead title="Create or join" accent={accent} />
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
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Private room</Text>
                <Text style={styles.toggleSub}>Invite only · hidden from public list</Text>
              </View>
              <Switch
                value={privateRoom}
                onValueChange={setPrivateRoom}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: accent }}
                thumbColor={privateRoom ? Colors.ink : Colors.muted}
              />
            </View>
            <Pressable
              onPress={onJoin}
              disabled={joining}
              style={[styles.primaryBtn, { backgroundColor: accent }, joining && { opacity: 0.6 }]}
            >
              {joining ? (
                <Loader2 color={Colors.ink} size={15} strokeWidth={3} />
              ) : (
                <Mic color={Colors.ink} size={15} strokeWidth={3} />
              )}
              <Text style={styles.primaryBtnText}>{joining ? "Connecting…" : "Open lobby"}</Text>
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

interface SniperLog {
  id: string;
  at: number;
  pair: string;
  result: "queued" | "filled" | "missed";
}

function SniperTool({ accent }: { accent: string }) {
  const [armed, setArmed] = useState<boolean>(false);
  const [budget, setBudget] = useState<string>("0.5");
  const [slippage, setSlippage] = useState<string>("15");
  const [minLiq, setMinLiq] = useState<string>("5");
  const [autoSell, setAutoSell] = useState<boolean>(true);
  const [tp, setTp] = useState<string>("100");
  const [sl, setSl] = useState<string>("30");
  const [logs, setLogs] = useState<SniperLog[]>([]);

  const PRESETS = [
    { key: "safe", label: "Conservative", b: "0.25", sl: "10", l: "10" },
    { key: "balanced", label: "Balanced", b: "0.5", sl: "15", l: "5" },
    { key: "aggro", label: "Aggressive", b: "1.0", sl: "30", l: "2" },
  ] as const;

  const applyPreset = useCallback((p: (typeof PRESETS)[number]) => {
    setBudget(p.b);
    setSlippage(p.sl);
    setMinLiq(p.l);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const toggleArm = useCallback(() => {
    setArmed((v) => {
      const next = !v;
      if (next) {
        const log: SniperLog = {
          id: `${Date.now()}`,
          at: Date.now(),
          pair: "—",
          result: "queued",
        };
        setLogs((l) => [log, ...l]);
      }
      return next;
    });
    Haptics.notificationAsync(
      armed ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  }, [armed]);

  return (
    <View>
      {armed && (
        <View style={[styles.armedBanner, { borderColor: `${accent}55` }]}>
          <View style={[styles.armedDot, { backgroundColor: accent }]} />
          <Text style={[styles.armedText, { color: accent }]}>SNIPER ARMED · WATCHING NEW LPs</Text>
        </View>
      )}

      <SectionHead title="Presets" accent={accent} />
      <View style={styles.presetRow}>
        {PRESETS.map((p) => (
          <Pressable key={p.key} onPress={() => applyPreset(p)} style={styles.presetCard}>
            <Text style={[styles.presetLabel, { color: accent }]}>{p.label}</Text>
            <Text style={styles.presetSub}>
              {p.b} SOL · {p.sl}% slip · ≥{p.l} LP
            </Text>
          </Pressable>
        ))}
      </View>

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

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Auto-sell on TP/SL</Text>
            <Text style={styles.toggleSub}>Exit automatically at thresholds</Text>
          </View>
          <Switch
            value={autoSell}
            onValueChange={setAutoSell}
            trackColor={{ false: "rgba(255,255,255,0.1)", true: accent }}
            thumbColor={autoSell ? Colors.ink : Colors.muted}
          />
        </View>

        {autoSell && (
          <View style={styles.tpslRow}>
            <View style={styles.tpslCol}>
              <Text style={styles.label}>Take profit %</Text>
              <TextInput
                value={tp}
                onChangeText={setTp}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholderTextColor={Colors.muted}
              />
            </View>
            <View style={styles.tpslCol}>
              <Text style={styles.label}>Stop loss %</Text>
              <TextInput
                value={sl}
                onChangeText={setSl}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholderTextColor={Colors.muted}
              />
            </View>
          </View>
        )}

        <Pressable
          onPress={toggleArm}
          style={[styles.primaryBtn, { backgroundColor: armed ? Colors.rose : accent }]}
        >
          <Power color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.primaryBtnText}>{armed ? "Disarm sniper" : "Arm sniper"}</Text>
        </Pressable>
      </View>

      <SectionHead title={`Snipes · ${logs.length}`} accent={accent} />
      {logs.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Crosshair}
          title="No snipes yet"
          body="Once armed, executions appear here in real-time."
        />
      ) : (
        <View style={styles.list}>
          {logs.map((l) => (
            <View key={l.id} style={styles.rowCard}>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Crosshair color={accent} size={14} strokeWidth={2.6} />
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle}>{l.pair === "—" ? "Awaiting fill" : l.pair}</Text>
                <Text style={styles.rowSub}>{timeAgo(l.at)}</Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  l.result === "filled" && { backgroundColor: `${Colors.mint}26` },
                  l.result === "queued" && { backgroundColor: `${accent}26` },
                  l.result === "missed" && { backgroundColor: `${Colors.rose}26` },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    l.result === "filled" && { color: Colors.mint },
                    l.result === "queued" && { color: accent },
                    l.result === "missed" && { color: Colors.rose },
                  ]}
                >
                  {l.result.toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

interface WatchedWhale {
  id: string;
  address: string;
  label: string;
}

function WhaleRadarTool({ accent }: { accent: string }) {
  const [threshold, setThreshold] = useState<number>(10000);
  const [whaleAddr, setWhaleAddr] = useState<string>("");
  const [whaleLabel, setWhaleLabel] = useState<string>("");
  const [whales, setWhales] = useState<WatchedWhale[]>([]);
  const [activePreset, setActivePreset] = useState<string>("");

  const PRESETS = [
    "Buys ≥ $10k",
    "Top 100 wallets",
    "Smart money picks",
    "Same wallet 3+ buys",
    "Insider clusters",
    "Dev sells",
  ];

  const adjustThresh = useCallback((delta: number) => {
    setThreshold((v) => Math.max(500, v + delta));
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const onAddWhale = useCallback(() => {
    if (whaleAddr.trim().length < 32) {
      Alert.alert("Invalid address", "Enter a valid Solana wallet.");
      return;
    }
    const w: WatchedWhale = {
      id: `${Date.now()}`,
      address: whaleAddr.trim(),
      label: whaleLabel.trim() || `${whaleAddr.slice(0, 4)}…${whaleAddr.slice(-4)}`,
    };
    setWhales((p) => [w, ...p]);
    setWhaleAddr("");
    setWhaleLabel("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [whaleAddr, whaleLabel]);

  const removeWhale = useCallback((id: string) => {
    setWhales((p) => p.filter((w) => w.id !== id));
  }, []);

  return (
    <View>
      <View style={styles.statRow}>
        <StatTile label="Tracked" value={`${whales.length}`} accent={accent} Icon={Users} />
        <StatTile
          label="Threshold"
          value={`$${(threshold / 1000).toFixed(1)}k`}
          accent={accent}
          Icon={Filter}
        />
        <StatTile label="Hits 24h" value="—" accent={accent} Icon={Activity} />
      </View>

      <SectionHead title="Min buy threshold" accent={accent} />
      <View style={styles.thresholdCard}>
        <Pressable onPress={() => adjustThresh(-1000)} style={styles.thresholdBtn}>
          <Minus color={Colors.text} size={16} strokeWidth={2.6} />
        </Pressable>
        <Text style={[styles.thresholdValue, { color: accent }]}>
          ${threshold.toLocaleString()}
        </Text>
        <Pressable onPress={() => adjustThresh(1000)} style={styles.thresholdBtn}>
          <Plus color={Colors.text} size={16} strokeWidth={2.6} />
        </Pressable>
      </View>

      <SectionHead title="Filter presets" accent={accent} />
      <View style={styles.list}>
        {PRESETS.map((p) => {
          const active = p === activePreset;
          return (
            <Pressable
              key={p}
              onPress={() => setActivePreset(active ? "" : p)}
              style={[
                styles.rowCard,
                active && { borderColor: `${accent}55`, backgroundColor: `${accent}10` },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Waves color={accent} size={14} strokeWidth={2.6} />
              </View>
              <Text style={[styles.rowTitle, { flex: 1 }]}>{p}</Text>
              {active ? (
                <CheckCircle2 color={accent} size={16} strokeWidth={2.6} />
              ) : (
                <ChevronRight color={Colors.muted} size={14} strokeWidth={2.4} />
              )}
            </Pressable>
          );
        })}
      </View>

      <SectionHead title="Track a whale wallet" accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Wallet address</Text>
        <TextInput
          value={whaleAddr}
          onChangeText={setWhaleAddr}
          placeholder="So111…"
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.label}>Label</Text>
        <TextInput
          value={whaleLabel}
          onChangeText={setWhaleLabel}
          placeholder="GiantWhale"
          placeholderTextColor={Colors.muted}
          style={styles.input}
        />
        <Pressable
          onPress={onAddWhale}
          style={[styles.primaryBtn, { backgroundColor: accent }]}
        >
          <UserPlus color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.primaryBtnText}>Track wallet</Text>
        </Pressable>
      </View>

      <SectionHead title={`Watched whales · ${whales.length}`} accent={accent} />
      {whales.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Radar}
          title="Radar idle"
          body="Add wallets or enable presets to start streaming smart-money flow."
        />
      ) : (
        <View style={styles.list}>
          {whales.map((w) => (
            <View key={w.id} style={styles.rowCard}>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Wallet color={accent} size={14} strokeWidth={2.6} />
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle}>{w.label}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {w.address.slice(0, 8)}…{w.address.slice(-6)}
                </Text>
              </View>
              <Pressable onPress={() => removeWhale(w.id)} style={styles.rowAction} hitSlop={6}>
                <X color={Colors.muted} size={14} strokeWidth={2.6} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function TokenStreamTool({ accent, kind }: { accent: string; kind: string }) {
  const { listings } = useLaunchpad();
  const { data: trending } = useTrendingTokens(30);
  const [tf, setTf] = useState<"1h" | "24h" | "7d">("24h");

  const items = useMemo(() => {
    if (kind === "trending" && trending && trending.length > 0) {
      return trending.map((t) => ({
        id: t.address,
        name: t.name ?? t.symbol ?? "Token",
        ticker: (t.symbol ?? "").toUpperCase(),
        venue: "birdeye",
        change24hPct: t.priceChange24h ?? null,
      }));
    }
    const sorted = [...listings];
    if (kind === "new-pairs") sorted.sort((a, b) => b.createdAt - a.createdAt);
    if (kind === "trending") sorted.sort((a, b) => b.upvotes - a.upvotes);
    return sorted.slice(0, 30).map((t) => ({
      id: t.id,
      name: t.name,
      ticker: t.ticker,
      venue: t.venue,
      change24hPct: t.change24hPct,
    }));
  }, [listings, kind, trending]);

  return (
    <View>
      <SectionHead
        title={kind === "new-pairs" ? "Live stream" : "Trending now"}
        accent={accent}
        action={
          <View style={styles.miniSegment}>
            {(["1h", "24h", "7d"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTf(t)}
                style={[styles.miniSegItem, tf === t && { backgroundColor: `${accent}26` }]}
              >
                <Text
                  style={[
                    styles.miniSegText,
                    tf === t && { color: accent },
                  ]}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Zap}
          title={kind === "new-pairs" ? "No new pairs yet" : "No trending tokens"}
          body="Once tokens are approved in Discover they'll surface here in real-time."
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
                <Text style={styles.rowSub}>
                  ${t.ticker.replace("$", "")} · {t.venue}
                </Text>
              </View>
              {t.change24hPct != null ? (
                <Text
                  style={[
                    styles.rowChange,
                    { color: t.change24hPct >= 0 ? Colors.mint : Colors.rose },
                  ]}
                >
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

interface CopyConfig {
  id: string;
  address: string;
  riskPct: number;
  enabled: boolean;
}

function TradingGatedTool({ accent }: { accent: string }) {
  return (
    <EmptyState
      accent={accent}
      Icon={Lock}
      title="Trading opens after App Store launch"
      body={SOLTOOLS_TRADING_DISABLED_MESSAGE}
    />
  );
}

function CopyTradeTool({ accent }: { accent: string }) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [riskPct, setRiskPct] = useState<string>("10");
  const [maxSize, setMaxSize] = useState<string>("0.5");
  const [address, setAddress] = useState<string>("");
  const [followOnSell, setFollowOnSell] = useState<boolean>(true);
  const [configs, setConfigs] = useState<CopyConfig[]>([]);

  const onAddConfig = useCallback(() => {
    if (address.trim().length < 32) {
      Alert.alert("Invalid wallet", "Enter a valid Solana wallet to mirror.");
      return;
    }
    const v = parseFloat(riskPct);
    if (Number.isNaN(v) || v <= 0) {
      Alert.alert("Invalid risk", "Set a numeric risk %.");
      return;
    }
    const c: CopyConfig = {
      id: `${Date.now()}`,
      address: address.trim(),
      riskPct: v,
      enabled: true,
    };
    setConfigs((p) => [c, ...p]);
    setAddress("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [address, riskPct]);

  const toggleCfg = useCallback((id: string) => {
    setConfigs((p) => p.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  }, []);

  const removeCfg = useCallback((id: string) => {
    setConfigs((p) => p.filter((c) => c.id !== id));
  }, []);

  return (
    <View>
      <SectionHead title="Master switch" accent={accent} />
      <View style={styles.formCard}>
        <View style={[styles.toggleRow, { paddingTop: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Copy trading enabled</Text>
            <Text style={styles.toggleSub}>Mirror buys / sells across all configs</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: "rgba(255,255,255,0.1)", true: accent }}
            thumbColor={enabled ? Colors.ink : Colors.muted}
          />
        </View>
      </View>

      <SectionHead title="Add wallet" accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Wallet to mirror</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Top trader address"
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <View style={styles.tpslRow}>
          <View style={styles.tpslCol}>
            <Text style={styles.label}>Risk % per trade</Text>
            <TextInput
              value={riskPct}
              onChangeText={setRiskPct}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholderTextColor={Colors.muted}
            />
          </View>
          <View style={styles.tpslCol}>
            <Text style={styles.label}>Max size (SOL)</Text>
            <TextInput
              value={maxSize}
              onChangeText={setMaxSize}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholderTextColor={Colors.muted}
            />
          </View>
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Mirror sells</Text>
            <Text style={styles.toggleSub}>Exit when source wallet exits</Text>
          </View>
          <Switch
            value={followOnSell}
            onValueChange={setFollowOnSell}
            trackColor={{ false: "rgba(255,255,255,0.1)", true: accent }}
            thumbColor={followOnSell ? Colors.ink : Colors.muted}
          />
        </View>
        <Pressable
          onPress={onAddConfig}
          style={[styles.primaryBtn, { backgroundColor: accent }]}
        >
          <Plus color={Colors.ink} size={15} strokeWidth={3} />
          <Text style={styles.primaryBtnText}>Add copy config</Text>
        </Pressable>
      </View>

      <SectionHead title={`Active configs · ${configs.length}`} accent={accent} />
      {configs.length === 0 ? (
        <EmptyState
          accent={accent}
          Icon={Users}
          title="No mirrored wallets"
          body="Pick a top performing wallet to start mirroring its trades."
        />
      ) : (
        <View style={styles.list}>
          {configs.map((c) => (
            <View key={c.id} style={styles.rowCard}>
              <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                <Users color={accent} size={14} strokeWidth={2.6} />
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {c.address.slice(0, 6)}…{c.address.slice(-4)}
                </Text>
                <Text style={styles.rowSub}>Risk {c.riskPct}% · Max {maxSize} SOL</Text>
              </View>
              <Switch
                value={c.enabled}
                onValueChange={() => toggleCfg(c.id)}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: accent }}
                thumbColor={c.enabled ? Colors.ink : Colors.muted}
              />
              <Pressable onPress={() => removeCfg(c.id)} style={styles.rowAction} hitSlop={6}>
                <X color={Colors.muted} size={14} strokeWidth={2.6} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <SectionHead title="Top performing wallets" accent={accent} />
      <EmptyState
        accent={accent}
        Icon={TrendingUp}
        title="Leaderboard offline"
        body="Live wallet leaderboard streams here once the data provider connects."
      />
    </View>
  );
}

function AlphaBotTool({ accent }: { accent: string }) {
  const [sources, setSources] = useState<{ x: boolean; tg: boolean; chain: boolean }>({
    x: true,
    tg: true,
    chain: true,
  });
  const [topics, setTopics] = useState<string[]>(["meme"]);

  const TOPICS = ["meme", "ai", "defi", "gaming", "depin", "rwa", "L2", "stables"];

  const toggleTopic = useCallback((t: string) => {
    setTopics((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
    Haptics.selectionAsync().catch(() => {});
  }, []);

  return (
    <View>
      <SectionHead title="Sources" accent={accent} />
      <View style={styles.formCard}>
        {[
          { key: "x" as const, label: "X / Twitter", Icon: Globe },
          { key: "tg" as const, label: "Telegram channels", Icon: Send },
          { key: "chain" as const, label: "On-chain whales", Icon: Waves },
        ].map((s, idx) => (
          <View
            key={s.key}
            style={[styles.toggleRow, idx === 0 && { paddingTop: 0 }]}
          >
            <View style={[styles.rowIcon, { backgroundColor: `${accent}1A`, marginRight: 10 }]}>
              <s.Icon color={accent} size={14} strokeWidth={2.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>{s.label}</Text>
              <Text style={styles.toggleSub}>{sources[s.key] ? "Streaming" : "Paused"}</Text>
            </View>
            <Switch
              value={sources[s.key]}
              onValueChange={(v) => setSources((p) => ({ ...p, [s.key]: v }))}
              trackColor={{ false: "rgba(255,255,255,0.1)", true: accent }}
              thumbColor={sources[s.key] ? Colors.ink : Colors.muted}
            />
          </View>
        ))}
      </View>

      <SectionHead title="Topic filters" accent={accent} />
      <View style={styles.topicWrap}>
        {TOPICS.map((t) => {
          const active = topics.includes(t);
          return (
            <Pressable
              key={t}
              onPress={() => toggleTopic(t)}
              style={[
                styles.typeChip,
                active && { backgroundColor: accent, borderColor: accent },
              ]}
            >
              <Hash color={active ? Colors.ink : Colors.text} size={11} strokeWidth={2.6} />
              <Text style={[styles.typeText, active && { color: Colors.ink }]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionHead title="Alpha feed" accent={accent} />
      <EmptyState
        accent={accent}
        Icon={Bot}
        title="No alpha yet"
        body="AI-curated alpha will stream here once your sources connect."
      />
    </View>
  );
}

function ChartTool({ accent, kind }: { accent: string; kind: string }) {
  const [token, setToken] = useState<string>("");
  const [tf, setTf] = useState<string>("1h");
  const [pattern, setPattern] = useState<string>("Bullish breakout");
  const [scanning, setScanning] = useState<boolean>(false);

  const TFS = ["1m", "5m", "15m", "1h", "4h", "1d"];
  const PATTERNS = ["Bullish breakout", "Bull flag", "Cup & handle", "Reversal hammer", "Double bottom"];

  const runScan = useCallback(() => {
    setScanning(true);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => {
      setScanning(false);
      Alert.alert("Scan queued", "Connect Birdeye / GeckoTerminal to enable live results.");
    }, 700);
  }, []);

  return (
    <View>
      <SectionHead title={kind === "candle-scanner" ? "Pattern scanner" : "Chart sharing"} accent={accent} />
      <View style={styles.formCard}>
        <Text style={styles.label}>Token</Text>
        <TextInput
          value={token}
          onChangeText={(v) => setToken(v.replace("$", "").toUpperCase())}
          placeholder="WIF"
          placeholderTextColor={Colors.muted}
          autoCapitalize="characters"
          style={styles.input}
        />
        <Text style={styles.label}>Timeframe</Text>
        <View style={styles.typeRow}>
          {TFS.map((t) => {
            const active = tf === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTf(t)}
                style={[
                  styles.typeChip,
                  active && { backgroundColor: accent, borderColor: accent },
                ]}
              >
                <Text style={[styles.typeText, active && { color: Colors.ink }]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        {kind === "candle-scanner" && (
          <>
            <Text style={styles.label}>Pattern</Text>
            <View style={styles.typeRow}>
              {PATTERNS.map((p) => {
                const active = pattern === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPattern(p)}
                    style={[
                      styles.typeChip,
                      active && { backgroundColor: accent, borderColor: accent },
                    ]}
                  >
                    <Text style={[styles.typeText, active && { color: Colors.ink }]}>{p}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Pressable
          onPress={runScan}
          disabled={scanning}
          style={[styles.primaryBtn, { backgroundColor: accent }, scanning && { opacity: 0.6 }]}
        >
          {scanning ? (
            <Loader2 color={Colors.ink} size={15} strokeWidth={3} />
          ) : kind === "candle-scanner" ? (
            <Search color={Colors.ink} size={15} strokeWidth={3} />
          ) : (
            <ArrowUpRight color={Colors.ink} size={15} strokeWidth={3} />
          )}
          <Text style={styles.primaryBtnText}>
            {kind === "candle-scanner" ? "Scan markets" : "Build chart"}
          </Text>
        </Pressable>
      </View>

      <SectionHead title="Live chart" accent={accent} />
      <View style={styles.chartPlaceholder}>
        <ChartCandlestick color={accent} size={32} strokeWidth={2.4} />
        <Text style={styles.chartPlaceholderTitle}>Awaiting data feed</Text>
        <Text style={styles.chartPlaceholderBody}>
          Hook up Birdeye, GeckoTerminal or your preferred provider to power charts.
        </Text>
      </View>

      <SectionHead title={kind === "candle-scanner" ? "Pattern matches" : "Recent shares"} accent={accent} />
      <EmptyState
        accent={accent}
        Icon={kind === "candle-scanner" ? TrendingUp : ChartLine}
        title={kind === "candle-scanner" ? "No matches yet" : "Nothing shared yet"}
        body={
          kind === "candle-scanner"
            ? "Scan results will populate here once the data provider connects."
            : "Drop a chart into a lobby or DM to see it here."
        }
      />
    </View>
  );
}

function fmtUsd(n: number | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (n >= 1) return `${n.toFixed(2)}`;
  if (n > 0) return `${n.toFixed(6)}`;
  return "$0";
}
function fmtNum(n: number | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtPct(n: number | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function daysSince(ts: number): string {
  if (!ts || ts <= 0) return "—";
  const d = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (d <= 0) return "today";
  if (d === 1) return "1 day";
  if (d < 365) return `${d} days`;
  const y = (d / 365).toFixed(1);
  return `${y} yrs`;
}

function GenericInputTool({
  meta,
  kind,
}: {
  meta: ToolMeta;
  kind: "contract" | "wallet" | "stream";
}) {
  const accent = meta.accent;
  const [value, setValue] = useState<string>("");
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanned, setScanned] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TokenOverview | null>(null);
  const [security, setSecurity] = useState<{
    riskScore: number;
    isHoneypot: boolean;
    buyTax?: number;
    sellTax?: number;
    lpLocked?: boolean;
    topHoldersPct?: number;
  } | null>(null);
  const [portfolio, setPortfolio] = useState<WalletPortfolio | null>(null);
  const { data: trending } = useTrendingTokens(20);

  const onPaste = useCallback(async () => {
    try {
      const txt = await Clipboard.getStringAsync();
      if (txt) {
        setValue(txt.trim());
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) { console.log("[generic] paste", e); }
  }, []);

  const onRun = useCallback(async () => {
    const v = value.trim();
    if (kind !== "stream") {
      if (kind === "wallet" && !isValidSolanaAddress(v)) {
        Alert.alert("Invalid wallet", "Enter a valid Solana wallet address.");
        return;
      }
      if (kind === "contract" && v.length < 32) {
        Alert.alert("Invalid contract", "Paste a Solana token contract.");
        return;
      }
    }
    setScanning(true);
    setScanned(false);
    setError(null);
    setOverview(null);
    setSecurity(null);
    setPortfolio(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (kind === "contract") {
        const [ov, sec] = await Promise.all([
          getTokenOverview(v).catch((e) => {
            console.log("[generic] overview err", e);
            return null;
          }),
          getTokenSecurity(v).catch((e) => {
            console.log("[generic] security err", e);
            return null;
          }),
        ]);
        setOverview(ov);
        setSecurity(sec);
      } else if (kind === "wallet") {
        const p = await fetchWalletPortfolio(v);
        setPortfolio(p);
      }
      setScanned(true);
    } catch (e) {
      console.log("[generic] run failed", e);
      setError(e instanceof Error ? e.message : "Request failed");
      setScanned(true);
    } finally {
      setScanning(false);
    }
  }, [kind, value]);

  const placeholder =
    kind === "wallet" ? "So111... wallet address" :
    kind === "contract" ? "Paste Solana token contract" :
    "Filter (e.g. min liquidity 5 SOL)";

  const inputLabel = kind === "wallet" ? "Wallet address" : kind === "contract" ? "Contract address" : "Filter";

  const ctaLabel = scanning ? "Working…" : kind === "stream" ? "Refresh stream" : kind === "wallet" ? "Profile wallet" : "Run scan";

  const tiles: { label: string; value: string; Icon: LucideIcon }[] = useMemo(() => {
    if (kind === "wallet") {
      const s = portfolio?.stats;
      const b = portfolio?.balance;
      return [
        { label: "Net worth", value: b ? fmtUsd(b.usd) : "—", Icon: Wallet },
        { label: "Tx count", value: s ? fmtNum(s.totalTxs) : "—", Icon: Activity },
        { label: "Active", value: s ? `${s.activeDays}d` : "—", Icon: Clock },
      ];
    }
    if (kind === "contract") {
      return [
        { label: "Risk score", value: security ? `${Math.round(security.riskScore)}/100` : "—/100", Icon: ShieldAlert },
        { label: "Liquidity", value: fmtUsd(overview?.liquidity), Icon: Waves },
        { label: "Holders", value: fmtNum(overview?.holder), Icon: Users },
      ];
    }
    return [
      { label: "Tracked", value: trending ? `${trending.length}` : "—", Icon: Activity },
      { label: "Top change", value: trending && trending[0] ? fmtPct(trending[0].priceChange24h) : "—", Icon: TrendingUp },
      { label: "Live", value: trending ? "ON" : "—", Icon: Power },
    ];
  }, [kind, portfolio, overview, security, trending]);

  return (
    <View>
      <SectionHead title={meta.name} accent={accent} />
      {kind !== "stream" ? (
        <View style={styles.formCard}>
          <Text style={styles.label}>{inputLabel}</Text>
          <View style={styles.inputWithAction}>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={Colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.inputFlex]}
              testID={`generic-input-${meta.id}`}
            />
            <Pressable onPress={onPaste} style={styles.iconAction} hitSlop={6}>
              <ClipboardPaste color={accent} size={15} strokeWidth={2.6} />
            </Pressable>
          </View>
          <Pressable
            onPress={onRun}
            style={[styles.primaryBtn, { backgroundColor: accent }, scanning && { opacity: 0.6 }]}
            disabled={scanning}
            testID={`generic-run-${meta.id}`}
          >
            {scanning ? (
              <Loader2 color={Colors.ink} size={15} strokeWidth={3} />
            ) : (
              <Zap color={Colors.ink} size={15} strokeWidth={3} />
            )}
            <Text style={styles.primaryBtnText}>{ctaLabel}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.statRow}>
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} accent={accent} Icon={t.Icon} />
        ))}
      </View>

      <ToolResultPanel
        meta={meta}
        kind={kind}
        scanning={scanning}
        scanned={scanned}
        error={error}
        overview={overview}
        security={security}
        portfolio={portfolio}
        trending={trending ?? null}
      />
    </View>
  );
}

function ToolResultPanel({
  meta,
  kind,
  scanning,
  scanned,
  error,
  overview,
  security,
  portfolio,
  trending,
}: {
  meta: ToolMeta;
  kind: "contract" | "wallet" | "stream";
  scanning: boolean;
  scanned: boolean;
  error: string | null;
  overview: TokenOverview | null;
  security: {
    riskScore: number;
    isHoneypot: boolean;
    buyTax?: number;
    sellTax?: number;
    lpLocked?: boolean;
    topHoldersPct?: number;
  } | null;
  portfolio: WalletPortfolio | null;
  trending: TokenOverview[] | null;
}) {
  const accent = meta.accent;

  if (scanning) {
    return (
      <View>
        <SectionHead title="Result" accent={accent} />
        <EmptyState
          accent={accent}
          Icon={Loader2}
          title="Querying chain…"
          body="Pulling live on-chain data from RPC + Birdeye."
        />
      </View>
    );
  }

  if (kind === "stream") {
    return <StreamResultPanel meta={meta} trending={trending} />;
  }

  if (!scanned) {
    return (
      <View>
        <SectionHead title="Result" accent={accent} />
        <EmptyState
          accent={accent}
          Icon={meta.Icon}
          title="Awaiting input"
          body={meta.description}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View>
        <SectionHead title="Result" accent={accent} />
        <EmptyState
          accent={Colors.rose}
          Icon={AlertTriangle}
          title="Request failed"
          body={error}
        />
      </View>
    );
  }

  if (kind === "contract") {
    return <ContractResultPanel meta={meta} overview={overview} security={security} />;
  }
  if (kind === "wallet") {
    return <WalletResultPanel meta={meta} portfolio={portfolio} />;
  }
  return null;
}

function ResultGridCard({
  meta,
  items,
  headline,
  subline,
}: {
  meta: ToolMeta;
  items: { label: string; value: string; tone?: "good" | "bad" | "warn" | "neutral" }[];
  headline: string;
  subline?: string;
}) {
  const accent = meta.accent;
  const toneColor = (t?: "good" | "bad" | "warn" | "neutral") =>
    t === "good" ? Colors.mint : t === "bad" ? Colors.rose : t === "warn" ? Colors.orange : Colors.text;
  return (
    <View>
      <SectionHead title="Result" accent={accent} />
      <View style={[styles.resultCard, { borderColor: `${accent}33`, marginTop: 0 }]}>
        <View style={styles.resultHead}>
          <Text style={styles.resultEyebrow}>{meta.name.toUpperCase()}</Text>
          <View style={[styles.resultPending, { borderColor: `${accent}55` }]}>
            <CheckCircle2 color={accent} size={11} strokeWidth={2.6} />
            <Text style={[styles.resultPendingText, { color: accent }]}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.resultScore}>{headline}</Text>
        {subline ? <Text style={styles.resultBody}>{subline}</Text> : null}
        <View style={styles.resultGrid}>
          {items.map((it) => (
            <View key={it.label} style={styles.resultGridItem}>
              <View style={[styles.checkIcon, { backgroundColor: `${accent}1A` }]}>
                <Sparkles color={accent} size={12} strokeWidth={2.6} />
              </View>
              <Text style={styles.resultGridLabel} numberOfLines={2}>
                {it.label}
              </Text>
              <Text style={[styles.resultGridValue, { color: toneColor(it.tone) }]}>
                {it.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function ContractResultPanel({
  meta,
  overview,
  security,
}: {
  meta: ToolMeta;
  overview: TokenOverview | null;
  security: {
    riskScore: number;
    isHoneypot: boolean;
    buyTax?: number;
    sellTax?: number;
    lpLocked?: boolean;
    topHoldersPct?: number;
  } | null;
}) {
  const id = meta.id;
  const ov = overview;
  const sec = security;
  const headline =
    ov?.symbol ? `${ov.name ?? ov.symbol} · ${ov.symbol}` : meta.name;
  const sub = ov?.price
    ? `${fmtUsd(ov.price)} · ${fmtPct(ov.priceChange24h)} 24h`
    : "Live token snapshot.";

  let items: { label: string; value: string; tone?: "good" | "bad" | "warn" | "neutral" }[] = [];

  switch (id) {
    case "rug-detector":
    case "risk-detector": {
      const score = Math.round(sec?.riskScore ?? 0);
      const tone: "good" | "warn" | "bad" = score >= 70 ? "bad" : score >= 40 ? "warn" : "good";
      items = [
        { label: "Risk score", value: `${score}/100`, tone },
        { label: "Honeypot", value: sec?.isHoneypot ? "FAIL" : "PASS", tone: sec?.isHoneypot ? "bad" : "good" },
        { label: "LP status", value: sec?.lpLocked == null ? "—" : sec.lpLocked ? "LOCKED" : "OPEN", tone: sec?.lpLocked ? "good" : "warn" },
        { label: "Top 10 holders", value: sec?.topHoldersPct != null ? `${sec.topHoldersPct.toFixed(1)}%` : "—", tone: (sec?.topHoldersPct ?? 0) > 50 ? "warn" : "neutral" },
        { label: "Buy tax", value: sec?.buyTax != null ? `${sec.buyTax}%` : "—" },
        { label: "Sell tax", value: sec?.sellTax != null ? `${sec.sellTax}%` : "—" },
      ];
      break;
    }
    case "holder-analysis":
    case "whale-concentration": {
      const top = sec?.topHoldersPct;
      items = [
        { label: "Top 10 share", value: top != null ? `${top.toFixed(1)}%` : "—", tone: (top ?? 0) > 50 ? "warn" : "neutral" },
        { label: "Holders", value: fmtNum(ov?.holder) },
        { label: "Distribution", value: top != null ? (top > 60 ? "Concentrated" : top > 30 ? "Mixed" : "Healthy") : "—" },
        { label: "Market cap", value: fmtUsd(ov?.marketCap) },
        { label: "Liquidity", value: fmtUsd(ov?.liquidity) },
        { label: "24h volume", value: fmtUsd(ov?.volume24hUSD) },
      ];
      break;
    }
    case "liquidity-scanner": {
      const liq = ov?.liquidity ?? 0;
      const vol = ov?.volume24hUSD ?? 0;
      const turnover = liq > 0 ? (vol / liq) * 100 : 0;
      items = [
        { label: "Total liquidity", value: fmtUsd(liq), tone: liq < 10000 ? "bad" : liq < 100000 ? "warn" : "good" },
        { label: "24h volume", value: fmtUsd(vol) },
        { label: "Turnover", value: `${turnover.toFixed(1)}%` },
        { label: "Slip @ $1k", value: liq > 0 ? `${Math.min(99, (1000 / liq) * 100).toFixed(2)}%` : "—" },
        { label: "Slip @ $10k", value: liq > 0 ? `${Math.min(99, (10000 / liq) * 100).toFixed(2)}%` : "—" },
        { label: "Depth health", value: liq > 250000 ? "Strong" : liq > 50000 ? "OK" : "Thin", tone: liq > 250000 ? "good" : liq > 50000 ? "warn" : "bad" },
      ];
      break;
    }
    case "token-metadata": {
      items = [
        { label: "Symbol", value: ov?.symbol ?? "—" },
        { label: "Decimals", value: ov?.decimals != null ? `${ov.decimals}` : "—" },
        { label: "Holders", value: fmtNum(ov?.holder) },
        { label: "Market cap", value: fmtUsd(ov?.marketCap) },
        { label: "Rank", value: ov?.rank ? `#${ov.rank}` : "—" },
        { label: "Logo", value: ov?.logoURI ? "Set" : "—" },
      ];
      break;
    }
    case "wash-trading": {
      const liq = ov?.liquidity ?? 0;
      const vol = ov?.volume24hUSD ?? 0;
      const ratio = liq > 0 ? vol / liq : 0;
      items = [
        { label: "Vol/Liq ratio", value: ratio.toFixed(2), tone: ratio > 20 ? "bad" : ratio > 8 ? "warn" : "good" },
        { label: "24h volume", value: fmtUsd(vol) },
        { label: "Liquidity", value: fmtUsd(liq) },
        { label: "Wash flag", value: ratio > 20 ? "HIGH" : ratio > 8 ? "MED" : "LOW", tone: ratio > 20 ? "bad" : ratio > 8 ? "warn" : "good" },
        { label: "24h change", value: fmtPct(ov?.priceChange24h) },
        { label: "Holders", value: fmtNum(ov?.holder) },
      ];
      break;
    }
    case "insider-detector": {
      const top = sec?.topHoldersPct ?? 0;
      items = [
        { label: "Insider risk", value: top > 60 ? "HIGH" : top > 30 ? "MED" : "LOW", tone: top > 60 ? "bad" : top > 30 ? "warn" : "good" },
        { label: "Top 10 share", value: top ? `${top.toFixed(1)}%` : "—" },
        { label: "Holders", value: fmtNum(ov?.holder) },
        { label: "LP locked", value: sec?.lpLocked == null ? "—" : sec.lpLocked ? "YES" : "NO" },
        { label: "Honeypot", value: sec?.isHoneypot ? "YES" : "NO", tone: sec?.isHoneypot ? "bad" : "good" },
        { label: "Risk score", value: sec ? `${Math.round(sec.riskScore)}/100` : "—" },
      ];
      break;
    }
    case "burn-watcher": {
      items = [
        { label: "Holders", value: fmtNum(ov?.holder) },
        { label: "24h change", value: fmtPct(ov?.priceChange24h) },
        { label: "7d change", value: fmtPct(ov?.priceChange7d) },
        { label: "Liquidity", value: fmtUsd(ov?.liquidity) },
        { label: "Market cap", value: fmtUsd(ov?.marketCap) },
        { label: "Volume 24h", value: fmtUsd(ov?.volume24hUSD) },
      ];
      break;
    }
    case "mev-tracker": {
      const vol = ov?.volume24hUSD ?? 0;
      items = [
        { label: "24h volume", value: fmtUsd(vol) },
        { label: "MEV exposure", value: vol > 1e6 ? "HIGH" : vol > 100000 ? "MED" : "LOW", tone: vol > 1e6 ? "warn" : "neutral" },
        { label: "1h move", value: fmtPct(ov?.priceChange1h) },
        { label: "24h move", value: fmtPct(ov?.priceChange24h) },
        { label: "Liquidity", value: fmtUsd(ov?.liquidity) },
        { label: "Holders", value: fmtNum(ov?.holder) },
      ];
      break;
    }
    case "token-locks":
    case "token-creator": {
      items = [
        { label: "LP locked", value: sec?.lpLocked == null ? "—" : sec.lpLocked ? "LOCKED" : "OPEN", tone: sec?.lpLocked ? "good" : "warn" },
        { label: "Risk score", value: sec ? `${Math.round(sec.riskScore)}/100` : "—" },
        { label: "Top 10 share", value: sec?.topHoldersPct != null ? `${sec.topHoldersPct.toFixed(1)}%` : "—" },
        { label: "Market cap", value: fmtUsd(ov?.marketCap) },
        { label: "Holders", value: fmtNum(ov?.holder) },
        { label: "Liquidity", value: fmtUsd(ov?.liquidity) },
      ];
      break;
    }
    case "impermanent-loss":
    case "jupiter-routes":
    default: {
      items = [
        { label: "Price", value: fmtUsd(ov?.price) },
        { label: "Market cap", value: fmtUsd(ov?.marketCap) },
        { label: "Liquidity", value: fmtUsd(ov?.liquidity) },
        { label: "24h volume", value: fmtUsd(ov?.volume24hUSD) },
        { label: "Holders", value: fmtNum(ov?.holder) },
        { label: "24h change", value: fmtPct(ov?.priceChange24h), tone: (ov?.priceChange24h ?? 0) >= 0 ? "good" : "bad" },
      ];
    }
  }

  return <ResultGridCard meta={meta} headline={headline} subline={sub} items={items} />;
}

function WalletResultPanel({
  meta,
  portfolio,
}: {
  meta: ToolMeta;
  portfolio: WalletPortfolio | null;
}) {
  const accent = meta.accent;
  const id = meta.id;
  if (!portfolio) {
    return (
      <View>
        <SectionHead title="Result" accent={accent} />
        <EmptyState accent={accent} Icon={meta.Icon} title="No data" body="Wallet returned no on-chain activity." />
      </View>
    );
  }
  const s = portfolio.stats;
  const b = portfolio.balance;
  const top = (portfolio.tokens ?? []).slice(0, 5);
  const headline = fmtUsd(b.usd);
  const sub = `${b.sol.toFixed(3)} SOL · ${s.totalTxs} txs · ${s.activeDays}d active`;

  let items: { label: string; value: string; tone?: "good" | "bad" | "warn" | "neutral" }[] = [];

  switch (id) {
    case "wallet-age": {
      items = [
        { label: "First seen", value: daysSince(s.firstSeen) + " ago" },
        { label: "Last seen", value: daysSince(s.lastSeen) + " ago" },
        { label: "Active days", value: `${s.activeDays}` },
        { label: "Avg tx/day", value: s.avgTxPerDay.toFixed(2) },
        { label: "Total tx", value: fmtNum(s.totalTxs) },
        { label: "Success", value: `${s.successRate.toFixed(1)}%`, tone: s.successRate > 90 ? "good" : "warn" },
      ];
      break;
    }
    case "fee-analyzer": {
      items = [
        { label: "Total fees", value: `${s.totalFeesSol.toFixed(4)} SOL` },
        { label: "Fees USD", value: fmtUsd(s.totalFeesUsd) },
        { label: "Avg fee", value: s.totalTxs ? `${(s.totalFeesSol / s.totalTxs).toFixed(6)} SOL` : "—" },
        { label: "Tx count", value: fmtNum(s.totalTxs) },
        { label: "Failed", value: fmtNum(s.failedCount), tone: s.failedCount > 5 ? "warn" : "neutral" },
        { label: "SOL price", value: fmtUsd(portfolio.solPrice) },
      ];
      break;
    }
    case "profit-curve":
    case "wallet-profiler": {
      items = [
        { label: "Net worth", value: fmtUsd(b.usd) },
        { label: "SOL balance", value: `${b.sol.toFixed(3)}` },
        { label: "Holdings", value: `${(portfolio.tokens ?? []).length}` },
        { label: "Tx count", value: fmtNum(s.totalTxs) },
        { label: "Success rate", value: `${s.successRate.toFixed(1)}%`, tone: s.successRate > 90 ? "good" : "warn" },
        { label: "Active days", value: `${s.activeDays}` },
      ];
      break;
    }
    case "trading-style": {
      const txPerDay = s.avgTxPerDay;
      const style =
        txPerDay > 50 ? "Sniper bot" :
        txPerDay > 20 ? "Scalper" :
        txPerDay > 5 ? "Swing" :
        txPerDay > 0.5 ? "Position" : "Holder";
      items = [
        { label: "Style", value: style, tone: "neutral" },
        { label: "Tx/day", value: txPerDay.toFixed(2) },
        { label: "Active days", value: `${s.activeDays}` },
        { label: "Holdings", value: `${(portfolio.tokens ?? []).length}` },
        { label: "Success", value: `${s.successRate.toFixed(1)}%` },
        { label: "Total tx", value: fmtNum(s.totalTxs) },
      ];
      break;
    }
    case "transfer-profiler": {
      items = [
        { label: "Tx count", value: fmtNum(s.totalTxs) },
        { label: "Success", value: `${s.successRate.toFixed(1)}%` },
        { label: "Failed", value: fmtNum(s.failedCount) },
        { label: "Holdings", value: `${(portfolio.tokens ?? []).length}` },
        { label: "Net worth", value: fmtUsd(b.usd) },
        { label: "Active days", value: `${s.activeDays}` },
      ];
      break;
    }
    case "sol-depletion": {
      const burn = s.activeDays > 0 ? s.totalFeesSol / s.activeDays : 0;
      const daysLeft = burn > 0 ? Math.floor(b.sol / burn) : 9999;
      items = [
        { label: "SOL balance", value: b.sol.toFixed(4), tone: b.sol < 0.05 ? "bad" : b.sol < 0.2 ? "warn" : "good" },
        { label: "Burn/day", value: `${burn.toFixed(6)} SOL` },
        { label: "Days left", value: daysLeft > 9000 ? "∞" : `${daysLeft}d`, tone: daysLeft < 7 ? "bad" : daysLeft < 30 ? "warn" : "good" },
        { label: "Total fees", value: `${s.totalFeesSol.toFixed(4)} SOL` },
        { label: "Active days", value: `${s.activeDays}` },
        { label: "Net worth", value: fmtUsd(b.usd) },
      ];
      break;
    }
    case "lp-scanner": {
      items = [
        { label: "Holdings", value: `${(portfolio.tokens ?? []).length}` },
        { label: "Net worth", value: fmtUsd(b.usd) },
        { label: "SOL", value: b.sol.toFixed(3) },
        { label: "Tx count", value: fmtNum(s.totalTxs) },
        { label: "Active days", value: `${s.activeDays}` },
        { label: "Success", value: `${s.successRate.toFixed(1)}%` },
      ];
      break;
    }
    case "airdrop-analyzer": {
      const eligible =
        s.activeDays > 30 && s.totalTxs > 50 ? "High" :
        s.activeDays > 7 && s.totalTxs > 10 ? "Medium" : "Low";
      items = [
        { label: "Eligibility", value: eligible, tone: eligible === "High" ? "good" : eligible === "Medium" ? "warn" : "bad" },
        { label: "Active days", value: `${s.activeDays}` },
        { label: "Tx count", value: fmtNum(s.totalTxs) },
        { label: "Holdings", value: `${(portfolio.tokens ?? []).length}` },
        { label: "Net worth", value: fmtUsd(b.usd) },
        { label: "First seen", value: daysSince(s.firstSeen) + " ago" },
      ];
      break;
    }
    case "stake-tracker":
    case "wallet-graph":
    case "multi-wallet":
    default: {
      items = [
        { label: "Net worth", value: fmtUsd(b.usd) },
        { label: "SOL", value: b.sol.toFixed(3) },
        { label: "Tokens", value: `${(portfolio.tokens ?? []).length}` },
        { label: "Tx count", value: fmtNum(s.totalTxs) },
        { label: "Active days", value: `${s.activeDays}` },
        { label: "Success", value: `${s.successRate.toFixed(1)}%`, tone: s.successRate > 90 ? "good" : "warn" },
      ];
    }
  }

  return (
    <View>
      <ResultGridCard meta={meta} headline={headline} subline={sub} items={items} />
      {top.length > 0 ? (
        <>
          <SectionHead title={`Top holdings · ${top.length}`} accent={accent} />
          <View style={styles.list}>
            {top.map((t) => (
              <View key={t.mint} style={styles.rowCard}>
                <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
                  <Text style={[styles.rowIconText, { color: accent }]}>
                    {(t.symbol ?? t.mint.slice(0, 2)).slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {t.name ?? t.symbol ?? "Token"}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {t.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {t.symbol ?? ""}
                  </Text>
                </View>
                <View style={styles.rowMetric}>
                  <Text style={styles.rowMetricLabel}>USD</Text>
                  <Text style={styles.rowMetricValue}>{fmtUsd(t.usdValue)}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function StreamResultPanel({
  meta,
  trending,
}: {
  meta: ToolMeta;
  trending: TokenOverview[] | null;
}) {
  const accent = meta.accent;
  if (!trending || trending.length === 0) {
    return (
      <View>
        <SectionHead title="Live stream" accent={accent} />
        <EmptyState accent={accent} Icon={Loader2} title="Connecting…" body="Subscribing to live token feed." />
      </View>
    );
  }
  return (
    <View>
      <SectionHead title={`Live · ${trending.length}`} accent={accent} />
      <View style={styles.list}>
        {trending.map((t, i) => (
          <View key={t.address} style={styles.rowCard}>
            <Text style={[styles.rowRank, { color: accent }]}>{i + 1}</Text>
            <View style={[styles.rowIcon, { backgroundColor: `${accent}1A` }]}>
              <Text style={[styles.rowIconText, { color: accent }]}>
                {(t.symbol ?? t.address.slice(0, 2)).slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.rowMid}>
              <Text style={styles.rowTitle} numberOfLines={1}>{t.name ?? t.symbol}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {fmtUsd(t.price)} · liq {fmtUsd(t.liquidity)}
              </Text>
            </View>
            {t.priceChange24h != null ? (
              <Text style={[styles.rowChange, { color: t.priceChange24h >= 0 ? Colors.mint : Colors.rose }]}>
                {fmtPct(t.priceChange24h)}
              </Text>
            ) : (
              <Text style={styles.rowChangeMuted}>—</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function ConnectedModuleTool({ meta }: { meta: ToolMeta }) {
  const checks = [
    "Route is registered in the SolTools platform map",
    "Uses existing providers and API wrappers",
    "Trading actions stay gated until App Store launch",
  ];
  return (
    <View>
      <SectionHead title="Connected module" accent={meta.accent} />
      <View style={[styles.resultCard, { borderColor: `${meta.accent}33`, marginTop: 0 }]}> 
        <View style={styles.resultHead}>
          <Text style={styles.resultEyebrow}>SOLTOOLS INTEGRATION</Text>
          <View style={[styles.resultPending, { borderColor: `${meta.accent}55` }]}> 
            <CheckCircle2 color={meta.accent} size={11} strokeWidth={2.6} />
            <Text style={[styles.resultPendingText, { color: meta.accent }]}>CONNECTED</Text>
          </View>
        </View>
        <Text style={styles.resultScore}>{meta.name}</Text>
        <Text style={styles.resultBody}>{meta.description}</Text>
        <View style={styles.checksListInline}>
          {checks.map((check) => (
            <View key={check} style={styles.checkRowInline}>
              <View style={[styles.checkIcon, { backgroundColor: `${meta.accent}1A` }]}> 
                <CheckCircle2 color={meta.accent} size={12} strokeWidth={2.6} />
              </View>
              <Text style={styles.checkText}>{check}</Text>
            </View>
          ))}
        </View>
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
      body="This module is listed in the SolTools platform map and can be promoted to a live input tool without changing API contracts."
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

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const _unused = Circle;
void _unused;

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

  statRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
  },
  statTile: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statTileIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statTileLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 8,
  },
  statTileValue: { color: Colors.text, fontSize: 15, fontWeight: "900", marginTop: 2 },

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
  inputWithAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputFlex: { flex: 1 },
  iconAction: {
    marginTop: 6,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
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
  linkText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },

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
  checksListInline: { gap: 8, marginTop: 14 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  checkRowInline: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  checkText: { color: Colors.text, fontSize: 13, fontWeight: "700" },

  resultCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
  },
  resultHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultEyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  resultPending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  resultPendingText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  resultScore: { color: Colors.text, fontSize: 32, fontWeight: "900", marginTop: 6 },
  resultBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 6 },
  resultGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  resultGridItem: {
    width: "48%",
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  resultGridLabel: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginTop: 6,
    minHeight: 28,
  },
  resultGridValue: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 4 },

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

  modelRow: { flexDirection: "row", gap: 6, marginHorizontal: 16, marginBottom: 8, flexWrap: "wrap" },

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

  miniSegment: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  miniSegItem: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  miniSegText: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    marginTop: 6,
  },
  toggleTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  toggleSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  tpslRow: { flexDirection: "row", gap: 10 },
  tpslCol: { flex: 1 },

  armedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  armedDot: { width: 8, height: 8, borderRadius: 4 },
  armedText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },

  presetRow: { flexDirection: "row", gap: 8, marginHorizontal: 16 },
  presetCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  presetLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  presetSub: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 4, lineHeight: 14 },

  thresholdCard: {
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  thresholdBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  thresholdValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },

  topicWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginHorizontal: 16 },

  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },

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
  lobbyMemberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  lobbyMemberInitial: { fontSize: 11, fontWeight: "900" },

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
