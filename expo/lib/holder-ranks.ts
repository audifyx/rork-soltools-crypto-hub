export function getHolderRank(balance: number) {
  if (balance >= 10000000) return 'whale';
  if (balance >= 1000000) return 'gold';
  if (balance > 0) return 'holder';
  return 'none';
}
