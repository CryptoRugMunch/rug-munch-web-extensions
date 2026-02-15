/**
 * Pump.fun Content Script
 *
 * Injects risk badges on token pages and the token list.
 * Pump.fun URLs: pump.fun/coin/MINT or pump.fun/MINT
 */

import { RiskBadge } from "../components/RiskBadge";
import { scanToken } from "../services/api";
import { injectComponent, waitForElement, extractMintFromUrl, removeAll } from "../utils/shadowInject";

// __rms_guard: Prevent double injection (Safari programmatic + declarative)
const __rms_guard_key = '__rms_pumpfun_injected';
if ((window as any)[__rms_guard_key]) {
  // Content script already running — skip
} else {
  (window as any)[__rms_guard_key] = true;


let currentMint: string | null = null;

async function injectRiskBadge() {
  const mint = extractMintFromUrl(window.location.href);
  if (!mint || mint === currentMint) return;

  currentMint = mint;
  removeAll();

  try {
    const result = await scanToken(mint);
    if (!result.success || !result.data) return;

    const { risk_score, token_symbol } = result.data;

    // Update extension badge icon
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: risk_score });

    // Pump.fun token page — inject near the token name/header
    const headerEl = await waitForElement(
      // Pump.fun common selectors
      '.coin-title, ' +
      '[class*="coin-name"], ' +
      'h1, ' +
      '.text-3xl'
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

    // If high risk, also inject a warning banner at the top
    if (risk_score != null && risk_score >= 65) {
      const mainContent = document.querySelector("main") || document.querySelector("#__next") || document.body;
      if (mainContent) {
        const banner = document.createElement("div");
        banner.id = "rms-warning-banner";
        banner.style.cssText = `
          width: 100%; padding: 10px 16px; background: #FF475720;
          border-bottom: 2px solid #FF4757; display: flex; align-items: center;
          gap: 8px; font-family: system-ui; font-size: 13px; color: #FF4757;
          font-weight: 600; z-index: 99999; position: relative;
        `;
        const emoji = risk_score >= 75 ? "🚨" : "⚠️";
        banner.textContent = ''; banner.append(`${emoji} Rug Munch Intelligence: This token has a risk score of `); const strong = document.createElement('strong'); strong.textContent = `${risk_score}/100`; banner.append(strong); banner.append(' — proceed with caution.');

        // Add close button
        const close = document.createElement("span");
        close.textContent = "✕";
        close.style.cssText = "cursor:pointer; margin-left:auto; opacity:0.6;";
        close.onclick = () => banner.remove();
        banner.appendChild(close);

        mainContent.prepend(banner);
      }
    }
  } catch (e) {
    console.error("[RMS] Pump.fun injection error:", e);
  }
}

injectRiskBadge();

// SPA navigation observer
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    currentMint = null;
    document.getElementById("rms-warning-banner")?.remove();
    removeAll();
    setTimeout(injectRiskBadge, 800);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

} // end __rms_guard