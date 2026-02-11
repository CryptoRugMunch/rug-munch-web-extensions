/**
 * Wallet Auth Service — Sign-in with Solana wallet (Phantom, Solflare, etc.)
 *
 * Flow:
 * 1. Extension requests a challenge nonce from API
 * 2. User signs the nonce with their wallet (browser extension)
 * 3. Extension sends signature to API for verification
 * 4. API returns auth_token
 *
 * Also handles multi-wallet management.
 */

import { getApiBase } from "../utils/config";

let _apiBase: string | null = null;
async function getBase(): Promise<string> {
  if (!_apiBase) _apiBase = await getApiBase();
  return _apiBase;
}

async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const result = await chrome.storage.local.get("auth_token");
  if (result.auth_token) {
    headers["Authorization"] = `Bearer ${result.auth_token}`;
  }
  return headers;
}

// ─── Phantom/Solana Wallet Detection ────────────────────────────

export interface SolanaWallet {
  publicKey: { toBase58(): string };
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  isConnected: boolean;
}

/**
 * Detect available Solana wallets in the browser.
 * Checks for Phantom, Solflare, Backpack, etc.
 */
export async function detectWallets(): Promise<string[]> {
  const wallets: string[] = [];

  // We can't access window.solana from extension popup directly.
  // Instead, we inject a content script to detect wallets on the active tab.
  // For now, we'll use the manual address entry approach.
  // Wallet signing requires the content script to relay.

  return wallets;
}

// ─── Auth Flow ──────────────────────────────────────────────────

export interface AuthResult {
  success: boolean;
  authToken?: string;
  userId?: number;
  tier?: string;
  walletAddress?: string;
  walletCount?: number;
  isNewUser?: boolean;
  error?: string;
}

/**
 * Get a challenge nonce from the API.
 */
export async function getChallenge(): Promise<{ nonce: string; message: string } | null> {
  try {
    const base = await getBase();
    const resp = await fetch(`${base}/ext/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Verify a signed challenge. Creates or logs in user.
 */
export async function verifyWalletSignature(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<AuthResult> {
  try {
    const base = await getBase();
    const resp = await fetch(`${base}/ext/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet_address: walletAddress,
        signature,
        nonce,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { success: false, error: err.detail || `Error ${resp.status}` };
    }

    const data = await resp.json();

    // Store auth in chrome.storage
    await chrome.storage.local.set({
      auth_token: data.auth_token,
      tier: data.tier,
      account: {
        tier: data.tier,
        telegramId: data.telegram_id,
        primaryWallet: data.wallet_address,
        authToken: data.auth_token,
      },
    });

    return {
      success: true,
      authToken: data.auth_token,
      userId: data.user_id,
      tier: data.tier,
      walletAddress: data.wallet_address,
      walletCount: data.wallet_count,
      isNewUser: data.is_new_user,
    };
  } catch (e: any) {
    return { success: false, error: e.message || "Connection failed" };
  }
}

// ─── Multi-Wallet Management ────────────────────────────────────

export interface WalletInfo {
  id: number;
  address: string;
  chain: string;
  label: string;
  isPrimary: boolean;
  autoSync: boolean;
}

export async function listWallets(): Promise<WalletInfo[]> {
  try {
    const base = await getBase();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/ext/wallets`, { headers });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.wallets || [];
  } catch {
    return [];
  }
}

export async function addWallet(
  address: string,
  chain = "solana",
  label?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const base = await getBase();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/ext/wallets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ wallet_address: address, chain, label }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { success: false, error: err.detail || `Error ${resp.status}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function removeWallet(
  walletId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const base = await getBase();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/ext/wallets/${walletId}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { success: false, error: err.detail };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateWallet(
  walletId: number,
  updates: { label?: string; autoSync?: boolean; isPrimary?: boolean }
): Promise<{ success: boolean }> {
  try {
    const base = await getBase();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/ext/wallets/${walletId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        label: updates.label,
        auto_sync: updates.autoSync,
        is_primary: updates.isPrimary,
      }),
    });
    return { success: resp.ok };
  } catch {
    return { success: false };
  }
}
