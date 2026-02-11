/**
 * Upgrade — Tier upgrade with SOL/USDC on-chain payment.
 *
 * Flow:
 * 1. Pick tier + currency → create payment intent
 * 2. Show amount + wallet → user sends from any wallet
 * 3. Auto-detect payment on-chain (no tx paste needed)
 * 4. Upgrade confirmed → update local tier
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { COLORS } from "../utils/designTokens";
import { getApiBase } from "../utils/config";

interface UpgradeProps {
  onBack: () => void;
  currentTier: string;
}

interface PricingData {
  payment_wallet: string;
  tiers: Record<string, {
    name: string;
    scans_per_hour: number;
    features: string[];
    prices: { sol: number; usdc: number };
  }>;
}

interface PaymentIntent {
  payment_id: string;
  amount: number;
  currency: string;
  payment_wallet: string;
  memo: string;
}

const POLL_INTERVAL = 4000; // 4s — don't hammer RPC
const POLL_TIMEOUT = 3600_000; // 1 hour

const Upgrade: React.FC<UpgradeProps> = ({ onBack, currentTier }) => {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>("holder");
  const [currency, setCurrency] = useState<"sol" | "usdc">("sol");
  const [step, setStep] = useState<"select" | "pay" | "success">("select");
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifiedTier, setVerifiedTier] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    fetchPricing();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fetchPricing = async () => {
    try {
      const base = await getApiBase();
      const resp = await fetch(`${base}/ext/payments/pricing`);
      if (resp.ok) setPricing(await resp.json());
    } catch {}
  };

  const copyAddress = useCallback((addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const createIntent = useCallback(async () => {
    setError(null);
    try {
      const base = await getApiBase();
      const token = (await chrome.storage.local.get("auth_token")).auth_token;
      if (!token) {
        setError("Sign in first to upgrade");
        return;
      }

      const resp = await fetch(`${base}/ext/payments/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ tier: selectedTier, currency, months: 1 }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setError(err.detail || "Failed to create payment");
        return;
      }

      const data: PaymentIntent = await resp.json();
      setIntent(data);
      setStep("pay");

      // Start polling for auto-detection
      startPolling(data.payment_id);
    } catch (e: any) {
      setError(e.message || "Connection failed");
    }
  }, [selectedTier, currency]);

  const startPolling = useCallback(async (paymentId: string) => {
    startRef.current = Date.now();
    setElapsed(0);

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    // Payment detection poll
    pollRef.current = setInterval(async () => {
      if (Date.now() - startRef.current > POLL_TIMEOUT) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setError("Payment window expired. Create a new payment if needed.");
        return;
      }

      try {
        const base = await getApiBase();
        const token = (await chrome.storage.local.get("auth_token")).auth_token;

        const resp = await fetch(`${base}/ext/payments/check/${paymentId}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });

        if (!resp.ok) return;
        const data = await resp.json();

        if (data.status === "verified") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          chrome.storage.local.set({ tier: data.tier });
          setVerifiedTier(data.tier);
          setTxSig(data.tx_signature || null);
          setStep("success");
        } else if (data.status === "expired" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          setError("Payment expired or failed. Please try again.");
        }
      } catch {}
    }, POLL_INTERVAL);
  }, []);

  const cancelPayment = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setStep("select");
    setIntent(null);
    setError(null);
    setElapsed(0);
  }, []);

  if (!pricing) {
    return (
      <Container onBack={onBack}>
        <div style={{ textAlign: "center", padding: 40, color: COLORS.textMuted }}>
          Loading pricing...
        </div>
      </Container>
    );
  }

  // ─── Success Screen ───────────────────────────────────────────
  if (step === "success") {
    return (
      <Container onBack={onBack}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h2 style={{ color: COLORS.gold, marginBottom: 8, fontSize: 18 }}>Upgrade Complete!</h2>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 4 }}>
            You're now a <strong style={{ color: COLORS.gold }}>
              {verifiedTier === "vip" ? "VIP" : "$CRM Holder"}
            </strong>.
          </p>
          {txSig && (
            <div style={{
              fontSize: 9, fontFamily: "monospace", color: COLORS.textMuted,
              marginTop: 8, wordBreak: "break-all", padding: "6px 8px",
              borderRadius: 4, backgroundColor: COLORS.bgCard,
            }}>
              tx: {txSig}
            </div>
          )}
          <button onClick={onBack} style={{
            marginTop: 16, padding: "10px 24px", borderRadius: 8,
            backgroundColor: COLORS.purple, color: "#fff",
            border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Done</button>
        </div>
      </Container>
    );
  }

  // ─── Payment Screen (auto-detect) ────────────────────────────
  if (step === "pay" && intent) {
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    return (
      <Container onBack={cancelPayment}>
        <h3 style={{ color: COLORS.gold, marginBottom: 12, fontSize: 14 }}>
          Send Payment
        </h3>

        {/* Amount */}
        <div style={{
          padding: 14, borderRadius: 10, backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`, marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Amount</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary }}>
            {intent.amount} {intent.currency.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
            {selectedTier === "vip" ? "VIP" : "Holder"} — 1 month
          </div>
        </div>

        {/* Wallet address */}
        <div style={{
          padding: 14, borderRadius: 10, backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`, marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>
            Send to this wallet:
          </div>
          <div
            onClick={() => copyAddress(intent.payment_wallet)}
            style={{
              fontSize: 10, fontFamily: "monospace", color: COLORS.cyan,
              wordBreak: "break-all", cursor: "pointer",
              padding: "8px 10px", borderRadius: 6,
              backgroundColor: `${COLORS.cyan}08`,
              border: `1px solid ${COLORS.cyan}20`,
              transition: "all 0.2s",
            }}>
            {intent.payment_wallet}
            <span style={{
              display: "block", fontSize: 9, marginTop: 4,
              color: copied ? COLORS.green : COLORS.textMuted,
            }}>
              {copied ? "✓ Copied!" : "📋 Tap to copy"}
            </span>
          </div>
        </div>

        {/* Waiting indicator */}
        <div style={{
          padding: 14, borderRadius: 10, textAlign: "center",
          backgroundColor: `${COLORS.purple}08`,
          border: `1px solid ${COLORS.purple}20`, marginBottom: 10,
        }}>
          <PulsingDot />
          <div style={{
            fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, marginTop: 8,
          }}>
            Watching for your payment...
          </div>
          <div style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 4 }}>
            Send the exact amount above. We'll detect it automatically.
          </div>
          <div style={{
            fontSize: 10, fontFamily: "monospace",
            color: COLORS.textMuted, marginTop: 6,
          }}>
            ⏱ {timeStr}
          </div>
        </div>

        {/* Cancel */}
        <button onClick={cancelPayment} style={{
          width: "100%", padding: "8px 0", borderRadius: 8,
          backgroundColor: "transparent", border: `1px solid ${COLORS.border}`,
          color: COLORS.textSecondary, fontSize: 11, cursor: "pointer",
        }}>Cancel</button>

        {error && (
          <div style={{ marginTop: 6, color: COLORS.red, fontSize: 11, textAlign: "center" }}>
            ❌ {error}
          </div>
        )}
      </Container>
    );
  }

  // ─── Tier Selection ───────────────────────────────────────────
  const holderPricing = pricing.tiers.holder;
  const vipPricing = pricing.tiers.vip;

  return (
    <Container onBack={onBack}>
      <h3 style={{ color: COLORS.gold, marginBottom: 4, fontSize: 14 }}>Upgrade Your Tier</h3>
      <p style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 12 }}>
        Pay with SOL or USDC — no credit card needed.
      </p>

      {/* Current tier */}
      <div style={{
        padding: 8, borderRadius: 6, marginBottom: 12,
        backgroundColor: `${COLORS.purple}10`, fontSize: 11, color: COLORS.textSecondary,
        textAlign: "center",
      }}>
        Current: <strong style={{ color: COLORS.purpleLight }}>{currentTier.toUpperCase()}</strong>
      </div>

      {/* Tier cards */}
      {holderPricing && (
        <TierCard
          name="Holder" emoji="💎"
          features={holderPricing.features}
          priceSol={holderPricing.prices.sol}
          priceUsdc={holderPricing.prices.usdc}
          selected={selectedTier === "holder"}
          onSelect={() => setSelectedTier("holder")}
          isCurrent={currentTier === "holder"}
        />
      )}
      {vipPricing && (
        <TierCard
          name="VIP" emoji="👑"
          features={vipPricing.features}
          priceSol={vipPricing.prices.sol}
          priceUsdc={vipPricing.prices.usdc}
          selected={selectedTier === "vip"}
          onSelect={() => setSelectedTier("vip")}
          isCurrent={currentTier === "vip"}
        />
      )}

      {/* Currency toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <CurrencyBtn label="◎ SOL" active={currency === "sol"} onClick={() => setCurrency("sol")} />
        <CurrencyBtn label="$ USDC" active={currency === "usdc"} onClick={() => setCurrency("usdc")} />
      </div>

      {/* Pay button */}
      <button onClick={createIntent}
        disabled={currentTier === selectedTier}
        style={{
          width: "100%", padding: "10px 0", borderRadius: 8,
          backgroundColor: currentTier === selectedTier ? COLORS.border : COLORS.purple,
          color: "#fff", border: "none", fontSize: 13, fontWeight: 600,
          cursor: currentTier === selectedTier ? "default" : "pointer",
        }}>
        {currentTier === selectedTier ? "Already on this tier" :
          `Pay ${currency === "sol" ?
            (selectedTier === "vip" ? vipPricing?.prices.sol : holderPricing?.prices.sol) + " SOL" :
            (selectedTier === "vip" ? vipPricing?.prices.usdc : holderPricing?.prices.usdc) + " USDC"
          } / month`}
      </button>

      {error && <div style={{ marginTop: 6, color: COLORS.red, fontSize: 11 }}>❌ {error}</div>}
    </Container>
  );
};

