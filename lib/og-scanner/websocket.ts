export const OG_SCANNER_WS_RECONNECT_MS = 5000;

export type OGScannerSocketState = 'disconnected' | 'connecting' | 'connected';

export function shouldReconnect(lastDisconnectAt: number | null): boolean {
  if (!lastDisconnectAt) {
    return true;
  }

  return Date.now() - lastDisconnectAt >= OG_SCANNER_WS_RECONNECT_MS;
}
