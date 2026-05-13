/**
 * Community access types and local persistence for non-public communities.
 *
 * Supports four access modes for communities:
 *  - public:    Anyone can see + join. Shows in live/discover feeds.
 *  - holders:   Requires holding $OGS (existing holder-verify flow).
 *  - passcode:  Requires entering the creator-defined passcode to join.
 *  - request:   Requires the owner to approve a join request.
 *
 * All communities are still listed in the directory, but non-public ones
 * gate their content (posts, members, composer) until the viewer is approved.
 *
 * This module persists per-community access config + pending requests in
 * AsyncStorage so the feature works without backend migrations.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CommunityAccessType = "public" | "holders" | "passcode" | "request";

export interface JoinRequest {
  userId: string;
  handle: string;
  name: string;
  avatarColor?: string;
  message?: string;
  requestedAt: number;
}

export interface CommunityAccessConfig {
  accessType: CommunityAccessType;
  passcode?: string | null;
  pendingRequests: JoinRequest[];
  approvedMemberIds: string[];
}

export type CommunityAccessMap = Record<string, CommunityAccessConfig>;

const STORAGE_KEY = "soltools.community.access.v1";

function emptyConfig(accessType: CommunityAccessType = "public"): CommunityAccessConfig {
  return {
    accessType,
    passcode: null,
    pendingRequests: [],
    approvedMemberIds: [],
  };
}

export async function loadAccessMap(): Promise<CommunityAccessMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CommunityAccessMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.log("[community-access] load failed", e instanceof Error ? e.message : e);
    return {};
  }
}

export async function saveAccessMap(map: CommunityAccessMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.log("[community-access] save failed", e instanceof Error ? e.message : e);
  }
}

export function getAccessFor(
  map: CommunityAccessMap,
  communityId: string,
  fallback?: Partial<CommunityAccessConfig>,
): CommunityAccessConfig {
  const existing = map[communityId];
  if (existing) return existing;
  return { ...emptyConfig(), ...fallback } as CommunityAccessConfig;
}

export function describeAccess(type: CommunityAccessType): {
  label: string;
  short: string;
  description: string;
} {
  switch (type) {
    case "holders":
      return {
        label: "Holders only",
        short: "Holders",
        description: "Members must verify they hold $OGS in their wallet.",
      };
    case "passcode":
      return {
        label: "Passcode locked",
        short: "Passcode",
        description: "Members must enter a passcode set by the creator.",
      };
    case "request":
      return {
        label: "Request to join",
        short: "Request",
        description: "Members must be approved by the community owner.",
      };
    default:
      return {
        label: "Public",
        short: "Public",
        description: "Anyone can discover and join instantly.",
      };
  }
}
