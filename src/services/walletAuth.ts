/**
 * Wallet Auth Service — Sign-in with Solana wallet (Phantom, Solflare, etc.)
 *
 * Flow:
 * 1. Extension requests a challenge nonce from API
 * 2. Background relays to content script → page-level Phantom.signMessage
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

// ─── Phantom Wallet Bridge ──────────────────────────────────────

interface WalletBridgeResult {
  success: boolean;
  publicKey?: string;
  isConnected?: boolean;
  phantom?: boolean;
  signature?: string;
  error?: string;
}

/**
 * Send a message to the wallet bridge content script via the background.
 */
async function walletBridgeCall(action: string, params: Record<string, any> = {}): Promise<WalletBridgeResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...params }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message || "Bridge communication failed" });
        return;
      }
      resolve(response || { success: false, error: "No response from wallet bridge" });
    });
  });
}

/**
 * Detect if Phantom wallet is available on any open tab.
 */
export async function detectPhantom(): Promise<{ available: boolean; connected: boolean; publicKey: string | null }> {
  const result = await walletBridgeCall("wallet-detect");
  return {
    available: result.success && !!result.phantom,
    connected: result.success && !!result.isConnected,
    publicKey: result.publicKey || null,
  };
}

/**
 * Connect to Phantom wallet and get the public key.
 */
export async function connectPhantom(): Promise<{ success: boolean; publicKey?: string; error?: string }> {
  const result = await walletBridgeCall("wallet-connect");
  return result;
}

/**
 * Sign a message with Phantom and return the base58-encoded signature.
 */
export async function signWithPhantom(message: string, nonce: string): Promise<{ success: boolean; signature?: string; publicKey?: string; error?: string }> {
  const result = await walletBridgeCall("wallet-sign", { message, nonce });
  return result;
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
 * Full wallet auth flow using Phantom signing:
 * 1. Get challenge nonce
 * 2. Sign with Phantom
 * 3. Send signature to API
 */
export async function authenticateWithPhantom(): Promise<AuthResult> {
  // Step 1: Get challenge
  const challenge = await getChallenge();
  if (!challenge) {
    return { success: false, error: "Couldn't connect to API" };
  }

  // Step 2: Sign with Phantom
  const signResult = await signWithPhantom(challenge.message, challenge.nonce);
  if (!signResult.success || !signResult.signature || !signResult.publicKey) {
    return { success: false, error: signResult.error || "Wallet signing failed" };
  }

  // Step 3: Verify with API
  return verifyWalletSignature(signResult.publicKey, signResult.signature, challenge.nonce);
}

/**
 * Verify a signed challenge with the API. Creates or logs in user.
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

/**
 * Manual wallet auth (paste address) — fallback when Phantom isn't available.
 * Uses a simplified flow without signature verification.
 */
export async function authenticateWithAddress(walletAddress: string): Promise<AuthResult> {
  const challenge = await getChallenge();
  if (!challenge) {
    return { success: false, error: "Couldn't connect to API" };
  }
  // Send "manual-entry" as signature — backend will soft-verify
  return verifyWalletSignature(walletAddress, "manual-entry", challenge.nonce);
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
