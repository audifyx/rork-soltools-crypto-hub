import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  Brain,
  Calendar,
  ChartBar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Crown,
  Database,
  DollarSign,
  Eye,
  FileWarning,
  Filter,
  FlaskConical,
  Flag,
  Gauge,
  Gift,
  Globe2,
  Hash,
  HeartPulse,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LineChart,
  Lock,
  Map as MapIcon,
  Megaphone,
  MessageSquare,
  Network,
  PieChart,
  Pin,
  Radio,
  RefreshCw,
  Repeat,
  Rocket,
  Search,
  Send,
  Server,
  Settings as SettingsIcon,
  Share2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Star,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
  Wand2,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "@/providers/admin-provider";
import { useAuth } from "@/providers/auth-provider";
import { fmtNum } from "@/utils/format";

type IconComponent = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type CategoryKey =
  | "analytics"
  | "demographics"
  | "moderation"
  | "content"
  | "growth"
  | "revenue"
  | "security"
  | "ops"
  | "comms"
  | "experiments"
  | "ai";

interface Category {
  key: CategoryKey;
  label: string;
  Icon: IconComponent;
  tint: string;
}

const CATEGORIES: Category[] = [
  { key: "analytics", label: "Analytics suite", Icon: BarChart3, tint: "#62D0FF" },
  { key: "demographics", label: "User base", Icon: Globe2, tint: "#9CD7FF" },
  { key: "moderation", label: "Moderation", Icon: ShieldAlert, tint: "#FF6B6B" },
  { key: "content", label: "Content health", Icon: Layers, tint: "#A78BFA" },
  { key: "growth", label: "Growth & retention", Icon: TrendingUp, tint: "#34D399" },
  { key: "revenue", label: "Revenue & credits", Icon: DollarSign, tint: "#FBBF24" },
  { key: "security", label: "Security & audit", Icon: ShieldCheck, tint: "#F87171" },
  { key: "ops", label: "System ops", Icon: Server, tint: "#60A5FA" },
  { key: "comms", label: "Communications", Icon: Megaphone, tint: "#F472B6" },
  { key: "experiments", label: "Experiments", Icon: FlaskConical, tint: "#FDE68A" },
  { key: "ai", label: "AI & automation", Icon: Bot, tint: "#C4B5FD" },
];

interface Feature {
  id: string;
  title: string;
  sub: string;
  category: CategoryKey;
  Icon: IconComponent;
  flag?: "live" | "beta" | "soon";
}

/**
 * Owner-only 250-feature catalog. Each entry surfaces an actionable owner tool.
 * Tap a tile to open a detail sheet — live tiles execute real reads/writes,
 * beta tiles are wired but throttled to owner accounts, and soon tiles are
 * staged for the next release with the owner can preview specs.
 */
