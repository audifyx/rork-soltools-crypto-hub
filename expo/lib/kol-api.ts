/**
 * Convenience re-export of the KOL Scan API at the requested location.
 *
 * The canonical implementation lives at `@/lib/api/kol`. This module mirrors
 * those bindings under the names callers expect (`subscribeToAllKOLTransactions`,
 * etc.) so screens can `import { ... } from "@/lib/kol-api"`.
 */
import {
  explorerUrlForTx,
  getKOLProfiles,
  getKOLRecentTransactions,
  getUserFollowedKOLs,
  searchKOLProfiles,
  subscribeToKOLTransactions,
  toggleFollowKOL,
  truncateAddress,
  type KOLBlockchain,
  type KOLProfile,
  type KOLTransaction,
  type KOLTxType,
} from "@/lib/api/kol";

export {
  explorerUrlForTx,
  getKOLProfiles,
  getKOLRecentTransactions,
  getUserFollowedKOLs,
  searchKOLProfiles,
  toggleFollowKOL,
  truncateAddress,
};
export type { KOLBlockchain, KOLProfile, KOLTransaction, KOLTxType };

/**
 * Subscribe to realtime inserts for all KOL transactions across every tracked
 * wallet. Returns an unsubscribe function.
 */
export function subscribeToAllKOLTransactions(
  callback: (tx: KOLTransaction) => void,
): () => void {
  return subscribeToKOLTransactions(callback);
}

/** Alias kept for naming consistency with the screen's existing import. */
export const subscribeToKOLTransactionsAll = subscribeToAllKOLTransactions;
