export type DevWalletProfile = {
  wallet: string;
  launches: number;
  successfulLaunches: number;
  failedLaunches: number;
  lastSeenAt: number | null;
};

export const DEFAULT_DEV_WALLET: DevWalletProfile = {
  wallet: 'CicbPxARTDrwQ4XcxWsn6SYeG4FMJHirS633cZUJeQDh',
  launches: 0,
  successfulLaunches: 0,
  failedLaunches: 0,
  lastSeenAt: null,
};

export function calculateDevSuccessRate(profile: DevWalletProfile): number {
  if (profile.launches <= 0) {
    return 0;
  }

  return Math.round((profile.successfulLaunches / profile.launches) * 100);
}

export function updateDevWalletLastSeen(profile: DevWalletProfile): DevWalletProfile {
  return {
    ...profile,
    lastSeenAt: Date.now(),
  };
}
