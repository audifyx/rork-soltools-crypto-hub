import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  MessageCircle,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { fetchWalletPortfolio } from "@/lib/api/wallet";
import { navigateBack } from "@/lib/navigation";
import { isSolanaAddress, scanCommunityToken } from "@/lib/community-token";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";

type Msg = {
  id: string;
  role: "user" | "ai";
  text: string;
};

const SUGGESTIONS: { label: string; prompt: string }[] = [
  { label: "Analyze this wallet", prompt: "Analyze wallet 9xQe…F4uG and tell me their style." },
  { label: "Is this token safe?", prompt: "Is this token safe to ape into?" },
  { label: "Who's holding?", prompt: "Show me top holders and clusters." },
  { label: "Recent flow", prompt: "Show net buy/sell flow in last 24h." },
];

const STARTER_AI: Msg = {
  id: "ai-0",
  role: "ai",
  text:
    "Hey — I'm your on-chain AI. Paste a token or wallet address, or ask me anything. I read live data via Helius + RPC and can break down holders, flows, history and risk.",
};

export default function AIChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([STARTER_AI]);
  const [draft, setDraft] = useState<string>("");
  const [thinking, setThinking] = useState<boolean>(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || thinking) return;
      Haptics.selectionAsync().catch(() => {});
      const id = Date.now().toString();
      const userMsg: Msg = { id, role: "user", text: trimmed };
      const thinkingMsg: Msg = {
        id: `${id}-a`,
        role: "ai",
        text: "Pulling live Solana context…",
      };
      const nextMessages = [...messages, userMsg];
      setMessages([...nextMessages, thinkingMsg]);
      setDraft("");
      setThinking(true);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

      try {
        const address = trimmed.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)?.[0] ?? null;
        let liveContext = "No address detected in the prompt.";
        if (address && isSolanaAddress(address)) {
          const [tokenScan, wallet] = await Promise.all([
            scanCommunityToken(address).catch((e) => {
              console.log("[ai-chat] token context failed", e);
              return null;
            }),
            fetchWalletPortfolio(address).catch((e) => {
              console.log("[ai-chat] wallet context failed", e);
              return null;
            }),
          ]);
          const tokenLine = tokenScan
            ? `Token: ${tokenScan.name} (${tokenScan.symbol}), MC ${fmtUsd(tokenScan.marketCapUsd)}, liquidity ${fmtUsd(tokenScan.liquidityUsd)}, volume ${fmtUsd(tokenScan.volume24hUsd)}, holders ${fmtNum(tokenScan.holderCount)}, 24h ${fmtPct(tokenScan.change24h)}.`
            : "Token context unavailable.";
          const walletLine = wallet
            ? `Wallet: ${wallet.balance.sol.toFixed(4)} SOL, net ${fmtUsd(wallet.balance.usd)}, ${wallet.tokens.length} token holdings, ${wallet.stats.totalTxs} recent transactions, active ${wallet.stats.activeDays} days.`
            : "Wallet context unavailable.";
          liveContext = `${tokenLine}\n${walletLine}`;
        }

        const reply = address && isSolanaAddress(address)
          ? `${liveContext}\n\nAI chat is disabled in this build, but live token and wallet context loaded successfully.`
          : "AI chat is disabled in this build. Paste a Solana token or wallet address to load live on-chain context.";
        setMessages((prev) => prev.map((m) => (m.id === thinkingMsg.id ? { ...m, text: reply } : m)));
      } catch (e) {
        console.log("[ai-chat] send failed", e);
        const reply = e instanceof Error ? `AI request failed: ${e.message}` : "AI request failed.";
        setMessages((prev) => prev.map((m) => (m.id === thinkingMsg.id ? { ...m, text: reply } : m)));
      } finally {
        setThinking(false);
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    },
    [messages, thinking],
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigateBack(router, "/(tabs)/tools")} style={styles.backBtn}>
            <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <View style={styles.iconBadge}>
              <MessageCircle color={Colors.orange} size={14} strokeWidth={2.6} />
            </View>
            <Text style={styles.topTitle}>Chat with AI</Text>
          </View>
          <View style={styles.liveDot}>
            <View style={styles.dot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={["rgba(255,184,76,0.18)", "rgba(3,7,8,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroBadge}>
                <Sparkles color={Colors.orange} size={11} strokeWidth={3} />
                <Text style={styles.heroBadgeText}>HELIUS + RPC CONTEXT</Text>
              </View>
              <Text style={styles.heroTitle}>Ask anything on-chain</Text>
              <Text style={styles.heroSub}>
                Tokens, wallets, flows, narratives — chat with full live blockchain
                context.
              </Text>
            </LinearGradient>

            {messages.map((m) =>
              m.role === "ai" ? <AIBubble key={m.id} text={m.text} /> : <UserBubble key={m.id} text={m.text} />
            )}

            <View style={styles.suggestRow}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s.label}
                  onPress={() => { void send(s.prompt); }}
                  style={styles.suggestChip}
                >
                  <Zap color={Colors.orange} size={11} strokeWidth={3} />
                  <Text style={styles.suggestText}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={styles.inputBar}>
            <Pressable style={styles.attachBtn}>
              <Wallet color={Colors.muted} size={16} strokeWidth={2.4} />
            </Pressable>
            <TextInput
              testID="chat-input"
              placeholder="Ask about a token or wallet…"
              placeholderTextColor={Colors.muted}
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onSubmitEditing={() => { void send(draft); }}
            />
            <Pressable
              onPress={() => { void send(draft); }}
              disabled={draft.trim().length === 0 || thinking}
              style={[
                styles.sendBtn,
                (draft.trim().length === 0 || thinking) && { opacity: 0.4 },
              ]}
              testID="chat-send"
            >
              {thinking ? <ActivityIndicator color={Colors.ink} size="small" /> : <ArrowUp color={Colors.ink} size={18} strokeWidth={3} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function AIBubble({ text }: { text: string }) {
  return (
    <View style={styles.aiRow}>
      <View style={styles.aiAvatar}>
        <Bot color={Colors.orange} size={14} strokeWidth={2.6} />
      </View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiText}>{text}</Text>
      </View>
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 16 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  topTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(255,184,76,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  liveDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
    backgroundColor: "rgba(85,245,178,0.08)",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.mint },
  liveText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  hero: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.25)",
    marginTop: 4,
  },
  heroBadge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(3,7,8,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.4)",
  },
  heroBadgeText: {
    color: Colors.orange,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginTop: 12,
  },
  heroSub: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 6,
  },

  aiRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 16,
  },
  aiAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255,184,76,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiBubble: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    borderTopLeftRadius: 4,
  },
  aiText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },

  userRow: {
    alignItems: "flex-end",
    marginTop: 12,
  },
  userBubble: {
    maxWidth: "82%",
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.mint,
    borderTopRightRadius: 4,
  },
  userText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },

  suggestRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.3)",
    backgroundColor: Colors.card,
  },
  suggestText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === "ios" ? 18 : 12,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    backgroundColor: Colors.ink,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.orange,
  },
});
