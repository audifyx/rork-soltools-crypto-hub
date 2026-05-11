import { useQuery } from "@tanstack/react-query";
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
  House,
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
  Linking,
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
import { fmtPrice, fmtUsd } from "@/utils/format";
import { fetchDexToken, getNewSolanaPairs, searchSolanaPairs, type DexPair, type DexTokenSnapshot } from "@/lib/api/dexscreener";
import { getQuote } from "@/lib/api/jupiter";
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
    tagline: "Trading features coming in a future release",
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
    tagline: "Inspect routing between Solana DEXs",
    description: "Research-only view of Jupiter route hops, price impact and per-DEX splits. Execution is not available yet.",
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
  {
    id: "smart-money-feed",
    route: "/tool/smart-money-feed",
    name: "Smart Money Feed",
    tagline: "Whales, exits, conviction entries",
    description: "Realtime feed for whale buys/sells, smart wallet entries, recurring wallets, accumulation waves and major movements.",
    Icon: Radar, accent: Colors.cyan, glow: "rgba(229,231,235,0.14)",
    gradient: [Colors.cyan, Colors.mint], tags: ["Whales", "Live", "Flow"], status: "LIVE", category: "wallet",
  },
  {
    id: "dev-wallet-tracker",
    route: "/tool/dev-wallet-tracker",
    name: "Dev Wallet Tracker",
    tagline: "Deployer clusters and rug history",
    description: "Track deployers, linked wallets, funding wallets, sniper wallets, connected launches, risk score and developer history.",
    Icon: Network, accent: Colors.rose, glow: "rgba(244,244,245,0.12)",
    gradient: [Colors.rose, Colors.orange], tags: ["Dev", "Clusters", "Risk"], status: "LIVE", category: "risk",
  },
  {
    id: "narrative-engine",
    route: "/tool/narrative-engine",
    name: "Narrative Engine",
    tagline: "KOL, meme, AI and macro catalysts",
    description: "Score social acceleration, KOL mentions, political catalysts, AI narratives, Solana ecosystem trends and momentum shifts.",
    Icon: Brain, accent: Colors.violet, glow: "rgba(184,190,200,0.14)",
    gradient: [Colors.violet, Colors.cyan], tags: ["KOL", "Narrative", "AI"], status: "LIVE", category: "analysis",
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
  const creditTag = module.status;
  const route = module.category === "launchpad"
    ? "/(tabs)/discover"
    : module.route ?? `/tool/${module.id}`;
  return {
    id: module.id,
    route,
    name: module.name,
    tagline: module.status === "gated" ? "Paused until App Store launch" : `${module.surface} · ${module.status.toUpperCase()}`,
    description: module.gatedReason ?? `${module.name} is wired into ${module.surface} using the existing $OGS token data layer and routes.`,
    Icon: moduleIconForCategory(module.category),
    accent,
    glow: `${accent}18`,
    gradient: [accent, Colors.silver],
    tags: [module.category, module.surface.split(" ")[0] ?? "$OGS", creditTag].slice(0, 3),
    status: moduleStatusToToolStatus(module.status),
    category,
  };
}

const ADMIN_DASHBOARD_TOOL: Tool = {
  id: "admin-dashboard",
  route: "/admin",
  name: "Admin Dashboard",
  tagline: "Manage users, feeds, tools, and platform ops",
  description: "Core operator dashboard for moderation, platform checks, live data controls, and admin-only workflows.",
  Icon: Shield,
  accent: Colors.goldBright,
  glow: "rgba(244,198,91,0.18)",
  gradient: [Colors.goldBright, Colors.orange],
  tags: ["Admin", "Ops", "Live"],
  status: "LIVE",
  category: "platform",
};

const CORE_TOOL_IDS = new Set<string>([
  "token-lookup",
  "wallet-tracker",
  "dev-wallet-tracker",
  "narrative-engine",
  "smart-money-feed",
]);

const CORE_TOOLS: Tool[] = [
  ...TOOLS.filter((tool) => CORE_TOOL_IDS.has(tool.id)),
  ADMIN_DASHBOARD_TOOL,
];

const RECENT_KEY = "tools.recent.v1";
const MAX_RECENT = 5;

const OGSCAN_TOKEN_MINT = "EfnZmcFKMXofKA5V5ujvjqtSorvuQD2MzJPz3dxXpump";
const OGSCAN_DEV_WALLET = "CicbPxARTDrwQ4XcxWsn6SYeG4FMJHirS633cZUJeQDh";
const OGSCAN_STATE_KEY = "ogscan.mobile.state.v1";

type OGWebTool = {
  slug: string;
  title: string;
  path: string;
  page: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
};

