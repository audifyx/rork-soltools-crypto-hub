import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  Brain,
  Briefcase,
  Bug,
  ChevronRight,
  Clipboard as ClipboardIcon,
  Clock,
  Coins,
  Crosshair,
  Droplets,
  Eye,
  Fingerprint,
  Flame,
  Gauge,
  Gift,
  Hash,
  Layers,
  LineChart,
  Lock,
  MessageCircle,
  Mic,
  Network,
  PieChart,
  Radar,
  Repeat,
  Route,
  Scale,
  ScanLine,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  UserSearch,
  Wallet,
  Waves,
  Wrench,
  Zap,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import AppBackground from "@/components/ui/AppBackground";
import OGScanLiveStrip from "@/components/discover/OGScanLiveStrip";
import Colors from "@/constants/colors";
import {
  SOLTOOLS_MODULE_COUNT,
  SOLTOOLS_PLATFORM_MODULES,
  SOLTOOLS_TRADING_DISABLED_MESSAGE,
  getSolToolsModulesByStatus,
  type SolToolsModuleCategory,
  type SolToolsModuleSpec,
  type SolToolsModuleStatus,
} from "@/lib/soltools-platform";

type LucideIcon = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
  fill?: string;
}>;

type ToolCategory = "trading" | "analysis" | "defi" | "risk" | "wallet" | "social" | "platform";

type Tool = {
  id: string;
  route: string;
  name: string;
  tagline: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
  glow: string;
  gradient: [string, string];
  tags: string[];
  status: "LIVE" | "BETA" | "NEW" | "GATED";
  category: ToolCategory;
};

const CATEGORIES: { key: ToolCategory; label: string; Icon: LucideIcon; accent: string }[] = [
  { key: "trading", label: "Trading", Icon: TrendingUp, accent: Colors.mint },
  { key: "analysis", label: "Token Intel", Icon: ScanLine, accent: Colors.cyan },
  { key: "defi", label: "DeFi & Yield", Icon: Coins, accent: Colors.violet },
  { key: "risk", label: "Risk", Icon: ShieldAlert, accent: Colors.rose },
  { key: "wallet", label: "Wallet Intel", Icon: Wallet, accent: Colors.orange },
  { key: "social", label: "Social + Voice", Icon: Users, accent: Colors.silver },
  { key: "platform", label: "Platform", Icon: Wrench, accent: Colors.goldBright },
];

