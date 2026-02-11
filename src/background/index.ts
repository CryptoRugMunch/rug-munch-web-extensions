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

export {};
