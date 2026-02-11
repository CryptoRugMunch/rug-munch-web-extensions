/**
 * Rug Munch Extension API Service
 *
 * All requests go through the internal API — never DexScreener/CoinGecko directly.
 * Cache-first with stale-while-revalidate pattern via IndexedDB.
 */

const API_BASE = "https://cryptorugmunch.ngrok.app/api";

export interface ScanResult {
  token_address: string;
  chain: string;
  token_name: string;
  token_symbol: string;
  risk_score: number;
  risk_label: string;
  price_usd: number;
  liquidity_usd: number;
  market_cap: number;
  holder_count: number;
  top_10_holder_percent: number;
  created_at: string;
  risk_factors: string[];
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

// Rate limit tracking
let requestCount = 0;
let windowStart = Date.now();
const RATE_WINDOW_MS = 3600_000; // 1 hour

function checkRateLimit(limit: number): boolean {
  const now = Date.now();
  if (now - windowStart > RATE_WINDOW_MS) {
    requestCount = 0;
    windowStart = now;
  }
  return requestCount < limit;
}

async function getAuthToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(["auth_token"]);
    return result.auth_token || null;
  } catch {
    return null;
  }
}

async function getTierLimit(): Promise<number> {
  try {
    const result = await chrome.storage.local.get(["tier"]);
    const tier = result.tier || "free";
    switch (tier) {
      case "vip": return 999999;
      case "holder": return 100;
      case "free_linked": return 30;
      default: return 10;
    }
  } catch {
    return 10;
  }
}

export async function scanToken(mint: string, chain = "solana"): Promise<ExtScanResponse> {
  const limit = await getTierLimit();
  if (!checkRateLimit(limit)) {
    return { success: false, cached: false, error: "Rate limit reached. Upgrade tier for more scans." };
  }

  try {
    // Check IndexedDB cache first
    const cached = await getCachedScan(mint);
    if (cached && Date.now() - cached.timestamp < 300_000) {
      return { success: true, data: cached.data, cached: true };
    }

    const token = await getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const resp = await fetch(`${API_BASE}/ext/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ token_address: mint, chain }),
    });

    requestCount++;

    if (!resp.ok) {
      // Return stale cache if available
      if (cached) return { success: true, data: cached.data, cached: true };
      const err = await resp.json().catch(() => ({}));
      return { success: false, cached: false, error: err.detail || `HTTP ${resp.status}` };
    }

    const data: ScanResult = await resp.json();

    // Store in IndexedDB
    await cacheScan(mint, data);

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

    const resp = await fetch(`${API_BASE}/ext/batch`, {
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
