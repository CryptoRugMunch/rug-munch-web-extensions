/**
 * DexScreener Content Script
 *
 * Injects risk badges on Solana token pages.
 * 
 * CRITICAL: DexScreener URLs contain PAIR/POOL addresses, NOT token mints.
 * We must extract the actual token mint from the page DOM (explorer links,
 * __NEXT_DATA__, etc.) — never trust the URL path for the token address.
 *
 * Uses Shadow DOM for style isolation.
 */

import { RiskBadge } from "../components/RiskBadge";
import { scanToken } from "../services/api";
import { injectComponent, waitForElement, removeAll } from "../utils/shadowInject";
import { extractTokenFromDexScreener, extractChainFromUrl } from "../utils/tokenExtractor";

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
 * Extract token mint from the page. Retries with backoff because
 * DexScreener is a SPA and explorer links may not be in DOM immediately.
 */
async function getTokenMint(): Promise<string | null> {
  // Try immediate extraction
  let mint = extractTokenFromDexScreener();
  if (mint) return mint;

  // DexScreener is a SPA — DOM may not have explorer links yet.
  // Retry with increasing delays.
  for (let i = 0; i < MAX_RETRIES; i++) {
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
    mint = extractTokenFromDexScreener();
    if (mint) return mint;
  }

  return null;
}

async function injectRiskBadge() {
  if (scanInProgress) return;

  const mint = await getTokenMint();
  if (!mint || mint === currentMint) return;

  currentMint = mint;
  scanInProgress = true;

  // Notify popup of detected token
  try {
    chrome.runtime.sendMessage({
      type: "PAGE_TOKEN_DETECTED",
      mint,
      chain: extractChainFromUrl(window.location.href),
      url: window.location.href,
    });
  } catch {}

  try {
    // Remove previous badges
    removeAll();

    const chain = extractChainFromUrl(window.location.href);
    const result = await scanToken(mint, chain);
    if (!result.success || !result.data) return;

    const { risk_score, token_symbol } = result.data;

    // Update extension badge icon
    try {
      chrome.runtime.sendMessage({
        type: "UPDATE_BADGE",
        score: risk_score,
      });
    } catch {}

    // Find injection point — DexScreener header area
    const headerEl = await waitForElement(
      // DexScreener class patterns (they change periodically)
      'h2.chakra-heading, ' +
      '[class*="pair-header"] h2, ' +
      'div[class*="ds-dex-table-row-base"] h2, ' +
      'h1[class*="chakra"], ' +
      // Fallback: the main heading that contains token name
      'header h2, header h1, ' +
      // Very generic fallback
      'h2'
    );

    if (headerEl) {
      injectComponent(
        `badge-${mint}`,
        headerEl,
        RiskBadge,
        {
          score: risk_score,
          symbol: token_symbol,
          mint,
          onFullScan: () => {
            chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
          },
        },
        "after"
      );
    }


  } catch (e) {
    console.error("[RMS] DexScreener injection error:", e);
  } finally {
    scanInProgress = false;
  }
}

// Run on page load
injectRiskBadge();

// Watch for SPA navigation (DexScreener is a SPA)
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    currentMint = null;
    removeAll();
    // Delay for SPA content to render
    setTimeout(injectRiskBadge, 1500);
  }
});

urlObserver.observe(document.body, { childList: true, subtree: true });

// Also handle popstate for back/forward navigation
window.addEventListener("popstate", () => {
  currentMint = null;
  removeAll();
  setTimeout(injectRiskBadge, 1500);
});

// Listen for popup requesting the detected token
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_PAGE_TOKEN") {
    // Try to get token from DOM
    const mint = extractTokenFromDexScreener();
    const chain = extractChainFromUrl(window.location.href);
    sendResponse({ mint, chain, url: window.location.href });
  }
  return false;
});

} // end __rms_guard
