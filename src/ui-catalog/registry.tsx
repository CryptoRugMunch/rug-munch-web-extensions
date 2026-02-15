/**
 * Rug Munch Intelligence — json-render Component Registry
 *
 * React implementations of all catalog components.
 * CRM brand palette, consistent across all surfaces.
 */

import { useState } from "react";
import { defineRegistry, Renderer } from "@json-render/react";
import { rugMunchCatalog } from "./catalog";

// ─── CRM Brand Palette ──────────────────────────────────────────

const C = {
  bg: "#0B0714",
  bgCard: "#13101D",
  bgHover: "#1A1528",
  border: "#2A2440",
  gold: "#E7C55F",
  purple: "#7E4CFF",
  purpleLight: "#A78BFA",
  cyan: "#5FDDE7",
  red: "#FF4757",
  orange: "#FF8C00",
  green: "#2ED573",
  textPrimary: "#F0EDF6",
  textSecondary: "#A09BB0",
  textMuted: "#6B6580",
} as const;

const SEVERITY = {
  critical: { color: C.red, bg: `${C.red}18`, icon: "🔴" },
  high: { color: C.orange, bg: `${C.orange}18`, icon: "🟠" },
  moderate: { color: C.gold, bg: `${C.gold}18`, icon: "🟡" },
  safe: { color: C.green, bg: `${C.green}18`, icon: "🟢" },
  info: { color: C.cyan, bg: `${C.cyan}12`, icon: "ℹ️" },
  neutral: { color: C.textSecondary, bg: "transparent", icon: "" },
} as const;

function riskColor(score: number): string {
  if (score >= 75) return C.red;
  if (score >= 50) return C.orange;
  if (score >= 25) return C.gold;
  return C.green;
}

// ─── Component Implementations ──────────────────────────────────

