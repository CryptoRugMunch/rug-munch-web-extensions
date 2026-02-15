/**
 * Content Script Card Injector
 *
 * Injects the json-render ScoreCard into host pages via Shadow DOM.
 * Used by all content scripts (DexScreener, Pump.fun, etc.)
 */

import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { registry, scanToCompactSpec, scanToSpec, BRAND_COLORS } from "./index";
import { Renderer, ActionProvider } from "@json-render/react";
import type { ScanResult } from "../services/api";

const C = BRAND_COLORS;
const injectedCards = new Map<string, { root: any; host: HTMLElement }>();

/**
 * Inject a floating ScoreCard next to a target element.
 * Uses Shadow DOM for complete style isolation.
 */
export function injectScoreCard(
  id: string,
  targetElement: Element,
  data: ScanResult,
  options?: { compact?: boolean; position?: "after" | "float-right" | "float-left" }
): void {
  // Don't double-inject
  if (injectedCards.has(id)) return;

  const pos = options?.position || "float-right";
  const compact = options?.compact ?? false;

  // Create host
  const host = document.createElement("div");
  host.id = `rms-card-${id}`;

  if (pos === "float-right") {
    host.style.cssText = `
      position: fixed; top: 80px; right: 12px; z-index: 999999;
      max-height: calc(100vh - 100px); overflow-y: auto;
      scrollbar-width: thin;
    `;
  } else if (pos === "float-left") {
    host.style.cssText = `
      position: fixed; top: 80px; left: 12px; z-index: 999999;
      max-height: calc(100vh - 100px); overflow-y: auto;
      scrollbar-width: thin;
    `;
  } else {
    host.style.cssText = "display: block; margin: 8px 0;";
  }

  // Shadow DOM
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; display: block; font-family: system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }

    @keyframes rms-fadein {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .rms-card-wrapper {
      animation: rms-fadein 0.3s ease-out;
    }
  `;
  shadow.appendChild(style);

  // Collapse/expand toggle for floating cards
  const wrapper = document.createElement("div");
  wrapper.className = "rms-card-wrapper";
  shadow.appendChild(wrapper);

  const mountPoint = document.createElement("div");
  wrapper.appendChild(mountPoint);

  // Insert into page
  if (pos === "after") {
    targetElement.parentElement?.insertBefore(host, targetElement.nextSibling);
  } else {
    document.body.appendChild(host);
  }

  // Build spec and render
  const spec = compact ? scanToCompactSpec(data) : scanToSpec(data, { showActions: true, showBreakdown: true });
  const root = createRoot(mountPoint);

  // Create action handlers
  const actionHandlers: Record<string, () => void> = {
    share_result: () => {
      const shareText = `${data.risk_score != null ? `Risk: ${data.risk_score}/100` : ""} $${data.token_symbol || "?"}\nPrice: ${data.price_usd ? `$${data.price_usd}` : "—"} | Liq: ${data.liquidity_usd ? `$${data.liquidity_usd.toLocaleString()}` : "—"}\nScanned by Rug Munch Intelligence 🗿 https://t.me/rug_munchy_bot`;
      navigator.clipboard.writeText(shareText);
    },
    copy_address: () => navigator.clipboard.writeText(data.token_address),
    open_explorer: () => {
      const chain = data.chain || "solana";
      const url = chain === "solana"
        ? `https://solscan.io/token/${data.token_address}`
        : `https://etherscan.io/token/${data.token_address}`;
      window.open(url, "_blank");
    },
    full_scan: () => {
      try { chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }); } catch {}
    },
    open_chat: () => {
      try { chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }); } catch {}
    },
  };

  root.render(
    createElement(ActionProvider, {
      handlers: actionHandlers,
      children: createElement(Renderer, {
        spec: spec as any,
        registry,
      }),
    })
  );

  injectedCards.set(id, { root, host });
}

/**
 * Remove a specific card.
 */
export function removeCard(id: string): void {
  const entry = injectedCards.get(id);
  if (entry) {
    entry.root.unmount();
    entry.host.remove();
    injectedCards.delete(id);
  }
}

/**
 * Remove all injected cards.
 */
export function removeAllCards(): void {
  for (const [id] of injectedCards) {
    removeCard(id);
  }
}
