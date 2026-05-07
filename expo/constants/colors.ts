/**
 * Solana-inspired palette: deep black canvas, electric blue accents, crisp white text.
 * All historical keys are preserved so existing screens keep compiling; values are
 * remapped onto the new blue/black/white system.
 */
const Colors = {
  ink: "#000000",
  panel: "#06080F",
  card: "#0B0F1A",
  cardSoft: "#111827",
  elevated: "#0F1422",
  graphite: "#1B2235",

  // Accent ramp (Solana electric blue family)
  mint: "#3FA9FF",
  cyan: "#62D0FF",
  orange: "#1E88FF",
  rose: "#E6F2FF",
  neon: "#9CD7FF",
  violet: "#5B8DEF",
  magenta: "#3FA9FF",

  text: "#FFFFFF",
  muted: "#B6C2D9",
  muted2: "#6B7894",

  line: "rgba(63, 169, 255, 0.18)",
  lineStrong: "rgba(255, 255, 255, 0.28)",
  glass: "rgba(63, 169, 255, 0.10)",

  // Semantic aliases
  gold: "#3FA9FF",
  goldBright: "#62D0FF",
  goldSoft: "#1E5BAA",
  silver: "#E6F2FF",
  platinum: "#FFFFFF",
  bronze: "#1E88FF",
  obsidian: "#000000",
};

export default Colors;