const TOOLS: Tool[] = [
  // Core (Live)
  {
    id: "token-lookup",
    route: "/tool/token-lookup",
    name: "Token Lookup",
    tagline: "Paste a contract, see everything",
    description:
      "Drop any Solana contract to view a full token snapshot — price, market cap, liquidity, holders — and a live DEX chart.",
    Icon: ScanLine,
    accent: Colors.cyan,
    glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, "#B8BEC8"],
    tags: ["Live", "Chart", "On-chain"],
    status: "LIVE",
    category: "analysis",
  },
  {
    id: "wallet-tracker",
    route: "/tool/wallet-tracker",
    name: "Wallet Tracker",
    tagline: "Live PnL on any Solana address",
    description:
      "Paste any wallet to see holdings, realized PnL, top trades, and live on-chain activity streamed via Helius RPC.",
    Icon: Wallet,
    accent: Colors.mint,
    glow: "rgba(255,255,255,0.14)",
    gradient: [Colors.mint, Colors.cyan],
    tags: ["Helius", "PnL", "Live"],
    status: "LIVE",
    category: "wallet",
  },
  {
    id: "trade-vault",
    route: "/wallet",
    name: "Trade Vault",
    tagline: "Wallets + swaps gated until App Store launch",
    description: SOLTOOLS_TRADING_DISABLED_MESSAGE,
    Icon: Wallet,
    accent: Colors.mint,
    glow: "rgba(255,255,255,0.16)",
    gradient: [Colors.mint, Colors.orange],
    tags: ["Wallet", "Jupiter", "Phantom"],
    status: "GATED",
    category: "trading",
  },
  {
    id: "ai-analysis",
    route: "/tool/ai-analysis",
    name: "AI Analysis",
    tagline: "Deep-dive any token in seconds",
    description:
      "Holder clusters, LP locks, tax behavior, smart-money flow and a risk score — generated on demand by our AI engine.",
    Icon: Brain,
    accent: Colors.violet,
    glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.cyan],
    tags: ["AI", "Risk", "On-chain"],
    status: "LIVE",
    category: "analysis",
  },
  {
    id: "ai-chat",
    route: "/tool/ai-chat",
    name: "Chat with AI",
    tagline: "Ask anything about a token or wallet",
    description:
      "Conversational AI with live Helius + RPC blockchain context. Ask about flows, history, narratives, and risk in plain English.",
    Icon: MessageCircle,
    accent: Colors.orange,
    glow: "rgba(201,206,216,0.14)",
    gradient: [Colors.orange, Colors.rose],
    tags: ["GPT", "RPC", "Context"],
    status: "BETA",
    category: "analysis",
  },

  // New AI / Whale / Alerts cards
  {
    id: "whale-tracker",
    route: "/tool/whale-tracker",
    name: "Whale Tracker",
    tagline: "Monitor large wallets and their activity",
    description:
      "Watch a curated list of whales, their entries, exits and fresh accumulations across Solana — live activity feed.",
    Icon: Waves,
    accent: Colors.cyan,
    glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.violet],
    tags: ["Whales", "Live", "Feed"],
    status: "NEW",
    category: "wallet",
  },
  {
    id: "price-alerts",
    route: "/tool/price-alerts",
    name: "Price Alerts",
    tagline: "Get notified when prices hit your targets",
    description:
      "Set price-cross conditions on any token, choose above/below targets and route notifications to push or Discord.",
    Icon: BellRing,
    accent: Colors.mint,
    glow: "rgba(255,255,255,0.14)",
    gradient: [Colors.mint, Colors.cyan],
    tags: ["Alerts", "Discord", "Live"],
    status: "NEW",
    category: "trading",
  },
  {
    id: "pnl-analyzer",
    route: "/tool/pnl-analyzer",
    name: "Wallet P&L Analyzer",
    tagline: "Enter any wallet to see trading performance",
    description:
      "Realized + unrealized PnL, win rate, hold time, biggest wins, biggest losses — a complete trading scorecard.",
    Icon: TrendingUp,
    accent: Colors.violet,
    glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.mint],
    tags: ["PnL", "Stats", "Win rate"],
    status: "NEW",
    category: "wallet",
  },
  {
    id: "portfolio-cards",
    route: "/tool/portfolio-cards",
    name: "Shareable Portfolio Cards",
    tagline: "Generate clean, modern cards from real wallet data",
    description:
      "Generate beautiful PnL and portfolio cards from any wallet — share to X, Telegram, or save to camera roll.",
    Icon: PieChart,
    accent: Colors.orange,
    glow: "rgba(201,206,216,0.14)",
    gradient: [Colors.orange, Colors.rose],
    tags: ["Cards", "Share", "PnL"],
    status: "NEW",
    category: "wallet",
  },
  {
    id: "ai-wallet-analyzer",
    route: "/tool/ai-wallet-analyzer",
    name: "AI Wallet Analyzer",
    tagline: "Deep analysis of any wallet",
    description:
      "AI Trading Assistant with on-chain context — paste a wallet to get a behavior summary, risk traits and patterns.",
    Icon: Brain,
    accent: Colors.violet,
    glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.cyan],
    tags: ["AI", "Wallet", "On-chain"],
    status: "NEW",
    category: "analysis",
  },

  // Trading
  {
    id: "token-sniper",
    route: "/tool/token-sniper",
    name: "Token Sniper",
    tagline: "Detect new token launches instantly",
    description:
      "Real-time stream of new mints across Pump.fun, Raydium, Meteora & Orca. Filter by liquidity, dev age, and instant-snipe.",
    Icon: Crosshair, accent: Colors.mint, glow: "rgba(255,255,255,0.14)",
    gradient: [Colors.mint, Colors.cyan], tags: ["Live", "Mints", "Snipe"], status: "NEW", category: "trading",
  },
  {
    id: "liquidity-sniper",
    route: "/tool/liquidity-sniper",
    name: "Liquidity Sniper",
    tagline: "Snipe new liquidity pools",
    description: "Watch new LP creations live. Filter by quote token, min liquidity and lock status — auto-alert on launch.",
    Icon: Droplets, accent: Colors.cyan, glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.mint], tags: ["LP", "Snipe", "Live"], status: "NEW", category: "trading",
  },
  {
    id: "jupiter-routes",
    route: "/tool/jupiter-routes",
    name: "Jupiter Routes",
    tagline: "Track swap routes and slippage",
    description: "Inspect Jupiter quote routes, hops, price impact and per-DEX split for any swap pair before you trade.",
    Icon: Route, accent: Colors.orange, glow: "rgba(201,206,216,0.14)",
    gradient: [Colors.orange, Colors.rose], tags: ["Jupiter", "Routes", "Slippage"], status: "LIVE", category: "trading",
  },
  {
    id: "profit-curve",
    route: "/tool/profit-curve",
    name: "Profit Curve",
    tagline: "Generate PnL curves over time",
    description: "Plot any wallet's realized + unrealized PnL across days, weeks, months. Spot drawdowns and winning streaks.",
    Icon: LineChart, accent: Colors.violet, glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.cyan], tags: ["PnL", "Chart", "History"], status: "NEW", category: "trading",
  },
  {
    id: "trading-style",
    route: "/tool/trading-style",
    name: "Trading Style",
    tagline: "Classify wallet trading patterns",
    description: "AI classifier labels wallets as scalper, sniper, swing, holder, farmer, or insider based on on-chain behavior.",
    Icon: Fingerprint, accent: Colors.mint, glow: "rgba(255,255,255,0.14)",
    gradient: [Colors.mint, Colors.violet], tags: ["AI", "Behavior", "Tag"], status: "NEW", category: "trading",
  },
  {
    id: "wallet-profiler",
    route: "/tool/wallet-profiler",
    name: "Wallet Profiler",
    tagline: "Analyze any wallet's performance",
    description: "Win rate, avg hold time, ROI, biggest wins, biggest rugs — a complete profile of any address.",
    Icon: Briefcase, accent: Colors.cyan, glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.mint], tags: ["Stats", "PnL", "Profile"], status: "NEW", category: "trading",
  },

  // Token Intel / Analysis
  {
    id: "holder-analysis",
    route: "/tool/holder-analysis",
    name: "Holder Analysis",
    tagline: "Deep dive into token holders",
    description: "Cluster holders by entry, dev wallet, sniper, fresh wallet. See who's distributing, who's accumulating.",
    Icon: Users, accent: Colors.cyan, glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.violet], tags: ["Clusters", "Holders"], status: "NEW", category: "analysis",
  },
  {
    id: "liquidity-scanner",
    route: "/tool/liquidity-scanner",
    name: "Liquidity Scanner",
    tagline: "Check pool liquidity depth",
    description: "See real liquidity across every pool, slippage curves at various sizes, and risk of low-depth pools.",
    Icon: Waves, accent: Colors.mint, glow: "rgba(255,255,255,0.14)",
    gradient: [Colors.mint, Colors.cyan], tags: ["Liquidity", "Depth"], status: "NEW", category: "analysis",
  },
  {
    id: "token-metadata",
    route: "/tool/token-metadata",
    name: "Token Metadata",
    tagline: "Inspect on-chain token data",
    description: "Mint authority, freeze authority, Metaplex metadata, decimals, supply, update authority — full transparency.",
    Icon: Hash, accent: Colors.violet, glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.cyan], tags: ["Mint", "Metaplex"], status: "NEW", category: "analysis",
  },
  {
    id: "whale-concentration",
    route: "/tool/whale-concentration",
    name: "Whale Concentration",
    tagline: "Analyze whale holdings",
    description: "Top 10/50/100 holder share, concentration index, whale rotation tracking, and distribution health score.",
    Icon: PieChart, accent: Colors.orange, glow: "rgba(201,206,216,0.14)",
    gradient: [Colors.orange, Colors.rose], tags: ["Whales", "Distribution"], status: "NEW", category: "analysis",
  },
  {
    id: "wash-trading",
    route: "/tool/wash-trading",
    name: "Wash Trading",
    tagline: "Detect wash trading patterns",
    description: "Spot circular flows, repeat counterparties, and inflated volume. Identify fake liquidity and pump rings.",
    Icon: Repeat, accent: Colors.rose, glow: "rgba(244,244,245,0.12)",
    gradient: [Colors.rose, Colors.orange], tags: ["Detect", "Wash"], status: "NEW", category: "analysis",
  },
  {
    id: "insider-detector",
    route: "/tool/insider-detector",
    name: "Insider Detector",
    tagline: "Find insider trading patterns",
    description: "Detect bundled buys, dev clusters, sniper bots, pre-launch funding paths and connected insider wallets.",
    Icon: UserSearch, accent: Colors.rose, glow: "rgba(244,244,245,0.12)",
    gradient: [Colors.rose, Colors.violet], tags: ["Insiders", "Bundled"], status: "NEW", category: "analysis",
  },

  // DeFi / Yield
  {
    id: "staking-calculator",
    route: "/tool/staking-calculator",
    name: "Staking Calculator",
    tagline: "Calculate staking rewards",
    description: "Project SOL & SPL staking rewards across validators with APY, commission, fees, and compounding.",
    Icon: Scale, accent: Colors.mint, glow: "rgba(255,255,255,0.14)",
    gradient: [Colors.mint, Colors.cyan], tags: ["Stake", "APY"], status: "NEW", category: "defi",
  },
  {
    id: "impermanent-loss",
    route: "/tool/impermanent-loss",
    name: "Impermanent Loss",
    tagline: "IL calculator for LP positions",
    description: "Model IL on any LP pair with custom price moves. Compare HODL vs LP vs concentrated liquidity.",
    Icon: TrendingDown, accent: Colors.cyan, glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.violet], tags: ["IL", "LP", "Calc"], status: "NEW", category: "defi",
  },
  {
    id: "lp-scanner",
    route: "/tool/lp-scanner",
    name: "LP Scanner",
    tagline: "Scan LP positions and yields",
    description: "Inspect any wallet's LP positions, current value, fees earned, and live APR across Raydium, Meteora, Orca.",
    Icon: Layers, accent: Colors.violet, glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.mint], tags: ["LP", "Yield"], status: "NEW", category: "defi",
  },
  {
    id: "program-monitor",
    route: "/tool/program-monitor",
    name: "Program Monitor",
    tagline: "Monitor DEX interactions",
    description: "Watch any Solana program ID — Raydium, Meteora, Pump, Jupiter — for instructions, calls, and unusual flow.",
    Icon: Network, accent: Colors.cyan, glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.violet], tags: ["Programs", "DEX"], status: "NEW", category: "defi",
  },
  {
    id: "fee-analyzer",
    route: "/tool/fee-analyzer",
    name: "Fee Analyzer",
    tagline: "Analyze transaction fees",
    description: "Break down priority fees, compute units, and total SOL spent on fees per wallet, per program, per day.",
    Icon: Gauge, accent: Colors.orange, glow: "rgba(201,206,216,0.14)",
    gradient: [Colors.orange, Colors.mint], tags: ["Fees", "Analytics"], status: "NEW", category: "defi",
  },
  {
    id: "token-locks",
    route: "/tool/token-locks",
    name: "Token Locks",
    tagline: "Monitor token lock schedules",
    description: "Track team & LP unlocks across PinkLock, Streamflow, Bonfida — see what unlocks when, in real time.",
    Icon: Lock, accent: Colors.violet, glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.cyan], tags: ["Locks", "Vesting"], status: "NEW", category: "defi",
  },

  // Risk
  {
    id: "rug-detector",
    route: "/tool/rug-detector",
    name: "Rug Detector",
    tagline: "Analyze rug pull risk",
    description: "AI rug score from mint authority, LP lock, dev wallets, holder clustering, and historical rug patterns.",
    Icon: ShieldAlert, accent: Colors.rose, glow: "rgba(244,244,245,0.12)",
    gradient: [Colors.rose, Colors.orange], tags: ["Rug", "AI"], status: "LIVE", category: "risk",
  },
  {
    id: "risk-detector",
    route: "/tool/risk-detector",
    name: "Risk Detector",
    tagline: "Comprehensive risk scoring",
    description: "Holistic risk dashboard: rug, honeypot, wash, insider, MEV, liquidity — one consolidated risk score.",
    Icon: Shield, accent: Colors.rose, glow: "rgba(244,244,245,0.12)",
    gradient: [Colors.rose, Colors.violet], tags: ["Risk", "Score"], status: "NEW", category: "risk",
  },
  {
    id: "token-creator",
    route: "/tool/token-creator",
    name: "Token Creator",
    tagline: "Track token creator history",
    description: "See every token a creator has launched, their average performance, rug rate, and active wallets.",
    Icon: Target, accent: Colors.orange, glow: "rgba(201,206,216,0.14)",
    gradient: [Colors.orange, Colors.rose], tags: ["Creator", "History"], status: "NEW", category: "risk",
  },
  {
    id: "burn-watcher",
    route: "/tool/burn-watcher",
    name: "Burn Watcher",
    tagline: "Monitor token burns",
    description: "Track token burns, dev burns, LP burns and supply changes in real-time across Solana.",
    Icon: Flame, accent: Colors.orange, glow: "rgba(201,206,216,0.14)",
    gradient: [Colors.orange, Colors.rose], tags: ["Burn", "Supply"], status: "NEW", category: "risk",
  },
  {
    id: "mev-tracker",
    route: "/tool/mev-tracker",
    name: "MEV Tracker",
    tagline: "Detect MEV activity",
    description: "Spot sandwich attacks, JIT liquidity, frontrunning bots, and MEV losses across any token or wallet.",
    Icon: Bug, accent: Colors.rose, glow: "rgba(244,244,245,0.12)",
    gradient: [Colors.rose, Colors.cyan], tags: ["MEV", "Sandwich"], status: "NEW", category: "risk",
  },
  {
    id: "sol-depletion",
    route: "/tool/sol-depletion",
    name: "SOL Depletion",
    tagline: "Low balance warnings",
    description: "Get pinged before any tracked wallet runs out of SOL for fees. Auto-track burn rate per wallet.",
    Icon: AlertTriangle, accent: Colors.orange, glow: "rgba(201,206,216,0.14)",
    gradient: [Colors.orange, Colors.rose], tags: ["Alert", "SOL"], status: "NEW", category: "risk",
  },

  // Wallet Intel
  {
    id: "wallet-age",
    route: "/tool/wallet-age",
    name: "Wallet Age",
    tagline: "Calculate wallet age & activity",
    description: "First-seen, last-seen, total active days, dormancy gaps and full lifetime activity timeline.",
    Icon: Clock, accent: Colors.cyan, glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.mint], tags: ["Age", "Lifetime"], status: "NEW", category: "wallet",
  },
  {
    id: "transfer-profiler",
    route: "/tool/transfer-profiler",
    name: "Transfer Profiler",
    tagline: "Analyze transfer patterns",
    description: "Top counterparties, inflow/outflow heatmap, suspicious mixing, and stablecoin vs SPL flow analysis.",
    Icon: BarChart3, accent: Colors.violet, glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.cyan], tags: ["Flow", "Profile"], status: "NEW", category: "wallet",
  },
  {
    id: "wallet-graph",
    route: "/tool/wallet-graph",
    name: "Wallet Graph",
    tagline: "Visualize wallet relationships",
    description: "Interactive graph of connected wallets, common funders, and shared exchange deposit clusters.",
    Icon: Network, accent: Colors.cyan, glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.violet], tags: ["Graph", "Cluster"], status: "NEW", category: "wallet",
  },
  {
    id: "stake-tracker",
    route: "/tool/stake-tracker",
    name: "Stake Tracker",
    tagline: "Track staking accounts",
    description: "All stake accounts, validators, rewards earned, and active/deactivating epochs for any wallet.",
    Icon: Coins, accent: Colors.mint, glow: "rgba(255,255,255,0.14)",
    gradient: [Colors.mint, Colors.cyan], tags: ["Stake", "Validators"], status: "NEW", category: "wallet",
  },
  {
    id: "airdrop-analyzer",
    route: "/tool/airdrop-analyzer",
    name: "Airdrop Analyzer",
    tagline: "Check airdrop eligibility",
    description: "Run any wallet against active and upcoming Solana airdrops to estimate allocation and farmability.",
    Icon: Gift, accent: Colors.violet, glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.mint], tags: ["Airdrop", "Eligibility"], status: "NEW", category: "wallet",
  },
  {
    id: "multi-wallet",
    route: "/tool/multi-wallet",
    name: "Multi-Wallet",
    tagline: "Merge multiple wallet views",
    description: "Combine multiple addresses into one consolidated portfolio — net worth, holdings, PnL, all merged.",
    Icon: Eye, accent: Colors.mint, glow: "rgba(255,255,255,0.14)",
    gradient: [Colors.mint, Colors.cyan], tags: ["Portfolio", "Merge"], status: "NEW", category: "wallet",
  },
];

