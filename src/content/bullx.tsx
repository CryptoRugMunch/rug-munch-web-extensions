/**
 * BullX Content Script
 *
 * Injects risk badges on token pages.
 * BullX URLs: bullx.io/terminal?chainId=1399811149&address=MINT
 */

import { RiskBadge } from "../components/RiskBadge";
import { scanToken } from "../services/api";
import { injectComponent, waitForElement, removeAll } from "../utils/shadowInject";

// __rms_guard: Prevent double injection (Safari programmatic + declarative)
const __rms_guard_key = '__rms_bullx_injected';
if ((window as any)[__rms_guard_key]) {
  // Content script already running — skip
} else {
  (window as any)[__rms_guard_key] = true;


let currentMint: string | null = null;

function extractMint(): string | null {
  const url = new URL(window.location.href);
  // BullX uses ?address=MINT or /terminal?...&address=MINT
  const address = url.searchParams.get("address");
  if (address && address.length >= 32 && address.length <= 50) return address;

  // Also check path-based pattern
  const pathMatch = url.pathname.match(/\/([A-Za-z0-9]{32,50})$/);
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

    // BullX terminal — look for the token header area
    const headerEl = await waitForElement(
      '[class*="token-name"], ' +
      '[class*="pair-name"], ' +
      '[class*="TokenName"], ' +
      '[class*="symbol-name"], ' +
      '.token-header, ' +
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
      injectWarningBanner(risk_score);
    }
  } catch (e) {
    console.error("[RMS] BullX injection error:", e);
  }
}

function injectWarningBanner(score: number) {
  if (document.getElementById("rms-warning-banner")) return;
  const main = document.querySelector("main") || document.querySelector("#root") || document.body;
  if (!main) return;

  const banner = document.createElement("div");
  banner.id = "rms-warning-banner";
  banner.style.cssText = `
    width: 100%; padding: 10px 16px; background: #FF475720;
    border-bottom: 2px solid #FF4757; display: flex; align-items: center;
    gap: 8px; font-family: system-ui; font-size: 13px; color: #FF4757;
    font-weight: 600; z-index: 99999; position: relative;
  `;
  const emoji = score >= 75 ? "🚨" : "⚠️";
  banner.innerHTML = `${emoji} Rug Munch Intelligence: Risk score <strong>${score}/100</strong> — proceed with caution.`;

  const close = document.createElement("span");
  close.textContent = "✕";
  close.style.cssText = "cursor:pointer; margin-left:auto; opacity:0.6;";
  close.onclick = () => banner.remove();
  banner.appendChild(close);

  main.prepend(banner);
}

injectRiskBadge();

// SPA navigation + query param observer
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

// Also listen for URL changes via popstate (BullX uses history API)
window.addEventListener("popstate", () => {
  currentMint = null;
  document.getElementById("rms-warning-banner")?.remove();
  removeAll();
  setTimeout(injectRiskBadge, 800);
});

} // end __rms_guard