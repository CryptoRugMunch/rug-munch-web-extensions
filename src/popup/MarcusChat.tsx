/**
 * MarcusChat — Full-featured Marcus chat in popup (Safari + Chrome + Firefox).
 *
 * State persisted in chrome.storage.local so navigating away and back preserves conversation.
 * Receives last scan result + detected CA from parent Popup component.
 *
 * v2: Rich inline scan cards in chat.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { COLORS } from "../utils/designTokens";
import { getApiBase } from "../utils/config";
import { scanToken, type ScanResult } from "../services/api";
import { riskEmoji } from "../utils/designTokens";
import { extractMintFromUrl } from "../utils/shadowInject";

interface Message {
  role: "user" | "marcus" | "system";
  text: string;
  ts: number;
  /** If set, render a rich scan card instead of text */
  scanResult?: ScanResult;
}

export interface MarcusChatProps {
  onBack: () => void;
  initialScan?: ScanResult | null;
  initialMint?: string | null;
}

const STORAGE_KEY = "marcus_chat_state";

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

/** Simple markdown-ish formatting for chat messages */
function formatText(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.includes("**")) {
      const start = remaining.indexOf("**");
      const end = remaining.indexOf("**", start + 2);
      if (end === -1) break;
      if (start > 0) parts.push(remaining.slice(0, start));
      parts.push(<strong key={`b${key++}`}>{remaining.slice(start + 2, end)}</strong>);
      remaining = remaining.slice(end + 2);
    }

    if (remaining.includes("`")) {
      const result: React.ReactNode[] = [];
      const segments = remaining.split("`");
      segments.forEach((seg, j) => {
        if (j % 2 === 1) {
          result.push(
            <code key={`c${key++}`} style={{ backgroundColor: "rgba(126,76,255,0.2)", padding: "1px 4px", borderRadius: 3, fontSize: "0.9em" }}>
              {seg}
            </code>
          );
        } else {
          result.push(seg);
        }
      });
      if (parts.length > 0) parts.push(...result);
      else parts.push(...result);
      remaining = "";
    }

    if (remaining) parts.push(remaining);

    return (
      <React.Fragment key={i}>
        {parts.length > 0 ? parts : line}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

/**
 * Detect token from the active tab by asking the content script.
 * Falls back to URL extraction.
 */
async function detectTokenFromActiveTab(): Promise<{ mint: string; chain: string } | null> {
  return new Promise((resolve) => {
    try {
      chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs?.[0];
        if (!tab?.id || !tab.url) {
          // Fallback to URL extraction
          if (tab?.url) {
            const mint = extractMintFromUrl(tab.url);
            if (mint) return resolve({ mint, chain: "solana" });
          }
          return resolve(null);
        }

        // Ask content script for the real token (handles DexScreener pair→mint)
        chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_TOKEN" }, (response) => {
          if (chrome.runtime.lastError || !response?.mint) {
            // Content script didn't respond — try URL extraction
            const mint = extractMintFromUrl(tab.url!);
            return resolve(mint ? { mint, chain: "solana" } : null);
          }
          resolve({ mint: response.mint, chain: response.chain || "solana" });
        });
      });
    } catch {
      resolve(null);
    }

    // Timeout after 2s
    setTimeout(() => resolve(null), 2000);
  });
}

