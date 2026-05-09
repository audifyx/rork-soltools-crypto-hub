export type OGScannerAlertType =
  | 'whale-buy'
  | 'dev-sell'
  | 'new-pair'
  | 'volume-spike'
  | 'momentum';

export type OGScannerAlert = {
  id: string;
  type: OGScannerAlertType;
  title: string;
  body: string;
  createdAt: number;
};

export function createScannerAlert(type: OGScannerAlertType, title: string, body: string): OGScannerAlert {
  return {
    id: `${type}-${Date.now()}`,
    type,
    title,
    body,
    createdAt: Date.now(),
  };
}
