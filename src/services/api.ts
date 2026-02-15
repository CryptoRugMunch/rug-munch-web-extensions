/**
 * Rug Munch Extension API Service
 *
 * All requests go through the internal API — never DexScreener/CoinGecko directly.
 * Cache-first with stale-while-revalidate pattern via IndexedDB.
 */

import { getApiBase } from "../utils/config";
import type { RiskBreakdown } from "../types/scan";

let _apiBaseCache: string | null = null;
async function getApiBaseUrl(): Promise<string> {
  if (!_apiBaseCache) {
    _apiBaseCache = await getApiBase();
  }
  return _apiBaseCache;
}

export interface ScanResult {
  token_address: string;
  chain: string;
  token_name: string | null;
  token_symbol: string | null;
  risk_score: number | null;
  risk_label?: string;
  price_usd: number;
  liquidity_usd: number;
  market_cap: number;
  holder_count: number;
  top_10_holder_percent: number;
  created_at: string | null;
  risk_factors?: string[];
  not_scanned?: boolean;
  live_scanned?: boolean;
  // Rich risk breakdown (from scan_cache.result_json)
  risk_breakdown?: RiskBreakdown;
  token_age_days?: number | null;
  volume_24h?: number | null;
  price_change_24h?: number | null;
  txns_24h_buys?: number | null;
  txns_24h_sells?: number | null;
  freeze_authority?: boolean | null;
  mint_authority?: boolean | null;
  creator_address?: string | null;
}

export interface ExtScanResponse {
  success: boolean;
  data?: ScanResult;
  cached: boolean;
  error?: string;
}

export interface BatchScanResponse {
  results: Record<string, ScanResult>;
  cached_count: number;
  fresh_count: number;
}

// Rate limiting handled server-side (Valkey)

async function getAuthToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(["auth_token"]);
    return result.auth_token || null;
  } catch {
    return null;
  }
}



export async function scanToken(mint: string, chain = "solana"): Promise<ExtScanResponse> {
  // Rate limiting is server-side (Valkey). Client just passes through.

  try {
    // Check IndexedDB cache first
    const cached = await getCachedScan(mint);
    if (cached && Date.now() - cached.timestamp < 300_000) {
      return { success: true, data: cached.data, cached: true };
    }

    const token = await getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const baseUrl = await getApiBaseUrl();
    const resp = await fetch(`${baseUrl}/ext/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ token_address: mint, chain }),
    });


    if (!resp.ok) {
      // Return stale cache if available
      if (cached) return { success: true, data: cached.data, cached: true };
      const err = await resp.json().catch(() => ({}));
      return { success: false, cached: false, error: err.detail || `HTTP ${resp.status}` };
    }

    // The API returns the ScanResult directly (not wrapped)
    const data: ScanResult = await resp.json();

    // Store in IndexedDB (only if we got real data)
    if (!data.not_scanned) {
      await cacheScan(mint, data);
    }

    return { success: true, data, cached: false };
  } catch (e: any) {
    // Network error — return stale cache
    const cached = await getCachedScan(mint);
    if (cached) return { success: true, data: cached.data, cached: true };
    return { success: false, cached: false, error: e.message || "Network error" };
  }
}

export async function batchScan(mints: string[], chain = "solana"): Promise<BatchScanResponse> {
  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const baseUrl = await getApiBaseUrl();
    const resp = await fetch(`${baseUrl}/ext/batch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tokens: mints, chain }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch {
    return { results: {}, cached_count: 0, fresh_count: 0 };
  }
}

// ─── IndexedDB Cache ───────────────────────────────────────────

const DB_NAME = "rugmunch_cache";
const DB_VERSION = 1;
const STORE_NAME = "scans";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "mint" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedScan(mint: string): Promise<{ data: ScanResult; timestamp: number } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(mint);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function cacheScan(mint: string, data: ScanResult): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ mint, data, timestamp: Date.now() });
  } catch {}
}

// ─── Auto-Link Flow ────────────────────────────────────────────

export interface LinkInitResponse {
  link_token: string;
  bot_url: string;
  expires_in: number;
}

export interface LinkStatusResponse {
  status: "pending" | "verified" | "expired";
  telegram_id?: number;
  telegram_username?: string;
  tier?: string;
  auth_token?: string;
}

/**
 * Init auto-link: extension gets a token, opens bot deep link,
 * then polls status until bot confirms.
 */
export async function initLink(extensionId?: string): Promise<LinkInitResponse | null> {
  try {
    const baseUrl = await getApiBaseUrl();
    const resp = await fetch(`${baseUrl}/ext/link/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extension_id: extensionId || "" }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Poll link status. Returns "pending", "verified" (with creds), or "expired".
 */
export async function checkLinkStatus(token: string): Promise<LinkStatusResponse> {
  try {
    const baseUrl = await getApiBaseUrl();
    const resp = await fetch(`${baseUrl}/ext/link/status/${token}`);
    if (!resp.ok) return { status: "expired" };
    return await resp.json();
  } catch {
    return { status: "expired" };
  }
}
