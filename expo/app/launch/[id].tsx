import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Bell,
  Bookmark,
  Check,
  Copy,
  Crown,
  Droplet,
  ExternalLink,
  Eye,
  Flame,
  Globe2,
  Layers,
  MessageCircle,
  Send,
  Share2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Twitter,
  Users,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import DexChart from "@/components/DexChart";
import { navigateBack } from "@/lib/navigation";
import AppBackground from "@/components/ui/AppBackground";
import { useDexToken, type DexPair } from "@/lib/api/dexscreener";
import { useTokenOverview } from "@/lib/api/market";
import { getTokenSecurity } from "@/lib/api/birdeye";
import { useAuth } from "@/providers/auth-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { supabase } from "@/lib/supabase";
import type { LaunchToken, LaunchVenue } from "@/types/launchpad";
import { fmtNum, fmtPct, fmtPrice, fmtUsd } from "@/utils/format";
import { getTokenBanner, getTokenLogo } from "@/utils/token-art";

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

type TabKey = "overview" | "activity" | "pools" | "risk";

const TABS: { key: TabKey; label: string; Icon: typeof Activity }[] = [
  { key: "overview", label: "Overview", Icon: Sparkles },
  { key: "activity", label: "Activity", Icon: Activity },
  { key: "pools", label: "Pools", Icon: Layers },
  { key: "risk", label: "Risk", Icon: Shield },
];

const TIMEFRAMES: { key: "5m" | "1h" | "6h" | "24h"; label: string }[] = [
  { key: "5m", label: "5M" },
  { key: "1h", label: "1H" },
  { key: "6h", label: "6H" },
  { key: "24h", label: "24H" },
];

const ATH_STORE_KEY = "soltools.tokenAth.v1";

type TokenAthRecord = {
  priceUsd: number;
  marketCapUsd: number | null;
  recordedAt: number;
};

type TokenAthStore = Record<string, TokenAthRecord>;

