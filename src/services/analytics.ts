/**
 * Extension Analytics — lightweight event tracking.
 *
 * Fire-and-forget: never blocks UX, fails silently.
 * Events: scan, badge_click, swap_warning, side_panel_open, page_detect
 */

import { getApiBase } from "../utils/config";

let _apiBase: string | null = null;

async function getBase(): Promise<string> {
  if (!_apiBase) _apiBase = await getApiBase();
  return _apiBase;
}

export async function trackEvent(
  event: string,
  context: string = "",
  tokenAddress?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const base = await getBase();
    const token = (await chrome.storage.local.get("auth_token")).auth_token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // Fire and forget — don't await in caller
    fetch(`${base}/ext/analytics`, {
      method: "POST",
      headers,
      body: JSON.stringify({ event, context, token_address: tokenAddress, metadata }),
    }).catch(() => {}); // Swallow errors
  } catch {
    // Never throw from analytics
  }
}

// Convenience wrappers
export const trackScan = (mint: string, context: string) =>
  trackEvent("scan", context, mint);

export const trackBadgeClick = (mint: string, context: string) =>
  trackEvent("badge_click", context, mint);

export const trackSwapWarning = (mint: string) =>
  trackEvent("swap_warning", "jupiter", mint);

export const trackSidePanelOpen = () =>
  trackEvent("side_panel_open");

export const trackPageDetect = (context: string, mint: string) =>
  trackEvent("page_detect", context, mint);
