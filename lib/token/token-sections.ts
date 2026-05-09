export const TOKEN_SECTIONS = [
  'overview',
  'holders',
  'whales',
  'narratives',
  'security',
  'trades',
  'social',
  'dev-wallets',
];

export function normalizeTokenSection(section: string): string {
  return section.toLowerCase().trim();
}