function ageString(ts?: number | null): string {
  if (!ts) return "—";
  const ms = Date.now() - ts;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function athAgeLabel(ts?: number | null): string {
  if (!ts) return "—";
  const age = ageString(ts);
  return age === "now" ? "just now" : `${age} ago`;
}

async function readAthStore(): Promise<TokenAthStore> {
  try {
    const raw = await AsyncStorage.getItem(ATH_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TokenAthStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.log("[token-ath] read failed", e instanceof Error ? e.message : e);
    return {};
  }
}

export default function LaunchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getById, upvoted, toggleUpvote, remove, isLoading: listingsLoading } = useLaunchpad();
  const { userId } = useAuth();
  const [copied, setCopied] = useState<boolean>(false);
  const [watching, setWatching] = useState<boolean>(false);
  const [ath, setAth] = useState<TokenAthRecord | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [tf, setTf] = useState<"5m" | "1h" | "6h" | "24h">("24h");

  const stored = id ? getById(id) : null;
  // If the id looks like a Solana mint address, treat it as a contract so users
  // can deep-link to any token even when it isn't in the launchpad listings.
  const looksLikeMint = !!id && id.length >= 32 && id.length <= 64 && !id.includes("-");
  const looksLikeUuid = !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // Direct Supabase fallback when the listings query hasn't yet hydrated this
  // particular submission (e.g. deep link from a notification, or the row was
  // newly created on another device). This guarantees the screen can resolve
  // any submission UUID that exists in the database.
  const submissionQuery = useQuery<LaunchToken | null>({
    queryKey: ["submission", id ?? ""],
    enabled: !!id && looksLikeUuid && !stored,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("pump_v5_submissions")
          .select(
            "id,user_id,token_name,symbol,description,logo_url,banner_url,contract_address,website,twitter,telegram,discord,tags,liquidity_usd,market_cap,is_featured,status,created_at",
          )
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const r = data as Record<string, unknown>;
        const statusRaw = String(r.status ?? "approved").toLowerCase();
        const validVenues: LaunchVenue[] = ["pumpfun", "pumpswap", "raydium", "meteora", "jupiter", "moonshot", "fomo", "other"];
        const rawTags = Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [];
        const venueTag = rawTags.find((tag) => tag.toLowerCase().startsWith("venue:"));
        const venueRaw = (venueTag?.slice("venue:".length) || (validVenues.includes(statusRaw as LaunchVenue) ? statusRaw : "other")).toLowerCase();
        const venue: LaunchVenue = (validVenues.includes(venueRaw as LaunchVenue)
          ? venueRaw
          : "other") as LaunchVenue;
        return {
          id: String(r.id ?? ""),
          name: (r.token_name as string) ?? "Unnamed",
          ticker: ((r.symbol as string) ?? "").toUpperCase(),
          description: (r.description as string) ?? "",
          logoUrl: (r.logo_url as string) ?? null,
          bannerUrl: (r.banner_url as string) ?? null,
          contract: (r.contract_address as string) ?? "",
          venue,
          status: statusRaw === "pending" || statusRaw === "rejected" ? statusRaw : "live",
          approvalStatus: (["pending", "approved", "rejected", "live"].includes(statusRaw) ? statusRaw : "approved") as "pending" | "approved" | "rejected" | "live",
          website: (r.website as string) ?? undefined,
          twitter: (r.twitter as string) ?? undefined,
          telegram: (r.telegram as string) ?? undefined,
          discord: (r.discord as string) ?? undefined,
          tags: rawTags.filter((tag) => !tag.toLowerCase().startsWith("venue:")),
          featured: !!r.is_featured,
          hot: false,
          verified: false,
          createdAt: r.created_at ? new Date(r.created_at as string).getTime() : Date.now(),
          submittedBy: "user",
          ownerId: (r.user_id as string | null) ?? null,
          price: null,
          change24hPct: null,
          liquidityUsd: Number(r.liquidity_usd ?? 0) || null,
          marketCapUsd: Number(r.market_cap ?? 0) || null,
          volume24hUsd: null,
          holders: null,
          upvotes: 0,
          watchers: 0,
        };
      } catch (e) {
        console.log("[detail] submission fetch failed", e);
        return null;
      }
    },
    staleTime: 30_000,
  });

  const resolved = stored ?? submissionQuery.data ?? null;
  const lookupAddress = resolved?.contract ?? (looksLikeMint ? id! : null);
  const { data: dex, isLoading: dexLoading } = useDexToken(lookupAddress);
  const { data: overview } = useTokenOverview(lookupAddress);

  // Synthesize a token shell from DexScreener data when we don't have a stored
  // listing yet — this prevents the dreaded "Token not found" screen for any
  // valid Solana mint pasted into a deep link or routed from another tab.
  const token = useMemo(() => {
    if (resolved) {
      return {
        ...resolved,
        logoUrl: resolved.logoUrl ?? dex?.imageUrl ?? null,
        bannerUrl: resolved.bannerUrl ?? dex?.bannerUrl ?? null,
      };
    }
    if (!lookupAddress) return null;
    // If DexScreener has indexed pairs, use them. Otherwise fall back to a
    // minimal shell so the screen still renders for any pasted Solana mint —
    // never block users on third-party indexers.
    const base = dex?.pair?.baseToken;
    const synth: LaunchToken = {
      id: lookupAddress,
      name: base?.name || base?.symbol || "Unknown token",
      ticker: (base?.symbol || "").toUpperCase(),
      description: "",
      logoUrl: dex?.imageUrl ?? null,
      bannerUrl: dex?.bannerUrl ?? null,
      contract: lookupAddress,
      venue: "other",
      status: "live",
      tags: dex?.pair?.labels ?? [],
      featured: false,
      hot: false,
      verified: false,
      createdAt: dex?.pairCreatedAt ?? Date.now(),
      submittedBy: "system",
      ownerId: null,
      price: dex?.priceUsd ?? null,
      change24hPct: dex?.priceChange24hPct ?? null,
      liquidityUsd: dex?.liquidityUsd ?? null,
      marketCapUsd: dex?.marketCapUsd ?? null,
      volume24hUsd: dex?.volume24hUsd ?? null,
      holders: null,
      upvotes: 0,
      watchers: 0,
    };
    return synth;
  }, [resolved, lookupAddress, dex]);

  const livePrice = dex?.priceUsd ?? overview?.price ?? token?.price ?? null;
  const changeByTf: Record<string, number | null> = {
    "5m": dex?.priceChange5mPct ?? null,
    "1h": dex?.priceChange1hPct ?? overview?.priceChange1h ?? null,
    "6h": dex?.priceChange6hPct ?? null,
    "24h": dex?.priceChange24hPct ?? overview?.priceChange24h ?? token?.change24hPct ?? null,
  };
  const liveChange = changeByTf[tf];
  const volByTf: Record<string, number | null> = {
    "5m": dex?.volume5mUsd ?? null,
    "1h": dex?.volume1hUsd ?? null,
    "6h": dex?.volume6hUsd ?? null,
    "24h": dex?.volume24hUsd ?? token?.volume24hUsd ?? null,
  };
  const liveVol = volByTf[tf];
  const liveLiq = dex?.liquidityUsd ?? overview?.liquidity ?? token?.liquidityUsd ?? null;
  const liveMc = dex?.marketCapUsd ?? overview?.marketCap ?? token?.marketCapUsd ?? null;
  const liveFdv = dex?.fdvUsd ?? null;
  const liveHolders = overview?.holder ?? token?.holders ?? null;
  const pairAddress = dex?.pairAddress ?? null;
  const pairCreated = dex?.pairCreatedAt ?? null;
  const athDropPct = ath?.priceUsd && livePrice != null && livePrice > 0
    ? ((livePrice - ath.priceUsd) / ath.priceUsd) * 100
    : null;
  const dexId = dex?.dexId ?? null;
  const txns24 = dex?.txns24h;
  const txns1h = dex?.txns1h;
  const totalTx = (txns24?.buys ?? 0) + (txns24?.sells ?? 0);
  const buyPressure = totalTx > 0 ? (txns24!.buys / totalTx) * 100 : 50;

  useEffect(() => {
    let cancelled = false;
    const key = lookupAddress?.trim();
    if (!key) {
      setAth(null);
      return;
    }
    readAthStore().then((store) => {
      if (!cancelled) setAth(store[key] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [lookupAddress]);

  useEffect(() => {
    const key = lookupAddress?.trim();
    if (!key || livePrice == null || livePrice <= 0) return;
    setAth((current) => {
      if (current && current.priceUsd >= livePrice) return current;
      const next: TokenAthRecord = { priceUsd: livePrice, marketCapUsd: liveMc ?? null, recordedAt: Date.now() };
      readAthStore()
        .then(async (store) => {
          const existing = store[key];
          if (existing && existing.priceUsd >= livePrice) return;
          await AsyncStorage.setItem(ATH_STORE_KEY, JSON.stringify({ ...store, [key]: next }));
        })
        .catch((e) => console.log("[token-ath] persist failed", e instanceof Error ? e.message : e));
      return next;
    });
  }, [lookupAddress, livePrice, liveMc]);

  // Live price flash animation
  const flash = useRef(new Animated.Value(0)).current;
  const lastPrice = useRef<number | null>(null);
  const [flashUp, setFlashUp] = useState<boolean>(true);
  useEffect(() => {
    if (livePrice == null) return;
    if (lastPrice.current != null && livePrice !== lastPrice.current) {
      setFlashUp(livePrice > lastPrice.current);
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 120, useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]).start();
    }
    lastPrice.current = livePrice;
  }, [livePrice, flash]);

  // Security score (Birdeye)
  const security = useQuery({
    queryKey: ["security", token?.contract ?? ""],
    enabled: !!token?.contract && tab === "risk",
    queryFn: async () => {
      try {
        return await getTokenSecurity(token!.contract);
      } catch (e) {
        console.log("[detail] security fetch failed", e);
        return null;
      }
    },
    staleTime: 60_000,
  });

  const onCopy = useCallback(async () => {
    if (!token) return;
    await Clipboard.setStringAsync(token.contract);
    setCopied(true);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setTimeout(() => setCopied(false), 1500);
  }, [token]);

  const openLink = useCallback(async (url?: string) => {
    if (!url) return;
    const cleaned = url.startsWith("http") ? url : `https://${url}`;
    try {
      await WebBrowser.openBrowserAsync(cleaned);
    } catch {
      Linking.openURL(cleaned).catch(() => {});
    }
  }, []);

  const showTradingComingSoon = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      "Coming later",
      "Trading features aren't available yet. You can still research, track, and discuss tokens here.",
    );
  }, []);

  const onDelete = useCallback(() => {
    if (!token) return;
    Alert.alert("Remove listing?", "This will remove the token from your listings.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          remove(token.id);
          navigateBack(router, "/(tabs)/discover");
        },
      },
    ]);
  }, [token, remove, router]);

  const onUpvote = useCallback(() => {
    if (!token) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    toggleUpvote(token.id);
  }, [token, toggleUpvote]);

  const onTabPress = useCallback((k: TabKey) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    setTab(k);
  }, []);

  const positive = useMemo(() => (liveChange ?? 0) >= 0, [liveChange]);
  const accent = positive ? Colors.mint : Colors.rose;

  // While listings or fallback queries are still in flight, never flash a
  // "Token not found" message — show a minimal loading state instead.
  const stillResolving =
    !token &&
    (listingsLoading ||
      submissionQuery.isLoading ||
      (looksLikeMint && dexLoading));

  if (stillResolving) {
    return (
      <View style={styles.root}>
        <AppBackground variant="market" />
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <View style={styles.notFoundWrap}>
            <Text style={styles.notFoundTitle}>Loading token…</Text>
            <Text style={styles.notFoundBody}>Fetching live market data.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!token) {
    return (
      <View style={styles.root}>
        <AppBackground variant="market" />
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <View style={styles.notFoundWrap}>
            <Text style={styles.notFoundTitle}>Token not found</Text>
            <Text style={styles.notFoundBody}>This listing may have been removed.</Text>
            <Pressable onPress={() => navigateBack(router, "/(tabs)/discover")} style={styles.backBtnSolo} testID="back-not-found">
              <Text style={styles.backBtnText}>Go back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const isMine = !!userId && token.ownerId === userId;
  const isUpvoted = !!upvoted[token.id];

  const flashBg = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [
      "rgba(255,255,255,0)",
      flashUp ? "rgba(85,245,178,0.18)" : "rgba(255,93,143,0.18)",
    ],
  });

  const liquidityPulse = Math.max(8, Math.min(100, ((liveLiq ?? 0) / 1_000_000) * 100));
  const volumePulse = Math.max(8, Math.min(100, ((liveVol ?? 0) / 1_000_000) * 100));
  const holderPulse = Math.max(8, Math.min(100, ((liveHolders ?? 0) / 10_000) * 100));
  const momentumPulse = Math.max(8, Math.min(100, Math.abs(liveChange ?? 0) * 2.5));
  const commandScore = Math.round(
    (liquidityPulse + volumePulse + holderPulse + Math.max(8, 100 - momentumPulse / 2)) / 4,
  );
  const traderTone = liveChange == null ? "Watching" : positive ? "Accumulation" : "Distribution";

  return (
    <View style={styles.root}>
      <AppBackground variant="market" />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.bgOrbTop} pointerEvents="none" />
      <View style={styles.bgOrbBottom} pointerEvents="none" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Banner */}
          <View style={styles.bannerWrap}>
            <Image
              source={{ uri: getTokenBanner(token.bannerUrl, token.id || token.ticker) }}
              style={styles.banner}
              contentFit="cover"
            />
            <LinearGradient
              colors={["rgba(3,7,8,0.02)", "rgba(3,7,8,0.58)", Colors.ink]}
              style={styles.bannerFade}
            />
            <LinearGradient
              colors={[`${accent}1F`, "rgba(217,70,255,0.14)", "rgba(3,7,8,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bannerColorWash}
            />
            <View style={[styles.bannerGlow, { backgroundColor: `${accent}24` }]} pointerEvents="none" />
            <View style={styles.heroStamp}>
              <View style={[styles.heroLiveBadge, { borderColor: `${accent}44`, backgroundColor: `${accent}12` }]}> 
                <View style={[styles.heroLiveDot, { backgroundColor: accent }]} />
                <Text style={[styles.heroLiveText, { color: accent }]}>{traderTone}</Text>
              </View>
              <Text style={styles.heroStampTitle}>Token command center</Text>
              <Text style={styles.heroStampSub}>Live routing · chart · risk · pools</Text>
              <View style={styles.athBannerPill}>
                <TrendingUp color={Colors.goldBright} size={12} strokeWidth={3} />
                <Text style={styles.athBannerLabel}>Recorded ATH</Text>
                <Text style={styles.athBannerValue}>{ath?.priceUsd ? fmtPrice(ath.priceUsd) : "Recording…"}</Text>
                {athDropPct != null ? <Text style={styles.athBannerDrop}>{fmtPct(athDropPct, 1)} from ATH</Text> : null}
              </View>
            </View>
            <View style={styles.headerBar}>
              <Pressable onPress={() => navigateBack(router, "/(tabs)/discover")} style={styles.iconBtn} hitSlop={8} testID="back-btn">
                <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
              </Pressable>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => setWatching((v) => !v)}
                  style={styles.iconBtn}
                  hitSlop={8}
                  testID="watch-btn"
                >
                  <Bookmark
                    color={watching ? Colors.mint : Colors.text}
                    size={16}
                    strokeWidth={2.6}
                    fill={watching ? Colors.mint : "transparent"}
                  />
                </Pressable>
                <Pressable style={styles.iconBtn} hitSlop={8} testID="share-btn">
                  <Share2 color={Colors.text} size={16} strokeWidth={2.6} />
                </Pressable>
                {isMine ? (
                  <Pressable onPress={onDelete} style={styles.iconBtn} hitSlop={8} testID="delete-btn">
                    <Trash2 color={Colors.rose} size={16} strokeWidth={2.6} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {/* Identity */}
          <View style={styles.headWrap}>
            <View style={styles.logoBlock}>
              <Image
                source={{ uri: getTokenLogo(token.logoUrl, token.id || token.ticker) }}
                style={styles.logo}
                contentFit="cover"
              />
              {token.status === "live" ? (
                <View style={styles.logoLiveDot}>
                  <View style={styles.logoLiveDotInner} />
                </View>
              ) : null}
            </View>

            <View style={styles.headInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {token.name}
                </Text>
                {token.featured ? <Crown color={Colors.orange} size={14} strokeWidth={2.6} /> : null}
                {token.hot ? <Flame color={Colors.orange} size={14} strokeWidth={2.6} /> : null}
              </View>
              <View style={styles.metaRow}>
                <View style={styles.tickerPill}>
                  <Text style={styles.tickerText}>${token.ticker}</Text>
                </View>
                {dexId ? (
                  <View style={styles.venuePill}>
                    <Text style={styles.venueText}>{dexId.toUpperCase()}</Text>
                  </View>
                ) : (
                  <View style={styles.venuePill}>
                    <Text style={styles.venueText}>{token.venue}</Text>
                  </View>
                )}
                {pairCreated ? (
                  <View style={styles.agePill}>
                    <Zap color={Colors.cyan} size={9} strokeWidth={3} />
                    <Text style={styles.ageText}>{ageString(pairCreated)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.commandDock}>
            <MarketMini Icon={Droplet} label="Liquidity" value={fmtUsd(liveLiq)} color={Colors.cyan} />
            <MarketMini Icon={Activity} label={`Vol ${tf.toUpperCase()}`} value={fmtUsd(liveVol)} color={Colors.mint} />
            <MarketMini Icon={TrendingUp} label="ATH" value={ath?.priceUsd ? fmtPrice(ath.priceUsd) : "—"} color={Colors.goldBright} />
            <MarketMini Icon={ShieldCheck} label="Score" value={`${commandScore}`} color={accent} />
          </View>

          {/* Live price hero with flash + timeframe selector */}
          <Animated.View style={[styles.priceCard, { backgroundColor: flashBg, borderColor: `${accent}33` }]}>
            <View style={styles.priceCardInner}>
              <LinearGradient
                colors={[`${accent}18`, "rgba(56,215,255,0.06)", "rgba(255,255,255,0.015)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.priceTopRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.priceLabelRow}>
                    <View style={[styles.pricePulseDot, { backgroundColor: accent }]} />
                    <Text style={styles.priceLabel}>Live price</Text>
                  </View>
                  <Text style={styles.priceValue}>
                    {livePrice != null && livePrice > 0 ? fmtPrice(livePrice) : "—"}
                  </Text>
                  <Text style={styles.priceCaption}>
                    DEX-indexed route · ATH {ath?.priceUsd ? `${fmtPrice(ath.priceUsd)} (${athAgeLabel(ath.recordedAt)})` : "recording now"}
                  </Text>
                </View>
                {liveChange != null ? (
                  <View
                    style={[
                      styles.changeBadge,
                      { backgroundColor: `${accent}1A`, borderColor: `${accent}55` },
                    ]}
                  >
                    {positive ? (
                      <TrendingUp color={accent} size={14} strokeWidth={3} />
                    ) : (
                      <TrendingDown color={accent} size={14} strokeWidth={3} />
                    )}
                    <Text style={[styles.changeText, { color: accent }]}>{fmtPct(liveChange)}</Text>
                    <Text style={styles.changeBadgeSub}>{tf.toUpperCase()}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.commandScoreCard}>
                <View style={styles.commandScoreTop}>
                  <View>
                    <Text style={styles.commandScoreLabel}>Market signal</Text>
                    <Text style={styles.commandScoreSub}>Liquidity, holders, volume and momentum blend</Text>
                  </View>
                  <Text style={[styles.commandScoreValue, { color: accent }]}>{commandScore}</Text>
                </View>
                <View style={styles.commandScoreTrack}>
                  <View style={[styles.commandScoreFill, { width: `${commandScore}%`, backgroundColor: accent }]} />
                </View>
                <View style={styles.signalBarsRow}>
                  <SignalBar label="Liq" value={liquidityPulse} color={Colors.cyan} />
                  <SignalBar label="Vol" value={volumePulse} color={Colors.mint} />
                  <SignalBar label="Hold" value={holderPulse} color={Colors.violet} />
                  <SignalBar label="Move" value={momentumPulse} color={accent} />
                </View>
              </View>

              <View style={styles.tfRow}>
                {TIMEFRAMES.map((t) => {
                  const active = tf === t.key;
                  const c = changeByTf[t.key];
                  const up = (c ?? 0) >= 0;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                        setTf(t.key);
                      }}
                      style={[styles.tfBtn, active && styles.tfBtnActive]}
                      testID={`tf-${t.key}`}
                    >
                      <Text style={[styles.tfLabel, active && styles.tfLabelActive]}>{t.label}</Text>
                      <Text
                        style={[
                          styles.tfChange,
                          { color: c == null ? Colors.muted : up ? Colors.mint : Colors.rose },
                        ]}
                      >
                        {c == null ? "—" : fmtPct(c, 1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.chartEmbed} testID="chart-embed">
                <View style={styles.chartChrome}>
                  <View style={styles.chartDotRed} />
                  <View style={styles.chartDotYellow} />
                  <View style={styles.chartDotGreen} />
                  <Text style={styles.chartChromeText}>DEX live terminal</Text>
                </View>
                <DexChart contract={token.contract} pairAddress={pairAddress ?? undefined} height={318} />
              </View>
            </View>
          </Animated.View>

          {/* Tabs */}
          <View style={styles.tabsBar}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => onTabPress(t.key)}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                  testID={`tab-${t.key}`}
                >
                  <t.Icon
                    color={active ? Colors.ink : Colors.muted}
                    size={13}
                    strokeWidth={2.8}
                  />
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {tab === "overview" ? (
            <OverviewTab
              liveMc={liveMc}
              liveFdv={liveFdv}
              liveLiq={liveLiq}
              liveVol={liveVol}
              tfLabel={tf.toUpperCase()}
              liveHolders={liveHolders ?? null}
              upvotes={token.upvotes}
              watchers={token.watchers}
              isUpvoted={isUpvoted}
              onUpvote={onUpvote}
              description={token.description}
              tags={token.tags}
              contract={token.contract}
              copied={copied}
              onCopy={onCopy}
              website={token.website}
              twitter={token.twitter}
              telegram={token.telegram}
              discord={token.discord}
              extraSocials={dex?.socials ?? []}
              extraSites={dex?.websites ?? []}
              openLink={openLink}
              onTradingComingSoon={showTradingComingSoon}
            />
          ) : null}

          {tab === "activity" ? (
            <ActivityTab
              txns24={txns24 ?? null}
              txns1h={txns1h ?? null}
              buyPressure={buyPressure}
              vol5m={dex?.volume5mUsd ?? null}
              vol1h={dex?.volume1hUsd ?? null}
              vol6h={dex?.volume6hUsd ?? null}
              vol24h={dex?.volume24hUsd ?? null}
              chg5m={dex?.priceChange5mPct ?? null}
              chg1h={dex?.priceChange1hPct ?? null}
              chg6h={dex?.priceChange6hPct ?? null}
              chg24h={dex?.priceChange24hPct ?? null}
              pairAddress={pairAddress}
              openLink={openLink}
            />
          ) : null}

          {tab === "pools" ? (
            <PoolsTab
              pairs={dex?.pairs ?? []}
              currentPair={pairAddress}
              openLink={openLink}
            />
          ) : null}

          {tab === "risk" ? (
            <RiskTab
              loading={security.isLoading}
              data={security.data ?? null}
              holders={liveHolders ?? null}
              liquidity={liveLiq}
              age={pairCreated}
              labels={dex?.pair?.labels ?? []}
            />
          ) : null}

          <View style={styles.viewsRow}>
            <Eye color={Colors.muted} size={12} strokeWidth={2.4} />
            <Text style={styles.viewsText}>
              Listed {new Date(token.createdAt).toLocaleDateString()}
              {pairCreated ? ` · Pair ${ageString(pairCreated)} old` : ""}
            </Text>
          </View>
        </ScrollView>

        {/* Sticky action bar — trading coming later */}
        <View style={styles.stickyBar} pointerEvents="box-none">
          <LinearGradient
            colors={["rgba(3,7,8,0)", "rgba(3,7,8,0.85)", Colors.ink]}
            style={styles.stickyFade}
            pointerEvents="none"
          />
          <View style={styles.stickyInner}>
            <Pressable
              onPress={() => setWatching((v) => !v)}
              style={[styles.stickyWatch, watching && styles.stickyWatchOn]}
              testID="sticky-watch"
            >
              <Bookmark
                color={watching ? Colors.mint : Colors.text}
                size={16}
                strokeWidth={2.6}
                fill={watching ? Colors.mint : "transparent"}
              />
            </Pressable>
            <Pressable style={styles.stickyAlert} testID="sticky-alert">
              <Bell color={Colors.cyan} size={15} strokeWidth={2.8} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ---------------- Tabs ---------------- */

function OverviewTab(props: {
  liveMc: number | null;
  liveFdv: number | null;
  liveLiq: number | null;
  liveVol: number | null;
  tfLabel: string;
  liveHolders: number | null;
  upvotes: number;
  watchers: number;
  isUpvoted: boolean;
  onUpvote: () => void;
  description: string;
  tags: string[];
  contract: string;
  copied: boolean;
  onCopy: () => void;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  extraSocials: { type: string; url: string }[];
  extraSites: string[];
  openLink: (url?: string) => void;
  onTradingComingSoon: () => void;
}) {
  const {
    liveMc, liveFdv, liveLiq, liveVol, tfLabel, liveHolders, upvotes, watchers,
    isUpvoted, onUpvote, description, tags, contract, copied, onCopy,
    website, twitter, telegram, discord, extraSocials, extraSites, openLink, onTradingComingSoon,
  } = props;

  const fdvRatio = liveMc && liveFdv ? liveMc / liveFdv : null;

  return (
    <View>
      <View style={styles.metricsGrid}>
        <Metric label="Market cap" value={fmtUsd(liveMc)} accent={Colors.mint} />
        <Metric label="FDV" value={fmtUsd(liveFdv)} sub={fdvRatio ? `MC/FDV ${(fdvRatio * 100).toFixed(0)}%` : undefined} />
        <Metric label="Liquidity" value={fmtUsd(liveLiq)} accent={Colors.cyan} />
        <Metric label={`Volume ${tfLabel}`} value={fmtUsd(liveVol)} />
        <Metric label="Holders" value={liveHolders ? fmtNum(liveHolders) : "—"} />
        <Metric label="Watchers" value={`${watchers}`} sub={`${upvotes} boosts`} />
      </View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={onUpvote}
          style={[styles.actionBtn, isUpvoted && styles.actionBtnOn]}
          testID="upvote-btn"
        >
          <Flame
            color={isUpvoted ? Colors.orange : Colors.text}
            size={15}
            strokeWidth={2.6}
            fill={isUpvoted ? Colors.orange : "transparent"}
          />
          <Text style={[styles.actionText, isUpvoted && { color: Colors.orange }]}>
            Boost · {upvotes}
          </Text>
        </Pressable>
        <Pressable style={styles.actionBtn} testID="alerts-btn">
          <Bell color={Colors.text} size={15} strokeWidth={2.6} />
          <Text style={styles.actionText}>Alerts</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} testID="watchers-btn">
          <Users color={Colors.text} size={15} strokeWidth={2.6} />
          <Text style={styles.actionText}>{watchers}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Contract</Text>
        <Pressable onPress={onCopy} style={styles.contractRow} testID="contract-copy">
          <Text style={styles.contractText}>{shortAddress(contract)}</Text>
          <View style={styles.copyBadge}>
            {copied ? (
              <Check color={Colors.mint} size={12} strokeWidth={3} />
            ) : (
              <Copy color={Colors.muted} size={12} strokeWidth={2.6} />
            )}
            <Text style={[styles.copyText, copied && { color: Colors.mint }]}>
              {copied ? "Copied" : "Copy"}
            </Text>
          </View>
        </Pressable>
      </View>

      {description.trim().length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <Text style={styles.descText}>{description}</Text>
        </View>
      ) : null}

      {tags.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Tags</Text>
          <View style={styles.tagRow}>
            {tags.map((t) => (
              <View key={t} style={styles.tagPill}>
                <Text style={styles.tagText}>#{t}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Links</Text>
        <View style={styles.linksCol}>
          <LinkRow Icon={Globe2} label="Website" value={website ?? extraSites[0]} onPress={() => openLink(website ?? extraSites[0])} />
          <LinkRow Icon={Twitter} label="Twitter" value={twitter ?? extraSocials.find((s) => /twitter|x/i.test(s.type))?.url} onPress={() => openLink(twitter ?? extraSocials.find((s) => /twitter|x/i.test(s.type))?.url)} />
          <LinkRow Icon={Send} label="Telegram" value={telegram ?? extraSocials.find((s) => /telegram/i.test(s.type))?.url} onPress={() => openLink(telegram ?? extraSocials.find((s) => /telegram/i.test(s.type))?.url)} />
          <LinkRow Icon={MessageCircle} label="Discord" value={discord ?? extraSocials.find((s) => /discord/i.test(s.type))?.url} onPress={() => openLink(discord ?? extraSocials.find((s) => /discord/i.test(s.type))?.url)} />
          <LinkRow Icon={AtSign} label="Solscan" value={`solscan.io/token/${contract.slice(0, 8)}…`} onPress={() => openLink(`https://solscan.io/token/${contract}`)} />
          <LinkRow Icon={ExternalLink} label="DexScreener" value="dexscreener.com" onPress={() => openLink(`https://dexscreener.com/solana/${contract}`)} />
        </View>
      </View>

      <Pressable
        onPress={onTradingComingSoon}
        style={styles.tradeBtn}
        testID="trade-btn"
      >
        <LinearGradient
          colors={[Colors.mint, Colors.cyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tradeGradient}
        >
          <ArrowUpRight color={Colors.ink} size={16} strokeWidth={3} />
          <Text style={styles.tradeText}>Trading coming soon</Text>
          <ExternalLink color={Colors.ink} size={14} strokeWidth={3} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function ActivityTab(props: {
  txns24: { buys: number; sells: number } | null;
  txns1h: { buys: number; sells: number } | null;
  buyPressure: number;
  vol5m: number | null;
  vol1h: number | null;
  vol6h: number | null;
  vol24h: number | null;
  chg5m: number | null;
  chg1h: number | null;
  chg6h: number | null;
  chg24h: number | null;
  pairAddress: string | null;
  openLink: (url?: string) => void;
}) {
  const { txns24, txns1h, buyPressure, vol5m, vol1h, vol6h, vol24h, chg5m, chg1h, chg6h, chg24h, pairAddress, openLink } = props;
  const rows: { label: string; vol: number | null; chg: number | null }[] = [
    { label: "5M", vol: vol5m, chg: chg5m },
    { label: "1H", vol: vol1h, chg: chg1h },
    { label: "6H", vol: vol6h, chg: chg6h },
    { label: "24H", vol: vol24h, chg: chg24h },
  ];

  return (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Buy / Sell pressure (24h)</Text>
        <View style={styles.pressureCard}>
          <View style={styles.pressureBarTrack}>
            <View
              style={[styles.pressureBarFill, { width: `${Math.max(2, Math.min(98, buyPressure))}%` }]}
            />
          </View>
          <View style={styles.pressureRow}>
            <View>
              <Text style={[styles.pressureSide, { color: Colors.mint }]}>BUYS</Text>
              <Text style={styles.pressureCount}>{fmtNum(txns24?.buys ?? 0)}</Text>
            </View>
            <Text style={styles.pressurePct}>{buyPressure.toFixed(0)}%</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.pressureSide, { color: Colors.rose }]}>SELLS</Text>
              <Text style={styles.pressureCount}>{fmtNum(txns24?.sells ?? 0)}</Text>
            </View>
          </View>
          {txns1h ? (
            <Text style={styles.pressureSubtle}>
              Last hour: {txns1h.buys} buys · {txns1h.sells} sells
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Volume & price by timeframe</Text>
        <View style={styles.tableCard}>
          {rows.map((r, i) => {
            const up = (r.chg ?? 0) >= 0;
            return (
              <View key={r.label} style={[styles.tableRow, i < rows.length - 1 && styles.tableRowDiv]}>
                <Text style={styles.tableLabel}>{r.label}</Text>
                <Text style={styles.tableVol}>{fmtUsd(r.vol)}</Text>
                <Text
                  style={[
                    styles.tableChg,
                    { color: r.chg == null ? Colors.muted : up ? Colors.mint : Colors.rose },
                  ]}
                >
                  {r.chg == null ? "—" : fmtPct(r.chg, 2)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={() =>
          openLink(
            pairAddress
              ? `https://dexscreener.com/solana/${pairAddress}`
              : undefined
          )
        }
        style={[styles.tradeBtn, { marginTop: 6 }]}
        testID="open-trades"
      >
        <LinearGradient
          colors={[Colors.mint, Colors.cyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tradeGradient}
        >
          <Activity color={Colors.ink} size={16} strokeWidth={3} />
          <Text style={styles.tradeText}>View live trades</Text>
          <ExternalLink color={Colors.ink} size={14} strokeWidth={3} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function PoolsTab({
  pairs,
  currentPair,
  openLink,
}: {
  pairs: DexPair[];
  currentPair: string | null;
  openLink: (url?: string) => void;
}) {
  const sorted = useMemo(
    () =>
      pairs
        .slice()
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
        .slice(0, 12),
    [pairs]
  );

  if (sorted.length === 0) {
    return (
      <View style={styles.section}>
        <View style={styles.emptyCard}>
          <Droplet color={Colors.muted} size={18} strokeWidth={2.4} />
          <Text style={styles.emptyTitle}>No pools indexed yet</Text>
          <Text style={styles.emptyBody}>DexScreener hasn&apos;t indexed any liquidity pools for this token.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{sorted.length} liquidity pool{sorted.length === 1 ? "" : "s"}</Text>
      <View style={{ gap: 8 }}>
        {sorted.map((p) => {
          const isCurrent = p.pairAddress === currentPair;
          const chg = p.priceChange?.h24 ?? null;
          const up = (chg ?? 0) >= 0;
          return (
            <Pressable
              key={p.pairAddress}
              onPress={() => openLink(p.url)}
              style={[styles.poolCard, isCurrent && styles.poolCardActive]}
              testID={`pool-${p.pairAddress}`}
            >
              <View style={styles.poolTop}>
                <View style={styles.poolBadge}>
                  <Text style={styles.poolBadgeText}>{p.dexId.toUpperCase()}</Text>
                </View>
                <Text style={styles.poolPair}>
                  {p.baseToken.symbol}/{p.quoteToken.symbol}
                </Text>
                {isCurrent ? (
                  <View style={styles.poolCurrent}>
                    <Text style={styles.poolCurrentText}>PRIMARY</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.poolStatsRow}>
                <PoolStat label="Liq" value={fmtUsd(p.liquidity?.usd ?? null)} />
                <PoolStat label="Vol 24h" value={fmtUsd(p.volume?.h24 ?? null)} />
                <PoolStat
                  label="24h"
                  value={chg == null ? "—" : fmtPct(chg, 1)}
                  color={chg == null ? Colors.muted : up ? Colors.mint : Colors.rose}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PoolStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.poolStatLabel}>{label}</Text>
      <Text style={[styles.poolStatValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function RiskTab({
  loading,
  data,
  holders,
  liquidity,
  age,
  labels,
}: {
  loading: boolean;
  data: {
    riskScore: number;
    isHoneypot: boolean;
    buyTax?: number;
    sellTax?: number;
    lpLocked?: boolean;
    topHoldersPct?: number;
  } | null;
  holders: number | null;
  liquidity: number | null;
  age: number | null;
  labels: string[];
}) {
  // Compose a heuristic score even if Birdeye is unavailable
  const heuristic = useMemo(() => {
    let score = 50;
    if ((liquidity ?? 0) > 250_000) score += 18;
    else if ((liquidity ?? 0) > 50_000) score += 8;
    else if ((liquidity ?? 0) < 5_000) score -= 20;
    if ((holders ?? 0) > 5_000) score += 12;
    else if ((holders ?? 0) > 500) score += 4;
    else if ((holders ?? 0) < 50 && (holders ?? 0) > 0) score -= 12;
    if (age && Date.now() - age > 30 * 24 * 3600 * 1000) score += 8;
    if (age && Date.now() - age < 24 * 3600 * 1000) score -= 6;
    return Math.max(0, Math.min(100, score));
  }, [liquidity, holders, age]);

  const score = data?.riskScore != null ? Math.max(0, Math.min(100, data.riskScore)) : heuristic;
  const tier =
    score >= 75 ? { label: "LOW RISK", color: Colors.mint, Icon: ShieldCheck } :
    score >= 50 ? { label: "MEDIUM", color: Colors.orange, Icon: Shield } :
    { label: "HIGH RISK", color: Colors.rose, Icon: ShieldAlert };

  return (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Risk score</Text>
        <View style={[styles.riskCard, { borderColor: `${tier.color}55` }]}>
          <View style={styles.riskTop}>
            <View style={[styles.riskBadge, { backgroundColor: `${tier.color}1A`, borderColor: `${tier.color}55` }]}>
              <tier.Icon color={tier.color} size={14} strokeWidth={2.8} />
              <Text style={[styles.riskBadgeText, { color: tier.color }]}>{tier.label}</Text>
            </View>
            <Text style={[styles.riskScore, { color: tier.color }]}>{score}</Text>
          </View>
          <View style={styles.riskBarTrack}>
            <View style={[styles.riskBarFill, { width: `${score}%`, backgroundColor: tier.color }]} />
          </View>
          <Text style={styles.riskHint}>
            {data ? "Powered by on-chain checks" : loading ? "Computing risk…" : "Heuristic score (live data unavailable)"}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Checks</Text>
        <View style={styles.tableCard}>
          <CheckRow label="Honeypot" value={data?.isHoneypot ? "Detected" : "Clear"} good={!data?.isHoneypot} />
          <CheckRow
            label="LP locked"
            value={data?.lpLocked == null ? "Unknown" : data.lpLocked ? "Yes" : "No"}
            good={data?.lpLocked === true}
            neutral={data?.lpLocked == null}
          />
          <CheckRow
            label="Buy tax"
            value={data?.buyTax != null ? `${data.buyTax.toFixed(2)}%` : "—"}
            good={data?.buyTax != null ? data.buyTax < 5 : undefined}
            neutral={data?.buyTax == null}
          />
          <CheckRow
            label="Sell tax"
            value={data?.sellTax != null ? `${data.sellTax.toFixed(2)}%` : "—"}
            good={data?.sellTax != null ? data.sellTax < 5 : undefined}
            neutral={data?.sellTax == null}
          />
          <CheckRow
            label="Top 10 holders"
            value={data?.topHoldersPct != null ? `${data.topHoldersPct.toFixed(1)}%` : "—"}
            good={data?.topHoldersPct != null ? data.topHoldersPct < 30 : undefined}
            neutral={data?.topHoldersPct == null}
          />
          <CheckRow
            label="Pool age"
            value={age ? ageString(age) : "—"}
            good={age ? Date.now() - age > 7 * 24 * 3600 * 1000 : undefined}
            neutral={!age}
            last
          />
        </View>
      </View>

      {labels.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pair labels</Text>
          <View style={styles.tagRow}>
            {labels.map((l) => (
              <View key={l} style={styles.tagPill}>
                <Text style={styles.tagText}>{l}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CheckRow({
  label,
  value,
  good,
  neutral,
  last,
}: {
  label: string;
  value: string;
  good?: boolean;
  neutral?: boolean;
  last?: boolean;
}) {
  const color = neutral ? Colors.muted : good ? Colors.mint : Colors.rose;
  return (
    <View style={[styles.tableRow, !last && styles.tableRowDiv]}>
      <Text style={styles.tableLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={[styles.tableChg, { color }]}>{value}</Text>
    </View>
  );
}

/* ---------------- Atoms ---------------- */

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <View style={[styles.metric, accent ? { borderColor: `${accent}33` } : null]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

function LinkRow({
  Icon,
  label,
  value,
  onPress,
}: {
  Icon: typeof Globe2;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  const has = !!value && value.trim().length > 0;
  return (
    <Pressable
      onPress={has ? onPress : undefined}
      disabled={!has}
      style={[styles.linkRow, !has && styles.linkRowDisabled]}
      testID={`link-${label.toLowerCase()}`}
    >
      <View style={styles.linkLeft}>
        <View style={styles.linkIconBox}>
          <Icon color={has ? Colors.mint : Colors.muted} size={13} strokeWidth={2.6} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkLabel}>{label}</Text>
          <Text style={styles.linkValue} numberOfLines={1}>
            {has ? value : "Not provided"}
          </Text>
        </View>
      </View>
      {has ? <ExternalLink color={Colors.muted} size={14} strokeWidth={2.4} /> : null}
    </Pressable>
  );
}

function MarketMini({
  Icon,
  label,
  value,
  color,
}: {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.marketMini}>
      <View style={[styles.marketMiniIcon, { backgroundColor: `${color}16`, borderColor: `${color}33` }]}> 
        <Icon color={color} size={13} strokeWidth={2.8} />
      </View>
      <Text style={styles.marketMiniLabel}>{label}</Text>
      <Text style={styles.marketMiniValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function SignalBar({ label, value, color }: { label: string; value: number; color: string }) {
  const width = `${Math.max(8, Math.min(100, value))}%` as DimensionValue;
  return (
    <View style={styles.signalBarItem}>
      <View style={styles.signalBarTop}>
        <Text style={styles.signalBarLabel}>{label}</Text>
        <Text style={[styles.signalBarValue, { color }]}>{Math.round(value)}</Text>
      </View>
      <View style={styles.signalBarTrack}>
        <View style={[styles.signalBarFill, { width, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  scroll: { paddingBottom: 200 },
  bgOrbTop: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(56,215,255,0.13)",
  },
  bgOrbBottom: {
    position: "absolute",
    top: 310,
    left: -130,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(217,70,255,0.09)",
  },

  bannerWrap: { height: 232, position: "relative" },
  banner: { ...StyleSheet.absoluteFillObject },
  bannerFade: { ...StyleSheet.absoluteFillObject },
  bannerColorWash: { ...StyleSheet.absoluteFillObject },
  bannerGlow: {
    position: "absolute",
    right: -64,
    bottom: -86,
    width: 210,
    height: 210,
    borderRadius: 105,
  },
  heroStamp: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 28,
  },
  heroLiveBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroLiveDot: { width: 7, height: 7, borderRadius: 4 },
  heroLiveText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
  heroStampTitle: { color: Colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -1, marginTop: 9 },
  heroStampSub: { color: Colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.3, marginTop: 3 },
  athBannerPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,198,83,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,198,83,0.34)",
  },
  athBannerLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  athBannerValue: { color: Colors.goldBright, fontSize: 11, fontWeight: "900" },
  athBannerDrop: { color: Colors.text, fontSize: 10, fontWeight: "800", opacity: 0.86 },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },

  headWrap: {
    marginTop: -32, paddingHorizontal: 18,
    flexDirection: "row", alignItems: "flex-end", gap: 14,
  },
  logoBlock: { borderRadius: 22, padding: 4, backgroundColor: Colors.ink, position: "relative" },
  logo: { width: 76, height: 76, borderRadius: 18 },
  logoFallback: { alignItems: "center", justifyContent: "center" },
  logoText: { color: Colors.ink, fontSize: 18, fontWeight: "900" },
  logoLiveDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.ink,
    alignItems: "center", justifyContent: "center",
  },
  logoLiveDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.mint },
  headInfo: { flex: 1, paddingBottom: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5, flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  tickerPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.12)",
    borderWidth: 1, borderColor: "rgba(85,245,178,0.3)",
  },
  tickerText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },
  venuePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)" },
  venueText: { color: Colors.muted, fontSize: 10, fontWeight: "800" },
  agePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(56,215,255,0.12)",
    borderWidth: 1, borderColor: "rgba(56,215,255,0.3)",
  },
  ageText: { color: Colors.cyan, fontSize: 10, fontWeight: "900" },

  commandDock: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  marketMini: {
    flex: 1,
    minHeight: 98,
    borderRadius: 17,
    padding: 10,
    backgroundColor: "rgba(11,24,26,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  marketMiniIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  marketMiniLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, marginTop: 9, textTransform: "uppercase" },
  marketMiniValue: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.3, marginTop: 3 },

  priceCard: {
    marginHorizontal: 16, marginTop: 14,
    borderRadius: 24, overflow: "hidden",
    borderWidth: 1,
  },
  priceCardInner: {
    padding: 16, borderRadius: 24,
    backgroundColor: "rgba(11,24,26,0.92)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  priceTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  priceLabelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  pricePulseDot: { width: 7, height: 7, borderRadius: 4 },
  priceLabel: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  priceValue: { color: Colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 5 },
  priceCaption: { color: Colors.muted, fontSize: 11, fontWeight: "800", marginTop: 4 },
  changeBadge: {
    alignItems: "center", gap: 3,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 15, borderWidth: 1,
    minWidth: 78,
  },
  changeText: { fontSize: 13, fontWeight: "900" },
  changeBadgeSub: { color: Colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  commandScoreCard: {
    marginTop: 15,
    padding: 13,
    borderRadius: 18,
    backgroundColor: "rgba(3,7,8,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  commandScoreTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  commandScoreLabel: { color: Colors.text, fontSize: 13, fontWeight: "900", letterSpacing: -0.1 },
  commandScoreSub: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  commandScoreValue: { fontSize: 29, fontWeight: "900", letterSpacing: -0.8 },
  commandScoreTrack: { height: 9, borderRadius: 6, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)", marginTop: 12 },
  commandScoreFill: { height: "100%", borderRadius: 6 },
  signalBarsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  signalBarItem: { flex: 1 },
  signalBarTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  signalBarLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  signalBarValue: { fontSize: 10, fontWeight: "900" },
  signalBarTrack: { height: 5, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.07)", marginTop: 5 },
  signalBarFill: { height: "100%", borderRadius: 4 },

  tfRow: { flexDirection: "row", gap: 6, marginTop: 14 },
  tfBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center", gap: 2,
  },
  tfBtnActive: {
    backgroundColor: "rgba(85,245,178,0.14)",
    borderColor: "rgba(85,245,178,0.45)",
  },
  tfLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  tfLabelActive: { color: Colors.mint },
  tfChange: { fontSize: 11, fontWeight: "900" },

  chartEmbed: {
    marginTop: 14,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  chartChrome: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    backgroundColor: "rgba(3,7,8,0.72)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  chartDotRed: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.rose },
  chartDotYellow: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.orange },
  chartDotGreen: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.mint },
  chartChromeText: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginLeft: 4, textTransform: "uppercase" },

  tabsBar: {
    flexDirection: "row", gap: 6,
    marginHorizontal: 16, marginTop: 16,
    padding: 5, borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 9, borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: Colors.mint },
  tabText: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  tabTextActive: { color: Colors.ink },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8, marginTop: 14 },
  metric: {
    flexBasis: "47%", flexGrow: 1, padding: 12, borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  metricLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  metricValue: { color: Colors.text, fontSize: 16, fontWeight: "900", marginTop: 4 },
  metricSub: { color: Colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },

  actionRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 14 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 11, borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  actionBtnOn: { backgroundColor: "rgba(255,184,76,0.1)", borderColor: "rgba(255,184,76,0.4)" },
  actionText: { color: Colors.text, fontSize: 12, fontWeight: "900" },

  section: { marginTop: 22, paddingHorizontal: 16 },
  sectionLabel: {
    color: Colors.muted, fontSize: 11, fontWeight: "900",
    letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 10,
  },
  contractRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  contractText: { color: Colors.text, fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  copyBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  copyText: { color: Colors.muted, fontSize: 11, fontWeight: "900" },

  descText: { color: Colors.text, fontSize: 14, fontWeight: "500", lineHeight: 22 },

  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.1)",
    borderWidth: 1, borderColor: "rgba(85,245,178,0.25)",
  },
  tagText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },

  linksCol: { gap: 8 },
  linkRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 12, borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  linkRowDisabled: { opacity: 0.6 },
  linkLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  linkIconBox: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center", justifyContent: "center",
  },
  linkLabel: { color: Colors.text, fontSize: 12, fontWeight: "900" },
  linkValue: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2, maxWidth: 220 },

  /* Pressure */
  pressureCard: {
    padding: 14, borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  pressureBarTrack: {
    height: 10, borderRadius: 6, overflow: "hidden",
    backgroundColor: "rgba(255,93,143,0.18)",
  },
  pressureBarFill: { height: "100%", backgroundColor: Colors.mint },
  pressureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  pressureSide: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  pressureCount: { color: Colors.text, fontSize: 16, fontWeight: "900", marginTop: 2 },
  pressurePct: { color: Colors.text, fontSize: 22, fontWeight: "900" },
  pressureSubtle: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 10, textAlign: "center" },

  tableCard: {
    borderRadius: 14, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 13, gap: 10,
  },
  tableRowDiv: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  tableLabel: { color: Colors.muted, fontSize: 12, fontWeight: "900", width: 90, letterSpacing: 0.4 },
  tableVol: { color: Colors.text, fontSize: 14, fontWeight: "800", flex: 1 },
  tableChg: { fontSize: 13, fontWeight: "900" },

  /* Pools */
  poolCard: {
    padding: 12, borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  poolCardActive: { borderColor: "rgba(85,245,178,0.45)" },
  poolTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  poolBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7,
    backgroundColor: "rgba(56,215,255,0.12)",
    borderWidth: 1, borderColor: "rgba(56,215,255,0.3)",
  },
  poolBadgeText: { color: Colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  poolPair: { color: Colors.text, fontSize: 13, fontWeight: "900", flex: 1 },
  poolCurrent: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7,
    backgroundColor: "rgba(85,245,178,0.14)",
  },
  poolCurrentText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  poolStatsRow: { flexDirection: "row", marginTop: 10, gap: 8 },
  poolStatLabel: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  poolStatValue: { color: Colors.text, fontSize: 13, fontWeight: "900", marginTop: 3 },

  emptyCard: {
    padding: 22, borderRadius: 14, alignItems: "center", gap: 8,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  emptyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  emptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", textAlign: "center" },

  /* Risk */
  riskCard: {
    padding: 16, borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
  },
  riskTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  riskBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  riskBadgeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  riskScore: { fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  riskBarTrack: {
    height: 8, borderRadius: 5, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)", marginTop: 14,
  },
  riskBarFill: { height: "100%" },
  riskHint: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 10 },

  /* Sticky bar */
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingTop: 28, paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 22 : 16,
  },
  stickyFade: { ...StyleSheet.absoluteFillObject },
  quickRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  quickBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 11,
    backgroundColor: "rgba(11,24,26,0.92)",
    borderWidth: 1, borderColor: "rgba(85,245,178,0.25)",
    alignItems: "center",
  },
  quickAmt: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  quickSol: { color: Colors.muted, fontSize: 9, fontWeight: "900", marginTop: 1, letterSpacing: 0.6 },
  quickCustom: { backgroundColor: "rgba(85,245,178,0.12)" },
  quickCustomText: { color: Colors.mint, fontSize: 12, fontWeight: "900", paddingVertical: 3 },
  stickyInner: {
    flexDirection: "row", gap: 8, padding: 8, borderRadius: 22,
    borderWidth: 1, borderColor: "rgba(85,245,178,0.25)",
    backgroundColor: "rgba(11,24,26,0.92)",
  },
  stickyWatch: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  stickyWatchOn: { backgroundColor: "rgba(85,245,178,0.14)", borderColor: "rgba(85,245,178,0.45)" },
  stickyAlert: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(56,215,255,0.10)",
    borderWidth: 1, borderColor: "rgba(56,215,255,0.35)",
  },
  stickyAction: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 48, borderRadius: 14, overflow: "hidden",
  },
  stickyBuy: {},
  stickyBuyText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  stickySell: {
    backgroundColor: "rgba(255,93,143,0.10)",
    borderWidth: 1, borderColor: "rgba(255,93,143,0.45)",
  },
  stickySellText: { color: Colors.rose, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },

  tradeBtn: { marginHorizontal: 16, marginTop: 22, borderRadius: 14, overflow: "hidden" },
  tradeGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15,
  },
  tradeText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

  viewsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18 },
  viewsText: { color: Colors.muted, fontSize: 11, fontWeight: "700" },

  notFoundWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  notFoundTitle: { color: Colors.text, fontSize: 20, fontWeight: "900" },
  notFoundBody: { color: Colors.muted, fontSize: 13, fontWeight: "600", marginTop: 6, textAlign: "center" },
  backBtnSolo: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: Colors.mint },
  backBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900" },
});
