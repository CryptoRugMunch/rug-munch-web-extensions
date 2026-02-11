/**
 * Shared auto-link hook — used by both Popup and Settings.
 *
 * Flow: initLink() → open bot deep link → poll status → verified
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { initLink, checkLinkStatus } from "../services/api";
import { getAccount, updateAccount } from "../utils/config";

export type LinkPhase = "idle" | "waiting" | "success" | "error";

const POLL_INTERVAL = 2500;
const POLL_TIMEOUT = 600_000; // 10 min

export function useAutoLink() {
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const start = useCallback(async () => {
    setPhase("waiting");
    setError(null);

    const extensionId = typeof chrome !== "undefined" ? chrome.runtime?.id || "" : "";
    const init = await initLink(extensionId);
    if (!init) {
      setPhase("error");
      setError("Couldn't connect to API");
      return;
    }

    // Open bot deep link
    chrome.tabs.create({ url: init.bot_url });

    // Poll
    startRef.current = Date.now();
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      if (Date.now() - startRef.current > POLL_TIMEOUT) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setPhase("error");
        setError("Link expired. Try again.");
        return;
      }

      const status = await checkLinkStatus(init.link_token);

      if (status.status === "verified") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;

        const acct = await getAccount();
        await updateAccount({
          tier: status.tier as any || "free_linked",
          telegramId: status.telegram_id || null,
          telegramUsername: status.telegram_username || null,
          linkedAt: new Date().toISOString(),
          authToken: status.auth_token || acct?.authToken || null,
        });
        chrome.storage.local.set({
          tier: status.tier || "free_linked",
          linked_telegram: status.telegram_id,
          auth_token: status.auth_token || "",
        });
        setPhase("success");
        setTimeout(() => setPhase("idle"), 4000);
      } else if (status.status === "expired") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setPhase("error");
        setError("Link expired. Try again.");
      }
    }, POLL_INTERVAL);
  }, []);

  const cancel = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setPhase("idle");
    setError(null);
  }, []);

  return { phase, error, start, cancel };
}
