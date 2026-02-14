/**
 * Risk breakdown item — a single metric with educational context.
 */
export interface RiskMetricItem {
  metric: string;
  value: string;
  severity: "critical" | "high" | "moderate" | "safe" | "info";
  explanation: string;
}

/**
 * Risk breakdown category — a group of related metrics.
 */
export interface RiskCategory {
  title: string;
  icon: string;
  items: RiskMetricItem[];
}

/**
 * Full risk breakdown — all categories returned by the API.
 */
export interface RiskBreakdown {
  contract_security?: RiskCategory;
  holder_distribution?: RiskCategory;
  trading_activity?: RiskCategory;
  deployer_intelligence?: RiskCategory;
  advanced_signals?: RiskCategory;
  liquidity_health?: RiskCategory;
}
