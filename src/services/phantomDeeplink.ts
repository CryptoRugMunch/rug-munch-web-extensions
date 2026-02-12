/**
 * Phantom Deeplink Service — iOS Safari wallet linking.
 *
 * Flow:
 * 1. Call init() → get connect URL + session token
 * 2. Open connect URL → Phantom app opens → user approves
 * 3. Phantom redirects to our API callback → server decrypts
 * 4. Poll status() → get wallet address
 * 5. Authenticate with the address
 */

import { getApiBase } from "../utils/config";

interface DeeplinkInitResponse {
  session_token: string;
  connect_url: string;
  expires_in: number;
}

interface DeeplinkStatus {
  status: "pending" | "connected" | "rejected" | "error" | "expired";
  public_key?: string;
  error?: string;
}

let _apiBase: string | null = null;

async function getBase(): Promise<string> {
  if (!_apiBase) _apiBase = await getApiBase();
  return _apiBase;
}

/**
 * Initialize a Phantom deeplink connect session.
 * Returns the URL to open and a session token for polling.
 */
export async function initPhantomDeeplink(): Promise<DeeplinkInitResponse | null> {
  try {
    const base = await getBase();
    const resp = await fetch(`${base}/ext/phantom-deeplink/init`, {
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
 * Poll for deeplink session status.
 */
export async function checkDeeplinkStatus(sessionToken: string): Promise<DeeplinkStatus> {
  try {
    const base = await getBase();
    const resp = await fetch(`${base}/ext/phantom-deeplink/status/${sessionToken}`);
    if (!resp.ok) return { status: "error", error: `HTTP ${resp.status}` };
    return await resp.json();
  } catch {
    return { status: "error", error: "Network error" };
  }
}

/**
 * Full deeplink connect flow with polling.
 * Opens Phantom, polls for result, returns the wallet address.
 */
export async function connectViaDeeplink(
  onStatus?: (status: string) => void
): Promise<{ success: boolean; publicKey?: string; error?: string }> {
  onStatus?.("Initializing...");

  const init = await initPhantomDeeplink();
  if (!init) {
    return { success: false, error: "Failed to initialize deeplink session" };
  }

  // Open Phantom connect URL
  onStatus?.("Opening Phantom...");
  try {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url: init.connect_url });
    } else {
      window.open(init.connect_url, "_blank");
    }
  } catch {
    window.open(init.connect_url, "_blank");
  }

  // Poll for result
  onStatus?.("Waiting for approval...");
  const startTime = Date.now();
  const TIMEOUT = 5 * 60 * 1000; // 5 minutes
  const INTERVAL = 2000; // 2 seconds

  return new Promise((resolve) => {
    const poll = setInterval(async () => {
      if (Date.now() - startTime > TIMEOUT) {
        clearInterval(poll);
        resolve({ success: false, error: "Connection timed out" });
        return;
      }

      const status = await checkDeeplinkStatus(init.session_token);

      if (status.status === "connected" && status.public_key) {
        clearInterval(poll);
        onStatus?.("Connected!");
        resolve({ success: true, publicKey: status.public_key });
      } else if (status.status === "rejected") {
        clearInterval(poll);
        resolve({ success: false, error: status.error || "User rejected" });
      } else if (status.status === "error") {
        clearInterval(poll);
        resolve({ success: false, error: status.error || "Unknown error" });
      } else if (status.status === "expired") {
        clearInterval(poll);
        resolve({ success: false, error: "Session expired" });
      }
      // else: still pending, keep polling
    }, INTERVAL);
  });
}
