/**
 * KOL transaction sync.
 *
 * Triggers the server-side `sync_kol_transactions` Supabase RPC which pulls
 * recent on-chain activity for all tracked KOL wallets and inserts new rows
 * into `kol_transactions`. The realtime channel then fans those rows out to
 * any connected clients.
 *
 * The same entry point is used by the foreground refresh loop and by the
 * background fetch task (see `registerKOLSync`). It is safe to call from
 * web — RPC errors are swallowed and logged.
 */
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

export interface KOLSyncResult {
  ok: boolean;
  inserted: number;
  scanned: number;
  error?: string;
}

let inflight: Promise<KOLSyncResult> | null = null;

/**
 * Run a single KOL transaction sync. Concurrent calls coalesce so background
 * fetch and foreground refreshes never double-up.
 */
export async function syncKOLTransactions(): Promise<KOLSyncResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc("sync_kol_transactions");
      if (error) {
        console.log("[kol-sync] rpc error", error.message);
        return { ok: false, inserted: 0, scanned: 0, error: error.message };
      }
      const row = Array.isArray(data) ? data[0] : data;
      const inserted = Number(row?.inserted ?? row?.inserted_count ?? 0) || 0;
      const scanned = Number(row?.scanned ?? row?.scanned_count ?? 0) || 0;
      return { ok: true, inserted, scanned };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync_failed";
      console.log("[kol-sync] threw", msg);
      return { ok: false, inserted: 0, scanned: 0, error: msg };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Indicates whether background fetch is supported on the current platform. */
export const supportsBackgroundSync: boolean =
  Platform.OS === "ios" || Platform.OS === "android";
