/**
 * API Service Tests
 *
 * Tests scan flow, error handling, and caching behavior.
 * Mocks at the fetch level with proper IndexedDB and content script detection mocks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Ensure test flag is set BEFORE any module loading
(globalThis as any).__RMS_TEST_DIRECT_FETCH = true;

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock config module
vi.mock("../src/utils/config", () => ({
  getApiBase: vi.fn().mockResolvedValue("https://test-api.example.com/api"),
  getSettings: vi.fn().mockResolvedValue({
    autoScan: true, showBadges: true, swapWarnings: true,
    compactBadges: false, apiBase: "https://test-api.example.com/api",
  }),
}));

describe("scanToken", () => {
  let scanToken: typeof import("../src/services/api").scanToken;

  beforeEach(async () => {
    mockFetch.mockReset();
    // Re-import to reset internal state
    vi.resetModules();
    (globalThis as any).__RMS_TEST_DIRECT_FETCH = true;
    const mod = await import("../src/services/api");
    scanToken = mod.scanToken;
  });

  it("returns scan data on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token_address: "Eme5T2s2HB7B8W4YgLG1eReQpnadEVUnQBRjaKTdBAGS",
        chain: "solana",
        token_name: "Crypto Rug Muncher",
        token_symbol: "CRM",
        risk_score: 37,
        price_usd: 0.0002,
        liquidity_usd: 16000,
        market_cap: 206000,
        holder_count: 1012,
        top_10_holder_percent: 45.2,
        created_at: "2025-08-15T00:00:00Z",
      }),
    });

    const result = await scanToken("Eme5T2s2HB7B8W4YgLG1eReQpnadEVUnQBRjaKTdBAGS");

    expect(result.success).toBe(true);
    expect(result.data?.risk_score).toBe(37);
    expect(result.data?.token_symbol).toBe("CRM");
  });

  it("passes server rate limit error through", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        detail: "Rate limit exceeded (3/day for free tier). Upgrade for more scans.",
      }),
    });

    const result = await scanToken("SomeToken123456789012345678901234");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rate limit exceeded");
  });

  it("handles network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network request failed"));

    const result = await scanToken("SomeToken123456789012345678901234");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network");
  });

  it("sends auth token when available", async () => {
    (globalThis as any).chrome.storage.local.set({ auth_token: "test-token-123" });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_address: "test", risk_score: 50 }),
    });

    await scanToken("SomeToken123456789012345678901234");

    expect(mockFetch).toHaveBeenCalled();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/ext/scan");
    expect(opts.headers.Authorization).toBe("Bearer test-token-123");
  });

  it("does NOT pre-check rate limit client-side", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token_address: "x", risk_score: 10 }),
    });

    for (let i = 0; i < 5; i++) {
      const result = await scanToken(`Token${i}xxxxxxxxxxxxxxxxxxxxxxxxxxx`);
      expect(result.success).toBe(true);
    }

    // All 5 should have hit the server (no client-side blocking)
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
