export function shouldLoadFeedImage(index: number, visibleWindow = 10): boolean {
  return index < visibleWindow;
}
