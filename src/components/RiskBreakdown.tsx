/**
 * RiskBreakdown — Expandable detailed risk analysis view.
 * 
 * Shows categorized risk metrics with severity indicators and 
 * plain-English explanations of what each metric means and why it matters.
 */

import React, { useState } from "react";
import { COLORS } from "../utils/designTokens";
import type { RiskBreakdown as RiskBreakdownType, RiskCategory, RiskMetricItem } from "../types/scan";

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  critical: { color: COLORS.red, bg: `${COLORS.red}15`, label: "Critical", icon: "🔴" },
  high: { color: COLORS.orange, bg: `${COLORS.orange}15`, label: "High Risk", icon: "🟠" },
  moderate: { color: COLORS.gold, bg: `${COLORS.gold}15`, label: "Moderate", icon: "🟡" },
  safe: { color: COLORS.green, bg: `${COLORS.green}15`, label: "Safe", icon: "🟢" },
  info: { color: COLORS.cyan, bg: `${COLORS.cyan}10`, label: "Info", icon: "ℹ️" },
};

const CATEGORY_ORDER: Array<keyof RiskBreakdownType> = [
  "contract_security",
  "liquidity_health",
  "holder_distribution",
  "trading_activity",
  "deployer_intelligence",
  "advanced_signals",
];

interface Props {
  breakdown: RiskBreakdownType;
}

const RiskBreakdownView: React.FC<Props> = ({ breakdown }) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const categories: Array<{ key: string; data: RiskCategory }> = [];
  for (const key of CATEGORY_ORDER) {
    const cat = breakdown[key];
    if (cat && cat.items && cat.items.length > 0) {
      categories.push({ key, data: cat });
    }
  }

  if (categories.length === 0) {
    return (
      <div style={{ padding: 12, textAlign: "center", color: COLORS.textMuted, fontSize: 11 }}>
        No detailed breakdown available for this token.
      </div>
    );
  }

  const getCategorySeverity = (items: RiskMetricItem[]): string => {
    const rank: Record<string, number> = { critical: 4, high: 3, moderate: 2, info: 1, safe: 0 };
    let worst = "safe";
    for (const item of items) {
      if ((rank[item.severity] || 0) > (rank[worst] || 0)) worst = item.severity;
    }
    return worst;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Summary header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 0 4px", borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textPrimary }}>
          🔍 Risk Analysis
        </span>
        <span style={{ fontSize: 9, color: COLORS.textMuted }}>
          {categories.reduce((sum, c) => sum + c.data.items.length, 0)} metrics analyzed
        </span>
      </div>

      {/* Quick severity pills */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
        {categories.map(({ key, data }) => {
          const sev = getCategorySeverity(data.items);
          const config = SEVERITY_CONFIG[sev];
          return (
            <button
              key={key}
              onClick={() => setExpandedCategory(expandedCategory === key ? null : key)}
              style={{
                padding: "3px 8px", borderRadius: 12,
                backgroundColor: expandedCategory === key ? config.bg : `${COLORS.border}80`,
                border: `1px solid ${expandedCategory === key ? config.color : COLORS.border}40`,
                color: expandedCategory === key ? config.color : COLORS.textSecondary,
                fontSize: 9, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 3,
                transition: "all 0.15s",
              }}
            >
              <span>{data.icon}</span>
              <span>{data.title.split(" ")[0]}</span>
              <span style={{ fontSize: 8 }}>{config.icon}</span>
            </button>
          );
        })}
      </div>

      {/* Category sections */}
      {categories.map(({ key, data }) => {
        const isExpanded = expandedCategory === key;
        const catSev = getCategorySeverity(data.items);
        const catConfig = SEVERITY_CONFIG[catSev];

        return (
          <div key={key} style={{
            borderRadius: 8,
            border: `1px solid ${isExpanded ? catConfig.color : COLORS.border}30`,
            backgroundColor: isExpanded ? catConfig.bg : "transparent",
            overflow: "hidden",
            transition: "all 0.2s",
          }}>
            {/* Category header */}
            <button
              onClick={() => {
                setExpandedCategory(isExpanded ? null : key);
                setExpandedItem(null);
              }}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", background: "none", border: "none",
                cursor: "pointer", color: COLORS.textPrimary,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>{data.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{data.title}</span>
                <span style={{
                  fontSize: 8, padding: "1px 5px", borderRadius: 8,
                  backgroundColor: catConfig.bg, color: catConfig.color,
                  fontWeight: 600,
                }}>
                  {catConfig.label}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 9, color: COLORS.textMuted }}>{data.items.length}</span>
                <span style={{
                  fontSize: 10, color: COLORS.textMuted,
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 0.2s",
                  display: "inline-block",
                }}>▼</span>
              </div>
            </button>

            {/* Expanded items */}
            {isExpanded && (
              <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                {data.items.map((item, idx) => {
                  const itemKey = `${key}-${idx}`;
                  const isItemExpanded = expandedItem === itemKey;
                  const itemConfig = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.info;

                  return (
                    <div key={idx} style={{
                      borderRadius: 6,
                      backgroundColor: COLORS.bgCard,
                      border: `1px solid ${isItemExpanded ? itemConfig.color : COLORS.border}25`,
                      overflow: "hidden",
                    }}>
                      {/* Metric row */}
                      <button
                        onClick={() => setExpandedItem(isItemExpanded ? null : itemKey)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "6px 8px", background: "none", border: "none",
                          cursor: "pointer", color: COLORS.textPrimary, gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 8, flexShrink: 0 }}>{itemConfig.icon}</span>
                          <span style={{ fontSize: 10, color: COLORS.textSecondary, flexShrink: 0 }}>
                            {item.metric}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: itemConfig.color,
                            fontFamily: item.metric === "Deployer" ? "monospace" : "inherit",
                            maxWidth: item.metric === "Deployer" ? 120 : 160,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            textAlign: "right" as const,
                          }}>
                            {item.value}
                          </span>
                          <span style={{
                            fontSize: 8, color: COLORS.textMuted,
                            transform: isItemExpanded ? "rotate(180deg)" : "rotate(0)",
                            transition: "transform 0.15s",
                            display: "inline-block",
                          }}>▼</span>
                        </div>
                      </button>

                      {/* Explanation */}
                      {isItemExpanded && (
                        <div style={{
                          padding: "4px 8px 8px",
                          borderTop: `1px solid ${COLORS.border}40`,
                        }}>
                          <p style={{
                            fontSize: 10, lineHeight: 1.5,
                            color: COLORS.textSecondary,
                            margin: 0,
                          }}>
                            {item.explanation}
                          </p>
                          {item.metric === "Deployer" && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(item.value);
                              }}
                              style={{
                                marginTop: 4, padding: "4px 6px",
                                backgroundColor: `${COLORS.border}40`, borderRadius: 4,
                                fontSize: 9, fontFamily: "monospace",
                                color: COLORS.cyan, cursor: "pointer",
                                wordBreak: "break-all" as const,
                              }}
                              title="Click to copy"
                            >
                              {item.value}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RiskBreakdownView;
