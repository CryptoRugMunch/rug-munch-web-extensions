/**
 * GMGN Content Script
 *
 * Auto-injects a json-render ScoreCard on token pages.
 */

import { scanToken } from "../services/api";
import { extractMintFromUrl } from "../utils/shadowInject";
import { injectScoreCard, removeAllCards } from "../ui-catalog/injectCard";

const __rms_guard_key = '__rms_gmgn_injected';
if ((window as any)[__rms_guard_key]) {
  // Already running
} else {
  (window as any)[__rms_guard_key] = true;

let currentMint: string | null = null;
let scanInProgress = false;

async function injectRiskCard() {
  if (scanInProgress) return;
  const mint = extractMintFromUrl(window.location.href);
  if (!mint || mint === currentMint) return;

  currentMint = mint;
  scanInProgress = true;

  try {
    removeAllCards();
    const result = await scanToken(mint);
    if (!result.success || !result.data || result.data.not_scanned) return;

    try {
      chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: result.data.risk_score });
      chrome.runtime.sendMessage({
        type: "PAGE_TOKEN_DETECTED", mint, chain: "solana", url: window.location.href,
      });
    } catch {}

    injectScoreCard(`gmgn-${mint}`, document.body, result.data, {
      position: "float-right",
    });
  } catch (e) {
    console.error("[RMS] GMGN injection error:", e);
  } finally {
    scanInProgress = false;
  }
}

injectRiskCard();

let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    currentMint = null;
    removeAllCards();
    setTimeout(injectRiskCard, 800);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_PAGE_TOKEN") {
    sendResponse({ mint: currentMint, chain: "solana", url: window.location.href });
  }
  return false;
});

} // end __rms_guard
