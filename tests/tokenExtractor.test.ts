/**
 * Token Extractor Tests
 *
 * These are the regression tests that would have caught the DexScreener
 * pair-vs-token bug. Pure DOM/URL logic, no network calls.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { extractTokenFromDexScreener, extractChainFromUrl } from "../src/utils/tokenExtractor";

// ─── DexScreener DOM Extraction ────────────────────────────────

describe("extractTokenFromDexScreener", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("extracts CRM token from Solscan link, NOT pair address", () => {
    // Simulates DexScreener's actual DOM: Solscan links in the sidebar
    document.body.innerHTML = `
      <div class="pair-info">
        <a href="https://solscan.io/token/Eme5T2s2HB7B8W4YgLG1eReQpnadEVUnQBRjaKTdBAGS">CRM</a>
        <a href="https://solscan.io/token/So11111111111111111111111111111111111111112">SOL</a>
      </div>
    `;
    expect(extractTokenFromDexScreener()).toBe("Eme5T2s2HB7B8W4YgLG1eReQpnadEVUnQBRjaKTdBAGS");
  });

  it("skips Wrapped SOL and returns the real token", () => {
    document.body.innerHTML = `
      <a href="https://solscan.io/token/So11111111111111111111111111111111111111112">SOL</a>
      <a href="https://solscan.io/token/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263">BONK</a>
    `;
    expect(extractTokenFromDexScreener()).toBe("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
  });

  it("skips USDC and returns the real token", () => {
    document.body.innerHTML = `
      <a href="https://solscan.io/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</a>
      <a href="https://solscan.io/token/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU">SAMO</a>
    `;
    expect(extractTokenFromDexScreener()).toBe("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
  });

  it("handles Solana Explorer links too", () => {
    document.body.innerHTML = `
      <a href="https://explorer.solana.com/address/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN">JUP</a>
    `;
    expect(extractTokenFromDexScreener()).toBe("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
  });

  it("handles Solana.fm links", () => {
    document.body.innerHTML = `
      <a href="https://solana.fm/address/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</a>
      <a href="https://solana.fm/address/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So">mSOL</a>
    `;
    expect(extractTokenFromDexScreener()).toBe("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So");
  });

  it("returns null when no explorer links found", () => {
    document.body.innerHTML = `<div>No token info here</div>`;
    expect(extractTokenFromDexScreener()).toBeNull();
  });

  it("returns null when only base tokens present", () => {
    document.body.innerHTML = `
      <a href="https://solscan.io/token/So11111111111111111111111111111111111111112">SOL</a>
      <a href="https://solscan.io/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</a>
    `;
    expect(extractTokenFromDexScreener()).toBeNull();
  });

  it("handles Solscan account links (not just token)", () => {
    document.body.innerHTML = `
      <a href="https://solscan.io/account/Eme5T2s2HB7B8W4YgLG1eReQpnadEVUnQBRjaKTdBAGS">CRM</a>
    `;
    expect(extractTokenFromDexScreener()).toBe("Eme5T2s2HB7B8W4YgLG1eReQpnadEVUnQBRjaKTdBAGS");
  });
});


// ─── Chain Detection ───────────────────────────────────────────

describe("extractChainFromUrl", () => {
  it("detects Solana", () => {
    expect(extractChainFromUrl("https://dexscreener.com/solana/abc123")).toBe("solana");
  });

  it("detects Base", () => {
    expect(extractChainFromUrl("https://dexscreener.com/base/0xabc123")).toBe("base");
  });

  it("detects Ethereum", () => {
    expect(extractChainFromUrl("https://dexscreener.com/ethereum/0xdef")).toBe("ethereum");
  });

  it("detects BSC", () => {
    expect(extractChainFromUrl("https://dexscreener.com/bsc/0xbsc")).toBe("bsc");
  });

  it("defaults to solana for unknown chains", () => {
    expect(extractChainFromUrl("https://dexscreener.com/ton/something")).toBe("solana");
  });

  it("handles invalid URLs gracefully", () => {
    expect(extractChainFromUrl("not-a-url")).toBe("solana");
  });
});
