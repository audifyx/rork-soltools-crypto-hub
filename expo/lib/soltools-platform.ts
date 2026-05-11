export type SolToolsModuleStatus = "live" | "beta" | "planned" | "gated";

export type SolToolsModuleCategory =
  | "wallet"
  | "token"
  | "advanced"
  | "basic"
  | "premium"
  | "ai"
  | "social"
  | "voice"
  | "notifications"
  | "credits"
  | "admin"
  | "theme"
  | "launchpad";

export interface SolToolsModuleSpec {
  id: string;
  name: string;
  category: SolToolsModuleCategory;
  surface: string;
  status: SolToolsModuleStatus;
  route?: string;
  creditCost?: number;
  gatedReason?: string;
}

export const SOLTOOLS_ADMIN_EMAIL = "audifyx@gmail.com";
export const SOLTOOLS_RESERVED_USERNAME = "administrator";
export const SOLTOOLS_OFFICIAL_TOKEN_CA = "HEivoBHhWT939vcaevGgZBtoArS4CAywCMjdVBTSpump";

export const SOLTOOLS_TRADING_DISABLED_MESSAGE =
  "Wallet connection, wallet creation/import/export, Phantom, Jupiter swaps, buying, and selling are paused until the App Store launch. $OGS token is currently live for social, discovery, charts, alerts, communities, and wallet/token research.";

export const SOLTOOLS_EDGE_FUNCTIONS = [
  "solana-tracker",
  "dex-screener",
  "token-data",
  "ai-analyzer",
  "generate-pnl-image",
  "discord-webhook",
  "livekit-token",
  "voice-token",
] as const;

export const SOLTOOLS_HELIUS_SECRET_KEYS = [
  "HELIUS_API_KEY",
  "HELIUS_API_KEY_2",
  "HELIUS_API_KEY_3",
  "HELIUS_API_KEY_4",
] as const;

export const SOLTOOLS_CREDIT_COSTS = {
  analyzeToken: 2,
  analyzeWallet: 3,
  aiChat: 1,
  generatePnLImage: 5,
  whaleScan: 2,
  holderAnalysis: 2,
  rugDetector: 2,
} as const;

