/**
 * Upgrade — Tier upgrade page with SOL/USDC payment.
 */

import React, { useState, useEffect, useCallback } from "react";
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

const Upgrade: React.FC<UpgradeProps> = ({ onBack, currentTier }) => {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>("holder");
  const [currency, setCurrency] = useState<"sol" | "usdc">("sol");
  const [step, setStep] = useState<"select" | "pay" | "verify">("select");
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [txInput, setTxInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const base = await getApiBase();
      const resp = await fetch(`${base}/ext/payments/pricing`);
      if (resp.ok) setPricing(await resp.json());
    } catch {}
  };

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

      const data = await resp.json();
      setIntent(data);
      setStep("pay");
    } catch (e: any) {
      setError(e.message || "Connection failed");
    }
  }, [selectedTier, currency]);

  const verifyPayment = useCallback(async () => {
    if (!txInput || !intent) return;
    setVerifying(true);
    setError(null);

    try {
      const base = await getApiBase();
      const token = (await chrome.storage.local.get("auth_token")).auth_token;

      const resp = await fetch(`${base}/ext/payments/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          tx_signature: txInput.trim(),
          payment_id: intent.payment_id,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setError(err.detail || "Verification failed");
        setVerifying(false);
        return;
      }

      const data = await resp.json();
      // Update local tier
      chrome.storage.local.set({ tier: data.tier });
      setSuccess(true);
      setStep("verify");
    } catch (e: any) {
      setError(e.message || "Verification failed");
    }
    setVerifying(false);
  }, [txInput, intent]);

  if (!pricing) {
    return (
      <Container onBack={onBack}>
        <div style={{ textAlign: "center", padding: 40, color: COLORS.textMuted }}>
          Loading pricing...
        </div>
      </Container>
    );
  }

  // Success screen
  if (success) {
    return (
      <Container onBack={onBack}>
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h2 style={{ color: COLORS.gold, marginBottom: 8 }}>Upgrade Complete!</h2>
          <p style={{ color: COLORS.textSecondary, fontSize: 13 }}>
            You're now a {selectedTier === "vip" ? "VIP" : "$CRM Holder"}.
            Reload the extension to activate your new tier.
          </p>
          <button onClick={onBack} style={{
            marginTop: 16, padding: "10px 24px", borderRadius: 8,
            backgroundColor: COLORS.purple, color: "#fff",
            border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Done</button>
        </div>
      </Container>
    );
  }

  // Payment step
  if (step === "pay" && intent) {
    return (
      <Container onBack={() => setStep("select")}>
        <h3 style={{ color: COLORS.gold, marginBottom: 12, fontSize: 14 }}>
          Send Payment
        </h3>

        <div style={{
          padding: 14, borderRadius: 10, backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`, marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Amount</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary }}>
            {intent.amount} {intent.currency.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
            {selectedTier === "vip" ? "VIP" : "Holder"} — 1 month
          </div>
        </div>

        <div style={{
          padding: 14, borderRadius: 10, backgroundColor: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`, marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>
            Send to this wallet:
          </div>
          <div style={{
            fontSize: 10, fontFamily: "monospace", color: COLORS.cyan,
            wordBreak: "break-all", cursor: "pointer",
            padding: "6px 8px", borderRadius: 4,
            backgroundColor: `${COLORS.cyan}10`,
          }} onClick={() => navigator.clipboard.writeText(intent.payment_wallet)}>
            {intent.payment_wallet}
            <span style={{ fontSize: 9, color: COLORS.textMuted, marginLeft: 4 }}>📋 tap to copy</span>
          </div>
        </div>

        <div style={{
          padding: 10, borderRadius: 8, backgroundColor: `${COLORS.gold}10`,
          border: `1px solid ${COLORS.gold}20`, marginBottom: 12,
          fontSize: 11, color: COLORS.gold,
        }}>
          💡 After sending, paste your transaction signature below to verify.
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>
            Transaction Signature:
          </div>
          <input type="text" placeholder="Paste tx signature..."
            value={txInput}
            onChange={(e) => { setTxInput(e.target.value); setError(null); }}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`,
              color: COLORS.textPrimary, fontSize: 10, fontFamily: "monospace",
              outline: "none", boxSizing: "border-box",
            }} />
        </div>

        <button onClick={verifyPayment}
          disabled={!txInput.trim() || verifying}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 8,
            backgroundColor: txInput.trim() ? COLORS.green : COLORS.border,
            color: "#fff", border: "none", fontSize: 13, fontWeight: 600,
            cursor: txInput.trim() ? "pointer" : "default",
          }}>
          {verifying ? "Verifying on-chain..." : "Verify Payment ✓"}
        </button>

        {error && <div style={{ marginTop: 6, color: COLORS.red, fontSize: 11 }}>❌ {error}</div>}
      </Container>
    );
  }

  // Tier selection step
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
      <TierCard
        name="Holder"
        emoji="💎"
        features={holderPricing.features}
        priceSol={holderPricing.prices.sol}
        priceUsdc={holderPricing.prices.usdc}
        selected={selectedTier === "holder"}
        onSelect={() => setSelectedTier("holder")}
        isCurrent={currentTier === "holder"}
      />
      <TierCard
        name="VIP"
        emoji="👑"
        features={vipPricing.features}
        priceSol={vipPricing.prices.sol}
        priceUsdc={vipPricing.prices.usdc}
        selected={selectedTier === "vip"}
        onSelect={() => setSelectedTier("vip")}
        isCurrent={currentTier === "vip"}
      />

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
            (selectedTier === "vip" ? vipPricing.prices.sol : holderPricing.prices.sol) + " SOL" :
            (selectedTier === "vip" ? vipPricing.prices.usdc : holderPricing.prices.usdc) + " USDC"
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

export default Upgrade;
