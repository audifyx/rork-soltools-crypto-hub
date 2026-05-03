import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getTokens, buildSwapOrder, getQuote, type JupiterQuote, type JupiterToken } from "@/lib/api/jupiter";
import { SOL_MINT, USDC_MINT } from "@/lib/api/market";
import { base64ToBytes } from "@/lib/encoding";
import { supabase } from "@/lib/supabase";
import {
  buildPhantomConnectUrl,
  buildPhantomSignAndSendUrl,
  confirmSignature,
  createFreshSolanaWallet,
  createPhantomDappKeypair,
  deleteLocalWalletSecret,
  deletePhantomConnection,
  importSolanaWalletSecret,
  parsePhantomConnectUrl,
  parsePhantomSignatureUrl,
  readLocalWalletSecret,
  readPhantomConnection,
  saveLocalWalletSecret,
  savePhantomConnection,
  signAndSendLocalSwap,
} from "@/lib/solana-wallet";
import { SOLTOOLS_TRADING_DISABLED_MESSAGE, isSolToolsTradingEnabled } from "@/lib/soltools-platform";
import { useAuth } from "@/providers/auth-provider";

export type TradingWalletType = "local" | "phantom";
export type WalletTradeStatus = "pending" | "confirmed" | "failed";

export interface TradingWallet {
  id: string;
  address: string;
  label: string;
  type: TradingWalletType;
  isBackedUp: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export interface WalletTrade {
  id: string;
  walletId: string | null;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  inputSymbol?: string;
  outputSymbol?: string;
  inAmountRaw: string;
  outAmountRaw: string;
  slippageBps: number;
  priceImpactPct?: number;
  signature?: string;
  status: WalletTradeStatus;
  errorMessage?: string;
  createdAt: number;
}

export interface WalletExportPayload {
  address: string;
  mnemonic?: string;
  privateKeyBase58: string;
}

export interface SwapRequest {
  walletId: string;
  inputToken: JupiterToken;
  outputToken: JupiterToken;
  amountUi: string;
  slippageBps: number;
}

const DEFAULT_SOL_TOKEN: JupiterToken = {
  address: SOL_MINT,
  decimals: 9,
  name: "Solana",
  symbol: "SOL",
};

const DEFAULT_USDC_TOKEN: JupiterToken = {
  address: USDC_MINT,
  decimals: 6,
  name: "USD Coin",
  symbol: "USDC",
};

function toWallet(row: Record<string, unknown>): TradingWallet {
  return {
    id: row.id as string,
    address: (row.wallet_address as string) ?? "",
    label: (row.label as string) ?? "Trading wallet",
    type: ((row.wallet_type as string) === "phantom" ? "phantom" : "local") as TradingWalletType,
    isBackedUp: Boolean(row.is_backed_up),
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string).getTime() : undefined,
  };
}

function toTrade(row: Record<string, unknown>): WalletTrade {
  return {
    id: row.id as string,
    walletId: (row.wallet_id as string | null) ?? null,
    walletAddress: (row.wallet_address as string) ?? "",
    inputMint: (row.input_mint as string) ?? "",
    outputMint: (row.output_mint as string) ?? "",
    inputSymbol: (row.input_symbol as string | null) ?? undefined,
    outputSymbol: (row.output_symbol as string | null) ?? undefined,
    inAmountRaw: String(row.in_amount_raw ?? "0"),
    outAmountRaw: String(row.out_amount_raw ?? "0"),
    slippageBps: Number(row.slippage_bps ?? 100),
    priceImpactPct: row.price_impact_pct == null ? undefined : Number(row.price_impact_pct),
    signature: (row.signature as string | null) ?? undefined,
    status: ((row.status as string) ?? "pending") as WalletTradeStatus,
    errorMessage: (row.error_message as string | null) ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
  };
}

function amountToRaw(amountUi: string, decimals: number): string {
  const clean = amountUi.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(clean) || clean === "" || clean === ".") {
    throw new Error("Enter a valid amount.");
  }
  const [wholeRaw, fracRaw = ""] = clean.split(".");
  const whole = wholeRaw || "0";
  const frac = fracRaw.slice(0, decimals).padEnd(decimals, "0");
  const joined = `${whole}${frac}`.replace(/^0+(?=\d)/, "");
  return joined || "0";
}