function moduleStatusToToolStatus(status: SolToolsModuleStatus): Tool["status"] {
  if (status === "live") return "LIVE";
  if (status === "gated") return "GATED";
  if (status === "planned") return "NEW";
  return "BETA";
}

function moduleCategoryToToolCategory(category: SolToolsModuleCategory): ToolCategory {
  if (category === "wallet" || category === "premium" || category === "credits") return "wallet";
  if (category === "token" || category === "ai" || category === "basic") return "analysis";
  if (category === "advanced") return "risk";
  if (category === "social" || category === "voice" || category === "notifications") return "social";
  if (category === "launchpad") return "trading";
  return "platform";
}

function moduleIconForCategory(category: SolToolsModuleCategory): LucideIcon {
  if (category === "wallet" || category === "premium" || category === "credits") return Wallet;
  if (category === "token" || category === "basic") return ScanLine;
  if (category === "ai") return Brain;
  if (category === "advanced") return ShieldAlert;
  if (category === "social") return Users;
  if (category === "voice") return Mic;
  if (category === "notifications") return BellRing;
  if (category === "launchpad") return Zap;
  return Wrench;
}

function moduleAccentForCategory(category: ToolCategory): string {
  if (category === "trading") return Colors.mint;
  if (category === "analysis") return Colors.cyan;
  if (category === "defi") return Colors.violet;
  if (category === "risk") return Colors.rose;
  if (category === "wallet") return Colors.orange;
  if (category === "social") return Colors.silver;
  return Colors.goldBright;
}

