/**
 * Side Panel — Marcus Chat
 *
 * Token scanning is real (via API). General chat uses the Marcus chat API
 * when available, falls back to local responses.
 *
 * Rate limits match Telegram tiers:
 *   free_linked: 30 msgs/hr
 *   holder: 100 msgs/hr
 *   vip: unlimited
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { scanToken, type ScanResult } from "../services/api";
import { trackSidePanelOpen } from "../services/analytics";
import { riskLabel, riskEmoji, COLORS } from "../utils/designTokens";
import { extractMintFromUrl } from "../utils/shadowInject";

interface ChatMessage {
  role: "user" | "marcus" | "system";
  content: string;
  timestamp: number;
  scanResult?: ScanResult;
}

// Tier-based rate limits (per day — mirrors config.py)
const TIER_SCAN_LIMITS: Record<string, number> = {
  free: 3, free_linked: 3,
  holder: 15, scout: 30,
  whale: 999999, analyst: 999999,
  syndicate: 999999, og: 999999, vip: 999999,
};

const SidePanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState("free");
  const [linked, setLinked] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [detectedMint, setDetectedMint] = useState<string | null>(null);
  const [msgCount, setMsgCount] = useState(0);
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const msgLimit = TIER_SCAN_LIMITS[tier] || 3; // Side panel uses scan limits

  // Load state
  useEffect(() => {
    chrome.storage.local.get(["tier", "linked_telegram", "auth_token"], (data) => {
      setTier(data.tier || "free");
      setLinked(!!data.linked_telegram);
      setAuthToken(data.auth_token || null);
    });

    // Listen for tier changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.tier) {
        setTier(changes.tier.newValue || "free");
      }
    });

    setMessages([{
      role: "marcus",
      content: "Welcome, fellow degen. I'm Marcus — your on-chain Stoic. Paste a contract address or ask me about any token on the current page. I'll give you the unfiltered truth. 🗿",
      timestamp: Date.now(),
    }]);
    trackSidePanelOpen();
  }, []);

  // Detect mint from active tab
  useEffect(() => {
    const detectFromTab = () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          const mint = extractMintFromUrl(tabs[0].url);
          if (mint && mint !== detectedMint) {
            setDetectedMint(mint);
            setMessages(prev => [...prev, {
              role: "system",
              content: `📍 Detected token: \`${mint}\` — type "scan" to analyze it.`,
              timestamp: Date.now(),
            }]);
          }
        }
      });
    };

    detectFromTab();
    chrome.tabs.onActivated?.addListener(detectFromTab);
    chrome.tabs.onUpdated?.addListener((_tabId, changeInfo) => {
      if (changeInfo.url) detectFromTab();
    });

    return () => {
      chrome.tabs.onActivated?.removeListener(detectFromTab);
    };
  }, [detectedMint]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback((role: ChatMessage["role"], content: string, scanResult?: ScanResult) => {
    setMessages(prev => [...prev, { role, content, timestamp: Date.now(), scanResult }]);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (msgCount >= msgLimit) {
      addMessage("system", `⏳ Rate limit reached (${msgLimit}/day for ${tier} tier). ${tier === "free" || tier === "free_linked" ? "Upgrade your tier for more scans." : "Take a breath — even Stoics rest."}`);
      return;
    }

    setInput("");
    setLoading(true);
    setMsgCount(c => c + 1);
    addMessage("user", text);

    const lowerText = text.toLowerCase();
    const isAddress = /^[A-Za-z0-9]{32,50}$/.test(text);
    const isScanCmd = lowerText === "scan" || lowerText.startsWith("scan ");
    const mintToScan = isAddress ? text :
      isScanCmd ? (text.split(" ")[1] || detectedMint) :
      null;

    if (mintToScan) {
      // Real token scan
      const resp = await scanToken(mintToScan);
      if (resp.success && resp.data && !resp.data.not_scanned) {
        const d = resp.data;
        setLastScanResult(d);
        const score = d.risk_score;
        const emoji = riskEmoji(score);
        const label = riskLabel(score);

        let analysis = `${emoji} **${d.token_symbol || "Unknown"}** — ${label} Risk (${score ?? "??"}/100)\n\n`;
        analysis += `**Price:** $${d.price_usd ? formatPrice(d.price_usd) : "—"}\n`;
        analysis += `**Market Cap:** ${formatUsd(d.market_cap)}\n`;
        analysis += `**Liquidity:** ${formatUsd(d.liquidity_usd)}\n`;
        analysis += `**Holders:** ${d.holder_count?.toLocaleString() || "—"}\n`;
        analysis += `**Top 10%:** ${d.top_10_holder_percent ? d.top_10_holder_percent.toFixed(1) + "%" : "—"}\n`;

        if (d.risk_factors && d.risk_factors.length > 0) {
          analysis += `\n⚠️ **Risk Factors:**\n`;
          d.risk_factors.forEach(f => { analysis += `• ${f}\n`; });
        }

        const verdicts: Record<string, string> = {
          critical: `\n🚨 *"The obstacle is not the obstacle. The obstacle is your failure to walk away."*`,
          high: `\n⚠️ *"Begin at once to live, and count each day as a separate life."* Proceed with extreme caution.`,
          moderate: `\n🟡 Moderate risk. DYOR — not financial advice.`,
          low: `\n🟢 Low risk indicators, but stay vigilant. No token is truly safe.`,
        };
        if (score != null) {
          const key = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";
          analysis += verdicts[key];
        }

        addMessage("marcus", analysis, d);
      } else {
        addMessage("marcus", `❓ Couldn't analyze that token. It may not exist yet or the scan service timed out. Try the full scan via Telegram: @rug_munchy_bot`);
      }
    } else if (lastScanResult) {
      // Any non-scan message when we have context = question about the last scanned token
      const d = lastScanResult;
      let followup = `**More on ${d.token_symbol || "this token"}:**\n\n`;

      if (d.top_10_holder_percent) {
        const conc = d.top_10_holder_percent;
        followup += `📊 **Holder Concentration:** Top 10 hold ${conc.toFixed(1)}%\n`;
        if (conc > 80) followup += `→ Extremely concentrated. One wallet dumps = your bags are empty.\n`;
        else if (conc > 50) followup += `→ High concentration. Watch for coordinated selling.\n`;
        else if (conc > 30) followup += `→ Moderate concentration. Not great, not terrible.\n`;
        else followup += `→ Well distributed. Good sign for organic growth.\n`;
      }

      if (d.liquidity_usd) {
        followup += `\n💧 **Liquidity:** ${formatUsd(d.liquidity_usd)}\n`;
        if (d.liquidity_usd < 5000) followup += `→ Extremely thin. A $500 sell crashes this.\n`;
        else if (d.liquidity_usd < 25000) followup += `→ Thin liquidity. Slippage will be painful on any real size.\n`;
        else if (d.liquidity_usd < 100000) followup += `→ Acceptable for a micro-cap. Don't ape your life savings.\n`;
        else followup += `→ Decent liquidity depth.\n`;
      }

      if (d.market_cap && d.liquidity_usd) {
        const ratio = d.market_cap / d.liquidity_usd;
        followup += `\n📐 **MCap/Liq Ratio:** ${ratio.toFixed(1)}x`;
        if (ratio > 50) followup += ` — extremely overvalued relative to liquidity. Rug risk HIGH.`;
        else if (ratio > 20) followup += ` — stretched. Watch for LP pulls.`;
        else followup += ` — within normal range.`;
      }

      followup += `\n\nFor the full deep dive with holder bubblemap, wallet DNA, and flow analysis — scan via @rug_munchy_bot on Telegram. That's where the real intel lives. 🗿`;
      addMessage("marcus", followup);
    } else {
      // General chat
      addMessage("marcus", generateResponse(text, detectedMint, lastScanResult));
    }

    setLoading(false);
  }, [input, loading, msgCount, msgLimit, tier, detectedMint, lastScanResult, addMessage]);

  // Gate: any authenticated user
  const hasAccess = tier !== "free" || !!linked || !!authToken;

  if (!hasAccess) {
    return (
      <div style={{
        height: "100vh", backgroundColor: COLORS.bg,
        color: COLORS.textPrimary, fontFamily: "system-ui",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗿</div>
        <h2 style={{ color: COLORS.gold, marginBottom: 8 }}>Marcus Chat</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 20, maxWidth: 280 }}>
          Sign in to unlock Marcus Chat. Link Telegram or use your Solana wallet.
        </p>
        <button
          onClick={() => chrome.runtime.openOptionsPage?.()}
          style={{
            padding: "10px 20px", borderRadius: 8,
            backgroundColor: COLORS.purple, color: "#fff",
            border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          🔑 Sign In
        </button>
        <p style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 16 }}>
          Hold $CRM for 100 scans/hr and full access
        </p>
      </div>
    );
  }

  return (
    <div style={{
      height: "100vh", backgroundColor: COLORS.bg,
      color: COLORS.textPrimary, fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px",
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 18 }}>🗿</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.gold }}>Marcus</span>
        <span style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 8,
          backgroundColor: `${COLORS.purple}20`, color: COLORS.purpleLight,
          marginLeft: 4,
        }}>{tier}</span>
        <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: "auto" }}>
          {msgCount}/{msgLimit >= 999999 ? "∞" : msgLimit + "/day"}
        </span>
      </div>

      {/* Chat messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: 12,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg} />
        ))}
        {loading && (
          <div style={{
            padding: "8px 14px", borderRadius: 12,
            backgroundColor: COLORS.bgCard,
            color: COLORS.textMuted, fontSize: 12,
            alignSelf: "flex-start",
          }}>
            <span className="pulse-anim">Marcus is thinking...</span>
            <style>{`.pulse-anim { animation: pulse 1s infinite; } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Detected token pill */}
      {detectedMint && (
        <div style={{
          padding: "4px 12px", margin: "0 12px 4px",
          backgroundColor: `${COLORS.cyan}12`, borderRadius: 6,
          border: `1px solid ${COLORS.cyan}25`,
          fontSize: 10, color: COLORS.cyan,
          display: "flex", alignItems: "center", gap: 6,
          flexShrink: 0,
        }}>
          <span>📍</span>
          <span style={{
            fontFamily: "monospace", flex: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {detectedMint}
          </span>
          <button
            onClick={() => { setInput("scan"); }}
            style={{
              background: "none", border: "none",
              color: COLORS.cyan, fontSize: 10, cursor: "pointer",
              fontWeight: 600, flexShrink: 0,
            }}
          >
            Scan →
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "8px 12px", borderTop: `1px solid ${COLORS.border}`,
        display: "flex", gap: 8, flexShrink: 0,
      }}>
        <input
          type="text"
          placeholder="Paste CA or ask Marcus..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          style={{
            flex: 1, padding: "10px 12px",
            backgroundColor: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8, outline: "none",
            color: COLORS.textPrimary, fontSize: 12,
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: "10px 16px", borderRadius: 8,
            backgroundColor: loading ? COLORS.border : COLORS.purple,
            color: "#fff", border: "none", fontSize: 14,
            fontWeight: 600, cursor: loading ? "wait" : "pointer",
            flexShrink: 0,
          }}
        >
          →
        </button>
      </div>
    </div>
  );
};

