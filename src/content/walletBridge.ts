/**
 * Wallet Bridge — Content script that relays Phantom wallet operations
 * from the extension popup/background to the page's injected provider.
 *
 * Phantom injects window.phantom.solana into web pages, but extension
 * popups/backgrounds can't access it. This content script acts as a relay.
 *
 * Flow:
 * 1. Background sends message: { action: "wallet-connect" | "wallet-sign", ... }
 * 2. Content script accesses window.phantom.solana on the page
 * 3. Returns result via sendResponse
 *
 * Since content scripts also can't directly access window.phantom (isolated world),
 * we inject a page-level script that communicates back via window.postMessage.
 */

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "wallet-detect") {
    injectAndRelay("detect", {}, sendResponse);
    return true; // async response
  }

  if (msg.action === "wallet-connect") {
    injectAndRelay("connect", {}, sendResponse);
    return true;
  }

  if (msg.action === "wallet-sign") {
    injectAndRelay("sign", { message: msg.message, nonce: msg.nonce }, sendResponse);
    return true;
  }

  if (msg.action === "wallet-disconnect") {
    injectAndRelay("disconnect", {}, sendResponse);
    return true;
  }
});

/**
 * Inject a script into the page's main world to access window.phantom.solana.
 * Uses window.postMessage to relay results back to this content script.
 *
 * Chrome: inline script element injection
 * Firefox: wrappedJSObject for direct page context access (more reliable with CSP)
 */
function injectAndRelay(
  action: string,
  params: Record<string, any>,
  sendResponse: (resp: any) => void
) {
  const requestId = `rmi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Listen for the response from the injected page script
  const handler = (event: MessageEvent) => {
    if (
      event.source !== window ||
      event.data?.type !== "RMI_WALLET_RESPONSE" ||
      event.data?.requestId !== requestId
    ) return;

    window.removeEventListener("message", handler);
    clearTimeout(timeout);
    sendResponse(event.data.result);
  };

  window.addEventListener("message", handler);

  // Timeout after 60s (wallet popups can take time)
  const timeout = setTimeout(() => {
    window.removeEventListener("message", handler);
    sendResponse({ success: false, error: "Wallet operation timed out" });
  }, 60000);

  // Firefox: use wrappedJSObject for direct page context access (bypasses CSP)
  // Chrome: use inline script injection
  const isFirefox = typeof (window as any).wrappedJSObject !== "undefined";

  if (isFirefox) {
    // Firefox content scripts can access page globals via wrappedJSObject
    try {
      const pageWin = (window as any).wrappedJSObject;

      // Execute the page script logic directly via page context
      const scriptBody = `(${pageScript.toString()})("${requestId}", "${action}", ${JSON.stringify(params)});`;
      pageWin.eval(scriptBody);
    } catch (e) {
      // Fallback to script injection if wrappedJSObject fails
      injectViaScript(requestId, action, params);
    }
  } else {
    injectViaScript(requestId, action, params);
  }
}

function injectViaScript(requestId: string, action: string, params: Record<string, any>) {
  const script = document.createElement("script");
  script.textContent = `(${pageScript.toString()})("${requestId}", "${action}", ${JSON.stringify(params)});`;
  document.documentElement.appendChild(script);
  script.remove();
}

/**
 * This function runs in the PAGE context (main world), with access to
 * window.phantom.solana. Results are sent back via postMessage.
 */
function pageScript(requestId: string, action: string, params: any) {
  const respond = (result: any) => {
    window.postMessage({ type: "RMI_WALLET_RESPONSE", requestId, result }, "*");
  };

  const phantom = (window as any).phantom?.solana;

  if (action === "detect") {
    respond({
      success: true,
      phantom: !!phantom,
      isConnected: phantom?.isConnected || false,
      publicKey: phantom?.publicKey?.toBase58?.() || null,
    });
    return;
  }

  if (!phantom) {
    respond({ success: false, error: "Phantom wallet not found. Install Phantom to sign in." });
    return;
  }

  if (action === "connect") {
    phantom.connect()
      .then((resp: any) => {
        respond({
          success: true,
          publicKey: resp.publicKey.toBase58(),
          isConnected: true,
        });
      })
      .catch((err: any) => {
        respond({ success: false, error: err.message || "Connection rejected" });
      });
    return;
  }

  if (action === "sign") {
    // Must be connected first
    const doSign = () => {
      const messageBytes = new TextEncoder().encode(params.message);
      phantom.signMessage(messageBytes, "utf8")
        .then((result: any) => {
          // Convert signature Uint8Array to base58
          const sig = base58encode(result.signature);
          respond({
            success: true,
            signature: sig,
            publicKey: phantom.publicKey.toBase58(),
          });
        })
        .catch((err: any) => {
          respond({ success: false, error: err.message || "Signing rejected" });
        });
    };

    if (!phantom.isConnected) {
      phantom.connect().then(doSign).catch((err: any) => {
        respond({ success: false, error: err.message || "Connection rejected" });
      });
    } else {
      doSign();
    }
    return;
  }

  if (action === "disconnect") {
    phantom.disconnect()
      .then(() => respond({ success: true }))
      .catch((err: any) => respond({ success: false, error: err.message }));
    return;
  }

  respond({ success: false, error: `Unknown action: ${action}` });

  // Minimal base58 encoder (no dependencies in page context)
  function base58encode(bytes: Uint8Array): string {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const BASE = 58;
    if (bytes.length === 0) return "";

    // Count leading zeros
    let zeros = 0;
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) zeros++;

    // Convert to base58
    const size = Math.ceil(bytes.length * 138 / 100) + 1;
    const b58 = new Uint8Array(size);
    for (let i = zeros; i < bytes.length; i++) {
      let carry = bytes[i];
      for (let j = size - 1; j >= 0; j--) {
        carry += 256 * b58[j];
        b58[j] = carry % BASE;
        carry = Math.floor(carry / BASE);
      }
    }

    // Skip leading zeros in base58 result
    let start = 0;
    while (start < size && b58[start] === 0) start++;

    let result = "1".repeat(zeros);
    for (let i = start; i < size; i++) result += ALPHABET[b58[i]];
    return result;
  }
}