export const { registry } = defineRegistry(rugMunchCatalog, {
  components: {

    // ── ScoreCard: Main container ──────────────────────────────
    ScoreCard: ({ props, children }) => {
      const color = riskColor(props.score);
      return (
        <div style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: C.bg,
          borderRadius: 12,
          border: `1px solid ${color}40`,
          padding: 16,
          color: C.textPrimary,
          maxWidth: 380,
          boxSizing: "border-box" as const,
          boxShadow: `0 4px 20px ${color}15`,
        }}>
          {children}
        </div>
      );
    },

    // ── DonutChart: SVG risk visualization ─────────────────────
    DonutChart: ({ props }) => {
      const { segments, centerScore, size = 120 } = props;
      const radius = (size - 16) / 2;
      const center = size / 2;
      const color = riskColor(centerScore);

      // Calculate segment arcs
      const total = segments.reduce((s, seg) => s + Math.max(seg.value, 0), 0) || 1;
      let currentAngle = -90; // Start from top

      const arcs = segments.map((seg) => {
        const pct = Math.max(seg.value, 0) / total;
        const angle = pct * 360;
        const startAngle = currentAngle;
        currentAngle += angle;

        // SVG arc path
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = ((startAngle + angle) * Math.PI) / 180;
        const x1 = center + radius * Math.cos(startRad);
        const y1 = center + radius * Math.sin(startRad);
        const x2 = center + radius * Math.cos(endRad);
        const y2 = center + radius * Math.sin(endRad);
        const largeArc = angle > 180 ? 1 : 0;

        return {
          ...seg,
          path: `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        };
      });

      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background ring */}
            <circle cx={center} cy={center} r={radius} fill="none"
              stroke={C.border} strokeWidth="10" />

            {/* Segments */}
            {arcs.map((arc, i) => (
              <path key={i} d={arc.path} fill="none"
                stroke={SEVERITY[arc.severity]?.color || arc.color}
                strokeWidth="10" strokeLinecap="round" />
            ))}

            {/* Center score */}
            <text x={center} y={center - 6} textAnchor="middle"
              fill={color} fontSize="24" fontWeight="800"
              fontFamily="system-ui, -apple-system, sans-serif">
              {centerScore}
            </text>
            <text x={center} y={center + 12} textAnchor="middle"
              fill={C.textMuted} fontSize="10"
              fontFamily="system-ui, -apple-system, sans-serif">
              RISK SCORE
            </text>
          </svg>
        </div>
      );
    },

    // ── MetricGrid ─────────────────────────────────────────────
    MetricGrid: ({ props, children }) => (
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${props.columns || 2}, 1fr)`,
        gap: 8,
        padding: "8px 0",
      }}>
        {children}
      </div>
    ),

    // ── MetricItem ─────────────────────────────────────────────
    MetricItem: ({ props }) => {
      const sev = SEVERITY[props.severity] || SEVERITY.neutral;
      return (
        <div style={{
          padding: "8px 10px",
          borderRadius: 8,
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>
            {props.label}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: props.severity !== "neutral" ? sev.color : C.textPrimary,
          }}>
            {props.value}
          </div>
        </div>
      );
    },

    // ── RiskBar ────────────────────────────────────────────────
    RiskBar: ({ props }) => {
      const color = riskColor(props.value);
      return (
        <div style={{ padding: "4px 0" }}>
          {props.label && (
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 11, marginBottom: 4,
            }}>
              <span style={{ color: C.textSecondary }}>{props.label}</span>
              {props.showValue && <span style={{ color, fontWeight: 600 }}>{props.value}/100</span>}
            </div>
          )}
          <div style={{
            width: "100%", height: 6,
            backgroundColor: C.border, borderRadius: 3,
          }}>
            <div style={{
              width: `${props.value}%`, height: "100%",
              backgroundColor: color, borderRadius: 3,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>
      );
    },

    // ── CategoryBreakdown (expandable) ─────────────────────────
    CategoryBreakdown: ({ props, children }) => {
      const [open, setOpen] = useState(false);
      const sev = SEVERITY[props.worstSeverity] || SEVERITY.info;

      return (
        <div style={{
          borderRadius: 8,
          border: `1px solid ${open ? sev.color + "40" : C.border}`,
          backgroundColor: open ? `${sev.color}08` : "transparent",
          overflow: "hidden",
          transition: "all 0.2s",
        }}>
          <div
            onClick={() => setOpen(!open)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 12px", cursor: "pointer",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{props.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>
                {props.label}
              </span>
              <span style={{
                fontSize: 9, padding: "1px 6px", borderRadius: 10,
                backgroundColor: sev.bg, color: sev.color, fontWeight: 600,
              }}>
                {props.worstSeverity}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.textMuted }}>
                {props.itemCount} metrics
              </span>
              <span style={{ fontSize: 10, color: C.textMuted, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>▾</span>
            </div>
          </div>
          {open && (
            <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              {children}
            </div>
          )}
        </div>
      );
    },

    // ── RiskMetric ─────────────────────────────────────────────
    RiskMetric: ({ props }) => {
      const [showExplanation, setShowExplanation] = useState(false);
      const sev = SEVERITY[props.severity] || SEVERITY.info;

      return (
        <div
          onClick={() => props.explanation && setShowExplanation(!showExplanation)}
          style={{
            padding: "6px 8px", borderRadius: 6,
            backgroundColor: sev.bg,
            cursor: props.explanation ? "pointer" : "default",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 8 }}>{sev.icon}</span>
              <span style={{ fontSize: 11, color: C.textPrimary }}>{props.metric}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: sev.color }}>{props.value}</span>
          </div>
          {showExplanation && props.explanation && (
            <div style={{
              marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}`,
              fontSize: 10, color: C.textSecondary, lineHeight: 1.4,
            }}>
              {props.explanation}
            </div>
          )}
        </div>
      );
    },

    // ── AlertBanner ────────────────────────────────────────────
    AlertBanner: ({ props }) => {
      const config = {
        critical: { bg: `${C.red}15`, border: `${C.red}40`, color: C.red, icon: "🚨" },
        warning: { bg: `${C.orange}15`, border: `${C.orange}40`, color: C.orange, icon: "⚠️" },
        info: { bg: `${C.cyan}10`, border: `${C.cyan}30`, color: C.cyan, icon: "ℹ️" },
        success: { bg: `${C.green}15`, border: `${C.green}40`, color: C.green, icon: "✅" },
      }[props.type];

      return (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          backgroundColor: config.bg, border: `1px solid ${config.border}`,
        }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: config.color, marginBottom: 2 }}>
            {config.icon} {props.title}
          </div>
          <div style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.4 }}>
            {props.message}
          </div>
        </div>
      );
    },

    // ── TokenHeader ────────────────────────────────────────────
    TokenHeader: ({ props }) => (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: C.textPrimary }}>
              ${props.symbol}
            </span>
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 6,
              backgroundColor: `${C.purple}20`, color: C.purpleLight,
              textTransform: "uppercase" as const, fontWeight: 600,
            }}>
              {props.chain}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>
            {props.name}
            {props.age && <span style={{ color: C.textMuted }}> · {props.age}</span>}
          </div>
        </div>
      </div>
    ),

    // ── ActionRow ──────────────────────────────────────────────
    ActionRow: ({ props, children }) => {
      const justify = {
        left: "flex-start", center: "center",
        right: "flex-end", stretch: "stretch",
      }[props.align || "stretch"];

      return (
        <div style={{
          display: "flex", gap: 6,
          justifyContent: justify as any,
          paddingTop: 8,
        }}>
          {children}
        </div>
      );
    },

    // ── ActionButton ───────────────────────────────────────────
    ActionButton: ({ props, emit }) => {
      const styles = {
        primary: {
          backgroundColor: C.purple, color: "#fff",
          border: "none",
        },
        secondary: {
          backgroundColor: "transparent", color: C.textSecondary,
          border: `1px solid ${C.border}`,
        },
        ghost: {
          backgroundColor: "transparent", color: C.textMuted,
          border: "none",
        },
      }[props.variant || "secondary"];

      return (
        <button
          onClick={() => emit("press")}
          style={{
            ...styles,
            flex: 1,
            padding: "6px 10px", borderRadius: 6,
            fontSize: 11, fontWeight: 600,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {props.icon && <span>{props.icon}</span>}
          {props.label}
        </button>
      );
    },

    // ── Divider ────────────────────────────────────────────────
    Divider: ({ props }) => (
      <div style={{
        height: 1, backgroundColor: C.border,
        margin: `${props.spacing || 8}px 0`,
      }} />
    ),

    // ── Badge ──────────────────────────────────────────────────
    Badge: ({ props }) => (
      <span style={{
        display: "inline-flex", padding: "2px 8px", borderRadius: 10,
        fontSize: 10, fontWeight: 600,
        backgroundColor: props.variant === "outline" ? "transparent" : (props.color || C.purple) + "20",
        border: `1px solid ${(props.color || C.purple)}40`,
        color: props.color || C.purpleLight,
      }}>
        {props.text}
      </span>
    ),

    // ── Text ───────────────────────────────────────────────────
    Text: ({ props }) => {
      const sizes = { xs: 9, sm: 11, md: 13, lg: 16 };
      const colors = {
        primary: C.textPrimary, secondary: C.textSecondary,
        muted: C.textMuted, accent: C.gold,
      };
      const weights = { normal: 400, medium: 500, bold: 700 };

      return (
        <div style={{
          fontSize: sizes[props.size || "md"],
          color: colors[props.color || "primary"],
          fontWeight: weights[props.weight || "normal"],
          textAlign: (props.align || "left") as any,
          fontFamily: props.mono ? "monospace" : "inherit",
          wordBreak: props.mono ? "break-all" as const : undefined,
          lineHeight: 1.4,
        }}>
          {props.content}
        </div>
      );
    },

    // ── Row ────────────────────────────────────────────────────
    Row: ({ props, children }) => {
      const justify = {
        start: "flex-start", center: "center",
        end: "flex-end", between: "space-between",
      }[props.align || "start"];

      return (
        <div style={{
          display: "flex", gap: props.gap || 8,
          alignItems: "center", justifyContent: justify as any,
        }}>
          {children}
        </div>
      );
    },

    // ── Column ─────────────────────────────────────────────────
    Column: ({ props, children }) => (
      <div style={{
        display: "flex", flexDirection: "column",
        gap: props.gap || 8,
      }}>
        {children}
      </div>
    ),
  },
});

export { Renderer };
export { C as BRAND_COLORS };