function safeRouteSummary(quote: JupiterQuote): unknown[] {
  return Array.isArray(quote.routePlan) ? quote.routePlan.slice(0, 8) : [];
}

function assertTradingEnabled(): void {
  if (!isSolToolsTradingEnabled()) {
    throw new Error(SOLTOOLS_TRADING_DISABLED_MESSAGE);
  }
}

export const [TradingWalletProvider, useTradingWallets] = createContextHook(() => {
  const qc = useQueryClient();
  const { userId, isAuthenticated } = useAuth();
  const [phantomStatus, setPhantomStatus] = useState<string>("");
  const pendingPhantomSecretRef = useRef<string | null>(null);
  const pendingTradeRef = useRef<{
    connectionPublicKey: string;
    resolve: (signature: string) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const walletsQ = useQuery<TradingWallet[]>({
    queryKey: ["trading-wallets", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trading_wallets")
        .select("id,wallet_address,label,wallet_type,is_backed_up,last_used_at,created_at")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => toWallet(row as Record<string, unknown>));
    },
    staleTime: 20_000,
  });

  const tradesQ = useQuery<WalletTrade[]>({
    queryKey: ["wallet-trades", userId ?? "guest"],
    enabled: isAuthenticated && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_trades")
        .select("id,wallet_id,wallet_address,input_mint,output_mint,input_symbol,output_symbol,in_amount_raw,out_amount_raw,slippage_bps,price_impact_pct,signature,status,error_message,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []).map((row) => toTrade(row as Record<string, unknown>));
    },
    staleTime: 15_000,
  });

  const wallets = walletsQ.data ?? [];
  const trades = tradesQ.data ?? [];

  const recordEvent = useCallback(
    async (event: {
      walletId?: string | null;
      walletAddress?: string;
      type: "created" | "imported" | "exported" | "deleted" | "phantom_connected" | "trade_signed";
      metadata?: Record<string, unknown>;
    }) => {
      if (!userId) return;
      try {
        await supabase.from("wallet_security_events").insert({
          user_id: userId,
          wallet_id: event.walletId ?? null,
          wallet_address: event.walletAddress ?? null,
          event_type: event.type,
          client_event_id: Crypto.randomUUID(),
          metadata: event.metadata ?? {},
        });
      } catch (e) {
        console.log("[trading-wallet] event sync failed", e);
      }
    },
    [userId],
  );

  const createWallet = useMutation({
    mutationFn: async (label?: string) => {
      assertTradingEnabled();
      if (!userId) throw new Error("Sign in before creating a trading wallet.");
      const walletId = Crypto.randomUUID();
      const secret = createFreshSolanaWallet();
      await saveLocalWalletSecret(userId, walletId, secret);
      const cleanLabel = label?.trim() || "Fresh Solana wallet";
      const { error } = await supabase.from("trading_wallets").insert({
        id: walletId,
        user_id: userId,
        wallet_address: secret.address,
        label: cleanLabel,
        wallet_type: "local",
        secret_storage: "device_secure_store",
        is_backed_up: false,
      });
      if (error) {
        await deleteLocalWalletSecret(userId, walletId);
        throw error;
      }
      await recordEvent({ walletId, walletAddress: secret.address, type: "created" });
      return {
        id: walletId,
        address: secret.address,
        label: cleanLabel,
        type: "local",
        isBackedUp: false,
        createdAt: Date.now(),
      } as TradingWallet;
    },
    onSuccess: (wallet) => {
      qc.setQueryData<TradingWallet[]>(["trading-wallets", userId ?? "guest"], (prev) => [wallet, ...(prev ?? [])]);
    },
  });

  const importWallet = useMutation({
    mutationFn: async (input: { secret: string; label?: string }) => {
      assertTradingEnabled();
      if (!userId) throw new Error("Sign in before importing a trading wallet.");
      const walletId = Crypto.randomUUID();
      const secret = importSolanaWalletSecret(input.secret);
      await saveLocalWalletSecret(userId, walletId, secret);
      const cleanLabel = input.label?.trim() || "Imported wallet";
      const { error } = await supabase.from("trading_wallets").insert({
        id: walletId,
        user_id: userId,
        wallet_address: secret.address,
        label: cleanLabel,
        wallet_type: "local",
        secret_storage: "device_secure_store",
        is_backed_up: false,
      });
      if (error) {
        await deleteLocalWalletSecret(userId, walletId);
        throw error;
      }
      await recordEvent({ walletId, walletAddress: secret.address, type: "imported" });
      return {
        id: walletId,
        address: secret.address,
        label: cleanLabel,
        type: "local",
        isBackedUp: false,
        createdAt: Date.now(),
      } as TradingWallet;
    },
    onSuccess: (wallet) => {
      qc.setQueryData<TradingWallet[]>(["trading-wallets", userId ?? "guest"], (prev) => [wallet, ...(prev ?? [])]);
    },
  });

  const exportWallet = useCallback(
    async (walletId: string): Promise<WalletExportPayload> => {
      assertTradingEnabled();
      if (!userId) throw new Error("Sign in to export this wallet.");
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet || wallet.type !== "local") throw new Error("Only locally created/imported wallets can be exported here.");
      const secret = await readLocalWalletSecret(userId, walletId);
      if (!secret) throw new Error("Private key not found on this device.");
      await recordEvent({ walletId, walletAddress: wallet.address, type: "exported" });
      return { address: wallet.address, mnemonic: secret.mnemonic, privateKeyBase58: secret.secretKeyBase58 };
    },
    [recordEvent, userId, wallets],
  );

  const markWalletBackedUp = useCallback(
    async (walletId: string) => {
      if (!userId) return;
      await supabase.from("trading_wallets").update({ is_backed_up: true }).eq("id", walletId).eq("user_id", userId);
      qc.setQueryData<TradingWallet[]>(["trading-wallets", userId], (prev) =>
        (prev ?? []).map((w) => (w.id === walletId ? { ...w, isBackedUp: true } : w)),
      );
    },
    [qc, userId],
  );

  const deleteWallet = useCallback(
    async (walletId: string) => {
      if (!userId) throw new Error("Sign in to remove this wallet.");
      const wallet = wallets.find((w) => w.id === walletId);
      if (wallet?.type === "local") await deleteLocalWalletSecret(userId, walletId);
      if (wallet?.type === "phantom") await deletePhantomConnection(userId);
      await supabase.from("trading_wallets").delete().eq("id", walletId).eq("user_id", userId);
      await recordEvent({ walletId, walletAddress: wallet?.address, type: "deleted" });
      qc.setQueryData<TradingWallet[]>(["trading-wallets", userId], (prev) => (prev ?? []).filter((w) => w.id !== walletId));
    },
    [qc, recordEvent, userId, wallets],
  );

  const connectPhantom = useCallback(async () => {
    assertTradingEnabled();
    if (!userId) throw new Error("Sign in before connecting Phantom.");
    const pair = createPhantomDappKeypair();
    pendingPhantomSecretRef.current = pair.secretKeyBase58;
    setPhantomStatus("Opening Phantom…");
    const url = buildPhantomConnectUrl(pair.publicKeyBase58);
    const canOpen = await Linking.canOpenURL(url).catch(() => true);
    if (!canOpen) throw new Error("Phantom is not available on this device.");
    await Linking.openURL(url);
  }, [userId]);

  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (!userId) return;
      try {
        if (url.includes("wallet/phantom-connect")) {
          const secret = pendingPhantomSecretRef.current;
          if (!secret) throw new Error("Phantom connection expired. Try connect again.");
          const connection = parsePhantomConnectUrl(url, secret);
          await savePhantomConnection(userId, connection);
          const label = "Phantom wallet";
          const existing = await supabase
            .from("trading_wallets")
            .select("id")
            .eq("user_id", userId)
            .eq("wallet_address", connection.publicKey)
            .eq("wallet_type", "phantom")
            .is("revoked_at", null)
            .maybeSingle();
          const walletId = (existing.data?.id as string | undefined) ?? Crypto.randomUUID();
          const write = existing.data
            ? await supabase
                .from("trading_wallets")
                .update({
                  label,
                  secret_storage: "phantom_external",
                  is_backed_up: true,
                  last_used_at: new Date().toISOString(),
                })
                .eq("id", walletId)
                .eq("user_id", userId)
                .select("id,wallet_address,label,wallet_type,is_backed_up,last_used_at,created_at")
                .single()
            : await supabase
                .from("trading_wallets")
                .insert({
                  id: walletId,
                  user_id: userId,
                  wallet_address: connection.publicKey,
                  label,
                  wallet_type: "phantom",
                  secret_storage: "phantom_external",
                  is_backed_up: true,
                  last_used_at: new Date().toISOString(),
                })
                .select("id,wallet_address,label,wallet_type,is_backed_up,last_used_at,created_at")
                .single();
          if (write.error) throw write.error;
          const wallet = toWallet(write.data as Record<string, unknown>);
          await recordEvent({ walletId: wallet.id, walletAddress: wallet.address, type: "phantom_connected" });
          qc.setQueryData<TradingWallet[]>(["trading-wallets", userId], (prev) => {
            const rest = (prev ?? []).filter((w) => !(w.type === "phantom" && w.address === wallet.address));
            return [wallet, ...rest];
          });
          pendingPhantomSecretRef.current = null;
          setPhantomStatus("Phantom connected");
        }
        if (url.includes("wallet/phantom-trade")) {
          const pending = pendingTradeRef.current;
          const connection = await readPhantomConnection(userId);
          if (!pending || !connection) throw new Error("No Phantom trade is waiting for approval.");
          const signature = parsePhantomSignatureUrl(url, connection);
          pending.resolve(signature);
          pendingTradeRef.current = null;
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error("Wallet callback failed.");
        setPhantomStatus(err.message);
        pendingTradeRef.current?.reject(err);
        pendingTradeRef.current = null;
        console.log("[trading-wallet] deeplink error", err.message);
      }
    };
    const sub = Linking.addEventListener("url", handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url }).catch(() => {});
    }).catch(() => {});
    return () => sub.remove();
  }, [qc, recordEvent, userId]);

  const phantomSignAndSend = useCallback(
    async (transactionBytes: Uint8Array): Promise<string> => {
      assertTradingEnabled();
      if (!userId) throw new Error("Sign in before trading with Phantom.");
      const connection = await readPhantomConnection(userId);
      if (!connection) throw new Error("Connect Phantom first.");
      const url = buildPhantomSignAndSendUrl(connection, transactionBytes);
      setPhantomStatus("Approve the trade in Phantom…");
      return new Promise<string>((resolve, reject) => {
        pendingTradeRef.current = { connectionPublicKey: connection.publicKey, resolve, reject };
        Linking.openURL(url).catch((e) => {
          pendingTradeRef.current = null;
          reject(e instanceof Error ? e : new Error("Could not open Phantom."));
        });
      });
    },
    [userId],
  );

  const previewQuote = useCallback(async (input: SwapRequest): Promise<JupiterQuote> => {
    assertTradingEnabled();
    const amountRaw = amountToRaw(input.amountUi, input.inputToken.decimals);
    if (amountRaw === "0") throw new Error("Enter an amount greater than 0.");
    return getQuote({
      inputMint: input.inputToken.address,
      outputMint: input.outputToken.address,
      amount: amountRaw,
      slippageBps: input.slippageBps,
    });
  }, []);

  const executeSwap = useMutation({
    mutationFn: async (input: SwapRequest) => {
      assertTradingEnabled();
      if (!userId) throw new Error("Sign in before trading.");
      const wallet = wallets.find((w) => w.id === input.walletId);
      if (!wallet) throw new Error("Select a trading wallet.");
      const amountRaw = amountToRaw(input.amountUi, input.inputToken.decimals);
      if (amountRaw === "0") throw new Error("Enter an amount greater than 0.");
      const quote = await getQuote({
        inputMint: input.inputToken.address,
        outputMint: input.outputToken.address,
        amount: amountRaw,
        slippageBps: input.slippageBps,
      });
      const { data: inserted, error: insertError } = await supabase
        .from("wallet_trades")
        .insert({
          user_id: userId,
          wallet_id: wallet.id,
          wallet_address: wallet.address,
          input_mint: input.inputToken.address,
          output_mint: input.outputToken.address,
          input_symbol: input.inputToken.symbol,
          output_symbol: input.outputToken.symbol,
          in_amount_raw: quote.inAmount,
          out_amount_raw: quote.outAmount,
          slippage_bps: input.slippageBps,
          price_impact_pct: Number(quote.priceImpactPct ?? 0),
          route_summary: safeRouteSummary(quote),
          quote_snapshot: quote as unknown as Record<string, unknown>,
          status: "pending",
        })
        .select("id,wallet_id,wallet_address,input_mint,output_mint,input_symbol,output_symbol,in_amount_raw,out_amount_raw,slippage_bps,price_impact_pct,signature,status,error_message,created_at")
        .single();
      if (insertError) throw insertError;
      const tradeId = (inserted?.id as string) ?? "";
      try {
        const order = await buildSwapOrder({ quote, userPublicKey: wallet.address, wrapAndUnwrapSol: true });
        const signature = wallet.type === "local"
          ? await signAndSendLocalSwap({ userId, walletId: wallet.id, swapTransactionBase64: order.swapTransaction })
          : await phantomSignAndSend(base64ToBytes(order.swapTransaction));
        const confirmed = await confirmSignature(signature);
        const status: WalletTradeStatus = confirmed ? "confirmed" : "pending";
        const { data: updated, error: updateError } = await supabase
          .from("wallet_trades")
          .update({
            signature,
            status,
            confirmed_at: confirmed ? new Date().toISOString() : null,
          })
          .eq("id", tradeId)
          .eq("user_id", userId)
          .select("id,wallet_id,wallet_address,input_mint,output_mint,input_symbol,output_symbol,in_amount_raw,out_amount_raw,slippage_bps,price_impact_pct,signature,status,error_message,created_at")
          .single();
        if (updateError) throw updateError;
        await supabase.from("trading_wallets").update({ last_used_at: new Date().toISOString() }).eq("id", wallet.id).eq("user_id", userId);
        await recordEvent({ walletId: wallet.id, walletAddress: wallet.address, type: "trade_signed", metadata: { signature, status } });
        return toTrade(updated as Record<string, unknown>);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Trade failed.";
        await supabase.from("wallet_trades").update({ status: "failed", error_message: message }).eq("id", tradeId).eq("user_id", userId);
        throw new Error(message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallet-trades", userId ?? "guest"] });
      qc.invalidateQueries({ queryKey: ["trading-wallets", userId ?? "guest"] });
      qc.invalidateQueries({ queryKey: ["app", "profile", userId ?? "guest"] });
    },
  });

  const searchTokens = useCallback(async (query: string): Promise<JupiterToken[]> => {
    const rows = await getTokens(query);
    return rows.length > 0 ? rows : [DEFAULT_SOL_TOKEN, DEFAULT_USDC_TOKEN];
  }, []);

  return useMemo(
    () => ({
      wallets,
      trades,
      defaultInputToken: DEFAULT_SOL_TOKEN,
      defaultOutputToken: DEFAULT_USDC_TOKEN,
      isLoadingWallets: walletsQ.isLoading,
      isLoadingTrades: tradesQ.isLoading,
      createWallet: createWallet.mutateAsync,
      isCreatingWallet: createWallet.isPending,
      importWallet: importWallet.mutateAsync,
      isImportingWallet: importWallet.isPending,
      exportWallet,
      markWalletBackedUp,
      deleteWallet,
      connectPhantom,
      phantomStatus,
      previewQuote,
      executeSwap: executeSwap.mutateAsync,
      isSwapping: executeSwap.isPending,
      swapError: executeSwap.error as Error | null,
      searchTokens,
    }),
    [
      wallets,
      trades,
      walletsQ.isLoading,
      tradesQ.isLoading,
      createWallet.mutateAsync,
      createWallet.isPending,
      importWallet.mutateAsync,
      importWallet.isPending,
      exportWallet,
      markWalletBackedUp,
      deleteWallet,
      connectPhantom,
      phantomStatus,
      previewQuote,
      executeSwap.mutateAsync,
      executeSwap.isPending,
      executeSwap.error,
      searchTokens,
    ],
  );
});
