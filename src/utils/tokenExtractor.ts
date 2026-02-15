/**
 * Token Address Extraction — Multi-strategy per platform.
 *
 * DexScreener URLs contain PAIR addresses, not token mints.
 * This module extracts the actual token contract address from
 * page DOM, explorer links, or structured data.
 */

// Known wrapped/base tokens to exclude when detecting "the" token
const BASE_TOKENS = new Set([
  "So11111111111111111111111111111111111111112",   // Wrapped SOL
  "11111111111111111111111111111111",                // System program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",  // Token program
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

// Solana base58 address pattern (32-44 chars, proper base58 charset)

/**
 * Extract real token mint from DexScreener page.
 * Strategy priority:
 * 1. Solscan/Explorer links in the page DOM
 * 2. __NEXT_DATA__ JSON blob
 * 3. data-address attributes
 * 4. Fallback: first non-base-token address from page text
 */
export function extractTokenFromDexScreener(): string | null {
  // Strategy 1: Explorer links (most reliable — always present in DexScreener)
  const explorerLinks = document.querySelectorAll(
    'a[href*="solscan.io/token/"], a[href*="solscan.io/account/"], ' +
    'a[href*="explorer.solana.com/address/"], a[href*="solana.fm/address/"]'
  );

  const candidates: string[] = [];
  for (const link of Array.from(explorerLinks)) {
    const href = (link as HTMLAnchorElement).href;
    const match = href.match(/(?:token|account|address)\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (match && !BASE_TOKENS.has(match[1])) {
      candidates.push(match[1]);
    }
  }

  // First non-base token from explorer links is usually the target token
  if (candidates.length > 0) {
    return candidates[0];
  }

  // Strategy 2: __NEXT_DATA__ (DexScreener uses Next.js)
  const nextData = document.getElementById("__NEXT_DATA__");
  if (nextData?.textContent) {
    try {
      const data = JSON.parse(nextData.textContent);
      // Navigate to pair data — DexScreener nests it in pageProps
      const pageProps = data?.props?.pageProps;
      if (pageProps) {
        // Various known paths
        const pair = pageProps.pair || pageProps.pairs?.[0];
        if (pair) {
          const baseToken = pair.baseToken?.address;
          const quoteToken = pair.quoteToken?.address;
          // Return the non-SOL token
          if (baseToken && !BASE_TOKENS.has(baseToken)) return baseToken;
          if (quoteToken && !BASE_TOKENS.has(quoteToken)) return quoteToken;
        }
      }
    } catch {
      // Parse error — try next strategy
    }
  }

  // Strategy 3: data attributes (some versions use these)
  const dataEls = document.querySelectorAll("[data-address], [data-token-address], [data-mint]");
  for (const el of Array.from(dataEls)) {
    const addr = el.getAttribute("data-address") ||
                 el.getAttribute("data-token-address") ||
                 el.getAttribute("data-mint");
    if (addr && addr.length >= 32 && addr.length <= 44 && !BASE_TOKENS.has(addr)) {
      return addr;
    }
  }

  // Strategy 4: Scan page text for clipboard-copy elements near "Token" labels
  const copyBtns = document.querySelectorAll('button[class*="copy"], [data-clipboard], [class*="address"]');
  for (const btn of Array.from(copyBtns)) {
    const text = btn.textContent?.trim() || "";
    const addrMatch = text.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (addrMatch && !BASE_TOKENS.has(addrMatch[1])) {
      return addrMatch[1];
    }
  }

  return null;
}

/**
 * Extract token from Pump.fun page.
 * Pump.fun URLs already contain the token mint: /coin/{mint} or /{mint}
 */
export function extractTokenFromPumpFun(): string | null {
  const match = window.location.pathname.match(/\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})/);
  return match ? match[1] : null;
}

/**
 * Generic extraction: try DOM strategies, then URL fallback.
 */
export function extractTokenFromPage(hostname: string): string | null {
  if (hostname.includes("dexscreener.com")) return extractTokenFromDexScreener();
  if (hostname.includes("pump.fun")) return extractTokenFromPumpFun();

  // For other sites, URL extraction is usually reliable
  return null; // Caller falls back to extractMintFromUrl
}

/**
 * Extract chain from DexScreener URL path.
 */
export function extractChainFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    if (path.startsWith("/solana/")) return "solana";
    if (path.startsWith("/base/")) return "base";
    if (path.startsWith("/ethereum/")) return "ethereum";
    if (path.startsWith("/bsc/")) return "bsc";
    if (path.startsWith("/polygon/")) return "polygon";
    if (path.startsWith("/avalanche/")) return "avalanche";
    if (path.startsWith("/arbitrum/")) return "arbitrum";
    if (path.startsWith("/optimism/")) return "optimism";
  } catch {}
  return "solana"; // Default
}
