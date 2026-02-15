/**
 * Rug Munch Intelligence — json-render Component Catalog
 *
 * Single source of truth for all UI components across:
 * - Extension content scripts (DexScreener, Pump.fun, etc.)
 * - Extension popup
 * - Mini App (Telegram WebApp)
 * - Marcus Chat (extension side panel + mini app)
 * - Agent API consumers
 *
 * Marcus AI generates specs constrained to this catalog.
 * Every surface renders the same components with platform-appropriate styling.
 */

import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

export const rugMunchCatalog = defineCatalog(schema, {
  components: {
    // ─── Layout ────────────────────────────────────────────
    ScoreCard: {
      props: z.object({
        score: z.number().min(0).max(100),
        label: z.string(),       // "High Risk", "Moderate", etc.
        emoji: z.string(),       // "🔴", "🟡", etc.
        tokenName: z.string(),
        tokenSymbol: z.string(),
        tokenAddress: z.string(),
        chain: z.string().default("solana"),
      }),
      description: "Main risk score card with donut chart showing overall risk score and token identity. Always the root container for scan results.",
    },

    DonutChart: {
      props: z.object({
        segments: z.array(z.object({
          label: z.string(),
          value: z.number(),
          color: z.string(),
          severity: z.enum(["critical", "high", "moderate", "safe", "info"]),
        })),
        centerScore: z.number().min(0).max(100),
        size: z.number().default(120),
      }),
      description: "SVG donut/ring chart showing risk distribution across categories. Center displays the overall risk score.",
    },

    MetricGrid: {
      props: z.object({
        columns: z.number().min(1).max(4).default(2),
      }),
      description: "Grid layout for key-value metric items. Use with MetricItem children.",
    },

    MetricItem: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        format: z.enum(["currency", "percent", "number", "text", "age"]).default("text"),
        severity: z.enum(["critical", "high", "moderate", "safe", "info", "neutral"]).default("neutral"),
      }),
      description: "Single metric with label and value. Severity controls color coding.",
    },

    RiskBar: {
      props: z.object({
        value: z.number().min(0).max(100),
        label: z.string().optional(),
        showValue: z.boolean().default(true),
      }),
      description: "Horizontal progress bar showing a 0-100 risk score with color gradient.",
    },

    CategoryBreakdown: {
      props: z.object({
        category: z.string(),
        label: z.string(),
        icon: z.string(),
        itemCount: z.number(),
        worstSeverity: z.enum(["critical", "high", "moderate", "safe", "info"]),
      }),
      description: "Expandable category section in risk breakdown. Children are RiskMetric items.",
    },

    RiskMetric: {
      props: z.object({
        metric: z.string(),
        value: z.string(),
        severity: z.enum(["critical", "high", "moderate", "safe", "info"]),
        explanation: z.string().optional(),
      }),
      description: "Individual risk metric within a category breakdown. Shows metric name, value, severity dot, and optional explanation.",
    },

    AlertBanner: {
      props: z.object({
        type: z.enum(["critical", "warning", "info", "success"]),
        title: z.string(),
        message: z.string(),
      }),
      description: "Alert/warning banner. Use for honeypot detection, rug warnings, or notable findings.",
    },

    TokenHeader: {
      props: z.object({
        name: z.string(),
        symbol: z.string(),
        chain: z.string(),
        age: z.string().optional(),
        address: z.string(),
      }),
      description: "Token identity header with name, symbol, chain badge, and age.",
    },

    ActionRow: {
      props: z.object({
        align: z.enum(["left", "center", "right", "stretch"]).default("stretch"),
      }),
      description: "Container for action buttons. Use with ActionButton children.",
    },

    ActionButton: {
      props: z.object({
        label: z.string(),
        icon: z.string().optional(),
        variant: z.enum(["primary", "secondary", "ghost"]).default("secondary"),
        action: z.string(),
      }),
      description: "Clickable action button that triggers a registered action.",
    },

    Divider: {
      props: z.object({
        spacing: z.number().default(8),
      }),
      description: "Visual separator between sections.",
    },

    Badge: {
      props: z.object({
        text: z.string(),
        color: z.string().optional(),
        variant: z.enum(["filled", "outline"]).default("filled"),
      }),
      description: "Small inline badge/chip for status or labels.",
    },

    Text: {
      props: z.object({
        content: z.string(),
        size: z.enum(["xs", "sm", "md", "lg"]).default("md"),
        color: z.enum(["primary", "secondary", "muted", "accent"]).default("primary"),
        weight: z.enum(["normal", "medium", "bold"]).default("normal"),
        align: z.enum(["left", "center", "right"]).default("left"),
        mono: z.boolean().default(false),
      }),
      description: "Styled text block. Use for any text content.",
    },

    Row: {
      props: z.object({
        gap: z.number().default(8),
        align: z.enum(["start", "center", "end", "between"]).default("start"),
      }),
      description: "Horizontal flex row for layout.",
    },

    Column: {
      props: z.object({
        gap: z.number().default(8),
      }),
      description: "Vertical flex column for layout.",
    },
  },

  actions: {
    full_scan: {
      description: "Open the full scan view in the extension side panel",
    },
    share_result: {
      description: "Copy a shareable text summary of the scan result to clipboard",
    },
    copy_address: {
      description: "Copy the token contract address to clipboard",
    },
    open_explorer: {
      description: "Open the token on a block explorer (Solscan, Etherscan, etc.)",
    },
    add_watchlist: {
      description: "Add the token to the user's watchlist",
    },
    open_chat: {
      description: "Open Marcus AI chat about this token",
    },
  },
});

export type RMCatalog = typeof rugMunchCatalog;
