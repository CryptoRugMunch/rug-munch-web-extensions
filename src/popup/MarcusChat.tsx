/**
 * MarcusChat — Inline Marcus chat for Safari (no side panel support).
 * Also available as a view on Chrome/Firefox for users who prefer popup.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { COLORS } from "../utils/designTokens";
import { getApiBase } from "../utils/config";

interface Message {
  role: "user" | "marcus";
  text: string;
  ts: number;
}

interface Props {
  onBack: () => void;
}

const MarcusChat: React.FC<Props> = ({ onBack }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: "marcus", text: "Ave, citizen. Paste a CA or ask anything about token safety. 🗿", ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((p) => [...p, { role: "user", text, ts: Date.now() }]);
    setInput("");
    setLoading(true);

    try {
      const base = await getApiBase();
      const token = (await chrome.storage.local.get("auth_token")).auth_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const resp = await fetch(`${base}/ext/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          context: { source: "safari-popup" },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setMessages((p) => [...p, {
        role: "marcus",
        text: data.response || data.message || "No response.",
        ts: Date.now(),
      }]);
    } catch (e: any) {
      setMessages((p) => [...p, {
        role: "marcus",
        text: `⚠️ ${e.message || "Connection failed"}\n\nTry again or use @rug_munchy_bot on Telegram.`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading]);

  return (
    <div style={{
      width: "100%", maxWidth: 420, height: "100%", minHeight: 480,
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
            {loading ? "Analyzing..." : "Stoic Crypto Analyst"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: loading ? COLORS.gold : COLORS.green,
          }} />
          <span style={{ fontSize: 9, color: COLORS.textMuted }}>
            {loading ? "Thinking" : "Online"}
          </span>
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
            <div style={{
              width: 24, height: 24, borderRadius: 12, flexShrink: 0,
              backgroundColor: m.role === "marcus" ? `${COLORS.purple}30` : `${COLORS.gold}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, marginTop: 2,
            }}>
              {m.role === "marcus" ? "🗿" : "👤"}
            </div>
            <div style={{
              maxWidth: "80%", borderRadius: 12, padding: "8px 10px",
              fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
              ...(m.role === "marcus"
                ? { backgroundColor: COLORS.bgCard, color: "#c4b5fd", border: `1px solid ${COLORS.border}`, borderTopLeftRadius: 4 }
                : { backgroundColor: `${COLORS.purple}20`, color: "#fff", border: `1px solid ${COLORS.purple}30`, borderTopRightRadius: 4 }
              ),
            }}>
              {m.text}
              <div style={{ fontSize: 9, marginTop: 4, opacity: 0.4 }}>
                {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
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
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.purple,
                  animation: `popBounce 0.6s ${i * 0.15}s infinite`,
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
            placeholder="Ask Marcus or paste a CA..."
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
