import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Bot, ChevronLeft, Send, Sparkles } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";

type Msg = {
  id: string;
  role: "bot" | "user";
  text: string;
  suggestions?: string[];
  at: number;
};

type Rule = {
  id: string;
  keywords: string[][];
  answer: string;
  followups?: string[];
};

/**
 * Pure keyword-detection FAQ engine.
 * Each rule fires when ANY of its keyword groups fully matches the input.
 * A keyword group matches when EVERY keyword in the group appears in the message.
 */
const RULES: Rule[] = [
  {
    id: "spaces",
    keywords: [["space"], ["voice", "room"], ["audio", "room"], ["live", "talk"]],
    answer:
      "Spaces live in a dedicated web hub embedded inside the app. Open the Spaces tab to browse live and scheduled rooms, join as a listener, and request the mic to come on stage.",
  },
  {
    id: "wallet",
    keywords: [["wallet"], ["connect", "wallet"], ["link", "wallet"], ["solana", "address"]],
    answer:
      "Go to Settings > Account > Connected accounts to link a Solana wallet. Your wallet powers PnL tracking, token gating, and the KOL leaderboards.",
  },
  {
    id: "swap",
    keywords: [["swap"], ["buy", "token"], ["sell", "token"], ["trade"], ["jupiter"], ["trading"]],
    answer:
      "Trading isn't available in the app yet. Buying, selling, and swapping (including Jupiter routing and wallet connection) are planned for a future release. For now you can research tokens, track wallets, and follow KOL activity.",
  },
  {
    id: "kol",
    keywords: [["kol"], ["leaderboard"], ["top", "trader"], ["who", "buying"]],
    answer:
      "KOL Scan tracks influential wallets in real time. Open KOL Scan from the Tools tab to see live entries, exits, holdings, and copyable addresses.",
  },
  {
    id: "scanner",
    keywords: [["scanner"], ["scan", "token"], ["safety"], ["rug"], ["honeypot"]],
    answer:
      "The Scanner tool runs liquidity, holder, dev wallet, and migration checks on any Solana token. Paste a contract address into Scanner from the Tools tab.",
  },
  {
    id: "watchlist",
    keywords: [["watchlist"], ["save", "token"], ["track", "token"]],
    answer:
      "Tap the gem icon on any token card to add it to your watchlist. View saved tokens from Profile or the Watchlist quick-stat in Settings.",
  },
  {
    id: "alerts",
    keywords: [["alert"], ["price", "alert"], ["whale", "alert"], ["notif"]],
    answer:
      "Create price and whale alerts from any token detail page. Manage delivery in Settings > Notifications. Whale alerts trigger on large buys and sells above your threshold.",
  },
  {
    id: "reels",
    keywords: [["reel"], ["video"], ["upload", "video"], ["short"]],
    answer:
      "Reels are short videos in the Reels tab. Tap the upload button to post one. Likes, comments, and reposts feed into your profile activity.",
  },
  {
    id: "messages",
    keywords: [["dm"], ["direct", "message"], ["chat", "private"], ["message", "user"]],
    answer:
      "Open the Messages tab to start a DM. Search any handle and tap message. Group DMs are accessible from the Lobby tab.",
  },
  {
    id: "communities",
    keywords: [["community"], ["communities"], ["group"], ["create", "community"]],
    answer:
      "Communities live under the Community section. Browse, join, or create your own with a banner and avatar. Posts there appear in your community feed.",
  },
  {
    id: "launches",
    keywords: [["launch"], ["launchpad"], ["list", "token"], ["new", "coin"]],
    answer:
      "The Launches tab tracks upcoming and live token launches. Use List Token to submit your own project for review.",
  },
  {
    id: "post",
    keywords: [["post"], ["compose"], ["tweet"], ["share"]],
    answer:
      "Tap the compose button (the plus or pencil) on the Home tab to write a post. You can attach token tickers, images, and polls.",
  },
  {
    id: "feed",
    keywords: [["feed"], ["home", "feed"], ["timeline"], ["comment"]],
    answer:
      "Your Home feed shows posts from people you follow. Tap any post to view comments, reply, like, or repost. Comments are now visible directly on every card.",
  },
  {
    id: "news",
    keywords: [["news"], ["crypto", "news"], ["headline"]],
    answer:
      "Crypto News is in the Tools tab. It aggregates Solana and broader crypto headlines with token mentions and sentiment chips.",
  },
  {
    id: "language",
    keywords: [["language"], ["translate"], ["currency"], ["theme"], ["dark"], ["light"]],
    answer:
      "Theme, currency, and language switch in Settings > Appearance. Themes include Dark, Midnight, and Sunset.",
  },
  {
    id: "privacy",
    keywords: [["private"], ["privacy"], ["hide", "balance"], ["two", "factor"], ["2fa"]],
    answer:
      "Privacy controls (private profile, follow requests) live in Settings > Privacy.",
  },
  {
    id: "delete",
    keywords: [["delete", "account"], ["reset", "data"], ["clear", "cache"], ["sign", "out"], ["logout"]],
    answer:
      "Settings > Account holds Sign out, Reset local data, and Delete account. Deletion permanently removes your synced profile, posts, and data.",
  },
  {
    id: "support",
    keywords: [["support"], ["help", "team"], ["contact"], ["bug"], ["report"]],
    answer:
      "Reach support on Telegram @ogscandev or via Settings > Support & legal. Include screenshots and the screen you were on when reporting bugs.",
  },
  {
    id: "ogs",
    keywords: [["ogs"], ["token", "ogs"], ["our", "coin"]],
    answer:
      "$OGS is the platform token. Open Our Coin from the home quick menu to view chart, holders, and utility (boosted alerts, Space gating, premium tools).",
  },
  {
    id: "greet",
    keywords: [["hi"], ["hello"], ["hey"], ["yo"], ["sup"]],
    answer:
      "Hey, I'm the FAQ bot. Ask me about Spaces, wallets, KOL scan, alerts, communities, reels, or any setting and I'll point you to it.",
    followups: ["How do Spaces work?", "How do alerts work?", "How do I create a community?"],
  },
  {
    id: "thanks",
    keywords: [["thanks"], ["thank", "you"], ["thx"], ["ty"]],
    answer: "Anytime. Ping me whenever you need a quick answer.",
  },
];

