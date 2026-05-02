import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowDownUp,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link,
  Loader2,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";

import Colors from "@/constants/colors";
import { type JupiterQuote, type JupiterToken } from "@/lib/api/jupiter";
import { shortAddress } from "@/lib/solana-wallet";
import { useAuth } from "@/providers/auth-provider";
import { type TradingWallet, type WalletExportPayload, useTradingWallets } from "@/providers/trading-wallet-provider";

type Mode = "create" | "import" | "trade";

function formatRawAmount(raw: string, decimals: number): string {
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const frac = padded.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function quoteOutText(quote: JupiterQuote | null, token: JupiterToken): string {
  if (!quote) return "—";
  return `${Number(formatRawAmount(quote.outAmount, token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${token.symbol}`;
}

export default function WalletScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const {
    wallets,
    trades,
    defaultInputToken,
    defaultOutputToken,
    createWallet,
    isCreatingWallet,
    importWallet,
    isImportingWallet,
    exportWallet,
    markWalletBackedUp,
    deleteWallet,
    connectPhantom,
    phantomStatus,
    previewQuote,
    executeSwap,
    isSwapping,
    swapError,
  } = useTradingWallets();

  const [mode, setMode] = useState<Mode>("trade");
  const [label, setLabel] = useState<string>("");
  const [importSecret, setImportSecret] = useState<string>("");
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [inputToken] = useState<JupiterToken>(defaultInputToken);
  const [outputToken] = useState<JupiterToken>(defaultOutputToken);
  const [amount, setAmount] = useState<string>("0.05");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [exportPayload, setExportPayload] = useState<WalletExportPayload | null>(null);
  const [revealExport, setRevealExport] = useState<boolean>(false);

  const selectedWallet = useMemo<TradingWallet | null>(() => {
    return wallets.find((w) => w.id === selectedWalletId) ?? wallets[0] ?? null;
  }, [selectedWalletId, wallets]);

  const localWallets = wallets.filter((w) => w.type === "local").length;
  const phantomWallets = wallets.filter((w) => w.type === "phantom").length;
  const completedTrades = trades.filter((t) => t.status === "confirmed").length;

  const onCreate = useCallback(async () => {
    try {
      const wallet = await createWallet(label.trim() || undefined);
      setSelectedWalletId(wallet.id);
      setMode("trade");
      setLabel("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Wallet created", "Your seed phrase/private key is encrypted on this device only. Export and back it up before funding it.");
    } catch (e) {
      Alert.alert("Create failed", e instanceof Error ? e.message : "Could not create wallet.");
    }
  }, [createWallet, label]);

  const onImport = useCallback(async () => {
    try {
      const wallet = await importWallet({ secret: importSecret, label: label.trim() || undefined });
      setSelectedWalletId(wallet.id);
      setMode("trade");
      setImportSecret("");
      setLabel("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert("Import failed", e instanceof Error ? e.message : "Paste a valid seed phrase, base58 private key, or JSON secret key.");
    }
  }, [importSecret, importWallet, label]);

  const onPasteImport = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    setImportSecret(text.trim());
  }, []);

  const onExport = useCallback(async (walletId: string) => {
    try {
      const payload = await exportWallet(walletId);
      setRevealExport(false);
      setExportPayload(payload);
    } catch (e) {
      Alert.alert("Export unavailable", e instanceof Error ? e.message : "Could not export this wallet.");
    }
  }, [exportWallet]);

  const copyText = useCallback(async (title: string, value: string) => {
    await Clipboard.setStringAsync(value);
    Haptics.selectionAsync().catch(() => {});
    Alert.alert("Copied", `${title} copied to clipboard.`);
  }, []);

  const onDelete = useCallback((wallet: TradingWallet) => {
    Alert.alert("Remove wallet?", "This removes local encrypted key storage from this device. Make sure you have a backup first.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => deleteWallet(wallet.id).catch((e) => Alert.alert("Remove failed", e instanceof Error ? e.message : "Could not remove wallet.")),
      },
    ]);
  }, [deleteWallet]);

  const onPreview = useCallback(async () => {
    if (!selectedWallet) {
      Alert.alert("No wallet", "Create/import a wallet or connect Phantom first.");
      return;
    }
    setQuoteLoading(true);
    try {
      const q = await previewQuote({ walletId: selectedWallet.id, inputToken, outputToken, amountUi: amount, slippageBps });
      setQuote(q);
      Haptics.selectionAsync().catch(() => {});
    } catch (e) {
      Alert.alert("Quote failed", e instanceof Error ? e.message : "Could not fetch Jupiter quote.");
    } finally {
      setQuoteLoading(false);
    }
  }, [amount, inputToken, outputToken, previewQuote, selectedWallet, slippageBps]);

  const onSwap = useCallback(async () => {
    if (!selectedWallet) {
      Alert.alert("No wallet", "Create/import a wallet or connect Phantom first.");
      return;
    }
    try {
      const trade = await executeSwap({ walletId: selectedWallet.id, inputToken, outputToken, amountUi: amount, slippageBps });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(trade.status === "confirmed" ? "Trade confirmed" : "Trade sent", trade.signature ? `Signature: ${trade.signature.slice(0, 10)}…${trade.signature.slice(-8)}` : "Trade submitted.");
      setQuote(null);
    } catch (e) {
      Alert.alert("Trade failed", e instanceof Error ? e.message : "Swap could not be completed.");
    }
  }, [amount, executeSwap, inputToken, outputToken, selectedWallet, slippageBps]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
              <ArrowLeft color={Colors.text} size={19} strokeWidth={2.8} />
            </Pressable>
            <View style={styles.headerMid}>
              <Text style={styles.eyebrow}>SECURE SOLANA WALLET</Text>
              <Text style={styles.title}>Trade Vault</Text>
            </View>
            <View style={styles.iconBtn}>
              <ShieldCheck color={Colors.mint} size={19} strokeWidth={2.8} />
            </View>
          </View>

          <LinearGradient colors={["rgba(85,245,178,0.22)", "rgba(56,215,255,0.10)", "rgba(3,7,8,0)"]} style={styles.hero}>
            <View style={styles.heroIcon}><LockKeyhole color={Colors.mint} size={26} strokeWidth={2.8} /></View>
            <Text style={styles.heroTitle}>Keys never touch the database.</Text>
            <Text style={styles.heroText}>Local wallets are encrypted with device SecureStore. Phantom trades are approved inside Phantom. Supabase stores only public wallet metadata and trade history.</Text>
          </LinearGradient>

          {!isAuthenticated ? (
            <View style={styles.warnCard}>
              <Text style={styles.warnTitle}>Sign in required</Text>
              <Text style={styles.warnText}>Wallet metadata and trade history need your account. Secrets still stay local-only.</Text>
              <Pressable onPress={() => router.push("/auth?mode=signin" as never)} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Sign in</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.statRow}>
            <Stat label="Local" value={`${localWallets}`} Icon={KeyRound} accent={Colors.mint} />
            <Stat label="Phantom" value={`${phantomWallets}`} Icon={Link} accent={Colors.violet} />
            <Stat label="Trades" value={`${completedTrades}`} Icon={ArrowDownUp} accent={Colors.orange} />
          </View>

          <View style={styles.segmentRow}>
            {(["trade", "create", "import"] as Mode[]).map((m) => {
              const active = mode === m;
              return (
                <Pressable key={m} onPress={() => setMode(m)} style={[styles.segment, active && styles.segmentActive]}>
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>

          {mode === "create" ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Create fresh wallet</Text>
              <Text style={styles.bodyText}>Generates a new Solana seed phrase on-device and stores the private key encrypted locally.</Text>
              <TextInput value={label} onChangeText={setLabel} placeholder="Wallet label (optional)" placeholderTextColor={Colors.muted} style={styles.input} />
              <Pressable onPress={onCreate} disabled={isCreatingWallet || !isAuthenticated} style={[styles.primaryBtn, (isCreatingWallet || !isAuthenticated) && styles.disabled]}>
                {isCreatingWallet ? <Loader2 color={Colors.ink} size={16} /> : <Plus color={Colors.ink} size={16} strokeWidth={3} />}
                <Text style={styles.primaryText}>{isCreatingWallet ? "Creating…" : "Create wallet"}</Text>
              </Pressable>
            </View>
          ) : null}

          {mode === "import" ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Import wallet</Text>
              <Text style={styles.bodyText}>Paste a 12/24-word seed phrase, a base58 private key, or a Solana CLI JSON secret-key array. It is encrypted locally only.</Text>
              <TextInput value={label} onChangeText={setLabel} placeholder="Wallet label (optional)" placeholderTextColor={Colors.muted} style={styles.input} />
              <View style={styles.inputWithAction}>
                <TextInput value={importSecret} onChangeText={setImportSecret} placeholder="Seed phrase or private key" placeholderTextColor={Colors.muted} style={[styles.input, styles.flexInput]} multiline secureTextEntry />
                <Pressable onPress={onPasteImport} style={styles.smallIconBtn}><ClipboardPaste color={Colors.mint} size={16} /></Pressable>
              </View>
              <Pressable onPress={onImport} disabled={isImportingWallet || !isAuthenticated || !importSecret.trim()} style={[styles.primaryBtn, (isImportingWallet || !isAuthenticated || !importSecret.trim()) && styles.disabled]}>
                {isImportingWallet ? <Loader2 color={Colors.ink} size={16} /> : <KeyRound color={Colors.ink} size={16} strokeWidth={3} />}
                <Text style={styles.primaryText}>{isImportingWallet ? "Importing…" : "Import securely"}</Text>
              </Pressable>
            </View>
          ) : null}

          {mode === "trade" ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Jupiter swap</Text>
              <Text style={styles.bodyText}>Route through Jupiter. Local wallets sign on-device; Phantom wallets open Phantom approval.</Text>
              <Text style={styles.label}>Wallet</Text>
              <View style={styles.walletPicker}>
                {wallets.length === 0 ? <Text style={styles.mutedText}>No wallets yet</Text> : wallets.map((w) => (
                  <Pressable key={w.id} onPress={() => setSelectedWalletId(w.id)} style={[styles.walletChip, selectedWallet?.id === w.id && styles.walletChipActive]}>
                    <Wallet color={selectedWallet?.id === w.id ? Colors.ink : Colors.text} size={13} strokeWidth={2.6} />
                    <Text style={[styles.walletChipText, selectedWallet?.id === w.id && styles.walletChipTextActive]}>{w.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.swapBox}>
                <View style={styles.swapLine}>
                  <Text style={styles.swapLabel}>Pay</Text>
                  <Text style={styles.tokenPill}>{inputToken.symbol}</Text>
                </View>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={Colors.muted} style={styles.amountInput} />
                <View style={styles.divider} />
                <View style={styles.swapLine}>
                  <Text style={styles.swapLabel}>Receive est.</Text>
                  <Text style={styles.tokenPill}>{outputToken.symbol}</Text>
                </View>
                <Text style={styles.outText}>{quoteOutText(quote, outputToken)}</Text>
              </View>
              <View style={styles.slipRow}>
                {[50, 100, 300].map((bps) => (
                  <Pressable key={bps} onPress={() => setSlippageBps(bps)} style={[styles.slipChip, slippageBps === bps && styles.slipChipActive]}>
                    <Text style={[styles.slipText, slippageBps === bps && styles.slipTextActive]}>{(bps / 100).toFixed(1)}%</Text>
                  </Pressable>
                ))}
              </View>
              {quote ? <Text style={styles.quoteMeta}>Price impact {Number(quote.priceImpactPct ?? 0).toFixed(3)}% · route hops {quote.routePlan?.length ?? 0}</Text> : null}
              {swapError ? <Text style={styles.errorText}>{swapError.message}</Text> : null}
              {phantomStatus ? <Text style={styles.statusText}>{phantomStatus}</Text> : null}
              <View style={styles.actionRow}>
                <Pressable onPress={onPreview} disabled={quoteLoading || !selectedWallet} style={[styles.secondaryBtn, (quoteLoading || !selectedWallet) && styles.disabled]}>
                  <Text style={styles.secondaryText}>{quoteLoading ? "Quoting…" : "Preview"}</Text>
                </Pressable>
                <Pressable onPress={onSwap} disabled={isSwapping || !selectedWallet} style={[styles.primaryBtn, styles.flexBtn, (isSwapping || !selectedWallet) && styles.disabled]}>
                  {isSwapping ? <Loader2 color={Colors.ink} size={16} /> : <Zap color={Colors.ink} size={16} strokeWidth={3} />}
                  <Text style={styles.primaryText}>{isSwapping ? "Trading…" : "Swap"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.sectionTitle}>Wallets</Text>
              <Pressable onPress={() => connectPhantom().catch((e) => Alert.alert("Phantom", e instanceof Error ? e.message : "Could not open Phantom."))} style={styles.phantomBtn}>
                <Link color={Colors.violet} size={14} />
                <Text style={styles.phantomText}>Connect Phantom</Text>
              </Pressable>
            </View>
            {wallets.length === 0 ? <Text style={styles.emptyText}>Create/import a wallet or connect Phantom to start trading.</Text> : wallets.map((w) => (
              <View key={w.id} style={styles.walletRow}>
                <View style={[styles.walletIcon, { backgroundColor: w.type === "phantom" ? "rgba(184,140,255,0.16)" : "rgba(85,245,178,0.16)" }]}>
                  <Wallet color={w.type === "phantom" ? Colors.violet : Colors.mint} size={16} />
                </View>
                <View style={styles.walletMid}>
                  <Text style={styles.walletTitle}>{w.label}</Text>
                  <Text style={styles.walletSub}>{shortAddress(w.address)} · {w.type === "phantom" ? "Phantom" : w.isBackedUp ? "Backed up" : "Needs backup"}</Text>
                </View>
                <Pressable onPress={() => copyText("Address", w.address)} style={styles.rowBtn}><Copy color={Colors.muted} size={14} /></Pressable>
                {w.type === "local" ? <Pressable onPress={() => onExport(w.id)} style={styles.rowBtn}><Eye color={Colors.muted} size={14} /></Pressable> : null}
                <Pressable onPress={() => onDelete(w)} style={styles.rowBtn}><Trash2 color={Colors.rose} size={14} /></Pressable>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent trades</Text>
            {trades.length === 0 ? <Text style={styles.emptyText}>Trades you place through Jupiter will show here.</Text> : trades.slice(0, 8).map((t) => (
              <View key={t.id} style={styles.tradeRow}>
                <View style={styles.tradeIcon}>{t.status === "confirmed" ? <CheckCircle2 color={Colors.mint} size={15} /> : <ArrowDownUp color={Colors.orange} size={15} />}</View>
                <View style={styles.walletMid}>
                  <Text style={styles.walletTitle}>{t.inputSymbol ?? "TOKEN"} → {t.outputSymbol ?? "TOKEN"}</Text>
                  <Text style={styles.walletSub}>{t.status.toUpperCase()} · {t.signature ? shortAddress(t.signature) : shortAddress(t.walletAddress)}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={!!exportPayload} transparent animationType="slide" onRequestClose={() => setExportPayload(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.cardHead}>
              <Text style={styles.sectionTitle}>Export private keys</Text>
              <Pressable onPress={() => setExportPayload(null)} hitSlop={8}><X color={Colors.muted} size={20} /></Pressable>
            </View>
            <Text style={styles.warnText}>Never share this. Anyone with this key can drain the wallet. This is shown from device SecureStore only, not from the database.</Text>
            <Pressable onPress={() => setRevealExport((v) => !v)} style={styles.secondaryBtnFull}>
              {revealExport ? <EyeOff color={Colors.text} size={15} /> : <Eye color={Colors.text} size={15} />}
              <Text style={styles.secondaryText}>{revealExport ? "Hide secrets" : "Reveal secrets"}</Text>
            </Pressable>
            {exportPayload && revealExport ? (
              <View>
                {exportPayload.mnemonic ? <SecretBlock label="Seed phrase" value={exportPayload.mnemonic} onCopy={copyText} /> : null}
                <SecretBlock label="Private key" value={exportPayload.privateKeyBase58} onCopy={copyText} />
                <Pressable onPress={() => markWalletBackedUp(wallets.find((w) => w.address === exportPayload.address)?.id ?? "").then(() => setExportPayload(null))} style={styles.primaryBtn}>
                  <ShieldCheck color={Colors.ink} size={16} strokeWidth={3} />
                  <Text style={styles.primaryText}>I backed this up</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, Icon, accent }: { label: string; value: string; Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; accent: string }) {
  return <View style={styles.stat}><Icon color={accent} size={15} strokeWidth={2.8} /><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function SecretBlock({ label, value, onCopy }: { label: string; value: string; onCopy: (title: string, value: string) => Promise<void> }) {
  return <View style={styles.secretBlock}><Text style={styles.label}>{label}</Text><Text style={styles.secretText}>{value}</Text><Pressable onPress={() => onCopy(label, value)} style={styles.secondaryBtnFull}><Copy color={Colors.text} size={15} /><Text style={styles.secondaryText}>Copy {label}</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 60 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  headerMid: { flex: 1 },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  hero: { marginTop: 16, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: "rgba(85,245,178,0.22)" },
  heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: "rgba(85,245,178,0.12)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 14, letterSpacing: -0.4 },
  heroText: { color: Colors.muted, fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 8 },
  warnCard: { marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: "rgba(255,93,143,0.10)", borderWidth: 1, borderColor: "rgba(255,93,143,0.28)" },
  warnTitle: { color: Colors.rose, fontWeight: "900", fontSize: 14 },
  warnText: { color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "600", marginTop: 6 },
  statRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  statValue: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 8 },
  statLabel: { color: Colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  segmentRow: { flexDirection: "row", gap: 8, marginTop: 18, padding: 4, borderRadius: 999, backgroundColor: Colors.card },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  segmentActive: { backgroundColor: Colors.mint },
  segmentText: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  segmentTextActive: { color: Colors.ink },
  card: { marginTop: 14, padding: 14, borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  bodyText: { color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "600", marginTop: 7 },
  label: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.9, marginTop: 12 },
  input: { marginTop: 8, backgroundColor: Colors.cardSoft, color: Colors.text, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", fontWeight: "700", minHeight: 46 },
  inputWithAction: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  flexInput: { flex: 1, minHeight: 92 },
  smallIconBtn: { marginTop: 8, width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.cardSoft, alignItems: "center", justifyContent: "center" },
  primaryBtn: { marginTop: 14, minHeight: 46, borderRadius: 14, backgroundColor: Colors.mint, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  primaryText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },
  secondaryBtn: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  secondaryBtnFull: { marginTop: 12, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  secondaryText: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  walletPicker: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  walletChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.cardSoft },
  walletChipActive: { backgroundColor: Colors.mint },
  walletChipText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  walletChipTextActive: { color: Colors.ink },
  mutedText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  swapBox: { marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: Colors.cardSoft, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  swapLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  swapLabel: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  tokenPill: { color: Colors.ink, backgroundColor: Colors.mint, overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 11, fontWeight: "900" },
  amountInput: { color: Colors.text, fontSize: 32, fontWeight: "900", paddingVertical: 6 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 12 },
  outText: { color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 8 },
  slipRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  slipChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.cardSoft },
  slipChipActive: { backgroundColor: Colors.orange },
  slipText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  slipTextActive: { color: Colors.ink },
  quoteMeta: { color: Colors.mint, fontSize: 11, fontWeight: "800", marginTop: 10 },
  errorText: { color: Colors.rose, fontSize: 12, fontWeight: "800", marginTop: 10 },
  statusText: { color: Colors.violet, fontSize: 12, fontWeight: "800", marginTop: 10 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  flexBtn: { flex: 1 },
  phantomBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(184,140,255,0.12)" },
  phantomText: { color: Colors.violet, fontSize: 11, fontWeight: "900" },
  emptyText: { color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "600", marginTop: 10 },
  walletRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  walletIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  walletMid: { flex: 1, minWidth: 0 },
  walletTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  walletSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  rowBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  tradeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  tradeIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: Colors.cardSoft, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.68)" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  secretBlock: { marginTop: 10 },
  secretText: { color: Colors.text, backgroundColor: Colors.cardSoft, borderRadius: 14, padding: 12, marginTop: 8, fontSize: 12, lineHeight: 18, fontWeight: "700" },
});
