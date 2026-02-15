/**
 * Shadow DOM injection utility.
 *
 * Injects React components into host pages (DexScreener, Pump.fun, etc.)
 * inside a Shadow DOM to avoid CSS conflicts.
 */

import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";

// Track injected roots for cleanup
const injectedRoots = new Map<string, { root: Root; container: HTMLElement }>();

export function injectComponent(
  id: string,
  targetElement: Element,
  component: React.FC<any>,
  props: Record<string, any>,
  position: "before" | "after" | "prepend" | "append" = "after"
): void {
  // Don't double-inject
  if (injectedRoots.has(id)) return;

  // Create host element
  const host = document.createElement("div");
  host.id = `rms-${id}`;
  host.style.display = "inline-block";
  host.style.verticalAlign = "middle";

  // Create shadow root for style isolation
  const shadow = host.attachShadow({ mode: "closed" });

  // Inject minimal reset styles inside shadow
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; display: inline-block; vertical-align: middle; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
  `;
  shadow.appendChild(style);

  // Create React mount point inside shadow
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  // Insert into DOM
  switch (position) {
    case "before":
      targetElement.parentElement?.insertBefore(host, targetElement);
      break;
    case "after":
      targetElement.parentElement?.insertBefore(host, targetElement.nextSibling);
      break;
    case "prepend":
      targetElement.prepend(host);
      break;
    case "append":
      targetElement.append(host);
      break;
  }

  // Mount React
  const root = createRoot(mountPoint);
  root.render(createElement(component, props));
  injectedRoots.set(id, { root, container: host });
}

export function removeComponent(id: string): void {
  const entry = injectedRoots.get(id);
  if (entry) {
    entry.root.unmount();
    entry.container.remove();
    injectedRoots.delete(id);
  }
}

export function removeAll(): void {
  for (const [id] of injectedRoots) {
    removeComponent(id);
  }
}

/**
 * Wait for an element to appear in the DOM.
 * Uses MutationObserver for efficiency.
 */
export function waitForElement(
  selector: string,
  timeout = 10000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Extract Solana contract address from any supported site URL.
 * Used by popup for auto-detection from active tab.
 */
export function extractMintFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const path = u.pathname;

    // DexScreener: URL contains PAIR address, NOT token mint.
    // Use extractTokenFromDexScreener() from tokenExtractor.ts instead.
    // Return null to force DOM-based extraction.
    if (host.includes("dexscreener.com")) {
      return null;
    }

    // Pump.fun: /coin/MINT or /MINT
    if (host.includes("pump.fun")) {
      const m = path.match(/\/(?:coin\/)?([A-Za-z0-9]{32,50})/);
      if (m) return m[1];
    }

    // Jupiter: /swap/SOL-MINT
    if (host.includes("jup.ag")) {
      const m = path.match(/\/swap\/[A-Za-z0-9]+-([A-Za-z0-9]{32,50})/);
      if (m) return m[1];
    }

    // GMGN: /sol/token/MINT
    if (host.includes("gmgn.ai")) {
      const m = path.match(/\/sol\/token\/([A-Za-z0-9]{32,50})/);
      if (m) return m[1];
    }

    // BullX: ?address=MINT
    if (host.includes("bullx.io")) {
      const addr = u.searchParams.get("address");
      if (addr && addr.length >= 32 && addr.length <= 50) return addr;
    }

    // Birdeye: /token/MINT
    if (host.includes("birdeye.so")) {
      const m = path.match(/\/token\/([A-Za-z0-9]{32,50})/);
      if (m) return m[1];
    }

    // Raydium: ?outputCurrency=MINT
    if (host.includes("raydium.io")) {
      const output = u.searchParams.get("outputCurrency");
      if (output && output.length >= 32 && output.length <= 50) return output;
      const input = u.searchParams.get("inputCurrency");
      if (input && input.length >= 32 && input.length <= 50) return input;
    }

    // Photon: /en/lp/MINT
    if (host.includes("photon-sol.tinyastro.io")) {
      const m = path.match(/\/lp\/([A-Za-z0-9]{32,50})/);
      if (m) return m[1];
    }

    // Generic fallback: base58 address in path
    const genericMatch = path.match(/\/([A-HJ-NP-Za-km-z1-9]{32,44})/);
    if (genericMatch) return genericMatch[1];

  } catch {
    // Invalid URL — try regex on raw string
    const m = url.match(/([A-HJ-NP-Za-km-z1-9]{32,44})/);
    if (m) return m[1];
  }

  return null;
}
