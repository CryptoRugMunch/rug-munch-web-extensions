/**
 * Scan Result → json-render Spec Converter
 *
 * Converts API scan response data into a json-render flat spec
 * that can be rendered by any surface using the Rug Munch catalog.
 *
 * This is the bridge between raw data and visual UI.
 */

import type { ScanResult } from "../services/api";

interface RMElement {
  type: string;
  props: Record<string, any>;
  children: string[];
  on?: Record<string, { action: string; params?: Record<string, any> }>;
}

interface RMSpec {
  root: string;
  elements: Record<string, RMElement>;
}

// ─── Helpers ────────────────────────────────────────────────────

function riskLabel(score: number): string {
  if (score >= 75) return "High Risk";
  if (score >= 50) return "Elevated";
  if (score >= 25) return "Moderate";
  return "Low Risk";
}

function riskEmoji(score: number): string {
  if (score >= 75) return "🔴";
  if (score >= 50) return "🟠";
  if (score >= 25) return "🟡";
  return "🟢";
}

function formatUsd(v: number | undefined | null): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatPrice(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.000001) return `$${v.toExponential(2)}`;
  if (v < 0.01) return `$${v.toFixed(8)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function formatAge(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days < 1) return "<1d";
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

type Severity = "critical" | "high" | "moderate" | "safe" | "info";

function scoreSeverity(score: number): Severity {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
  return "safe";
}

// Compute severity score per breakdown category for donut segments
function categoryScore(items: Array<{ severity: string }>): { severity: Severity; value: number } {
  const weights: Record<string, number> = { critical: 4, high: 3, moderate: 2, safe: 0.5, info: 0 };
  let total = 0;
  for (const item of items) {
    total += weights[item.severity] || 0;
  }
  const avg = items.length > 0 ? total / items.length : 0;
  const severity: Severity = avg >= 3 ? "critical" : avg >= 2 ? "high" : avg >= 1 ? "moderate" : "safe";
  return { severity, value: Math.max(total, 1) };
}

// ─── Main Converter ─────────────────────────────────────────────

export function scanToSpec(data: ScanResult, options?: {
  compact?: boolean;
  showActions?: boolean;
  showBreakdown?: boolean;
}): RMSpec {
  const opts = { compact: false, showActions: true, showBreakdown: true, ...options };
  const score = data.risk_score ?? 0;
  const elements: RMSpec["elements"] = {};
  const rootChildren: string[] = [];

  // ── Token Header ──────────────────────────────────────────
  elements["header"] = {
    type: "TokenHeader",
    props: {
      name: data.token_name || "Unknown Token",
      symbol: data.token_symbol || "???",
      chain: data.chain || "solana",
      age: formatAge(data.token_age_days),
      address: data.token_address,
    },
    children: [],
  };
  rootChildren.push("header");

  // ── Alerts (honeypot, freeze, mint authority) ─────────────
  if (data.freeze_authority) {
    elements["alert-freeze"] = {
      type: "AlertBanner",
      props: { type: "critical", title: "Freeze Authority Active", message: "Token creator can freeze your tokens at any time." },
      children: [],
    };
    rootChildren.push("alert-freeze");
  }
  if (data.mint_authority) {
    elements["alert-mint"] = {
      type: "AlertBanner",
      props: { type: "warning", title: "Mint Authority Active", message: "Token creator can mint unlimited new tokens, diluting supply." },
      children: [],
    };
    rootChildren.push("alert-mint");
  }

  // ── Donut Chart ───────────────────────────────────────────
  const rb: Record<string, any> = (data.risk_breakdown || {}) as Record<string, any>;
  const categoryConfig: Array<{ key: string; label: string; color: string }> = [
    { key: "contract_security", label: "Contract", color: "#FF4757" },
    { key: "liquidity_health", label: "Liquidity", color: "#FF8C00" },
    { key: "holder_distribution", label: "Holders", color: "#E7C55F" },
    { key: "trading_activity", label: "Trading", color: "#5FDDE7" },
    { key: "deployer_intelligence", label: "Deployer", color: "#7E4CFF" },
    { key: "advanced_signals", label: "Signals", color: "#2ED573" },
  ];

  const segments = categoryConfig
    .filter(c => rb[c.key]?.items?.length > 0)
    .map(c => {
      const { severity, value } = categoryScore(rb[c.key].items);
      return { label: c.label, value, color: c.color, severity };
    });

  // If no breakdown data, create a single segment from overall score
  if (segments.length === 0) {
    segments.push({
      label: "Overall",
      value: score,
      color: riskEmoji(score) === "🔴" ? "#FF4757" : riskEmoji(score) === "🟠" ? "#FF8C00" : riskEmoji(score) === "🟡" ? "#E7C55F" : "#2ED573",
      severity: scoreSeverity(score),
    });
  }

  elements["donut"] = {
    type: "DonutChart",
    props: { segments, centerScore: score, size: opts.compact ? 90 : 120 },
    children: [],
  };
  rootChildren.push("donut");

  // ── Risk label ────────────────────────────────────────────
  elements["risk-label"] = {
    type: "Text",
    props: {
      content: `${riskEmoji(score)} ${riskLabel(score)}`,
      size: "md",
      weight: "bold",
      align: "center",
      color: score >= 50 ? "primary" : "secondary",
    },
    children: [],
  };
  rootChildren.push("risk-label");

  elements["div-1"] = { type: "Divider", props: { spacing: 8 }, children: [] };
  rootChildren.push("div-1");

  // ── Key Metrics Grid ──────────────────────────────────────
  const metrics: Array<{ id: string; label: string; value: string; severity: string }> = [
    { id: "m-price", label: "Price", value: data.price_usd ? formatPrice(data.price_usd) : "—", severity: "neutral" },
    { id: "m-mcap", label: "Market Cap", value: formatUsd(data.market_cap), severity: "neutral" },
    { id: "m-liq", label: "Liquidity", value: formatUsd(data.liquidity_usd), severity: data.liquidity_usd && data.liquidity_usd < 10000 ? "high" : "neutral" },
    { id: "m-holders", label: "Holders", value: data.holder_count ? data.holder_count.toLocaleString() : "—", severity: "neutral" },
  ];

  if (!opts.compact) {
    if (data.top_10_holder_percent) {
      metrics.push({
        id: "m-top10", label: "Top 10%",
        value: `${data.top_10_holder_percent.toFixed(1)}%`,
        severity: data.top_10_holder_percent > 50 ? "high" : data.top_10_holder_percent > 30 ? "moderate" : "safe",
      });
    }
    if (data.volume_24h) {
      metrics.push({
        id: "m-vol", label: "24h Volume",
        value: formatUsd(data.volume_24h),
        severity: "neutral",
      });
    }
    if (data.txns_24h_buys != null && data.txns_24h_sells != null) {
      const total = data.txns_24h_buys + data.txns_24h_sells;
      const buyPct = total > 0 ? Math.round((data.txns_24h_buys / total) * 100) : 50;
      metrics.push({
        id: "m-txns", label: "24h Buys/Sells",
        value: `${data.txns_24h_buys}/${data.txns_24h_sells} (${buyPct}% buy)`,
        severity: buyPct < 30 ? "high" : buyPct > 70 ? "moderate" : "neutral",
      });
    }
    if (data.price_change_24h != null) {
      metrics.push({
        id: "m-change", label: "24h Change",
        value: `${data.price_change_24h > 0 ? "+" : ""}${data.price_change_24h.toFixed(1)}%`,
        severity: data.price_change_24h < -30 ? "high" : data.price_change_24h < -10 ? "moderate" : "neutral",
      });
    }
  }

  // Pad to even count for 2-col grid
  if (metrics.length % 2 !== 0) {
    metrics.push({ id: "m-pad", label: "Age", value: formatAge(data.token_age_days), severity: "neutral" });
  }

  const metricIds = metrics.map(m => m.id);
  for (const m of metrics) {
    elements[m.id] = {
      type: "MetricItem",
      props: { label: m.label, value: m.value, severity: m.severity, format: "text" },
      children: [],
    };
  }
  elements["metrics"] = {
    type: "MetricGrid",
    props: { columns: 2 },
    children: metricIds,
  };
  rootChildren.push("metrics");

  // ── Risk Factors (quick flags) ────────────────────────────
  if (data.risk_factors && data.risk_factors.length > 0) {
    elements["div-2"] = { type: "Divider", props: { spacing: 6 }, children: [] };
    rootChildren.push("div-2");

    for (let i = 0; i < Math.min(data.risk_factors.length, 5); i++) {
      elements[`rf-${i}`] = {
        type: "Text",
        props: { content: `⚠️ ${data.risk_factors[i]}`, size: "sm", color: "secondary" },
        children: [],
      };
      rootChildren.push(`rf-${i}`);
    }
  }

  // ── Detailed Breakdown ────────────────────────────────────
  if (opts.showBreakdown && Object.keys(rb).length > 0) {
    elements["div-3"] = { type: "Divider", props: { spacing: 8 }, children: [] };
    rootChildren.push("div-3");

    elements["breakdown-label"] = {
      type: "Text",
      props: { content: "Detailed Analysis", size: "sm", weight: "bold", color: "muted" },
      children: [],
    };
    rootChildren.push("breakdown-label");

    const catIcons: Record<string, string> = {
      contract_security: "🔒",
      liquidity_health: "💧",
      holder_distribution: "👥",
      trading_activity: "📊",
      deployer_intelligence: "🔍",
      advanced_signals: "⚡",
    };

    for (const cfg of categoryConfig) {
      const cat = rb[cfg.key];
      if (!cat?.items?.length) continue;

      const { severity: worstSev } = categoryScore(cat.items);
      const catId = `cat-${cfg.key}`;
      const metricChildren: string[] = [];

      for (let i = 0; i < cat.items.length; i++) {
        const item = cat.items[i];
        const metricId = `${catId}-m${i}`;
        elements[metricId] = {
          type: "RiskMetric",
          props: {
            metric: item.metric,
            value: item.value,
            severity: item.severity,
            explanation: item.explanation,
          },
          children: [],
        };
        metricChildren.push(metricId);
      }

      elements[catId] = {
        type: "CategoryBreakdown",
        props: {
          category: cfg.key,
          label: cat.label || cfg.label,
          icon: catIcons[cfg.key] || "📋",
          itemCount: cat.items.length,
          worstSeverity: worstSev,
        },
        children: metricChildren,
      };
      rootChildren.push(catId);
    }
  }

  // ── Actions ───────────────────────────────────────────────
  if (opts.showActions) {
    elements["div-actions"] = { type: "Divider", props: { spacing: 8 }, children: [] };
    rootChildren.push("div-actions");

    elements["btn-share"] = {
      type: "ActionButton",
      props: { label: "Share", icon: "📤", variant: "secondary", action: "share_result" },
      children: [],
      on: { press: { action: "share_result" } },
    };
    elements["btn-chat"] = {
      type: "ActionButton",
      props: { label: "Ask Marcus", icon: "🗿", variant: "primary", action: "open_chat" },
      children: [],
      on: { press: { action: "open_chat" } },
    };
    elements["actions"] = {
      type: "ActionRow",
      props: { align: "stretch" },
      children: ["btn-share", "btn-chat"],
    };
    rootChildren.push("actions");
  }

  // ── Address Footer ────────────────────────────────────────
  elements["address"] = {
    type: "Text",
    props: {
      content: data.token_address,
      size: "xs", color: "muted", mono: true, align: "center",
    },
    children: [],
  };
  rootChildren.push("address");

  // ── Branding ──────────────────────────────────────────────
  elements["brand"] = {
    type: "Text",
    props: {
      content: "Powered by Rug Munch Intelligence 🗿",
      size: "xs", color: "muted", align: "center",
    },
    children: [],
  };
  rootChildren.push("brand");

  // ── Root ──────────────────────────────────────────────────
  elements["root"] = {
    type: "ScoreCard",
    props: {
      score,
      label: riskLabel(score),
      emoji: riskEmoji(score),
      tokenName: data.token_name || "Unknown",
      tokenSymbol: data.token_symbol || "???",
      tokenAddress: data.token_address,
      chain: data.chain || "solana",
    },
    children: rootChildren,
  };

  return { root: "root", elements };
}

/**
 * Compact variant for content script injection.
 * Donut + key metrics only, no breakdown or actions.
 */
export function scanToCompactSpec(data: ScanResult): RMSpec {
  return scanToSpec(data, { compact: true, showActions: false, showBreakdown: false });
}
