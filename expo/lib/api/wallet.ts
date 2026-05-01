import { supabase } from "@/lib/supabase";

export interface WalletBalance {
  sol: number;
  usd: number;
  tokens?: WalletTokenHolding[];
}

export interface WalletTokenHolding {
  mint: string;
  symbol?: string;
  name?: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  usdValue?: number;
  logo?: string;
}

export interface WalletTransaction {
  signature: string;
  blockTime: number;
  type?: string;
  description?: string;
  fee?: number;
  status?: "success" | "failed";
}

type WalletAction =
  | "get_balance"
  | "get_tokens"
  | "get_transactions"
  | "get_portfolio";

interface InvokeOptions {
  action: WalletAction;
  wallet_address: string;
  limit?: number;
}

async function invokeWalletManager<T>(opts: InvokeOptions): Promise<T> {
  const { data, error } = await supabase.functions.invoke("wallet-manager", {
    body: opts,
  });
  if (error) {
    console.log("[wallet-manager]", opts.action, "error", error.message);
    throw new Error(error.message);
  }
  return data as T;
}

export async function fetchWalletBalance(address: string): Promise<WalletBalance> {
  try {
    const data = await invokeWalletManager<WalletBalance>({
      action: "get_balance",
      wallet_address: address,
    });
    return {
      sol: Number(data?.sol ?? 0),
      usd: Number(data?.usd ?? 0),
      tokens: data?.tokens,
    };
  } catch (e) {
    console.log("[wallet] fetchWalletBalance fallback", e);
    return { sol: 0, usd: 0 };
  }
}

export async function fetchWalletTokens(
  address: string,
): Promise<WalletTokenHolding[]> {
  try {
    const data = await invokeWalletManager<{ tokens?: WalletTokenHolding[] }>({
      action: "get_tokens",
      wallet_address: address,
    });
    return data?.tokens ?? [];
  } catch (e) {
    console.log("[wallet] fetchWalletTokens fallback", e);
    return [];
  }
}

export async function fetchWalletTransactions(
  address: string,
  limit: number = 20,
): Promise<WalletTransaction[]> {
  try {
    const data = await invokeWalletManager<{
      transactions?: WalletTransaction[];
    }>({
      action: "get_transactions",
      wallet_address: address,
      limit,
    });
    return data?.transactions ?? [];
  } catch (e) {
    console.log("[wallet] fetchWalletTransactions fallback", e);
    return [];
  }
}

export async function fetchWalletPortfolio(address: string): Promise<{
  balance: WalletBalance;
  tokens: WalletTokenHolding[];
  transactions: WalletTransaction[];
}> {
  try {
    const data = await invokeWalletManager<{
      balance?: WalletBalance;
      tokens?: WalletTokenHolding[];
      transactions?: WalletTransaction[];
    }>({
      action: "get_portfolio",
      wallet_address: address,
    });
    return {
      balance: data?.balance ?? { sol: 0, usd: 0 },
      tokens: data?.tokens ?? [],
      transactions: data?.transactions ?? [],
    };
  } catch (e) {
    console.log("[wallet] fetchWalletPortfolio fallback", e);
    return { balance: { sol: 0, usd: 0 }, tokens: [], transactions: [] };
  }
}
