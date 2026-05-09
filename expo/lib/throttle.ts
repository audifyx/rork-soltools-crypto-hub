const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function runThrottled(key: string, fn: () => void, delay = 350) {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    timers.delete(key);
    fn();
  }, delay);

  timers.set(key, timer);
}

export function clearThrottle(key: string) {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.delete(key);
}
