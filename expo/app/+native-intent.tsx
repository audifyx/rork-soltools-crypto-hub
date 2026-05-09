export function redirectSystemPath({
  path,
  initial: _initial,
}: { path: string; initial: boolean }) {
  try {
    if (typeof path === "string" && path.length > 0) {
      const lower = path.toLowerCase();
      if (lower.includes("reset-password") || lower.includes("type=recovery")) {
        return "/reset-password";
      }
      if (lower.includes("/legal/privacy")) return "/legal/privacy";
      if (lower.includes("/legal/terms")) return "/legal/terms";
      if (lower.includes("/legal/licenses")) return "/legal/licenses";
    }
  } catch (e) {
    console.log("[native-intent] redirect error", e);
  }
  return "/";
}
