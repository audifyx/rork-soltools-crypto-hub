import { supabase } from "@/lib/supabase";

export type CreditToolAction =
  | "tokenScan"
  | "walletAnalysis"
  | "devWalletAnalysis"
  | "narrativeScan"
  | "whaleTracking"
  | "deepScan"
  | "aiNarrativeReport";

export interface CreditBalance {
  balance: number;
  monthlyCap: number;
  resetAt: string | null;
}

export interface CreditLogEntry {
  id: string;
  action: CreditToolAction | string;
  toolId: string;
  target: string | null;
  cost: number;
  balanceAfter: number;
  createdAt: string;
}

export const TOOL_CREDIT_COSTS: Record<CreditToolAction, number> = {
  tokenScan: 5,
  walletAnalysis: 25,
  devWalletAnalysis: 50,
  narrativeScan: 20,
  whaleTracking: 15,
  deepScan: 100,
  aiNarrativeReport: 150,
};

interface RpcCreditBalanceRow {
  balance?: number;
  monthly_cap?: number;
  reset_at?: string | null;
}

interface RpcConsumeResult {
  ok?: boolean;
  balance?: number;
  cost?: number;
  error?: string;
}

interface CreditLogRow {
  id?: string;
  action?: string;
  tool_id?: string;
  target?: string | null;
  cost?: number;
  balance_after?: number;
  created_at?: string;
}

export function creditActionForTool(toolId: string, kind?: "contract" | "wallet" | "stream"): CreditToolAction {
  if (toolId.includes("dev") || toolId.includes("creator")) return "devWalletAnalysis";
  if (toolId.includes("whale") || toolId.includes("radar")) return "whaleTracking";
  if (toolId.includes("ai") || toolId.includes("report")) return "aiNarrativeReport";
  if (toolId.includes("narrative") || toolId.includes("alpha")) return "narrativeScan";
  if (kind === "wallet" || toolId.includes("wallet") || toolId.includes("pnl") || toolId.includes("profit")) return "walletAnalysis";
  if (toolId.includes("deep") || toolId.includes("risk") || toolId.includes("rug") || toolId.includes("insider")) return "deepScan";
  return "tokenScan";
}

export async function fetchCreditBalance(): Promise<CreditBalance> {
  const { data, error } = await supabase.rpc("get_credit_balance");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as RpcCreditBalanceRow | null;
  return {
    balance: Number(row?.balance ?? 0),
    monthlyCap: Number(row?.monthly_cap ?? 10000),
    resetAt: row?.reset_at ?? null,
  };
}

export async function fetchCreditLogs(limit = 8): Promise<CreditLogEntry[]> {
  const { data, error } = await supabase
    .from("credit_logs")
    .select("id, action, tool_id, target, cost, balance_after, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as CreditLogRow[]).map((row) => ({
    id: row.id ?? `${row.tool_id ?? "tool"}-${row.created_at ?? Date.now()}`,
    action: row.action ?? "tokenScan",
    toolId: row.tool_id ?? "unknown",
    target: row.target ?? null,
    cost: Number(row.cost ?? 0),
    balanceAfter: Number(row.balance_after ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
  }));
}

export async function consumeCredits(input: {
  action: CreditToolAction;
  toolId: string;
  target?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ balance: number; cost: number }> {
  const { data, error } = await supabase.rpc("consume_tool_credits", {
    p_action: input.action,
    p_tool_id: input.toolId,
    p_target: input.target ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw error;
  const result = data as RpcConsumeResult | null;
  if (!result?.ok) throw new Error(result?.error ?? "Not enough credits.");
  return { balance: Number(result.balance ?? 0), cost: Number(result.cost ?? TOOL_CREDIT_COSTS[input.action]) };
}
