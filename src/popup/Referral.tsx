/**
 * Referral — Share your code, track referrals, earn rewards.
 */

import React, { useState, useEffect, useCallback } from "react";
import { COLORS } from "../utils/designTokens";
import { getApiBase } from "../utils/config";

interface ReferralProps {
  onBack: () => void;
}

interface ReferralData {
  code: string | null;
  total_referrals: number;
  active_referrals: number;
  rewards: {
    bonus_scans_per_day: number;
    bonus_marcus_queries: number;
  };
  referrals: Array<{
    joined_at: string | null;
    is_active: boolean;
    queries_used: number;
  }>;
}

interface LeaderEntry {
  rank: number;
  username: string;
  referral_count: number;
  bonus_earned: number;
}

const Referral: React.FC<ReferralProps> = ({ onBack }) => {
  const [data, setData] = useState<ReferralData | null>(null);
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [applyCode, setApplyCode] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "apply" | "leaderboard">("mine");

  useEffect(() => {
    loadData();
    loadLeaderboard();
  }, []);

  const loadData = async () => {
    try {
      const base = await getApiBase();
      const token = (await chrome.storage.local.get("auth_token")).auth_token;
      if (!token) return;

      // Get or create referral code
      const codeResp = await fetch(`${base}/ext/referral/code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (codeResp.ok) {
        const codeData = await codeResp.json();
        setCode(codeData.code);
        setShareUrl(codeData.extension_share_url);
      }

      // Get stats
      const statsResp = await fetch(`${base}/ext/referral/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statsResp.ok) setData(await statsResp.json());
    } catch {}
  };

  const loadLeaderboard = async () => {
    try {
      const base = await getApiBase();
      const resp = await fetch(`${base}/ext/referral/leaderboard`);
      if (resp.ok) {
        const d = await resp.json();
        setLeaders(d.leaderboard || []);
      }
    } catch {}
  };

  const copyCode = useCallback(() => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const copyShareLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const handleApply = useCallback(async () => {
    const c = applyCode.trim().toUpperCase();
    if (!c) return;
    setApplyError(null);
    setApplySuccess(null);

    try {
      const base = await getApiBase();
      const token = (await chrome.storage.local.get("auth_token")).auth_token;
      const resp = await fetch(`${base}/ext/referral/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: c }),
      });

      if (resp.ok) {
        const d = await resp.json();
        setApplySuccess(d.message);
        setApplyCode("");
      } else {
        const err = await resp.json().catch(() => ({}));
        setApplyError(err.detail || "Failed to apply code");
      }
    } catch {
      setApplyError("Connection failed");
    }
  }, [applyCode]);

  return (
    <Container onBack={onBack}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        <TabBtn label="My Referrals" active={tab === "mine"} onClick={() => setTab("mine")} />
        <TabBtn label="Use Code" active={tab === "apply"} onClick={() => setTab("apply")} />
        <TabBtn label="Top Referrers" active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} />
      </div>

      {/* ─── My Referrals ─── */}
      {tab === "mine" && (
        <>
          {/* Referral Code Card */}
          <div style={{
            padding: 14, borderRadius: 10, marginBottom: 10,
            background: `linear-gradient(135deg, ${COLORS.purple}20, ${COLORS.gold}10)`,
            border: `1px solid ${COLORS.purple}30`,
          }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>YOUR REFERRAL CODE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                flex: 1, fontSize: 22, fontWeight: 800, fontFamily: "monospace",
                color: COLORS.gold, letterSpacing: 2,
              }}>
                {code || "Loading..."}
              </div>
              <button onClick={copyCode} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                backgroundColor: copied ? `${COLORS.green}20` : `${COLORS.purple}20`,
                color: copied ? COLORS.green : COLORS.purple,
                border: `1px solid ${copied ? COLORS.green : COLORS.purple}30`,
                cursor: "pointer",
              }}>
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
            <button onClick={copyShareLink} style={{
              marginTop: 8, width: "100%", padding: "8px 0", borderRadius: 6,
              backgroundColor: COLORS.purple, color: "#fff", border: "none",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>
              🔗 Copy Share Link
            </button>
          </div>

          {/* Stats */}
          {data && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <StatCard label="Total Referrals" value={data.total_referrals} color={COLORS.cyan} />
                <StatCard label="Active" value={data.active_referrals} color={COLORS.green} />
              </div>

              {/* Rewards */}
              <div style={{
                padding: 10, borderRadius: 8, backgroundColor: COLORS.bgCard,
                border: `1px solid ${COLORS.border}`, marginBottom: 10,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.gold, marginBottom: 6 }}>
                  🎁 YOUR REWARDS
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.8 }}>
                  <div>⭐ +{data.rewards.bonus_marcus_queries} bonus Marcus queries</div>
                  <div>🔍 +{data.rewards.bonus_scans_per_day} bonus scans/day</div>
                </div>
              </div>

              {/* Referral History */}
              {data.referrals.length > 0 && (
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 6 }}>
                  RECENT REFERRALS
                </div>
              )}
              {data.referrals.slice(0, 10).map((r, i) => (
                <div key={i} style={{
                  padding: 8, borderRadius: 6, backgroundColor: COLORS.bgCard,
                  marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
                    Referral #{data.total_referrals - i}
                  </div>
                  <div style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 4,
                    backgroundColor: r.is_active ? `${COLORS.green}20` : `${COLORS.textMuted}15`,
                    color: r.is_active ? COLORS.green : COLORS.textMuted,
                  }}>
                    {r.is_active ? "✓ Active" : `${r.queries_used}/10 scans`}
                  </div>
                </div>
              ))}

              {data.referrals.length === 0 && (
                <div style={{
                  textAlign: "center", padding: 20, color: COLORS.textMuted, fontSize: 12,
                }}>
                  No referrals yet. Share your code to earn rewards! 🚀
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Apply Code ─── */}
      {tab === "apply" && (
        <div style={{ padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard }}>
          <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 }}>
            Got a referral code? Enter it to get <strong style={{ color: COLORS.gold }}>+3 bonus Marcus queries</strong>.
          </p>
          <input
            type="text" placeholder="RMI-XXXXXX" value={applyCode}
            onChange={(e) => { setApplyCode(e.target.value.toUpperCase()); setApplyError(null); }}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 16,
              fontFamily: "monospace", fontWeight: 700, textAlign: "center",
              letterSpacing: 3, backgroundColor: COLORS.bg,
              border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary,
              outline: "none", boxSizing: "border-box", marginBottom: 8,
            }}
          />
          <button onClick={handleApply} disabled={applyCode.length < 5} style={{
            width: "100%", padding: "10px 0", borderRadius: 8,
            backgroundColor: applyCode.length >= 5 ? COLORS.purple : COLORS.border,
            color: "#fff", border: "none", fontSize: 13, fontWeight: 600,
            cursor: applyCode.length >= 5 ? "pointer" : "default",
          }}>
            Apply Referral Code
          </button>
          {applyError && <div style={{ marginTop: 6, color: COLORS.red, fontSize: 11, textAlign: "center" }}>❌ {applyError}</div>}
          {applySuccess && <div style={{ marginTop: 6, color: COLORS.green, fontSize: 11, textAlign: "center" }}>✅ {applySuccess}</div>}
        </div>
      )}

      {/* ─── Leaderboard ─── */}
      {tab === "leaderboard" && (
        <>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8, textAlign: "center" }}>
            TOP REFERRERS — ALL TIME
          </div>
          {leaders.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: COLORS.textMuted, fontSize: 12 }}>
              Be the first referrer! 🏆
            </div>
          ) : (
            leaders.map((l) => (
              <div key={l.rank} style={{
                padding: 10, borderRadius: 8, backgroundColor: COLORS.bgCard,
                marginBottom: 4, display: "flex", alignItems: "center", gap: 10,
                border: l.rank <= 3 ? `1px solid ${l.rank === 1 ? COLORS.gold : l.rank === 2 ? "#C0C0C0" : "#CD7F32"}30` : "none",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: l.rank <= 3 ? 16 : 12, fontWeight: 700,
                  backgroundColor: l.rank <= 3 ? `${COLORS.gold}15` : COLORS.bg,
                  color: l.rank <= 3 ? COLORS.gold : COLORS.textMuted,
                }}>
                  {l.rank <= 3 ? ["🥇", "🥈", "🥉"][l.rank - 1] : `#${l.rank}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{l.username}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                    {l.referral_count} referrals · +{l.bonus_earned} bonus queries
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </Container>
  );
};

// ─── Sub-components ─────────────────────────────────────────────

const Container: React.FC<{ onBack: () => void; children: React.ReactNode }> = ({ onBack, children }) => (
  <div style={{
    width: 380, minHeight: 480, maxHeight: 600, overflowY: "auto",
    backgroundColor: COLORS.bg, color: COLORS.textPrimary, fontFamily: "system-ui", padding: 16,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: COLORS.textSecondary, cursor: "pointer", fontSize: 16, padding: 4 }}>←</button>
      <span style={{ fontWeight: 700, fontSize: 16 }}>🎁 Referrals</span>
    </div>
    {children}
  </div>
);

const TabBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 10, fontWeight: 600,
    backgroundColor: active ? `${COLORS.purple}20` : "transparent",
    border: `1px solid ${active ? COLORS.purple : COLORS.border}`,
    color: active ? COLORS.purpleLight : COLORS.textMuted, cursor: "pointer",
  }}>{label}</button>
);

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={{
    flex: 1, padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard,
    textAlign: "center", border: `1px solid ${color}15`,
  }}>
    <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2 }}>{label}</div>
  </div>
);

export default Referral;
