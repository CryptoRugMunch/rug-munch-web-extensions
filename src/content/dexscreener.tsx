/**
 * DexScreener Content Script
 *
 * Injects risk badges on Solana token pages.
 * Detects token mint from URL, fetches risk score, injects badge.
 * Uses Shadow DOM for style isolation.
 */

import { RiskBadge } from "../components/RiskBadge";
import { scanToken, batchScan } from "../services/api";
import { injectComponent, waitForElement, extractMintFromUrl, removeAll } from "../utils/shadowInject";

// __rms_guard: Prevent double injection (Safari programmatic + declarative)
const __rms_guard_key = '__rms_dexscreener_injected';
if ((window as any)[__rms_guard_key]) {
  // Content script already running — skip
} else {
  (window as any)[__rms_guard_key] = true;


let currentMint: string | null = null;
let scanInProgress = false;

async function injectRiskBadge() {
  const mint = extractMintFromUrl(window.location.href);
  if (!mint || mint === currentMint || scanInProgress) return;

  currentMint = mint;
  scanInProgress = true;

  try {
    // Remove previous badges
    removeAll();

    const result = await scanToken(mint);
    if (!result.success || !result.data) return;

    const { risk_score, token_symbol } = result.data;

    // Update extension badge
    chrome.runtime.sendMessage({
      type: "UPDATE_BADGE",
      score: risk_score,
    });

    // Find injection points on DexScreener
    // 1. Token header area (next to token name)
    const headerEl = await waitForElement(
      // DexScreener uses various selectors — try common ones
      '[class*="TokenHeader"] h1, ' +
      '[class*="pair-header"] h2, ' +
      'h1[class*="chakra"], ' +
      '.ds-dex-table-row-token-name'
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

    // 2. Batch scan visible tokens in list views
    const tokenLinks = document.querySelectorAll('a[href*="/solana/"]');
    const listMints: string[] = [];
    const linkMap = new Map<string, Element>();

    for (const link of Array.from(tokenLinks).slice(0, 20)) {
      const linkMint = extractMintFromUrl((link as HTMLAnchorElement).href);
      if (linkMint && linkMint !== mint && !linkMap.has(linkMint)) {
        listMints.push(linkMint);
        linkMap.set(linkMint, link);
      }
    }

    if (listMints.length > 0) {
      try {
        const batchResult = await batchScan(listMints);
        for (const [batchMint, data] of Object.entries(batchResult.results)) {
          const linkEl = linkMap.get(batchMint);
          if (linkEl && data.risk_score !== null && data.risk_score !== undefined) {
            injectComponent(
              `list-badge-${batchMint}`,
              linkEl,
              RiskBadge,
              { score: data.risk_score, symbol: data.token_symbol, mint: batchMint, compact: true },
              "after"
            );
          }
        }
      } catch (e) {
        console.debug("[RMS] Batch scan failed:", e);
      }
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
    // Small delay for SPA content to render
    setTimeout(injectRiskBadge, 1000);
  }
});

urlObserver.observe(document.body, { childList: true, subtree: true });

// Also handle popstate for back/forward navigation
window.addEventListener("popstate", () => {
  currentMint = null;
  removeAll();
  setTimeout(injectRiskBadge, 1000);
});

} // end __rms_guard