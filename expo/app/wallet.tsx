import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  Sparkles,
  Wallet as WalletIcon,
  X,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppBackground from "@/components/ui/AppBackground";
import WalletTracker from "@/components/WalletTracker";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import {
  addUserWallet,
  type Blockchain,
  getPortfolioStats,
  type UserWalletWithBalance,
} from "@/lib/api/crypto-news";
import { useAuth } from "@/providers/auth-provider";

const BLOCKCHAINS: { key: Blockchain; label: string }[] = [
  { key: "solana", label: "Solana" },
  { key: "ethereum", label: "Ethereum" },
  { key: "base", label: "Base" },
  { key: "bitcoin", label: "Bitcoin" },
];

export default function WalletScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [showAdd, setShowAdd] = useState<boolean>(false);

  const portfolioQ = useQuery({
    queryKey: ["portfolio", "stats"],
    enabled: isAuthenticated,
    queryFn: () => getPortfolioStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const onAddWallet = useCallback(() => {
    if (!isAuthenticated) {
      router.push("/auth?mode=signin");
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setShowAdd(true);
  }, [isAuthenticated, router]);

  const onSelectWallet = useCallback(
    (w: UserWalletWithBalance) => {
      Haptics.selectionAsync().catch(() => {});
      router.push({ pathname: "/u/[handle]", params: { handle: w.address } } as never);
    },
    [router],
  );

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    portfolioQ.refetch();
  }, [portfolioQ]);

  return (
    <View style={styles.root}>
      <AppBackground variant="wallet" />
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={portfolioQ.isRefetching}
              onRefresh={onRefresh}
              tintColor={Colors.mint}
              colors={[Colors.mint]}
            />
          }
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => navigateBack(router, "/(tabs)/home")}
              style={styles.iconBtn}
              hitSlop={8}
              testID="wallet-back"
            >
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.8} />
            </Pressable>
            <View style={styles.headerMid}>
              <Text style={styles.eyebrow}>PORTFOLIO TRACKER</Text>
              <Text style={styles.title}>Your wallets</Text>
            </View>
            <View style={styles.iconBtn}>
              <ShieldCheck color={Colors.mint} size={18} strokeWidth={2.8} />
            </View>
          </View>

          {!isAuthenticated ? (
            <SignInPrompt onPress={() => router.push("/auth?mode=signin")} />
          ) : portfolioQ.isLoading && !portfolioQ.data ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.mint} />
              <Text style={styles.loadingText}>Loading balances…</Text>
            </View>
          ) : (
            <WalletTracker
              stats={portfolioQ.data}
              loading={portfolioQ.isLoading}
              onAddWallet={onAddWallet}
              onSelectWallet={onSelectWallet}
            />
          )}

          <View style={styles.disclaimer}>
            <Sparkles color={Colors.mint} size={13} strokeWidth={3} />
            <Text style={styles.disclaimerText}>
              Read-only tracking only — no signing, no spending. Add Solana wallets to view balances live; ETH / Base / BTC tracking unlocks as providers come online.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <AddWalletModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => {
          qc.invalidateQueries({ queryKey: ["portfolio", "stats"] });
        }}
      />
    </View>
  );
}

function SignInPrompt({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.signinCard}>
      <View style={styles.signinIcon}>
        <WalletIcon color={Colors.mint} size={20} strokeWidth={2.6} />
      </View>
      <Text style={styles.signinTitle}>Sign in to track wallets</Text>
      <Text style={styles.signinBody}>
        Save unlimited Solana addresses, monitor live balances, and track P&amp;L across every wallet you watch.
      </Text>
      <Pressable onPress={onPress} style={styles.signinBtn} testID="wallet-signin">
        <Text style={styles.signinBtnText}>Sign in</Text>
      </Pressable>
    </View>
  );
}

function AddWalletModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [blockchain, setBlockchain] = useState<Blockchain>("solana");
  const [address, setAddress] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setBlockchain("solana");
    setAddress("");
    setLabel("");
    setError(null);
  }, []);

  const close = useCallback(() => {
    onClose();
    setTimeout(reset, 180);
  }, [onClose, reset]);

  const addMutation = useMutation({
    mutationFn: () => addUserWallet({ blockchain, address, label: label || undefined }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onAdded();
      close();
    },
    onError: (e: unknown) => {
      console.log("[wallet] add failed", e);
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
          ? e
          : "Could not add wallet";
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    },
  });

  const onSubmit = useCallback(() => {
    setError(null);
    if (!address.trim()) {
      setError("Wallet address is required");
      return;
    }
    addMutation.mutate();
  }, [address, addMutation]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.modalBackdrop} onPress={close} testID="add-wallet-backdrop" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalWrap}
        pointerEvents="box-none"
      >
        <SafeAreaView edges={["bottom"]} pointerEvents="box-none">
          <View style={styles.modalSheet}>
            <LinearGradient
              colors={["rgba(244,198,91,0.10)", "rgba(0,0,0,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.eyebrow}>NEW WALLET</Text>
                <Text style={styles.modalTitle}>Track an address</Text>
              </View>
              <Pressable onPress={close} hitSlop={10} style={styles.iconBtn} testID="add-wallet-close">
                <X color={Colors.text} size={16} strokeWidth={2.8} />
              </Pressable>
            </View>

            <Text style={styles.label}>Blockchain</Text>
            <View style={styles.chainRow}>
              {BLOCKCHAINS.map((b) => {
                const active = blockchain === b.key;
                return (
                  <Pressable
                    key={b.key}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setBlockchain(b.key);
                    }}
                    style={[styles.chainChip, active && styles.chainChipActive]}
                    testID={`chain-${b.key}`}
                  >
                    <Text style={[styles.chainText, active && styles.chainTextActive]}>{b.label}</Text>
                    {active ? <Check color={Colors.ink} size={12} strokeWidth={3} /> : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Wallet address</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder={
                blockchain === "solana"
                  ? "Paste Solana address"
                  : blockchain === "bitcoin"
                  ? "Paste BTC address"
                  : "Paste 0x… address"
              }
              placeholderTextColor={Colors.muted2}
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
              testID="wallet-address-input"
            />

            <Text style={styles.label}>Label (optional)</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Whale 1, Cold storage"
              placeholderTextColor={Colors.muted2}
              style={styles.input}
              testID="wallet-label-input"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={onSubmit}
              disabled={addMutation.isPending}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.92 },
                addMutation.isPending && { opacity: 0.7 },
              ]}
              testID="wallet-submit"
            >
              {addMutation.isPending ? (
                <ActivityIndicator color={Colors.ink} />
              ) : (
                <Text style={styles.primaryBtnText}>Track wallet</Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 80, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerMid: { flex: 1 },
  eyebrow: { color: Colors.mint, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: Colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  loading: { padding: 30, alignItems: "center", gap: 10 },
  loadingText: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  disclaimer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.20)",
    backgroundColor: "rgba(216,183,90,0.06)",
    alignItems: "flex-start",
  },
  disclaimerText: { flex: 1, color: Colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  signinCard: {
    padding: 22,
    borderRadius: 22,
    backgroundColor: "rgba(16,16,14,0.84)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.18)",
    alignItems: "center",
    gap: 10,
  },
  signinIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(216,183,90,0.14)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  signinTitle: { color: Colors.text, fontSize: 17, fontWeight: "900" },
  signinBody: { color: Colors.muted, fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  signinBtn: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 22,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  signinBtnText: { color: Colors.ink, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  modalSheet: {
    margin: 12,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(10,10,8,0.98)",
    borderWidth: 1,
    borderColor: "rgba(216,183,90,0.22)",
    overflow: "hidden",
    gap: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6, marginTop: 2 },
  label: { color: Colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: 8 },
  chainRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chainChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chainChipActive: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  chainText: { color: Colors.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  chainTextActive: { color: Colors.ink },
  input: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 14,
    backgroundColor: "rgba(16,16,14,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  error: { color: Colors.rose, fontSize: 12, fontWeight: "700", marginTop: 4 },
  primaryBtn: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
});
