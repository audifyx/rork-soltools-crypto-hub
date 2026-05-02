import Colors from "@/constants/colors";

export type CommunityFeatureCategory =
  | "posting"
  | "engagement"
  | "moderation"
  | "feed"
  | "token"
  | "voice"
  | "notifications"
  | "ops"
  | "alpha"
  | "safety";

export type CommunityFeatureSurface =
  | "community"
  | "home"
  | "discover"
  | "voice"
  | "moderation"
  | "token"
  | "notifications";

/** A product-ready advanced feature that can be enabled per community. */
export interface AdvancedCommunityFeature {
  id: string;
  category: CommunityFeatureCategory;
  surface: CommunityFeatureSurface;
  title: string;
  description: string;
  impact: "core" | "growth" | "trust" | "alpha";
  enabledByDefault: boolean;
}

export const COMMUNITY_FEATURE_CATEGORY_META: Record<
  CommunityFeatureCategory,
  { label: string; shortLabel: string; accent: string }
> = {
  posting: { label: "Posting", shortLabel: "Post", accent: Colors.mint },
  engagement: { label: "Engagement", shortLabel: "Social", accent: Colors.rose },
  moderation: { label: "Moderation", shortLabel: "Mod", accent: Colors.orange },
  feed: { label: "Feed Intelligence", shortLabel: "Feed", accent: Colors.cyan },
  token: { label: "Token Intelligence", shortLabel: "Token", accent: Colors.violet },
  voice: { label: "Voice Lobbies", shortLabel: "Voice", accent: Colors.magenta },
  notifications: { label: "Notifications", shortLabel: "Alert", accent: Colors.neon },
  ops: { label: "Community Ops", shortLabel: "Ops", accent: Colors.text },
  alpha: { label: "AI Alpha Discovery", shortLabel: "Alpha", accent: Colors.cyan },
  safety: { label: "Safety & Trust", shortLabel: "Trust", accent: Colors.orange },
};

export const COMMUNITY_FEATURE_CATEGORIES = Object.keys(
  COMMUNITY_FEATURE_CATEGORY_META,
) as CommunityFeatureCategory[];