export const SOLTOOLS_PLATFORM_MODULES: SolToolsModuleSpec[] = [
  { id: "wallet-search", name: "Wallet Search", category: "wallet", surface: "Wallet Tracker", status: "live", route: "/tool/wallet-tracker" },
  { id: "portfolio-overview", name: "Portfolio Overview", category: "wallet", surface: "Wallet Tracker", status: "live", route: "/tool/wallet-tracker" },
  { id: "token-list", name: "Token Holdings", category: "wallet", surface: "Wallet Tracker", status: "live", route: "/tool/wallet-tracker" },
  { id: "nft-gallery", name: "NFT Gallery", category: "wallet", surface: "Wallet Tracker", status: "planned", route: "/tool/wallet-tracker" },
  { id: "transaction-list", name: "Transaction List", category: "wallet", surface: "Wallet Tracker", status: "live", route: "/tool/wallet-tracker" },
  { id: "tracked-wallets", name: "Tracked Wallets", category: "wallet", surface: "Wallet Tracker", status: "live", route: "/tool/wallet-tracker" },
  { id: "wallet-import-export", name: "Create / Import / Export Wallet", category: "wallet", surface: "Wallet", status: "gated", route: "/wallet", gatedReason: SOLTOOLS_TRADING_DISABLED_MESSAGE },
  { id: "phantom-connect", name: "Phantom Connect", category: "wallet", surface: "Wallet", status: "gated", route: "/wallet", gatedReason: SOLTOOLS_TRADING_DISABLED_MESSAGE },
  { id: "jupiter-trading", name: "Jupiter Trading", category: "wallet", surface: "Wallet", status: "gated", route: "/wallet", gatedReason: SOLTOOLS_TRADING_DISABLED_MESSAGE },
  { id: "token-detail-popup", name: "Token Detail Popup", category: "token", surface: "Token Lookup", status: "live", route: "/tool/token-lookup" },
  { id: "tokens-tracker", name: "Tokens Tracker V2", category: "token", surface: "Discover", status: "live", route: "/(tabs)/discover" },
  { id: "charts-live", name: "Dex Charts Live", category: "token", surface: "Token Lookup", status: "live", route: "/tool/token-lookup" },
  { id: "token-sniper", name: "Token Sniper", category: "token", surface: "Tools", status: "beta", route: "/tool/token-sniper" },
  { id: "live-feed", name: "Live Token Feed", category: "token", surface: "Home", status: "live", route: "/(tabs)/home" },
  { id: "airdrop-analyzer", name: "Airdrop Analyzer", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/airdrop-analyzer" },
  { id: "burn-watcher", name: "Burn Watcher", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/burn-watcher" },
  { id: "fee-analyzer", name: "Fee Analyzer", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/fee-analyzer" },
  { id: "insider-detector", name: "Insider Detector", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/insider-detector" },
  { id: "jupiter-route-tracker", name: "Jupiter Route Tracker", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/jupiter-routes" },
  { id: "lp-position-scanner", name: "LP Position Scanner", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/lp-scanner" },
  { id: "liquidity-sniper", name: "Liquidity Sniper", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/liquidity-sniper" },
  { id: "mev-tracker", name: "MEV Tracker", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/mev-tracker" },
  { id: "multi-wallet-merge", name: "Multi Wallet Merge", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/multi-wallet" },
  { id: "profit-curve", name: "Profit Curve Generator", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/profit-curve" },
  { id: "program-monitor", name: "Program Interaction Monitor", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/program-monitor" },
  { id: "risk-detector", name: "Risk Detector", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/risk-detector", creditCost: SOLTOOLS_CREDIT_COSTS.rugDetector },
  { id: "rug-detector", name: "Rug Detector", category: "advanced", surface: "Advanced Tools", status: "live", route: "/tool/rug-detector", creditCost: SOLTOOLS_CREDIT_COSTS.rugDetector },
  { id: "sol-depletion", name: "SOL Depletion Warning", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/sol-depletion" },
  { id: "stake-account-tracker", name: "Stake Account Tracker", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/stake-tracker" },
  { id: "token-creator-tracker", name: "Token Creator Tracker", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/token-creator" },
  { id: "token-lock-monitor", name: "Token Lock Monitor", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/token-locks" },
  { id: "token-metadata-inspector", name: "Token Metadata Inspector", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/token-metadata" },
  { id: "trading-style-classifier", name: "Trading Style Classifier", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/trading-style" },
  { id: "transfer-profiler", name: "Transfer Profiler", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/transfer-profiler" },
  { id: "wallet-age", name: "Wallet Age Calculator", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/wallet-age" },
  { id: "wallet-graph", name: "Wallet Relationship Graph", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/wallet-graph" },
  { id: "wash-trading", name: "Wash Trading Scanner", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/wash-trading" },
  { id: "whale-concentration", name: "Whale Concentration", category: "advanced", surface: "Advanced Tools", status: "beta", route: "/tool/whale-concentration" },
  { id: "holder-analysis", name: "Holder Analysis", category: "basic", surface: "Tools", status: "beta", route: "/tool/holder-analysis" },
  { id: "impermanent-loss", name: "Impermanent Loss Calculator", category: "basic", surface: "Tools", status: "beta", route: "/tool/impermanent-loss" },
  { id: "liquidity-scanner", name: "Liquidity Scanner", category: "basic", surface: "Tools", status: "beta", route: "/tool/liquidity-scanner" },
  { id: "staking-calculator", name: "Staking Calculator", category: "basic", surface: "Tools", status: "beta", route: "/tool/staking-calculator" },
  { id: "wallet-profiler", name: "Wallet Profiler", category: "basic", surface: "Tools", status: "beta", route: "/tool/wallet-profiler" },
  { id: "pnl-tracker", name: "PnL Tracker", category: "premium", surface: "Premium", status: "beta", route: "/tool/pnl-analyzer" },
  { id: "portfolio-comparison", name: "Portfolio Comparison", category: "premium", surface: "Premium", status: "planned", route: "/tool/portfolio-comparison" },
  { id: "price-alerts", name: "Price Alerts", category: "premium", surface: "Tools", status: "live", route: "/tool/price-alerts" },
  { id: "shareable-pnl-card", name: "Shareable PnL Card", category: "premium", surface: "Tools", status: "beta", route: "/tool/portfolio-cards", creditCost: SOLTOOLS_CREDIT_COSTS.generatePnLImage },
  { id: "trade-history", name: "Trade History", category: "premium", surface: "Wallet", status: "gated", route: "/wallet", gatedReason: SOLTOOLS_TRADING_DISABLED_MESSAGE },
  { id: "whale-tracker", name: "Whale Tracker", category: "premium", surface: "Tools", status: "live", route: "/tool/whale-tracker" },
  { id: "ai-chat", name: "AI Chat", category: "ai", surface: "AlphaChat", status: "beta", route: "/tool/ai-chat", creditCost: SOLTOOLS_CREDIT_COSTS.aiChat },
  { id: "wallet-analyzer", name: "Wallet Analyzer", category: "ai", surface: "Tools", status: "beta", route: "/tool/ai-wallet-analyzer", creditCost: SOLTOOLS_CREDIT_COSTS.analyzeWallet },
  { id: "ai-token-analysis", name: "AI Token Analysis", category: "ai", surface: "Tools", status: "beta", route: "/tool/ai-analysis", creditCost: SOLTOOLS_CREDIT_COSTS.analyzeToken },
  { id: "communities", name: "Communities", category: "social", surface: "Communities", status: "live", route: "/communities" },
  { id: "spaces", name: "Spaces", category: "voice", surface: "Spaces", status: "live", route: "/spaces" },
  { id: "callouts-channel", name: "Callouts Channel", category: "social", surface: "Posts", status: "beta", route: "/posts" },
  { id: "discover", name: "Discover", category: "social", surface: "Discover", status: "live", route: "/(tabs)/discover" },
  { id: "leaderboard", name: "Leaderboard", category: "social", surface: "Discover", status: "planned", route: "/(tabs)/discover" },
  { id: "social-messaging", name: "Social Messaging", category: "social", surface: "Messages", status: "live", route: "/messages" },
  { id: "profile", name: "Profile", category: "social", surface: "Profile", status: "live", route: "/(tabs)/profile" },
  { id: "setup", name: "Setup / Onboarding", category: "social", surface: "Auth", status: "live", route: "/auth" },
  { id: "trading-lobbies", name: "Trading Lobbies", category: "voice", surface: "Lobbies", status: "live", route: "/lobbies" },
  { id: "voice-panel", name: "Voice Panel", category: "voice", surface: "Lobbies", status: "beta", route: "/lobbies" },
  { id: "lobby-chat", name: "Lobby Chat", category: "voice", surface: "Lobbies", status: "live", route: "/lobbies" },
  { id: "lobby-watchlist", name: "Lobby Watchlist", category: "voice", surface: "Lobbies", status: "live", route: "/lobbies" },
  { id: "notifications", name: "Notifications", category: "notifications", surface: "Notifications", status: "live", route: "/notifications" },
  { id: "webhooks", name: "Webhook Dashboard", category: "notifications", surface: "Admin", status: "planned", route: "/admin" },
  { id: "discord-webhook", name: "Discord Webhook Mirror", category: "notifications", surface: "Callouts", status: "planned" },
  { id: "credit-balance", name: "Credit Balance", category: "credits", surface: "Header", status: "planned" },
  { id: "credit-confirm", name: "Credit Confirm Dialog", category: "credits", surface: "AI", status: "planned" },
  { id: "credits-usage", name: "Credits Usage Panel", category: "credits", surface: "Profile", status: "planned" },
  { id: "admin-dashboard", name: "Admin Dashboard", category: "admin", surface: "Admin", status: "live", route: "/admin" },
  { id: "support-center", name: "Support Center", category: "admin", surface: "Admin", status: "planned", route: "/admin" },
  { id: "platform-settings", name: "Platform Settings", category: "admin", surface: "Admin", status: "beta", route: "/admin" },
  { id: "phone-layout", name: "Mobile Phone Layout", category: "theme", surface: "App Shell", status: "planned" },
  { id: "theme-picker", name: "Theme Picker", category: "theme", surface: "Profile", status: "planned", route: "/(tabs)/profile" },
  { id: "broken-glass-theme", name: "Broken Glass Theme", category: "theme", surface: "All", status: "live" },
  { id: "official-token", name: "Official Token Dashboard", category: "token", surface: "Official Token", status: "planned", route: "/tool/token-lookup" },
  { id: "pump-board", name: "Pump V5 Board", category: "launchpad", surface: "Launchpad", status: "beta", route: "/(tabs)/launches" },
  { id: "live-trading-waitlist", name: "Live Trading Waitlist", category: "launchpad", surface: "Launchpad", status: "gated", route: "/wallet", gatedReason: SOLTOOLS_TRADING_DISABLED_MESSAGE },
  { id: "launchpad-v3", name: "Launchpad V3", category: "launchpad", surface: "Launchpad", status: "live", route: "/(tabs)/launches" },
];

export const SOLTOOLS_MODULE_COUNT = SOLTOOLS_PLATFORM_MODULES.length;

export function getSolToolsModulesByStatus(status: SolToolsModuleStatus): SolToolsModuleSpec[] {
  return SOLTOOLS_PLATFORM_MODULES.filter((module) => module.status === status);
}

export function isSolToolsTradingEnabled(): boolean {
  return false;
}