// ─── Sub-components ─────────────────────────────────────────────

const Container: React.FC<{ onBack: () => void; children: React.ReactNode }> = ({ onBack, children }) => (
  <div style={{
    width: 380, minHeight: 480, maxHeight: 600, overflowY: "auto",
    backgroundColor: COLORS.bg, color: COLORS.textPrimary,
    fontFamily: "system-ui", padding: 16,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: COLORS.textSecondary,
        cursor: "pointer", fontSize: 16, padding: 4,
      }}>←</button>
      <span style={{ fontWeight: 700, fontSize: 16 }}>🗿 Upgrade</span>
    </div>
    {children}
  </div>
);

const TierCard: React.FC<{
  name: string; emoji: string; features: string[];
  priceSol: number; priceUsdc: number;
  selected: boolean; onSelect: () => void; isCurrent: boolean;
}> = ({ name, emoji, features, priceSol, priceUsdc, selected, onSelect, isCurrent }) => (
  <div onClick={onSelect} style={{
    padding: 12, borderRadius: 10, marginBottom: 8,
    backgroundColor: COLORS.bgCard,
    border: `2px solid ${isCurrent ? COLORS.green : selected ? COLORS.purple : COLORS.border}`,
    cursor: "pointer", transition: "all 0.2s",
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{emoji} {name}</span>
      {isCurrent && <span style={{
        fontSize: 9, padding: "2px 6px", borderRadius: 4,
        backgroundColor: `${COLORS.green}20`, color: COLORS.green,
      }}>CURRENT</span>}
    </div>
    <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.6 }}>
      {features.map((f, i) => <div key={i}>✓ {f}</div>)}
    </div>
    <div style={{ marginTop: 6, fontSize: 11, color: COLORS.gold }}>
      {priceSol} SOL / {priceUsdc} USDC per month
    </div>
  </div>
);

const CurrencyBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 600,
    backgroundColor: active ? `${COLORS.cyan}20` : "transparent",
    border: `1px solid ${active ? COLORS.cyan : COLORS.border}`,
    color: active ? COLORS.cyan : COLORS.textMuted, cursor: "pointer",
  }}>{label}</button>
);

const PulsingDot: React.FC = () => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setFrame((f) => (f + 1) % 3), 600);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ display: "inline-flex", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: COLORS.purple,
          opacity: i === frame ? 1 : 0.25,
          transition: "opacity 0.3s ease",
        }} />
      ))}
    </div>
  );
};

export default Upgrade;
