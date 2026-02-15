/**
 * Extension Popup — Quick scan + account overview.
 *
 * Width: 380px, Height: ~520px
 * Features:
 * - Paste CA for instant scan
 * - Current page auto-detection
 * - Account tier display
 * - Link to Telegram
 * - Recent scans
 */

import React, { useState, useEffect, useCallback } from "react";
import Settings from "./Settings";
import Upgrade from "./Upgrade";
import Referral from "./Referral";
import Reputation from "./Reputation";
import Social from "./Social";
import Onboarding from "./Onboarding";
import MarcusChat from "./MarcusChat";
import { scanToken, type ScanResult, type ExtScanResponse } from "../services/api";
import { trackScan } from "../services/analytics";
import { riskColor, riskLabel, riskEmoji, COLORS } from "../utils/designTokens";
import RiskBreakdownView from "../components/RiskBreakdown";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { RenderErrorBoundary } from "../ui-catalog/ErrorBoundary";
import { registry, scanToSpec } from "../ui-catalog";
import { extractMintFromUrl } from "../utils/shadowInject";
import { useAutoLink } from "../hooks/useAutoLink";

const Popup: React.FC = () => {
  const [view, setView] = useState<"main" | "settings" | "onboarding" | "upgrade" | "referral" | "reputation" | "social" | "marcus">("main");
  const [, setHasOnboarded] = useState(true);
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [notScanned, setNotScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState("free");
  const [scanCount, setScanCount] = useState(0);
  const [linked, setLinked] = useState(false);
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [scansToday, setScansToday] = useState<number | null>(null);
  const [activeTabMint, setActiveTabMint] = useState<string | null>(null);
  const autoLink = useAutoLink();

  // Check onboarding
  useEffect(() => {
    chrome.storage.local.get("onboarded", (data) => {
      if (!data.onboarded) {
        setHasOnboarded(false);
        setView("onboarding");
      }
    });
  }, []);

  // Load state + listen for changes (tier sync after linking)
  useEffect(() => {
    chrome.storage.local.get(["tier", "scan_count", "linked_telegram", "auth_token"], (data) => {
      setTier(data.tier || "free");
      setScanCount(data.scan_count || 0);
      setLinked(!!data.linked_telegram);

      // Fetch real usage from server
      if (data.auth_token) {
        import("../utils/config").then(({ getApiBase }) => {
          getApiBase().then(base => {
            fetch(`${base}/ext/tier`, {
              headers: { "Authorization": `Bearer ${data.auth_token}` }
            })
            .then(r => r.ok ? r.json() : null)
            .then(info => {
              if (info) {
                if (info.tier) setTier(info.tier);
                if (info.scans_today != null) setScansToday(info.scans_today);
                if (info.scans_remaining != null) setScansRemaining(info.scans_remaining);
              }
            })
            .catch(() => {});
          });
        });
      }
    });

    // Listen for storage changes (e.g., tier updated after linking)
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.tier) setTier(changes.tier.newValue || "free");
      if (changes.linked_telegram) setLinked(!!changes.linked_telegram.newValue);
      if (changes.scan_count) setScanCount(changes.scan_count.newValue || 0);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Refresh tier periodically (fallback for Safari)
  useEffect(() => {
    const refresh = setInterval(() => {
      chrome.storage.local.get(["tier", "linked_telegram"], (data) => {
        if (data.tier && data.tier !== tier) setTier(data.tier);
        if (data.linked_telegram && !linked) setLinked(true);
      });
    }, 3000);
    return () => clearInterval(refresh);
  }, [tier, linked]);

  useEffect(() => {

    // Check for stored detected_token (from content script PAGE_TOKEN_DETECTED)
    chrome.storage.local.get("detected_token", (data) => {
      const dt = data.detected_token;
      if (dt?.mint && Date.now() - (dt.timestamp || 0) < 60000) {
        // Fresh detection from content script — use it
        if (!activeTabMint) {
          setActiveTabMint(dt.mint);
          setInput(dt.mint);
        }
      }
    });

    // Check for pending scan from context menu
    chrome.storage.local.get("pending_scan", (data) => {
      if (data.pending_scan) {
        setInput(data.pending_scan);
        chrome.storage.local.remove("pending_scan");
        setTimeout(() => {
          const scanBtn = document.querySelector("[data-scan-btn]") as HTMLButtonElement;
          scanBtn?.click();
        }, 100);
      }
    });

    // Detect mint from active tab — ask content script first (DexScreener URL = pair, not token)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) return;
      
      // Try content script first (reliable for DexScreener and other SPAs)
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_TOKEN" }, (resp) => {
          if (chrome.runtime.lastError || !resp?.mint) {
            // Content script not available or no token — fall back to URL
            const mint = extractMintFromUrl(tab.url!);
            if (mint) {
              setActiveTabMint(mint);
              setInput(mint);
            }
            return;
          }
          // Content script found the real token
          setActiveTabMint(resp.mint);
          setInput(resp.mint);
        });
      } else {
        const mint = extractMintFromUrl(tab.url);
        if (mint) {
          setActiveTabMint(mint);
          setInput(mint);
        }
      }
    });
  }, []);

  const handleScan = useCallback(async () => {
    const mint = input.trim();
    if (!mint || mint.length < 32) {
      setError("Enter a valid Solana contract address");
      return;
    }

    setScanning(true);
    setError(null);
    setResult(null);
    setNotScanned(false);

    const resp: ExtScanResponse = await scanToken(mint);
    if (resp.success && resp.data) {
      // Check if the API returned real data vs "not_scanned" placeholder
      if ((resp.data as any).not_scanned && resp.data.risk_score == null) {
        setNotScanned(true);
      } else {
        setResult(resp.data);
        trackScan(mint, "popup");
      }
      setScanCount((c) => c + 1);
      chrome.storage.local.set({ scan_count: scanCount + 1 });
    } else {
      setError(resp.error || "Scan failed");
    }
    setScanning(false);
  }, [input, scanCount]);

  const tierLabel = {
    free: "Free (3/day)",
    free_linked: "Linked (3/day)",
    holder: "Holder (15/day)",
    scout: "Scout (30/day)",
    whale: "Whale ∞",
    analyst: "Analyst ∞",
    syndicate: "Syndicate ∞",
    og: "OG ∞",
    vip: "VIP ∞",
  }[tier] || "Free";

  if (view === "onboarding") {
    return <Onboarding onComplete={() => {
      chrome.storage.local.set({ onboarded: true });
      setHasOnboarded(true);
      setView("main");
    }} />;
  }

  if (view === "settings") {
    return <Settings onBack={() => setView("main")} />;
  }

  if (view === "referral") {
    return <Referral onBack={() => setView("main")} />;
  }

  if (view === "reputation") {
    return <Reputation onBack={() => setView("main")} />;
  }

  if (view === "social") {
    return <Social onBack={() => setView("main")} />;
  }

  if (view === "marcus") {
    return <MarcusChat onBack={() => setView("main")} initialScan={result} initialMint={activeTabMint} />;
  }

  if (view === "upgrade") {
    return <Upgrade onBack={() => setView("main")} currentTier={tier} />;
  }

  return (
    <div style={{
      width: "100%", maxWidth: 440, minHeight: "100%", boxSizing: "border-box" as const,
      backgroundColor: COLORS.bg,
      color: COLORS.textPrimary,
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🗿</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: COLORS.gold }}>Rug Munch Intelligence</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 10,
            backgroundColor: `${COLORS.purple}30`, color: COLORS.purpleLight,
          }}>
            {tierLabel}
          </span>
          {(tier === "free" || tier === "free_linked") && (
            <button
              onClick={() => setView("upgrade")}
              style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 8,
                backgroundColor: `${COLORS.gold}20`, border: `1px solid ${COLORS.gold}40`,
                color: COLORS.gold, cursor: "pointer", fontWeight: 600,
              }}
            >
              ↑
            </button>
          )}
          <button
            onClick={() => setView("marcus")}
            style={{
              background: "none", border: "none", color: COLORS.textSecondary,
              cursor: "pointer", fontSize: 14, padding: 2,
            }}
            title="Marcus AI"
          >🗿</button>
          <button
            onClick={() => setView("social")}
            style={{
              background: "none", border: "none", color: COLORS.textSecondary,
              cursor: "pointer", fontSize: 14, padding: 2,
            }}
            title="Social"
          >👥</button>
          <button
            onClick={() => setView("reputation")}
            style={{
              background: "none", border: "none", color: COLORS.textSecondary,
              cursor: "pointer", fontSize: 14, padding: 2,
            }}
            title="Reputation"
          >🏛️</button>
          <button
            onClick={() => setView("referral")}
            style={{
              background: "none", border: "none", color: COLORS.textSecondary,
              cursor: "pointer", fontSize: 14, padding: 2,
            }}
            title="Referrals"
          >🎁</button>
          <button
            onClick={() => setView("settings")}
            style={{
              background: "none", border: "none", color: COLORS.textSecondary,
              cursor: "pointer", fontSize: 14, padding: 2,
            }}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Scan Input */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          display: "flex", gap: 6,
          backgroundColor: COLORS.bgCard,
          borderRadius: 10, border: `1px solid ${COLORS.border}`,
          padding: 4,
        }}>
          <input
            type="text"
            placeholder="Paste Solana contract address..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
            style={{
              flex: 1, padding: "8px 10px",
              backgroundColor: "transparent", border: "none", outline: "none",
              color: COLORS.textPrimary, fontSize: 12,
              fontFamily: "monospace",
            }}
          />
          <button
            data-scan-btn
            onClick={handleScan}
            disabled={scanning}
            style={{
              padding: "8px 16px", borderRadius: 8,
              backgroundColor: scanning ? COLORS.border : COLORS.purple,
              color: "#fff", border: "none", fontSize: 12,
              fontWeight: 600, cursor: scanning ? "wait" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {scanning ? "Scanning..." : "Scan"}
          </button>
        </div>
        {activeTabMint && input === activeTabMint && (
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, paddingLeft: 4 }}>
            📍 Detected from current page
          </div>
        )}
      </div>

      {/* Scanning animation */}
      {scanning && (
        <div style={{
          padding: 24, textAlign: "center",
          borderRadius: 10, backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8, animation: "pulse 1.5s infinite" }}>🔍</div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary }}>Analyzing token...</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
            First scans take 5-15s. Cached results are instant.
          </div>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: 10, borderRadius: 8,
          backgroundColor: `${COLORS.red}15`, border: `1px solid ${COLORS.red}30`,
          color: COLORS.red, fontSize: 12, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* Not scanned / scan failed state */}
      {notScanned && !scanning && (
        <div style={{
          padding: 16, textAlign: "center",
          borderRadius: 10, backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>❓</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 4 }}>
            Token Not Found
          </div>
          <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 12 }}>
            This token hasn't been scanned yet or couldn't be analyzed.
          </div>
          <button
            onClick={() => {
              window.open(`https://t.me/rug_munchy_bot?start=scan_${input.trim()}`, "_blank");
            }}
            style={{
              padding: "6px 14px", borderRadius: 6,
              backgroundColor: `${COLORS.cyan}20`, border: `1px solid ${COLORS.cyan}40`,
              color: COLORS.cyan, fontSize: 11, cursor: "pointer",
            }}
          >
            🤖 Scan via Telegram Bot
          </button>
          <div style={{
            marginTop: 10, fontSize: 9, fontFamily: "monospace",
            color: COLORS.textMuted, wordBreak: "break-all",
          }}>
            {input.trim()}
          </div>
        </div>
      )}

      {/* Scan Result — json-render ScoreCard */}
      {result && !scanning && (
        <RenderErrorBoundary fallback={<_ScanResultCard result={result} />}>
        
        <JSONUIProvider registry={registry} initialState={{}} handlers={{
          share_result: () => {
            const shareText = `${riskEmoji(result.risk_score ?? 0)} $${result.token_symbol || "?"} Risk: ${result.risk_score ?? "?"}/100\nPrice: ${result.price_usd ? `$${formatPrice(result.price_usd)}` : "—"} | Liq: ${formatUsd(result.liquidity_usd)}\nScanned by Rug Munch Intelligence 🗿 https://t.me/rug_munchy_bot`;
            navigator.clipboard.writeText(shareText);
          },
          copy_address: () => navigator.clipboard.writeText(result.token_address),
          open_explorer: () => window.open(`https://solscan.io/token/${result.token_address}`, "_blank"),
          open_chat: () => setView("marcus"),
          full_scan: () => setView("marcus"),
        }}>
          <Renderer spec={scanToSpec(result) as any} registry={registry} />
        </JSONUIProvider>
        </RenderErrorBoundary>
      )}

      {/* Footer */}
      <div style={{
        marginTop: "auto", paddingTop: 16,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        {!linked ? (
          autoLink.phase === "waiting" ? (
            <span style={{ fontSize: 10, color: COLORS.purple }}>
              ⏳ Waiting for Telegram...
              <button onClick={autoLink.cancel} style={{
                marginLeft: 4, background: "none", border: "none",
                color: COLORS.textMuted, fontSize: 9, cursor: "pointer",
                textDecoration: "underline",
              }}>cancel</button>
            </span>
          ) : autoLink.phase === "success" ? (
            <span style={{ fontSize: 10, color: COLORS.green }}>✅ Telegram linked!</span>
          ) : (
            <button
              onClick={autoLink.start}
              style={{
                padding: "6px 12px", borderRadius: 6,
                backgroundColor: `${COLORS.cyan}20`, border: `1px solid ${COLORS.cyan}40`,
                color: COLORS.cyan, fontSize: 11, cursor: "pointer",
              }}
            >
              🔗 Link Telegram
            </button>
          )
        ) : (
          <span style={{ fontSize: 10, color: COLORS.green }}>✓ Telegram linked</span>
        )}
        <span style={{ fontSize: 10, color: COLORS.textMuted }}>
          {scansToday != null
            ? `${scansToday} scans today${scansRemaining != null ? ` · ${scansRemaining} left` : ""}`
            : `${scanCount} scans today`}
        </span>
      </div>
    </div>
  );
};

