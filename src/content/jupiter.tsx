/**
 * Jupiter Content Script
 *
 * Injects pre-swap warnings when user is about to swap into a risky token.
 * Detects the "to" token in the swap interface and shows risk overlay.
 */

import { scanToken } from "../services/api";
import { extractMintFromUrl } from "../utils/shadowInject";

// __rms_guard: Prevent double injection (Safari programmatic + declarative)
const __rms_guard_key = '__rms_jupiter_injected';
if ((window as any)[__rms_guard_key]) {
  // Content script already running — skip
} else {
  (window as any)[__rms_guard_key] = true;


// Jupiter uses URL params: /swap/SOL-MINT
async function checkSwapTarget() {
  const mint = extractMintFromUrl(window.location.href);
  if (!mint) return;

  const result = await scanToken(mint);
  if (!result.success || !result.data || result.data.not_scanned) return;

  const { risk_score, token_symbol } = result.data;

  // Only warn on high risk tokens (null = unknown = skip)
  if (risk_score == null || risk_score < 50) return;

  chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: risk_score });

  // Find the swap button and overlay a warning
  const existingWarning = document.getElementById("rms-swap-warning");
  if (existingWarning) existingWarning.remove();

  const swapButton = document.querySelector(
    'button[class*="swap-btn"], ' +
    'button[class*="Swap"], ' +
    '.jupiter-swap button[type="submit"], ' +
    'button:not([disabled])'
  );

  if (!swapButton) return;

  const warning = document.createElement("div");
  warning.id = "rms-swap-warning";
  const isCritical = risk_score >= 75;
  warning.style.cssText = `
    width: 100%; padding: 10px 14px; margin: 8px 0;
    background: ${isCritical ? '#FF475720' : '#FF8C0020'};
    border: 1px solid ${isCritical ? '#FF4757' : '#FF8C00'};
    border-radius: 8px; font-family: system-ui; font-size: 12px;
    color: ${isCritical ? '#FF4757' : '#FF8C00'}; font-weight: 500;
  `;
  const emoji = isCritical ? "🚨" : "⚠️";
  warning.textContent = '';
  warning.append(`${emoji} `);
  const label = document.createElement('strong');
  label.textContent = 'Rug Munch Intelligence:';
  warning.append(label);
  warning.append(` $${token_symbol || 'Unknown'} has a risk score of `);
  const scoreEl = document.createElement('strong');
  scoreEl.textContent = `${risk_score}/100`;
  warning.append(scoreEl);
  warning.append(`. ${isCritical ? 'This token shows critical rug indicators.' : 'Exercise caution with this swap.'}`);

  swapButton.parentElement?.insertBefore(warning, swapButton);
}

// Check on load and URL changes
checkSwapTarget();

let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    document.getElementById("rms-swap-warning")?.remove();
    setTimeout(checkSwapTarget, 800);
  }
});
observer.observe(document.body, { childList: true, subtree: true });



// Listen for popup requesting the detected token
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_PAGE_TOKEN") {
    const mint = extractMintFromUrl(window.location.href);
    sendResponse({ mint, chain: "solana", url: window.location.href });
  }
  return false;
});

} // end __rms_guard