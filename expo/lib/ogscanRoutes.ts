export type OGScanScreenConfig = { title: string; path: string; subtitle: string };

export const OGSCAN_TOOL_MAP: Record<string, OGScanScreenConfig> = {
  beta: { title: "Community Beta", path: "/", subtitle: "Public beta onboarding" },
  home: { title: "Community Beta", path: "/", subtitle: "Public beta onboarding" },
  command: { title: "Command", path: "/app", subtitle: "Main scanner dashboard" },
  app: { title: "Command", path: "/app", subtitle: "Main scanner dashboard" },
  "our-coin": { title: "Our Coin", path: "/our-coin", subtitle: "Official OGScan token" },
  coin: { title: "Our Coin", path: "/our-coin", subtitle: "Official OGScan token" },
  roadmap: { title: "Roadmap", path: "/roadmap", subtitle: "Social Alpha Cockpit expansion plan" },
  "market-pulse": { title: "Market Pulse", path: "/market-pulse", subtitle: "Selected token vitals" },
  market: { title: "Market Pulse", path: "/market-pulse", subtitle: "Selected token vitals" },
  "snipe-feed": { title: "Snipe Feed", path: "/snipe-feed", subtitle: "Launch and dev-wallet radar" },
  "dev-wallet": { title: "Snipe Feed", path: "/dev-wallet", subtitle: "Dev-wallet radar alias" },
  "dev-wallet-radar": { title: "Snipe Feed", path: "/dev-wallet-radar", subtitle: "Dev-wallet radar alias" },
  scanner: { title: "Scanner", path: "/scanner", subtitle: "Search mint, ticker, or token" },
  "og-scanner": { title: "Scanner", path: "/og-scanner", subtitle: "Scanner alias" },
  "ogscan-scanner": { title: "Scanner", path: "/ogscan-scanner", subtitle: "Scanner alias" },
  "og-finder": { title: "OG Finder", path: "/og-finder", subtitle: "Original vs copycat detection" },
  pairs: { title: "Pairs", path: "/pairs", subtitle: "Fresh pair discovery" },
  migrations: { title: "Migrations", path: "/migrations", subtitle: "Migration and breakout watch" },
  "migration-tool": { title: "Migrations", path: "/migration-tool", subtitle: "Migration alias" },
  "migration-tracker": { title: "Migrations", path: "/migration-tracker", subtitle: "Migration alias" },
  trending: { title: "Trending", path: "/trending", subtitle: "Moving Solana tokens" },
  whales: { title: "Whales", path: "/whales", subtitle: "Holder concentration" },
  "tx-feed": { title: "Tx Feed", path: "/tx-feed", subtitle: "Parsed transaction tape" },
  tape: { title: "Tx Feed", path: "/tape", subtitle: "Transaction tape alias" },
  transactions: { title: "Tx Feed", path: "/transactions", subtitle: "Transaction tape alias" },
  "transaction-feed": { title: "Tx Feed", path: "/transaction-feed", subtitle: "Transaction tape alias" },
  swap: { title: "Swap", path: "/swap", subtitle: "Jupiter quote panel" },
  tech: { title: "Tech", path: "/tech", subtitle: "Data/API stack" },
};

export const OGSCAN_PAGE_MAP: Record<string, string> = {
  "1": "command",
  "2": "our-coin",
  "3": "roadmap",
  "4": "market-pulse",
  "5": "snipe-feed",
  "6": "scanner",
  "7": "og-finder",
  "8": "pairs",
  "9": "migrations",
  "10": "trending",
  "11": "whales",
  "12": "tx-feed",
  "13": "swap",
  "14": "tech",
};

export function getOGScanScreen(slug?: string): OGScanScreenConfig {
  return OGSCAN_TOOL_MAP[slug ?? "command"] ?? OGSCAN_TOOL_MAP.command;
}
