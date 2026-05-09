export type ScannerRealtimeState = {
  connected: boolean;
  lastHeartbeat: number | null;
};

export const DEFAULT_REALTIME_STATE: ScannerRealtimeState = {
  connected: false,
  lastHeartbeat: null,
};

export function createHeartbeat(): number {
  return Date.now();
}

export function isRealtimeStale(lastHeartbeat: number | null, staleAfterMs = 30000): boolean {
  if (!lastHeartbeat) {
    return true;
  }

  return Date.now() - lastHeartbeat > staleAfterMs;
}
