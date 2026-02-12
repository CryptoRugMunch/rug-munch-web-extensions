/**
 * MarcusChat — Full-featured Marcus chat in popup (Safari + Chrome + Firefox).
 * 
 * State persisted in chrome.storage.local so navigating away and back preserves conversation.
 * Receives last scan result + detected CA from parent Popup component.
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
}

export interface MarcusChatProps {
  onBack: () => void;
  /** Last scan result from popup main view */
  initialScan?: ScanResult | null;
  /** CA detected from active tab */
  initialMint?: string | null;
}

const STORAGE_KEY = "marcus_chat_state";

// Tier-based rate limits (per day — mirrors config.py)
const TIER_CHAT_LIMITS: Record<string, number> = {
  free: 1, free_linked: 3,
  holder: 3, scout: 10,
  whale: 25, analyst: 50,
  syndicate: 500, og: 500, vip: 500,
};

const SOL_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
const EVM_RE = /0x[a-fA-F0-9]{40}/;

function detectCA(text: string): string | null {
  const evmMatch = text.match(EVM_RE);
  if (evmMatch) return evmMatch[0];
  const solMatch = text.match(SOL_RE);
  if (solMatch && solMatch[0].length >= 32) return solMatch[0];
  return null;
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
  const da = d as any;
  if (da.freeze_authority_enabled === false) flags.push("✅ Freeze Revoked");
  if (da.freeze_authority_enabled === true) flags.push("⚠️ Freeze Active");
  if (da.mint_authority_enabled === false) flags.push("✅ Mint Revoked");
  if (da.mint_authority_enabled === true) flags.push("⚠️ Mint Active");
  if (flags.length) { lines.push(""); lines.push(flags.join(" | ")); }

  const score = d.risk_score;
  if (score != null) {
    const key = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";
    const verdicts: Record<string, string> = {
      critical: "\n🔴 CRITICAL RISK — *\"If it is not right, do not do it.\"* Stay away.",
      high: "\n⚠️ HIGH RISK — Proceed with extreme caution.",
      moderate: "\n🟡 Moderate risk. DYOR.",
      low: "\n🟢 Low risk indicators, but stay vigilant.",
    };
    lines.push(verdicts[key]);
  }

  return lines.join("\n");
}

const MarcusChat: React.FC<MarcusChatProps> = ({ onBack, initialScan, initialMint }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState("free");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [detectedMint, setDetectedMint] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [msgCount, setMsgCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const msgLimit = TIER_CHAT_LIMITS[tier] || 1;

  // Load persisted state on mount
  useEffect(() => {
    chrome.storage?.local?.get(
      [STORAGE_KEY, "tier", "auth_token"],
      (data) => {
        setTier(data.tier || "free");
        setAuthToken(data.auth_token || null);

        const saved = data[STORAGE_KEY];
        if (saved) {
          // Only restore if saved within last 30 minutes
          const age = Date.now() - (saved.savedAt || 0);
          if (age < 30 * 60 * 1000) {
            setMessages(saved.messages || []);
            setMsgCount(saved.msgCount || 0);
            if (saved.detectedMint) setDetectedMint(saved.detectedMint);
            if (saved.lastScan) setLastScan(saved.lastScan);
            setLoaded(true);
            return;
          }
        }

        // No saved state or expired — start fresh
        const initial: Message[] = [
          { role: "marcus", text: "Ave, citizen. Paste a CA or ask about token safety. 🗿", ts: Date.now() },
        ];

        // If parent passed a scan result, show it
        if (initialScan && initialScan.risk_score != null) {
          setLastScan(initialScan);
          const ca = initialScan.token_address || initialMint;
          if (ca) setDetectedMint(ca);
          initial.push({
            role: "system",
            text: `📍 Loaded scan: ${initialScan.token_name || initialScan.token_symbol || ca?.slice(0, 8)} (Risk: ${initialScan.risk_score}/100)`,
            ts: Date.now(),
          });
        } else if (initialMint) {
          setDetectedMint(initialMint);
          initial.push({
            role: "system",
            text: `📍 Detected CA: ${initialMint.slice(0, 8)}...${initialMint.slice(-6)}`,
            ts: Date.now(),
          });
        }

        setMessages(initial);
        setLoaded(true);
      }
    );
  }, [initialScan, initialMint]);

  // Persist state on every change
  useEffect(() => {
    if (!loaded) return;
    chrome.storage?.local?.set({
      [STORAGE_KEY]: {
        messages,
        msgCount,
        detectedMint,
        lastScan,
        savedAt: Date.now(),
      },
    });
  }, [messages, msgCount, detectedMint, lastScan, loaded]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addMessage = useCallback((role: "user" | "marcus" | "system", text: string) => {
    setMessages(prev => [...prev, { role, text, ts: Date.now() }]);
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
          addMessage("marcus", formatScanResult(result));
        } else {
          addMessage("marcus", `❓ Couldn't analyze that token. Try via @rug_munchy_bot on Telegram.`);
        }
      } else {
        // LLM chat
        if (!authToken) {
          addMessage("marcus", lastScan
            ? `Based on the last scan, risk is ${lastScan.risk_score}/100. Link your account in Settings for full Marcus chat. 🗿`
            : "Paste a contract address and I'll analyze it. Link your account in Settings for full Marcus chat. 🗿"
          );
        } else {
          try {
            const base = await getApiBase();
            const context: Record<string, unknown> = { source: "popup-marcus" };
            if (detectedMint) context.mint = detectedMint;
            if (lastScan) context.scan = lastScan;

            const apiHistory = messages
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
                message: text,
                context: Object.keys(context).length > 0 ? context : undefined,
                history: apiHistory.length > 0 ? apiHistory : undefined,
              }),
            });

            if (resp.status === 403) {
              addMessage("marcus", "🔒 Chat requires a linked account. Link Telegram via Settings. 🗿");
            } else if (resp.status === 429) {
              addMessage("marcus", "⏳ Daily limit reached. Come back tomorrow. 🗿");
            } else if (resp.ok) {
              const data = await resp.json();
              addMessage("marcus", data.response || "No response from Marcus.");
            } else {
              addMessage("marcus", "*stares stoically* Something went wrong. Try again, citizen.");
            }
          } catch {
            addMessage("marcus", "*stares stoically* Connection failed. Check your network and try again.");
          }
        }
      }
    } catch (e: any) {
      addMessage("marcus", `⚠️ ${e.message || "Something went wrong"}`);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, authToken, lastScan, detectedMint, messages, addMessage]);

  if (!loaded) return null; // Don't flash empty state while loading

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
            {loading ? "Analyzing..." : detectedMint ? `CA: ${detectedMint.slice(0, 6)}...` : "Stoic Crypto Analyst"}
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
                ? { color: COLORS.textMuted, fontStyle: "italic" as const, textAlign: "center" as const, width: "100%" }
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
