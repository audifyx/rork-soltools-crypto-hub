export const PROFILE_TABS = [
  'feed',
  'holdings',
  'trades',
  'wallets',
  'activity',
  'badges',
  'nfts',
];

export function normalizeProfileTab(tab: string): string {
  return tab.toLowerCase().trim();
}
