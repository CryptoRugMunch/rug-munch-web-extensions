/**
 * Social & Reputation API — follow system, reputation perks, feeds.
 */

import { getApiBase } from "../utils/config";

let _apiBaseCache: string | null = null;
async function base(): Promise<string> {
  if (!_apiBaseCache) _apiBaseCache = await getApiBase();
  return _apiBaseCache;
}

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { auth_token } = await chrome.storage.local.get("auth_token");
    if (auth_token) h["Authorization"] = `Bearer ${auth_token}`;
  } catch {}
  return h;
}

// ─── Reputation ────────────────────────────────────────────────

export interface ReputationProfile {
  points: number;
  tier: string;
  tier_info: { min_points: number; label: string; emoji: string };
  total_scans: number;
  successful_calls: number;
  false_positives: number;
  win_rate: number;
  rank_alltime: number | null;
  rank_monthly: number | null;
  rank_weekly: number | null;
  next_tier: {
    name: string; label: string; emoji: string;
    points_required: number; points_remaining: number; progress: number;
  } | null;
  perks_unlocked: Perk[];
  perks_locked: Perk[];
  claimed_perks: string[];
}

export interface Perk {
  id: string;
  name: string;
  description: string;
  tier_required: string;
  points_required: number;
  auto_unlock: boolean;
  unlocked: boolean;
  points_remaining?: number;
}

export interface RepEvent {
  event_type: string;
  points_change: number;
  token_address: string | null;
  description: string | null;
  timestamp: number;
}

export interface RepLeader {
  rank: number;
  user_id: number;
  username: string;
  points: number;
  tier: string;
  tier_info: { label: string; emoji: string };
  total_scans: number;
  win_rate: number;
}

export async function getReputation(): Promise<ReputationProfile | null> {
  try {
    const r = await fetch(`${await base()}/ext/reputation`, { headers: await authHeaders() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function getRepHistory(limit = 20, offset = 0): Promise<{ events: RepEvent[]; total: number } | null> {
  try {
    const r = await fetch(`${await base()}/ext/reputation/history?limit=${limit}&offset=${offset}`, { headers: await authHeaders() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function getRepPerks(): Promise<{ perks: Perk[]; tiers: Record<string, any>; point_values: Record<string, number> } | null> {
  try {
    const r = await fetch(`${await base()}/ext/reputation/perks`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function getRepLeaderboard(period = "alltime", limit = 10): Promise<{ leaders: RepLeader[] } | null> {
  try {
    const r = await fetch(`${await base()}/ext/reputation/leaderboard?period=${period}&limit=${limit}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function claimPerk(perkId: string): Promise<{ success: boolean; message: string } | null> {
  try {
    const r = await fetch(`${await base()}/ext/reputation/claim`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ perk_id: perkId }),
    });
    return await r.json();
  } catch { return null; }
}

// ─── Social / Follow ───────────────────────────────────────────

export interface SocialProfile {
  user_id: number;
  display_name: string;
  bio: string;
  is_public: boolean;
  total_scans: number;
  avg_risk_score: number;
  accuracy_rate: number;
  followers_count: number;
  following_count: number;
  recent_scans: SocialScan[];
  is_following: boolean;
}

export interface SocialScan {
  token_address: string;
  token_symbol: string | null;
  risk_score: number | null;
  summary: string | null;
  scanned_at: string | null;
}

export interface FollowUser {
  user_id: number;
  display_name: string;
  total_scans: number;
  avg_risk_score?: number;
  accuracy_rate?: number;
  followed_at: string | null;
}

export interface FeedItem {
  user_id: number;
  display_name: string;
  event_type: string;
  token_address: string | null;
  token_symbol: string | null;
  risk_score: number | null;
  summary: string | null;
  created_at: string | null;
}

export async function getSocialProfile(userId: number): Promise<SocialProfile | null> {
  try {
    const r = await fetch(`${await base()}/ext/social/profile/${userId}`, { headers: await authHeaders() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function updateProfile(data: { display_name?: string; bio?: string; is_public?: boolean; show_scans?: boolean }): Promise<boolean> {
  try {
    const r = await fetch(`${await base()}/ext/social/profile`, {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify(data),
    });
    return r.ok;
  } catch { return false; }
}

export async function followUser(userId: number): Promise<boolean> {
  try {
    const r = await fetch(`${await base()}/ext/social/follow/${userId}`, {
      method: "POST",
      headers: await authHeaders(),
    });
    return r.ok;
  } catch { return false; }
}

export async function unfollowUser(userId: number): Promise<boolean> {
  try {
    const r = await fetch(`${await base()}/ext/social/follow/${userId}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    return r.ok;
  } catch { return false; }
}

export async function getFollowing(): Promise<{ following: FollowUser[]; count: number } | null> {
  try {
    const r = await fetch(`${await base()}/ext/social/following`, { headers: await authHeaders() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function getFollowers(): Promise<{ followers: FollowUser[]; count: number } | null> {
  try {
    const r = await fetch(`${await base()}/ext/social/followers`, { headers: await authHeaders() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function getFeed(limit = 20, offset = 0): Promise<{ feed: FeedItem[]; count: number } | null> {
  try {
    const r = await fetch(`${await base()}/ext/social/feed?limit=${limit}&offset=${offset}`, { headers: await authHeaders() });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function discoverUsers(limit = 10): Promise<{ users: FollowUser[] } | null> {
  try {
    const r = await fetch(`${await base()}/ext/social/discover?limit=${limit}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