// @ts-ignore — kept as fallback
const _ScanResultCard: React.FC<{ result: ScanResult }> = ({ result }) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const score = result.risk_score;
  const color = riskColor(score);
  const label = riskLabel(score);
  const emoji = riskEmoji(score);
  const hasData = score != null;
  const hasBreakdown = result.risk_breakdown && Object.keys(result.risk_breakdown).length > 0;

  return (
    <div style={{
      padding: 14, borderRadius: 10,
      backgroundColor: COLORS.bgCard,
      border: `1px solid ${hasData ? color : COLORS.border}40`,
    }}>
      {/* Token header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {result.token_symbol || "Unknown"}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
            {result.token_name || "Unknown Token"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {hasData ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{emoji}</div>
              <div style={{ fontSize: 10, color, fontWeight: 600 }}>{score}/100 — {label}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22 }}>❓</div>
              <div style={{ fontSize: 10, color: COLORS.textMuted }}>No score</div>
            </>
          )}
        </div>
      </div>

      {/* Risk bar */}
      {hasData && (
        <div style={{
          width: "100%", height: 6,
          backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 12,
        }}>
          <div style={{
            width: `${score}%`, height: "100%",
            backgroundColor: color, borderRadius: 3,
            transition: "width 0.5s",
          }} />
        </div>
      )}

      {/* Metrics grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 8, fontSize: 11,
      }}>
        <MetricRow label="Price" value={result.price_usd ? `$${formatPrice(result.price_usd)}` : "—"} />
        <MetricRow label="Market Cap" value={formatUsd(result.market_cap)} />
        <MetricRow label="Liquidity" value={formatUsd(result.liquidity_usd)} />
        <MetricRow label="Holders" value={result.holder_count ? result.holder_count.toLocaleString() : "—"} />
        <MetricRow label="Top 10 %" value={result.top_10_holder_percent ? `${result.top_10_holder_percent.toFixed(1)}%` : "—"} />
        <MetricRow label="Age" value={result.token_age_days != null ? formatAgeDays(result.token_age_days) : formatAge(result.created_at)} />
      </div>

      {/* Quick risk flags */}
      {result.risk_factors && result.risk_factors.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>⚠️ Risk Factors:</div>
          {result.risk_factors.slice(0, 5).map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: COLORS.orange, paddingLeft: 8 }}>
              • {f}
            </div>
          ))}
        </div>
      )}

      {/* Expand/collapse breakdown toggle */}
      {hasBreakdown && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 6,
              border: `1px solid ${showBreakdown ? color : COLORS.purple}40`,
              backgroundColor: showBreakdown ? `${color}10` : `${COLORS.purple}10`,
              color: showBreakdown ? color : COLORS.purpleLight,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "all 0.2s",
            }}
          >
            <span>{showBreakdown ? "▲" : "▼"}</span>
            <span>{showBreakdown ? "Hide" : "Show"} Detailed Analysis</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>
              ({Object.values(result.risk_breakdown!).reduce((s, c) => s + (c?.items?.length || 0), 0)} metrics)
            </span>
          </button>
        </div>
      )}

      {/* Detailed risk breakdown */}
      {showBreakdown && result.risk_breakdown && (
        <div style={{ marginTop: 8 }}>
          <RiskBreakdownView breakdown={result.risk_breakdown} />
        </div>
      )}

      {/* Live scan indicator */}
      {(result as any).live_scanned && (
        <div style={{
          marginTop: 8, fontSize: 9, color: COLORS.cyan, textAlign: "center",
        }}>
          ⚡ Live scan — fresh data
        </div>
      )}

      {/* Share button */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
        <button
          onClick={() => {
            const shareText = `${emoji} $${result.token_symbol || "?"} Risk: ${score ?? "?"}/100 (${label})\nPrice: ${result.price_usd ? `$${formatPrice(result.price_usd)}` : "—"} | Liq: ${formatUsd(result.liquidity_usd)}\nScanned by Rug Munch Intelligence 🗿 https://t.me/rug_munchy_bot`;
            navigator.clipboard.writeText(shareText);
          }}
          style={{
            width: "100%", padding: "6px 0", borderRadius: 6,
            border: `1px solid ${COLORS.border}`, backgroundColor: "transparent",
            color: COLORS.textSecondary, fontSize: 11, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}
        >
          📤 Share Scan Result
        </button>
      </div>

      {/* Full address */}
      <div style={{
        marginTop: 10, paddingTop: 8, borderTop: `1px solid ${COLORS.border}`,
        fontSize: 9, fontFamily: "monospace", color: COLORS.textMuted,
        wordBreak: "break-all", cursor: "pointer",
      }}
        onClick={() => navigator.clipboard.writeText(result.token_address)}
        title="Click to copy"
      >
        {result.token_address}
      </div>
    </div>
  );
};

const MetricRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between" }}>
    <span style={{ color: COLORS.textMuted }}>{label}</span>
    <span style={{ color: COLORS.textPrimary, fontWeight: 500 }}>{value}</span>
  </div>
);

function formatPrice(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return value.toExponential(2);
  if (value < 0.01) return value.toFixed(8);
  if (value < 1) return value.toFixed(4);
  return value.toFixed(2);
}

function formatUsd(value: number | undefined): string {
  if (!value) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatAgeDays(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days < 1) return "<1 day";
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function formatAge(createdAt: string | undefined | null): string {
  if (!createdAt) return "—";
  try {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return "<1 day";
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  } catch {
    return "—";
  }
}

export default Popup;
