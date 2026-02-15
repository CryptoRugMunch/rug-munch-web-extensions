/**
 * URL Extraction Tests
 *
 * Tests the extractMintFromUrl utility used by popup and content scripts.
 * Covers all supported platforms.
 */

import { describe, it, expect } from "vitest";
import { extractMintFromUrl } from "../src/utils/shadowInject";

const REAL_CRM_TOKEN = "Eme5T2s2HB7B8W4YgLG1eReQpnadEVUnQBRjaKTdBAGS";
const CRM_PAIR = "6pnitzwjumnzsvfyfejf9mijzpc4iuqh1xugfwvdf8wb";

// ─── DexScreener (CRITICAL — was the broken case) ─────────────

describe("DexScreener URL extraction", () => {
  it("returns null for DexScreener URLs (pair address, NOT token)", () => {
    // This is THE regression test. DexScreener URLs contain pair addresses.
    // extractMintFromUrl must return null to force DOM-based extraction.
    expect(extractMintFromUrl(`https://dexscreener.com/solana/${CRM_PAIR}`)).toBeNull();
  });

  it("returns null for all DexScreener chain paths", () => {
    expect(extractMintFromUrl("https://dexscreener.com/base/0xabc123def456")).toBeNull();
    expect(extractMintFromUrl("https://dexscreener.com/ethereum/0xdef789")).toBeNull();
  });
});


// ─── Pump.fun ──────────────────────────────────────────────────

describe("Pump.fun URL extraction", () => {
  it("extracts from /coin/MINT", () => {
    expect(extractMintFromUrl(`https://pump.fun/coin/${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });

  it("extracts from /MINT (short form)", () => {
    expect(extractMintFromUrl(`https://pump.fun/${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });
});


// ─── Jupiter ───────────────────────────────────────────────────

describe("Jupiter URL extraction", () => {
  it("extracts output token from /swap/SOL-MINT", () => {
    expect(extractMintFromUrl(`https://jup.ag/swap/SOL-${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });
});


// ─── GMGN ──────────────────────────────────────────────────────

describe("GMGN URL extraction", () => {
  it("extracts from /sol/token/MINT", () => {
    expect(extractMintFromUrl(`https://gmgn.ai/sol/token/${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });
});


// ─── BullX ─────────────────────────────────────────────────────

describe("BullX URL extraction", () => {
  it("extracts from ?address=MINT", () => {
    expect(extractMintFromUrl(`https://bullx.io/token?address=${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });
});


// ─── Birdeye ───────────────────────────────────────────────────

describe("Birdeye URL extraction", () => {
  it("extracts from /token/MINT", () => {
    expect(extractMintFromUrl(`https://birdeye.so/token/${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });
});


// ─── Raydium ───────────────────────────────────────────────────

describe("Raydium URL extraction", () => {
  it("extracts from ?outputCurrency=MINT", () => {
    expect(extractMintFromUrl(`https://raydium.io/swap?outputCurrency=${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });

  it("extracts from ?inputCurrency=MINT", () => {
    expect(extractMintFromUrl(`https://raydium.io/swap?inputCurrency=${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });
});


// ─── Photon ────────────────────────────────────────────────────

describe("Photon URL extraction", () => {
  it("extracts from /lp/MINT", () => {
    expect(extractMintFromUrl(`https://photon-sol.tinyastro.io/en/lp/${REAL_CRM_TOKEN}`)).toBe(REAL_CRM_TOKEN);
  });
});


// ─── Edge Cases ────────────────────────────────────────────────

describe("Edge cases", () => {
  it("returns null for URLs with no token", () => {
    expect(extractMintFromUrl("https://dexscreener.com/")).toBeNull();
    expect(extractMintFromUrl("https://pump.fun/")).toBeNull();
    expect(extractMintFromUrl("https://google.com")).toBeNull();
  });

  it("returns null for empty/invalid input", () => {
    expect(extractMintFromUrl("")).toBeNull();
    expect(extractMintFromUrl("not-a-url")).toBeNull();
  });

  it("handles addresses of varying valid lengths (32-44 chars)", () => {
    // 32-char (shortest valid)
    const short = "11111111111111111111111111111111"; // 32 chars but this is system program
    // Generic fallback would still match this for non-DexScreener sites
    const result = extractMintFromUrl(`https://pump.fun/${short}`);
    // pump.fun regex requires [A-Za-z0-9]{32,50}, so this should match
    expect(result).toBe(short);
  });
});
