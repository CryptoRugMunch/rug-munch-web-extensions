/**
 * Content Script Card Injector
 *
 * Injects a scan ScoreCard into host pages via Shadow DOM.
 * Uses direct React rendering (no json-render) for reliability.
 */

import { createRoot } from "react-dom/client";
import { createElement, useState } from "react";
import type { ScanResult } from "../services/api";

const C = {
  bg: "#0B0714", bgCard: "#13101D", border: "#2A2440",
  gold: "#E7C55F", purple: "#7E4CFF", purpleLight: "#A78BFA",
  cyan: "#5FDDE7", red: "#FF4757", orange: "#FF8C00", green: "#2ED573",
  textPrimary: "#F0EDF6", textSecondary: "#A09BB0", textMuted: "#6B6580",
};

function riskColor(s: number) { return s >= 75 ? C.red : s >= 50 ? C.orange : s >= 25 ? C.gold : C.green; }
function riskEmoji(s: number) { return s >= 75 ? "🔴" : s >= 50 ? "🟠" : s >= 25 ? "🟡" : "🟢"; }
function riskLabel(s: number) { return s >= 75 ? "Critical" : s >= 50 ? "High" : s >= 25 ? "Moderate" : "Low"; }
function fmtUsd(v?: number) { if (!v) return "—"; if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`; if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`; return `$${v.toFixed(2)}`; }
function fmtPrice(v: number) { if (v === 0) return "0"; if (v < 0.000001) return v.toExponential(2); if (v < 0.01) return v.toFixed(8); if (v < 1) return v.toFixed(4); return v.toFixed(2); }

const injectedCards = new Map<string, { root: any; host: HTMLElement }>();