function moduleToTool(module: SolToolsModuleSpec): Tool {
  const category = moduleCategoryToToolCategory(module.category);
  const accent = moduleAccentForCategory(category);
  const creditTag = module.creditCost != null ? `${module.creditCost} credits` : module.status;
  const route = module.category === "launchpad"
    ? "/(tabs)/discover"
    : module.route ?? `/tool/${module.id}`;
  return {
    id: module.id,
    route,
    name: module.name,
    tagline: module.status === "gated" ? "Paused until App Store launch" : `${module.surface} · ${module.status.toUpperCase()}`,
    description: module.gatedReason ?? `${module.name} is wired into ${module.surface} using the existing SolTools data layer and routes.`,
    Icon: moduleIconForCategory(module.category),
    accent,
    glow: `${accent}18`,
    gradient: [accent, Colors.silver],
    tags: [module.category, module.surface.split(" ")[0] ?? "SolTools", creditTag].slice(0, 3),
    status: moduleStatusToToolStatus(module.status),
    category,
  };
}

const ALL_TOOLS: Tool[] = [
  ...TOOLS,
  ...SOLTOOLS_PLATFORM_MODULES.filter((module) => !TOOLS.some((tool) => tool.id === module.id)).map(moduleToTool),
];

const RECENT_KEY = "tools.recent.v1";
const MAX_RECENT = 5;