export const ADVANCED_COMMUNITY_FEATURES: AdvancedCommunityFeature[] = [
  { id: "image-post-composer", category: "posting", surface: "community", title: "Image post composer", description: "Attach image media to community posts with preview, upload, and fallback storage.", impact: "core", enabledByDefault: true },
  { id: "token-ca-autoscan", category: "posting", surface: "community", title: "Solana CA auto-scan", description: "Detect pasted Solana contract addresses and scan metadata before the post is sent.", impact: "alpha", enabledByDefault: true },
  { id: "quote-posts", category: "posting", surface: "community", title: "Quote posts", description: "Quote any post with your own take while preserving the original context card.", impact: "core", enabledByDefault: true },
  { id: "threaded-replies", category: "posting", surface: "community", title: "Threaded replies", description: "Open post threads, reply inline, and keep parent reply counts synced.", impact: "core", enabledByDefault: true },
  { id: "rich-link-cards", category: "posting", surface: "community", title: "Rich link cards", description: "Reserve metadata slots for links shared inside community posts.", impact: "growth", enabledByDefault: false },
  { id: "draft-recovery", category: "posting", surface: "community", title: "Draft recovery", description: "Keep unsent post text scoped to the current community so creators do not lose alpha.", impact: "core", enabledByDefault: false },
  { id: "post-templates", category: "posting", surface: "community", title: "Post templates", description: "One-tap structures for call notes, token thesis, chart read, and launch recap posts.", impact: "growth", enabledByDefault: false },
  { id: "spoiler-tags", category: "posting", surface: "community", title: "Spoiler tags", description: "Mark risky speculation or unreleased alpha so readers can opt in before expanding.", impact: "trust", enabledByDefault: false },
  { id: "poll-posts", category: "posting", surface: "community", title: "Poll posts", description: "Capture community votes for tickers, calls, spaces, and trading ideas.", impact: "growth", enabledByDefault: false },
  { id: "scheduled-posts", category: "posting", surface: "community", title: "Scheduled posts", description: "Queue announcements and daily runner recaps for a later publish time.", impact: "growth", enabledByDefault: false },

  { id: "post-likes", category: "engagement", surface: "community", title: "Post likes", description: "Like and unlike posts with optimistic UI and synced counters.", impact: "core", enabledByDefault: true },
  { id: "post-reposts", category: "engagement", surface: "community", title: "Reposts", description: "Repost community content and include quote activity in reach counts.", impact: "core", enabledByDefault: true },
  { id: "post-bookmarks", category: "engagement", surface: "community", title: "Saved posts", description: "Bookmark high-signal posts into a Saved tab per community.", impact: "core", enabledByDefault: true },
  { id: "mention-notifications", category: "engagement", surface: "notifications", title: "Mention notifications", description: "Track mentions for future push and in-app notification routing.", impact: "growth", enabledByDefault: false },
  { id: "reaction-badges", category: "engagement", surface: "community", title: "Reaction badges", description: "Add lightweight emoji reactions beyond likes for sentiment and hype.", impact: "growth", enabledByDefault: false },
  { id: "share-links", category: "engagement", surface: "community", title: "Share links", description: "Share community and post links with native share sheets and copied URLs.", impact: "growth", enabledByDefault: true },
  { id: "member-streaks", category: "engagement", surface: "community", title: "Member streaks", description: "Reward consecutive posting, replying, and attendance activity.", impact: "growth", enabledByDefault: false },
  { id: "reputation-points", category: "engagement", surface: "community", title: "Reputation points", description: "Score helpful posts, reports, calls, and replies for contributor ranking.", impact: "trust", enabledByDefault: false },
  { id: "contributor-levels", category: "engagement", surface: "community", title: "Contributor levels", description: "Convert reputation into visible ranks like Scout, Analyst, and Lead Caller.", impact: "growth", enabledByDefault: false },
  { id: "follow-contributors", category: "engagement", surface: "home", title: "Follow contributors", description: "Connect community contributors back into the global following feed.", impact: "growth", enabledByDefault: false },

  { id: "owner-delete-posts", category: "moderation", surface: "moderation", title: "Owner deletes own posts", description: "Users can remove their own posts without needing admin help.", impact: "trust", enabledByDefault: true },
  { id: "admin-delete-any-post", category: "moderation", surface: "moderation", title: "Admin delete all posts", description: "Admins and moderators can delete harmful posts across communities.", impact: "trust", enabledByDefault: true },
  { id: "report-queue", category: "moderation", surface: "moderation", title: "Report queue", description: "Users can report posts into a moderator review queue.", impact: "trust", enabledByDefault: true },
  { id: "pin-posts", category: "moderation", surface: "community", title: "Pinned posts", description: "Moderators can pin important calls, rules, and announcements above the feed.", impact: "core", enabledByDefault: true },
  { id: "mute-keywords", category: "moderation", surface: "moderation", title: "Muted keywords", description: "Store community-level keyword filters for spam, slurs, and scam phrases.", impact: "trust", enabledByDefault: false },
  { id: "scam-labels", category: "moderation", surface: "moderation", title: "Scam labels", description: "Mark posts and token cards as suspected scams without deleting discussion history.", impact: "trust", enabledByDefault: false },
  { id: "post-cooldowns", category: "moderation", surface: "moderation", title: "Post cooldowns", description: "Throttle repeat posting during raids or bot attacks.", impact: "trust", enabledByDefault: false },
  { id: "automod-ca-risk", category: "moderation", surface: "token", title: "AutoMod CA risk", description: "Flag risky contracts by liquidity, duplication, and missing metadata.", impact: "trust", enabledByDefault: false },
  { id: "moderator-notes", category: "moderation", surface: "moderation", title: "Moderator notes", description: "Attach internal context to reported posts and repeat offenders.", impact: "trust", enabledByDefault: false },
  { id: "audit-log", category: "moderation", surface: "moderation", title: "Audit log", description: "Persist moderation events for delete, pin, report, and settings changes.", impact: "trust", enabledByDefault: true },

  { id: "separate-home-community-feeds", category: "feed", surface: "home", title: "Separate home/community feeds", description: "Keep global home posts separate from posts inside community timelines.", impact: "core", enabledByDefault: true },
  { id: "recent-filter", category: "feed", surface: "community", title: "Recent feed filter", description: "View the newest top-level posts for a specific community.", impact: "core", enabledByDefault: true },
  { id: "media-filter", category: "feed", surface: "community", title: "Media feed filter", description: "Filter the community timeline down to images, tickers, token cards, and pins.", impact: "core", enabledByDefault: true },
  { id: "saved-filter", category: "feed", surface: "community", title: "Saved feed filter", description: "Open only bookmarked posts for the current community.", impact: "core", enabledByDefault: true },
  { id: "advanced-search", category: "feed", surface: "community", title: "Advanced search", description: "Search post content, authors, tickers, token names, and contract addresses.", impact: "core", enabledByDefault: true },
  { id: "community-trending", category: "feed", surface: "community", title: "Community trending", description: "Rank hot posts by recent likes, replies, reposts, pins, and token scans.", impact: "growth", enabledByDefault: false },
  { id: "hot-replies", category: "feed", surface: "community", title: "Hot replies", description: "Surface fast-moving replies under active post threads.", impact: "growth", enabledByDefault: false },
  { id: "top-token-feed", category: "feed", surface: "token", title: "Top token feed", description: "Highlight the most discussed token cards inside each community.", impact: "alpha", enabledByDefault: false },
  { id: "member-leaderboard", category: "feed", surface: "community", title: "Member leaderboard", description: "Rank members by helpful posts, activity, reports, and alpha accuracy.", impact: "growth", enabledByDefault: false },
  { id: "unread-recap", category: "feed", surface: "notifications", title: "Unread recap", description: "Summarize posts since last visit by media, token mentions, and replies.", impact: "growth", enabledByDefault: false },

  { id: "birdeye-metadata", category: "token", surface: "token", title: "Birdeye metadata", description: "Store enriched Solana token name, symbol, logo, price, liquidity, volume, and holders.", impact: "alpha", enabledByDefault: true },
  { id: "dexscreener-chart", category: "token", surface: "token", title: "Dex chart popup", description: "Open a full chart modal from any scanned Solana token card.", impact: "alpha", enabledByDefault: true },
  { id: "helius-owner-scan", category: "token", surface: "token", title: "Helius owner scan", description: "Reserve scan fields for token authorities, holder structure, and wallet clustering.", impact: "alpha", enabledByDefault: false },
  { id: "liquidity-risk", category: "token", surface: "token", title: "Liquidity risk", description: "Score contracts by liquidity depth, pool freshness, and thin market warnings.", impact: "trust", enabledByDefault: false },
  { id: "holder-analysis", category: "token", surface: "token", title: "Holder analysis", description: "Persist holder-count signals and future concentration checks.", impact: "alpha", enabledByDefault: false },
  { id: "volume-spike-alert", category: "token", surface: "notifications", title: "Volume spike alerts", description: "Create alert rules when a discussed CA crosses unusual volume thresholds.", impact: "alpha", enabledByDefault: false },
  { id: "marketcap-filters", category: "token", surface: "discover", title: "Market cap filters", description: "Filter out large caps and focus on small-cap daily runners.", impact: "alpha", enabledByDefault: true },
  { id: "copy-contract", category: "token", surface: "token", title: "Copy contract", description: "Copy any Solana contract address from token chart cards.", impact: "core", enabledByDefault: true },
  { id: "pair-detection", category: "token", surface: "token", title: "Pair detection", description: "Store detected pair addresses so charts can open the correct DEX pair.", impact: "alpha", enabledByDefault: true },
  { id: "small-cap-runner-score", category: "token", surface: "discover", title: "Small-cap runner score", description: "Score $1M+ volume small caps by momentum, turnover, and liquidity.", impact: "alpha", enabledByDefault: true },

  { id: "voice-lobbies", category: "voice", surface: "voice", title: "Voice lobbies", description: "Create and join persistent live voice lobby rooms.", impact: "core", enabledByDefault: true },
  { id: "lobby-chat", category: "voice", surface: "voice", title: "Lobby chat", description: "Send chat messages inside live lobby rooms.", impact: "core", enabledByDefault: true },
  { id: "lobby-watchlist", category: "voice", surface: "voice", title: "Lobby watchlist", description: "Track tokens and wallets shared during live calls.", impact: "alpha", enabledByDefault: true },
  { id: "raised-hands", category: "voice", surface: "voice", title: "Raised hands", description: "Let listeners request to speak and track raised-hand counts.", impact: "core", enabledByDefault: true },
  { id: "speaker-roles", category: "voice", surface: "voice", title: "Speaker roles", description: "Differentiate host, speaker, and listener participants.", impact: "core", enabledByDefault: true },
  { id: "live-reactions", category: "voice", surface: "voice", title: "Live reactions", description: "Add lobby reaction bursts and aggregate reaction counters.", impact: "growth", enabledByDefault: true },
  { id: "private-lobbies", category: "voice", surface: "voice", title: "Private lobbies", description: "Support gated lobby visibility and membership access.", impact: "growth", enabledByDefault: true },
  { id: "recording-flags", category: "voice", surface: "voice", title: "Recording flags", description: "Mark lobbies that are recorded or intended for later replay.", impact: "trust", enabledByDefault: false },
  { id: "token-calls-in-lobby", category: "voice", surface: "voice", title: "Token calls in lobby", description: "Auto-classify $ticker messages and CA callouts during voice sessions.", impact: "alpha", enabledByDefault: true },
  { id: "host-close-lobby", category: "voice", surface: "voice", title: "Host close lobby", description: "Allow hosts and admins to close a live room cleanly.", impact: "core", enabledByDefault: true },

  { id: "community-alerts", category: "notifications", surface: "notifications", title: "Community alerts", description: "Toggle alert preference from each community header.", impact: "core", enabledByDefault: true },
  { id: "keyword-alerts", category: "notifications", surface: "notifications", title: "Keyword alerts", description: "Notify when watched phrases appear in community content.", impact: "growth", enabledByDefault: false },
  { id: "token-alerts", category: "notifications", surface: "notifications", title: "Token alerts", description: "Notify when watched CAs are posted, quoted, or charted.", impact: "alpha", enabledByDefault: false },
  { id: "whale-alerts", category: "notifications", surface: "home", title: "Whale alerts", description: "Connect whale feed events to watchlist and community discussions.", impact: "alpha", enabledByDefault: false },
  { id: "reply-alerts", category: "notifications", surface: "notifications", title: "Reply alerts", description: "Notify authors when new replies land on their posts.", impact: "growth", enabledByDefault: false },
  { id: "quote-alerts", category: "notifications", surface: "notifications", title: "Quote alerts", description: "Notify authors when another user quotes their post.", impact: "growth", enabledByDefault: false },
  { id: "mention-digest", category: "notifications", surface: "notifications", title: "Mention digest", description: "Bundle mentions, replies, and token tags into a daily digest.", impact: "growth", enabledByDefault: false },
  { id: "mod-alerts", category: "notifications", surface: "moderation", title: "Moderator alerts", description: "Alert mods when reports, spam bursts, or scam labels appear.", impact: "trust", enabledByDefault: false },
  { id: "new-member-alerts", category: "notifications", surface: "community", title: "New member alerts", description: "Track member joins for onboarding and suspicious raids.", impact: "growth", enabledByDefault: false },
  { id: "daily-recap", category: "notifications", surface: "discover", title: "Daily recap", description: "Generate a recap of daily runners, top posts, and voice calls.", impact: "growth", enabledByDefault: false },

  { id: "avatar-upload", category: "ops", surface: "community", title: "Avatar upload", description: "Owners can upload and remove community avatar images.", impact: "core", enabledByDefault: true },
  { id: "banner-upload", category: "ops", surface: "community", title: "Banner upload", description: "Owners can upload and remove community banners.", impact: "core", enabledByDefault: true },
  { id: "rules-display", category: "ops", surface: "community", title: "Rules display", description: "Show community rules inside the About tab.", impact: "trust", enabledByDefault: true },
  { id: "invite-links", category: "ops", surface: "community", title: "Invite links", description: "Share native invite links from the community menu.", impact: "growth", enabledByDefault: true },
  { id: "verified-badge", category: "ops", surface: "community", title: "Verified badge", description: "Display verified community identity badges where available.", impact: "trust", enabledByDefault: true },
  { id: "member-preview-stack", category: "ops", surface: "community", title: "Member preview stack", description: "Show active member avatars near community stats.", impact: "growth", enabledByDefault: true },
  { id: "private-community-gate", category: "ops", surface: "community", title: "Private community gate", description: "Database-ready private community visibility and ownership checks.", impact: "trust", enabledByDefault: true },
  { id: "category-tags", category: "ops", surface: "discover", title: "Category tags", description: "Organize communities and tokens by alpha, trading, utility, infra, and more.", impact: "growth", enabledByDefault: true },
  { id: "owner-tools", category: "ops", surface: "community", title: "Owner tools", description: "Expose media management and future settings controls to owners.", impact: "core", enabledByDefault: true },
  { id: "analytics-card", category: "ops", surface: "community", title: "Analytics card", description: "Show enabled features, posts, members, saved posts, and media coverage.", impact: "growth", enabledByDefault: true },

  { id: "daily-runners", category: "alpha", surface: "discover", title: "Current daily runners", description: "Use live market feeds to rank small caps running today.", impact: "alpha", enabledByDefault: true },
  { id: "runners-2025", category: "alpha", surface: "discover", title: "2025 runners", description: "Filter historical 2025 launched runners from live token listings.", impact: "alpha", enabledByDefault: true },
  { id: "runners-2026", category: "alpha", surface: "discover", title: "2026 runners", description: "Filter 2026 launched runners from live token listings.", impact: "alpha", enabledByDefault: true },
  { id: "utility-runners", category: "alpha", surface: "discover", title: "Utility runners", description: "Find utility coins and tools with strong daily volume.", impact: "alpha", enabledByDefault: true },
  { id: "charity-runners", category: "alpha", surface: "discover", title: "Charity coins", description: "Filter new charity/cause tokens that show real market activity.", impact: "alpha", enabledByDefault: true },
  { id: "block-large-caps", category: "alpha", surface: "discover", title: "Block large caps", description: "Exclude large-cap names like Fartcoin, Troll, SOL, USDC, JUP, and other majors.", impact: "trust", enabledByDefault: true },
  { id: "live-source-strip", category: "alpha", surface: "discover", title: "Live source strip", description: "Show Pump.fun, Birdeye, DexScreener, and Helius source coverage.", impact: "trust", enabledByDefault: true },
  { id: "runner-confidence", category: "alpha", surface: "discover", title: "Runner confidence", description: "Display a 60-99 live confidence score based on volume, momentum, and turnover.", impact: "alpha", enabledByDefault: true },
  { id: "trending-tags", category: "alpha", surface: "discover", title: "Trending tags", description: "Count and show the hottest token tags across current listings.", impact: "growth", enabledByDefault: true },
  { id: "watchlist-sync", category: "alpha", surface: "discover", title: "Watchlist sync", description: "Send discovered runners into the user's token watchlist.", impact: "alpha", enabledByDefault: true },

  { id: "safe-token-filter", category: "safety", surface: "discover", title: "Safe token filter", description: "Filter obvious unsafe tokens before showing them in core feeds.", impact: "trust", enabledByDefault: true },
  { id: "malicious-link-warning", category: "safety", surface: "community", title: "Malicious link warning", description: "Reserve warning metadata for suspicious URLs in posts and profiles.", impact: "trust", enabledByDefault: false },
  { id: "burner-wallet-warning", category: "safety", surface: "token", title: "Burner wallet warning", description: "Reserve token risk fields for fresh wallet and deployer warnings.", impact: "trust", enabledByDefault: false },
  { id: "liquidity-lock-hint", category: "safety", surface: "token", title: "Liquidity lock hint", description: "Show whether liquidity signals look stable, thin, or unknown.", impact: "trust", enabledByDefault: false },
  { id: "report-scam", category: "safety", surface: "moderation", title: "Report scam", description: "Use reports and labels to escalate scam content to moderators.", impact: "trust", enabledByDefault: true },
  { id: "verified-member-marker", category: "safety", surface: "community", title: "Verified member marker", description: "Reserve trust markers for verified analysts, founders, and moderators.", impact: "trust", enabledByDefault: false },
  { id: "trust-tier", category: "safety", surface: "community", title: "Trust tier", description: "Calculate a member trust tier from age, reputation, reports, and accuracy.", impact: "trust", enabledByDefault: false },
  { id: "duplicate-ca-detection", category: "safety", surface: "token", title: "Duplicate CA detection", description: "Detect repeated contract posts and prevent copy-paste spam bursts.", impact: "trust", enabledByDefault: false },
  { id: "copied-ca-audit", category: "safety", surface: "token", title: "Copied CA audit", description: "Track copy events as local signals for future user safety recaps.", impact: "trust", enabledByDefault: false },
  { id: "source-transparency", category: "safety", surface: "discover", title: "Source transparency", description: "Show which free market sources powered each runner surface.", impact: "trust", enabledByDefault: true },
];

export const ADVANCED_COMMUNITY_FEATURE_IDS = new Set(
  ADVANCED_COMMUNITY_FEATURES.map((feature) => feature.id),
);

export function createDefaultCommunityFeatureMap(): Record<string, boolean> {
  return ADVANCED_COMMUNITY_FEATURES.reduce<Record<string, boolean>>((acc, feature) => {
    acc[feature.id] = feature.enabledByDefault;
    return acc;
  }, {});
}