const OG_WEB_TOOLS: OGWebTool[] = [
  { slug: "command", title: "Command", path: "/app", page: "1", description: "Main OGScan dashboard and tool launcher.", Icon: House, accent: "#B8FF3C" },
  { slug: "our-coin", title: "Our Coin", path: "/our-coin", page: "2", description: "Official CA, dev wallet, chart links, and copy actions.", Icon: Coins, accent: Colors.goldBright },
  { slug: "roadmap", title: "Roadmap", path: "/roadmap", page: "3", description: "$OGS token mission, rollout plan, and community links.", Icon: Route, accent: Colors.cyan },
  { slug: "market-pulse", title: "Market Pulse", path: "/market-pulse", page: "4", description: "Live token stats, liquidity, holders, score, and flags.", Icon: Activity, accent: "#B8FF3C" },
  { slug: "snipe-feed", title: "Snipe Feed", path: "/snipe-feed", page: "5", description: "Fresh launches, repeat dev wallets, risk, and heat scoring.", Icon: Radar, accent: Colors.orange },
  { slug: "scanner", title: "Scanner", path: "/scanner", page: "6", description: "Paste mint or ticker and inspect token safety signals.", Icon: ScanLine, accent: Colors.cyan },
  { slug: "og-finder", title: "OG Finder", path: "/og-finder", page: "7", description: "Find the original token and separate it from copycats.", Icon: Fingerprint, accent: "#B8FF3C" },
  { slug: "pairs", title: "Pairs", path: "/pairs", page: "8", description: "Fresh Solana pairs and early liquidity discovery.", Icon: Layers, accent: Colors.cyan },
  { slug: "migrations", title: "Migrations", path: "/migrations", page: "9", description: "Pump.fun and liquidity migration breakout watch.", Icon: Repeat, accent: Colors.goldBright },
  { slug: "trending", title: "Trending", path: "/trending", page: "10", description: "Moving Solana coins by 5m, 1h, 6h, and 24h.", Icon: TrendingUp, accent: "#B8FF3C" },
  { slug: "whales", title: "Whales", path: "/whales", page: "11", description: "Largest holders, concentration, and whale warnings.", Icon: Waves, accent: Colors.cyan },
  { slug: "tx-feed", title: "Tx Feed", path: "/tx-feed", page: "12", description: "Live parsed transaction tape for the selected mint.", Icon: ClipboardIcon, accent: Colors.orange },
  { slug: "tech", title: "Tech", path: "/tech", page: "14", description: "Jupiter, Helius, Birdeye, QuickNode, Alchemy stack.", Icon: Network, accent: Colors.cyan },
];

const OG_WEB_TOOLS_AS_TOOLS: Tool[] = OG_WEB_TOOLS.map((tool) => ({
  id: `ogscan-${tool.slug}`,
  route: `/ogscan/${tool.slug}`,
  name: `OGScan ${tool.title}`,
  tagline: `OG Scanner page ${tool.page} · ${tool.path}`,
  description: tool.description,
  Icon: tool.Icon,
  accent: tool.accent,
  glow: `${tool.accent}18`,
  gradient: [tool.accent, Colors.cyan],
  tags: ["OGScan", "Live", `Page ${tool.page}`],
  status: "LIVE",
  category: tool.slug === "our-coin" || tool.slug === "tech" || tool.slug === "roadmap" || tool.slug === "command" ? "platform" : "analysis",
}));

const PLATFORM_MODULE_TOOLS: Tool[] = SOLTOOLS_PLATFORM_MODULES.map(moduleToTool);

function uniqueToolsById(tools: Tool[]): Tool[] {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    if (seen.has(tool.id)) return false;
    seen.add(tool.id);
    return true;
  });
}

const ALL_TOOLS: Tool[] = uniqueToolsById([
  ...CORE_TOOLS,
  ...OG_WEB_TOOLS_AS_TOOLS,
  ...TOOLS,
  ...PLATFORM_MODULE_TOOLS,
]);

type RecentItem = { id: string; ts: number };
type OgScanSection = "home" | "scan" | "live" | "watch" | "more";
type OgScanAppState = {
  selectedMint: string;
  watchedMints: string[];
  watchedDevs: string[];
  recentSearches: string[];
  activeChain: "solana";
};

const DEFAULT_OGSCAN_STATE: OgScanAppState = {
  selectedMint: OGSCAN_TOKEN_MINT,
  watchedMints: [OGSCAN_TOKEN_MINT],
  watchedDevs: [OGSCAN_DEV_WALLET],
  recentSearches: ["OGScan", OGSCAN_TOKEN_MINT],
  activeChain: "solana",
};

