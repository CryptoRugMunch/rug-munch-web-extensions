/**
 * DexScreener Content Script
 *
 * Auto-injects a rich ScoreCard (json-render) on Solana token pages.
 *
 * CRITICAL: DexScreener URLs contain PAIR/POOL addresses, NOT token mints.
 * We extract the actual token mint from Solscan/Explorer links in the DOM.
 */

import { scanToken } from "../services/api";
import { extractTokenFromDexScreener, extractChainFromUrl } from "../utils/tokenExtractor";
import { injectScoreCard, removeAllCards } from "../ui-catalog/injectCard";

// __rms_guard: Prevent double injection (Safari programmatic + declarative)
const __rms_guard_key = '__rms_dexscreener_injected';
if ((window as any)[__rms_guard_key]) {
  // Content script already running — skip
} else {
  (window as any)[__rms_guard_key] = true;

let currentMint: string | null = null;
let scanInProgress = false;
const MAX_RETRIES = 5;

/**
 * Extract token mint from the page with retries for SPA loading.
 */
async function getTokenMint(): Promise<string | null> {
  let mint = extractTokenFromDexScreener();
  if (mint) return mint;

  for (let i = 0; i < MAX_RETRIES; i++) {
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
    mint = extractTokenFromDexScreener();
    if (mint) return mint;
  }
  return null;
}

async function injectRiskCard() {
  if (scanInProgress) return;

  const mint = await getTokenMint();
  if (!mint || mint === currentMint) return;

  currentMint = mint;
  scanInProgress = true;

  // Notify popup/background of detected token
  try {
    chrome.runtime.sendMessage({
      type: "PAGE_TOKEN_DETECTED",
      mint,
      chain: extractChainFromUrl(window.location.href),
      url: window.location.href,
    });
  } catch {}

  try {
    removeAllCards();

    const chain = extractChainFromUrl(window.location.href);
    const result = await scanToken(mint, chain);
    if (!result.success || !result.data || result.data.not_scanned) return;

    // Update extension badge icon
    try {
      chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: result.data.risk_score });
    } catch {}

    // Inject the full ScoreCard as a floating panel
    injectScoreCard(`dex-${mint}`, document.body, result.data, {
      position: "float-right",
      compact: false,
    });

  } catch (e) {
    console.error("[RMS] DexScreener injection error:", e);
  } finally {
    scanInProgress = false;
  }
}

// Run on page load
injectRiskCard();

// Watch for SPA navigation
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    currentMint = null;
    removeAllCards();
    setTimeout(injectRiskCard, 1500);
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener("popstate", () => {
  currentMint = null;
  removeAllCards();
  setTimeout(injectRiskCard, 1500);
});

// Listen for popup requesting the detected token
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_PAGE_TOKEN") {
    const mint = extractTokenFromDexScreener();
    const chain = extractChainFromUrl(window.location.href);
    sendResponse({ mint, chain, url: window.location.href });
  }
  return false;
});

} // end __rms_guard
