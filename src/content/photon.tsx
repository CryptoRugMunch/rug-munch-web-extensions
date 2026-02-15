/**
 * Photon Content Script
 *
 * Injects risk badges on Photon trading terminal.
 * Photon URLs: photon-sol.tinyastro.io/en/lp/MINT
 */

import { RiskBadge } from "../components/RiskBadge";
import { scanToken } from "../services/api";
import { injectComponent, waitForElement, removeAll } from "../utils/shadowInject";

// __rms_guard: Prevent double injection (Safari programmatic + declarative)
const __rms_guard_key = '__rms_photon_injected';
if ((window as any)[__rms_guard_key]) {
  // Content script already running — skip
} else {
  (window as any)[__rms_guard_key] = true;


let currentMint: string | null = null;

function extractMint(): string | null {
  // photon-sol.tinyastro.io/en/lp/MINT_ADDRESS
  const match = window.location.href.match(/photon-sol\.tinyastro\.io\/[a-z]{2}\/lp\/([A-Za-z0-9]{32,50})/);
  if (match) return match[1];

  // Also check generic path
  const pathMatch = window.location.pathname.match(/\/([A-Za-z0-9]{32,50})$/);
  return pathMatch ? pathMatch[1] : null;
}

async function injectRiskBadge() {
  const mint = extractMint();
  if (!mint || mint === currentMint) return;

  currentMint = mint;
  removeAll();

  try {
    const result = await scanToken(mint);
    if (!result.success || !result.data || result.data.not_scanned) return;

    const { risk_score, token_symbol } = result.data;

    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: risk_score });

    const headerEl = await waitForElement(
      '[class*="token-name"], ' +
      '[class*="pair-name"], ' +
      '.token-info h1, ' +
      'h1, h2'
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
          onFullScan: () => chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }),
        },
        "after"
      );
    }

    if (risk_score != null && risk_score >= 65) {
      if (!document.getElementById("rms-warning-banner")) {
        const main = document.querySelector("main") || document.querySelector("#root") || document.body;
        if (main) {
          const banner = document.createElement("div");
          banner.id = "rms-warning-banner";
          banner.style.cssText = `
            width: 100%; padding: 10px 16px; background: #FF475720;
            border-bottom: 2px solid #FF4757; display: flex; align-items: center;
            gap: 8px; font-family: system-ui; font-size: 13px; color: #FF4757;
            font-weight: 600; z-index: 99999; position: relative;
          `;
          const emoji = risk_score >= 75 ? "🚨" : "⚠️";
          banner.textContent = ''; banner.append(`${emoji} Rug Munch Intelligence: Risk score `); const strong = document.createElement('strong'); strong.textContent = `${risk_score}/100`; banner.append(strong); banner.append(' — proceed with caution.');
          const close = document.createElement("span");
          close.textContent = "✕";
          close.style.cssText = "cursor:pointer; margin-left:auto; opacity:0.6;";
          close.onclick = () => banner.remove();
          banner.appendChild(close);
          main.prepend(banner);
        }
      }
    }
  } catch (e) {
    console.error("[RMS] Photon injection error:", e);
  }
}

injectRiskBadge();

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