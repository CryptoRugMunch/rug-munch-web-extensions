/**
 * CRM Design Tokens — shared across extension, mini app, and content scripts.
 * Single source of truth for brand consistency.
 */

export const COLORS = {
  // Core brand
  bg: "#0B0714",
  bgCard: "#1a1025",
  bgCardHover: "#221430",
  gold: "#E7C55F",
  purple: "#7E4CFF",
  purpleLight: "#9B7AFF",
  cyan: "#5FDDE7",
  cyanLight: "#8AE8EF",

  // Semantic
  red: "#FF4757",
  redLight: "#FF6B7A",
  green: "#2ED573",
  greenLight: "#5AE090",
  orange: "#FF8C00",
  yellow: "#FFD93D",

  // Text
  textPrimary: "#FFFFFF",
  textSecondary: "#98979C",
  textMuted: "#5a5960",

  // Borders
  border: "#2a2035",
  borderLight: "#3a3045",
} as const;

export const RISK_COLORS = {
  low: COLORS.green,       // 0-24
  moderate: COLORS.gold,   // 25-49
  high: COLORS.orange,     // 50-74
  critical: COLORS.red,    // 75-100
} as const;

export function riskColor(score: number): string {
  if (score >= 75) return RISK_COLORS.critical;
  if (score >= 50) return RISK_COLORS.high;
  if (score >= 25) return RISK_COLORS.moderate;
  return RISK_COLORS.low;
}

export function riskLabel(score: number): string {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Moderate";
  return "Low";
}

export function riskEmoji(score: number): string {
  if (score >= 75) return "🔴";
  if (score >= 50) return "🟠";
  if (score >= 25) return "🟡";
  return "🟢";
}

// Extension-specific
export const EXTENSION = {
  popupWidth: 380,
  popupHeight: 520,
  badgeSize: 24,
  animationDuration: "200ms",
} as const;