function ScoreCard({ data }: { data: ScanResult }) {
  const [expanded, setExpanded] = useState(false);
  const score = data.risk_score ?? 0;
  const color = riskColor(score);
  const breakdown = data.risk_breakdown;
  const hasBreakdown = breakdown && Object.keys(breakdown).length > 0;

  return createElement("div", {
    style: { fontFamily: "system-ui, -apple-system, sans-serif", backgroundColor: C.bg, borderRadius: 12, border: `1px solid ${color}40`, padding: 14, color: C.textPrimary, maxWidth: 340, boxSizing: "border-box", boxShadow: `0 4px 20px ${color}15` },
  },
    // Header
    createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } },
      createElement("div", null,
        createElement("div", { style: { fontWeight: 700, fontSize: 15 } }, `$${data.token_symbol || "?"}`),
        createElement("div", { style: { fontSize: 10, color: C.textSecondary } }, data.token_name || "", data.chain ? ` · ${data.chain}` : ""),
      ),
      createElement("div", { style: { textAlign: "right" } },
        createElement("div", { style: { fontSize: 22, fontWeight: 800, color } }, riskEmoji(score)),
        createElement("div", { style: { fontSize: 11, color, fontWeight: 600 } }, `${score}/100 — ${riskLabel(score)}`),
      ),
    ),

    // Risk bar
    createElement("div", { style: { width: "100%", height: 5, backgroundColor: C.border, borderRadius: 3, marginBottom: 10 } },
      createElement("div", { style: { width: `${score}%`, height: "100%", backgroundColor: color, borderRadius: 3 } }),
    ),

    // Metrics
    createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 } },
      ...[
        ["Price", data.price_usd ? `$${fmtPrice(data.price_usd)}` : "—"],
        ["MCap", fmtUsd(data.market_cap)],
        ["Liquidity", fmtUsd(data.liquidity_usd)],
        ["Holders", data.holder_count ? data.holder_count.toLocaleString() : "—"],
        ["Top 10%", data.top_10_holder_percent ? `${data.top_10_holder_percent.toFixed(1)}%` : "—"],
        ["Age", data.token_age_days != null ? (data.token_age_days < 1 ? "<1d" : `${Math.floor(data.token_age_days)}d`) : "—"],
      ].map(([label, value]) =>
        createElement("div", { key: label, style: { padding: "5px 8px", borderRadius: 6, backgroundColor: C.bgCard, border: `1px solid ${C.border}` } },
          createElement("div", { style: { fontSize: 9, color: C.textMuted } }, label),
          createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, value),
        )
      ),
    ),

    // Risk factors
    data.risk_factors && data.risk_factors.length > 0
      ? createElement("div", { style: { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` } },
          createElement("div", { style: { fontSize: 9, color: C.textMuted, marginBottom: 3 } }, "⚠️ Risk Factors"),
          ...data.risk_factors.slice(0, 5).map((f: string, i: number) =>
            createElement("div", { key: i, style: { fontSize: 10, color: C.orange, paddingLeft: 6 } }, `• ${f}`)
          ),
        )
      : null,

    // Expandable breakdown
    hasBreakdown
      ? createElement("div", { style: { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` } },
          createElement("div", {
            onClick: () => setExpanded(!expanded),
            style: { fontSize: 10, color: C.purpleLight, cursor: "pointer", textAlign: "center", padding: "4px 0" },
          }, expanded ? "▲ Hide Details" : "▼ Show Details"),
          expanded ? createElement("div", { style: { marginTop: 6, display: "flex", flexDirection: "column", gap: 4 } },
            ...Object.entries(breakdown!).map(([cat, catData]: [string, any]) =>
              createElement("div", { key: cat, style: { padding: "6px 8px", borderRadius: 6, backgroundColor: C.bgCard } },
                createElement("div", { style: { fontSize: 10, fontWeight: 600, color: C.textSecondary, marginBottom: 3 } }, cat.replace(/_/g, " ").toUpperCase()),
                ...(catData?.items || []).slice(0, 6).map((item: any, i: number) => {
                  const sevColor = item.severity === "critical" ? C.red : item.severity === "high" ? C.orange : item.severity === "moderate" ? C.gold : item.severity === "safe" ? C.green : C.textSecondary;
                  return createElement("div", { key: i, style: { display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0" } },
                    createElement("span", { style: { color: C.textPrimary } }, item.metric || item.label),
                    createElement("span", { style: { color: sevColor, fontWeight: 600 } }, item.value),
                  );
                }),
              )
            ),
          ) : null,
        )
      : null,

    // Actions
    createElement("div", { style: { display: "flex", gap: 4, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` } },
      ...[
        { label: "📋 Copy", action: () => navigator.clipboard.writeText(data.token_address) },
        { label: "🔍 Explorer", action: () => window.open(`https://solscan.io/token/${data.token_address}`, "_blank") },
        { label: "📤 Share", action: () => {
          navigator.clipboard.writeText(`${riskEmoji(score)} $${data.token_symbol || "?"} Risk: ${score}/100\nPrice: ${data.price_usd ? `$${fmtPrice(data.price_usd)}` : "—"} | Liq: ${fmtUsd(data.liquidity_usd)}\nScanned by Rug Munch Intelligence 🗿 https://t.me/rug_munchy_bot`);
        }},
      ].map(btn =>
        createElement("button", {
          key: btn.label, onClick: btn.action,
          style: { flex: 1, padding: "5px 0", borderRadius: 5, border: `1px solid ${C.border}`, backgroundColor: "transparent", color: C.textSecondary, fontSize: 10, cursor: "pointer", fontFamily: "system-ui" },
        }, btn.label)
      ),
    ),

    // Full address
    createElement("div", {
      style: { marginTop: 6, fontSize: 8, fontFamily: "monospace", color: C.textMuted, wordBreak: "break-all", cursor: "pointer" },
      onClick: () => navigator.clipboard.writeText(data.token_address),
      title: "Click to copy",
    }, data.token_address),
  );
}

export function injectScoreCard(
  id: string,
  targetElement: Element,
  data: ScanResult,
  options?: { compact?: boolean; position?: "after" | "float-right" | "float-left" }
): void {
  if (injectedCards.has(id)) return;

  const pos = options?.position || "float-right";
  const host = document.createElement("div");
  host.id = `rms-card-${id}`;

  if (pos === "float-right") {
    host.style.cssText = `position: fixed; top: 80px; right: 12px; z-index: 999999; max-height: calc(100vh - 100px); overflow-y: auto; scrollbar-width: thin;`;
  } else if (pos === "float-left") {
    host.style.cssText = `position: fixed; top: 80px; left: 12px; z-index: 999999; max-height: calc(100vh - 100px); overflow-y: auto; scrollbar-width: thin;`;
  } else {
    host.style.cssText = "display: block; margin: 8px 0;";
  }

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; display: block; font-family: system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
    @keyframes rms-fadein { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    .rms-card-wrapper { animation: rms-fadein 0.3s ease-out; }
  `;
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.className = "rms-card-wrapper";
  shadow.appendChild(wrapper);

  const mountPoint = document.createElement("div");
  wrapper.appendChild(mountPoint);

  if (pos === "after") {
    targetElement.parentElement?.insertBefore(host, targetElement.nextSibling);
  } else {
    document.body.appendChild(host);
  }

  const root = createRoot(mountPoint);
  root.render(createElement(ScoreCard, { data }));
  injectedCards.set(id, { root, host });
}

export function removeCard(id: string): void {
  const entry = injectedCards.get(id);
  if (entry) { entry.root.unmount(); entry.host.remove(); injectedCards.delete(id); }
}

export function removeAllCards(): void {
  for (const [id] of injectedCards) removeCard(id);
}
