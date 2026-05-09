export type PersistedScannerAlert = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
};

export function markAlertRead(alert: PersistedScannerAlert): PersistedScannerAlert {
  return {
    ...alert,
    read: true,
  };
}

export function sortAlerts(alerts: PersistedScannerAlert[]): PersistedScannerAlert[] {
  return [...alerts].sort((a, b) => b.createdAt - a.createdAt);
}
