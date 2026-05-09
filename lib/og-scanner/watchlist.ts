export const DEFAULT_WATCH_WALLETS = [
  'CicbPxARTDrwQ4XcxWsn6SYeG4FMJHirS633cZUJeQDh',
];

export const DEFAULT_WATCH_MINTS = [
  'EfnZmcFKMXofKA5V5ujvjqtSorvuQD2MzJPz3dxXpump',
];

export function addWatchValue(list: string[], value: string): string[] {
  const next = value.trim();

  if (!next) {
    return list;
  }

  if (list.includes(next)) {
    return list;
  }

  return [next, ...list];
}

export function removeWatchValue(list: string[], value: string): string[] {
  return list.filter((item) => item !== value);
}
