export function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function removeDuplicateTitles<T extends { title?: string }>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const title = item.title || '';

    if (!title) {
      return true;
    }

    if (seen.has(title)) {
      return false;
    }

    seen.add(title);
    return true;
  });
}
