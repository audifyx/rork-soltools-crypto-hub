import * as Linking from "expo-linking";

import { supabase } from "@/lib/supabase";

export type ShareTargetType = "post" | "community" | "reel" | "profile";

export interface ShareLinkResult {
  url: string;
  appUrl: string;
  route: string;
  code?: string | null;
}

interface ShareLinkRow {
  code?: string | null;
  url?: string | null;
  app_url?: string | null;
  route?: string | null;
  target_type?: string | null;
  target_id?: string | null;
}

const PUBLIC_SHARE_ORIGIN = "https://ogscan.fun";

function cleanId(value: string): string {
  return value.replace(/^@/, "").trim();
}

export function routeForTarget(type: ShareTargetType, id: string): string {
  const target = encodeURIComponent(cleanId(id));
  if (type === "community") return `/community/${target}`;
  if (type === "post") return `/post/${target}`;
  if (type === "reel") return `/(tabs)/reels?focus=${target}`;
  return `/u/${target}`;
}

function appUrlForRoute(route: string): string {
  const withoutSlash = route.replace(/^\//, "");
  return Linking.createURL(withoutSlash);
}

function publicUrlForRoute(route: string): string {
  if (route.startsWith("/(tabs)/reels")) {
    const focus = route.split("focus=")[1] ?? "";
    return `${PUBLIC_SHARE_ORIGIN}/reel/${encodeURIComponent(decodeURIComponent(focus))}`;
  }
  const safeRoute = route.startsWith("/") ? route : `/${route}`;
  return `${PUBLIC_SHARE_ORIGIN}${safeRoute}`;
}

/** Creates or reuses a trackable share URL backed by Supabase, with offline-safe fallback links. */
export async function createShareLink(
  type: ShareTargetType,
  id: string,
  metadata: Record<string, unknown> = {},
): Promise<ShareLinkResult> {
  const route = routeForTarget(type, id);
  try {
    const { data, error } = await supabase.rpc("create_share_link", {
      p_target_type: type,
      p_target_id: cleanId(id),
      p_route: route,
      p_metadata: metadata,
      p_expires_at: null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? (data[0] as ShareLinkRow | undefined) : (data as ShareLinkRow | null);
    if (row?.url) {
      return {
        url: row.url,
        appUrl: row.app_url ?? appUrlForRoute(row.route ?? route),
        route: row.route ?? route,
        code: row.code ?? null,
      };
    }
  } catch (error) {
    console.log("[share-links] create fallback", error instanceof Error ? error.message : error);
  }
  return {
    url: publicUrlForRoute(route),
    appUrl: appUrlForRoute(route),
    route,
    code: null,
  };
}

async function resolveCode(code: string): Promise<string | null> {
  if (!code) return null;
  try {
    const { data, error } = await supabase.rpc("resolve_share_link", {
      p_code: code,
      p_referrer: null,
      p_user_agent: null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? (data[0] as ShareLinkRow | undefined) : (data as ShareLinkRow | null);
    return row?.route ?? null;
  } catch (error) {
    console.log("[share-links] resolve failed", error instanceof Error ? error.message : error);
    return null;
  }
}

function routeFromPath(pathname: string, search: string): string | null {
  const cleanPath = pathname.replace(/^\/+/, "");
  const parts = cleanPath.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[0] === "post" && parts[1]) return `/post/${encodeURIComponent(parts[1])}`;
  if (parts[0] === "community" && parts[1]) return `/community/${encodeURIComponent(parts[1])}`;
  if (parts[0] === "u" && parts[1]) return `/u/${encodeURIComponent(parts[1].replace(/^@/, ""))}`;
  if (parts[0] === "reel" && parts[1]) return `/(tabs)/reels?focus=${encodeURIComponent(parts[1])}`;
  if (parts[0] === "l" && parts[1]) return `/l/${encodeURIComponent(parts[1])}${search}`;
  return null;
}

/** Resolves incoming native/universal share URLs to Expo Router paths. */
export async function routeForIncomingShareUrl(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    const hostParts = parsed.host.split(".");
    let pathname = parsed.pathname;
    if (parsed.protocol === "rork-app:" && parsed.host && !pathname.startsWith(`/${parsed.host}`)) {
      pathname = `/${parsed.host}${pathname}`;
    }
    if (hostParts.includes("rork") && pathname.startsWith("/post/")) return routeFromPath(pathname, parsed.search);
    if (hostParts.includes("ogscan") || parsed.protocol === "rork-app:") {
      const direct = routeFromPath(pathname, parsed.search);
      if (!direct) return null;
      if (direct.startsWith("/l/")) {
        const code = direct.split("/")[2]?.split("?")[0] ?? "";
        return resolveCode(code);
      }
      return direct;
    }
    return routeFromPath(pathname, parsed.search);
  } catch {
    return null;
  }
}