type RecentItem = { id: string; ts: number };

export default function ToolsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState<string>("");
  const [scan, setScan] = useState<string>("");
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as RecentItem[];
          if (Array.isArray(parsed)) setRecent(parsed.slice(0, MAX_RECENT));
        } catch (e) {
          console.log("[tools] parse recent error", e);
        }
      })
      .catch((e) => console.log("[tools] read recent error", e));
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const persistRecent = useCallback(async (next: RecentItem[]) => {
    try {
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (e) {
      console.log("[tools] persist recent error", e);
    }
  }, []);

  const pushRecent = useCallback(
    (id: string) => {
      setRecent((prev) => {
        const filtered = prev.filter((r) => r.id !== id);
        const next = [{ id, ts: Date.now() }, ...filtered].slice(0, MAX_RECENT);
        persistRecent(next).catch(() => {});
        return next;
      });
    },
    [persistRecent],
  );

  const onOpen = useCallback(
    (route: string, id?: string) => {
      Haptics.selectionAsync().catch(() => {});
      if (id) pushRecent(id);
      router.push(route as never);
    },
    [router, pushRecent],
  );

  const filtered = useMemo<Tool[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_TOOLS;
    return ALL_TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [query]);

  const recentTools = useMemo<Tool[]>(() => {
    return recent
      .map((r) => ALL_TOOLS.find((t) => t.id === r.id))
      .filter((t): t is Tool => Boolean(t));
  }, [recent]);

  const featured = ALL_TOOLS[0];
  const liveModuleCount = getSolToolsModulesByStatus("live").length;
  const betaModuleCount = getSolToolsModulesByStatus("beta").length;

  const handleScanSubmit = useCallback(() => {
    const v = scan.trim();
    if (!v) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    pushRecent("token-lookup");
    router.push({ pathname: "/tool/token-lookup", params: { ca: v } } as never);
    setScan("");
  }, [scan, pushRecent, router]);

  const onPasteScan = useCallback(async () => {
    try {
      const t = await Clipboard.getStringAsync();
      if (t) {
        setScan(t.trim());
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[tools] clipboard error", e);
    }
  }, []);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={styles.root} testID="tools-screen">
      <AppBackground variant="tool" />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.headerBadge}>
                <Wrench color={Colors.mint} size={14} strokeWidth={2.6} />
                <Text style={styles.headerBadgeText}>TOOL DECK</Text>
              </View>
              <Text style={styles.headerTitle}>Tools</Text>
              <Text style={styles.headerSub}>
                Live on-chain intelligence, one tap away.
              </Text>
            </View>
            <View style={styles.statusBlock}>
              <View style={styles.statusDotWrap}>
                <Animated.View
                  style={[
                    styles.statusPulse,
                    { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                  ]}
                />
                <View style={styles.statusDot} />
              </View>
              <Text style={styles.statusText}>RPC LIVE</Text>
            </View>
          </View>

          <OGScanLiveStrip />

          <Pressable
            onPress={() => onOpen(featured.route, featured.id)}
            style={styles.hero}
            testID="tools-hero"
          >
            <LinearGradient
              colors={[`${featured.accent}38`, `${featured.gradient[1]}1A`, "rgba(3,7,8,0.0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroTopRow}>
              <View style={styles.heroBadge}>
                <Sparkles color={Colors.mint} size={11} strokeWidth={3} />
                <Text style={styles.heroBadgeText}>FEATURED</Text>
              </View>
              <View style={styles.heroLive}>
                <View style={styles.heroLiveDot} />
                <Text style={styles.heroLiveText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.heroBody}>
              <LinearGradient
                colors={featured.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIcon}
              >
                <featured.Icon color={Colors.ink} size={28} strokeWidth={2.6} />
              </LinearGradient>
              <View style={styles.heroText}>
                <Text style={styles.heroName}>{featured.name}</Text>
                <Text style={styles.heroTag}>{featured.tagline}</Text>
              </View>
            </View>

            <View style={styles.scanRow}>
              <ScanLine color={Colors.muted} size={16} strokeWidth={2.6} />
              <TextInput
                value={scan}
                onChangeText={setScan}
                placeholder="Paste any Solana contract to scan…"
                placeholderTextColor={Colors.muted}
                style={styles.scanInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleScanSubmit}
                testID="tools-scan-input"
              />
              {scan.length > 0 ? (
                <Pressable
                  onPress={handleScanSubmit}
                  style={styles.scanSubmit}
                  testID="tools-scan-submit"
                >
                  <ArrowRight color={Colors.ink} size={14} strokeWidth={3} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={onPasteScan}
                  style={styles.scanPaste}
                  testID="tools-scan-paste"
                >
                  <ClipboardIcon color={Colors.text} size={13} strokeWidth={2.6} />
                  <Text style={styles.scanPasteText}>Paste</Text>
                </Pressable>
              )}
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push("/lobbies" as never);
            }}
            style={styles.lobbyBanner}
            testID="tools-lobbies"
          >
            <LinearGradient
              colors={["rgba(244,244,245,0.14)", "rgba(184,190,200,0.10)", "rgba(229,231,235,0.08)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.lobbyTopRow}>
              <View style={styles.lobbyEyebrow}>
                <View style={styles.lobbyDot} />
                <Text style={styles.lobbyEyebrowText}>NEW · LIVE NOW</Text>
              </View>
              <View style={styles.lobbyCountChip}>
                <Mic color={Colors.rose} size={11} strokeWidth={3} />
                <Text style={styles.lobbyCountText}>VOICE</Text>
              </View>
            </View>
            <View style={styles.lobbyBody}>
              <LinearGradient
                colors={[Colors.rose, Colors.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.lobbyIcon}
              >
                <Mic color={Colors.ink} size={26} strokeWidth={2.6} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.lobbyTitle}>Trading Lobbies</Text>
                <Text style={styles.lobbySub}>Trade together. Watch together. Win together.</Text>
                <Text style={styles.lobbyBlurb}>
                  Live voice rooms with shared watchlists, charts and wallet tracking.
                </Text>
              </View>
              <ChevronRight color={Colors.text} size={18} strokeWidth={2.6} />
            </View>
          </Pressable>

          <View style={styles.statsRow}>
            <StatTile
              label="MODULES"
              value={SOLTOOLS_MODULE_COUNT.toString()}
              accent={Colors.mint}
              Icon={Wrench}
            />
            <StatTile
              label="LIVE"
              value={liveModuleCount.toString()}
              accent={Colors.cyan}
              Icon={Activity}
            />
            <StatTile
              label="BETA"
              value={betaModuleCount.toString()}
              accent={Colors.rose}
              Icon={Sparkles}
            />
            <StatTile
              label="USED"
              value={recent.length.toString()}
              accent={Colors.violet}
              Icon={Clock}
            />
          </View>

          <View style={styles.platformNotice}>
            <View style={styles.platformNoticeIcon}>
              <Lock color={Colors.goldBright} size={15} strokeWidth={2.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.platformNoticeTitle}>App Store safety mode</Text>
              <Text style={styles.platformNoticeBody}>{SOLTOOLS_TRADING_DISABLED_MESSAGE}</Text>
            </View>
          </View>

          {recentTools.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={styles.sectionHeadLeft}>
                  <Clock color={Colors.violet} size={14} strokeWidth={2.8} />
                  <Text style={styles.sectionTitle}>Recently used</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setRecent([]);
                    persistRecent([]).catch(() => {});
                  }}
                  hitSlop={8}
                  testID="tools-clear-recent"
                >
                  <Text style={styles.sectionAction}>Clear</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentRow}
              >
                {recentTools.map((t) => (
                  <Pressable
                    key={t.id}
                    style={styles.recentCard}
                    onPress={() => onOpen(t.route, t.id)}
                    testID={`recent-${t.id}`}
                  >
                    <LinearGradient
                      colors={[`${t.accent}1F`, "rgba(3,7,8,0.0)"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View
                      style={[
                        styles.recentIcon,
                        { backgroundColor: `${t.accent}1A`, borderColor: `${t.accent}55` },
                      ]}
                    >
                      <t.Icon color={t.accent} size={18} strokeWidth={2.6} />
                    </View>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={styles.recentTag} numberOfLines={1}>
                      {t.tagline}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={styles.sectionHeadLeft}>
                <Flame color={Colors.orange} size={14} strokeWidth={2.8} />
                <Text style={styles.sectionTitle}>All tools</Text>
                <View style={styles.countChip}>
                  <Text style={styles.countChipText}>{filtered.length}</Text>
                </View>
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Search color={Colors.muted} size={16} strokeWidth={2.4} />
              <TextInput
                testID="tools-search"
                placeholder="Search tools…"
                placeholderTextColor={Colors.muted}
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {query.trim().length > 0 ? (
              <View style={styles.list}>
                {filtered.map((t) => (
                  <ToolRow key={t.id} tool={t} onPress={() => onOpen(t.route, t.id)} />
                ))}
                {filtered.length === 0 && (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No tools match</Text>
                    <Text style={styles.emptyBody}>Try a different keyword.</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={{ marginTop: 6 }}>
                {CATEGORIES.map((cat) => {
                  const items = ALL_TOOLS.filter((t) => t.category === cat.key);
                  if (items.length === 0) return null;
                  return (
                    <View key={cat.key} style={styles.catBlock}>
                      <View style={styles.catHead}>
                        <View style={[styles.catIcon, { backgroundColor: `${cat.accent}1A`, borderColor: `${cat.accent}55` }]}>
                          <cat.Icon color={cat.accent} size={13} strokeWidth={2.8} />
                        </View>
                        <Text style={styles.catTitle}>{cat.label}</Text>
                        <View style={styles.catCount}>
                          <Text style={[styles.catCountText, { color: cat.accent }]}>{items.length}</Text>
                        </View>
                      </View>
                      <View style={styles.list}>
                        {items.map((t) => (
                          <ToolRow key={t.id} tool={t} onPress={() => onOpen(t.route, t.id)} />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.footerNote}>
            <Zap color={Colors.mint} size={14} strokeWidth={2.6} />
            <Text style={styles.footerText}>
              Full SOL Tools platform map · Powered by Helius + DexScreener + Supabase
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
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
    <View style={[styles.statTile, { borderColor: `${accent}33` }]}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}1A` }]}>
        <Icon color={accent} size={12} strokeWidth={2.8} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ToolRow({ tool, onPress }: { tool: Tool; onPress: () => void }) {
  return (
    <Pressable
      testID={`tool-${tool.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: `${tool.accent}33` },
        pressed && styles.rowPressed,
      ]}
    >
      <LinearGradient
        colors={[tool.glow, "rgba(3,7,8,0.0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={tool.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconWrap}
      >
        <tool.Icon color={Colors.ink} size={26} strokeWidth={2.6} />
      </LinearGradient>

      <View style={styles.rowMid}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowName} numberOfLines={1}>
            {tool.name}
          </Text>
          {(() => {
            const isLive = tool.status === "LIVE";
            const isNew = tool.status === "NEW";
            const isGated = tool.status === "GATED";
            const color = isLive ? Colors.mint : isNew ? Colors.rose : isGated ? Colors.goldBright : Colors.orange;
            const PillIcon = isLive ? Activity : isGated ? Lock : Sparkles;
            return (
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: `${color}26`,
                    borderColor: `${color}66`,
                  },
                ]}
              >
                <PillIcon color={color} size={10} strokeWidth={3} />
                <Text style={[styles.statusPillText, { color }]}>{tool.status}</Text>
              </View>
            );
          })()}
        </View>

        <Text style={styles.rowTag} numberOfLines={1}>
          {tool.tagline}
        </Text>
        <Text style={styles.rowDesc} numberOfLines={2}>
          {tool.description}
        </Text>

        <View style={styles.tagsRow}>
          {tool.tags.map((tag) => (
            <View
              key={tag}
              style={[styles.tagChip, { borderColor: `${tool.accent}33` }]}
            >
              <Text style={[styles.tagText, { color: tool.accent }]}>{tag}</Text>
            </View>
          ))}
        </View>

        <View style={styles.openRow}>
          <Text style={[styles.openText, { color: tool.accent }]}>{tool.status === "GATED" ? "View launch gate" : "Open tool"}</Text>
          <ArrowRight color={tool.accent} size={14} strokeWidth={3} />
        </View>
      </View>

      <ChevronRight color={Colors.muted} size={20} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 140 },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 12,
  },
  headerBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerBadgeText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginTop: 10,
  },
  headerSub: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  statusBlock: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  statusDotWrap: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.mint,
  },
  statusPulse: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.mint,
  },
  statusText: {
    color: Colors.mint,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  hero: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: Colors.card,
    padding: 18,
    overflow: "hidden",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  heroBadgeText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  heroLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(244,244,245,0.08)",
    borderWidth: 1,
    borderColor: "rgba(244,244,245,0.18)",
  },
  heroLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.rose },
  heroLiveText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  heroBody: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1 },
  heroName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  heroTag: { color: Colors.muted, fontSize: 13, fontWeight: "700", marginTop: 2 },

  scanRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 14,
    backgroundColor: "rgba(3,7,8,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  scanInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", padding: 0 },
  scanPaste: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  scanPasteText: { color: Colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  scanSubmit: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.mint,
  },

  statsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  statTile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
  },
  statIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: -0.4,
  },
  statLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 2,
  },

  platformNotice: {
    marginTop: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.24)",
    backgroundColor: "rgba(216,183,90,0.075)",
    flexDirection: "row",
    gap: 12,
  },
  platformNoticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.34)",
    backgroundColor: "rgba(244,198,91,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  platformNoticeTitle: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  platformNoticeBody: { color: Colors.muted, fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 3 },

  section: { marginTop: 22 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  sectionAction: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  countChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  countChipText: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  recentRow: { gap: 10, paddingRight: 4 },
  recentCard: {
    width: 160,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  recentName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 10,
  },
  recentTag: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    padding: 0,
  },

  list: { marginTop: 14, gap: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  rowPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1, gap: 4 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  rowTag: { color: Colors.text, fontSize: 13, fontWeight: "700", opacity: 0.9 },
  rowDesc: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 2,
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(3,7,8,0.5)",
  },
  tagText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  openText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },

  empty: { width: "100%", paddingVertical: 40, alignItems: "center" },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  emptyBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },

  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    alignSelf: "center",
  },
  footerText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },

  lobbyBanner: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(244,244,245,0.20)",
    backgroundColor: Colors.card,
    padding: 16,
    overflow: "hidden",
  },
  lobbyTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lobbyEyebrow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.5)",
    borderWidth: 1, borderColor: "rgba(244,244,245,0.22)",
  },
  lobbyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.rose },
  lobbyEyebrowText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  lobbyCountChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(244,244,245,0.10)",
    borderWidth: 1, borderColor: "rgba(244,244,245,0.20)",
  },
  lobbyCountText: { color: Colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  lobbyBody: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 14 },
  lobbyIcon: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  lobbyTitle: { color: Colors.text, fontSize: 19, fontWeight: "900", letterSpacing: -0.4 },
  lobbySub: { color: Colors.text, fontSize: 12, fontWeight: "800", marginTop: 2, opacity: 0.9 },
  lobbyBlurb: { color: Colors.muted, fontSize: 11, fontWeight: "600", marginTop: 4, lineHeight: 15 },

  catBlock: { marginTop: 14 },
  catHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 8,
  },
  catIcon: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  catTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  catCount: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  catCountText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
});
