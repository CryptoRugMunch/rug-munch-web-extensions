/**
 * Side Panel — Marcus Chat
 *
 * Persistent side panel with Marcus AI chat.
 * Features:
 * - Auto-detects CA from current page
 * - Chat interface for token questions
 * - Session-only history (clears on browser close)
 * - Tier-gated: Holder+ only (free users see upgrade prompt)
 * - Rate limit: 20 messages/hour
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

const SidePanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState("free");
  const [linked, setLinked] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [detectedMint, setDetectedMint] = useState<string | null>(null);
  const [msgCount, setMsgCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const MSG_LIMIT = 20; // per hour

  // Load state
  useEffect(() => {
    chrome.storage.local.get(["tier", "linked_telegram", "auth_token"], (data) => {
      setTier(data.tier || "free");
      setLinked(!!data.linked_telegram);
      setAuthToken(data.auth_token || null);
    });

    // Welcome message
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

    // Listen for tab changes
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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Rate limit check
    if (msgCount >= MSG_LIMIT) {
      setMessages(prev => [...prev, {
        role: "system",
        content: "⏳ Rate limit reached (20/hr). Take a breath — even Stoics rest.",
        timestamp: Date.now(),
      }]);
      return;
    }

    setInput("");
    setLoading(true);
    setMsgCount(c => c + 1);

    // Add user message
    setMessages(prev => [...prev, {
      role: "user",
      content: text,
      timestamp: Date.now(),
    }]);

    // Determine intent
    const lowerText = text.toLowerCase();
    const isAddressInput = /^[A-Za-z0-9]{32,50}$/.test(text);
    const isScanRequest = lowerText === "scan" || lowerText.startsWith("scan ");
    const mintToScan = isAddressInput ? text :
      isScanRequest ? (text.split(" ")[1] || detectedMint) :
      null;

    if (mintToScan) {
      // Token scan flow
      const resp = await scanToken(mintToScan);
      if (resp.success && resp.data && !resp.data.not_scanned) {
        const d = resp.data;
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

        if (score != null) {
          if (score >= 75) {
            analysis += `\n🚨 *"The obstacle is not the obstacle. The obstacle is your failure to walk away."*`;
          } else if (score >= 50) {
            analysis += `\n⚠️ *"Begin at once to live, and count each day as a separate life."* Proceed with extreme caution.`;
          } else if (score >= 25) {
            analysis += `\n🟡 Moderate risk. DYOR — not financial advice.`;
          } else {
            analysis += `\n🟢 Low risk indicators, but stay vigilant. No token is truly safe.`;
          }
        }

        setMessages(prev => [...prev, {
          role: "marcus",
          content: analysis,
          timestamp: Date.now(),
          scanResult: d,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: "marcus",
          content: `❓ Couldn't analyze that token. Either it doesn't exist or the scan service is taking a nap. Try again or scan via the Telegram bot.`,
          timestamp: Date.now(),
        }]);
      }
    } else {
      // General chat — respond with context-aware help
      const response = generateResponse(text, detectedMint);
      setMessages(prev => [...prev, {
        role: "marcus",
        content: response,
        timestamp: Date.now(),
      }]);
    }

    setLoading(false);
  }, [input, loading, msgCount, detectedMint]);

  // Tier gate check
  const hasAccess = tier !== "free" || !!linked || !!authToken; // Any authenticated user

  if (!hasAccess) {
    return (
      <div style={{
        minHeight: "100vh", backgroundColor: COLORS.bg,
        color: COLORS.textPrimary, fontFamily: "system-ui",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗿</div>
        <h2 style={{ color: COLORS.gold, marginBottom: 8 }}>Marcus Chat</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 20, maxWidth: 280 }}>
          Sign in to unlock Marcus Chat. Use your Solana wallet or Telegram — no email needed.
        </p>
        <button
          onClick={() => chrome.runtime.sendMessage({ type: "OPEN_SETTINGS" })}
          style={{
            padding: "10px 20px", borderRadius: 8,
            backgroundColor: COLORS.purple, color: "#fff",
            border: "none", fontSize: 13, fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🔑 Sign In
        </button>
        <p style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 16 }}>
          Hold $CRM for unlimited access
        </p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: COLORS.bg,
      color: COLORS.textPrimary, fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 20 }}>🗿</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.gold }}>Marcus</span>
        <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: "auto" }}>
          {msgCount}/{MSG_LIMIT} msgs
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
            <span style={{ animation: "pulse 1s infinite" }}>Marcus is thinking...</span>
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Detected token pill */}
      {detectedMint && (
        <div style={{
          padding: "4px 12px", margin: "0 12px",
          backgroundColor: `${COLORS.cyan}15`, borderRadius: 6,
          border: `1px solid ${COLORS.cyan}30`,
          fontSize: 10, color: COLORS.cyan,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span>📍</span>
          <span style={{ fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
            {detectedMint}
          </span>
          <button
            onClick={() => { setInput("scan"); }}
            style={{
              background: "none", border: "none",
              color: COLORS.cyan, fontSize: 10, cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Scan →
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: 12, borderTop: `1px solid ${COLORS.border}`,
        display: "flex", gap: 8,
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
            color: "#fff", border: "none", fontSize: 12,
            fontWeight: 600, cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "..." : "→"}
        </button>
      </div>
    </div>
  );
};

const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div style={{
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "85%",
    }}>
      <div style={{
        padding: "8px 14px",
        borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
        backgroundColor: isSystem ? `${COLORS.cyan}10` :
          isUser ? `${COLORS.purple}30` : COLORS.bgCard,
        border: `1px solid ${isSystem ? `${COLORS.cyan}30` :
          isUser ? `${COLORS.purple}40` : COLORS.border}`,
        fontSize: 12,
        color: isSystem ? COLORS.cyan : COLORS.textPrimary,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
      }}>
        {formatMarkdown(message.content)}
      </div>
      <div style={{
        fontSize: 9, color: COLORS.textMuted, marginTop: 2,
        textAlign: isUser ? "right" : "left",
        paddingLeft: isUser ? 0 : 4,
        paddingRight: isUser ? 4 : 0,
      }}>
        {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
};

// Simple markdown-ish formatting
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
        fontFamily: "monospace", fontSize: 10,
        backgroundColor: `${COLORS.purple}20`, padding: "1px 4px",
        borderRadius: 3, wordBreak: "break-all",
      }}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

// Context-aware help responses
function generateResponse(text: string, detectedMint: string | null): string {
  const lower = text.toLowerCase();

  if (lower.includes("help") || lower === "?") {
    return `Here's what I can do:\n\n• **Paste a CA** — I'll scan it instantly\n• **"scan"** — Scan the token from the current page\n• **"what is this"** — Quick analysis of the detected token\n• **"compare"** — Compare detected token against known patterns\n\nI speak fluent Solana and ancient Stoic wisdom. 🗿`;
  }

  if (lower.includes("what is") || lower.includes("tell me about")) {
    if (detectedMint) {
      return `I see a token on the current page. Type **scan** and I'll give you the full breakdown — risk score, liquidity, holder concentration, the works.`;
    }
    return `Navigate to a token page (DexScreener, Pump.fun, GMGN, etc.) and I'll detect the contract address automatically. Then just type **scan**.`;
  }

  if (lower.includes("rug") || lower.includes("safe") || lower.includes("legit")) {
    return `*"The impediment to action advances action. What stands in the way becomes the way."*\n\nBut seriously — safety in crypto is a spectrum, not a binary. Scan the token and look at:\n• **Liquidity** (< $10K = danger zone)\n• **Top 10 holders** (> 50% = concentrated)\n• **Token age** (< 24h = extreme risk)\n• **Freeze/Mint authority** (enabled = they control your bag)`;
  }

  if (lower.includes("how") && (lower.includes("work") || lower.includes("score"))) {
    return `**Risk Score (0-100):**\n\n• **0-24** 🟢 Low risk — reasonable indicators\n• **25-49** 🟡 Moderate — proceed with caution\n• **50-74** 🟠 High — significant red flags\n• **75-100** 🔴 Critical — likely scam/rug\n\nFactors: liquidity depth, holder concentration, token age, freeze/mint authority, LP lock status, deployer history.`;
  }

  return `I'm best at analyzing tokens. Paste a contract address or type **scan** to check the current page.\n\n*"Waste no more time arguing about what a good token should be."* 🗿`;
}

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
