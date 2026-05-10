export function removeDuplicateSections(sections: string[]): string[] {
  return [...new Set(sections.filter(Boolean))];
}

export function createHomeGreeting(name?: string): string {
  return name ? `Welcome back, ${name}` : 'Welcome back';
}
