/**
 * Reputation — Points, tier progress, perks, and leaderboard.
 */

import React, { useState, useEffect } from "react";
import { COLORS } from "../utils/designTokens";
import {
  getReputation, getRepHistory, getRepLeaderboard, claimPerk,
  type ReputationProfile, type RepEvent, type RepLeader,
} from "../services/social";

type Tab = "overview" | "history" | "leaderboard";

const Reputation: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>("overview");
  const [rep, setRep] = useState<ReputationProfile | null>(null);
  const [history, setHistory] = useState<RepEvent[]>([]);
  const [leaders, setLeaders] = useState<RepLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [r, h, l] = await Promise.all([
      getReputation(),
      getRepHistory(15),
      getRepLeaderboard("alltime", 10),
    ]);
    if (r) setRep(r);
    if (h) setHistory(h.events);
    if (l) setLeaders(l.leaders);
    setLoading(false);
  }

  async function handleClaim(perkId: string) {
    const result = await claimPerk(perkId);
    if (result?.success) {
      setClaimMsg(result.message);
      loadData();
    } else {
      setClaimMsg(result?.message || "Claim failed");
    }
    setTimeout(() => setClaimMsg(null), 3000);
  }

  return (
    <div style={{
      width: "100%", maxWidth: 420, minHeight: "100%", boxSizing: "border-box" as const,
      backgroundColor: COLORS.bg, color: COLORS.textPrimary,
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: 16, overflow: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={onBack} style={backBtnStyle}>←</button>
        <span style={{ fontWeight: 700, fontSize: 16, color: COLORS.gold }}>🏛️ Reputation</span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: COLORS.textMuted }}>Loading...</div>
      ) : !rep ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔰</div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary }}>Start scanning to build reputation</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
            Every scan earns points. Accurate calls earn more.
          </div>
        </div>
      ) : (
        <>
          {/* Tier Card */}
          <div style={{
            padding: 14, borderRadius: 10,
            backgroundColor: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 12, textAlign: "center",
          }}>
            <div style={{ fontSize: 32 }}>{rep.tier_info.emoji}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.gold, marginTop: 4 }}>
              {rep.tier_info.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.purple, marginTop: 4 }}>
              {rep.points.toLocaleString()} pts
            </div>

            {/* Progress to next tier */}
            {rep.next_tier && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>
                  {rep.next_tier.points_remaining} pts to {rep.next_tier.emoji} {rep.next_tier.label}
                </div>
                <div style={{
                  width: "100%", height: 6, backgroundColor: COLORS.border,
                  borderRadius: 3, overflow: "hidden",
                }}>
                  <div style={{
                    width: `${rep.next_tier.progress}%`, height: "100%",
                    backgroundColor: COLORS.purple, borderRadius: 3,
                    transition: "width 0.5s",
                  }} />
                </div>
              </div>
            )}

            {/* Stats row */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8, marginTop: 12, fontSize: 11,
            }}>
              <StatBox label="Scans" value={rep.total_scans.toLocaleString()} />
              <StatBox label="Win Rate" value={`${rep.win_rate}%`} />
              <StatBox label="Calls" value={rep.successful_calls.toLocaleString()} />
            </div>

            {/* Rank */}
            {rep.rank_alltime && (
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 8 }}>
                Rank #{rep.rank_alltime} all-time
                {rep.rank_weekly ? ` · #${rep.rank_weekly} this week` : ""}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {(["overview", "history", "leaderboard"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "6px 0", borderRadius: 6,
                fontSize: 11, fontWeight: tab === t ? 700 : 400, cursor: "pointer",
                backgroundColor: tab === t ? `${COLORS.purple}30` : "transparent",
                color: tab === t ? COLORS.purpleLight : COLORS.textMuted,
                border: `1px solid ${tab === t ? COLORS.purple + "40" : "transparent"}`,
              }}>
                {t === "overview" ? "🏆 Perks" : t === "history" ? "📜 History" : "🏅 Ranks"}
              </button>
            ))}
          </div>

          {/* Claim message */}
          {claimMsg && (
            <div style={{
              padding: 8, borderRadius: 6, marginBottom: 8,
              backgroundColor: `${COLORS.green}15`, color: COLORS.green,
              fontSize: 11, textAlign: "center",
            }}>
              {claimMsg}
            </div>
          )}

          {/* Tab content */}
          {tab === "overview" && <PerksTab rep={rep} onClaim={handleClaim} />}
          {tab === "history" && <HistoryTab events={history} />}
          {tab === "leaderboard" && <LeaderboardTab leaders={leaders} />}
        </>
      )}
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────

