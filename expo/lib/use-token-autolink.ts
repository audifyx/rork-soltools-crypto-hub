import { useEffect, useRef, useState } from "react";

import { getTokens } from "@/lib/api/jupiter";
import { extractSolanaAddress, fetchLaunchTokenForSearchQuery } from "@/lib/token-search";

export type AutolinkResult = {
  address: string;
  ticker: string;
  name: string;
  logoUrl: string | null;
};

export type AutolinkState =
  | { status: "idle" }
  | { status: "resolving"; via: "ca" | "ticker" }
  | { status: "resolved"; via: "ca" | "ticker"; data: AutolinkResult }
  | { status: "missing"; via: "ca" | "ticker" };

/**
 * Two-way auto-link between a Solana CA and a token ticker.
 * - When a valid CA is pasted, fetches metadata from pump.fun / dex / Jupiter and fills the ticker.
 * - When a ticker is typed (and no CA yet), searches Jupiter and fills the CA + name + logo.
 */
export function useTokenAutolink(params: {
  ticker: string;
  contract: string;
  onResolve: (data: AutolinkResult, via: "ca" | "ticker") => void;
  enabled?: boolean;
}): AutolinkState {
  const { ticker, contract, onResolve, enabled = true } = params;
  const lastAddrRef = useRef<string>("");
  const lastTickerRef = useRef<string>("");
  const [state, setState] = useState<AutolinkState>({ status: "idle" });

  useEffect(() => {
    if (!enabled) return;
    const addr = extractSolanaAddress(contract);
    if (!addr) return;
    if (addr === lastAddrRef.current) return;
    lastAddrRef.current = addr;

    let cancelled = false;
    setState({ status: "resolving", via: "ca" });
    const t = setTimeout(async () => {
      try {
        const token = await fetchLaunchTokenForSearchQuery(addr);
        if (cancelled) return;
        if (!token) {
          setState({ status: "missing", via: "ca" });
          return;
        }
        const data: AutolinkResult = {
          address: token.contract,
          ticker: (token.ticker || "").replace(/^\$/, "").toUpperCase(),
          name: token.name || "",
          logoUrl: token.logoUrl ?? null,
        };
        onResolve(data, "ca");
        setState({ status: "resolved", via: "ca", data });
      } catch (e) {
        if (cancelled) return;
        console.log("[autolink] CA lookup failed", e instanceof Error ? e.message : e);
        setState({ status: "missing", via: "ca" });
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [contract, enabled, onResolve]);

  useEffect(() => {
    if (!enabled) return;
    const t = ticker.trim().replace(/^\$/, "").toUpperCase();
    if (t.length < 2) return;
    if (t === lastTickerRef.current) return;
    if (extractSolanaAddress(contract)) return;
    lastTickerRef.current = t;

    let cancelled = false;
    setState({ status: "resolving", via: "ticker" });
    const timer = setTimeout(async () => {
      try {
        const rows = await getTokens(t);
        if (cancelled) return;
        const exact = rows.find((r) => (r.symbol ?? "").toUpperCase() === t);
        const pick = exact ?? rows[0];
        if (!pick?.address) {
          setState({ status: "missing", via: "ticker" });
          return;
        }
        const data: AutolinkResult = {
          address: pick.address,
          ticker: (pick.symbol ?? t).toUpperCase(),
          name: pick.name ?? pick.symbol ?? "",
          logoUrl: pick.logoURI ?? null,
        };
        onResolve(data, "ticker");
        setState({ status: "resolved", via: "ticker", data });
      } catch (e) {
        if (cancelled) return;
        console.log("[autolink] ticker lookup failed", e instanceof Error ? e.message : e);
        setState({ status: "missing", via: "ticker" });
      }
    }, 480);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ticker, contract, enabled, onResolve]);

  return state;
}
