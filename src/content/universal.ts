/**
 * Universal CA Detection
 *
 * Scans page content for Solana contract addresses and offers
 * to scan them. Works on any page via context menu or page scan.
 *
 * Detection: Base58 strings of 32-44 chars matching Solana address pattern.
 */

// Solana address regex: Base58 chars, 32-44 length
const SOLANA_ADDRESS_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

// Known non-address patterns to exclude
const EXCLUDE_PATTERNS = new Set([
  "11111111111111111111111111111111", // System program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token program
]);

/**
 * Scan visible text for Solana addresses.
 */
export function detectAddressesOnPage(): string[] {
  const text = document.body.innerText;
  const matches = text.match(SOLANA_ADDRESS_RE) || [];

  // Deduplicate and filter
  const unique = [...new Set(matches)].filter((addr) => {
    if (EXCLUDE_PATTERNS.has(addr)) return false;
    if (addr.length < 32 || addr.length > 44) return false;
    // Additional heuristic: real addresses usually have mixed case
    if (addr === addr.toLowerCase() || addr === addr.toUpperCase()) return false;
    return true;
  });

  return unique.slice(0, 20); // Max 20 addresses per page
}

/**
 * Get selected text that looks like a Solana address.
 */
export function getSelectedAddress(): string | null {
  const selection = window.getSelection()?.toString().trim();
  if (!selection) return null;

  const match = selection.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  return match ? match[0] : null;
}

// Listen for messages from background to scan page
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DETECT_ADDRESSES") {
    const addresses = detectAddressesOnPage();
    sendResponse({ addresses });
  }
  if (message.type === "GET_SELECTED_ADDRESS") {
    const address = getSelectedAddress();
    sendResponse({ address });
  }
});

export {};
