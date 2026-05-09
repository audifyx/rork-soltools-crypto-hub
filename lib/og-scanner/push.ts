export type ScannerPushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export function createWhaleAlertPayload(symbol: string): ScannerPushPayload {
  return {
    title: 'Whale Alert',
    body: `Large wallet activity detected for ${symbol}`,
  };
}
