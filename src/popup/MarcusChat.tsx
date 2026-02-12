/**
 * MarcusChat — Full-featured Marcus chat in popup.
 * Feature parity with Chrome side panel:
 * - Auto-detect CA from current page
 * - Inline token scanning with risk display
 * - Marcus LLM chat with scan context + conversation history
 * - Tier-based rate limiting
 * - Local fallback when API unavailable
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { COLORS } from "../utils/designTokens";
import { getApiBase } from "../utils/config";
import { scanToken, type ScanResult } from "../services/api";
import { riskLabel, riskEmoji } from "../utils/designTokens";

interface Message {
  role: "user" | "marcus" | "system";
  text: string;
  ts: number;
  scanResult?: ScanResult;
}

interface Props {
  onBack: () => void;
}

// Tier-based rate limits (per day — mirrors config.py)
const TIER_CHAT_LIMITS: Record<string, number> = {
  free: 1, free_linked: 3,
  holder: 3, scout: 10,
  whale: 25, analyst: 50,
  syndicate: 500, og: 500, vip: 500,
};

// Solana address regex
const SOL_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
// EVM address regex
const EVM_RE = /0x[a-fA-F0-9]{40}/;

function detectCA(text: string): string | null {
  const evmMatch = text.match(EVM_RE);
  if (evmMatch) return evmMatch[0];
  const solMatch = text.match(SOL_RE);
  if (solMatch && solMatch[0].length >= 32) return solMatch[0];
  return null;
}

async function getPageCA(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs?.query({ active: true, currentWindow: true });
    if (!tabs?.[0]?.url) return null;
    const url = tabs[0].url;
    // Extract from known sites
    const patterns = [
      /dexscreener\.com\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})/,
      /pump\.fun\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})/,
      /jup\.ag\/swap\/.*-([1-9A-HJ-NP-Za-km-z]{32,44})/,
      /birdeye\.so\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/,
      /gmgn\.ai\/sol\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/,
      /bullx\.io\/terminal\?.*address=([1-9A-HJ-NP-Za-km-z]{32,44})/,
      /raydium\.io\/swap\/?\?.*(?:inputMint|outputMint)=([1-9A-HJ-NP-Za-km-z]{32,44})/,
      /photon-sol\.tinyastro\.io\/.*\/([1-9A-HJ-NP-Za-km-z]{32,44})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

async function callMarcusChat(
  message: string,
  authToken: string | null,
  lastScan: ScanResult | null,
  detectedMint: string | null,
  history: Message[],
): Promise<string | null> {
  if (!authToken) return null;
  try {
    const base = await getApiBase();
    const context: Record<string, unknown> = { source: "popup-marcus" };
    if (detectedMint) context.mint = detectedMint;
    if (lastScan) context.scan = lastScan;

    const apiHistory = history
      .filter(m => m.role !== "system")
      .slice(-10)
      .map(m => ({ role: m.role === "user" ? "user" : "marcus", content: m.text }));

    const resp = await fetch(`${base}/ext/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message,
        context: Object.keys(context).length > 0 ? context : undefined,
        history: apiHistory.length > 0 ? apiHistory : undefined,
      }),
    });

    if (resp.status === 403) return "🔒 Marcus chat requires a linked account. Link your Telegram via Settings to unlock. 🗿";
    if (resp.status === 429) return "⏳ Daily chat limit reached. *\"Even Stoics must rest.\"* Come back tomorrow. 🗿";
    if (!resp.ok) return null;

    const data = await resp.json();
    return data.response || null;
  } catch {
    return null;
  }
}

function riskBar(score: number | null | undefined): string {
  if (score == null) return "";
  const label = riskLabel(score);
  const emoji = riskEmoji(score);
  const filled = Math.round(score / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `${emoji} Risk: ${score}/100 [${bar}] ${label}`;
}

function formatScanResult(d: ScanResult): string {
  const lines: string[] = [];
  const sym = d.token_symbol || "???";
  const name = d.token_name || "Unknown";
  lines.push(`🔍 ${name} ($${sym})`);
  lines.push(riskBar(d.risk_score));
  lines.push("");

  if (d.price_usd) lines.push(`💰 Price: $${d.price_usd}`);
  if (d.market_cap) lines.push(`📊 MCap: $${Number(d.market_cap).toLocaleString()}`);
  if (d.liquidity_usd) lines.push(`💧 Liquidity: $${Number(d.liquidity_usd).toLocaleString()}`);

  const flags: string[] = [];
  if ((d as any).freeze_authority_enabled === false) flags.push("✅ Freeze Revoked");
  if ((d as any).freeze_authority_enabled === true) flags.push("⚠️ Freeze Active");
  if ((d as any).mint_authority_enabled === false) flags.push("✅ Mint Revoked");
  if ((d as any).mint_authority_enabled === true) flags.push("⚠️ Mint Active");
  if (flags.length) { lines.push(""); lines.push(flags.join(" | ")); }

  const verdicts: Record<string, string> = {
    critical: "\n🔴 CRITICAL RISK — *\"If it is not right, do not do it.\"* Stay away.",
    high: "\n⚠️ HIGH RISK — Proceed with extreme caution.",
    moderate: "\n🟡 Moderate risk. DYOR.",
    low: "\n🟢 Low risk indicators, but stay vigilant.",
  };
  const score = d.risk_score;
  if (score != null) {
    const key = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";
    lines.push(verdicts[key]);
  }

  return lines.join("\n");
}

const MarcusChat: React.FC<Props> = ({ onBack }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: "marcus", text: "Ave, citizen. Paste a CA or ask about token safety. 🗿", ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState("free");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [detectedMint, setDetectedMint] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [msgCount, setMsgCount] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const msgLimit = TIER_CHAT_LIMITS[tier] || 1;

  // Load state + detect page CA
  useEffect(() => {
    chrome.storage?.local?.get(
      ["tier", "linked_telegram", "auth_token"],
      (data) => {
        setTier(data.tier || "free");
        setAuthToken(data.auth_token || null);
      }
    );
    getPageCA().then((ca) => {
      if (ca) {
        setDetectedMint(ca);
        setMessages(prev => [...prev, {
          role: "system",
          text: `📍 Detected CA from page: ${ca.slice(0, 8)}...${ca.slice(-6)}`,
          ts: Date.now(),
        }]);
      }
    });
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addMessage = useCallback((role: "user" | "marcus" | "system", text: string, scan?: ScanResult) => {
    setMessages(prev => [...prev, { role, text, ts: Date.now(), scanResult: scan }]);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    addMessage("user", text);
    setInput("");
    setLoading(true);
    setMsgCount(c => c + 1);

    try {
      // Check if it's a CA — scan it
      const ca = detectCA(text) || (text.toLowerCase().startsWith("scan") ? detectedMint : null);

      if (ca) {
        addMessage("system", `⏳ Scanning ${ca.slice(0, 8)}...${ca.slice(-6)}`);
        const resp = await scanToken(ca);
        const result = resp?.data || null;
        if (result && result.risk_score != null) {
          setLastScan(result);
          setDetectedMint(ca);
          addMessage("marcus", formatScanResult(result), result);
        } else {
          addMessage("marcus", `❓ Couldn't analyze that token. Try via Telegram: @rug_munchy_bot`);
        }
      } else {
        // LLM chat with context
        const marcusResp = await callMarcusChat(text, authToken, lastScan, detectedMint, messages);
        if (marcusResp) {
          addMessage("marcus", marcusResp);
        } else {
          // Fallback
          if (lastScan) {
            addMessage("marcus", `Based on the last scan, this token has a risk score of ${lastScan.risk_score}/100. Ask me something specific about it, or paste a new CA. 🗿`);
          } else {
            addMessage("marcus", "Paste a contract address and I'll analyze it. Or link your account in Settings for full Marcus chat. 🗿");
          }
        }
      }
    } catch (e: any) {
      addMessage("marcus", `⚠️ ${e.message || "Something went wrong"}\n\nTry again or use @rug_munchy_bot on Telegram.`);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, authToken, lastScan, detectedMint, messages, addMessage]);

  return (
    <div style={{
      width: "100%", height: "100%", minHeight: 480,
      backgroundColor: COLORS.bg, color: COLORS.textPrimary,
      fontFamily: "system-ui", display: "flex", flexDirection: "column",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: COLORS.textSecondary,
          cursor: "pointer", fontSize: 16, padding: 4,
        }}>←</button>
        <span style={{ fontSize: 18 }}>🗿</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Marcus</div>
          <div style={{ fontSize: 10, color: COLORS.purple }}>
            {loading ? "Analyzing..." : detectedMint ? `CA detected` : "Stoic Crypto Analyst"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: COLORS.textMuted }}>
            {msgCount}/{msgLimit}
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: loading ? COLORS.gold : COLORS.green,
          }} />
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex", gap: 6,
            flexDirection: m.role === "user" ? "row-reverse" : "row",
          }}>
            {m.role !== "system" && (
              <div style={{
                width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                backgroundColor: m.role === "marcus" ? `${COLORS.purple}30` : `${COLORS.gold}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, marginTop: 2,
              }}>
                {m.role === "marcus" ? "🗿" : "👤"}
              </div>
            )}
            <div style={{
              maxWidth: m.role === "system" ? "100%" : "80%",
              borderRadius: 12, padding: m.role === "system" ? "4px 8px" : "8px 10px",
              fontSize: m.role === "system" ? 11 : 13, lineHeight: 1.5,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              ...(m.role === "system"
                ? { color: COLORS.textMuted, fontStyle: "italic", textAlign: "center" as const, width: "100%" }
                : m.role === "marcus"
                  ? { backgroundColor: COLORS.bgCard, color: "#c4b5fd", border: `1px solid ${COLORS.border}`, borderTopLeftRadius: 4 }
                  : { backgroundColor: `${COLORS.purple}20`, color: "#fff", border: `1px solid ${COLORS.purple}30`, borderTopRightRadius: 4 }
              ),
            }}>
              {m.text}
              {m.role !== "system" && (
                <div style={{ fontSize: 9, marginTop: 4, opacity: 0.4 }}>
                  {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, flexShrink: 0,
              backgroundColor: `${COLORS.purple}30`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
            }}>🗿</div>
            <div style={{
              backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, borderTopLeftRadius: 4, padding: "8px 12px",
              display: "flex", gap: 4,
            }}>
              {[0, 1, 2].map((j) => (
                <div key={j} style={{
                  width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.purple,
                  animation: `popBounce 0.6s ${j * 0.15}s infinite`,
                }} />
              ))}
              <style>{`@keyframes popBounce { 0%,100% { opacity:0.3 } 50% { opacity:1 } }`}</style>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0, padding: "8px 10px", borderTop: `1px solid ${COLORS.border}`,
        backgroundColor: COLORS.bg,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder={detectedMint ? `Ask about ${detectedMint.slice(0, 6)}... or paste CA` : "Paste CA or ask Marcus..."}
            disabled={loading}
            style={{
              flex: 1, padding: "8px 10px", borderRadius: 10,
              backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
              color: COLORS.textPrimary, fontSize: 13, outline: "none",
              fontFamily: "system-ui",
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              width: 36, height: 36, borderRadius: 10, border: "none",
              backgroundColor: input.trim() && !loading ? COLORS.purple : COLORS.bgCard,
              color: "#fff", cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarcusChat;
