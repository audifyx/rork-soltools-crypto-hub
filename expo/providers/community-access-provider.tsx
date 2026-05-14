import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CommunityAccessConfig,
  CommunityAccessMap,
  CommunityAccessType,
  JoinRequest,
  getAccessFor,
  loadAccessMap,
  saveAccessMap,
} from "@/lib/community-access";

/**
 * Local-only persistence layer for non-public community access metadata.
 *
 * The supabase `communities` table only knows about `is_private` and
 * `holder_only`, so we layer passcode + request-to-join semantics on top
 * via AsyncStorage. The owner's device is the source of truth for pending
 * requests, and other devices show "waiting for an admin" until an entry
 * lands in `community_members` (handled by social-provider's toggleJoin).
 */
export const [CommunityAccessProvider, useCommunityAccess] = createContextHook(() => {
  const [map, setMap] = useState<CommunityAccessMap>({});
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    loadAccessMap().then((data) => {
      if (!mounted) return;
      setMap(data);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback((next: CommunityAccessMap) => {
    setMap(next);
    saveAccessMap(next).catch(() => {});
  }, []);

  const getConfig = useCallback(
    (communityId: string): CommunityAccessConfig => getAccessFor(map, communityId),
    [map],
  );

  const setConfig = useCallback(
    (communityId: string, patch: Partial<CommunityAccessConfig>) => {
      const current = getAccessFor(map, communityId);
      const next: CommunityAccessConfig = {
        ...current,
        ...patch,
        pendingRequests: patch.pendingRequests ?? current.pendingRequests,
        approvedMemberIds: patch.approvedMemberIds ?? current.approvedMemberIds,
        bannedMemberIds: patch.bannedMemberIds ?? current.bannedMemberIds,
      };
      persist({ ...map, [communityId]: next });
    },
    [map, persist],
  );

  const initialize = useCallback(
    (
      communityId: string,
      input: {
        accessType: CommunityAccessType;
        passcode?: string | null;
      },
    ) => {
      const next: CommunityAccessConfig = {
        accessType: input.accessType,
        passcode: input.passcode ?? null,
        pendingRequests: [],
        approvedMemberIds: [],
        bannedMemberIds: [],
      };
      persist({ ...map, [communityId]: next });
    },
    [map, persist],
  );

  const verifyPasscode = useCallback(
    (communityId: string, code: string): boolean => {
      const cfg = getAccessFor(map, communityId);
      if (cfg.accessType !== "passcode") return true;
      const expected = (cfg.passcode ?? "").trim();
      return expected.length > 0 && code.trim() === expected;
    },
    [map],
  );

  const submitJoinRequest = useCallback(
    (communityId: string, request: Omit<JoinRequest, "requestedAt">) => {
      const current = getAccessFor(map, communityId);
      if (current.pendingRequests.some((r) => r.userId === request.userId)) return;
      if (current.approvedMemberIds.includes(request.userId)) return;
      const entry: JoinRequest = { ...request, requestedAt: Date.now() };
      const next: CommunityAccessConfig = {
        ...current,
        pendingRequests: [entry, ...current.pendingRequests],
      };
      persist({ ...map, [communityId]: next });
    },
    [map, persist],
  );

  const approveRequest = useCallback(
    (communityId: string, userId: string): JoinRequest | null => {
      const current = getAccessFor(map, communityId);
      const found = current.pendingRequests.find((r) => r.userId === userId) ?? null;
      const next: CommunityAccessConfig = {
        ...current,
        pendingRequests: current.pendingRequests.filter((r) => r.userId !== userId),
        approvedMemberIds: current.approvedMemberIds.includes(userId)
          ? current.approvedMemberIds
          : [...current.approvedMemberIds, userId],
      };
      persist({ ...map, [communityId]: next });
      return found;
    },
    [map, persist],
  );

  const rejectRequest = useCallback(
    (communityId: string, userId: string) => {
      const current = getAccessFor(map, communityId);
      const next: CommunityAccessConfig = {
        ...current,
        pendingRequests: current.pendingRequests.filter((r) => r.userId !== userId),
      };
      persist({ ...map, [communityId]: next });
    },
    [map, persist],
  );

  const markApproved = useCallback(
    (communityId: string, userId: string) => {
      const current = getAccessFor(map, communityId);
      if (current.approvedMemberIds.includes(userId)) return;
      const next: CommunityAccessConfig = {
        ...current,
        approvedMemberIds: [...current.approvedMemberIds, userId],
      };
      persist({ ...map, [communityId]: next });
    },
    [map, persist],
  );

  const removeMember = useCallback(
    (communityId: string, uid: string) => {
      const current = getAccessFor(map, communityId);
      const next: CommunityAccessConfig = {
        ...current,
        approvedMemberIds: current.approvedMemberIds.filter((id) => id !== uid),
        pendingRequests: current.pendingRequests.filter((r) => r.userId !== uid),
      };
      persist({ ...map, [communityId]: next });
    },
    [map, persist],
  );

  const banMember = useCallback(
    (communityId: string, uid: string) => {
      const current = getAccessFor(map, communityId);
      const next: CommunityAccessConfig = {
        ...current,
        approvedMemberIds: current.approvedMemberIds.filter((id) => id !== uid),
        pendingRequests: current.pendingRequests.filter((r) => r.userId !== uid),
        bannedMemberIds: current.bannedMemberIds.includes(uid)
          ? current.bannedMemberIds
          : [...current.bannedMemberIds, uid],
      };
      persist({ ...map, [communityId]: next });
    },
    [map, persist],
  );

  const unbanMember = useCallback(
    (communityId: string, uid: string) => {
      const current = getAccessFor(map, communityId);
      const next: CommunityAccessConfig = {
        ...current,
        bannedMemberIds: current.bannedMemberIds.filter((id) => id !== uid),
      };
      persist({ ...map, [communityId]: next });
    },
    [map, persist],
  );

  const isBanned = useCallback(
    (communityId: string, uid: string | null | undefined): boolean => {
      if (!uid) return false;
      const cfg = getAccessFor(map, communityId);
      return cfg.bannedMemberIds.includes(uid);
    },
    [map],
  );

  const isRequestPending = useCallback(
    (communityId: string, userId: string | null | undefined): boolean => {
      if (!userId) return false;
      const cfg = getAccessFor(map, communityId);
      return cfg.pendingRequests.some((r) => r.userId === userId);
    },
    [map],
  );

  return useMemo(
    () => ({
      ready,
      getConfig,
      setConfig,
      initialize,
      verifyPasscode,
      submitJoinRequest,
      approveRequest,
      rejectRequest,
      markApproved,
      isRequestPending,
      removeMember,
      banMember,
      unbanMember,
      isBanned,
    }),
    [
      ready,
      getConfig,
      setConfig,
      initialize,
      verifyPasscode,
      submitJoinRequest,
      approveRequest,
      rejectRequest,
      markApproved,
      isRequestPending,
      removeMember,
      banMember,
      unbanMember,
      isBanned,
    ],
  );
});
