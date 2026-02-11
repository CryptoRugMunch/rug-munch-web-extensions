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
chrome.alarms.create("cache-cleanup", { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
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
    const data = await chrome.storage.local.get(["auth_token", "tier"]);
    const token = data.auth_token;
    if (!token) return; // Not signed in

    const base = await getApiBase();

    // Try /api/ext/me first (wallet auth users)
    let resp = await fetch(`${base}/ext/me`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (resp.ok) {
      const user = await resp.json();
      if (user.tier && user.tier !== data.tier) {
        console.log(`[RMS] Tier sync: ${data.tier} → ${user.tier}`);
        await chrome.storage.local.set({ tier: user.tier });
      }
      return;
    }

    // Fallback: check extension_links via a lightweight endpoint
    // If /me fails (404 = wallet-only user), check linked telegram tier
    const resp2 = await fetch(`${base}/ext/tier`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (resp2.ok) {
      const result = await resp2.json();
      if (result.tier && result.tier !== data.tier) {
        console.log(`[RMS] Tier sync (link): ${data.tier} → ${result.tier}`);
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
chrome.alarms.create("tier-sync", { periodInMinutes: 30 });

// Hook into existing alarm listener — add tier-sync case
chrome.alarms.onAlarm.addListener(async (alarm) => {
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