export default function ToolsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState<string>("");
  const [scan, setScan] = useState<string>("");
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [ogSection, setOgSection] = useState<OgScanSection>("home");
  const [ogState, setOgState] = useState<OgScanAppState>(DEFAULT_OGSCAN_STATE);
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

    AsyncStorage.getItem(OGSCAN_STATE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<OgScanAppState>;
          setOgState({
            ...DEFAULT_OGSCAN_STATE,
            ...parsed,
            activeChain: "solana",
            selectedMint: parsed.selectedMint ?? OGSCAN_TOKEN_MINT,
            watchedMints: Array.isArray(parsed.watchedMints) ? parsed.watchedMints : DEFAULT_OGSCAN_STATE.watchedMints,
            watchedDevs: Array.isArray(parsed.watchedDevs) ? parsed.watchedDevs : DEFAULT_OGSCAN_STATE.watchedDevs,
            recentSearches: Array.isArray(parsed.recentSearches) ? parsed.recentSearches : DEFAULT_OGSCAN_STATE.recentSearches,
          });
        } catch (e) {
          console.log("[ogscan] parse persisted state error", e);
        }
      })
      .catch((e) => console.log("[ogscan] read persisted state error", e));
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(OGSCAN_STATE_KEY, JSON.stringify(ogState)).catch((e) => console.log("[ogscan] persist state error", e));
  }, [ogState]);

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

  const handleScanSubmit = useCallback(() => {
    const v = scan.trim();
    if (!v) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    pushRecent("token-lookup");
    router.push({ pathname: "/tool/token-lookup", params: { ca: v } } as never);
    setScan("");
  }, [scan, pushRecent, router]);

  const selectOgMint = useCallback((mint: string) => {
    const normalized = mint.trim() || OGSCAN_TOKEN_MINT;
    setOgState((prev) => ({
      ...prev,
      selectedMint: normalized,
      watchedMints: prev.watchedMints.includes(normalized) ? prev.watchedMints : [normalized, ...prev.watchedMints].slice(0, 25),
      recentSearches: [normalized, ...prev.recentSearches.filter((item) => item !== normalized)].slice(0, 12),
    }));
  }, []);

  const selectOgDev = useCallback((wallet: string) => {
    const normalized = wallet.trim() || OGSCAN_DEV_WALLET;
    setOgState((prev) => ({
      ...prev,
      watchedDevs: prev.watchedDevs.includes(normalized) ? prev.watchedDevs : [normalized, ...prev.watchedDevs].slice(0, 25),
      recentSearches: [normalized, ...prev.recentSearches.filter((item) => item !== normalized)].slice(0, 12),
    }));
    setOgSection("watch");
  }, []);

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
              <Text style={styles.headerTitle}>OG Scanner</Text>
              <Text style={styles.headerSub}>
                Meme market terminal for wallets, narratives, whales and holder risk.
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
              <Text style={styles.statusText}>OG LIVE</Text>
            </View>
          </View>

          <OGScanLiveStrip />

          <OGScanMobileCommandCenter
            activeSection={ogSection}
            appState={ogState}
            onSectionChange={setOgSection}
            onSelectMint={selectOgMint}
            onSelectDev={selectOgDev}
            onOpen={onOpen}
          />

          <OGTerminalHero
            scan={scan}
            setScan={setScan}
            onSubmit={handleScanSubmit}
            onPaste={onPasteScan}
            onOpen={onOpen}
          />

          <OGStandaloneToolGrid
            tools={OG_WEB_TOOLS}
            onOpen={(slug) => onOpen(`/ogscan/${slug}`, `ogscan-${slug}`)}
          />

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
                <Shield color={Colors.goldBright} size={14} strokeWidth={2.8} />
                <Text style={styles.sectionTitle}>Full tool set</Text>
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
Full tool deck · OG Scanner pages + current tools + wallet intel + admin dashboard
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function OGStandaloneToolGrid({ tools, onOpen }: { tools: OGWebTool[]; onOpen: (slug: string) => void }) {
  return (
    <View style={styles.ogEmbedDeck} testID="ogscan-standalone-tool-grid">
      <View style={styles.ogEmbedHeadRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ogEmbedEyebrow}>STANDALONE WEB TOOLS</Text>
          <Text style={styles.ogEmbedTitle}>One page per scanner</Text>
          <Text style={styles.ogEmbedSub}>Each card opens its own mobile screen and embeds the direct OGScan URL.</Text>
        </View>
        <View style={styles.ogEmbedLivePill}>
          <View style={styles.ogEmbedLiveDot} />
          <Text style={styles.ogEmbedLiveText}>WEB API</Text>
        </View>
      </View>
      <View style={styles.ogEmbedGrid}>
        {tools.map((tool) => {
          const Icon = tool.Icon;
          return (
            <Pressable
              key={tool.slug}
              onPress={() => onOpen(tool.slug)}
              style={({ pressed }) => [styles.ogEmbedCard, pressed && styles.cardPressed]}
              testID={`open-ogscan-${tool.slug}`}
            >
              <LinearGradient colors={[`${tool.accent}22`, "rgba(0,0,0,0.05)"]} style={StyleSheet.absoluteFill} />
              <View style={[styles.ogEmbedIcon, { borderColor: `${tool.accent}55` }]}>
                <Icon color={tool.accent} size={18} strokeWidth={2.8} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.ogEmbedTitleRow}>
                  <Text style={styles.ogEmbedCardTitle} numberOfLines={1}>{tool.title}</Text>
                  <Text style={styles.ogEmbedPage}>PAGE {tool.page}</Text>
                </View>
                <Text style={styles.ogEmbedDesc} numberOfLines={2}>{tool.description}</Text>
                <Text style={styles.ogEmbedPath} numberOfLines={1}>www.ogscan.fun{tool.path}</Text>
              </View>
              <ChevronRight color={Colors.muted} size={17} strokeWidth={2.6} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const LIVE_SCANNERS = [
  { id: "wallet-tracker", route: "/tool/wallet-tracker", title: "Wallet Intel", sub: "PnL, holdings, tags", metric: "+42 smart entries", Icon: Wallet, accent: Colors.mint },
  { id: "dev-wallet-tracker", route: "/tool/dev-wallet-tracker", title: "Dev Tracker", sub: "Deployers + clusters", metric: "18 risky launches", Icon: Network, accent: Colors.rose },
  { id: "holder-analysis", route: "/tool/holder-analysis", title: "Holder Map", sub: "Insiders + diamonds", metric: "31% whale conc.", Icon: PieChart, accent: Colors.orange },
  { id: "whale-tracker", route: "/tool/whale-tracker", title: "Whale Tape", sub: "Buys, sells, exits", metric: "$2.4M flow", Icon: Waves, accent: Colors.cyan },
] as const;

const SMART_FEED = [
  { wallet: "7Xh…9Kq", action: "accumulated", token: "$WIF", size: "$184K", conviction: "HIGH" },
  { wallet: "F3d…2Lm", action: "rotated into", token: "$POPCAT", size: "$91K", conviction: "MED" },
  { wallet: "9Qa…Rug", action: "linked dev sell", token: "$NOVA", size: "$38K", conviction: "RISK" },
] as const;

const NARRATIVES = [
  { name: "Solana AI agents", score: 94, delta: "+28%", color: Colors.cyan },
  { name: "Political memes", score: 88, delta: "+19%", color: Colors.orange },
  { name: "Cat meta", score: 81, delta: "+11%", color: Colors.mint },
] as const;

function OGTerminalHero({ scan, setScan, onSubmit, onPaste, onOpen }: { scan: string; setScan: (v: string) => void; onSubmit: () => void; onPaste: () => void; onOpen: (route: string, id?: string) => void }) {
  return (
    <View style={styles.ogHero} testID="og-scanner-dashboard">
      <LinearGradient colors={["rgba(0,255,178,0.18)", "rgba(255,122,26,0.12)", "rgba(0,0,0,0)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.ogGridGlow} />
      <View style={styles.ogHeroTop}>
        <View style={styles.terminalPill}><Radar color={Colors.mint} size={13} strokeWidth={3} /><Text style={styles.terminalPillText}>OGSCAN TERMINAL</Text></View>
        <Text style={styles.terminalLive}>LIVE FEEDS</Text>
      </View>
      <Text style={styles.ogTitle}>Find origin coins before CT catches up.</Text>
      <Text style={styles.ogSub}>Scan contracts, wallets, deployers and narratives with smart-money routing in one command center.</Text>
      <View style={styles.commandLine}>
        <Text style={styles.prompt}>scan:</Text>
        <TextInput value={scan} onChangeText={setScan} placeholder="contract / wallet / ticker" placeholderTextColor={Colors.muted} style={styles.commandInput} autoCapitalize="none" autoCorrect={false} onSubmitEditing={onSubmit} />
        <Pressable onPress={scan.length ? onSubmit : onPaste} style={styles.commandBtn}><Text style={styles.commandBtnText}>{scan.length ? "RUN" : "PASTE"}</Text></Pressable>
      </View>
      <View style={styles.ogActions}>
        <Pressable onPress={() => onOpen("/tool/narrative-engine", "narrative-engine")} style={styles.ogAction}><Brain color={Colors.violet} size={16} /><Text style={styles.ogActionText}>Narratives</Text></Pressable>
        <Pressable onPress={() => onOpen("/tool/wallet-tracker", "wallet-tracker")} style={styles.ogAction}><UserSearch color={Colors.mint} size={16} /><Text style={styles.ogActionText}>Wallet lookup</Text></Pressable>
        <Pressable onPress={() => onOpen("/tool/holder-analysis", "holder-analysis")} style={styles.ogAction}><Fingerprint color={Colors.orange} size={16} /><Text style={styles.ogActionText}>Holder risk</Text></Pressable>
      </View>
    </View>
  );
}

function LiveScannerGrid({ onOpen }: { onOpen: (route: string, id?: string) => void }) {
  return <View style={styles.ogSection}><Text style={styles.ogSectionTitle}>Live scanners</Text><View style={styles.scannerGrid}>{LIVE_SCANNERS.map((s) => <Pressable key={s.id} onPress={() => onOpen(s.route, s.id)} style={[styles.scannerCard, { borderColor: `${s.accent}44` }]}><s.Icon color={s.accent} size={22} strokeWidth={2.8} /><Text style={styles.scannerTitle}>{s.title}</Text><Text style={styles.scannerSub}>{s.sub}</Text><Text style={[styles.scannerMetric, { color: s.accent }]}>{s.metric}</Text></Pressable>)}</View></View>;
}

function SmartMoneyPanel({ onOpen }: { onOpen: (route: string, id?: string) => void }) {
  return <View style={styles.feedPanel}><View style={styles.feedHead}><Text style={styles.ogSectionTitle}>Smart money tape</Text><Pressable onPress={() => onOpen("/tool/whale-tracker", "whale-tracker")}><Text style={styles.feedAction}>Open whale feed</Text></Pressable></View>{SMART_FEED.map((f) => <View key={`${f.wallet}-${f.token}`} style={styles.feedRow}><View style={styles.feedDot} /><Text style={styles.feedText}><Text style={styles.feedWallet}>{f.wallet}</Text> {f.action} <Text style={styles.feedToken}>{f.token}</Text></Text><View style={styles.feedSize}><Text style={styles.feedSizeText}>{f.size}</Text><Text style={styles.feedConviction}>{f.conviction}</Text></View></View>)}</View>;
}

function NarrativeRankings() {
  return <View style={styles.feedPanel}><Text style={styles.ogSectionTitle}>Narrative rankings</Text>{NARRATIVES.map((n) => <View key={n.name} style={styles.narrativeRow}><View style={{ flex: 1 }}><Text style={styles.narrativeName}>{n.name}</Text><View style={styles.narrativeTrack}><View style={[styles.narrativeFill, { width: `${n.score}%`, backgroundColor: n.color }]} /></View></View><Text style={[styles.narrativeScore, { color: n.color }]}>{n.score}</Text><Text style={styles.narrativeDelta}>{n.delta}</Text></View>)}</View>;
}

function WalletIntelligenceRail({ onOpen }: { onOpen: (route: string, id?: string) => void }) {
  return <Pressable onPress={() => onOpen("/tool/wallet-tracker", "wallet-tracker")} style={styles.walletRail}><LinearGradient colors={["rgba(244,198,91,0.20)", "rgba(0,255,178,0.08)"]} style={StyleSheet.absoluteFill} /><Wallet color={Colors.goldBright} size={24} /><View style={{ flex: 1 }}><Text style={styles.walletRailTitle}>Connected wallet intelligence</Text><Text style={styles.walletRailSub}>Realized PnL, recurring wallets, labels, conviction tracking and token click-throughs.</Text></View><ChevronRight color={Colors.goldBright} size={18} /></Pressable>;
}

const OG_TABS: { key: OgScanSection; label: string; Icon: LucideIcon }[] = [
  { key: "home", label: "Home", Icon: House },
  { key: "scan", label: "Scan", Icon: ScanLine },
  { key: "live", label: "Live", Icon: Activity },
  { key: "watch", label: "Watch", Icon: Eye },
  { key: "more", label: "More", Icon: Layers },
];

const OG_FEATURES = {
  scan: [
    { title: "Token Scanner", body: "Liquidity, market cap, holders, verification, price, audit status.", route: "/tool/token-lookup", Icon: ScanLine, accent: Colors.cyan },
    { title: "OG Finder", body: "Original vs copycats ranked by liquidity, age, holders and organic score.", route: "/tool/og-finder", Icon: Crosshair, accent: Colors.mint },
    { title: "Market Pulse", body: "Price, volume, traders, holder growth, chart preview and risk flags.", route: "/tool/token-lookup", Icon: Gauge, accent: Colors.goldBright },
    { title: "Launch Analyzer", body: "Fresh launches, snipers, dev inference, launch heat and rug probability.", route: "/tool/launch-analyzer", Icon: Flame, accent: Colors.orange },
  ],
  live: [
    { title: "Snipe Feed", body: "Fresh boosts, hot launches, risky pools and score-ranked runners.", route: "/tool/snipe-feed", Icon: Radar, accent: Colors.mint },
    { title: "Trending", body: "5m, 1h, 6h and 24h rankings by txns, volume, boosts and buy ratio.", route: "/tool/trending", Icon: TrendingUp, accent: Colors.cyan },
    { title: "New Pair Radar", body: "DexScreener launches, migrations and liquidity movement.", route: "/tool/new-pairs", Icon: Route, accent: Colors.goldBright },
    { title: "Transaction Tape", body: "Live on-chain transactions, transfers and signatures with live polling.", route: "/tool/transaction-tape", Icon: Repeat, accent: Colors.violet },
  ],
  watch: [
    { title: "Watchlist", body: "Watched tokens, devs, alerts and hot activity in one saved state.", route: "/tool/watchlist", Icon: Eye, accent: Colors.mint },
    { title: "Dev Wallet Intel", body: "Launch history, linked wallets, funding wallets, rugs and wallet score.", route: "/tool/dev-wallet-tracker", Icon: Network, accent: Colors.rose },
    { title: "Whales", body: "Top holders, concentration, holder distribution and whale warnings.", route: "/tool/whale-tracker", Icon: Waves, accent: Colors.cyan },
    { title: "Alerts Center", body: "Watched dev launches, whale concentration and high-tx triggers.", route: "/tool/price-alerts", Icon: BellRing, accent: Colors.goldBright },
  ],
  more: [
    { title: "Our Coin", body: "Official OGScan CA, dev wallet and community links.", route: "/tool/token-lookup", Icon: Coins, accent: Colors.mint },

    { title: "$OGS Roadmap", body: "Community, tools, launch intelligence and multi-chain expansion.", route: "/communities", Icon: Route, accent: Colors.goldBright },
    { title: "API Status", body: "Jupiter, DexScreener, Helius, Birdeye and Supabase surfaces.", route: "/tool/api-status", Icon: Activity, accent: Colors.violet },
  ],
} as const;

function OGScanMobileCommandCenter({
  activeSection,
  appState,
  onSectionChange,
  onSelectMint,
  onSelectDev,
  onOpen,
}: {
  activeSection: OgScanSection;
  appState: OgScanAppState;
  onSectionChange: (section: OgScanSection) => void;
  onSelectMint: (mint: string) => void;
  onSelectDev: (wallet: string) => void;
  onOpen: (route: string, id?: string) => void;
}) {
  const shortMint = `${appState.selectedMint.slice(0, 5)}…${appState.selectedMint.slice(-5)}`;
  const selectedToken = useQuery<DexTokenSnapshot | null>({
    queryKey: ["ogscan", "selected-token", appState.selectedMint],
    queryFn: () => fetchDexToken(appState.selectedMint),
    enabled: appState.selectedMint.length >= 32,
    refetchInterval: 12_000,
    staleTime: 6_000,
  });
  const livePairs = useQuery<DexPair[]>({
    queryKey: ["ogscan", "live-pairs", activeSection],
    queryFn: () => (activeSection === "live" ? getNewSolanaPairs(12) : searchSolanaPairs("solana meme", 12)),
    refetchInterval: activeSection === "live" ? 15_000 : 30_000,
    staleTime: 10_000,
  });
  const quote = useQuery<{ outAmount?: string } | null>({
    queryKey: ["ogscan", "jupiter-quote", appState.selectedMint],
    queryFn: async () => {
      if (appState.selectedMint === "So11111111111111111111111111111111111111112") return null;
      return await getQuote({ inputMint: "So11111111111111111111111111111111111111112", outputMint: appState.selectedMint, amount: "100000000", slippageBps: 100 });
    },
    enabled: activeSection === "more" && appState.selectedMint.length >= 32,
    staleTime: 20_000,
  });
  const openDex = useCallback(() => {
    Linking.openURL(`https://dexscreener.com/solana/${appState.selectedMint}`).catch((e) => console.log("[ogscan] open dex error", e));
  }, [appState.selectedMint]);
  const copyMint = useCallback(() => {
    Clipboard.setStringAsync(appState.selectedMint).catch((e) => console.log("[ogscan] copy ca error", e));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [appState.selectedMint]);

  const cards = activeSection === "home" ? [...OG_FEATURES.scan.slice(0, 2), ...OG_FEATURES.live.slice(0, 2)] : OG_FEATURES[activeSection];
  const snap = selectedToken.data;
  const pairCount = livePairs.data?.length ?? 0;
  const quoteText = quote.data?.outAmount ? `${(Number(quote.data.outAmount) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens / 0.1 SOL` : quote.isFetching ? "quoting…" : "open Jupiter";

  return (
    <View style={styles.mobileShell} testID="ogscan-mobile-command-center">
      <LinearGradient colors={["rgba(98,208,255,0.14)", "rgba(0,255,178,0.08)", "rgba(0,0,0,0)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.mobileTopline}>
        <Text style={styles.mobileEyebrow}>OGSCAN MOBILE APP</Text>
        <Text style={styles.mobileChain}>SOLANA · SAVED STATE</Text>
      </View>
      <Text style={styles.mobileTitle}>Native command center, not a tools list.</Text>
      <Text style={styles.mobileCopy}>Bottom-tab product map for token scans, live launch radar, wallet/dev watch, whales and OGScan community systems.</Text>

      <View style={styles.mintPanel}>
        <View style={{ flex: 1 }}>
          <Text style={styles.mintLabel}>ACTIVE MINT</Text>
          <Text style={styles.mintValue}>{shortMint}</Text>
          <Text style={styles.mintSub}>Official OGScan token is loaded by default.</Text>
        </View>
        <Pressable onPress={() => onSelectMint(OGSCAN_TOKEN_MINT)} style={styles.mintButton}><Text style={styles.mintButtonText}>Use OG</Text></Pressable>
      </View>

      <View style={styles.mobileTabs}>
        {OG_TABS.map((tab) => {
          const active = activeSection === tab.key;
          return <Pressable key={tab.key} onPress={() => onSectionChange(tab.key)} style={[styles.mobileTab, active && styles.mobileTabActive]}><tab.Icon color={active ? Colors.ink : Colors.muted} size={14} strokeWidth={3} /><Text style={[styles.mobileTabText, active && styles.mobileTabTextActive]}>{tab.label}</Text></Pressable>;
        })}
      </View>

      <View style={styles.liveStatsRow}>
        <StatTile label="Price" value={snap?.priceUsd != null ? fmtPrice(snap.priceUsd) : selectedToken.isFetching ? "sync…" : "—"} accent={Colors.mint} Icon={Gauge} />
        <StatTile label="Market cap" value={snap?.marketCapUsd != null ? fmtUsd(snap.marketCapUsd) : selectedToken.isFetching ? "sync…" : "—"} accent={Colors.cyan} Icon={Droplets} />
        <StatTile label="Live pairs" value={livePairs.isFetching && pairCount === 0 ? "sync…" : String(pairCount)} accent={Colors.goldBright} Icon={Radar} />
      </View>

      <View style={styles.actionMatrix}>
        <Pressable onPress={() => onOpen(`/tool/token-lookup?ca=${encodeURIComponent(appState.selectedMint)}`, "token-lookup")} style={styles.matrixBtn}><Text style={styles.matrixText}>Open Scanner</Text></Pressable>
        <Pressable onPress={() => onOpen("/tool/whale-tracker", "whale-tracker")} style={styles.matrixBtn}><Text style={styles.matrixText}>Open Whales</Text></Pressable>
        <Pressable onPress={() => onOpen("/tool/transaction-tape", "transaction-tape")} style={styles.matrixBtn}><Text style={styles.matrixText}>Tx Tape</Text></Pressable>
        <Pressable onPress={copyMint} style={styles.matrixBtn}><Text style={styles.matrixText}>Copy CA</Text></Pressable>
        <Pressable onPress={openDex} style={styles.matrixBtnWide}><Text style={styles.matrixTextAccent}>Open DexScreener</Text></Pressable>
      </View>

      <View style={styles.mobileCardGrid}>
        {cards.map((card) => <Pressable key={card.title} onPress={() => onOpen(card.route, card.title.toLowerCase().replace(/\s+/g, "-"))} style={[styles.mobileToolCard, { borderColor: `${card.accent}44` }]}><card.Icon color={card.accent} size={21} strokeWidth={2.8} /><Text style={styles.mobileToolTitle}>{card.title}</Text><Text style={styles.mobileToolBody}>{card.body}</Text><Text style={[styles.mobileToolOpen, { color: card.accent }]}>Open full-screen tool →</Text></Pressable>)}
      </View>

      {activeSection === "watch" ? <Pressable onPress={() => onSelectDev(OGSCAN_DEV_WALLET)} style={styles.devIntel}><Network color={Colors.rose} size={18} /><View style={{ flex: 1 }}><Text style={styles.devIntelTitle}>Official dev wallet ready</Text><Text style={styles.devIntelBody}>{`${OGSCAN_DEV_WALLET.slice(0, 6)}…${OGSCAN_DEV_WALLET.slice(-6)}`} · tap to watch/unwatch and open dev intel.</Text></View></Pressable> : null}

      {activeSection === "more" ? <View style={styles.apiRail}><Text style={styles.savedTitle}>Jupiter route preview</Text><Text style={styles.savedBody}>{quoteText}</Text></View> : null}

      {livePairs.isError || selectedToken.isError ? <View style={styles.apiRail}><Text style={styles.apiError}>One source is rate-limited. Showing cached/fallback data and retrying automatically.</Text></View> : null}

      <View style={styles.savedRail}>
        <Text style={styles.savedTitle}>Saved mobile state</Text>
        <Text style={styles.savedBody}>{appState.watchedMints.length} watched mints · {appState.watchedDevs.length} watched devs · {appState.recentSearches.length} recent searches · DexScreener/Jupiter live</Text>
      </View>
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

  ogHero: {
    marginTop: 16,
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(0,255,178,0.28)",
    backgroundColor: "rgba(1,8,7,0.92)",
    overflow: "hidden",
  },
  ogGridGlow: { position: "absolute", right: -35, top: -25, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(0,255,178,0.12)" },
  ogHeroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  terminalPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(0,255,178,0.10)", borderWidth: 1, borderColor: "rgba(0,255,178,0.28)" },
  terminalPillText: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  terminalLive: { color: Colors.rose, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  ogTitle: { color: Colors.text, fontSize: 31, fontWeight: "900", letterSpacing: -1, lineHeight: 34, marginTop: 18 },
  ogSub: { color: Colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 19, marginTop: 8 },
  commandLine: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.48)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  prompt: { color: Colors.mint, fontSize: 12, fontWeight: "900" },
  commandInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "800", padding: 0 },
  commandBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, backgroundColor: Colors.mint },
  commandBtnText: { color: Colors.ink, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  ogActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  ogAction: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  ogActionText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  ogSection: { marginTop: 18 },
  ogSectionTitle: { color: Colors.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.35 },
  scannerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  scannerCard: { width: "48%", minHeight: 124, padding: 14, borderRadius: 20, borderWidth: 1, backgroundColor: "rgba(9,13,14,0.92)" },
  scannerTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", marginTop: 10 },
  scannerSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 3 },
  scannerMetric: { fontSize: 11, fontWeight: "900", marginTop: 12 },
  feedPanel: { marginTop: 18, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(9,13,14,0.92)" },
  feedHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  feedAction: { color: Colors.mint, fontSize: 11, fontWeight: "900" },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  feedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.mint },
  feedText: { flex: 1, color: Colors.muted, fontSize: 12, fontWeight: "700" },
  feedWallet: { color: Colors.text, fontWeight: "900" },
  feedToken: { color: Colors.goldBright, fontWeight: "900" },
  feedSize: { alignItems: "flex-end" },
  feedSizeText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  feedConviction: { color: Colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  narrativeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 13 },
  narrativeName: { color: Colors.text, fontSize: 12, fontWeight: "900", marginBottom: 6 },
  narrativeTrack: { height: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  narrativeFill: { height: 7, borderRadius: 999 },
  narrativeScore: { width: 30, fontSize: 15, fontWeight: "900", textAlign: "right" },
  narrativeDelta: { width: 42, color: Colors.mint, fontSize: 11, fontWeight: "900", textAlign: "right" },
  walletRail: { marginTop: 18, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: "rgba(244,198,91,0.25)", backgroundColor: Colors.card, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden" },
  walletRailTitle: { color: Colors.text, fontSize: 15, fontWeight: "900" },
  walletRailSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 3 },
  mobileShell: { marginTop: 16, padding: 16, borderRadius: 28, borderWidth: 1, borderColor: "rgba(98,208,255,0.22)", backgroundColor: "rgba(2,6,12,0.94)", overflow: "hidden" },
  mobileTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  mobileEyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  mobileChain: { color: Colors.goldBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  mobileTitle: { color: Colors.text, fontSize: 25, fontWeight: "900", letterSpacing: -0.8, lineHeight: 29, marginTop: 12 },
  mobileCopy: { color: Colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 6 },
  mintPanel: { marginTop: 14, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: "rgba(98,208,255,0.18)", backgroundColor: "rgba(255,255,255,0.045)", flexDirection: "row", alignItems: "center", gap: 10 },
  mintLabel: { color: Colors.muted2, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  mintValue: { color: Colors.text, fontSize: 17, fontWeight: "900", marginTop: 2 },
  mintSub: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  mintButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.mint },
  mintButtonText: { color: Colors.ink, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  mobileTabs: { flexDirection: "row", gap: 6, marginTop: 14, padding: 5, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  mobileTab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 8, borderRadius: 14 },
  mobileTabActive: { backgroundColor: Colors.mint },
  mobileTabText: { color: Colors.muted, fontSize: 8.5, fontWeight: "900" },
  mobileTabTextActive: { color: Colors.ink },
  liveStatsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionMatrix: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  matrixBtn: { width: "48%", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  matrixBtnWide: { width: "98%", paddingVertical: 11, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(98,208,255,0.10)", borderWidth: 1, borderColor: "rgba(98,208,255,0.26)" },
  matrixText: { color: Colors.text, fontSize: 11, fontWeight: "900", textAlign: "center" },
  matrixTextAccent: { color: Colors.cyan, fontSize: 11, fontWeight: "900", textAlign: "center" },
  mobileCardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  mobileToolCard: { width: "48%", minHeight: 154, padding: 13, borderRadius: 19, borderWidth: 1, backgroundColor: "rgba(7,12,20,0.94)" },
  mobileToolTitle: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 9 },
  mobileToolBody: { color: Colors.muted, fontSize: 10.5, fontWeight: "700", lineHeight: 15, marginTop: 5 },
  mobileToolOpen: { fontSize: 10, fontWeight: "900", marginTop: "auto" },
  devIntel: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: "rgba(230,242,255,0.20)", backgroundColor: "rgba(230,242,255,0.07)" },
  devIntelTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  devIntelBody: { color: Colors.muted, fontSize: 10.5, fontWeight: "700", lineHeight: 15, marginTop: 2 },
  apiRail: { marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(98,208,255,0.18)", backgroundColor: "rgba(98,208,255,0.07)" },
  apiError: { color: Colors.goldBright, fontSize: 10.5, fontWeight: "800", lineHeight: 15 },
  savedRail: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  savedTitle: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  savedBody: { color: Colors.muted, fontSize: 10.5, fontWeight: "700", marginTop: 3 },
  legacyHero: { opacity: 0.72 },
  ogEmbedDeck: {
    marginTop: 16,
    padding: 14,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(184,255,60,0.24)",
    backgroundColor: "rgba(0,8,12,0.92)",
    overflow: "hidden",
  },
  ogEmbedHeadRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  ogEmbedEyebrow: { color: "#B8FF3C", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  ogEmbedTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6, marginTop: 3 },
  ogEmbedSub: { color: Colors.muted, fontSize: 11.5, fontWeight: "700", lineHeight: 16, marginTop: 4 },
  ogEmbedLivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(98,208,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.24)",
  },
  ogEmbedLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#B8FF3C" },
  ogEmbedLiveText: { color: Colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  ogEmbedGrid: { gap: 10 },
  ogEmbedCard: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(4,10,18,0.96)",
    overflow: "hidden",
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  ogEmbedIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  ogEmbedTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  ogEmbedCardTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.2, flexShrink: 1 },
  ogEmbedPage: { color: "#B8FF3C", fontSize: 8.5, fontWeight: "900", letterSpacing: 0.8 },
  ogEmbedDesc: { color: Colors.muted, fontSize: 11, fontWeight: "700", lineHeight: 15, marginTop: 4 },
  ogEmbedPath: { color: Colors.cyan, fontSize: 10, fontWeight: "900", marginTop: 6 },

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