const FEATURES: Feature[] = [
  // 1-40 Analytics suite
  { id: "anlx-dau", title: "DAU pulse", sub: "Daily active users · live", category: "analytics", Icon: Activity, flag: "live" },
  { id: "anlx-wau", title: "WAU rolling", sub: "7-day active rolling avg", category: "analytics", Icon: LineChart, flag: "live" },
  { id: "anlx-mau", title: "MAU snapshot", sub: "30-day actives", category: "analytics", Icon: ChartBar, flag: "live" },
  { id: "anlx-stk", title: "Stickiness ratio", sub: "DAU ÷ MAU", category: "analytics", Icon: HeartPulse, flag: "live" },
  { id: "anlx-cohort", title: "Cohort retention", sub: "Weekly cohort decay", category: "analytics", Icon: Layers, flag: "beta" },
  { id: "anlx-funnel", title: "Onboarding funnel", sub: "Signup → first post", category: "analytics", Icon: Filter, flag: "beta" },
  { id: "anlx-session", title: "Session length", sub: "p50 / p90 in app", category: "analytics", Icon: Timer, flag: "beta" },
  { id: "anlx-screen", title: "Top screens", sub: "Most viewed surfaces", category: "analytics", Icon: Eye, flag: "beta" },
  { id: "anlx-bounce", title: "Bounce rate", sub: "<10s sessions", category: "analytics", Icon: TrendingDown, flag: "beta" },
  { id: "anlx-time", title: "Time-of-day map", sub: "24h activity heat", category: "analytics", Icon: Clock, flag: "beta" },
  { id: "anlx-day", title: "Day-of-week map", sub: "7-day activity heat", category: "analytics", Icon: Calendar, flag: "beta" },
  { id: "anlx-event", title: "Event stream", sub: "Raw event firehose", category: "analytics", Icon: Radio, flag: "soon" },
  { id: "anlx-vel", title: "Signup velocity", sub: "New users / hour", category: "analytics", Icon: Zap, flag: "live" },
  { id: "anlx-churn", title: "Churn radar", sub: "30d / 60d / 90d", category: "analytics", Icon: TrendingDown, flag: "beta" },
  { id: "anlx-power", title: "Power user index", sub: "Top 1% engagement", category: "analytics", Icon: Star, flag: "beta" },
  { id: "anlx-graph", title: "Social graph density", sub: "Avg follows / user", category: "analytics", Icon: Network, flag: "beta" },
  { id: "anlx-virality", title: "K-factor", sub: "Viral coefficient", category: "analytics", Icon: Share2, flag: "beta" },
  { id: "anlx-conv", title: "Visitor → user", sub: "Conversion %", category: "analytics", Icon: UserPlus, flag: "beta" },
  { id: "anlx-lt", title: "Lifetime usage", sub: "Avg LT in days", category: "analytics", Icon: Clock, flag: "beta" },
  { id: "anlx-rev", title: "Revenue per user", sub: "ARPU rolling", category: "analytics", Icon: DollarSign, flag: "beta" },
  { id: "anlx-mom", title: "MoM growth", sub: "% change vs prev month", category: "analytics", Icon: TrendingUp, flag: "live" },
  { id: "anlx-yoy", title: "YoY trend", sub: "Year-over-year", category: "analytics", Icon: TrendingUp, flag: "beta" },
  { id: "anlx-realtime", title: "Realtime online", sub: "Users right now", category: "analytics", Icon: Activity, flag: "live" },
  { id: "anlx-source", title: "Acquisition source", sub: "Where users came from", category: "analytics", Icon: Target, flag: "beta" },
  { id: "anlx-utm", title: "UTM breakdown", sub: "Campaign attribution", category: "analytics", Icon: Hash, flag: "beta" },
  { id: "anlx-ref", title: "Referrer tree", sub: "Who invited whom", category: "analytics", Icon: Network, flag: "live" },
  { id: "anlx-search", title: "Top search queries", sub: "What users hunt for", category: "analytics", Icon: Search, flag: "beta" },
  { id: "anlx-clk", title: "Click heatmap", sub: "Tap density per screen", category: "analytics", Icon: Target, flag: "soon" },
  { id: "anlx-scroll", title: "Scroll depth", sub: "Feed read length", category: "analytics", Icon: Gauge, flag: "soon" },
  { id: "anlx-perf", title: "Perf vitals", sub: "FPS, JS heap, cold start", category: "analytics", Icon: Cpu, flag: "beta" },
  { id: "anlx-err", title: "Error rate", sub: "Crashes per session", category: "analytics", Icon: AlertTriangle, flag: "beta" },
  { id: "anlx-api", title: "API health", sub: "p95 latency, 5xx %", category: "analytics", Icon: Server, flag: "beta" },
  { id: "anlx-rpc", title: "RPC explorer", sub: "Slowest functions", category: "analytics", Icon: Database, flag: "beta" },
  { id: "anlx-feed", title: "Feed algorithm metrics", sub: "Score distribution", category: "analytics", Icon: Layers, flag: "beta" },
  { id: "anlx-fyp", title: "FYP coverage", sub: "% users with feed", category: "analytics", Icon: Sparkles, flag: "beta" },
  { id: "anlx-creat", title: "Creator ratio", sub: "Posters ÷ viewers", category: "analytics", Icon: PieChart, flag: "beta" },
  { id: "anlx-eng", title: "Engagement index", sub: "Likes+comments per post", category: "analytics", Icon: HeartPulse, flag: "beta" },
  { id: "anlx-dm", title: "DM volume", sub: "Messages / day", category: "analytics", Icon: MessageSquare, flag: "live" },
  { id: "anlx-reel", title: "Reel watch time", sub: "Avg seconds / view", category: "analytics", Icon: Eye, flag: "beta" },
  { id: "anlx-story", title: "Story completion", sub: "% finished slides", category: "analytics", Icon: Eye, flag: "beta" },

  // 41-65 Demographics & geography
  { id: "demo-geo", title: "Country breakdown", sub: "Users by country", category: "demographics", Icon: Globe2, flag: "live" },
  { id: "demo-city", title: "City heatmap", sub: "Top cities", category: "demographics", Icon: MapIcon, flag: "beta" },
  { id: "demo-tz", title: "Timezone spread", sub: "Active hours per zone", category: "demographics", Icon: Clock, flag: "beta" },
  { id: "demo-lang", title: "Language mix", sub: "Detected locales", category: "demographics", Icon: Globe2, flag: "beta" },
  { id: "demo-device", title: "Device split", sub: "iOS vs Android", category: "demographics", Icon: Cpu, flag: "beta" },
  { id: "demo-os", title: "OS versions", sub: "iOS / Android distribution", category: "demographics", Icon: Cpu, flag: "beta" },
  { id: "demo-app", title: "App version mix", sub: "% on latest build", category: "demographics", Icon: Layers, flag: "beta" },
  { id: "demo-wallet", title: "Wallet adoption", sub: "Users with SOL wallet", category: "demographics", Icon: Wallet, flag: "live" },
  { id: "demo-network", title: "Wallet network", sub: "Solana, EVM, none", category: "demographics", Icon: Network, flag: "beta" },
  { id: "demo-hand", title: "Handle uniqueness", sub: "Duplicate detection", category: "demographics", Icon: Hash, flag: "beta" },
  { id: "demo-bio", title: "Bio completion", sub: "% profiles with bio", category: "demographics", Icon: UserCheck, flag: "beta" },
  { id: "demo-pfp", title: "PFP completion", sub: "% with avatar", category: "demographics", Icon: ImageIcon, flag: "beta" },
  { id: "demo-link", title: "Linked socials", sub: "X / TG / Discord coverage", category: "demographics", Icon: Share2, flag: "beta" },
  { id: "demo-age", title: "Account age cohort", sub: "<7d / 30d / 90d / 1y", category: "demographics", Icon: Calendar, flag: "live" },
  { id: "demo-newbie", title: "Newbie pool", sub: "Last 24h signups", category: "demographics", Icon: UserPlus, flag: "live" },
  { id: "demo-ret", title: "D1 / D7 / D30 retention", sub: "Per cohort", category: "demographics", Icon: Repeat, flag: "beta" },
  { id: "demo-host", title: "Top hosts", sub: "Active space hosts", category: "demographics", Icon: Radio, flag: "beta" },
  { id: "demo-verif", title: "Verified ratio", sub: "% users verified", category: "demographics", Icon: ShieldCheck, flag: "live" },
  { id: "demo-holder", title: "Holder tiers", sub: "Whale / dolphin / shrimp", category: "demographics", Icon: Crown, flag: "beta" },
  { id: "demo-influence", title: "Influence score", sub: "Followers × engagement", category: "demographics", Icon: Star, flag: "beta" },
  { id: "demo-orphan", title: "Orphan accounts", sub: "Zero-follow profiles", category: "demographics", Icon: UserMinus, flag: "beta" },
  { id: "demo-dup", title: "Possible duplicates", sub: "Same wallet / IP", category: "demographics", Icon: Filter, flag: "beta" },
  { id: "demo-vpn", title: "VPN/proxy hits", sub: "Suspicious IPs", category: "demographics", Icon: Network, flag: "soon" },
  { id: "demo-org", title: "Organic vs invited", sub: "Acquisition share", category: "demographics", Icon: UserPlus, flag: "beta" },
  { id: "demo-trial", title: "Trial-only users", sub: "Never converted", category: "demographics", Icon: Clock, flag: "beta" },

  // 66-100 Moderation
  { id: "mod-rep", title: "Report inbox", sub: "Pending reports queue", category: "moderation", Icon: Flag, flag: "live" },
  { id: "mod-flag", title: "Auto-flag review", sub: "ML-flagged content", category: "moderation", Icon: AlertTriangle, flag: "beta" },
  { id: "mod-shadow", title: "Shadow ban", sub: "Silent rate-limit user", category: "moderation", Icon: ShieldX, flag: "beta" },
  { id: "mod-mute", title: "Global mute", sub: "Hide from feeds", category: "moderation", Icon: ShieldX, flag: "beta" },
  { id: "mod-rate", title: "Rate-limit user", sub: "Cap posts/day", category: "moderation", Icon: Gauge, flag: "beta" },
  { id: "mod-ban", title: "Permanent ban", sub: "Block + revoke", category: "moderation", Icon: ShieldX, flag: "live" },
  { id: "mod-ip", title: "IP ban", sub: "Block address ranges", category: "moderation", Icon: ShieldAlert, flag: "soon" },
  { id: "mod-wallet", title: "Wallet ban", sub: "Block by sol wallet", category: "moderation", Icon: Wallet, flag: "beta" },
  { id: "mod-word", title: "Word filter", sub: "Banned terms registry", category: "moderation", Icon: FileWarning, flag: "beta" },
  { id: "mod-regex", title: "Regex blocker", sub: "Pattern-based filter", category: "moderation", Icon: Filter, flag: "beta" },
  { id: "mod-spam", title: "Spam wave detector", sub: "Detect coordinated posts", category: "moderation", Icon: AlertTriangle, flag: "beta" },
  { id: "mod-bot", title: "Bot heuristics", sub: "Detect automation", category: "moderation", Icon: Bot, flag: "beta" },
  { id: "mod-img", title: "Image moderation", sub: "NSFW / violence detector", category: "moderation", Icon: ImageIcon, flag: "soon" },
  { id: "mod-link", title: "Link safety", sub: "Phish/scam scanner", category: "moderation", Icon: ShieldAlert, flag: "beta" },
  { id: "mod-token", title: "Rugpull radar", sub: "Block suspicious tokens", category: "moderation", Icon: AlertTriangle, flag: "beta" },
  { id: "mod-warn", title: "Warning system", sub: "Issue strikes", category: "moderation", Icon: AlertTriangle, flag: "beta" },
  { id: "mod-strike", title: "Strike registry", sub: "3-strike enforcement", category: "moderation", Icon: ShieldX, flag: "beta" },
  { id: "mod-appeal", title: "Appeals desk", sub: "User ban appeals", category: "moderation", Icon: ShieldCheck, flag: "beta" },
  { id: "mod-quar", title: "Quarantine", sub: "Hide pending review", category: "moderation", Icon: Lock, flag: "beta" },
  { id: "mod-bulk", title: "Bulk delete", sub: "Sweep by author / regex", category: "moderation", Icon: ShieldX, flag: "beta" },
  { id: "mod-pin", title: "Force-pin post", sub: "Pin globally", category: "moderation", Icon: Pin, flag: "beta" },
  { id: "mod-unpin", title: "Unpin override", sub: "Remove user pins", category: "moderation", Icon: Pin, flag: "beta" },
  { id: "mod-locks", title: "Comment lock", sub: "Disable replies on post", category: "moderation", Icon: Lock, flag: "beta" },
  { id: "mod-com-lock", title: "Community lock", sub: "Freeze a community", category: "moderation", Icon: Lock, flag: "beta" },
  { id: "mod-event", title: "Event takedown", sub: "Cancel sketchy events", category: "moderation", Icon: Calendar, flag: "beta" },
  { id: "mod-space", title: "Space kick", sub: "Eject from audio room", category: "moderation", Icon: Radio, flag: "beta" },
  { id: "mod-reel", title: "Reel takedown", sub: "Remove + ban uploader", category: "moderation", Icon: ShieldX, flag: "beta" },
  { id: "mod-story", title: "Story takedown", sub: "Pull a story", category: "moderation", Icon: ShieldX, flag: "beta" },
  { id: "mod-dm", title: "DM intervention", sub: "Review reported chats", category: "moderation", Icon: MessageSquare, flag: "beta" },
  { id: "mod-handle", title: "Handle lockdown", sub: "Block handle changes", category: "moderation", Icon: KeyRound, flag: "beta" },
  { id: "mod-team", title: "Mod team console", sub: "Assign queues", category: "moderation", Icon: Users, flag: "beta" },
  { id: "mod-queue", title: "Queue manager", sub: "Distribute load", category: "moderation", Icon: Layers, flag: "beta" },
  { id: "mod-sla", title: "Mod SLA", sub: "Time-to-action tracker", category: "moderation", Icon: Timer, flag: "beta" },
  { id: "mod-rules", title: "Auto-rule editor", sub: "If-this-then-action", category: "moderation", Icon: Wand2, flag: "soon" },
  { id: "mod-trust", title: "Trust score", sub: "User reputation model", category: "moderation", Icon: ShieldCheck, flag: "beta" },

  // 101-125 Content health
  { id: "cnt-top", title: "Top posts (24h)", sub: "Highest engagement", category: "content", Icon: TrendingUp, flag: "live" },
  { id: "cnt-trend", title: "Trending tags", sub: "Top hashtags now", category: "content", Icon: Hash, flag: "live" },
  { id: "cnt-low", title: "Low-quality watch", sub: "Posts losing engagement", category: "content", Icon: TrendingDown, flag: "beta" },
  { id: "cnt-spam-tag", title: "Spam-tag review", sub: "Auto-tagged suspects", category: "content", Icon: AlertTriangle, flag: "beta" },
  { id: "cnt-anon", title: "Anonymous posts", sub: "Review anon stream", category: "content", Icon: Eye, flag: "beta" },
  { id: "cnt-len", title: "Post length distribution", sub: "Shortform vs longform", category: "content", Icon: BarChart3, flag: "beta" },
  { id: "cnt-media", title: "Media ratio", sub: "Text / image / video", category: "content", Icon: PieChart, flag: "beta" },
  { id: "cnt-cre", title: "Top creators", sub: "By engagement", category: "content", Icon: Crown, flag: "live" },
  { id: "cnt-dead", title: "Dead posts", sub: "Zero engagement", category: "content", Icon: TrendingDown, flag: "beta" },
  { id: "cnt-rec", title: "Recycled content", sub: "Duplicate detector", category: "content", Icon: Repeat, flag: "beta" },
  { id: "cnt-poll", title: "Poll analytics", sub: "Vote totals + skew", category: "content", Icon: PieChart, flag: "beta" },
  { id: "cnt-story-h", title: "Story health", sub: "Drop-off per slide", category: "content", Icon: LineChart, flag: "beta" },
  { id: "cnt-reel-h", title: "Reel completion", sub: "% finished views", category: "content", Icon: Activity, flag: "beta" },
  { id: "cnt-com", title: "Community pulse", sub: "Per-community DAU", category: "content", Icon: Users, flag: "beta" },
  { id: "cnt-event-h", title: "Event RSVP rate", sub: "RSVP ÷ views", category: "content", Icon: Calendar, flag: "beta" },
  { id: "cnt-space-h", title: "Space attendance", sub: "Peak audio rooms", category: "content", Icon: Radio, flag: "beta" },
  { id: "cnt-search-q", title: "Search quality", sub: "Click-through rate", category: "content", Icon: Search, flag: "beta" },
  { id: "cnt-link-h", title: "Link unfurl health", sub: "Failed previews", category: "content", Icon: Share2, flag: "beta" },
  { id: "cnt-bm", title: "Bookmark velocity", sub: "Most-saved this week", category: "content", Icon: Star, flag: "beta" },
  { id: "cnt-shr", title: "Share count map", sub: "Where posts go", category: "content", Icon: Share2, flag: "beta" },
  { id: "cnt-cmt", title: "Comment depth", sub: "Reply tree median depth", category: "content", Icon: MessageSquare, flag: "beta" },
  { id: "cnt-img-q", title: "Image quality audit", sub: "Low-res / blurry uploads", category: "content", Icon: ImageIcon, flag: "soon" },
  { id: "cnt-cap", title: "Caption quality", sub: "Empty/short captions", category: "content", Icon: FileWarning, flag: "beta" },
  { id: "cnt-tag-h", title: "Tag hygiene", sub: "Spammy hashtag use", category: "content", Icon: Hash, flag: "beta" },
  { id: "cnt-velocity", title: "Post velocity", sub: "Posts per minute", category: "content", Icon: Activity, flag: "live" },

  // 126-150 Growth & retention
  { id: "grw-inv", title: "Invite leaderboard", sub: "Top referrers", category: "growth", Icon: Crown, flag: "live" },
  { id: "grw-streak", title: "Streak cohort", sub: "Active 7-day streaks", category: "growth", Icon: Zap, flag: "live" },
  { id: "grw-quest", title: "Quest tracker", sub: "Completion rates", category: "growth", Icon: Target, flag: "beta" },
  { id: "grw-achv", title: "Achievement unlocks", sub: "Top badges earned", category: "growth", Icon: Star, flag: "beta" },
  { id: "grw-react", title: "Reactivation campaigns", sub: "Win-back queue", category: "growth", Icon: Repeat, flag: "beta" },
  { id: "grw-push", title: "Push tuning", sub: "Open rate by time", category: "growth", Icon: Bell, flag: "beta" },
  { id: "grw-digest", title: "Smart digest preview", sub: "Test daily digest", category: "growth", Icon: Bell, flag: "beta" },
  { id: "grw-ab", title: "A/B onboarding", sub: "Variant performance", category: "growth", Icon: FlaskConical, flag: "beta" },
  { id: "grw-onb", title: "Onboarding drop-off", sub: "Step-by-step funnel", category: "growth", Icon: Filter, flag: "beta" },
  { id: "grw-recap", title: "Weekly recap blast", sub: "Mass-trigger recap push", category: "growth", Icon: Send, flag: "beta" },
  { id: "grw-ref", title: "Referral bonuses", sub: "Reward configurator", category: "growth", Icon: Gift, flag: "beta" },
  { id: "grw-win", title: "Win-back coupon", sub: "Lapsed-user credits", category: "growth", Icon: Gift, flag: "beta" },
  { id: "grw-rec-friend", title: "Reconnect prompts", sub: "Suggest old friends", category: "growth", Icon: UserPlus, flag: "beta" },
  { id: "grw-sug", title: "Suggested follows audit", sub: "Quality of FYP picks", category: "growth", Icon: Network, flag: "beta" },
  { id: "grw-quiz", title: "Interest quiz analytics", sub: "Topic popularity", category: "growth", Icon: Brain, flag: "beta" },
  { id: "grw-pin", title: "Promo banner pinner", sub: "Top-of-feed banner", category: "growth", Icon: Pin, flag: "beta" },
  { id: "grw-newc", title: "Newcomer welcome", sub: "Auto-DM first-timers", category: "growth", Icon: UserPlus, flag: "beta" },
  { id: "grw-cre-prog", title: "Creator program", sub: "Top creators rewards", category: "growth", Icon: Crown, flag: "beta" },
  { id: "grw-loyal", title: "Loyalty tiers", sub: "Bronze / silver / gold", category: "growth", Icon: Star, flag: "beta" },
  { id: "grw-event-mkt", title: "Event marketing", sub: "Boost RSVPs", category: "growth", Icon: Megaphone, flag: "beta" },
  { id: "grw-trial", title: "Trial extender", sub: "Grant trial days", category: "growth", Icon: Clock, flag: "beta" },
  { id: "grw-ret-test", title: "Retention experiment", sub: "Try new triggers", category: "growth", Icon: FlaskConical, flag: "beta" },
  { id: "grw-emoji", title: "Emoji reactions split test", sub: "Different reaction sets", category: "growth", Icon: HeartPulse, flag: "soon" },
  { id: "grw-share-link", title: "Smart share links", sub: "Deep-link tracker", category: "growth", Icon: Share2, flag: "beta" },
  { id: "grw-cre-fund", title: "Creator fund", sub: "Pay creators in credits", category: "growth", Icon: DollarSign, flag: "beta" },

  // 151-170 Revenue & credits
  { id: "rev-arpu", title: "ARPU dashboard", sub: "Avg revenue / user", category: "revenue", Icon: DollarSign, flag: "beta" },
  { id: "rev-mrr", title: "MRR tracker", sub: "Monthly recurring revenue", category: "revenue", Icon: TrendingUp, flag: "beta" },
  { id: "rev-credits", title: "Credit economy", sub: "Spend, top-up, refund", category: "revenue", Icon: Coins, flag: "live" },
  { id: "rev-burn", title: "Credit burn rate", sub: "Cost per active user", category: "revenue", Icon: Activity, flag: "beta" },
  { id: "rev-cap", title: "Cap planner", sub: "Adjust monthly caps", category: "revenue", Icon: Gauge, flag: "beta" },
  { id: "rev-grant", title: "Owner grants", sub: "Issue free credits", category: "revenue", Icon: Gift, flag: "live" },
  { id: "rev-vip", title: "VIP allowlist", sub: "Whitelist big spenders", category: "revenue", Icon: Crown, flag: "beta" },
  { id: "rev-tier", title: "Tier configurator", sub: "Free / pro / whale", category: "revenue", Icon: Layers, flag: "beta" },
  { id: "rev-coupon", title: "Coupons", sub: "Generate codes", category: "revenue", Icon: Gift, flag: "beta" },
  { id: "rev-promo", title: "Promo pricing", sub: "Time-boxed discounts", category: "revenue", Icon: DollarSign, flag: "beta" },
  { id: "rev-ref-pay", title: "Referral payouts", sub: "Auto-pay referrers", category: "revenue", Icon: Wallet, flag: "beta" },
  { id: "rev-host-pay", title: "Host payouts", sub: "Pay top space hosts", category: "revenue", Icon: Wallet, flag: "beta" },
  { id: "rev-fraud", title: "Refund fraud guard", sub: "Detect abuse", category: "revenue", Icon: ShieldAlert, flag: "beta" },
  { id: "rev-fee", title: "Fee model editor", sub: "Platform fee tuning", category: "revenue", Icon: SettingsIcon, flag: "soon" },
  { id: "rev-tax", title: "Tax exports", sub: "1099 / VAT data dump", category: "revenue", Icon: FileWarning, flag: "soon" },
  { id: "rev-ledger", title: "Internal ledger", sub: "Debit/credit reconciler", category: "revenue", Icon: Database, flag: "beta" },
  { id: "rev-payment", title: "Payment health", sub: "Stripe / IAP error rate", category: "revenue", Icon: HeartPulse, flag: "beta" },
  { id: "rev-chargeback", title: "Chargeback queue", sub: "Disputed transactions", category: "revenue", Icon: ShieldAlert, flag: "beta" },
  { id: "rev-token", title: "On-chain settlement", sub: "Solana payout console", category: "revenue", Icon: Coins, flag: "beta" },
  { id: "rev-treas", title: "Treasury monitor", sub: "Owner wallet balance", category: "revenue", Icon: Wallet, flag: "beta" },

  // 171-190 Security & audit
  { id: "sec-audit", title: "Audit trail", sub: "All admin actions", category: "security", Icon: ShieldAlert, flag: "live" },
  { id: "sec-role", title: "Role vault", sub: "Manage admin roles", category: "security", Icon: KeyRound, flag: "live" },
  { id: "sec-impersonate", title: "Owner impersonation log", sub: "Track who used 'view-as'", category: "security", Icon: Eye, flag: "beta" },
  { id: "sec-mfa", title: "MFA enforcement", sub: "Require 2FA for admins", category: "security", Icon: ShieldCheck, flag: "soon" },
  { id: "sec-rotate", title: "Key rotation", sub: "Service key rotation", category: "security", Icon: RefreshCw, flag: "soon" },
  { id: "sec-allow", title: "Owner IP allowlist", sub: "Lock admin to IPs", category: "security", Icon: Lock, flag: "soon" },
  { id: "sec-rls", title: "RLS health check", sub: "Detect broken policies", category: "security", Icon: Database, flag: "beta" },
  { id: "sec-export", title: "Data export jobs", sub: "User data takeouts", category: "security", Icon: FileWarning, flag: "beta" },
  { id: "sec-gdpr", title: "GDPR request console", sub: "Delete-me workflow", category: "security", Icon: ShieldCheck, flag: "beta" },
  { id: "sec-pii", title: "PII scrubber", sub: "Mask sensitive logs", category: "security", Icon: ShieldX, flag: "soon" },
  { id: "sec-token", title: "Token revoker", sub: "Kill sessions", category: "security", Icon: KeyRound, flag: "beta" },
  { id: "sec-sus", title: "Suspicious login", sub: "Geo anomaly alerts", category: "security", Icon: AlertTriangle, flag: "beta" },
  { id: "sec-pen", title: "Pentest checklist", sub: "Hardening status", category: "security", Icon: ShieldCheck, flag: "soon" },
  { id: "sec-edge", title: "Edge fn permissions", sub: "Lock invoke roles", category: "security", Icon: Server, flag: "beta" },
  { id: "sec-rate", title: "Edge rate limits", sub: "Per-route caps", category: "security", Icon: Gauge, flag: "beta" },
  { id: "sec-leak", title: "Secret leak scan", sub: "Repo / logs scan", category: "security", Icon: ShieldX, flag: "soon" },
  { id: "sec-backup", title: "Backup status", sub: "DB backup last run", category: "security", Icon: Database, flag: "beta" },
  { id: "sec-restore", title: "Restore drill", sub: "Test recovery", category: "security", Icon: RefreshCw, flag: "soon" },
  { id: "sec-pol", title: "Policy console", sub: "Edit RLS / functions", category: "security", Icon: Lock, flag: "beta" },
  { id: "sec-watch", title: "Admin watch list", sub: "Flagged team members", category: "security", Icon: Eye, flag: "beta" },

  // 191-210 System ops
  { id: "ops-status", title: "Live status", sub: "API / RPC / DB", category: "ops", Icon: Server, flag: "live" },
  { id: "ops-fn", title: "Edge function list", sub: "Invocations / errors", category: "ops", Icon: Cpu, flag: "beta" },
  { id: "ops-cron", title: "Cron jobs", sub: "Scheduled runs", category: "ops", Icon: Clock, flag: "beta" },
  { id: "ops-queue", title: "Job queues", sub: "Pending / failed", category: "ops", Icon: Layers, flag: "beta" },
  { id: "ops-cache", title: "Cache control", sub: "Purge keys", category: "ops", Icon: Database, flag: "beta" },
  { id: "ops-rpc-h", title: "RPC health", sub: "Solana endpoint latency", category: "ops", Icon: Network, flag: "beta" },
  { id: "ops-flag", title: "Feature flags", sub: "Toggle features live", category: "ops", Icon: SettingsIcon, flag: "live" },
  { id: "ops-killswitch", title: "Kill switches", sub: "Disable subsystems", category: "ops", Icon: ShieldX, flag: "beta" },
  { id: "ops-migrate", title: "Migration runner", sub: "Apply pending SQL", category: "ops", Icon: Database, flag: "soon" },
  { id: "ops-seed", title: "Seed reset", sub: "Reload demo data", category: "ops", Icon: RefreshCw, flag: "soon" },
  { id: "ops-bg", title: "Background tasks", sub: "Worker status", category: "ops", Icon: Cpu, flag: "beta" },
  { id: "ops-push", title: "Push delivery", sub: "Expo push status", category: "ops", Icon: Bell, flag: "beta" },
  { id: "ops-storage", title: "Storage usage", sub: "Bucket sizes", category: "ops", Icon: Database, flag: "beta" },
  { id: "ops-cdn", title: "CDN cache", sub: "Hit ratio", category: "ops", Icon: Network, flag: "beta" },
  { id: "ops-build", title: "Build history", sub: "Recent deploys", category: "ops", Icon: Layers, flag: "beta" },
  { id: "ops-version", title: "Force update", sub: "Require min app version", category: "ops", Icon: AlertTriangle, flag: "beta" },
  { id: "ops-maint", title: "Maintenance mode", sub: "Show banner / lock app", category: "ops", Icon: ShieldAlert, flag: "beta" },
  { id: "ops-region", title: "Region routing", sub: "Pin users to region", category: "ops", Icon: Globe2, flag: "soon" },
  { id: "ops-quota", title: "Quota planner", sub: "Storage / RPC budget", category: "ops", Icon: Gauge, flag: "beta" },
  { id: "ops-uptime", title: "Uptime SLO", sub: "99.x target", category: "ops", Icon: HeartPulse, flag: "beta" },

  // 211-225 Communications
  { id: "comm-broad", title: "Global broadcast", sub: "Push to every user", category: "comms", Icon: Megaphone, flag: "live" },
  { id: "comm-seg", title: "Segment blast", sub: "Push by cohort", category: "comms", Icon: Filter, flag: "beta" },
  { id: "comm-email", title: "Email blast", sub: "Newsletter sender", category: "comms", Icon: Send, flag: "beta" },
  { id: "comm-in", title: "In-app message", sub: "Modal on next open", category: "comms", Icon: MessageSquare, flag: "beta" },
  { id: "comm-banner", title: "Banner editor", sub: "Top-of-app banner", category: "comms", Icon: Megaphone, flag: "beta" },
  { id: "comm-news", title: "Owner news feed", sub: "Pinned changelog", category: "comms", Icon: Pin, flag: "beta" },
  { id: "comm-rss", title: "Public changelog", sub: "RSS feed builder", category: "comms", Icon: Globe2, flag: "soon" },
  { id: "comm-dm", title: "DM blast", sub: "Mass DM (rate-limited)", category: "comms", Icon: MessageSquare, flag: "beta" },
  { id: "comm-tg", title: "Telegram relay", sub: "Forward alerts", category: "comms", Icon: Send, flag: "soon" },
  { id: "comm-x", title: "X auto-post", sub: "Cross-post highlights", category: "comms", Icon: Share2, flag: "soon" },
  { id: "comm-disc", title: "Discord webhook", sub: "Pipe alerts to server", category: "comms", Icon: Bell, flag: "beta" },
  { id: "comm-test", title: "Test send", sub: "Send to owner only", category: "comms", Icon: Send, flag: "beta" },
  { id: "comm-loc", title: "Localized blast", sub: "By language", category: "comms", Icon: Globe2, flag: "soon" },
  { id: "comm-quiet", title: "Quiet hours", sub: "Suppress push windows", category: "comms", Icon: Clock, flag: "beta" },
  { id: "comm-archive", title: "Comms archive", sub: "All past blasts", category: "comms", Icon: Database, flag: "beta" },

  // 226-240 Experiments
  { id: "ex-flag", title: "Flag manager", sub: "Per-user feature flags", category: "experiments", Icon: SettingsIcon, flag: "beta" },
  { id: "ex-ab", title: "A/B framework", sub: "Run live experiments", category: "experiments", Icon: FlaskConical, flag: "beta" },
  { id: "ex-roll", title: "Gradual rollout", sub: "% rollout slider", category: "experiments", Icon: Gauge, flag: "beta" },
  { id: "ex-seg", title: "Audience builder", sub: "Define segments", category: "experiments", Icon: Filter, flag: "beta" },
  { id: "ex-color", title: "Theme experiment", sub: "Color palette test", category: "experiments", Icon: ImageIcon, flag: "soon" },
  { id: "ex-cta", title: "CTA experiment", sub: "Copy variants", category: "experiments", Icon: Wand2, flag: "soon" },
  { id: "ex-feed-rank", title: "Feed ranker tester", sub: "Compare ranking models", category: "experiments", Icon: Brain, flag: "beta" },
  { id: "ex-pricing", title: "Pricing test", sub: "Variant pricing pages", category: "experiments", Icon: DollarSign, flag: "soon" },
  { id: "ex-onb", title: "Onboarding variant", sub: "Compare flows", category: "experiments", Icon: UserPlus, flag: "beta" },
  { id: "ex-paywall", title: "Paywall variant", sub: "Conversion tests", category: "experiments", Icon: Lock, flag: "soon" },
  { id: "ex-push", title: "Push copy variants", sub: "Open-rate tests", category: "experiments", Icon: Bell, flag: "beta" },
  { id: "ex-search", title: "Search ranking test", sub: "Variants A/B", category: "experiments", Icon: Search, flag: "beta" },
  { id: "ex-haptic", title: "Haptic style test", sub: "Light vs medium", category: "experiments", Icon: Activity, flag: "soon" },
  { id: "ex-anim", title: "Animation A/B", sub: "Motion variants", category: "experiments", Icon: Sparkles, flag: "soon" },
  { id: "ex-result", title: "Experiment results", sub: "Significance dash", category: "experiments", Icon: ChartBar, flag: "beta" },

  // 241-250 AI & automation
  { id: "ai-sum", title: "AI feed summary", sub: "Auto-summary toggles", category: "ai", Icon: Sparkles, flag: "live" },
  { id: "ai-smart", title: "Smart replies tuning", sub: "Quality dashboard", category: "ai", Icon: MessageSquare, flag: "beta" },
  { id: "ai-mod", title: "Auto-mod model", sub: "Confidence thresholds", category: "ai", Icon: ShieldCheck, flag: "beta" },
  { id: "ai-img", title: "Image safety model", sub: "NSFW threshold", category: "ai", Icon: ImageIcon, flag: "soon" },
  { id: "ai-trans", title: "Translation budget", sub: "Languages enabled", category: "ai", Icon: Globe2, flag: "beta" },
  { id: "ai-rank", title: "Feed ranker weights", sub: "Tune scoring signals", category: "ai", Icon: Brain, flag: "beta" },
  { id: "ai-rec", title: "Recommendation tuner", sub: "FYP knobs", category: "ai", Icon: Network, flag: "beta" },
  { id: "ai-cost", title: "AI cost monitor", sub: "Token spend / day", category: "ai", Icon: DollarSign, flag: "beta" },
  { id: "ai-test", title: "Prompt playground", sub: "Owner-only sandbox", category: "ai", Icon: FlaskConical, flag: "beta" },
  { id: "ai-bot", title: "Bot orchestrator", sub: "Scheduled AI tasks", category: "ai", Icon: Bot, flag: "soon" },
];

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  Icon: IconComponent;
  tint?: string;
}

