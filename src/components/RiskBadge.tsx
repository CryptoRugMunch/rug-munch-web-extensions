/**
 * RiskBadge — injected risk indicator for token pages.
 *
 * Rendered inside Shadow DOM to avoid style conflicts with host pages.
 * Shows: risk score, emoji, color-coded background.
 * Click: expands to show summary + "Full Scan" link.
 */

import React, { useState } from "react";
import { riskColor, riskLabel, riskEmoji, COLORS } from "../utils/designTokens";

interface RiskBadgeProps {
  score: number | null;
  symbol?: string;
  mint: string;
  compact?: boolean;
  onFullScan?: () => void;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  score,
  symbol,
  mint,
  compact = false,
  onFullScan,
}) => {
  const [expanded, setExpanded] = useState(false);
  if (score == null) return null;
  const color = riskColor(score);
  const label = riskLabel(score);
  const emoji = riskEmoji(score);

  if (compact) {
    return (
      <span
        title={`Rug Munch Risk: ${score}/100 (${label})`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          borderRadius: "12px",
          backgroundColor: `${color}20`,
          border: `1px solid ${color}40`,
          color,
          fontSize: "12px",
          fontWeight: 600,
          fontFamily: "system-ui, -apple-system, sans-serif",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {emoji} {score}
      </span>
    );
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        position: "relative",
      }}
    >
      {/* Badge */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 12px",
          borderRadius: "8px",
          backgroundColor: COLORS.bgCard,
          border: `1px solid ${color}60`,
          color: COLORS.textPrimary,
          fontSize: "13px",
          cursor: "pointer",
          transition: "all 0.2s",
          boxShadow: `0 0 8px ${color}30`,
        }}
      >
        <span style={{ fontSize: "14px" }}>{emoji}</span>
        <span style={{ color, fontWeight: 700 }}>{score}</span>
        <span style={{ color: COLORS.textSecondary, fontSize: "11px" }}>/100</span>
        <span
          style={{
            fontSize: "10px",
            color: COLORS.textMuted,
            marginLeft: "2px",
          }}
        >
          ▾
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "4px",
            padding: "12px",
            borderRadius: "10px",
            backgroundColor: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 999999,
            minWidth: "240px",
            color: COLORS.textPrimary,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontWeight: 700, fontSize: "14px" }}>
              {emoji} {label} Risk
            </span>
            <span style={{ color, fontWeight: 700, fontSize: "14px" }}>{score}/100</span>
          </div>

          {/* Risk bar */}
          <div
            style={{
              width: "100%",
              height: "6px",
              backgroundColor: COLORS.border,
              borderRadius: "3px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                width: `${score}%`,
                height: "100%",
                backgroundColor: color,
                borderRadius: "3px",
                transition: "width 0.3s",
              }}
            />
          </div>

          {symbol && (
            <div style={{ fontSize: "12px", color: COLORS.textSecondary, marginBottom: "4px" }}>
              ${symbol}
            </div>
          )}

          <div
            style={{
              fontSize: "10px",
              color: COLORS.textMuted,
              wordBreak: "break-all",
              marginBottom: "10px",
              fontFamily: "monospace",
            }}
          >
            {mint}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "6px" }}>
            {onFullScan && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFullScan();
                }}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: COLORS.purple,
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Full Scan →
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(mint);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: `1px solid ${COLORS.border}`,
                backgroundColor: "transparent",
                color: COLORS.textSecondary,
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              📋 Copy CA
            </button>
          </div>

          <div
            style={{
              marginTop: "8px",
              paddingTop: "6px",
              borderTop: `1px solid ${COLORS.border}`,
              fontSize: "9px",
              color: COLORS.textMuted,
              textAlign: "center",
            }}
          >
            Powered by Rug Munch Intelligence 🗿
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskBadge;