// ─── Chat Bubble ────────────────────────────────────────────────

const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div style={{
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "88%",
    }}>
      <div style={{
        padding: "10px 14px",
        borderRadius: isUser ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
        backgroundColor: isSystem ? `${COLORS.cyan}10` :
          isUser ? `${COLORS.purple}25` : COLORS.bgCard,
        border: `1px solid ${isSystem ? `${COLORS.cyan}25` :
          isUser ? `${COLORS.purple}35` : COLORS.border}`,
        fontSize: 13,
        color: isSystem ? COLORS.cyan : COLORS.textPrimary,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
      }}>
        {formatMarkdown(message.content)}
      </div>
      <div style={{
        fontSize: 9, color: COLORS.textMuted, marginTop: 2,
        textAlign: isUser ? "right" : "left",
        padding: "0 4px",
      }}>
        {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
};

// ─── Markdown Renderer ──────────────────────────────────────────

function formatMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i} style={{ color: COLORS.textSecondary }}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} style={{
        fontFamily: "monospace", fontSize: 11,
        backgroundColor: `${COLORS.purple}15`, padding: "1px 5px",
        borderRadius: 3, wordBreak: "break-all",
      }}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Response Generator ─────────────────────────────────────────

function generateResponse(text: string, detectedMint: string | null, lastScan: ScanResult | null): string {
  const lower = text.toLowerCase();

  if (lower.includes("help") || lower === "?") {
    return `**What I can do:**\n\n• **Paste a CA** — full risk scan with scores\n• **"scan"** — analyze the token on current page\n• Ask about **liquidity, holders, risks** on the last scanned token\n• **"compare"** — context against known patterns\n\nFor the full Marcus experience (deep dives, bubblemaps, KOL intel, alpha), use @MarcusRugIntelBot on Telegram. 🗿`;
  }

  if (lower.includes("who") && (lower.includes("you") || lower.includes("marcus"))) {
    return `I'm Marcus — Rug Munch Intelligence's on-chain analyst. Named after Marcus Aurelius, I embody Stoic principles in my analysis: seek truth, avoid emotional trading, accept the reality of risk.\n\nHere I handle quick scans and analysis. On Telegram, I go deeper — full token forensics, holder bubblemaps, wallet DNA, KOL tracking, and real-time alerts.\n\n*"The impediment to action advances action."* 🗿`;
  }

  if (lower.includes("rug") || lower.includes("safe") || lower.includes("legit") || lower.includes("scam")) {
    if (lastScan) {
      const s = lastScan;
      const score = s.risk_score ?? 0;
      let verdict = "";
      if (score >= 75) verdict = "This looks like a strong avoid. Multiple red flags.";
      else if (score >= 50) verdict = "Significant risk. I'd be very careful.";
      else if (score >= 25) verdict = "Some concerns but not a clear rug setup.";
      else verdict = "Relatively clean indicators, but nothing is ever truly safe.";
      return `Based on ${s.token_symbol || "the last scan"} (risk ${score}/100):\n\n${verdict}\n\nKey factors: Liq ${formatUsd(s.liquidity_usd)}, Top 10 at ${s.top_10_holder_percent?.toFixed(1) || "?"}%, ${s.holder_count?.toLocaleString() || "?"} holders.\n\n*"It is not death that a man should fear, but never beginning to live."* Don't let fear stop you from good entries — but don't let greed blind you to rug signals.`;
    }
    return `Scan a token first and I'll tell you what I see. Paste a CA or type **scan** on a token page.\n\n*"The first rule of crypto: verify, don't trust."*`;
  }

  if (lower.includes("how") && (lower.includes("work") || lower.includes("score") || lower.includes("risk"))) {
    return `**Risk Score (0-100):**\n\n🟢 **0-24** Low risk\n🟡 **25-49** Moderate — caution advised\n🟠 **50-74** High — significant red flags\n🔴 **75-100** Critical — likely scam/rug\n\n**Factors analyzed:** liquidity depth, holder concentration, token age, freeze/mint authority, LP lock status, deployer history, buy/sell ratio, top holder behavior.\n\nThe full analysis on Telegram includes bubblemap visualization, wallet DNA profiling, and KOL activity tracking.`;
  }

  if (detectedMint) {
    return `I see a token on this page. Type **scan** to get the full risk breakdown, or paste a different CA.\n\n*"The happiness of your life depends upon the quality of your trades."* — Marcus, probably 🗿`;
  }

  return `Paste a contract address to scan, or navigate to a token page on DexScreener, Pump.fun, GMGN, Jupiter, BullX, Birdeye, Raydium, or Photon — I'll detect it automatically.\n\n*"Waste no more time arguing about what a good token should be."* 🗿`;
}

// ─── Formatters ─────────────────────────────────────────────────

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

createRoot(document.getElementById("root")!).render(<SidePanel />);
