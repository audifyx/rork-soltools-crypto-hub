import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  BellRing,
  ClipboardPaste,
  MessageCircle,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useTrendingTokens } from "@/lib/api/market";
import { navigateBack } from "@/lib/navigation";
import { useApp } from "@/providers/app-provider";

const ACCENT = Colors.mint;

export default function PriceAlertsScreen() {
  const router = useRouter();
  const trending = useTrendingTokens(20);
  const { alerts, addAlert, removeAlert } = useApp();
  const [pickedSymbol, setPickedSymbol] = useState<string>("");
  const [pickedMint, setPickedMint] = useState<string>("");
  const [customMint, setCustomMint] = useState<string>("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [target, setTarget] = useState<string>("0.00001");
  const [discord, setDiscord] = useState<boolean>(false);


  const tokens = useMemo(() => {
    const list = (trending.data ?? []).slice(0, 12);
    return list.map((t) => ({
      symbol: (t.symbol ?? "").toString(),
      address: (t.address ?? "").toString(),
    })).filter((x) => x.symbol && x.address);
  }, [trending.data]);

  const onPasteMint = useCallback(async () => {
    try {
      const t = (await Clipboard.getStringAsync()).trim();
      if (t) {
        setCustomMint(t);
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      console.log("[price-alerts] clip", e);
    }
  }, []);

  const onCreate = useCallback(async () => {
    const mint = pickedMint || customMint.trim();
    if (!mint) return;
    const num = parseFloat(target);
    if (!Number.isFinite(num) || num <= 0) return;
    await addAlert({
      ticker: (pickedSymbol || "TOKEN").replace("$", "").toUpperCase(),
      contract: mint,
      type: condition === "above" ? "price-above" : "price-below",
      value: num,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setPickedSymbol("");
    setPickedMint("");
    setCustomMint("");
    setTarget("0.00001");
  }, [pickedMint, customMint, target, pickedSymbol, condition, addAlert]);

  const remove = useCallback(
    async (id: string) => {
      await removeAlert(id);
    },
    [removeAlert],
  );

  return (
    <View style={s.root} testID="tool-price-alerts">
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
              <BellRing color={ACCENT} size={26} strokeWidth={2.4} />
            </View>
            <Text style={s.heroTitle}>SolanaGPT and Price Alerts</Text>
            <Text style={[s.heroTag, { color: ACCENT }]}>Get notified when prices hit your targets</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Select Token</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
              {tokens.length === 0 ? (
                <Text style={s.emptyBody}>Loading trending tokens…</Text>
              ) : (
                tokens.map((t) => {
                  const active = pickedMint === t.address;
                  return (
                    <Pressable
                      key={t.address}
                      onPress={() => {
                        setPickedSymbol(t.symbol);
                        setPickedMint(t.address);
                        setCustomMint("");
                        Haptics.selectionAsync().catch(() => {});
                      }}
                      style={[s.chip, active && { borderColor: ACCENT, backgroundColor: `${ACCENT}1F` }]}
                    >
                      <Text style={[s.chipText, active && { color: ACCENT }]}>${t.symbol}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <Text style={[s.sectionTitle, { marginTop: 14 }]}>Or Enter Token Address</Text>
            <View style={s.input}>
              <TextInput
                value={customMint}
                onChangeText={(v) => {
                  setCustomMint(v);
                  if (v) {
                    setPickedMint("");
                    setPickedSymbol("");
                  }
                }}
                placeholder="Token mint address…"
                placeholderTextColor={Colors.muted}
                style={s.textInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {customMint.length > 0 ? (
                <Pressable onPress={() => setCustomMint("")} hitSlop={6}>
                  <X color={Colors.muted} size={16} />
                </Pressable>
              ) : (
                <Pressable onPress={onPasteMint} style={s.pasteBtn} hitSlop={6}>
                  <ClipboardPaste color={Colors.text} size={13} />
                  <Text style={s.pasteText}>Paste</Text>
                </Pressable>
              )}
            </View>

            <Text style={[s.sectionTitle, { marginTop: 14 }]}>Condition</Text>
            <View style={s.segRow}>
              {(["above", "below"] as const).map((c) => {
                const active = condition === c;
                const Icon = c === "above" ? TrendingUp : TrendingDown;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setCondition(c);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    style={[s.seg, active && { backgroundColor: `${ACCENT}1F`, borderColor: ACCENT }]}
                  >
                    <Icon color={active ? ACCENT : Colors.muted} size={14} strokeWidth={2.6} />
                    <Text style={[s.segText, active && { color: ACCENT }]}>
                      Price {c === "above" ? "Above" : "Below"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[s.sectionTitle, { marginTop: 14 }]}>Target Price ($)</Text>
            <View style={s.input}>
              <TextInput
                value={target}
                onChangeText={setTarget}
                placeholder="0.00001"
                placeholderTextColor={Colors.muted}
                style={s.textInput}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={s.toggleRow}>
              <View style={s.toggleLeft}>
                <View style={[s.toggleIcon, { backgroundColor: "rgba(88,101,242,0.18)" }]}>
                  <MessageCircle color="#5865F2" size={14} strokeWidth={2.6} />
                </View>
                <View>
                  <Text style={s.toggleTitle}>Discord Notifications</Text>
                  <Text style={s.toggleSub}>Send to your Discord webhook</Text>
                </View>
              </View>
              <Switch
                value={discord}
                onValueChange={setDiscord}
                trackColor={{ true: ACCENT, false: "rgba(255,255,255,0.1)" }}
                thumbColor={Colors.ink}
              />
            </View>

            <Pressable
              onPress={onCreate}
              disabled={!(pickedMint || customMint.trim()) || !parseFloat(target)}
              style={[
                s.cta,
                !(pickedMint || customMint.trim()) || !parseFloat(target) ? s.ctaDisabled : null,
              ]}
            >
              <Plus color={Colors.ink} size={16} strokeWidth={3} />
              <Text style={s.ctaText}>Create alert</Text>
            </Pressable>
          </View>

          <View style={s.section}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Active alerts</Text>
              <View style={s.countChip}>
                <Text style={s.countChipText}>{alerts.length}</Text>
              </View>
            </View>
            {alerts.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyTitle}>No alerts yet</Text>
                <Text style={s.emptyBody}>Pick a token and target price to create your first alert.</Text>
              </View>
            ) : (
              alerts.map((a) => {
                const isAbove = a.type === "price-above" || a.type === "volume-spike" || a.type === "whale-buy";
                const Icon = isAbove ? TrendingUp : TrendingDown;
                const c = isAbove ? Colors.mint : Colors.rose;
                return (
                  <View key={a.id} style={s.alertRow}>
                    <View style={[s.evIcon, { backgroundColor: `${c}1A`, borderColor: `${c}55` }]}>
                      <Icon color={c} size={14} strokeWidth={2.6} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.alertTitle}>
                        ${a.ticker} {isAbove ? "above" : "below"} ${a.value}
                      </Text>
                      <Text style={s.alertSub}>
                        {(a.contract ?? a.ticker).slice(0, 4)}…{(a.contract ?? a.ticker).slice(-4)} · {a.enabled ? "Active" : "Paused"}
                      </Text>
                    </View>
                    <Pressable onPress={() => remove(a.id)} hitSlop={6}>
                      <Trash2 color={Colors.muted} size={14} />
                    </Pressable>
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
  heroTitle: { marginTop: 12, color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  heroTag: { marginTop: 4, fontSize: 12, fontWeight: "800" },
  section: { marginTop: 18 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", letterSpacing: -0.2, marginBottom: 8 },
  chipsRow: { gap: 8, paddingRight: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  chipText: { color: Colors.text, fontSize: 12, fontWeight: "900" },
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
  },
  textInput: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "700", padding: 0 },
  pasteBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  pasteText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  segRow: { flexDirection: "row", gap: 8 },
  seg: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  segText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  toggleRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  toggleTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  toggleSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  cta: {
    marginTop: 14,
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
  countChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" },
  countChipText: { color: Colors.muted, fontSize: 10, fontWeight: "900" },
  empty: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card, alignItems: "center" },
  emptyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900", marginBottom: 4 },
  emptyBody: { color: Colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  alertRow: {
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
  alertTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  alertSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
});
