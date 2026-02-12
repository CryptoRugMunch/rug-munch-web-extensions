/**
 * Social — Follow scanners, social feed, discover top users.
 */

import React, { useState, useEffect } from "react";
import { COLORS, riskColor, riskEmoji } from "../utils/designTokens";
import {
  getFeed, getFollowing, discoverUsers, followUser, unfollowUser,
  type FeedItem, type FollowUser,
} from "../services/social";

type Tab = "feed" | "following" | "discover";

const Social: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>("feed");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [discover, setDiscover] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [f, fo, d] = await Promise.all([
      getFeed(20),
      getFollowing(),
      discoverUsers(10),
    ]);
    if (f) setFeed(f.feed);
    if (fo) setFollowing(fo.following);
    if (d) setDiscover(d.users);
    setLoading(false);
  }

  async function handleFollow(userId: number) {
    const ok = await followUser(userId);
    if (ok) loadData();
  }

  async function handleUnfollow(userId: number) {
    const ok = await unfollowUser(userId);
    if (ok) loadData();
  }

  const followingIds = new Set(following.map((f) => f.user_id));

  return (
    <div style={{
      width: 380, minHeight: 480,
      backgroundColor: COLORS.bg, color: COLORS.textPrimary,
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: 16, overflow: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={onBack} style={backBtnStyle}>←</button>
        <span style={{ fontWeight: 700, fontSize: 16, color: COLORS.gold }}>👥 Social</span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["feed", "following", "discover"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "6px 0", borderRadius: 6,
            fontSize: 11, fontWeight: tab === t ? 700 : 400, cursor: "pointer",
            backgroundColor: tab === t ? `${COLORS.purple}30` : "transparent",
            color: tab === t ? COLORS.purpleLight : COLORS.textMuted,
            border: `1px solid ${tab === t ? COLORS.purple + "40" : "transparent"}`,
          }}>
            {t === "feed" ? "📡 Feed" : t === "following" ? `🔗 Following (${following.length})` : "🔍 Discover"}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: COLORS.textMuted }}>Loading...</div>
      ) : (
        <>
          {tab === "feed" && <FeedTab feed={feed} />}
          {tab === "following" && <FollowingTab following={following} onUnfollow={handleUnfollow} />}
          {tab === "discover" && (
            <DiscoverTab users={discover} followingIds={followingIds}
              onFollow={handleFollow} onUnfollow={handleUnfollow} />
          )}
        </>
      )}
    </div>
  );
};

// ─── Feed Tab ──────────────────────────────────────────────────

const FeedTab: React.FC<{ feed: FeedItem[] }> = ({ feed }) => (
  <div>
    {feed.length === 0 ? (
      <EmptyState emoji="📡" title="Feed is empty" sub="Follow scanners to see their activity here" />
    ) : feed.map((item, i) => (
      <div key={i} style={{
        padding: 10, borderRadius: 8, marginBottom: 6,
        backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{item.display_name}</span>
          <span style={{ fontSize: 9, color: COLORS.textMuted }}>{timeAgo(item.created_at)}</span>
        </div>
        {item.token_symbol && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 18 }}>{riskEmoji(item.risk_score)}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: riskColor(item.risk_score) }}>
                ${item.token_symbol} — {item.risk_score ?? "?"}/100
              </div>
              {item.summary && (
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                  {item.summary.slice(0, 80)}{item.summary.length > 80 ? "..." : ""}
                </div>
              )}
            </div>
          </div>
        )}
        {item.token_address && (
          <div style={{
            fontSize: 8, fontFamily: "monospace", color: COLORS.textMuted,
            marginTop: 4, cursor: "pointer", wordBreak: "break-all",
          }}
            onClick={() => navigator.clipboard.writeText(item.token_address!)}
            title="Click to copy"
          >
            {item.token_address}
          </div>
        )}
      </div>
    ))}
  </div>
);

// ─── Following Tab ─────────────────────────────────────────────

const FollowingTab: React.FC<{
  following: FollowUser[]; onUnfollow: (id: number) => void
}> = ({ following, onUnfollow }) => (
  <div>
    {following.length === 0 ? (
      <EmptyState emoji="🔗" title="Not following anyone" sub="Discover top scanners and follow them" />
    ) : following.map((u) => (
      <UserRow key={u.user_id} user={u}
        action={
          <button onClick={() => onUnfollow(u.user_id)} style={{
            padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer",
            backgroundColor: `${COLORS.red}15`, border: `1px solid ${COLORS.red}30`,
            color: COLORS.red,
          }}>Unfollow</button>
        }
      />
    ))}
  </div>
);

// ─── Discover Tab ──────────────────────────────────────────────

const DiscoverTab: React.FC<{
  users: FollowUser[]; followingIds: Set<number>;
  onFollow: (id: number) => void; onUnfollow: (id: number) => void;
}> = ({ users, followingIds, onFollow, onUnfollow }) => (
  <div>
    {users.length === 0 ? (
      <EmptyState emoji="🔍" title="No public scanners yet" sub="Be the first — make your profile public!" />
    ) : users.map((u) => {
      const isFollowing = followingIds.has(u.user_id);
      return (
        <UserRow key={u.user_id} user={u}
          action={
            <button onClick={() => isFollowing ? onUnfollow(u.user_id) : onFollow(u.user_id)} style={{
              padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer",
              backgroundColor: isFollowing ? `${COLORS.red}15` : `${COLORS.purple}15`,
              border: `1px solid ${isFollowing ? COLORS.red + "30" : COLORS.purple + "40"}`,
              color: isFollowing ? COLORS.red : COLORS.purpleLight,
            }}>
              {isFollowing ? "Unfollow" : "Follow"}
            </button>
          }
        />
      );
    })}
  </div>
);

// ─── Shared ────────────────────────────────────────────────────

const UserRow: React.FC<{ user: FollowUser; action: React.ReactNode }> = ({ user, action }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 0", borderBottom: `1px solid ${COLORS.border}`,
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      backgroundColor: `${COLORS.purple}20`, display: "flex",
      alignItems: "center", justifyContent: "center", fontSize: 14,
    }}>
      👤
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{user.display_name}</div>
      <div style={{ fontSize: 10, color: COLORS.textMuted }}>
        {user.total_scans} scans
        {user.accuracy_rate ? ` · ${user.accuracy_rate}% accuracy` : ""}
      </div>
    </div>
    {action}
  </div>
);

const EmptyState: React.FC<{ emoji: string; title: string; sub: string }> = ({ emoji, title, sub }) => (
  <div style={{ textAlign: "center", padding: 30 }}>
    <div style={{ fontSize: 28, marginBottom: 8 }}>{emoji}</div>
    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{title}</div>
    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{sub}</div>
  </div>
);

function timeAgo(ts: string | null): string {
  if (!ts) return "";
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ""; }
}

const backBtnStyle: React.CSSProperties = {
  background: "none", border: "none",
  color: COLORS.textSecondary, cursor: "pointer",
  fontSize: 18, padding: 0,
};

export default Social;
