/**
 * Background Service Worker
 *
 * Handles:
 * - Message passing between content scripts and popup
 * - Badge updates on active tab
 * - Side panel registration
 * - Context menu for right-click scanning
 * - Periodic cache cleanup
 */

// Register side panel (Chrome 116+, gracefully skip on Firefox)
try {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
} catch {}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "UPDATE_BADGE": {
      if (sender.tab?.id) {
        const score = message.score;
        if (score == null) break;
        const color = score >= 75 ? "#FF4757" : score >= 50 ? "#FF8C00" : score >= 25 ? "#E7C55F" : "#2ED573";
        const text = score >= 75 ? "!" : score >= 50 ? "⚠" : "";
        chrome.action.setBadgeText({ text, tabId: sender.tab.id });
        chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
      }
      break;
    }

    case "OPEN_SIDE_PANEL": {
      const windowId = sender.tab?.windowId;
      if (windowId) {
        // Chrome side panel
        try {
          chrome.sidePanel?.open?.({ windowId });
        } catch {
          // Firefox fallback — sidebar
          try {
            (chrome as any).sidebarAction?.open?.();
          } catch {}
        }
      }
      break;
    }

    case "GET_STORAGE":
      chrome.storage.local.get(message.keys, (result) => {
        sendResponse(result);
      });
      return true;

    case "SET_STORAGE":
      chrome.storage.local.set(message.data, () => {
        sendResponse({ success: true });
      });
      return true;
  }
});

// Periodic cache cleanup (every 6 hours)
chrome.alarms?.create("cache-cleanup", { periodInMinutes: 360 });
chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "cache-cleanup") {
    try {
      const DB_NAME = "rugmunch_cache";
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("scans")) return;
        const tx = db.transaction("scans", "readwrite");
        const store = tx.objectStore("scans");
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const now = Date.now();
          const maxAge = 24 * 60 * 60 * 1000;
          for (const entry of getAllReq.result) {
            if (now - entry.timestamp > maxAge) {
              store.delete(entry.mint);
            }
          }
        };
      };
    } catch (e) {
      console.error("[RMS] Cache cleanup error:", e);
    }
  }
});

// On install — set defaults + create context menu
chrome.runtime.onInstalled.addListener((details) => {
  // Context menu — right-click to scan selected text
  chrome.contextMenus?.create?.({
    id: "scan-selected",
    title: "🗿 Scan with Rug Munch Intelligence",
    contexts: ["selection"],
  });

  if (details.reason === "install") {
    console.log("[RMS] Rug Munch Scanner installed");
    chrome.storage.local.set({
      tier: "free",
      scan_count: 0,
      onboarded: false,
      settings: {
        autoScan: true,
        showBadges: true,
        swapWarnings: true,
      },
    });
  }
});

// Context menu click handler
chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId === "scan-selected" && info.selectionText) {
    const text = info.selectionText.trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
      chrome.storage.local.set({ pending_scan: text });
      if (tab?.id) {
        chrome.action.setBadgeText({ text: "?", tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: "#7E4CFF", tabId: tab.id });
      }
    }
  }
});


// ─── Tier Sync ──────────────────────────────────────────────────
// Auto-check entitlements on startup, every 30 min, and after link

const API_BASE_KEY = "api_base";
const DEFAULT_API_BASE = "https://cryptorugmunch.ngrok.app/api";

async function getApiBase(): Promise<string> {
  try {
    const result = await chrome.storage.local.get([API_BASE_KEY]);
    return result[API_BASE_KEY] || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

async function syncTier(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(["auth_token", "tier", "linked_telegram"]);
    const token = data.auth_token;
    if (!token) return; // Not signed in

    const base = await getApiBase();

    // Step 1: Auth refresh — handles token migration (e.g. old TG link token → canonical wallet token)
    try {
      // Include linked_telegram as fallback for when old token no longer exists in DB
      const tgId = data.linked_telegram || "";
      const refreshUrl = tgId 
        ? `${base}/ext/auth/refresh?telegram_id=${tgId}` 
        : `${base}/ext/auth/refresh`;
      const refreshResp = await fetch(refreshUrl, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (refreshResp.ok) {
        const refresh = await refreshResp.json();
        if (refresh.authenticated) {
          const updates: Record<string, unknown> = {};

          // Migrate auth token if it changed (merged identity)
          if (refresh.auth_token && refresh.auth_token !== token) {
            console.log(`[RMS] Token migrated: old=${token.slice(0,8)}… → new=${refresh.auth_token.slice(0,8)}…`);
            updates.auth_token = refresh.auth_token;
          }

          // Sync tier
          if (refresh.tier && refresh.tier !== data.tier) {
            console.log(`[RMS] Tier sync: ${data.tier} → ${refresh.tier}`);
            updates.tier = refresh.tier;
          }

          // Sync telegram link info
          if (refresh.telegram_id) {
            updates.linked_telegram = refresh.telegram_id;
          }

          if (Object.keys(updates).length > 0) {
            await chrome.storage.local.set(updates);

            // Also update the account object
            const acctResult = await chrome.storage.local.get("account");
            const acct = acctResult.account || {};
            if (updates.auth_token) acct.authToken = updates.auth_token;
            if (updates.tier) acct.tier = updates.tier;
            if (updates.linked_telegram) acct.telegramId = updates.linked_telegram;
            await chrome.storage.local.set({ account: acct });
          }
          return; // refresh handled everything
        }
      }
    } catch {
      // /auth/refresh not available — fall through to legacy sync
    }

    // Legacy fallback: direct tier check
    const resp2 = await fetch(`${base}/ext/tier`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (resp2.ok) {
      const result = await resp2.json();
      if (result.tier && result.tier !== data.tier) {
        console.log(`[RMS] Tier sync (fallback): ${data.tier} → ${result.tier}`);
        await chrome.storage.local.set({ tier: result.tier });
      }
    }
  } catch (e) {
    console.debug("[RMS] Tier sync failed (non-critical):", e);
  }
}

// Sync on startup
syncTier();

// Sync every 30 minutes
chrome.alarms?.create("tier-sync", { periodInMinutes: 30 });
chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "tier-sync") {
    await syncTier();
  }
});