const TOPIC_SUGGESTIONS: string[] = [
  "How do Spaces work?",
  "How do I connect my wallet?",
  "How do KOL alerts work?",
  "How do I create a community?",
  "How do I delete my account?",
];

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findAnswer(input: string): Rule | null {
  const n = normalize(input);
  if (n.length === 0) return null;
  const tokens = new Set(n.split(" "));
  let best: { rule: Rule; score: number } | null = null;
  for (const rule of RULES) {
    for (const group of rule.keywords) {
      const allMatch = group.every((k) => tokens.has(k));
      if (allMatch) {
        const score = group.length;
        if (!best || score > best.score) best = { rule, score };
      }
    }
  }
  return best?.rule ?? null;
}

function haptic(): void {
  Haptics.selectionAsync().catch(() => {});
}

export default function FaqBotScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<Msg>>(null);
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      id: "welcome",
      role: "bot",
      at: Date.now(),
      text:
        "I'm the FAQ bot. I use keyword detection over the app's docs — no AI. Ask about any feature and I'll explain how it works.",
      suggestions: TOPIC_SUGGESTIONS.slice(0, 4),
    },
  ]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (text.length === 0) return;
    haptic();
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", text, at: Date.now() };
    const rule = findAnswer(text);
    const botMsg: Msg = rule
      ? {
          id: `b-${Date.now() + 1}`,
          role: "bot",
          text: rule.answer,
          suggestions: rule.followups,
          at: Date.now() + 1,
        }
      : {
          id: `b-${Date.now() + 1}`,
          role: "bot",
          text:
            "I couldn't match that to a known topic. Try keywords like Spaces, wallet, KOL, scanner, alerts, reels, communities, privacy, or delete account.",
          suggestions: TOPIC_SUGGESTIONS.slice(0, 4),
          at: Date.now() + 1,
        };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const onSubmit = useCallback(() => send(input), [input, send]);

  const headerSub = useMemo(() => `${RULES.length} topics indexed · keyword engine`, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AppBackground variant="tool" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} testID="faq-back">
            <ChevronLeft color={Colors.text} size={22} strokeWidth={2.8} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>FAQ BOT</Text>
            <Text style={styles.title}>Ask anything</Text>
          </View>
          <View style={styles.headerBadge}>
            <Sparkles color={Colors.goldBright} size={14} strokeWidth={2.8} />
            <Text style={styles.headerBadgeText}>No AI</Text>
          </View>
        </View>

        <LinearGradient
          colors={["rgba(63,169,255,0.18)", "rgba(255,255,255,0.04)"]}
          style={styles.hint}
        >
          <Bot color={Colors.goldBright} size={16} strokeWidth={2.6} />
          <Text style={styles.hintText}>{headerSub}</Text>
        </LinearGradient>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Bubble item={item} onSuggest={(s) => send(s)} />
            )}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about Spaces, wallets, KOL..."
              placeholderTextColor={Colors.muted2}
              style={styles.input}
              returnKeyType="send"
              onSubmitEditing={onSubmit}
              testID="faq-input"
            />
            <Pressable
              onPress={onSubmit}
              style={({ pressed }) => [styles.sendBtn, pressed && styles.sendPressed]}
              testID="faq-send"
            >
              <Send color={Colors.ink} size={18} strokeWidth={2.8} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Bubble({ item, onSuggest }: { item: Msg; onSuggest: (s: string) => void }) {
  const isBot = item.role === "bot";
  return (
    <View style={[styles.bubbleRow, isBot ? styles.rowBot : styles.rowUser]}>
      {isBot ? (
        <View style={styles.botAvatar}>
          <Bot color={Colors.ink} size={14} strokeWidth={3} />
        </View>
      ) : null}
      <View style={[styles.bubble, isBot ? styles.bubbleBot : styles.bubbleUser]}>
        <Text style={[styles.bubbleText, !isBot && styles.bubbleTextUser]}>{item.text}</Text>
        {isBot && item.suggestions && item.suggestions.length > 0 ? (
          <View style={styles.chips}>
            {item.suggestions.map((s) => (
              <Pressable key={s} style={styles.chip} onPress={() => onSuggest(s)}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: Colors.goldBright, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.8, marginTop: 2 },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,215,90,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,215,90,0.28)",
  },
  headerBadgeText: { color: Colors.goldBright, fontSize: 11, fontWeight: "900" },
  hint: {
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hintText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  list: { padding: 16, paddingBottom: 18, gap: 12 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowBot: { justifyContent: "flex-start" },
  rowUser: { justifyContent: "flex-end" },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.goldBright,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 20,
  },
  bubbleBot: {
    backgroundColor: "rgba(8,12,22,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderBottomLeftRadius: 6,
  },
  bubbleUser: {
    backgroundColor: Colors.goldBright,
    borderBottomRightRadius: 6,
  },
  bubbleText: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  bubbleTextUser: { color: Colors.ink, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 11,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(63,169,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(98,208,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { color: Colors.text, fontSize: 11.5, fontWeight: "800" },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(8,12,22,0.6)",
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.goldBright,
    alignItems: "center",
    justifyContent: "center",
  },
  sendPressed: { opacity: 0.85 },
});
