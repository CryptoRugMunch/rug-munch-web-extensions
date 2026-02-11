/**
 * Background Service Worker
 *
 * Handles:
 * - Message passing between content scripts and popup
 * - Badge updates on active tab
 * - Side panel registration
 * - Periodic cache cleanup
 */

// Register side panel
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "SCAN_REQUEST":
      // Forward scan request to API (handled in content script directly)
      break;

    case "UPDATE_BADGE":
      if (sender.tab?.id) {
        const { score } = message;
        const color = score >= 75 ? "#FF4757" : score >= 50 ? "#FF8C00" : score >= 25 ? "#E7C55F" : "#2ED573";
        const text = score >= 75 ? "!" : score >= 50 ? "⚠" : "";

        chrome.action.setBadgeText({ text, tabId: sender.tab.id });
        chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
      }
      break;

    case "OPEN_SIDE_PANEL":
      if (sender.tab?.id && sender.tab?.windowId) {
        chrome.sidePanel?.open?.({ windowId: sender.tab.windowId });
      }
      break;

    case "GET_STORAGE":
      chrome.storage.local.get(message.keys, (result) => {
        sendResponse(result);
      });
      return true; // Keep channel open for async response

    case "SET_STORAGE":
      chrome.storage.local.set(message.data, () => {
        sendResponse({ success: true });
      });
      return true;
  }
});

// Clean up old IndexedDB cache entries periodically (every 6 hours)
chrome.alarms.create("cache-cleanup", { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "cache-cleanup") {
    try {
      // Clean up old IndexedDB entries (> 24 hours)
      const DB_NAME = "rugmunch_cache";
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("scans", "readwrite");
        const store = tx.objectStore("scans");
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const now = Date.now();
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          for (const entry of getAllReq.result) {
            if (now - entry.timestamp > maxAge) {
              store.delete(entry.mint);
            }
          }
        };
      };
      console.log("[RMS] Cache cleanup completed");
    } catch (e) {
      console.error("[RMS] Cache cleanup error:", e);
    }
  }
});

// On install/update
// Context menu
chrome.contextMenus?.create?.({
  id: "scan-selected",
  title: "🗿 Scan with Rug Munch",
  contexts: ["selection"],
});

chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId === "scan-selected" && info.selectionText) {
    const text = info.selectionText.trim();
    // Check if it looks like a Solana address
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
      // Open popup with the address pre-filled
      // Store it so popup can read it
      chrome.storage.local.set({ pending_scan: text });
      // Can't programmatically open popup, but badge indicates action
      if (tab?.id) {
        chrome.action.setBadgeText({ text: "?", tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: "#7E4CFF", tabId: tab.id });
      }
    }
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[RMS] Rug Munch Scanner installed");
    // Set defaults
    chrome.storage.local.set({
      tier: "free",
      scan_count: 0,
      settings: {
        autoScan: true,
        showBadges: true,
        swapWarnings: true,
      },
    });
  }
});

export {};
