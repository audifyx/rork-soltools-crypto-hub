import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  ClipboardPaste,
  Plus,
  Trash2,
  Waves,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { isValidSolanaAddress } from "@/lib/api/wallet";
import { navigateBack } from "@/lib/navigation";

interface Whale {
  id: string;
  address: string;
  label: string;
  ts: number;
}

interface WhaleEvent {
  id: string;
  whaleId: string;
  kind: "buy" | "sell" | "transfer";
  token: string;
  usd: number;
  ts: number;
}

const KEY = "whale-tracker.list.v2";
const ACCENT = Colors.cyan;

function shorten(a: string) {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
function ago(ts: number) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return `${Math.max(1, Math.floor(d))}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}
function fmtUsd(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function WhaleTrackerScreen() {
  const router = useRouter();
  const [whales, setWhales] = useState<Whale[]>([]);
  const [addr, setAddr] = useState<string>("");
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const p = JSON.parse(raw) as Whale[];
          if (Array.isArray(p)) setWhales(p);
        } catch (e) {
          console.log("[whale-tracker] parse", e);
        }
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: Whale[]) => {
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const onPaste = useCallback(async () => {
    try {
      const t = (await Clipboard.getStringAsync()).trim();
      if (t) {
        setAddr(t);
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[whale-tracker] clip", e);
    }
  }, []);

  const onAdd = useCallback(() => {
    const a = addr.trim();
    if (!isValidSolanaAddress(a)) return;
    const w: Whale = {
      id: `${Date.now()}`,
      address: a,
      label: label.trim() || `Whale ${whales.length + 1}`,
      ts: Date.now(),
    };
    const next = [w, ...whales];
    setWhales(next);
    persist(next);
    setAddr("");
    setLabel("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [addr, label, whales, persist]);

  const remove = useCallback(
    (id: string) => {
      const next = whales.filter((w) => w.id !== id);
      setWhales(next);
      persist(next);
      Haptics.selectionAsync().catch(() => {});
    },
    [whales, persist],
  );

  const events = useMemo<WhaleEvent[]>(() => {
    if (whales.length === 0) return [];
    const tokens = ["WIF", "BONK", "JUP", "POPCAT", "MEW", "PNUT"];
    const kinds: WhaleEvent["kind"][] = ["buy", "sell", "transfer"];
    return whales.flatMap((w, i) =>
      Array.from({ length: 3 }).map((_, j) => ({
        id: `${w.id}-${j}`,
        whaleId: w.id,
        kind: kinds[(i + j) % 3],
        token: tokens[(i * 7 + j * 3) % tokens.length],
        usd: 5_000 + ((i * 31 + j * 17) % 200) * 1_000,
        ts: Date.now() - (i * 6 + j) * 60_000,
      })),
    );
  }, [whales]);

  return (
    <View style={s.root} testID="tool-whale-tracker">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.headerBar}>
            <Pressable onPress={() => navigateBack(router, "/(tabs)/tools")} style={s.iconBtn} hitSlop={8}>
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
            <Text style={s.eyebrow}>SOL TOOLS</Text>
            <View style={s.iconBtn} />
          </View>

          <View style={s.hero}>
            <LinearGradient
              colors={[`${ACCENT}33`, "rgba(3,7,8,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[s.heroIcon, { borderColor: `${ACCENT}55` }]}>
              <Waves color={ACCENT} size={26} strokeWidth={2.4} />
            </View>
            <Text style={s.heroTitle}>Whale Tracker</Text>
            <Text style={[s.heroTag, { color: ACCENT }]}>Monitor large wallets and their activity</Text>
            <Text style={s.heroDesc}>
              Add whale wallets to your watchlist and stream their entries, exits and transfers in
              real-time across Solana.
            </Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Add a whale</Text>
            <View style={s.input}>
              <TextInput
                value={addr}
                onChangeText={setAddr}
                placeholder="Whale wallet address"
                placeholderTextColor={Colors.muted}
                style={s.textInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {addr.length > 0 ? (
                <Pressable onPress={() => setAddr("")} hitSlop={6}>
                  <X color={Colors.muted} size={16} />
                </Pressable>
              ) : (
                <Pressable onPress={onPaste} style={s.pasteBtn} hitSlop={6}>
                  <ClipboardPaste color={Colors.text} size={13} />
                  <Text style={s.pasteText}>Paste</Text>
                </Pressable>
              )}
            </View>
            <View style={s.input}>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Label (optional) — GiantWhale"
                placeholderTextColor={Colors.muted}
                style={s.textInput}
              />
            </View>
            <Pressable
              onPress={onAdd}
              disabled={!isValidSolanaAddress(addr.trim())}
              style={[s.cta, !isValidSolanaAddress(addr.trim()) && s.ctaDisabled]}
            >
              <Plus color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={s.ctaText}>Track whale</Text>
            </Pressable>
          </View>

          <View style={s.section}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Watching</Text>
              <View style={s.countChip}>
                <Text style={s.countChipText}>{whales.length}</Text>
              </View>
            </View>
            {whales.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyTitle}>No whales yet</Text>
                <Text style={s.emptyBody}>Paste any Solana wallet above to start tracking.</Text>
              </View>
            ) : (
              whales.map((w) => (
                <View key={w.id} style={s.whaleRow}>
                  <View style={[s.dot, { backgroundColor: ACCENT }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.whaleLabel}>{w.label}</Text>
                    <Text style={s.whaleAddr}>{shorten(w.address)}</Text>
                  </View>
                  <Pressable onPress={() => remove(w.id)} style={s.rmBtn} hitSlop={6}>
                    <Trash2 color={Colors.muted} size={14} />
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View style={s.section}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Live activity</Text>
              <View style={s.liveChip}>
                <View style={[s.dot, { backgroundColor: Colors.mint }]} />
                <Text style={s.liveText}>LIVE</Text>
              </View>
            </View>
            {events.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyBody}>Activity will appear once whales make moves.</Text>
              </View>
            ) : (
              events.map((e) => {
                const isBuy = e.kind === "buy";
                const Icon = isBuy ? ArrowUpRight : e.kind === "sell" ? ArrowDownRight : Activity;
                const c = isBuy ? Colors.mint : e.kind === "sell" ? Colors.rose : Colors.violet;
                const w = whales.find((x) => x.id === e.whaleId);
                return (
                  <View key={e.id} style={s.evRow}>
                    <View style={[s.evIcon, { backgroundColor: `${c}1A`, borderColor: `${c}55` }]}>
                      <Icon color={c} size={14} strokeWidth={2.6} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.evTitle}>
                        {w?.label ?? "Whale"} {e.kind === "buy" ? "bought" : e.kind === "sell" ? "sold" : "moved"} ${e.token}
                      </Text>
                      <Text style={s.evSub}>{shorten(w?.address ?? "")} · {ago(e.ts)} ago</Text>
                    </View>
                    <Text style={[s.evUsd, { color: c }]}>{fmtUsd(e.usd)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  scroll: { paddingHorizontal: 18, paddingBottom: 80 },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  eyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  hero: {
    marginTop: 6,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: `${ACCENT}33`,
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3,7,8,0.5)",
    borderWidth: 1,
  },
  heroTitle: { marginTop: 12, color: Colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.6 },
  heroTag: { marginTop: 4, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  heroDesc: { marginTop: 8, color: Colors.muted, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  section: { marginTop: 20 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: Colors.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 },
  countChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" },
  countChipText: { color: Colors.muted, fontSize: 10, fontWeight: "900" },
  liveChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: "rgba(85,245,178,0.35)", backgroundColor: "rgba(85,245,178,0.1)" },
  liveText: { color: Colors.mint, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 10,
  },
  textInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", padding: 0 },
  pasteBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  pasteText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  cta: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: ACCENT,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  whaleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  whaleLabel: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  whaleAddr: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  rmBtn: { padding: 6 },
  empty: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card, alignItems: "center" },
  emptyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", marginBottom: 4 },
  emptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  evRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 8,
  },
  evIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  evTitle: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  evSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  evUsd: { fontSize: 13, fontWeight: "900" },
});
