export function shouldRefreshProfile(timestamp?: number) {
  if (!timestamp) return true;

  return Date.now() - timestamp > 600000;
}
