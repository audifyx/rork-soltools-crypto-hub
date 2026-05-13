import { rpcCall } from "@/lib/api/jupiter";
import { isValidSolanaAddress } from "@/lib/api/wallet";
import { SOLTOOLS_TOKEN_MINT } from "@/lib/badge-system";

/**
 * Helius / RPC scan result for a holder-only gate check.
 */
export interface HolderVerifyResult {
  ok: boolean;
  balance: number;
  required: number;
  mint: string;
  reason?: string;
}

interface RpcTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: {
            amount: string;
            decimals: number;
            uiAmount: number | null;
          };
        };
      };
    };
  };
}

interface RpcTokenAccountsResponse {
  value: RpcTokenAccount[];
}

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

async function scanBalance(
  owner: string,
  mint: string,
  programId: string,
): Promise<number> {
  try {
    const res = await rpcCall<RpcTokenAccountsResponse>(
      "getTokenAccountsByOwner",
      [owner, { mint }, { encoding: "jsonParsed", programId }],
    );
    const accounts = res?.value ?? [];
    return accounts.reduce((sum, a) => {
      const ui = Number(a.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0);
      return sum + (Number.isFinite(ui) ? ui : 0);
    }, 0);
  } catch (e) {
    console.log("[holder-verify] rpc error", programId, e instanceof Error ? e.message : e);
    return 0;
  }
}

/**
 * Scans a wallet using Helius-compatible RPC and returns whether it holds
 * at least `required` of `mint`. Tries both SPL Token and Token-2022 programs.
 */
export async function verifyHolder(
  rawAddress: string,
  mint: string = SOLTOOLS_TOKEN_MINT,
  required: number = 1,
): Promise<HolderVerifyResult> {
  const owner = rawAddress.trim();
  if (!isValidSolanaAddress(owner)) {
    return { ok: false, balance: 0, required, mint, reason: "Invalid Solana wallet address." };
  }
  const [v1, v2] = await Promise.all([
    scanBalance(owner, mint, TOKEN_PROGRAM_ID),
    scanBalance(owner, mint, TOKEN_2022_PROGRAM_ID),
  ]);
  const balance = v1 + v2;
  if (balance >= required) return { ok: true, balance, required, mint };
  return {
    ok: false,
    balance,
    required,
    mint,
    reason: `Wallet holds ${balance.toLocaleString()} but ${required.toLocaleString()} is required.`,
  };
}