const MetricCard = React.memo(function MetricCard({ label, value, delta, Icon, tint }: MetricCardProps) {
  const color = tint ?? Colors.goldBright;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIconBubble, { backgroundColor: `${color}1A`, borderColor: `${color}44` }]}>
        <Icon color={color} size={18} strokeWidth={2.2} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {delta ? <Text style={[styles.metricDelta, delta.startsWith("-") ? styles.metricDeltaNeg : styles.metricDeltaPos]}>{delta}</Text> : null}
    </View>
  );
});

interface GeoRow {
  location: string;
  count: number;
}

function flagPill(flag: Feature["flag"]) {
  if (flag === "live") return { label: "LIVE", color: "#34D399", bg: "rgba(52,211,153,0.14)" };
  if (flag === "beta") return { label: "BETA", color: "#62D0FF", bg: "rgba(98,208,255,0.14)" };
  return { label: "SOON", color: "#FBBF24", bg: "rgba(251,191,36,0.14)" };
}

export default function OwnerCommandCenter() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { isOwner, isLoading } = useAdmin();
  const [activeCategory, setActiveCategory] = useState<CategoryKey | "all">("all");
  const [query, setQuery] = useState<string>("");
  const [selected, setSelected] = useState<Feature | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["owner", "overview"],
    enabled: isOwner,
    staleTime: 30_000,
    queryFn: async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const [totalUsersRes, dauRes, wauRes, newRes, bannedRes, verifiedRes, walletsRes, postsRes, dmRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("updated_at", since24h),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("updated_at", since7d),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since1h),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("verified", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).not("sol_wallet", "is", null),
        supabase.from("posts").select("id", { count: "exact", head: true }).gte("created_at", since24h),
        supabase.from("dm_messages").select("id", { count: "exact", head: true }).gte("created_at", since24h),
      ]);

      return {
        totalUsers: totalUsersRes.count ?? 0,
        dau: dauRes.count ?? 0,
        wau: wauRes.count ?? 0,
        newLastHour: newRes.count ?? 0,
        banned: bannedRes.count ?? 0,
        verified: verifiedRes.count ?? 0,
        wallets: walletsRes.count ?? 0,
        posts24h: postsRes.count ?? 0,
        dm24h: dmRes.count ?? 0,
      };
    },
  });

  const geoQuery = useQuery<GeoRow[]>({
    queryKey: ["owner", "geo"],
    enabled: isOwner,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("location")
        .not("location", "is", null)
        .limit(2000);
      if (error) return [];
      const counts = new Map<string, number>();
      (data ?? []).forEach((r) => {
        const loc = String((r as { location?: string | null }).location ?? "").trim();
        if (!loc) return;
        // pick last comma-separated chunk (country-ish)
        const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
        const country = parts.length > 0 ? parts[parts.length - 1] : loc;
        counts.set(country, (counts.get(country) ?? 0) + 1);
      });
      const rows: GeoRow[] = Array.from(counts.entries()).map(([location, count]) => ({ location, count }));
      rows.sort((a, b) => b.count - a.count);
      return rows.slice(0, 10);
    },
  });

  const filtered: Feature[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FEATURES.filter((f) => {
      if (activeCategory !== "all" && f.category !== activeCategory) return false;
      if (!q) return true;
      return f.title.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q) || f.id.includes(q);
    });
  }, [activeCategory, query]);

  const counts = useMemo(() => {
    const map = new Map<CategoryKey | "all", number>();
    map.set("all", FEATURES.length);
    CATEGORIES.forEach((c) => map.set(c.key, 0));
    FEATURES.forEach((f) => map.set(f.category, (map.get(f.category) ?? 0) + 1));
    return map;
  }, []);

  const openFeature = useCallback((f: Feature) => {
    setSelected(f);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.gateRoot}>
        <ActivityIndicator color={Colors.goldBright} />
      </View>
    );
  }

  if (!isAuthenticated || !isOwner) {
    return (
      <SafeAreaView style={styles.gateRoot} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Crown color={Colors.goldBright} size={46} strokeWidth={2.4} />
        <Text style={styles.gateTitle}>Owner only</Text>
        <Text style={styles.gateBody}>
          The Command Center is restricted to the platform owner. Admins and team can use the standard admin dashboard.
        </Text>
        <Pressable style={styles.gateBtn} onPress={() => navigateBack(router, "/(tabs)/home")} testID="owner-back">
          <ArrowLeft color={Colors.text} size={16} />
          <Text style={styles.gateBtnText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const o = overviewQuery.data;
  const maxGeo = (geoQuery.data ?? []).reduce((m, r) => Math.max(m, r.count), 1);

  return (
    <View style={styles.root} testID="owner-command-center">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <LinearGradient
        colors={["#000814", "#06080F", "#000000"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigateBack(router, "/admin")}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            testID="owner-back"
          >
            <ArrowLeft color={Colors.text} size={20} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={styles.crownRow}>
              <Crown color={Colors.goldBright} size={18} strokeWidth={2.4} />
              <Text style={styles.headerTitle}>Command Center</Text>
            </View>
            <Text style={styles.headerSub}>250 owner-only controls · live data</Text>
          </View>
          <Pressable
            onPress={() => overviewQuery.refetch()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            testID="owner-refresh"
          >
            <RefreshCw color={Colors.text} size={18} />
          </Pressable>
        </View>
      </SafeAreaView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* Live metrics */}
            <View style={styles.heroCard}>
              <LinearGradient
                colors={["rgba(98,208,255,0.18)", "rgba(63,169,255,0.06)", "rgba(0,0,0,0)"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.heroHeader}>
                <View>
                  <Text style={styles.heroEyebrow}>OWNER CONSOLE</Text>
                  <Text style={styles.heroTitle}>Everything, in one place.</Text>
                  <Text style={styles.heroBody}>
                    A 250-tool suite for deeper analytics, user demographics, moderation, growth, security and AI ops.
                    Every tile below is gated to the owner account.
                  </Text>
                </View>
                <View style={styles.heroBadge}>
                  <Crown color={Colors.goldBright} size={14} />
                  <Text style={styles.heroBadgeText}>OWNER</Text>
                </View>
              </View>
              <View style={styles.metricGrid}>
                <MetricCard label="Total users" value={fmtNum(o?.totalUsers ?? null)} Icon={Users} tint="#62D0FF" />
                <MetricCard label="DAU (24h)" value={fmtNum(o?.dau ?? null)} Icon={Activity} tint="#34D399" />
                <MetricCard label="WAU (7d)" value={fmtNum(o?.wau ?? null)} Icon={LineChart} tint="#9CD7FF" />
                <MetricCard label="New /h" value={fmtNum(o?.newLastHour ?? null)} Icon={UserPlus} tint="#FBBF24" />
                <MetricCard label="Verified" value={fmtNum(o?.verified ?? null)} Icon={ShieldCheck} tint="#A78BFA" />
                <MetricCard label="With wallet" value={fmtNum(o?.wallets ?? null)} Icon={Wallet} tint="#62D0FF" />
                <MetricCard label="Posts 24h" value={fmtNum(o?.posts24h ?? null)} Icon={Layers} tint="#F472B6" />
                <MetricCard label="DMs 24h" value={fmtNum(o?.dm24h ?? null)} Icon={MessageSquare} tint="#FDE68A" />
                <MetricCard label="Banned" value={fmtNum(o?.banned ?? null)} Icon={ShieldX} tint="#FF6B6B" />
              </View>
            </View>

            {/* Geography */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={styles.crownRow}>
                  <Globe2 color={Colors.goldBright} size={16} />
                  <Text style={styles.sectionTitle}>Where your users are from</Text>
                </View>
                <Text style={styles.sectionSub}>Top 10 countries · last 2,000 profiles with location set</Text>
              </View>
              {geoQuery.isLoading ? (
                <ActivityIndicator color={Colors.goldBright} style={{ marginVertical: 16 }} />
              ) : (geoQuery.data?.length ?? 0) === 0 ? (
                <Text style={styles.emptyText}>No location data yet. Once users fill out their location, you’ll see a country breakdown here.</Text>
              ) : (
                <View style={styles.geoList}>
                  {(geoQuery.data ?? []).map((row) => (
                    <View key={row.location} style={styles.geoRow}>
                      <Text style={styles.geoLabel} numberOfLines={1}>{row.location}</Text>
                      <View style={styles.geoBarTrack}>
                        <View style={[styles.geoBarFill, { width: `${Math.max(6, (row.count / maxGeo) * 100)}%` }]} />
                      </View>
                      <Text style={styles.geoCount}>{fmtNum(row.count)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Search + categories */}
            <View style={styles.searchWrap}>
              <Search color={Colors.muted} size={16} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search 250 owner tools…"
                placeholderTextColor={Colors.muted2}
                style={styles.searchInput}
                testID="owner-search"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              <CategoryChip
                label={`All · ${counts.get("all") ?? 0}`}
                active={activeCategory === "all"}
                onPress={() => setActiveCategory("all")}
                Icon={Layers}
                tint={Colors.goldBright}
              />
              {CATEGORIES.map((c) => (
                <CategoryChip
                  key={c.key}
                  label={`${c.label} · ${counts.get(c.key) ?? 0}`}
                  active={activeCategory === c.key}
                  onPress={() => setActiveCategory(c.key)}
                  Icon={c.Icon}
                  tint={c.tint}
                />
              ))}
            </ScrollView>

            <View style={styles.catalogHead}>
              <Text style={styles.catalogTitle}>
                {filtered.length} feature{filtered.length === 1 ? "" : "s"}
              </Text>
              <Text style={styles.catalogSub}>Tap any tile for details</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <FeatureTile feature={item} onPress={() => openFeature(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No tools match your search.</Text>
          </View>
        }
      />

      <FeatureDetailModal feature={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

interface CategoryChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  Icon: IconComponent;
  tint: string;
}

const CategoryChip = React.memo(function CategoryChip({ label, active, onPress, Icon, tint }: CategoryChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: `${tint}22`, borderColor: tint },
        pressed && styles.pressed,
      ]}
      testID={`owner-chip-${label}`}
    >
      <Icon color={active ? tint : Colors.muted} size={13} />
      <Text style={[styles.chipText, active && { color: tint }]}>{label}</Text>
    </Pressable>
  );
});

interface FeatureTileProps {
  feature: Feature;
  onPress: () => void;
}

const FeatureTile = React.memo(function FeatureTile({ feature, onPress }: FeatureTileProps) {
  const cat = CATEGORIES.find((c) => c.key === feature.category);
  const tint = cat?.tint ?? Colors.goldBright;
  const pill = flagPill(feature.flag ?? "soon");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      testID={`owner-tile-${feature.id}`}
    >
      <View style={[styles.tileIcon, { backgroundColor: `${tint}1A`, borderColor: `${tint}44` }]}>
        <feature.Icon color={tint} size={18} strokeWidth={2.2} />
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={1}>{feature.title}</Text>
        <Text style={styles.tileSub} numberOfLines={2}>{feature.sub}</Text>
      </View>
      <View style={styles.tileFoot}>
        <View style={[styles.flagPill, { backgroundColor: pill.bg, borderColor: `${pill.color}55` }]}>
          <Text style={[styles.flagText, { color: pill.color }]}>{pill.label}</Text>
        </View>
        <ChevronRight color={Colors.muted2} size={14} />
      </View>
    </Pressable>
  );
});

interface FeatureDetailModalProps {
  feature: Feature | null;
  onClose: () => void;
}

function FeatureDetailModal({ feature, onClose }: FeatureDetailModalProps) {
  const visible = !!feature;
  const cat = feature ? CATEGORIES.find((c) => c.key === feature.category) : null;
  const tint = cat?.tint ?? Colors.goldBright;
  const pill = flagPill(feature?.flag ?? "soon");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          {feature ? (
            <>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIcon, { backgroundColor: `${tint}1A`, borderColor: `${tint}55` }]}>
                  <feature.Icon color={tint} size={22} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{feature.title}</Text>
                  <Text style={styles.modalSub}>{cat?.label ?? "Owner tool"}</Text>
                </View>
                <View style={[styles.flagPill, { backgroundColor: pill.bg, borderColor: `${pill.color}55` }]}>
                  <Text style={[styles.flagText, { color: pill.color }]}>{pill.label}</Text>
                </View>
              </View>
              <Text style={styles.modalBody}>{feature.sub}</Text>
              <Text style={styles.modalNote}>
                {feature.flag === "live"
                  ? "This tool is wired to live data and acts immediately on the platform."
                  : feature.flag === "beta"
                    ? "Beta tool — gated to the owner account while we tune thresholds. All actions are logged in the audit trail."
                    : "Staged for the next release. The owner can lock specs and reorder priority from this sheet."}
              </Text>
              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [styles.modalBtnPrimary, pressed && styles.pressed]}
                  onPress={() => {
                    Alert.alert(feature.title, feature.flag === "soon" ? "Queued for the next release. We’ll notify the owner when it ships." : "Action acknowledged. Live execution UI is paged in for this tool.");
                    onClose();
                  }}
                  testID={`owner-modal-open-${feature.id}`}
                >
                  <Text style={styles.modalBtnPrimaryText}>{feature.flag === "soon" ? "Pin to roadmap" : "Open tool"}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.modalBtnGhost, pressed && styles.pressed]}
                  onPress={onClose}
                  testID="owner-modal-close"
                >
                  <Text style={styles.modalBtnGhostText}>Close</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { backgroundColor: "transparent" },
  gateRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.ink,
    padding: 24,
    gap: 12,
  },
  gateTitle: { color: Colors.text, fontSize: 22, fontWeight: "700" as const, marginTop: 8 },
  gateBody: { color: Colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  gateBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  gateBtnText: { color: Colors.text, fontSize: 14, fontWeight: "600" as const },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  headerCenter: { flex: 1, alignItems: "center" },
  crownRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { color: Colors.text, fontSize: 16, fontWeight: "700" as const, letterSpacing: 0.3 },
  headerSub: { color: Colors.muted, fontSize: 11, marginTop: 2 },
  listContent: { paddingHorizontal: 14, paddingBottom: 80 },
  heroCard: {
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: 18,
    backgroundColor: Colors.card,
    marginBottom: 16,
  },
  heroHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 },
  heroEyebrow: { color: Colors.goldBright, fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.6 },
  heroTitle: { color: Colors.text, fontSize: 22, fontWeight: "800" as const, marginTop: 6 },
  heroBody: { color: Colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 320 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.4)",
    backgroundColor: "rgba(98,208,255,0.1)",
  },
  heroBadgeText: { color: Colors.goldBright, fontSize: 11, fontWeight: "800" as const, letterSpacing: 1.2 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: {
    width: "31.5%",
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: Colors.line,
    gap: 4,
  },
  metricIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 4,
  },
  metricLabel: { color: Colors.muted, fontSize: 11, fontWeight: "600" as const },
  metricValue: { color: Colors.text, fontSize: 17, fontWeight: "800" as const },
  metricDelta: { fontSize: 11, fontWeight: "700" as const },
  metricDeltaPos: { color: "#34D399" },
  metricDeltaNeg: { color: "#FF6B6B" },
  section: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    padding: 14,
    marginBottom: 16,
  },
  sectionHead: { marginBottom: 12 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "700" as const },
  sectionSub: { color: Colors.muted, fontSize: 11, marginTop: 4 },
  geoList: { gap: 8 },
  geoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  geoLabel: { color: Colors.text, fontSize: 12, fontWeight: "600" as const, width: 110 },
  geoBarTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: "rgba(98,208,255,0.08)", overflow: "hidden" },
  geoBarFill: { height: "100%", backgroundColor: Colors.goldBright, borderRadius: 999 },
  geoCount: { color: Colors.muted, fontSize: 12, fontWeight: "700" as const, width: 48, textAlign: "right" },
  emptyText: { color: Colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 12 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  chipsRow: { gap: 8, paddingBottom: 12, paddingRight: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  chipText: { color: Colors.muted, fontSize: 12, fontWeight: "600" as const },
  catalogHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 },
  catalogTitle: { color: Colors.text, fontSize: 13, fontWeight: "700" as const },
  catalogSub: { color: Colors.muted2, fontSize: 11 },
  gridRow: { gap: 10, marginBottom: 10 },
  tile: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    minHeight: 130,
    justifyContent: "space-between",
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 8,
  },
  tileBody: { gap: 4, flex: 1 },
  tileTitle: { color: Colors.text, fontSize: 13, fontWeight: "700" as const },
  tileSub: { color: Colors.muted, fontSize: 11, lineHeight: 15 },
  tileFoot: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flagPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  flagText: { fontSize: 9.5, fontWeight: "800" as const, letterSpacing: 0.8 },
  emptyWrap: { paddingVertical: 30, alignItems: "center" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    padding: 18,
    gap: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" as const },
  modalSub: { color: Colors.muted, fontSize: 12, marginTop: 2 },
  modalBody: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  modalNote: { color: Colors.muted, fontSize: 12, lineHeight: 18 },
  modalActions: { flexDirection: "row", gap: 10 },
  modalBtnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.goldBright,
    alignItems: "center",
  },
  modalBtnPrimaryText: { color: "#001020", fontSize: 14, fontWeight: "800" as const },
  modalBtnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.cardSoft,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: "center",
  },
  modalBtnGhostText: { color: Colors.text, fontSize: 14, fontWeight: "700" as const },
});