const PerksTab: React.FC<{ rep: ReputationProfile; onClaim: (id: string) => void }> = ({ rep, onClaim }) => (
  <div>
    {rep.perks_unlocked.length > 0 && (
      <>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>Unlocked</div>
        {rep.perks_unlocked.map((p) => (
          <PerkCard key={p.id} perk={p} claimed={rep.claimed_perks.includes(p.id)} onClaim={onClaim} />
        ))}
      </>
    )}
    {rep.perks_locked.length > 0 && (
      <>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, marginTop: 10 }}>Locked</div>
        {rep.perks_locked.map((p) => (
          <PerkCard key={p.id} perk={p} claimed={false} onClaim={onClaim} locked />
        ))}
      </>
    )}
  </div>
);

const PerkCard: React.FC<{
  perk: any; claimed: boolean; locked?: boolean; onClaim: (id: string) => void
}> = ({ perk, claimed, locked, onClaim }) => (
  <div style={{
    padding: 10, borderRadius: 8, marginBottom: 6,
    backgroundColor: COLORS.bgCard,
    border: `1px solid ${locked ? COLORS.border : COLORS.purple + "40"}`,
    opacity: locked ? 0.6 : 1,
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: locked ? COLORS.textMuted : COLORS.textPrimary }}>
          {perk.name}
        </div>
        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
          {perk.description}
        </div>
      </div>
      {!locked && !perk.auto_unlock && !claimed && (
        <button onClick={() => onClaim(perk.id)} style={{
          padding: "4px 10px", borderRadius: 6,
          backgroundColor: `${COLORS.green}20`, border: `1px solid ${COLORS.green}40`,
          color: COLORS.green, fontSize: 10, cursor: "pointer",
        }}>
          Claim
        </button>
      )}
      {claimed && <span style={{ fontSize: 10, color: COLORS.green }}>✓ Claimed</span>}
      {perk.auto_unlock && !locked && <span style={{ fontSize: 10, color: COLORS.cyan }}>Auto</span>}
    </div>
    {locked && perk.points_remaining != null && (
      <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4 }}>
        🔒 {perk.points_remaining} more points needed
      </div>
    )}
  </div>
);

const HistoryTab: React.FC<{ events: RepEvent[] }> = ({ events }) => (
  <div>
    {events.length === 0 ? (
      <div style={{ textAlign: "center", padding: 20, color: COLORS.textMuted, fontSize: 12 }}>
        No reputation events yet. Start scanning!
      </div>
    ) : events.map((e, i) => (
      <div key={i} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 0", borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.textPrimary }}>
            {eventLabel(e.event_type)}
          </div>
          {e.description && (
            <div style={{ fontSize: 9, color: COLORS.textMuted }}>{e.description}</div>
          )}
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: e.points_change >= 0 ? COLORS.green : COLORS.red,
        }}>
          {e.points_change >= 0 ? "+" : ""}{e.points_change}
        </span>
      </div>
    ))}
  </div>
);

const LeaderboardTab: React.FC<{ leaders: RepLeader[] }> = ({ leaders }) => (
  <div>
    {leaders.map((l, i) => (
      <div key={l.user_id} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 0", borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <span style={{
          fontSize: 14, fontWeight: 800, width: 24, textAlign: "center",
          color: i === 0 ? COLORS.gold : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : COLORS.textMuted,
        }}>
          {i < 3 ? ["🥇", "🥈", "🥉"][i] : `${i + 1}`}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{l.username}</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted }}>
            {l.tier_info.emoji} {l.tier_info.label} · {l.total_scans} scans · {l.win_rate}% win
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple }}>
          {l.points.toLocaleString()}
        </span>
      </div>
    ))}
    {leaders.length === 0 && (
      <div style={{ textAlign: "center", padding: 20, color: COLORS.textMuted, fontSize: 12 }}>
        No reputation data yet.
      </div>
    )}
  </div>
);

const StatBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    padding: 6, borderRadius: 6, backgroundColor: `${COLORS.purple}10`,
    textAlign: "center",
  }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>{value}</div>
    <div style={{ fontSize: 9, color: COLORS.textMuted }}>{label}</div>
  </div>
);

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    scan: "🔍 Token Scan",
    successful_call: "✅ Successful Call",
    early_detection: "⚡ Early Detection",
    false_positive: "❌ False Positive",
    blacklist_flag: "🚩 Blacklist Flag",
    blacklist_confirmed: "🏴 Flag Confirmed",
    referral: "🎁 Referral",
    daily_streak: "🔥 Daily Streak",
    share: "📤 Share",
    first_scan: "🎉 First Scan",
  };
  return map[type] || type;
}

const backBtnStyle: React.CSSProperties = {
  background: "none", border: "none",
  color: COLORS.textSecondary, cursor: "pointer",
  fontSize: 18, padding: 0,
};

export default Reputation;