/** ScoreCard rendered inline in chat bubble */
const InlineScanCard: React.FC<{ data: ScanResult }> = ({ data }) => {
  const score = data.risk_score ?? 0;
  const color = score >= 75 ? COLORS.red : score >= 50 ? COLORS.orange : score >= 25 ? COLORS.gold : COLORS.green;

  return (
    <div style={{
      margin: "4px 0", padding: 10, borderRadius: 8,
      backgroundColor: COLORS.bgCard, border: `1px solid ${color}40`,
      fontSize: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 700 }}>${data.token_symbol || "?"}</span>
          <span style={{ color: COLORS.textMuted, fontSize: 10, marginLeft: 4 }}>{data.token_name}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color }}>{riskEmoji(score)}</span>
          <span style={{ fontSize: 11, color, fontWeight: 600, marginLeft: 4 }}>{score}/100</span>
        </div>
      </div>

      {/* Risk bar */}
      <div style={{ width: "100%", height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginBottom: 6 }}>
        <div style={{ width: `${score}%`, height: "100%", backgroundColor: color, borderRadius: 2 }} />
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10 }}>
        <div><span style={{ color: COLORS.textMuted }}>Price: </span><span>{data.price_usd ? `$${data.price_usd < 0.01 ? data.price_usd.toFixed(8) : data.price_usd.toFixed(4)}` : "—"}</span></div>
        <div><span style={{ color: COLORS.textMuted }}>MCap: </span><span>{data.market_cap ? (data.market_cap >= 1e6 ? `$${(data.market_cap/1e6).toFixed(1)}M` : `$${(data.market_cap/1e3).toFixed(1)}K`) : "—"}</span></div>
        <div><span style={{ color: COLORS.textMuted }}>Liq: </span><span>{data.liquidity_usd ? (data.liquidity_usd >= 1e6 ? `$${(data.liquidity_usd/1e6).toFixed(1)}M` : `$${(data.liquidity_usd/1e3).toFixed(1)}K`) : "—"}</span></div>
        <div><span style={{ color: COLORS.textMuted }}>Holders: </span><span>{data.holder_count?.toLocaleString() || "—"}</span></div>
      </div>

      {/* Risk factors */}
      {data.risk_factors && data.risk_factors.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
          {data.risk_factors.slice(0, 3).map((f, i) => (
            <div key={i} style={{ fontSize: 10, color: COLORS.orange }}>⚠️ {f}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
        <button onClick={() => navigator.clipboard.writeText(data.token_address)}
          style={{ flex: 1, padding: "4px 0", borderRadius: 4, border: `1px solid ${COLORS.border}`, backgroundColor: "transparent", color: COLORS.textSecondary, fontSize: 9, cursor: "pointer" }}>
          📋 Copy CA
        </button>
        <button onClick={() => window.open(`https://solscan.io/token/${data.token_address}`, "_blank")}
          style={{ flex: 1, padding: "4px 0", borderRadius: 4, border: `1px solid ${COLORS.border}`, backgroundColor: "transparent", color: COLORS.textSecondary, fontSize: 9, cursor: "pointer" }}>
          🔍 Explorer
        </button>
        <button onClick={() => {
          const text = `${riskEmoji(score)} $${data.token_symbol || "?"} Risk: ${score}/100\nScanned by Rug Munch Intelligence 🗿`;
          navigator.clipboard.writeText(text);
        }}
          style={{ flex: 1, padding: "4px 0", borderRadius: 4, border: `1px solid ${COLORS.border}`, backgroundColor: "transparent", color: COLORS.textSecondary, fontSize: 9, cursor: "pointer" }}>
          📤 Share
        </button>
      </div>

      {/* Full address */}
      <div style={{ marginTop: 4, fontSize: 8, fontFamily: "monospace", color: COLORS.textMuted, wordBreak: "break-all" as const, cursor: "pointer" }}
        onClick={() => navigator.clipboard.writeText(data.token_address)}>
        {data.token_address}
      </div>
    </div>
  );
};

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
        if (saved && Date.now() - (saved.savedAt || 0) < 30 * 60 * 1000) {
          setMessages(saved.messages || []);
          setMsgCount(saved.msgCount || 0);
          if (saved.detectedMint) setDetectedMint(saved.detectedMint);
          if (saved.lastScan) setLastScan(saved.lastScan);
          setLoaded(true);
          return;
        }

        // Fresh session
        const initial: Message[] = [
          { role: "marcus", text: "Ave, citizen. Paste a CA or ask about token safety. 🗿", ts: Date.now() },
        ];

        if (initialScan && initialScan.risk_score != null) {
          setLastScan(initialScan);
          const ca = initialScan.token_address || initialMint;
          if (ca) setDetectedMint(ca);
          // Show rich ScoreCard for initial scan
          initial.push({
            role: "marcus",
            text: "", // Text is ignored when scanResult is set
            ts: Date.now(),
            scanResult: initialScan,
          });
        } else if (initialMint) {
          setDetectedMint(initialMint);
          initial.push({
            role: "system",
            text: `📍 Detected CA: ${initialMint}`,
            ts: Date.now(),
          });
        }

        setMessages(initial);
        setLoaded(true);
      }
    );

    // Detect token from active tab (works for DexScreener + all platforms)
    if (!initialMint) {
      detectTokenFromActiveTab().then((result) => {
        if (result?.mint) {
          setDetectedMint(result.mint);
          setMessages(prev => [...prev, {
            role: "system" as const,
            text: `📍 Detected CA from tab: ${result.mint}`,
            ts: Date.now(),
          }]);
        }
      });
    }
  }, [initialScan, initialMint]);

  // Persist state on every change (exclude scanResult objects to keep storage small)
  useEffect(() => {
    if (!loaded) return;
    chrome.storage?.local?.set({
      [STORAGE_KEY]: {
        messages: messages.map(m => ({ ...m, scanResult: undefined })), // Don't persist full scan objects
        msgCount,
        detectedMint,
        lastScan,
        savedAt: Date.now(),
      },
    });
  }, [messages, msgCount, detectedMint, lastScan, loaded]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addMessage = useCallback((msg: Omit<Message, "ts">) => {
    setMessages(prev => [...prev, { ...msg, ts: Date.now() }]);
  }, []);

  // Listen for tab URL changes
  useEffect(() => {
    const handler = (_tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.url) {
        const mint = extractMintFromUrl(info.url);
        if (mint && mint !== detectedMint) {
          setDetectedMint(mint);
          addMessage({ role: "system", text: `📍 New CA detected: ${mint}` });
        }
      }
    };
    try { chrome.tabs?.onUpdated?.addListener(handler); } catch {}
    return () => { try { chrome.tabs?.onUpdated?.removeListener(handler); } catch {} };
  }, [detectedMint, addMessage]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    addMessage({ role: "user", text });
    setInput("");
    setLoading(true);
    setMsgCount(c => c + 1);

    try {
      // Check if it's a CA — scan it
      const ca = detectCA(text) || (text.toLowerCase().startsWith("scan") ? detectedMint : null);

      if (ca) {
        addMessage({ role: "system", text: `⏳ Scanning ${ca}` });
        const resp = await scanToken(ca);
        const result = resp?.data || null;
        if (result && result.risk_score != null) {
          setLastScan(result);
          setDetectedMint(ca);
          // Rich ScoreCard in chat — same as popup main view
          addMessage({ role: "marcus", text: "", scanResult: result });
        } else {
          addMessage({ role: "marcus", text: "❓ Couldn't analyze that token. Try via @rug_munchy_bot on Telegram." });
        }
      } else {
        // LLM chat
        if (!authToken) {
          addMessage({
            role: "marcus",
            text: lastScan
              ? `Based on the last scan, risk is ${lastScan.risk_score}/100. Link your account in Settings for full Marcus chat. 🗿`
              : "Paste a contract address and I'll analyze it. Link your account in Settings for full Marcus chat. 🗿",
          });
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
              addMessage({ role: "marcus", text: "🔒 Chat requires a linked account. Link Telegram via Settings. 🗿" });
            } else if (resp.status === 429) {
              addMessage({ role: "marcus", text: "⏳ Daily limit reached. Come back tomorrow. 🗿" });
            } else if (resp.ok) {
              const data = await resp.json();
              addMessage({ role: "marcus", text: data.response || "No response from Marcus." });
            } else {
              addMessage({ role: "marcus", text: "*stares stoically* Something went wrong. Try again, citizen." });
            }
          } catch {
            addMessage({ role: "marcus", text: "*stares stoically* Connection failed. Check your network and try again." });
          }
        }
      }
    } catch (e: any) {
      addMessage({ role: "marcus", text: `⚠️ ${e.message || "Something went wrong"}` });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, authToken, lastScan, detectedMint, messages, addMessage]);

  if (!loaded) return null;

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
          <div style={{
            fontSize: 10, color: COLORS.purple, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200,
          }}>
            {loading ? "Analyzing..." : detectedMint ? `CA: ${detectedMint}` : "Stoic Crypto Analyst"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: COLORS.textMuted }}>{msgCount}/{msgLimit}</span>
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
              maxWidth: m.role === "system" ? "100%" : "92%",
              borderRadius: 12,
              padding: m.scanResult ? "4px" : m.role === "system" ? "4px 8px" : "8px 10px",
              fontSize: m.role === "system" ? 11 : 13, lineHeight: 1.5,
              whiteSpace: m.scanResult ? "normal" : "pre-wrap",
              wordBreak: "break-word",
              ...(m.role === "system"
                ? { color: COLORS.textMuted, fontStyle: "italic" as const, textAlign: "center" as const, width: "100%" }
                : m.role === "marcus"
                  ? { backgroundColor: COLORS.bgCard, color: "#c4b5fd", border: `1px solid ${COLORS.border}`, borderTopLeftRadius: 4 }
                  : { backgroundColor: `${COLORS.purple}20`, color: "#fff", border: `1px solid ${COLORS.purple}30`, borderTopRightRadius: 4 }
              ),
            }}>
              {m.scanResult ? (
                <InlineScanCard data={m.scanResult} />
              ) : (
                formatText(m.text)
              )}
              {m.role !== "system" && !m.scanResult && (
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
            placeholder={detectedMint ? `Ask about ${detectedMint.slice(0, 8)}… or paste CA` : "Paste CA or ask Marcus..."}
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
