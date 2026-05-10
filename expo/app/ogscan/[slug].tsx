import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";

import OGScanEmbedScreen from "@/components/OGScanEmbedScreen";

const TOOL_MAP: Record<string, { title: string; path: string; subtitle: string }> = {
  beta: { title: "Community Beta", path: "/", subtitle: "Public beta onboarding" },
  command: { title: "Command", path: "/app", subtitle: "Main scanner dashboard" },
  "our-coin": { title: "Our Coin", path: "/our-coin", subtitle: "Official OGScan token" },
  roadmap: { title: "Roadmap", path: "/roadmap", subtitle: "SolTools expansion plan" },
  "market-pulse": { title: "Market Pulse", path: "/market-pulse", subtitle: "Selected token vitals" },
  "snipe-feed": { title: "Snipe Feed", path: "/snipe-feed", subtitle: "Launch and dev-wallet radar" },
  scanner: { title: "Scanner", path: "/scanner", subtitle: "Search mint, ticker, or token" },
  "og-finder": { title: "OG Finder", path: "/og-finder", subtitle: "Original vs copycat detection" },
  pairs: { title: "Pairs", path: "/pairs", subtitle: "Fresh pair discovery" },
  migrations: { title: "Migrations", path: "/migrations", subtitle: "Migration and breakout watch" },
  trending: { title: "Trending", path: "/trending", subtitle: "Moving Solana tokens" },
  whales: { title: "Whales", path: "/whales", subtitle: "Holder concentration" },
  "tx-feed": { title: "Tx Feed", path: "/tx-feed", subtitle: "Parsed transaction tape" },
  swap: { title: "Swap", path: "/swap", subtitle: "Jupiter quote panel" },
  tech: { title: "Tech", path: "/tech", subtitle: "Data/API stack" },
  "dev-wallet-radar": { title: "Snipe Feed", path: "/dev-wallet-radar", subtitle: "Dev-wallet radar alias" },
};

export default function OGScanToolRoute() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const screen = useMemo(() => TOOL_MAP[slug ?? "command"] ?? TOOL_MAP.command, [slug]);

  return <OGScanEmbedScreen title={screen.title} path={screen.path} subtitle={screen.subtitle} />;
}
