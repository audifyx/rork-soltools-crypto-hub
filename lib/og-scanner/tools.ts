export type OGScannerToolId =
  | "direct-og-scan"
  | "trending-scanner"
  | "new-pairs-scanner"
  | "snipe-feed"
  | "official-ogscan-coin"
  | "dev-wallet-intel"
  | "launch-analyzer"
  | "telegram-ai-bot";

export type OGScannerTool = {
  id: OGScannerToolId;
  title: string;
  subtitle: string;
  description: string;
  status: "live" | "beta" | "backend-needed";
  tags: string[];
};

export const OG_SCANNER_TOOLS: OGScannerTool[] = [
  {
    id: "direct-og-scan",
    title: "Direct OG Scan",
    subtitle: "Scan a ticker or CA",
    description:
      "Find the main Solana pair, detect the earliest origin pair, flag copycats, calculate an OG score, and open DexScreener/Birdeye links.",
    status: "live",
    tags: ["Search", "Copycats", "OG Score"],
  },
  {
    id: "trending-scanner",
    title: "Trending Scanner",
    subtitle: "Top Solana pairs",
    description:
      "Ranks Solana pairs by 24h activity and volume so users can see what is moving right now.",
    status: "live",
    tags: ["Volume", "Momentum", "Solana"],
  },
  {
    id: "new-pairs-scanner",
    title: "New Pairs Scanner",
    subtitle: "Fresh launches",
    description:
      "Shows newest Solana pairs sorted by creation time with liquidity, age, symbol, and chart access.",
    status: "live",
    tags: ["New Pairs", "Launches", "Liquidity"],
  },
  {
    id: "snipe-feed",
    title: "Snipe Feed",
    subtitle: "Fresh token feed",
    description:
      "Live-style feed for fresh launches with age, liquidity, buys/sells, chart access, risk flags, and dev score.",
    status: "beta",
    tags: ["Snipe", "Risk", "Feed"],
  },
  {
    id: "official-ogscan-coin",
    title: "Official OGScan Coin",
    subtitle: "Verified CA room",
    description:
      "Pins the official OGScan CA, dev wallet, DexScreener link, Pump.fun link, and copy buttons.",
    status: "live",
    tags: ["CA", "Dev Wallet", "Verified"],
  },
  {
    id: "dev-wallet-intel",
    title: "Dev Wallet Intel",
    subtitle: "Creator wallet tracking",
    description:
      "Tracks watched dev wallets, previous launches, latest coins, and repeat creator behavior.",
    status: "backend-needed",
    tags: ["Wallets", "Creators", "History"],
  },
  {
    id: "launch-analyzer",
    title: "Launch Analyzer",
    subtitle: "Risk and holder checks",
    description:
      "Analyzes holder risk, liquidity quality, social links, security warnings, and market pressure.",
    status: "backend-needed",
    tags: ["Risk", "Holders", "Security"],
  },
  {
    id: "telegram-ai-bot",
    title: "Telegram OG Scanner AI",
    subtitle: "Bot command system",
    description:
      "Supabase Edge Function bot with /ai, /og, /search, /trending, /newpairs, /whales, and /watch commands.",
    status: "backend-needed",
    tags: ["Telegram", "Gemini", "Supabase"],
  },
];

export function getOGScannerTool(id: OGScannerToolId): OGScannerTool | undefined {
  return OG_SCANNER_TOOLS.find((tool) => tool.id === id);
}