// Sync when auth_token changes (e.g. after linking)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.auth_token || changes.linked_telegram)) {
    // Small delay to let the token settle
    setTimeout(() => syncTier(), 1000);
  }
});


export {};


// ─── Wallet Bridge Relay ────────────────────────────────────────
// Relays wallet operations from popup to content script on active tab

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!["wallet-detect", "wallet-connect", "wallet-sign", "wallet-disconnect"].includes(msg.action)) {
    return false;
  }

  // Find a suitable tab with Phantom available
  findWalletTab().then((tabId) => {
    if (!tabId) {
      sendResponse({
        success: false,
        error: "No crypto page open. Open DexScreener, Pump.fun, Jupiter, or any Solana site first.",
      });
      return;
    }

    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: "Couldn't reach wallet bridge. Refresh the page and try again.",
        });
        return;
      }
      sendResponse(response);
    });
  });

  return true; // async response
});

async function findWalletTab(): Promise<number | null> {
  // First try the active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id && isWalletSite(activeTab.url || "")) {
    return activeTab.id;
  }

  // Search for any open crypto tab
  const allTabs = await chrome.tabs.query({});
  for (const tab of allTabs) {
    if (tab.id && isWalletSite(tab.url || "")) {
      return tab.id;
    }
  }

  return null;
}

function isWalletSite(url: string): boolean {
  const patterns = [
    "dexscreener.com", "pump.fun", "jup.ag", "raydium.io",
    "birdeye.so", "bullx.io", "gmgn.ai", "photon-sol.tinyastro.io",
    "phantom.app", "solscan.io", "solana.fm",
  ];
  return patterns.some((p) => url.includes(p));
}


// ─── Programmatic Content Script Injection (Safari iOS fix) ─────
// Safari iOS has a known bug where declarative content_scripts in manifest.json
// don't reliably inject on every page load. This uses chrome.scripting.executeScript
// as a fallback, triggered by tab URL changes.

const CONTENT_SCRIPT_PATTERNS: Record<string, string[]> = {
  "dexscreener.com": ["*://dexscreener.com/*"],
  "pump.fun": ["*://pump.fun/*"],
  "jup.ag": ["*://jup.ag/*"],
  "gmgn.ai": ["*://gmgn.ai/*"],
  "bullx.io": ["*://bullx.io/*"],
  "birdeye.so": ["*://birdeye.so/*"],
  "raydium.io": ["*://raydium.io/*"],
  "photon-sol.tinyastro.io": ["*://photon-sol.tinyastro.io/*"],
};

function getContentScriptForUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    for (const [site] of Object.entries(CONTENT_SCRIPT_PATTERNS)) {
      if (hostname.includes(site)) return site;
    }
  } catch {}
  return null;
}

// Map site hostname → content script file from manifest
function getScriptFiles(site: string): string[] {
  const manifest = chrome.runtime.getManifest();
  const cs = manifest.content_scripts || [];
  for (const entry of cs) {
    const matches = entry.matches || [];
    if (matches.some((m: string) => m.includes(site))) {
      return entry.js || [];
    }
  }
  return [];
}

// Inject content scripts programmatically when tabs navigate to supported sites
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  const site = getContentScriptForUrl(tab.url);
  if (!site) return;

  const files = getScriptFiles(site);
  if (files.length === 0) return;

  // Try programmatic injection — will no-op if declarative already ran (guard check)
  chrome.scripting.executeScript({
    target: { tabId },
    files,
  }).catch(() => {
    // Expected to fail sometimes (e.g. restricted pages, permissions not granted)
  });
});
